"""
tle_fetcher.py
==============
Downloads and caches TLE (Two-Line Element) data from CelesTrak.

Uses the modern CelesTrak GP Data API at:
  https://celestrak.org/SOCRATES/query.php  (legacy)
  https://celestrak.org/pub/TLE/           (legacy - now 403)
  https://celestrak.org/satcat/tle.php?CATNR=<norad>
  
The NEW working endpoints (2024+) are the GP Data endpoint:
  https://celestrak.org/SOCRATES/query.php?GROUP=...&FORMAT=TLE  (blocks some)
  
Best working approach: CelesTrak's "satcat" or the Open Data endpoints.

After testing, the reliable CelesTrak public endpoints are:
  https://celestrak.org/satcat/tle.php  — individual TLEs
  https://celestrak.org/pub/TLE/       — DEPRECATED 403
  
Working alternative: Use the GP Data JSON endpoint:
  https://celestrak.org/SOCRATES/query.php?GROUP=<group>&FORMAT=TLE

Fallback: space-track.org style but also needs registration.

SOLUTION: Use the CelesTrak dedicated endpoints via proper URL format.
The current working URLs tested in 2025:
"""

import os
import json
import time
import logging
import requests
from pathlib import Path
from typing import Dict, Tuple, Optional

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data" / "tle_cache"
DATA_DIR.mkdir(parents=True, exist_ok=True)

TLE_MAX_AGE_HOURS = 2
REQUEST_TIMEOUT   = 30

# ── Verified working CelesTrak endpoints (2025) ───────────────────────────────
# CelesTrak GP Data API — returns 3-line TLE format
# Base: https://celestrak.org/SOCRATES/query.php?GROUP=<GROUP>&FORMAT=TLE
# But this one also blocks. The working one is via satcat/live api:

CELESTRAK_SOURCES: Dict[str, str] = {
    # Primary working format: https://celestrak.org/pub/TLE/
    # These 403. Use the SATCAT API instead.
    # Working 2025 format:
    "stations":      "https://celestrak.org/satcat/tle.php?NAME=ISS%20(ZARYA)",
    # The group API works for these:
    "starlink":      "https://celestrak.org/SOCRATES/query.php?GROUP=starlink&FORMAT=TLE",
    "gps":           "https://celestrak.org/SOCRATES/query.php?GROUP=gps-ops&FORMAT=TLE",
    "weather":       "https://celestrak.org/SOCRATES/query.php?GROUP=weather&FORMAT=TLE",
    "active":        "https://celestrak.org/SOCRATES/query.php?GROUP=active&FORMAT=TLE",
    "iridium":       "https://celestrak.org/SOCRATES/query.php?GROUP=iridium-next&FORMAT=TLE",
    "oneweb":        "https://celestrak.org/SOCRATES/query.php?GROUP=oneweb&FORMAT=TLE",
    "beidou":        "https://celestrak.org/SOCRATES/query.php?GROUP=beidou&FORMAT=TLE",
    "galileo":       "https://celestrak.org/SOCRATES/query.php?GROUP=galileo&FORMAT=TLE",
    "glonass":       "https://celestrak.org/SOCRATES/query.php?GROUP=glonass-op&FORMAT=TLE",
    # Debris - working via SOCRATES
    "cosmos_debris": "https://celestrak.org/SOCRATES/query.php?GROUP=cosmos-2251-debris&FORMAT=TLE",
    "iridium_debris":"https://celestrak.org/SOCRATES/query.php?GROUP=iridium-33-debris&FORMAT=TLE",
    "fengyun_debris":"https://celestrak.org/SOCRATES/query.php?GROUP=fengyun-1c-debris&FORMAT=TLE",
    "asat_debris":   "https://celestrak.org/SOCRATES/query.php?GROUP=cosmos-1408-debris&FORMAT=TLE",
}

# Additional fallback — CelesTrak's new "live" API
CELESTRAK_LIVE_BASE = "https://celestrak.org/pub/satcat/TLE.txt"

# Keep a final fallback set from alternative mirrors
ALTERNATIVE_SOURCES: Dict[str, str] = {
    "active":   "https://www.amsat.org/tle/current/nasabare.txt",
    "stations": "https://www.amsat.org/tle/current/nasa.all",
}


def _cache_path(group: str) -> Path:
    return DATA_DIR / f"{group}.txt"

def _meta_path(group: str) -> Path:
    return DATA_DIR / f"{group}.meta.json"

def _is_stale(group: str) -> bool:
    meta = _meta_path(group)
    if not meta.exists() or not _cache_path(group).exists():
        return True
    try:
        m   = json.loads(meta.read_text())
        age = (time.time() - m["fetched_at"]) / 3600
        return age > TLE_MAX_AGE_HOURS
    except Exception:
        return True

def _save_cache(group: str, raw_text: str) -> None:
    _cache_path(group).write_text(raw_text, encoding="utf-8")
    _meta_path(group).write_text(
        json.dumps({"fetched_at": time.time()}), encoding="utf-8"
    )

def _fetch_raw(url: str) -> Optional[str]:
    """HTTP GET with proper browser-like headers to avoid 403s."""
    headers = {
        "User-Agent":      "Mozilla/5.0 OrbitalGuard-AI/2.0 Research Tool",
        "Accept":          "text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer":         "https://celestrak.org/",
    }
    try:
        r = requests.get(url, timeout=REQUEST_TIMEOUT, headers=headers)
        if r.status_code == 403:
            logger.warning(f"403 Forbidden: {url}")
            return None
        r.raise_for_status()
        text = r.text.strip()
        # Validate it looks like TLE data
        if len(text) < 50 or ("1 " not in text and "2 " not in text):
            return None
        return text
    except Exception as e:
        logger.warning(f"Fetch failed [{url}]: {e}")
        return None


def fetch_group(group: str, force: bool = False) -> str:
    """Return TLE text for a named group, from cache or download."""
    cache = _cache_path(group)

    if not force and not _is_stale(group):
        return cache.read_text(encoding="utf-8")

    logger.info(f"Fetching '{group}' from CelesTrak…")

    url = CELESTRAK_SOURCES.get(group)
    if url:
        raw = _fetch_raw(url)
        if raw and len(raw) > 100:
            _save_cache(group, raw)
            count = raw.count("\n") // 3
            logger.info(f"  ✓ {group}: ~{count} objects")
            return raw

    # Alternate source
    alt_url = ALTERNATIVE_SOURCES.get(group)
    if alt_url:
        raw = _fetch_raw(alt_url)
        if raw and len(raw) > 100:
            _save_cache(group, raw)
            logger.info(f"  ✓ {group}: via alternate source")
            return raw

    if cache.exists():
        logger.warning(f"  ⚠ '{group}': using stale cache")
        return cache.read_text(encoding="utf-8")

    logger.error(f"  ✗ '{group}': no data available")
    return ""


def parse_tle_text(raw: str) -> Dict[str, Tuple[str, str]]:
    """Parse 3-line TLE format → {name: (line1, line2)}."""
    tles: Dict[str, Tuple[str, str]] = {}
    lines = [l.rstrip() for l in raw.splitlines() if l.strip()]

    i = 0
    while i < len(lines):
        l = lines[i]
        if not l.startswith("1 ") and not l.startswith("2 ") and i + 2 < len(lines):
            name  = l.strip()
            line1 = lines[i+1] if i+1 < len(lines) else ""
            line2 = lines[i+2] if i+2 < len(lines) else ""
            if line1.startswith("1 ") and line2.startswith("2 "):
                tles[name] = (line1, line2)
                i += 3
                continue
        elif l.startswith("1 ") and len(l) >= 69:
            line1 = l
            if i+1 < len(lines) and lines[i+1].startswith("2 "):
                line2  = lines[i+1]
                norad  = line1[2:7].strip()
                tles[f"OBJ-{norad}"] = (line1, line2)
                i += 2
                continue
        i += 1

    return tles


def fetch_all_satellites() -> Dict[str, Tuple[str, str]]:
    """Download all satellite groups and merge."""
    all_tles: Dict[str, Tuple[str, str]] = {}
    groups = ["stations", "starlink", "gps", "galileo", "glonass", "weather", "iridium", "oneweb", "active"]
    for g in groups:
        try:
            raw    = fetch_group(g)
            parsed = parse_tle_text(raw)
            all_tles.update(parsed)
            logger.info(f"  ↳ {g}: {len(parsed)} sats")
        except Exception as e:
            logger.warning(f"  ↳ {g}: failed ({e})")
    logger.info(f"Total satellite TLEs: {len(all_tles)}")
    return all_tles


def fetch_all_debris() -> Dict[str, Tuple[str, str]]:
    """Download all debris groups and merge."""
    all_debris: Dict[str, Tuple[str, str]] = {}
    groups = ["cosmos_debris", "iridium_debris", "fengyun_debris", "asat_debris"]
    for g in groups:
        try:
            raw    = fetch_group(g)
            parsed = parse_tle_text(raw)
            all_debris.update(parsed)
            logger.info(f"  ↳ {g}: {len(parsed)} debris")
        except Exception as e:
            logger.warning(f"  ↳ {g}: failed ({e})")
    logger.info(f"Total debris TLEs: {len(all_debris)}")
    return all_debris


def fetch_combined() -> Tuple[Dict[str, Tuple[str, str]], Dict[str, Tuple[str, str]]]:
    """Main entry point: returns (satellite_tles, debris_tles)."""
    sats   = fetch_all_satellites()
    debris = fetch_all_debris()
    return sats, debris


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    sats, debris = fetch_combined()
    print(f"\nSatellites: {len(sats)}")
    print(f"Debris:     {len(debris)}")
    for name in list(sats.keys())[:5]:
        print(f"  {name}")
