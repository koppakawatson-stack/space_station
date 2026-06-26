import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  ShieldAlert, Crosshair, Cpu, Sparkles,
  Flame, Globe, Compass, Satellite, Navigation,
  AlertCircle, Radio
} from "lucide-react";
import { soundService } from "../utils/soundService";

/* ── helpers ─────────────────────────────────────────────── */
const getSatMeta = (name) => {
  const m = {
    "ISS (ZARYA)":   { country:"United States / Multi", type:"Space Station"    },
    "STARLINK-4217": { country:"United States",          type:"Communication"    },
    "GPS IIF-11":    { country:"United States",          type:"Navigation"       },
    "GALILEO-02":    { country:"European Union",         type:"Navigation"       },
    "INSAT-3DR":     { country:"India",                  type:"Weather / Comm"   },
    "GOES-16":       { country:"United States",          type:"Weather Satellite"},
    "LANDSAT-9":     { country:"United States",          type:"Earth Observation"},
    "CRYOSAT-2":     { country:"European Union",         type:"Polar Science"    },
    "SENTINEL-6":    { country:"European Union",         type:"Ocean Topography" },
    "AQUA":          { country:"United States",          type:"Earth Science"    },
    "HUBBLE":        { country:"United States",          type:"Space Telescope"  },
    "METEOR-M2":     { country:"Russia",                 type:"Weather Satellite"},
  };
  return m[name] || { country:"International", type:"Orbital Payload" };
};

const orbitColor = (type) => {
  if (type === "LEO")   return "#0ea5e9";
  if (type === "MEO")   return "#f97316";
  if (type === "GEO")   return "#06b6d4";
  if (type === "Polar") return "#e2e8f0";
  if (type === "SSO")   return "#eab308";
  return "#94a3b8";
};

/* ── Satellite Photo Map ──────────────────────────────────── */
const SAT_PHOTOS = {
  "ISS (ZARYA)":   "/sat_iss.png",
  "HUBBLE":        "/sat_hubble.png",
  "STARLINK-4217": "/sat_starlink.png",
  "GPS IIF-11":    "/sat_gps.png",
  "GALILEO-02":    "/sat_galileo.png",
  "INSAT-3DR":     "/sat_geo.png",
  "GOES-16":       "/sat_geo.png",
  "LANDSAT-9":     "/sat_earthobs.png",
  "CRYOSAT-2":     "/sat_earthobs.png",
  "SENTINEL-6":    "/sat_earthobs.png",
  "AQUA":          "/sat_earthobs.png",
  "METEOR-M2":     "/sat_meteor.png",
};

function getSatPhoto(satName) {
  return SAT_PHOTOS[satName] || "/sat_gps.png";
}

/* ── Satellite Photo Card ─────────────────────────────────── */
function SatellitePhoto({ sat, oc }) {
  const [loaded, setLoaded] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const photoSrc = getSatPhoto(sat.name);
  const alt     = sat.altitude ?? (sat.a ? (sat.a - 6371).toFixed(0) : "—");
  const vel     = sat.velocity ?? (sat.a ? Math.sqrt(398600.44 / sat.a).toFixed(2) : "—");

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        borderRadius: 6,
        overflow: "hidden",
        border: `1px solid ${oc}40`,
        boxShadow: hovered
          ? `0 0 22px ${oc}55, 0 0 8px ${oc}30`
          : `0 0 10px ${oc}22`,
        transition: "box-shadow 0.25s ease",
        cursor: "default",
        background: "#020410",
        height: 120,
      }}
    >
      {/* Loading shimmer */}
      {!loaded && (
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(90deg, rgba(14,165,233,0.04) 25%, rgba(14,165,233,0.1) 50%, rgba(14,165,233,0.04) 75%)",
          backgroundSize: "200% 100%",
          animation: "data-stream 1.2s linear infinite",
        }} />
      )}

      {/* Satellite photo */}
      <img
        src={photoSrc}
        alt={sat.name}
        onLoad={() => setLoaded(true)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
          display: "block",
          transform: hovered ? "scale(1.06)" : "scale(1)",
          transition: "transform 0.4s ease",
          opacity: loaded ? 1 : 0,
        }}
      />

      {/* Bottom gradient overlay with telemetry */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        background: "linear-gradient(to top, rgba(2,4,16,0.96) 0%, rgba(2,4,16,0.7) 55%, transparent 100%)",
        padding: "18px 10px 8px",
        display: "flex", justifyContent: "space-between", alignItems: "flex-end",
      }}>
        <div>
          <div style={{ fontSize: 8.5, fontWeight: 700, color: "#fff", fontFamily: "'Rajdhani',sans-serif", letterSpacing: "0.08em" }}>
            {sat.name}
          </div>
          <div style={{ fontSize: 7, color: oc, fontFamily: "'Share Tech Mono',monospace", marginTop: 1 }}>
            {sat.orbit_type} &nbsp;·&nbsp; {Number(alt).toFixed ? Number(alt).toFixed(0) : alt} km
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 7, color: "#64748b", fontFamily: "'Share Tech Mono',monospace" }}>VEL</div>
          <div style={{ fontSize: 8, fontWeight: 700, color: oc, fontFamily: "'Share Tech Mono',monospace" }}>
            {typeof vel === "number" ? vel.toFixed(2) : vel} km/s
          </div>
        </div>
      </div>

      {/* Top-left corner accent */}
      <div style={{ position:"absolute", top:0, left:0, width:14, height:14,
        borderTop:`1.5px solid ${oc}`, borderLeft:`1.5px solid ${oc}`, borderRadius:"6px 0 0 0", pointerEvents:"none" }} />
      <div style={{ position:"absolute", top:0, right:0, width:14, height:14,
        borderTop:`1.5px solid ${oc}`, borderRight:`1.5px solid ${oc}`, borderRadius:"0 6px 0 0", pointerEvents:"none" }} />
      <div style={{ position:"absolute", bottom:0, left:0, width:14, height:14,
        borderBottom:`1.5px solid ${oc}`, borderLeft:`1.5px solid ${oc}`, borderRadius:"0 0 0 6px", pointerEvents:"none" }} />
      <div style={{ position:"absolute", bottom:0, right:0, width:14, height:14,
        borderBottom:`1.5px solid ${oc}`, borderRight:`1.5px solid ${oc}`, borderRadius:"0 0 6px 0", pointerEvents:"none" }} />

      {/* Live indicator dot */}
      <div style={{
        position: "absolute", top: 7, right: 8,
        display: "flex", alignItems: "center", gap: 4,
        padding: "2px 6px",
        background: "rgba(2,4,16,0.82)",
        border: "1px solid rgba(16,185,129,0.35)",
        borderRadius: 10,
      }}>
        <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#10b981",
          boxShadow: "0 0 5px #10b981", animation: "pulse-slow 2s infinite" }} />
        <span style={{ fontSize: 6.5, fontWeight: 700, color: "#10b981", fontFamily: "'Rajdhani',sans-serif", letterSpacing: "0.1em" }}>LIVE</span>
      </div>
    </div>
  );
}

/* ── Collision Ring ───────────────────────────────────────── */
function CollisionRing({ probability }) {
  const pct  = typeof probability === "string" ? parseFloat(probability) : (probability || 0);
  const circ = 2 * Math.PI * 15.9;
  const dash = (pct / 100) * circ;
  return (
    <svg width="52" height="52" viewBox="0 0 36 36" style={{ flexShrink:0 }}>
      <path className="collision-ring-track" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
      <path className="collision-ring-fill" strokeDasharray={`${dash},${circ}`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
      <text x="18" y="20" fill="white" fontSize="7" fontWeight="bold" textAnchor="middle" fontFamily="'Rajdhani',sans-serif">{Math.round(pct)}%</text>
    </svg>
  );
}

/* ── Empty State ─────────────────────────────────────────── */
function EmptyState() {
  return (
    <div className="w-full h-full glass-panel rounded-lg flex flex-col select-none relative overflow-hidden" style={{ fontFamily:"'Rajdhani',sans-serif" }}>
      <div className="hud-corners-bottom rounded-lg" />

      {/* Panel header */}
      <div style={{ padding:"10px 12px 8px", flexShrink:0 }}>
        <div className="section-header" style={{ fontSize:"9px", marginBottom:0 }}>
          <Satellite style={{ width:10, height:10, color:"#0ea5e9" }} />
          Selected Object
        </div>
      </div>

      {/* Empty body */}
      <div className="flex-1 flex flex-col items-center justify-center" style={{ padding:"20px 16px" }}>
        <div className="empty-state-icon" style={{ marginBottom:16 }}>
          <Globe style={{ width:24, height:24, color:"rgba(14,165,233,0.5)" }} />
        </div>
        <div style={{ fontSize:"11px", fontWeight:700, color:"#475569", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:6, fontFamily:"'Rajdhani',sans-serif" }}>
          No Satellite Selected
        </div>
        <div style={{ fontSize:"8.5px", color:"#334155", textAlign:"center", lineHeight:1.6, fontFamily:"'Rajdhani',sans-serif", maxWidth:180 }}>
          Click any satellite in the 3D view or use the Satellites panel to select a target.
        </div>

        {/* Hint badges */}
        <div style={{ display:"flex", flexDirection:"column", gap:6, marginTop:20, width:"100%" }}>
          {[
            { icon:Navigation, text:"Click globe to select satellite" },
            { icon:Cpu,        text:"View real-time telemetry data"   },
            { icon:ShieldAlert, text:"Monitor collision probability"   },
          ].map(({ icon:Icon, text }) => (
            <div key={text} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", background:"rgba(14,165,233,0.04)", border:"1px solid rgba(14,165,233,0.1)", borderRadius:5 }}>
              <Icon style={{ width:10, height:10, color:"#0ea5e9", flexShrink:0 }} />
              <span style={{ fontSize:"8.5px", color:"#475569", fontFamily:"'Rajdhani',sans-serif" }}>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const CONTINENTS_DATA = [
  [[260,200],[420,170],[500,230],[490,310],[440,370],[360,390],[290,360],[240,300],[250,240]],
  [[320,430],[400,410],[430,450],[440,530],[420,620],[370,660],[320,640],[290,570],[300,490]],
  [[700,160],[800,140],[850,190],[820,250],[760,270],[700,250],[680,200]],
  [[720,270],[820,260],[870,310],[890,420],[870,530],[820,600],[740,610],[690,540],[670,420],[680,330]],
  [[830,130],[1100,110],[1250,150],[1300,220],[1280,300],[1200,340],[1100,360],[950,320],[860,270],[820,200]],
  [[980,320],[1050,310],[1100,360],[1120,420],[1080,450],[1020,440],[970,390],[960,350]],
  [[1150,510],[1260,490],[1310,550],[1290,620],[1200,650],[1130,620],[1100,560]],
  [[440,100],[530,90],[560,140],[530,190],[460,200],[420,160]]
];

function GroundTrackMap({ sat }) {
  const canvasRef = useRef(null);

  const elements = useMemo(() => {
    const name = sat.name;
    let node = 0, peri = 0, M0 = 0;
    if (name === "ISS (ZARYA)") { node = 215; peri = 110; M0 = 180; }
    else if (name === "STARLINK-4217") { node = 120; peri = 45; M0 = 0; }
    else if (name === "GPS IIF-11") { node = 60; peri = 150; M0 = 270; }
    else if (name === "GALILEO-02") { node = 180; peri = 30; M0 = 120; }
    else if (name === "INSAT-3DR") { node = 82; peri = 0; M0 = 0; }
    else if (name === "GOES-16") { node = 140; peri = 0; M0 = 90; }
    else if (name === "LANDSAT-9") { node = 310; peri = 45; M0 = 180; }
    else if (name === "CRYOSAT-2") { node = 150; peri = 90; M0 = 0; }
    else if (name === "SENTINEL-6") { node = 45; peri = 120; M0 = 240; }
    else if (name === "AQUA") { node = 270; peri = 180; M0 = 0; }
    else if (name === "HUBBLE") { node = 25; peri = 60; M0 = 300; }
    else {
      const match = name.match(/\d+$/);
      const iVal = match ? parseInt(match[0], 10) - 100 : 5;
      node = (iVal * 17) % 360;
      peri = (iVal * 29) % 360;
      M0 = (iVal * 43) % 360;
    }
    return {
      node: node * Math.PI / 180,
      peri: peri * Math.PI / 180,
      M0: M0 * Math.PI / 180
    };
  }, [sat.name]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;

    ctx.fillStyle = "#020412";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(14,165,233,0.06)";
    ctx.lineWidth = 0.5;
    for (let x = 0; x < W; x += W / 12) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += H / 6) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    ctx.fillStyle = "rgba(14,165,233,0.08)";
    ctx.strokeStyle = "rgba(14,165,233,0.22)";
    ctx.lineWidth = 0.6;
    CONTINENTS_DATA.forEach(pts => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0] * W / 1440, pts[0][1] * H / 720);
      pts.slice(1).forEach(([px, py]) => ctx.lineTo(px * W / 1440, py * H / 720));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });

    ctx.strokeStyle = "rgba(14,165,233,0.3)";
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke();

    const timeOffset = window.simTimeOffset ?? 0;
    const a = sat.a;
    const e = sat.e || 0.0001;
    const i = (sat.i_deg ?? 53) * Math.PI / 180;
    const mu = 398600.4418;
    const period = 2 * Math.PI * Math.sqrt(Math.pow(a, 3) / mu);
    const meanMotion = 2 * Math.PI / period;
    
    ctx.strokeStyle = "rgba(249,115,22,0.75)";
    ctx.lineWidth = 1.0;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();

    const pointsCount = 90;
    let first = true;
    let prevX = 0;

    for (let p = 0; p <= pointsCount; p++) {
      const dt = (p / pointsCount) * period;
      const t = timeOffset + dt;
      
      const M = (elements.M0 + meanMotion * t) % (2 * Math.PI);
      let E = M;
      for (let j = 0; j < 5; j++) E = E - (E - e * Math.sin(E) - M) / (1.0 - e * Math.cos(E));
      
      const xp = a * (Math.cos(E) - e);
      const yp = a * Math.sqrt(1.0 - e*e) * Math.sin(E);
      
      const cosNode = Math.cos(elements.node); const sinNode = Math.sin(elements.node);
      const cosPeri = Math.cos(elements.peri); const sinPeri = Math.sin(elements.peri);
      const cosI = Math.cos(i); const sinI = Math.sin(i);
      
      const x_eci = xp * (cosPeri * cosNode - sinPeri * sinNode * cosI) - yp * (sinPeri * cosNode + cosPeri * sinNode * cosI);
      const y_eci = xp * (cosPeri * sinNode + sinPeri * cosNode * cosI) - yp * (sinPeri * sinNode - cosPeri * cosNode * cosI);
      const z_eci = xp * (sinPeri * sinI) + yp * (cosPeri * sinI);

      const r_eci = Math.sqrt(x_eci*x_eci + y_eci*y_eci + z_eci*z_eci);
      const latRad = Math.asin(z_eci / r_eci);
      const lonInertial = Math.atan2(y_eci, x_eci);
      
      const EARTH_SIDEREAL_DAY = 86164.1;
      const earthRotation = (2 * Math.PI / EARTH_SIDEREAL_DAY) * t;
      const lonRad = ((lonInertial - earthRotation) + Math.PI * 5) % (2 * Math.PI) - Math.PI;

      const latDeg = latRad * 180 / Math.PI;
      const lonDeg = lonRad * 180 / Math.PI;
      
      const cx = ((lonDeg + 180) / 360) * W;
      const cy = ((90 - latDeg) / 180) * H;

      if (first) {
        ctx.moveTo(cx, cy);
        first = false;
      } else {
        if (Math.abs(cx - prevX) < W * 0.7) {
          ctx.lineTo(cx, cy);
        } else {
          ctx.moveTo(cx, cy);
        }
      }
      prevX = cx;
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const M_curr = (elements.M0 + meanMotion * timeOffset) % (2 * Math.PI);
    let E_curr = M_curr;
    for (let j = 0; j < 5; j++) E_curr = E_curr - (E_curr - e * Math.sin(E_curr) - M_curr) / (1.0 - e * Math.cos(E_curr));
    
    const xp_c = a * (Math.cos(E_curr) - e);
    const yp_c = a * Math.sqrt(1.0 - e*e) * Math.sin(E_curr);
    
    const cosNode_c = Math.cos(elements.node); const sinNode_c = Math.sin(elements.node);
    const cosPeri_c = Math.cos(elements.peri); const sinPeri_c = Math.sin(elements.peri);
    const cosI_c = Math.cos(i); const sinI_c = Math.sin(i);
    
    const x_eci_c = xp_c * (cosPeri_c * cosNode_c - sinPeri_c * sinNode_c * cosI_c) - yp_c * (sinPeri_c * cosNode_c + cosPeri_c * sinNode_c * cosI_c);
    const y_eci_c = xp_c * (cosPeri_c * sinNode_c + sinPeri_c * cosNode_c * cosI_c) - yp_c * (sinPeri_c * sinNode_c - cosPeri_c * cosNode_c * cosI_c);
    const z_eci_c = xp_c * (sinPeri_c * sinI_c) + yp_c * (cosPeri_c * sinI_c);

    const r_eci_c = Math.sqrt(x_eci_c*x_eci_c + y_eci_c*y_eci_c + z_eci_c*z_eci_c);
    const latRad_c = Math.asin(z_eci_c / r_eci_c);
    const lonInertial_c = Math.atan2(y_eci_c, x_eci_c);
    
    const EARTH_SIDEREAL_DAY = 86164.1;
    const earthRotation_c = (2 * Math.PI / EARTH_SIDEREAL_DAY) * timeOffset;
    const lonRad_c = ((lonInertial_c - earthRotation_c) + Math.PI * 5) % (2 * Math.PI) - Math.PI;

    const latDeg_c = latRad_c * 180 / Math.PI;
    const lonDeg_c = lonRad_c * 180 / Math.PI;
    
    const satCx = ((lonDeg_c + 180) / 360) * W;
    const satCy = ((90 - latDeg_c) / 180) * H;

    const height_c = a - 6371;
    const fovHalfAngle_c = 11 * Math.PI / 180;
    const footprintRadiusKm = height_c * Math.tan(fovHalfAngle_c);
    const radiusInDegrees = footprintRadiusKm / 111;
    const radiusInPixels = (radiusInDegrees / 360) * W;

    ctx.fillStyle = "rgba(6,182,212,0.14)";
    ctx.strokeStyle = "rgba(6,182,212,0.65)";
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.arc(satCx, satCy, Math.max(8, radiusInPixels), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#00f0ff";
    ctx.beginPath();
    ctx.arc(satCx, satCy, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(satCx - 5, satCy); ctx.lineTo(satCx + 5, satCy);
    ctx.moveTo(satCx, satCy - 5); ctx.lineTo(satCx, satCy + 5);
    ctx.stroke();

  }, [sat, elements]);

  return (
    <div style={{ position: "relative" }}>
      <canvas
        ref={canvasRef}
        width={320}
        height={160}
        style={{
          width: "100%",
          height: 96,
          background: "rgba(4,8,26,0.85)",
          border: "1px solid rgba(14,165,233,0.15)",
          borderRadius: 4
        }}
      />
    </div>
  );
}

function SignalAnalyzer({ sat, linkData }) {
  const [points, setPoints] = useState(() => Array.from({ length: 40 }, () => 40));
  const phaseRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      phaseRef.current += 0.15;
      const snr = linkData ? parseFloat(linkData.snr) : 0;
      const baseAmp = linkData ? Math.min(25, Math.max(2, snr * 0.8)) : 1;
      const noise = Math.random() * 3 - 1.5;
      
      setPoints(prev => {
        const next = [...prev.slice(1)];
        const p1 = Math.sin(phaseRef.current) * baseAmp;
        const p2 = Math.cos(phaseRef.current * 2.3) * (baseAmp * 0.3);
        const val = 40 + p1 + p2 + noise;
        next.push(val);
        return next;
      });
    }, 40);
    return () => clearInterval(interval);
  }, [linkData]);

  const pathD = useMemo(() => {
    return points.reduce((acc, y, x) => {
      const px = (x / (points.length - 1)) * 320;
      return acc + (x === 0 ? `M ${px} ${y}` : ` L ${px} ${y}`);
    }, "");
  }, [points]);

  const snrVal = linkData ? parseFloat(linkData.snr) : 0;

  return (
    <div style={{
      background: "rgba(2,4,12,0.92)",
      border: "1px solid rgba(14,165,233,0.18)",
      borderRadius: 4,
      padding: 8,
      position: "relative"
    }}>
      <div style={{ position: "relative", width: "100%", height: 80, overflow: "hidden" }}>
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <line key={`v-${i}`} x1={`${(i / 10) * 100}%`} y1="0" x2={`${(i / 10) * 100}%`} y2="100%" stroke="rgba(14,165,233,0.06)" strokeWidth="0.5" />
          ))}
          {Array.from({ length: 4 }).map((_, i) => (
            <line key={`h-${i}`} x1="0" y1={`${(i / 4) * 100}%`} x2="100%" y2={`${(i / 4) * 100}%`} stroke="rgba(14,165,233,0.06)" strokeWidth="0.5" />
          ))}
          <path
            d={pathD}
            fill="none"
            stroke={linkData ? "#00f0ff" : "#ef4444"}
            strokeWidth="1.5"
            style={{
              filter: linkData ? "drop-shadow(0 0 4px rgba(0,240,255,0.8))" : "drop-shadow(0 0 4px rgba(239,68,68,0.8))",
              transition: "stroke 0.3s ease"
            }}
          />
        </svg>
        <div style={{ position: "absolute", top: 4, left: 6, fontSize: 7, color: "rgba(14,165,233,0.5)", fontFamily: "'Share Tech Mono', monospace" }}>
          DOWNLINK FREQ: 8.420 GHz
        </div>
        <div style={{ position: "absolute", top: 4, right: 6, fontSize: 7, color: linkData ? "#00f0ff" : "#ef4444", fontFamily: "'Share Tech Mono', monospace" }}>
          {linkData ? "LINK STABLE" : "SIGNAL ATTENUATED"}
        </div>
        <div style={{ position: "absolute", bottom: 4, left: 6, fontSize: 7, color: "rgba(14,165,233,0.5)", fontFamily: "'Share Tech Mono', monospace" }}>
          BW: 250 MHz | SWEEP: 40ms
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 8, borderTop: "1px solid rgba(14,165,233,0.1)", paddingTop: 6 }}>
        <div>
          <div style={{ fontSize: 7, color: "#475569", textTransform: "uppercase" }}>Jitter</div>
          <div style={{ fontSize: 8.5, fontWeight: 700, color: linkData ? "#10b981" : "#475569", fontFamily: "'Share Tech Mono', monospace" }}>
            {linkData ? `${(Math.random() * 0.12 + 0.02).toFixed(3)} ms` : "—"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 7, color: "#475569", textTransform: "uppercase" }}>Attenuation</div>
          <div style={{ fontSize: 8.5, fontWeight: 700, color: linkData ? `-${(80 + Math.random() * 5).toFixed(1)} dBm` : "#475569", fontFamily: "'Share Tech Mono', monospace" }}>
            {linkData ? `-${(80 + Math.random() * 5).toFixed(1)} dBm` : "—"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 7, color: "#475569", textTransform: "uppercase" }}>C/N Ratio</div>
          <div style={{ fontSize: 8.5, fontWeight: 700, color: snrVal > 15 ? "#10b981" : (snrVal > 0 ? "#eab308" : "#475569"), fontFamily: "'Share Tech Mono', monospace" }}>
            {linkData ? `${(snrVal + 4.2).toFixed(1)} dB` : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────── */
export default function RightPanel({
  selectedSat,
  setSelectedSat,
  predictions = [],
  onExecuteManeuver,
  isManeuvering,
  analyticsData,
  cameraMode,
  setCameraMode,
  activeTab = "dashboard",
  satellites = [],
  debris = [],
}) {
  const [linkData, setLinkData] = useState(null);
  const [cardMode, setCardMode] = useState("blueprint");

  useEffect(() => {
    const timer = setInterval(() => {
      setLinkData(window.activeGroundLink ? { ...window.activeGroundLink } : null);
    }, 200);
    return () => clearInterval(timer);
  }, [selectedSat]);

  // If nothing is selected, show the elegant empty state
  if (!selectedSat) return <EmptyState />;

  const sat = selectedSat;
  const activeHazard = predictions.find(p => p.satellite === sat.name && p.recommended_action !== "Maneuver Completed");
  const meta         = getSatMeta(sat.name);
  const oc           = orbitColor(sat.orbit_type);
  const fuelPct      = sat.fuel_status ?? 100;
  const altitude     = (sat.altitude ?? (sat.a - 6371)).toFixed(0);
  const velocity     = (sat.velocity ?? 7.6).toFixed(1);
  const period       = sat.a
    ? (2 * Math.PI * Math.sqrt(Math.pow(sat.a, 3) / 398600.44) / 60).toFixed(1)
    : "95.2";

  const nearbyObjects = [
    { id:"DEBRIS-10023",   dist: activeHazard?.closest_approach_km || "4.32 km", risk: activeHazard ? "HIGH" : "SAFE" },
    { id:"DEBRIS-20491",   dist:"12.18 km",  risk:"MEDIUM" },
    { id:"STARLINK-4216",  dist:"22.11 km",  risk:"LOW"    },
    { id:"INSAT-3DR",      dist:"35,786 km", risk:"LOW"    },
    { id:"METEOR-M2",      dist:"830 km",    risk:"LOW"    },
  ];

  const riskColor = (r) => r==="HIGH" ? "#ef4444" : r==="MEDIUM" ? "#eab308" : "#0ea5e9";

  const collisionProb = activeHazard ? parseFloat(activeHazard.probability) : 0;
  const isHighRisk    = collisionProb > 50;

  return (
    <div className="w-full h-full glass-panel rounded-lg flex flex-col select-none relative overflow-hidden" style={{ fontFamily:"'Rajdhani',sans-serif" }}>
      <div className="hud-corners-bottom rounded-lg" />

      <div className="flex-1 flex flex-col overflow-y-auto p-2.5 space-y-2" style={{ minHeight:0 }}>

        {/* ── SELECTED OBJECT ── */}
        <div className="hud-bracket p-2.5 rounded-lg relative" style={{ background:"rgba(4,8,26,0.8)" }}>
          <div className="hud-corners-bottom" />

          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div className="section-header" style={{ marginBottom:0, paddingBottom:0, border:"none", fontSize:"9px" }}>
              Selected Object
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:4 }}>
              <span style={{ width:5, height:5, borderRadius:"50%", background:"#10b981", boxShadow:"0 0 6px #10b981", animation:"pulse-slow 2s ease-in-out infinite", display:"inline-block" }} />
              <span style={{ fontSize:"8px", color:"#10b981", fontWeight:700, letterSpacing:"0.1em" }}>TRACKING</span>
            </div>
          </div>

          {/* Name + badge */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <Satellite style={{ width:13, height:13, color:oc }} />
              <span style={{ fontSize:"12px", fontWeight:700, color:"#fff", letterSpacing:"0.05em" }}>{sat.name}</span>
            </div>
            <span style={{ fontSize:"8px", fontWeight:700, color:oc, background:`rgba(${sat.orbit_type==="LEO"?"14,165,233":sat.orbit_type==="MEO"?"249,115,22":"6,182,212"},0.12)`, border:`1px solid ${oc}55`, padding:"1px 6px", borderRadius:3, letterSpacing:"0.1em" }}>
              {sat.orbit_type}
            </span>
          </div>

          {/* Card Toggle Tabs */}
          {sat.orbit_type !== "DEBRIS" ? (
            <div style={{ display:"flex", borderBottom:"1px solid rgba(14,165,233,0.15)", marginBottom:6 }}>
              {[
                { id:"blueprint", label:"Satellite Photo" },
                { id:"groundtrack", label:"Ground Track" },
                { id:"signal", label:"Signal Analyzer" }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => { setCardMode(t.id); soundService.playClick(); }}
                  onMouseEnter={() => soundService.playHover()}
                  style={{
                    flex:1,
                    background:"none", border:"none",
                    padding:"3px 0",
                    fontSize:"7.5px", fontWeight:700,
                    color: cardMode === t.id ? "#0ea5e9" : "#475569",
                    borderBottom: cardMode === t.id ? "1.5px solid #0ea5e9" : "1.5px solid transparent",
                    cursor:"pointer", textTransform:"uppercase", letterSpacing:"0.08em",
                    fontFamily:"'Rajdhani',sans-serif", transition:"all 0.15s ease"
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ) : null}

          {/* Satellite Photo / Ground Track Content */}
          <div style={{ marginBottom:8 }}>
            {sat.orbit_type === "DEBRIS" ? null : cardMode === "blueprint" ? (
              <SatellitePhoto sat={sat} oc={oc} />
            ) : cardMode === "groundtrack" ? (
              <GroundTrackMap sat={sat} />
            ) : (
              <SignalAnalyzer sat={sat} linkData={linkData} />
            )}
          </div>

          {/* Stats grid */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px" }}>
            {[
              { label:"Operator",    value: sat.operator || "Unknown"           },
              { label:"Orbit Type",  value: sat.orbit_type || "LEO"             },
              { label:"Altitude",    value: `${altitude} km`                    },
              { label:"Velocity",    value: `${velocity} km/s`                  },
              { label:"Inclination", value: `${(sat.i_deg??53.0).toFixed(1)}°`  },
              { label:"Period",      value: `${period} min`                     },
              { label:"Launch Date", value: sat.launch_date || "—"              },
              { label:"Status",      value: sat.status || "OPERATIONAL", isStatus:true },
            ].map(item => (
              <div key={item.label}>
                <div style={{ fontSize:"7.5px", color:"#475569", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:1 }}>{item.label}</div>
                <div style={{ fontSize:"9px", fontWeight:600, color: item.isStatus ? "#10b981" : "#e2e8f0", fontFamily:"'Share Tech Mono',monospace" }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Fuel bar */}
          <div style={{ marginTop:8 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
              <span style={{ fontSize:"7.5px", color:"#475569", textTransform:"uppercase", letterSpacing:"0.1em" }}>Fuel Status</span>
              <span style={{ fontSize:"8.5px", color: fuelPct>50 ? "#10b981" : "#eab308", fontWeight:700, fontFamily:"'Share Tech Mono',monospace" }}>{fuelPct.toFixed(0)}%</span>
            </div>
            <div className="fuel-bar-track">
              <div className={`fuel-bar-fill${fuelPct<40?"-low":""} fuel-bar-fill`} style={{ width:`${fuelPct}%` }} />
            </div>
          </div>
        </div>

        {/* ── TELEMETRY LINK BUDGET ── */}
        {sat.orbit_type !== "DEBRIS" && (
          <div className="hud-bracket p-2.5 rounded-lg relative" style={{ background:"rgba(4,8,26,0.8)", border: linkData ? "1px solid rgba(14,165,233,0.3)" : "1px solid rgba(239,68,68,0.25)" }}>
            <div className="hud-corners-bottom" />
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <Radio style={{ width:11, height:11, color: linkData ? "#0ea5e9" : "#ef4444", animation: linkData ? "pulse-slow 1.5s infinite" : "none" }} />
                <span className="section-header" style={{ marginBottom:0, paddingBottom:0, border:"none", fontSize:"9px", color: linkData ? "#0ea5e9" : "#94a3b8" }}>
                  Downlink Link Budget
                </span>
              </div>
              <span className={`risk-badge-${linkData ? "low" : "high"}`} style={{ fontSize:"7px", padding:"1px 4px", border: "1px solid", borderRadius:"3px", borderColor: linkData ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)" }}>
                {linkData ? "LOCK ACTIVE" : "NO CARRIER"}
              </span>
            </div>

            {linkData ? (
              <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:"7.5px", color:"#64748b", textTransform:"uppercase" }}>Ground Station</span>
                  <span style={{ fontSize:"8.5px", color: linkData.color, fontWeight:700 }}>{linkData.name}</span>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"4px 10px", marginTop:4 }}>
                  {[
                    { label:"Slant Range", value:`${linkData.distance} km` },
                    { label:"Elevation", value:`${linkData.elevation}°` },
                    { label:"Latency", value:`${linkData.latency} ms` },
                    { label:"Doppler Shift", value:`${linkData.doppler} kHz`, color: parseFloat(linkData.doppler) < 0 ? "#10b981" : "#ef4444" },
                    { label:"SNR", value:`${linkData.snr} dB`, color: parseFloat(linkData.snr) > 12 ? "#10b981" : "#eab308" },
                    { label:"Bit Error Rate (BER)", value:linkData.ber },
                  ].map((r) => (
                    <div key={r.label}>
                      <div style={{ fontSize:"7px", color:"#475569", textTransform:"uppercase", letterSpacing:"0.05em" }}>{r.label}</div>
                      <div style={{ fontSize:"8.5px", fontWeight:600, color: r.color || "#e2e8f0", fontFamily:"'Share Tech Mono',monospace" }}>{r.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 8px", background:"rgba(239,68,68,0.05)", border:"1px solid rgba(239,68,68,0.15)", borderRadius:4 }}>
                <AlertCircle style={{ width:12, height:12, color:"#ef4444" }} />
                <span style={{ fontSize:"8px", color:"#ef4444", fontFamily:"'Rajdhani',sans-serif", fontWeight:600, letterSpacing:"0.02em" }}>
                  No ground station in line-of-sight (Elevation &lt; 5.0°)
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── AI COPILOT ── */}
        <div className={`hud-bracket p-2.5 rounded-lg relative ${isHighRisk ? "hud-bracket-danger" : ""}`} style={{ background: isHighRisk ? "rgba(20,4,4,0.85)" : "rgba(4,8,26,0.8)" }}>
          <div className="hud-corners-bottom" />

          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <Sparkles style={{ width:11, height:11, color:"#06b6d4" }} />
              <span className="section-header" style={{ marginBottom:0, paddingBottom:0, border:"none", fontSize:"9px", color:"#06b6d4" }}>AI Copilot</span>
              <span style={{ fontSize:"7px", color:"#475569", fontFamily:"'Share Tech Mono',monospace" }}>• Orbital Threat Analysis</span>
            </div>
            {isHighRisk && <span className="risk-badge-high" style={{ animation:"pulse-slow 1.5s ease-in-out infinite" }}>HIGH RISK</span>}
          </div>

          {/* Collision probability row */}
          <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:8 }}>
            <CollisionRing probability={collisionProb} />
            <div style={{ flex:1, display:"flex", flexDirection:"column", gap:4 }}>
              {[
                { label:"Collision Probability", value:`${Math.round(collisionProb)}%`, color: isHighRisk?"#ef4444":"#10b981" },
                { label:"Time To Encounter",     value: activeHazard ? activeHazard.time_to_encounter : "—"              },
                { label:"Closest Approach",      value: activeHazard?.closest_approach_km || "—"                         },
                { label:"Relative Velocity",     value: activeHazard?.relative_velocity_kms || "—"                       },
              ].map(r => (
                <div key={r.label} style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ fontSize:"7.5px", color:"#64748b", fontFamily:"'Share Tech Mono',monospace" }}>{r.label}</span>
                  <span style={{ fontSize:"8.5px", color: r.color || "#e2e8f0", fontWeight: r.color ? 700 : 400, fontFamily:"'Share Tech Mono',monospace", textShadow: r.color ? `0 0 8px ${r.color}88` : "none" }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recommended action */}
          {activeHazard && (
            <div style={{ borderTop:"1px solid rgba(239,68,68,0.15)", paddingTop:8, display:"flex", flexDirection:"column", gap:4 }}>
              {[
                { label:"Recommended Action", value: activeHazard.recommended_action, color:"#10b981" },
                { label:"Fuel Required",       value: activeHazard.fuel_required_kg    },
                { label:"Risk Reduction",      value: activeHazard.risk_reduction, color:"#10b981" },
              ].map(r => (
                <div key={r.label} style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ fontSize:"7.5px", color:"#64748b", fontFamily:"'Share Tech Mono',monospace" }}>{r.label}</span>
                  <span style={{ fontSize:"8px", color: r.color || "#e2e8f0", fontWeight:600, fontFamily:"'Rajdhani',sans-serif" }}>{r.value}</span>
                </div>
              ))}
              <button
                className="btn-execute"
                disabled={isManeuvering}
                onClick={() => { onExecuteManeuver(sat.name); soundService.playClick(); }}
                onMouseEnter={() => soundService.playHover()}
                style={{ marginTop:4 }}
              >
                {isManeuvering ? (
                  <><span style={{ width:10, height:10, border:"2px solid white", borderTopColor:"transparent", borderRadius:"50%", animation:"spin-slow 0.6s linear infinite", display:"inline-block" }} /> Executing Burn...</>
                ) : (
                  <><Flame style={{ width:12, height:12 }} /> Execute Maneuver</>
                )}
              </button>
            </div>
          )}

          {!activeHazard && (
            <div style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 8px", background:"rgba(16,185,129,0.05)", border:"1px solid rgba(16,185,129,0.15)", borderRadius:4 }}>
              <span style={{ width:5, height:5, borderRadius:"50%", background:"#10b981", display:"inline-block" }} />
              <span style={{ fontSize:"8px", color:"#10b981", fontFamily:"'Rajdhani',sans-serif", fontWeight:600 }}>No collision threats detected</span>
            </div>
          )}
        </div>

        {/* ── NEARBY OBJECTS ── */}
        <div className="hud-bracket p-2.5 rounded-lg relative" style={{ background:"rgba(4,8,26,0.8)" }}>
          <div className="hud-corners-bottom" />
          <div className="section-header" style={{ fontSize:"9px" }}>
            <Crosshair style={{ width:10, height:10, color:"#0ea5e9" }} />
            Nearby Objects
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            {nearbyObjects.map(obj => {
              const rc = riskColor(obj.risk);
              return (
                <div key={obj.id} onClick={() => { const t = satellites.find(s=>s.name===obj.id)||debris.find(d=>d.name===obj.id); if(t) { setSelectedSat(t); soundService.playSelect(); } }}
                  style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5px 8px", background:"rgba(14,165,233,0.03)", border:"1px solid rgba(14,165,233,0.1)", borderRadius:4, cursor:"pointer", transition:"all 0.15s ease" }}
                  onMouseEnter={e=>{soundService.playHover(); e.currentTarget.style.background="rgba(14,165,233,0.08)";e.currentTarget.style.borderColor="rgba(14,165,233,0.3)";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="rgba(14,165,233,0.03)";e.currentTarget.style.borderColor="rgba(14,165,233,0.1)";}}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ width:5, height:5, borderRadius:"50%", background:rc, boxShadow:`0 0 4px ${rc}`, flexShrink:0, display:"inline-block" }} />
                    <span style={{ fontSize:"8.5px", color:"#e2e8f0", fontFamily:"'Share Tech Mono',monospace" }}>{obj.id}</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:"8.5px", color:"#94a3b8", fontFamily:"'Share Tech Mono',monospace" }}>{obj.dist}</span>
                    <span style={{ fontSize:"7px", fontWeight:700, color:rc, fontFamily:"'Rajdhani',sans-serif", letterSpacing:"0.1em" }}>{obj.risk}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── CAMERA MODES ── */}
        <div className="hud-bracket p-2 rounded-lg relative" style={{ background:"rgba(4,8,26,0.8)" }}>
          <div className="hud-corners-bottom" />
          <div className="section-header" style={{ fontSize:"9px", marginBottom:6 }}>
            <Compass style={{ width:10, height:10, color:"#0ea5e9", animation:"spin-slow 12s linear infinite" }} />
            Camera System
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:4 }}>
            {[
              { id:"global",   label:"Global"  },
              { id:"tracking", label:"Follow"  },
              { id:"pov",      label:"POV"     },
            ].map(m => {
              const isActive = cameraMode === m.id;
              return (
                <button key={m.id} onClick={() => { setCameraMode(m.id); soundService.playClick(); }}
                  onMouseEnter={() => soundService.playHover()}
                  style={{
                    padding:"4px", borderRadius:3, fontSize:"8px",
                    fontFamily:"'Rajdhani',sans-serif", fontWeight:700,
                    letterSpacing:"0.1em", textTransform:"uppercase",
                    cursor:"pointer", transition:"all 0.15s ease",
                    border:`1px solid ${isActive?"rgba(14,165,233,0.7)":"rgba(30,41,67,0.8)"}`,
                    background: isActive?"rgba(14,165,233,0.15)":"rgba(4,8,26,0.5)",
                    color: isActive?"#fff":"#64748b",
                    boxShadow: isActive?"0 0 10px rgba(14,165,233,0.2)":"none",
                  }}>
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
