"""
main.py
=======
OrbitalGuard AI — FastAPI Backend

Real-data endpoints:
  GET  /api/satellites           — satellite metadata from live TLEs
  GET  /api/debris               — debris catalog
  GET  /api/state?t=<unix>       — real SGP4 positions at given UTC epoch
  GET  /api/predictions?t=<unix> — real conjunction analysis + ML risk
  GET  /api/analytics            — live catalog statistics
  GET  /api/trajectory/{name}?t= — LSTM 6-hour future path
  POST /api/maneuver/execute     — orbital maneuver (raises orbit)
  GET  /api/health               — system health check
"""

import os
import time
import math
import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List, Any, Optional

logging.basicConfig(
    level   = logging.INFO,
    format  = "%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt = "%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Lazy module imports (avoid heavy startup cost at import time) ──────────────
from app.data_store       import store
from app.collision_engine import compute_conjunctions
from app.risk_model       import batch_predict, get_model
from app.propagator       import classify_orbit

# ── Startup / Shutdown ─────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize data store and start background refresh on startup."""
    logger.info("═══ OrbitalGuard AI starting up ═══")

    # Initialize data store (downloads TLEs, builds catalog)
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, store.initialize_sync)

    # Pre-load the ML risk model (trains if not saved)
    try:
        await loop.run_in_executor(None, get_model)
        logger.info("Risk model ready")
    except Exception as e:
        logger.warning(f"Risk model init failed: {e}")

    # Background TLE refresh task
    refresh_task = asyncio.create_task(store.refresh_loop())

    logger.info("═══ OrbitalGuard AI ready ═══")
    yield

    refresh_task.cancel()
    logger.info("OrbitalGuard AI shutdown complete")


# ── App Initialization ─────────────────────────────────────────────────────────

app = FastAPI(
    title       = "OrbitalGuard AI — Space Traffic Management API",
    description = "Real-time orbital tracking with SGP4, collision detection, and AI risk prediction.",
    version     = "2.0.0",
    lifespan    = lifespan,
)

# CORS
allowed_origins_env = os.getenv("ALLOWED_ORIGINS")
if allowed_origins_env:
    origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
else:
    origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins     = origins,
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)


# ── Helper ────────────────────────────────────────────────────────────────────

def _resolve_epoch(t: float) -> float:
    """
    Accepts either:
      - A small offset in seconds from now (legacy behavior, t < 1e9)
      - A Unix epoch timestamp in seconds (new behavior, t >= 1e9)
    """
    if t < 1_000_000_000:
        # Legacy: offset from current time
        return time.time() + t
    return t  # Already a Unix epoch


# ── Health Check ──────────────────────────────────────────────────────────────

@app.get("/")
def read_root():
    return {
        "message":    "OrbitalGuard AI API v2.0 — Real-Data Edition",
        "satellites": len(store.get_satellites()),
        "debris":     len(store.get_debris()),
        "ready":      store.is_ready,
    }


@app.get("/api/health")
def health_check() -> Dict[str, Any]:
    sats   = store.get_satellites()
    debris = store.get_debris()
    return {
        "status":           "OPERATIONAL" if store.is_ready else "INITIALIZING",
        "satellite_count":  len(sats),
        "debris_count":     len(debris),
        "last_tle_refresh": store.get_analytics().get("last_tle_refresh", 0),
        "timestamp_utc":    time.time(),
    }


# ── Satellites ─────────────────────────────────────────────────────────────────

@app.get("/api/satellites")
def get_satellites(limit: int = Query(500, ge=1, le=5000)) -> List[Dict[str, Any]]:
    """
    Returns metadata for all tracked satellites (from real TLEs).
    """
    sats = store.get_satellites(limit=limit)
    result = []
    for rec in sats:
        pos = rec.position or {}
        result.append({
            "name":        rec.name,
            "operator":    rec.operator,
            "type":        rec.sat_type,
            "orbit_type":  rec.orbit_type,
            "launch_date": rec.launch_date,
            "status":      rec.status,
            "fuel_status": rec.fuel_status,
            "norad_id":    rec.norad_id,
            "a":           6371.0 + pos.get("altitude", 400),
            "e":           rec.satrec.ecco,
            "i_deg":       math.degrees(rec.satrec.inclo),
            "altitude":    pos.get("altitude", 0),
            "velocity":    pos.get("velocity", 0),
            "lat":         pos.get("lat", 0),
            "lon":         pos.get("lon", 0),
        })
    return result


# ── Debris ────────────────────────────────────────────────────────────────────

@app.get("/api/debris")
def get_debris(limit: int = Query(500, ge=1, le=5000)) -> List[Dict[str, Any]]:
    """
    Returns tracked debris objects with risk classification.
    """
    debris = store.get_debris(limit=limit)
    return [
        {
            "name":       d.name,
            "orbit_type": d.orbit_type,
            "status":     d.risk,
            "size_cm":    d.size_cm,
            "norad_id":   d.norad_id,
        }
        for d in debris
    ]


# ── State (real-time positions) ────────────────────────────────────────────────

@app.get("/api/state")
def get_state(
    t: float = Query(0.0, description="UTC Unix epoch (or offset from now if < 1e9)"),
    sat_limit: int = Query(200,  ge=1, le=2000),
    deb_limit: int = Query(500,  ge=1, le=5000),
) -> Dict[str, Any]:
    """
    Propagates and returns real SGP4 positions of all satellites and
    a sample of debris at the given UTC epoch.
    """
    epoch = _resolve_epoch(t)
    state = store.get_state(epoch, sat_limit=sat_limit, deb_limit=deb_limit)
    return state


# ── Conjunction Predictions ────────────────────────────────────────────────────

@app.get("/api/predictions")
def get_predictions(
    t: float = Query(0.0, description="UTC Unix epoch or offset"),
    max_results: int = Query(10, ge=1, le=50),
) -> List[Dict[str, Any]]:
    """
    Real conjunction analysis using SGP4 positions + ML risk prediction.
    """
    epoch = _resolve_epoch(t)
    state = store.get_state(epoch, sat_limit=100, deb_limit=300)

    conjunctions = compute_conjunctions(
        satellites  = state["satellites"],
        debris      = state["debris"],
        epoch_unix  = epoch,
        max_results = max_results,
    )

    # Annotate with ML risk prediction
    annotated = batch_predict(conjunctions)
    return annotated


# ── Analytics ─────────────────────────────────────────────────────────────────

@app.get("/api/analytics")
def get_analytics() -> Dict[str, Any]:
    """
    Live statistics from the real satellite and debris catalogs.
    """
    return store.get_analytics()


# ── LSTM Trajectory Prediction ────────────────────────────────────────────────

@app.get("/api/trajectory/{satellite_name}")
def get_trajectory(
    satellite_name: str,
    t: float = Query(0.0, description="UTC Unix epoch or offset"),
) -> Dict[str, Any]:
    """
    Returns LSTM-predicted 6-hour future trajectory for a satellite.
    """
    epoch = _resolve_epoch(t)
    rec   = store.get_satellite_by_name(satellite_name)

    if rec is None:
        raise HTTPException(status_code=404, detail=f"Satellite '{satellite_name}' not found")

    try:
        from app.trajectory_predictor import predict_trajectory
        future_path = predict_trajectory(rec.satrec, epoch)
    except Exception as e:
        logger.warning(f"Trajectory prediction failed for {satellite_name}: {e}")
        # Fallback: use simple propagator for next 6 hours
        from app.propagator import propagate
        from app.eop_loader import get_eop
        eop   = get_eop(epoch)
        future_path = []
        for k in range(24):
            t_future = epoch + (k + 1) * 900
            pos = propagate(rec.satrec, t_future, eop_cache=eop)
            if pos:
                future_path.append({
                    "x": pos["x"], "y": pos["y"], "z": pos["z"],
                    "t_offset_sec": (k + 1) * 900,
                })

    return {
        "satellite":   satellite_name,
        "epoch_unix":  epoch,
        "step_sec":    900,
        "n_points":    len(future_path),
        "trajectory":  future_path,
    }


# ── Maneuver Execution ────────────────────────────────────────────────────────

@app.post("/api/maneuver/execute")
def execute_maneuver(satellite_name: str) -> Dict[str, Any]:
    """
    Simulates an orbit-raising maneuver for collision avoidance.
    Adjusts the satellite's fuel and status in the in-memory store.
    """
    rec = store.get_satellite_by_name(satellite_name)
    if rec is None:
        return {"success": False, "message": f"Satellite '{satellite_name}' not found"}

    if rec.fuel_status < 0.21:
        return {"success": False, "message": "Insufficient fuel for maneuver"}

    # Deduct fuel and mark operational
    delta_v_km  = 2.4
    fuel_cost   = 0.21
    rec.fuel_status = max(0.0, rec.fuel_status - fuel_cost)
    rec.status      = "OPERATIONAL"

    # Adjust the SGP4 mean motion slightly to reflect altitude raise
    # (approximate: Δa ≈ 2.4 km → Δn ≈ -3/2 * n * Δa/a)
    try:
        a_km   = 6371.0 + (rec.position.get("altitude", 400) if rec.position else 400)
        n_orig = rec.satrec.no_kozai
        delta_n = -1.5 * n_orig * (delta_v_km / a_km)
        rec.satrec.no_kozai = max(0.001, n_orig + delta_n)
        new_alt = a_km + delta_v_km - 6371.0
    except Exception:
        new_alt = rec.position.get("altitude", 400) + delta_v_km if rec.position else 400

    logger.info(f"Maneuver executed: {satellite_name} raised +{delta_v_km} km, fuel: {rec.fuel_status:.2f}")

    return {
        "success":         True,
        "message":         f"Maneuver executed: Raised orbit of {satellite_name} by {delta_v_km} km. Fuel consumed: {fuel_cost} kg.",
        "new_altitude":    new_alt,
        "remaining_fuel":  rec.fuel_status,
        "delta_v_km":      delta_v_km,
    }


# ── Deploy Satellite (from Orbit Designer) ─────────────────────────────────────

@app.post("/api/satellite/deploy")
def deploy_satellite(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Deploys a user-designed satellite into the active catalog.
    Accepts Keplerian elements and creates a synthetic TLE-like record.
    """
    from app.data_store import SatelliteRecord
    from app.simulation import KeplerianElement
    import math

    try:
        name       = payload.get("name", "USER-SAT-01").upper()
        operator   = payload.get("operator", "USER")
        orbit_type = payload.get("orbit_type", "LEO")
        a_km       = float(payload.get("a", 7000))
        e          = float(payload.get("e", 0.0001))
        i_deg      = float(payload.get("i_deg", 51.6))

        # Create a Keplerian propagator for this satellite
        kep = KeplerianElement(
            name, operator, orbit_type,
            a_km, e, i_deg,
            0.0, 0.0, 0.0, "Now",
            status="OPERATIONAL"
        )

        # Build a shim satrec
        class ShimSatrec:
            def __init__(self, kep_el):
                self._kep = kep_el
                self.ecco  = kep_el.e
                self.inclo = kep_el.i
                self.no_kozai = kep_el.mean_motion * 60  # rad/min
                self.satnum = 99999
                self.epochyr = 24
                self.epochdays = 1.0

        satrec = ShimSatrec(kep)

        epoch = time.time()
        pos_raw = kep.propagate(0)
        alt = math.sqrt(pos_raw["x"]**2 + pos_raw["y"]**2 + pos_raw["z"]**2) - 6371
        pos = {**pos_raw, "altitude": alt, "lat": 0.0, "lon": 0.0,
               "inclination": i_deg, "velocity": math.sqrt(398600.4418 / a_km)}

        from app.data_store import SatelliteRecord
        rec = SatelliteRecord(
            name        = name,
            operator    = operator,
            sat_type    = "Custom",
            orbit_type  = orbit_type,
            satrec      = satrec,
            launch_date = "Now",
            status      = "OPERATIONAL",
            fuel_status = 100.0,
        )
        rec.position = pos
        rec._kep     = kep

        store._satellites.insert(0, rec)
        store._sat_index[name] = rec

        logger.info(f"Deployed custom satellite: {name}")
        return {
            "success":     True,
            "name":        name,
            "orbit_type":  orbit_type,
            "altitude":    alt,
            "velocity":    pos["velocity"],
            "fuel_status": 100.0,
            "status":      "OPERATIONAL",
        }
    except Exception as e:
        logger.error(f"Deploy failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
