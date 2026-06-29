"""
eop_loader.py
=============
Earth Orientation Parameters (EOP) loader.

Uses astropy's built-in IERS-A/B tables (bundled with astropy-iers-data)
for high-accuracy Earth orientation corrections:
  - Polar motion (Xp, Yp) in arcseconds
  - UT1–UTC offset in seconds
  - Length of Day (LOD) in milliseconds

These corrections are applied during the TEME→ECEF coordinate frame
transformation in the SGP4 propagator for maximum positional accuracy.

No external download needed — astropy bundles the IERS tables automatically.
"""

import logging
import numpy as np
from datetime import datetime, timezone
from typing import Tuple

logger = logging.getLogger(__name__)

# Lazy-import astropy to avoid slow import at module level
_iers_a = None
_initialized = False


def _init_iers():
    """Load IERS-A table once on first access."""
    global _iers_a, _initialized
    if _initialized:
        return
    try:
        from astropy.utils import iers
        from astropy.utils.iers import conf as iers_conf
        # Allow auto-download if bundled data is outdated
        iers_conf.auto_download = True
        iers_conf.auto_max_age = None
        _iers_a = iers.IERS_Auto.open()
        logger.info("IERS-A table loaded successfully")
    except Exception as e:
        logger.warning(f"IERS-A unavailable, using IERS-B fallback: {e}")
        try:
            from astropy.utils import iers
            _iers_a = iers.IERS_B.open()
            logger.info("IERS-B table loaded as fallback")
        except Exception as e2:
            logger.error(f"No IERS table available: {e2}")
            _iers_a = None
    _initialized = True


def get_eop(epoch_unix: float) -> Tuple[float, float, float, float]:
    """
    Returns Earth Orientation Parameters for a given Unix timestamp.

    Parameters
    ----------
    epoch_unix : float
        UTC time as Unix epoch seconds.

    Returns
    -------
    (xp, yp, ut1_utc, lod) where:
        xp, yp   : polar motion in arcseconds
        ut1_utc  : UT1–UTC in seconds
        lod      : length of day excess in ms (0.0 if unavailable)
    """
    _init_iers()

    if _iers_a is None:
        return 0.0, 0.0, 0.0, 0.0

    try:
        from astropy.time import Time
        t = Time(epoch_unix, format="unix", scale="utc")
        xp, yp = _iers_a.pm_xy(t)
        ut1_utc = _iers_a.ut1_utc(t)

        # Convert Quantity objects to plain floats
        xp_val      = float(xp.arcsec)       if hasattr(xp,  'arcsec') else float(xp)
        yp_val      = float(yp.arcsec)       if hasattr(yp,  'arcsec') else float(yp)
        ut1_utc_val = float(ut1_utc.to_value('s')) if hasattr(ut1_utc, 'to_value') else float(ut1_utc)

        return xp_val, yp_val, ut1_utc_val, 0.0
    except Exception as e:
        logger.debug(f"EOP lookup failed for t={epoch_unix}: {e}")
        return 0.0, 0.0, 0.0, 0.0


def get_gmst(epoch_unix: float, ut1_utc: float = 0.0) -> float:
    """
    Returns Greenwich Mean Sidereal Time (GMST) in radians for a given UTC epoch.
    Used for TEME → ECEF frame rotation.

    Parameters
    ----------
    epoch_unix : float
        UTC time as Unix epoch.
    ut1_utc : float
        UT1–UTC correction in seconds (from EOP).
    """
    # Julian date of epoch (UT1)
    JD_J2000 = 2451545.0
    jd_utc   = epoch_unix / 86400.0 + 2440587.5
    jd_ut1   = jd_utc + ut1_utc / 86400.0

    T  = (jd_ut1 - JD_J2000) / 36525.0  # Julian centuries since J2000

    # IAU 1982 GMST formula (seconds of time)
    gmst_sec = (
        67310.54841
        + (876600.0 * 3600.0 + 8640184.812866) * T
        + 0.093104 * T**2
        - 6.2e-6   * T**3
    )
    # Convert to radians and normalise [0, 2π]
    gmst_rad = (gmst_sec % 86400.0) * (2.0 * np.pi / 86400.0)
    gmst_rad = gmst_rad % (2.0 * np.pi)
    return gmst_rad


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    import time
    now = time.time()
    xp, yp, dut1, lod = get_eop(now)
    gmst = get_gmst(now, dut1)
    print(f"EOP at current epoch:")
    print(f"  Polar motion  xp={xp:.4f}\"  yp={yp:.4f}\"")
    print(f"  UT1-UTC       {dut1:.4f} s")
    print(f"  GMST          {np.degrees(gmst):.4f}°")
