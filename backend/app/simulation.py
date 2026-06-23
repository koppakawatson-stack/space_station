import math
import numpy as np

# Earth Gravitational Parameter (km^3 / s^2)
MU = 398600.4418
# Earth Radius in km
EARTH_RADIUS = 6371.0

class KeplerianElement:
    def __init__(self, name, operator, orbit_type, a, e, i, omega_node, omega_peri, M0, launch_date, status="OPERATIONAL"):
        self.name = name
        self.operator = operator
        self.orbit_type = orbit_type  # LEO, MEO, GEO, DEBRIS
        self.a = a            # Semi-major axis in km
        self.e = e            # Eccentricity
        self.i = math.radians(i)            # Inclination in radians
        self.omega_node = math.radians(omega_node)  # Longitude of ascending node in radians
        self.omega_peri = math.radians(omega_peri)  # Argument of periapsis in radians
        self.M0 = math.radians(M0)          # Mean anomaly at epoch in radians
        self.launch_date = launch_date
        self.status = status
        self.fuel_status = 100.0 if status == "OPERATIONAL" else 0.0

        # Calculate orbital period (seconds)
        self.period = 2 * math.pi * math.sqrt((self.a ** 3) / MU)
        # Mean motion (rad/sec)
        self.mean_motion = 2 * math.pi / self.period

    def propagate(self, t_seconds):
        """Propagates orbit to t_seconds from epoch using Kepler's equation."""
        # Mean anomaly at time t
        M = (self.M0 + self.mean_motion * t_seconds) % (2 * math.pi)

        # Solve Kepler's equation: E - e*sin(E) = M
        # Simple Newton-Raphson solver
        E = M
        for _ in range(5):
            E = E - (E - self.e * math.sin(E) - M) / (1.0 - self.e * math.cos(E))

        # Coordinates in orbital plane
        x_orbital = self.a * (math.cos(E) - self.e)
        y_orbital = self.a * math.sqrt(1.0 - self.e ** 2) * math.sin(E)
        
        # Velocity in orbital plane (approximate)
        # r = a * (1 - e * cos(E))
        r = self.a * (1.0 - self.e * math.cos(E))
        v_factor = math.sqrt(MU * self.a) / r
        vx_orbital = -v_factor * math.sin(E)
        vy_orbital = v_factor * math.sqrt(1.0 - self.e ** 2) * math.cos(E)

        # Rotation matrices components
        cos_node = math.cos(self.omega_node)
        sin_node = math.sin(self.omega_node)
        cos_peri = math.cos(self.omega_peri)
        sin_peri = math.sin(self.omega_peri)
        cos_i = math.cos(self.i)
        sin_i = math.sin(self.i)

        # Rotate to ECI (Earth-Centered Inertial) coordinates
        # Position
        x = x_orbital * (cos_peri * cos_node - sin_peri * sin_node * cos_i) - y_orbital * (sin_peri * cos_node + cos_peri * sin_node * cos_i)
        y = x_orbital * (cos_peri * sin_node + sin_peri * cos_node * cos_i) - y_orbital * (sin_peri * sin_node - cos_peri * cos_node * cos_i)
        z = x_orbital * (sin_peri * sin_i) + y_orbital * (cos_peri * sin_i)

        # Velocity
        vx = vx_orbital * (cos_peri * cos_node - sin_peri * sin_node * cos_i) - vy_orbital * (sin_peri * cos_node + cos_peri * sin_node * cos_i)
        vy = vx_orbital * (cos_peri * sin_node + sin_peri * cos_node * cos_i) - vy_orbital * (sin_peri * sin_node - cos_peri * cos_node * cos_i)
        vz = vx_orbital * (sin_peri * sin_i) + vy_orbital * (cos_peri * sin_i)

        # Altitude in km
        altitude = r - EARTH_RADIUS
        # Velocity magnitude in km/s
        velocity = math.sqrt(vx**2 + vy**2 + vz**2)

        return {
            "x": x,
            "y": y,
            "z": z,
            "vx": vx,
            "vy": vy,
            "vz": vz,
            "altitude": altitude,
            "velocity": velocity
        }

# Define main satellites featured in the requirements
active_satellites = [
    # LEO Satellites (~160 - 2,000 km altitude, a = ~6530 - 8370 km)
    KeplerianElement("ISS (ZARYA)", "NASA", "LEO", 6791, 0.0005, 51.6, 215.0, 110.0, 180.0, "20 Nov 1998"),
    KeplerianElement("STARLINK-4217", "SpaceX", "LEO", 6921, 0.0001, 53.0, 120.0, 45.0, 0.0, "12 May 2024"),
    KeplerianElement("HUBBLE", "NASA", "LEO", 6911, 0.0008, 28.5, 90.0, 30.0, 45.0, "24 Apr 1990"),
    # MEO Satellites (~2,000 - 35,786 km altitude, a = ~8370 - 42164 km)
    KeplerianElement("GPS IIF-11", "USAF", "MEO", 26560, 0.008, 55.0, 60.0, 150.0, 270.0, "31 Oct 2015"),
    KeplerianElement("GALILEO-02", "ESA", "MEO", 29600, 0.002, 56.0, 180.0, 30.0, 120.0, "12 Oct 2011"),
    # GEO Satellites (~35,786 km altitude, a = ~42,164 km)
    KeplerianElement("INSAT-3DR", "ISRO", "GEO", 42164, 0.0003, 0.1, 82.0, 0.0, 0.0, "08 Sep 2016"),
    KeplerianElement("GOES-16", "NOAA", "GEO", 42164, 0.0001, 0.05, 120.0, 0.0, 90.0, "19 Nov 2016"),
    # Polar Orbit Satellites
    KeplerianElement("LANDSAT-9", "NASA", "Polar", 7078, 0.0001, 98.2, 310.0, 45.0, 180.0, "27 Sep 2021"),
    KeplerianElement("CRYOSAT-2", "ESA", "Polar", 7100, 0.001, 92.0, 150.0, 90.0, 0.0, "08 Apr 2010"),
    # Sun-Synchronous Orbit Satellites
    KeplerianElement("SENTINEL-6", "ESA", "SSO", 7714, 0.0007, 66.0, 45.0, 120.0, 240.0, "21 Nov 2020"),
    KeplerianElement("AQUA", "NASA", "SSO", 7078, 0.0001, 98.2, 270.0, 180.0, 0.0, "04 May 2002")
]

# Generate more mock satellites to fill up lists
# Total active around 50 for selection, and thousands of lightweight particles
operators = ["SpaceX", "NASA", "ESA", "ISRO", "JAXA", "OneWeb", "Planet Labs"]
for i in range(1, 40):
    types = ["LEO", "MEO", "GEO", "Polar", "SSO"]
    orbit_type = types[i % len(types)]
    if orbit_type == "LEO":
        a = 6800 + (i * 15)
        e = 0.0001 + (i * 0.00005)
        incl = 30 + (i * 1.5)
    elif orbit_type == "MEO":
        a = 24000 + (i * 100)
        e = 0.001 + (i * 0.0001)
        incl = 50 + (i * 0.5)
    elif orbit_type == "GEO":
        a = 42164 + (i * 2)
        e = 0.0001
        incl = 0.05 * i
    elif orbit_type == "Polar":
        a = 7000 + (i * 20)
        e = 0.0005
        incl = 88.0 + (i * 0.2)
    else: # SSO
        a = 7050 + (i * 25)
        e = 0.0001
        incl = 98.0 + (i * 0.05)
    
    op = operators[i % len(operators)]
    name = f"SAT-{op.upper()}-{100 + i}"
    active_satellites.append(
        KeplerianElement(name, op, orbit_type, a, e, incl, (i * 17) % 360, (i * 29) % 360, (i * 43) % 360, "15 Jan 2025")
    )


# Debris Generation
# Generate thousands of debris elements in LEO, MEO, GEO.
# To keep JSON size manageable, we will generate a stable list of 1000 debris elements.
# The UI can spawn more visual debris particles using local random seeds, but these 1000 will be tracked by the backend.
tracked_debris = []
np.random.seed(42)

for i in range(1, 1001):
    d_type = "LEO" if i <= 700 else ("MEO" if i <= 900 else "GEO")
    if d_type == "LEO":
        a = 6700 + np.random.uniform(100, 1000)
        e = np.random.uniform(0.0005, 0.01)
        incl = np.random.uniform(20, 98)
    elif d_type == "MEO":
        a = 20000 + np.random.uniform(2000, 8000)
        e = np.random.uniform(0.001, 0.05)
        incl = np.random.uniform(45, 65)
    else:
        a = 41900 + np.random.uniform(100, 500)
        e = np.random.uniform(0.0001, 0.005)
        incl = np.random.uniform(0, 15)

    node = np.random.uniform(0, 360)
    peri = np.random.uniform(0, 360)
    m0 = np.random.uniform(0, 360)
    
    # Risk Profile
    risk_rand = np.random.rand()
    if risk_rand > 0.98:
        risk = "CRITICAL"
    elif risk_rand > 0.92:
        risk = "HIGH"
    elif risk_rand > 0.80:
        risk = "MEDIUM"
    else:
        risk = "SAFE"

    tracked_debris.append(
        KeplerianElement(f"DEBRIS-{10000+i}", "DEBRIS", d_type, a, e, incl, node, peri, m0, "Unknown", status=risk)
    )

# Predefined close encounters for STARLINK-4217 and others
def get_collisions(t_seconds):
    """Calculates active warning lines and risk stats between satellites and debris."""
    # Let's mock a close approach for STARLINK-4217
    # As time increases, the distance closes and then diverges.
    # At t=12060 (approx 3 hours 21 mins), distance is closest (4.32 km)
    # At t=0, distance is 432.0 km.
    
    # We will simulate a collision hazard: STARLINK-4217 vs DEBRIS-10023
    # Distance in km as a function of time
    t_encounter = 12060.0  # 3h 21m
    dt = t_seconds - t_encounter
    
    # Parabolic close approach model: min distance is 4.32 km, relative velocity is 14.2 km/s
    distance = math.sqrt(4.32**2 + (dt * 14.2 / 3600.0)**2)
    
    # Probability peaks at closest approach
    prob = 0.92 / (1 + (dt / 1000.0)**2)
    
    risk_level = "SAFE"
    if prob > 0.85:
        risk_level = "CRITICAL"
    elif prob > 0.60:
        risk_level = "HIGH"
    elif prob > 0.20:
        risk_level = "MEDIUM"
        
    time_remaining_sec = max(0.0, t_encounter - t_seconds)
    hours = int(time_remaining_sec // 3600)
    minutes = int((time_remaining_sec % 3600) // 60)
    seconds = int(time_remaining_sec % 60)
    
    return [
        {
            "satellite": "STARLINK-4217",
            "debris": "DEBRIS-10023",
            "probability": f"{prob * 100:.1f}%",
            "risk_level": risk_level,
            "time_to_encounter": f"{hours:02d}h : {minutes:02d}m : {seconds:02d}s",
            "time_to_encounter_seconds": time_remaining_sec,
            "closest_approach_km": f"{distance:.2f} km",
            "relative_velocity_kms": "14.2 km/s",
            "recommended_action": "Increase orbit by +2.4 km" if t_seconds < t_encounter else "Maneuver Completed",
            "fuel_required_kg": "0.21 kg",
            "risk_reduction": "92% -> 0.4%",
            "x_encounter": 3460.5, # mock ECI coordinate where they meet
            "y_encounter": 4210.2,
            "z_encounter": 2500.1
        }
    ]
