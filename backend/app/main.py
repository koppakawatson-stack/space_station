import os
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List, Any
import numpy as np
from app.simulation import active_satellites, tracked_debris, get_collisions

app = FastAPI(title="OrbitalGuard AI - Space Traffic Management API")

# Enable CORS for frontend integration
allowed_origins_env = os.getenv("ALLOWED_ORIGINS")
if allowed_origins_env:
    origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]
else:
    origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "OrbitalGuard AI API is operational"}

@app.get("/api/satellites")
def get_satellites() -> List[Dict[str, Any]]:
    """Returns metadata for all tracked satellites."""
    return [
        {
            "name": sat.name,
            "operator": sat.operator,
            "orbit_type": sat.orbit_type,
            "a": sat.a,
            "e": sat.e,
            "i_deg": np.degrees(sat.i),
            "launch_date": sat.launch_date,
            "status": sat.status,
            "fuel_status": sat.fuel_status,
        }
        for sat in active_satellites
    ]

@app.get("/api/debris")
def get_debris(limit: int = 200) -> List[Dict[str, Any]]:
    """Returns metadata for a subset of tracked debris to keep payload fast."""
    return [
        {
            "name": deb.name,
            "orbit_type": deb.orbit_type,
            "status": deb.status,  # SAFE, MEDIUM, HIGH, CRITICAL
        }
        for deb in tracked_debris[:limit]
    ]

@app.get("/api/state")
def get_state(t: float = Query(0.0, description="Time offset in seconds")) -> Dict[str, Any]:
    """Propagates and returns the positions of all satellites and tracked debris at time t."""
    sat_states = []
    for sat in active_satellites:
        pos = sat.propagate(t)
        sat_states.append({
            "name": sat.name,
            "operator": sat.operator,
            "orbit_type": sat.orbit_type,
            "fuel_status": sat.fuel_status,
            "status": sat.status,
            **pos
        })

    # Return coordinates for a subset of debris (e.g. 150 elements) to render in 3D
    deb_states = []
    for deb in tracked_debris[:150]:
        pos = deb.propagate(t)
        deb_states.append({
            "name": deb.name,
            "orbit_type": deb.orbit_type,
            "status": deb.status,
            "x": pos["x"],
            "y": pos["y"],
            "z": pos["z"],
        })

    return {
        "timestamp_offset": t,
        "satellites": sat_states,
        "debris": deb_states
    }

@app.get("/api/predictions")
def get_predictions(t: float = Query(0.0)) -> List[Dict[str, Any]]:
    """Returns collision warnings at time t."""
    return get_collisions(t)

@app.get("/api/analytics")
def get_analytics() -> Dict[str, Any]:
    """Returns space situational awareness analytics statistics."""
    # Orbit Distribution
    leo_count = sum(1 for s in active_satellites if s.orbit_type == "LEO") + 8432
    meo_count = sum(1 for s in active_satellites if s.orbit_type == "MEO") + 1728
    geo_count = sum(1 for s in active_satellites if s.orbit_type == "GEO") + 2382
    total_satellites = leo_count + meo_count + geo_count

    return {
        "satellites_count": total_satellites,
        "debris_count": 43218,
        "high_risk_encounters": 7,
        "critical_alerts": 3,
        "orbit_distribution": {
            "LEO": leo_count,
            "MEO": meo_count,
            "GEO": geo_count
        },
        "debris_by_size": {
            "above_10cm": 12117,
            "one_to_10cm": 18661,
            "one_mm_to_1cm": 12440,
            "below_1mm": 25768
        },
        "space_weather": {
            "kp_index": 3.2,
            "solar_wind_kms": 412,
            "density_p_cm3": 5.1
        },
        "launches_this_month": {
            "successful": 14,
            "partial": 1,
            "failed": 1,
            "total": 16
        }
    }

@app.post("/api/maneuver/execute")
def execute_maneuver(satellite_name: str) -> Dict[str, Any]:
    """Performs orbit raising maneuver for a satellite to resolve collision threats."""
    # Update satellite in-memory state
    for sat in active_satellites:
        if sat.name == satellite_name:
            # Modify orbital parameters slightly to clear the warning
            sat.a += 2.4  # Raise orbit by 2.4 km
            sat.fuel_status = max(0.0, sat.fuel_status - 0.21)
            sat.status = "OPERATIONAL"
            return {
                "success": True,
                "message": f"Maneuver executed: Raised orbit of {satellite_name} by 2.4 km. Fuel consumed: 0.21 kg.",
                "new_altitude": sat.a - 6371.0,
                "remaining_fuel": sat.fuel_status
            }
    return {"success": False, "message": "Satellite not found."}
