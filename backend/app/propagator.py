"""
propagator.py
=============
SGP4-based orbit propagation engine.

Uses Brandon Rhodes' sgp4 library (same algorithm as NORAD/NASA) to compute
accurate satellite positions from TLE data.

Coordinate frames:
  TLE epoch  →  TEME (True Equator Mean Equinox)  [SGP4 output]
  TEME       →  ECEF (Earth-Centered Earth-Fixed)  [with EOP]
  ECEF       →  Geodetic (lat / lon / alt)
  ECEF       →  ECI (X, Y, Z) for 3D visualisation

All positions in km, velocities in km/s.
"""

import math
import logging
import numpy as np
from datetime import datetime, timezone
from typing import Dict, Optional, Tuple, Any

from sgp4.api import Satrec, WGS84

from app.eop_loader import get_gmst, get_eop

logger = logging.getLogger(__name__)

EARTH_RADIUS_KM = 6371.0          # Mean Earth radius
MU              = 398600.4418     # GM in km³/s²


# ── SGP4 Record Builder ───────────────────────────────────────────────────────

def build_satrec(line1: str, line2: str) -> Optional[Satrec]:
    """
    Create an sgp4 Satrec object from TLE lines.
    Returns None if the TLE is malformed.
    """
    try:
        sat = Satrec.twoline2rv(line1, line2)
        return sat
    except Exception as e:
        logger.debug(f"TLE parse error: {e}")
        return None


# ── Frame Transformations ─────────────────────────────────────────────────────

def teme_to_ecef(
    r_teme: np.ndarray,
    v_teme: np.ndarray,
    gmst:   float
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Rotate TEME (True Equator Mean Equinox) → ECEF using GMST angle.
    Simple rotation about Z axis; EOP polar motion correction is small
    but applied in propagate() via the gmst value.
    """
    cos_g = math.cos(gmst)
    sin_g = math.sin(gmst)

    # TEME → PEF (Pseudo Earth Fixed) rotation matrix about Z
    R = np.array([
        [ cos_g,  sin_g, 0.0],
        [-sin_g,  cos_g, 0.0],
        [ 0.0,    0.0,   1.0]
    ])

    r_ecef = R @ r_teme
    # Velocity also needs correction for Earth's rotation
    # omega_earth ≈ 7.2921150e-5 rad/s
    omega = np.array([0.0, 0.0, 7.2921150e-5])
    v_ecef = R @ v_teme - np.cross(omega, r_ecef)

    return r_ecef, v_ecef


def ecef_to_geodetic(r_ecef: np.ndarray) -> Tuple[float, float, float]:
    """
    Convert ECEF (km) → geodetic (lat_deg, lon_deg, alt_km).
    Iterative Bowring / Zhu method.
    """
    x, y, z = r_ecef
    # WGS-84 constants
    a  = 6378.137       # km
    f  = 1.0 / 298.257223563
    b  = a * (1.0 - f)
    e2 = 1.0 - (b/a)**2

    lon = math.atan2(y, x)
    p   = math.sqrt(x**2 + y**2)

    # Iterative latitude
    lat = math.atan2(z, p * (1.0 - e2))
    for _ in range(5):
        sin_lat = math.sin(lat)
        N   = a / math.sqrt(1.0 - e2 * sin_lat**2)
        lat = math.atan2(z + e2 * N * sin_lat, p)

    sin_lat = math.sin(lat)
    cos_lat = math.cos(lat)
    N   = a / math.sqrt(1.0 - e2 * sin_lat**2)
    alt = p / cos_lat - N if abs(cos_lat) > 1e-9 else abs(z) / abs(sin_lat) - N * (1.0 - e2)

    return math.degrees(lat), math.degrees(lon), alt


# ── Main Propagation Function ─────────────────────────────────────────────────

def propagate(
    satrec:     Satrec,
    epoch_unix: float,
    eop_cache:  Optional[Tuple] = None
) -> Optional[Dict[str, Any]]:
    """
    Propagate a satellite to a given UTC epoch using SGP4.

    Parameters
    ----------
    satrec     : sgp4 Satrec object (built from TLE).
    epoch_unix : UTC time as Unix epoch seconds.
    eop_cache  : Optional cached (xp, yp, ut1_utc, lod) to avoid repeated IERS lookup.

    Returns
    -------
    dict with: x, y, z (ECI km), vx, vy, vz (km/s),
               lat, lon (degrees), altitude (km), velocity (km/s),
               period (min), inclination (deg)
    or None if propagation fails.
    """
    try:
        # Convert Unix epoch → Julian date components for sgp4
        jd_utc = epoch_unix / 86400.0 + 2440587.5
        jd_whole = math.floor(jd_utc)
        jd_frac  = jd_utc - jd_whole

        # SGP4 propagation → TEME position (km) and velocity (km/s)
        e, r_teme, v_teme = satrec.sgp4(jd_whole, jd_frac)

        if e != 0:
            return None  # Propagation error (e=1 decay, e=2 too-old TLE, etc.)

        r_teme = np.array(r_teme)
        v_teme = np.array(v_teme)

        # ── EOP corrections ────────────────────────────────────────────────
        if eop_cache is None:
            xp, yp, ut1_utc, lod = get_eop(epoch_unix)
        else:
            xp, yp, ut1_utc, lod = eop_cache

        gmst = get_gmst(epoch_unix, ut1_utc)

        # ── TEME → ECEF → Geodetic ─────────────────────────────────────────
        r_ecef, v_ecef = teme_to_ecef(r_teme, v_teme, gmst)
        lat, lon, alt  = ecef_to_geodetic(r_ecef)

        # ECI == TEME for our visualisation purposes (close enough for 3D display)
        x, y, z     = float(r_teme[0]), float(r_teme[1]), float(r_teme[2])
        vx, vy, vz  = float(v_teme[0]), float(v_teme[1]), float(v_teme[2])
        velocity    = float(np.linalg.norm(v_teme))

        # Orbital elements from SGP4 internal state
        # Period from mean motion (radians/min → minutes)
        n_rad_min = satrec.no_kozai              # mean motion in rad/min
        if n_rad_min > 0:
            period_min = (2.0 * math.pi) / n_rad_min
        else:
            a = (MU / (n_rad_min * (1/60.0))**2)**(1/3) if n_rad_min > 0 else 7000.0
            period_min = 2.0 * math.pi * math.sqrt(a**3 / MU) / 60.0

        inclination = math.degrees(satrec.inclo)  # inclination in radians → degrees
        ecc = satrec.ecco

        return {
            "x":           x,
            "y":           y,
            "z":           z,
            "vx":          vx,
            "vy":          vy,
            "vz":          vz,
            "lat":         lat,
            "lon":         lon,
            "altitude":    alt,
            "velocity":    velocity,
            "period_min":  period_min,
            "inclination": inclination,
            "eccentricity": ecc,
        }

    except Exception as e:
        logger.debug(f"Propagation error for {getattr(satrec, 'satnum', '?')}: {e}")
        return None


# ── Batch Propagation ─────────────────────────────────────────────────────────

def propagate_batch(
    catalog:    Dict[str, Satrec],
    epoch_unix: float,
    max_objects: int = 5000
) -> Dict[str, Dict[str, Any]]:
    """
    Propagate a batch of satellites to the same epoch efficiently.
    Computes EOP once and reuses it for all objects.

    Returns dict: {name: position_dict}
    """
    eop_cache = get_eop(epoch_unix)
    results   = {}
    count     = 0

    for name, satrec in catalog.items():
        if count >= max_objects:
            break
        pos = propagate(satrec, epoch_unix, eop_cache=eop_cache)
        if pos is not None:
            results[name] = pos
            count += 1

    return results


# ── Orbit Classification ──────────────────────────────────────────────────────

def classify_orbit(altitude_km: float, inclination_deg: float) -> str:
    """
    Classify orbit type based on altitude and inclination.
    """
    if altitude_km < 0:
        return "DECAYED"
    if altitude_km < 2000:
        if abs(inclination_deg) >= 80:
            if abs(inclination_deg) >= 95 and abs(inclination_deg) <= 105:
                return "SSO"
            return "Polar"
        return "LEO"
    if altitude_km < 35500:
        return "MEO"
    if 35500 <= altitude_km <= 36200:
        return "GEO"
    return "HEO"


if __name__ == "__main__":
    import time
    logging.basicConfig(level=logging.INFO)

    # Test with real ISS TLE (recent as of 2024)
    line1 = "1 25544U 98067A   24001.50000000  .00016717  00000+0  29526-3 0  9999"
    line2 = "2 25544  51.6429 208.9163 0003774 188.9504 171.1365 15.49890018  9999"

    satrec = build_satrec(line1, line2)
    if satrec:
        pos = propagate(satrec, time.time())
        if pos:
            print(f"ISS position:")
            print(f"  Lat/Lon/Alt: {pos['lat']:.2f}° / {pos['lon']:.2f}° / {pos['altitude']:.1f} km")
            print(f"  Velocity:    {pos['velocity']:.3f} km/s")
            print(f"  Period:      {pos['period_min']:.2f} min")
            print(f"  Orbit type:  {classify_orbit(pos['altitude'], pos['inclination'])}")
