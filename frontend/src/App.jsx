import React, { useState, useEffect, useRef, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import RightPanel from "./components/RightPanel";
import BottomPanel from "./components/BottomPanel";
import SpaceCanvas from "./components/SpaceCanvas";
import {
  AlertTriangle, Shield, Radio, Settings, Globe,
  RadioTower, Satellite, Menu, X, ChevronUp, Layers, Monitor
} from "lucide-react";

/* ─── breakpoint hook ─────────────────────────────────────── */
function useBreakpoint() {
  const [bp, setBp] = useState(() => {
    const w = window.innerWidth;
    if (w < 768)  return "mobile";
    if (w < 1024) return "tablet";
    return "desktop";
  });
  useEffect(() => {
    const fn = () => {
      const w = window.innerWidth;
      setBp(w < 768 ? "mobile" : w < 1024 ? "tablet" : "desktop");
    };
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return bp;
}

export default function App() {
  const bp = useBreakpoint();
  const isMobile = bp === "mobile";
  const isTablet = bp === "tablet";

  const [activeTab, setActiveTab]         = useState("dashboard");
  const [scanlineActive, setScanlineActive] = useState(true);
  const [satellites, setSatellites]       = useState([]);
  const [debris, setDebris]               = useState([]);
  const [predictions, setPredictions]     = useState([]);
  const [analytics, setAnalytics]         = useState(null);

  const [timeOffset, setTimeOffset]       = useState(0);
  const [isPlaying, setIsPlaying]         = useState(true);
  const [speed, setSpeed]                 = useState(1);
  const [selectedSat, setSelectedSat]     = useState(null);
  const [isManeuvering, setIsManeuvering] = useState(false);
  const [dbStatus, setDbStatus]           = useState("OFFLINE");
  const [cameraMode, setCameraMode]       = useState("global");
  const [thrusterActive, setThrusterActive] = useState(false);
  const [launchNotification, setLaunchNotification] = useState(null);
  const [showQuickStats, setShowQuickStats] = useState(false);

  /* sidebar/panel collapse state */
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);

  /* mobile drawer state */
  const [showMobileLeft, setShowMobileLeft]   = useState(false);
  const [showMobileRight, setShowMobileRight] = useState(false);
  const [showMobileBottom, setShowMobileBottom] = useState(false);

  const [utcTime, setUtcTime] = useState("");
  const [utcDate, setUtcDate] = useState("");

  /* orbit layer toggles */
  const [showOrbits, setShowOrbits]             = useState(true);
  const [showDebris, setShowDebris]             = useState(true);
  const [showSpaceWeather, setShowSpaceWeather] = useState(false);
  const [showHeatmap, setShowHeatmap]           = useState(false);
  const [showLEO, setShowLEO]   = useState(true);
  const [showMEO, setShowMEO]   = useState(true);
  const [showGEO, setShowGEO]   = useState(true);
  const [showPolar, setShowPolar] = useState(true);
  const [showSSO, setShowSSO]   = useState(true);

  const lastFetchTime     = useRef(0);
  const animationFrameId  = useRef(null);

  /* ── UTC clock ─────────────────────────────────────────── */
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
      setUtcTime(`${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} UTC`);
      setUtcDate(`${now.getUTCDate()} ${months[now.getUTCMonth()]} ${now.getUTCFullYear()}`);
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, []);

  /* ── initial data ──────────────────────────────────────── */
  useEffect(() => {
    fetch("http://localhost:8000/api/analytics")
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setAnalytics(d); setDbStatus("LIVE"); })
      .catch(() => {
        setDbStatus("FALLBACK");
        setAnalytics({
          satellites_count: 12542, debris_count: 43218,
          high_risk_encounters: 7, critical_alerts: 3,
          orbit_distribution: { LEO: 8432, MEO: 1728, GEO: 2382 },
          debris_by_size: { above_10cm: 12117, one_to_10cm: 18661, one_mm_to_1cm: 12440, below_1mm: 25768 },
          space_weather: { kp_index: 3.2, solar_wind_kms: 412, density_p_cm3: 5.1 },
          launches_this_month: { successful: 14, partial: 1, failed: 1, total: 16 }
        });
      });

    fetch("http://localhost:8000/api/satellites")
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => setSatellites(d))
      .catch(() => setSatellites([
        { name:"ISS (ZARYA)",   operator:"NASA",   orbit_type:"LEO",   a:6791,  e:0.0005, i_deg:51.6, launch_date:"20 Nov 1998", status:"OPERATIONAL", fuel_status:90  },
        { name:"STARLINK-4217", operator:"SpaceX", orbit_type:"LEO",   a:6921,  e:0.0001, i_deg:53.0, launch_date:"12 May 2024", status:"OPERATIONAL", fuel_status:78  },
        { name:"HUBBLE",        operator:"NASA",   orbit_type:"LEO",   a:6911,  e:0.0008, i_deg:28.5, launch_date:"24 Apr 1990", status:"OPERATIONAL", fuel_status:85  },
        { name:"METEOR-M2",     operator:"Russia", orbit_type:"LEO",   a:6691,  e:0.001,  i_deg:98.7, launch_date:"08 Jul 2014", status:"OPERATIONAL", fuel_status:62  },
        { name:"GPS IIF-11",    operator:"USAF",   orbit_type:"MEO",   a:26560, e:0.008,  i_deg:55.0, launch_date:"31 Oct 2015", status:"OPERATIONAL", fuel_status:71  },
        { name:"GALILEO-02",    operator:"ESA",    orbit_type:"MEO",   a:29600, e:0.002,  i_deg:56.0, launch_date:"12 Oct 2011", status:"OPERATIONAL", fuel_status:80  },
        { name:"INSAT-3DR",     operator:"ISRO",   orbit_type:"GEO",   a:42164, e:0.0003, i_deg:0.1,  launch_date:"08 Sep 2016", status:"OPERATIONAL", fuel_status:78  },
        { name:"GOES-16",       operator:"NOAA",   orbit_type:"GEO",   a:42164, e:0.0001, i_deg:0.05, launch_date:"19 Nov 2016", status:"OPERATIONAL", fuel_status:85  },
        { name:"LANDSAT-9",     operator:"NASA",   orbit_type:"Polar", a:7078,  e:0.0001, i_deg:98.2, launch_date:"27 Sep 2021", status:"OPERATIONAL", fuel_status:88  },
        { name:"CRYOSAT-2",     operator:"ESA",    orbit_type:"Polar", a:7100,  e:0.001,  i_deg:92.0, launch_date:"08 Apr 2010", status:"OPERATIONAL", fuel_status:74  },
        { name:"SENTINEL-6",    operator:"ESA",    orbit_type:"SSO",   a:7714,  e:0.0007, i_deg:66.0, launch_date:"21 Nov 2020", status:"OPERATIONAL", fuel_status:82  },
        { name:"AQUA",          operator:"NASA",   orbit_type:"SSO",   a:7078,  e:0.0001, i_deg:98.2, launch_date:"04 May 2002", status:"OPERATIONAL", fuel_status:69  },
      ]));
  }, []);

  /* ── simulation loop ───────────────────────────────────── */
  useEffect(() => {
    let lastTime = performance.now();
    const loop = (time) => {
      if (isPlaying) {
        const dt = (time - lastTime) / 1000;
        setTimeOffset(prev => prev + dt * speed);
      }
      lastTime = time;
      animationFrameId.current = requestAnimationFrame(loop);
    };
    animationFrameId.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId.current);
  }, [isPlaying, speed]);

  useEffect(() => { window.simTimeOffset = timeOffset; }, [timeOffset]);

  /* ── backend sync ──────────────────────────────────────── */
  useEffect(() => {
    const now = Date.now();
    if (now - lastFetchTime.current < 150 && isPlaying) return;
    lastFetchTime.current = now;

    fetch(`http://localhost:8000/api/state?t=${timeOffset}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => {
        setDebris(data.debris);
        setSatellites(prev => prev.map(s => {
          const st = data.satellites.find(ds => ds.name === s.name);
          return st ? { ...s, ...st } : s;
        }));
      })
      .catch(() => {
        const mockDebris = [];
        for (let i = 1; i <= 150; i++) {
          const orbitType = i <= 100 ? "LEO" : (i <= 130 ? "MEO" : "GEO");
          const radius    = orbitType === "LEO" ? 7000 + i * 5 : (orbitType === "MEO" ? 22000 + i * 20 : 42164);
          const phase     = (i * 15 + timeOffset * 0.02) * (Math.PI / 180);
          mockDebris.push({ name:`DEBRIS-${10000+i}`, orbit_type:orbitType,
            status: i%15===0?"CRITICAL":(i%10===0?"HIGH":(i%5===0?"MEDIUM":"SAFE")),
            x: radius * Math.cos(phase),
            y: radius * Math.sin(phase) * Math.cos(i * 0.1),
            z: radius * Math.sin(phase) * Math.sin(i * 0.1)
          });
        }
        setDebris(mockDebris);
        setSatellites(prev => {
          if (prev.length > 0) return prev;
          return [
            { name:"ISS (ZARYA)",   operator:"NASA",   orbit_type:"LEO",   a:6791,  e:0.0005, i_deg:51.6, launch_date:"20 Nov 1998", status:"OPERATIONAL", fuel_status:90  },
            { name:"STARLINK-4217", operator:"SpaceX", orbit_type:"LEO",   a:6921,  e:0.0001, i_deg:53.0, launch_date:"12 May 2024", status:"OPERATIONAL", fuel_status:78  },
            { name:"HUBBLE",        operator:"NASA",   orbit_type:"LEO",   a:6911,  e:0.0008, i_deg:28.5, launch_date:"24 Apr 1990", status:"OPERATIONAL", fuel_status:85  },
            { name:"METEOR-M2",     operator:"Russia", orbit_type:"LEO",   a:6691,  e:0.001,  i_deg:98.7, launch_date:"08 Jul 2014", status:"OPERATIONAL", fuel_status:62  },
            { name:"GPS IIF-11",    operator:"USAF",   orbit_type:"MEO",   a:26560, e:0.008,  i_deg:55.0, launch_date:"31 Oct 2015", status:"OPERATIONAL", fuel_status:71  },
            { name:"GALILEO-02",    operator:"ESA",    orbit_type:"MEO",   a:29600, e:0.002,  i_deg:56.0, launch_date:"12 Oct 2011", status:"OPERATIONAL", fuel_status:80  },
            { name:"INSAT-3DR",     operator:"ISRO",   orbit_type:"GEO",   a:42164, e:0.0003, i_deg:0.1,  launch_date:"08 Sep 2016", status:"OPERATIONAL", fuel_status:78  },
            { name:"GOES-16",       operator:"NOAA",   orbit_type:"GEO",   a:42164, e:0.0001, i_deg:0.05, launch_date:"19 Nov 2016", status:"OPERATIONAL", fuel_status:85  },
            { name:"LANDSAT-9",     operator:"NASA",   orbit_type:"Polar", a:7078,  e:0.0001, i_deg:98.2, launch_date:"27 Sep 2021", status:"OPERATIONAL", fuel_status:88  },
            { name:"CRYOSAT-2",     operator:"ESA",    orbit_type:"Polar", a:7100,  e:0.001,  i_deg:92.0, launch_date:"08 Apr 2010", status:"OPERATIONAL", fuel_status:74  },
            { name:"SENTINEL-6",    operator:"ESA",    orbit_type:"SSO",   a:7714,  e:0.0007, i_deg:66.0, launch_date:"21 Nov 2020", status:"OPERATIONAL", fuel_status:82  },
            { name:"AQUA",          operator:"NASA",   orbit_type:"SSO",   a:7078,  e:0.0001, i_deg:98.2, launch_date:"04 May 2002", status:"OPERATIONAL", fuel_status:69  },
          ].map((s) => ({
            ...s,
            altitude: s.a - 6371,
            velocity: Math.sqrt(398600.44 / s.a)
          }));
        });
      });

    fetch(`http://localhost:8000/api/predictions?t=${timeOffset}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => setPredictions(d))
      .catch(() => {
        const t_e = 12060, dt = timeOffset - t_e;
        const dist = Math.sqrt(Math.pow(4.32,2) + Math.pow(dt*14.2/3600,2));
        const prob = Math.round(92 / (1 + Math.pow(dt/1000,2)));
        setPredictions([{
          satellite:"STARLINK-4217", debris:"DEBRIS-10023",
          probability:`${prob}%`,
          risk_level: prob>80?"HIGH":(prob>30?"MEDIUM":"SAFE"),
          time_to_encounter:`${Math.max(0,Math.floor((t_e-timeOffset)/3600))}h : ${Math.max(0,Math.floor(((t_e-timeOffset)%3600)/60))}m : ${Math.max(0,Math.floor((t_e-timeOffset)%60))}s`,
          closest_approach_km:`${dist.toFixed(2)} km`,
          relative_velocity_kms:"14.2 km/s",
          recommended_action: timeOffset < t_e ? "Increase orbit by +2.4 km" : "Maneuver Completed",
          fuel_required_kg:"0.21 kg", risk_reduction:"92% → 0.4%"
        }]);
      });
  }, [timeOffset, isPlaying, speed]);

  /* ── satellite selection ───────────────────────────────── */
  const handleSelectSat = useCallback((sat) => {
    setSelectedSat(sat);
    if (sat) {
      setCameraMode(sat.orbit_type === "DEBRIS" ? "global" : "tracking");
      if (isMobile) setShowMobileRight(true);
    } else {
      setCameraMode("global");
      setShowMobileRight(false);
    }
  }, [isMobile]);

  /* ── ESC key to deselect ────────────────────────────────── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && selectedSat) {
        handleSelectSat(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedSat, handleSelectSat]);

  useEffect(() => {
    if (selectedSat) {
      const updated = satellites.find(s => s.name === selectedSat.name) ||
                      debris.find(d => d.name === selectedSat.name);
      if (updated) setSelectedSat(updated);
    }
  }, [satellites, debris]);

  /* ── maneuver ──────────────────────────────────────────── */
  const handleExecuteManeuver = (satName) => {
    setIsManeuvering(true); setThrusterActive(true);
    fetch(`http://localhost:8000/api/maneuver/execute?satellite_name=${encodeURIComponent(satName)}`, { method:"POST" })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => {
        setIsManeuvering(false);
        if (data.success) {
          setSatellites(prev => prev.map(s => s.name===satName ? { ...s, a:s.a+2.4, fuel_status:data.remaining_fuel, status:"OPERATIONAL" } : s));
          setPredictions([]);
          setTimeout(() => setThrusterActive(false), 3500);
        } else { setThrusterActive(false); }
      })
      .catch(() => {
        setTimeout(() => {
          setIsManeuvering(false);
          setSatellites(prev => prev.map(s => s.name===satName ? { ...s, a:s.a+2.4, fuel_status:Math.max(0,s.fuel_status-22), status:"OPERATIONAL" } : s));
          setPredictions([]);
          setTimeout(() => setThrusterActive(false), 3500);
        }, 1200);
      });
  };

  const handleDeploySat = (newSat) => {
    const mu = 398600.4418;
    const a = newSat.a;
    const velocity = Math.sqrt(mu / a);
    const altitude = a - 6371;

    const satObj = {
      ...newSat,
      altitude,
      velocity,
      fuel_status: 100,
      status: "OPERATIONAL"
    };

    setSatellites(prev => [satObj, ...prev]);

    setAnalytics(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        satellites_count: prev.satellites_count + 1
      };
    });

    setLaunchNotification(`NOMINAL ORBIT INSERTION: ${newSat.name} DEPLOYED SUCCESSFULLY.`);
    setTimeout(() => setLaunchNotification(null), 5000);

    setSelectedSat(satObj);
    setCameraMode("tracking");
    setActiveTab("satellites");
  };

  const activeHazard = predictions.find(p => p.satellite===selectedSat?.name && p.recommended_action!=="Maneuver Completed");

  const stats = [
    { label:"Active Satellites",    value: analytics?.satellites_count?.toLocaleString() || "12,542", delta:"▲ 24",  dc:"#10b981" },
    { label:"Tracked Debris",       value: analytics?.debris_count?.toLocaleString()     || "43,218", delta:"▲ 112", dc:"#10b981" },
    { label:"High Risk Encounters", value: analytics?.high_risk_encounters               || "7",      delta:"▲ 2",   dc:"#ef4444" },
    { label:"Critical Alerts",      value: analytics?.critical_alerts                    || "3",      delta:"▲ 1",   dc:"#ef4444" },
  ];

  /* ── sidebar / right panel widths ─────────────────────── */
  const sidebarW = isSidebarCollapsed ? 48 : 210;
  const panelW   = isRightPanelCollapsed ? 0 : (isTablet ? 270 : 320);

  /* ============================================================
     RENDER
     ============================================================ */
  return (
    <div
      className={scanlineActive ? "crt-screen" : ""}
      style={{
        width:"100vw", height:"100vh",
        background:"#020410", color:"#e2e8f0",
        fontFamily:"'Inter', sans-serif",
        overflow:"hidden", position:"relative",
        userSelect:"none"
      }}
    >
      {/* Moving scanline bar for CRT screen mode */}
      {scanlineActive && <div className="crt-scanline-bar" />}

      {/* Cyber grid overlay */}
      <div className="cyber-grid" style={{ position:"absolute", inset:0, opacity:0.09, pointerEvents:"none", zIndex:0 }} />

      {/* ── 3D CANVAS (fullscreen behind everything) ── */}
      <div style={{ position:"absolute", inset:0, zIndex:1 }}>
        <SpaceCanvas
          satellites={satellites} debris={debris}
          selectedSat={selectedSat} onSelectSat={handleSelectSat}
          predictions={predictions} cameraMode={cameraMode}
          thrusterActive={thrusterActive}
          showOrbits={showOrbits} showDebris={showDebris}
          showSpaceWeather={showSpaceWeather} showHeatmap={showHeatmap}
          showLEO={showLEO} showMEO={showMEO} showGEO={showGEO}
          showPolar={showPolar} showSSO={showSSO}
          selectedSatName={selectedSat?.name}
        />
      </div>

      {/* Mobile drawer backdrops */}
      {isMobile && showMobileLeft  && <div className="drawer-backdrop" style={{zIndex:40}} onClick={() => setShowMobileLeft(false)}  />}
      {isMobile && showMobileRight && <div className="drawer-backdrop" style={{zIndex:40}} onClick={() => setShowMobileRight(false)} />}

      {/* ── HUD OVERLAY ── */}
      <div style={{
        position:"absolute", inset:0, zIndex:10,
        display:"flex", flexDirection:"column",
        padding: isMobile ? "6px" : "8px",
        gap: isMobile ? 4 : 6,
        pointerEvents:"none"
      }}>

        {/* ── TOP HEADER ── */}
        <header className="glass-panel" style={{
          height: isMobile ? 44 : 48,
          borderRadius:8,
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding: isMobile ? "0 10px" : "0 14px",
          pointerEvents:"auto", flexShrink:0,
          border:"1px solid rgba(14,165,233,0.18)",
          boxShadow:"0 0 20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)",
          position:"relative", overflow:"hidden"
        }}>
          {/* Animated top edge line */}
          <div style={{ position:"absolute", top:0, left:0, right:0, height:"1px", background:"linear-gradient(90deg, transparent 0%, rgba(14,165,233,0.6) 30%, rgba(6,182,212,0.8) 50%, rgba(14,165,233,0.6) 70%, transparent 100%)" }} />

          {/* Left: Logo + mobile menu */}
          <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
            {isMobile && (
              <button onClick={() => setShowMobileLeft(v => !v)}
                style={{ background:"none", border:"none", cursor:"pointer", color:"#0ea5e9", padding:4 }}>
                <Menu style={{ width:16, height:16 }} />
              </button>
            )}
            <div style={{ width:28, height:28, borderRadius:6, background:"rgba(14,165,233,0.12)", border:"1px solid rgba(14,165,233,0.4)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 0 12px rgba(14,165,233,0.2)" }}>
              <Shield style={{ width:14, height:14, color:"#0ea5e9" }} />
            </div>
            {!isMobile && (
              <div>
                <div style={{ fontSize:12, fontWeight:900, letterSpacing:"0.12em", color:"#fff", fontFamily:"'Rajdhani',sans-serif", display:"flex", alignItems:"center", gap:4 }}>
                  <span>ORBITAL</span>
                  <span style={{ color:"#0ea5e9", textShadow:"0 0 12px rgba(14,165,233,0.8)" }}>GUARD</span>
                  <span style={{ fontSize:7, fontWeight:700, padding:"1px 4px", background:"rgba(14,165,233,0.15)", border:"1px solid rgba(14,165,233,0.4)", borderRadius:3, color:"#0ea5e9", fontFamily:"'Share Tech Mono',monospace", letterSpacing:"0.1em" }}>AI</span>
                </div>
                <div style={{ fontSize:7, color:"#475569", letterSpacing:"0.18em", textTransform:"uppercase", fontFamily:"'Rajdhani',sans-serif", fontWeight:500 }}>
                  Space Operations Command Center
                </div>
              </div>
            )}
            {isMobile && (
              <div style={{ fontSize:11, fontWeight:900, letterSpacing:"0.1em", color:"#fff", fontFamily:"'Rajdhani',sans-serif" }}>
                ORBITAL<span style={{ color:"#0ea5e9" }}>GUARD</span>
              </div>
            )}
          </div>

          {/* Center: Stats (hidden on mobile) */}
          {!isMobile && (
            <div style={{ display:"flex", gap: isTablet ? 18 : 28, alignItems:"center" }}>
              {stats.map((s) => (
                <div key={s.label} style={{ textAlign:"center" }}>
                  <div style={{ fontSize:7, color:"#475569", textTransform:"uppercase", letterSpacing:"0.12em", fontFamily:"'Rajdhani',sans-serif", fontWeight:500, marginBottom:2 }}>{s.label}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:4, justifyContent:"center" }}>
                    <span style={{ fontSize:13, fontWeight:800, color:"#fff", fontFamily:"'Rajdhani',sans-serif" }}>{s.value}</span>
                    <span style={{ fontSize:8, fontWeight:700, color:s.dc, fontFamily:"'Share Tech Mono',monospace" }}>{s.delta}</span>
                  </div>
                </div>
              ))}
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:7, color:"#475569", textTransform:"uppercase", letterSpacing:"0.12em", fontFamily:"'Rajdhani',sans-serif", fontWeight:500, marginBottom:2 }}>System Status</div>
                <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <Radio style={{ width:10, height:10, color:"#10b981", animation:"pulse-slow 2s ease-in-out infinite" }} />
                  <span style={{ fontSize:10, fontWeight:700, color:"#10b981", fontFamily:"'Rajdhani',sans-serif", letterSpacing:"0.08em", textShadow:"0 0 8px rgba(16,185,129,0.6)" }}>OPERATIONAL</span>
                  <span style={{ fontSize:8, color:"#475569", fontFamily:"'Share Tech Mono',monospace" }}>100%</span>
                </div>
              </div>
            </div>
          )}

          {/* Right: Time + icons */}
          <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
            {!isMobile && (
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#fff", fontFamily:"'Share Tech Mono',monospace", letterSpacing:"0.06em" }}>{utcTime}</div>
                <div style={{ fontSize:7.5, color:"#475569", fontFamily:"'Rajdhani',sans-serif", fontWeight:500, letterSpacing:"0.1em", textTransform:"uppercase" }}>{utcDate}</div>
              </div>
            )}
            {isMobile && (
              <div style={{ fontSize:9, color:"#e2e8f0", fontFamily:"'Share Tech Mono',monospace" }}>{utcTime}</div>
            )}
            <div style={{ display:"flex", gap:6, paddingLeft: isMobile ? 0 : 10, borderLeft: isMobile ? "none" : "1px solid rgba(14,165,233,0.2)", alignItems:"center" }}>
              {[
                { Icon:RadioTower, title:"Antenna Link" },
                { Icon:Globe,      title:"Coordinate Frame" },
                { Icon:Settings,   title:"Console Options" },
              ].map(({ Icon, title }) => (
                <button key={title} title={title} style={{ background:"none", border:"none", cursor:"pointer", color:"#475569", padding:3, borderRadius:4, transition:"color 0.15s ease", pointerEvents:"auto" }}
                  onMouseEnter={e => e.currentTarget.style.color="#0ea5e9"}
                  onMouseLeave={e => e.currentTarget.style.color="#475569"}>
                  <Icon style={{ width:13, height:13 }} />
                </button>
              ))}
              <button
                title="Toggle CRT Screen Scanlines"
                onClick={() => setScanlineActive(v => !v)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: scanlineActive ? "#0ea5e9" : "#475569",
                  padding: 3,
                  borderRadius: 4,
                  transition: "all 0.15s ease",
                  pointerEvents: "auto",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  filter: scanlineActive ? "drop-shadow(0 0 4px rgba(14,165,233,0.6))" : "none"
                }}
                onMouseEnter={e => { if (!scanlineActive) e.currentTarget.style.color = "#0ea5e9"; }}
                onMouseLeave={e => { if (!scanlineActive) e.currentTarget.style.color = "#475569"; }}
              >
                <Monitor style={{ width: 13, height: 13 }} />
              </button>
            </div>
          </div>
        </header>

        {/* ── TELEMETRY TICKER BAR (desktop only) ── */}
        {!isMobile && (
          <div style={{
            height: 20, flexShrink: 0,
            background: "rgba(4,8,26,0.75)",
            border: "1px solid rgba(14,165,233,0.12)",
            borderRadius: 4,
            display: "flex", alignItems: "center",
            overflow: "hidden",
            pointerEvents: "none",
            boxShadow: "0 2px 8px rgba(0,0,0,0.5)"
          }}>
            {/* Left badge */}
            <div style={{ flexShrink:0, padding:"0 10px", borderRight:"1px solid rgba(14,165,233,0.15)", display:"flex", alignItems:"center", gap:5, height:"100%", background:"rgba(14,165,233,0.06)" }}>
              <div style={{ width:4, height:4, borderRadius:"50%", background:"#10b981", boxShadow:"0 0 5px #10b981", animation:"pulse-slow 2s infinite" }} />
              <span style={{ fontSize:7.5, fontWeight:700, color:"#10b981", fontFamily:"'Rajdhani',sans-serif", letterSpacing:"0.12em" }}>LIVE</span>
            </div>
            {/* Scrolling content */}
            <div className="telemetry-marquee" style={{ flex:1 }}>
              <div className="telemetry-marquee-inner" style={{ fontSize:7.5, color:"#475569", fontFamily:"'Share Tech Mono',monospace", letterSpacing:"0.06em" }}>
                {[
                  { label:"SAT", value: analytics?.satellites_count?.toLocaleString() || "12,542", color:"#0ea5e9" },
                  { label:"DEBRIS", value: analytics?.debris_count?.toLocaleString() || "43,218", color:"#f97316" },
                  { label:"LEO", value: analytics?.orbit_distribution?.LEO?.toLocaleString() || "8,432", color:"#0ea5e9" },
                  { label:"MEO", value: analytics?.orbit_distribution?.MEO?.toLocaleString() || "1,728", color:"#f97316" },
                  { label:"GEO", value: analytics?.orbit_distribution?.GEO?.toLocaleString() || "2,382", color:"#06b6d4" },
                  { label:"KP-INDEX", value: analytics?.space_weather?.kp_index?.toFixed(1) || "3.2", color:"#eab308" },
                  { label:"SOLAR WIND", value: `${analytics?.space_weather?.solar_wind_kms || 412} km/s`, color:"#ef4444" },
                  { label:"HIGH RISK", value: analytics?.high_risk_encounters || "7", color:"#ef4444" },
                  { label:"LAUNCHES/MO", value: analytics?.launches_this_month?.total || "16", color:"#10b981" },
                  { label:"UTC", value: utcTime, color:"#94a3b8" },
                  { label:"STATUS", value: dbStatus, color: dbStatus === "LIVE" ? "#10b981" : "#eab308" },
                ].map((item, i) => (
                  <span key={i} style={{ marginRight:32 }}>
                    <span style={{ color:"#334155" }}>{item.label}: </span>
                    <span style={{ color: item.color, fontWeight:600 }}>{item.value}</span>
                  </span>
                ))}
                {/* Duplicate for seamless loop */}
                {[
                  { label:"SAT", value: analytics?.satellites_count?.toLocaleString() || "12,542", color:"#0ea5e9" },
                  { label:"DEBRIS", value: analytics?.debris_count?.toLocaleString() || "43,218", color:"#f97316" },
                  { label:"LEO", value: analytics?.orbit_distribution?.LEO?.toLocaleString() || "8,432", color:"#0ea5e9" },
                  { label:"MEO", value: analytics?.orbit_distribution?.MEO?.toLocaleString() || "1,728", color:"#f97316" },
                  { label:"GEO", value: analytics?.orbit_distribution?.GEO?.toLocaleString() || "2,382", color:"#06b6d4" },
                  { label:"KP-INDEX", value: analytics?.space_weather?.kp_index?.toFixed(1) || "3.2", color:"#eab308" },
                  { label:"SOLAR WIND", value: `${analytics?.space_weather?.solar_wind_kms || 412} km/s`, color:"#ef4444" },
                  { label:"HIGH RISK", value: analytics?.high_risk_encounters || "7", color:"#ef4444" },
                  { label:"LAUNCHES/MO", value: analytics?.launches_this_month?.total || "16", color:"#10b981" },
                  { label:"UTC", value: utcTime, color:"#94a3b8" },
                  { label:"STATUS", value: dbStatus, color: dbStatus === "LIVE" ? "#10b981" : "#eab308" },
                ].map((item, i) => (
                  <span key={`b-${i}`} style={{ marginRight:32 }}>
                    <span style={{ color:"#334155" }}>{item.label}: </span>
                    <span style={{ color: item.color, fontWeight:600 }}>{item.value}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── MIDDLE ROW ── */}
        <div style={{ flex:1, display:"flex", gap: isMobile ? 0 : 6, minHeight:0, pointerEvents:"none", position:"relative" }}>

          {/* ── LEFT SIDEBAR (desktop/tablet) ── */}
          {!isMobile && (
            <div style={{
              position:"relative", height:"100%", flexShrink:0, pointerEvents:"auto"
            }}>
              <div style={{
                width: sidebarW,
                minWidth: sidebarW,
                height:"100%",
                transition:"width 0.25s cubic-bezier(0.4,0,0.2,1), min-width 0.25s cubic-bezier(0.4,0,0.2,1)",
                overflow:"hidden"
              }}>
                <Sidebar
                  activeTab={activeTab} setActiveTab={setActiveTab}
                  onDeploySat={handleDeploySat}
                  alertCount={predictions.length > 0 && predictions[0].recommended_action !== "Maneuver Completed" ? 3 : 0}
                  showOrbits={showOrbits} setShowOrbits={setShowOrbits}
                  showDebris={showDebris} setShowDebris={setShowDebris}
                  showSpaceWeather={showSpaceWeather} setShowSpaceWeather={setShowSpaceWeather}
                  showHeatmap={showHeatmap} setShowHeatmap={setShowHeatmap}
                  showLEO={showLEO} setShowLEO={setShowLEO}
                  showMEO={showMEO} setShowMEO={setShowMEO}
                  showGEO={showGEO} setShowGEO={setShowGEO}
                  showPolar={showPolar} setShowPolar={setShowPolar}
                  showSSO={showSSO} setShowSSO={setShowSSO}
                  dbStatus={dbStatus} analyticsData={analytics} utcTime={utcTime}
                  satellites={satellites} onSelectSat={handleSelectSat} selectedSat={selectedSat}
                  isCollapsed={isSidebarCollapsed}
                />
              </div>
              {/* Collapse toggle */}
              <button onClick={() => setIsSidebarCollapsed(v => !v)} style={{
                position:"absolute", top:"50%", transform:"translateY(-50%)",
                right:-15, zIndex:20,
                width:15, height:48,
                background:"rgba(4,8,26,0.9)",
                border:"1px solid rgba(14,165,233,0.3)", borderLeft:"none",
                borderRadius:"0 4px 4px 0",
                color:"#0ea5e9", cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:9, fontWeight:700, fontFamily:"'Share Tech Mono',monospace"
              }}>
                {isSidebarCollapsed ? "»" : "«"}
              </button>
            </div>
          )}

          {/* CENTER transparent pass-through */}
          <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-start", pointerEvents:"none", position:"relative", gap: 8 }}>
            {/* Space Launch insertion banner */}
            {launchNotification && (
              <div style={{
                marginTop:10,
                display:"flex", alignItems:"center", gap:8,
                padding:"7px 18px",
                background:"rgba(16,185,129,0.92)",
                border:"1px solid rgba(16,185,129,0.65)",
                borderRadius:6,
                boxShadow:"0 0 20px rgba(16,185,129,0.45)",
                pointerEvents:"auto", cursor:"default"
              }}>
                <Radio style={{ width:12, height:12, color:"#fff", animation:"pulse-slow 0.8s ease-in-out infinite" }} />
                <span style={{ fontSize:9, fontWeight:800, color:"#fff", fontFamily:"'Rajdhani',sans-serif", letterSpacing:"0.12em", textTransform:"uppercase" }}>
                  {launchNotification}
                </span>
              </div>
            )}

            {/* Collision alarm banner */}
            {activeHazard && (
              <div style={{
                marginTop: launchNotification ? 0 : 10,
                display:"flex", alignItems:"center", gap:8,
                padding:"7px 18px",
                background:"rgba(60,4,4,0.92)",
                border:"1px solid rgba(239,68,68,0.65)",
                borderRadius:6,
                boxShadow:"0 0 20px rgba(239,68,68,0.45)",
                animation:"threat-pulse 1.5s ease-in-out infinite",
                pointerEvents:"auto", cursor:"default"
              }}>
                <AlertTriangle style={{ width:12, height:12, color:"#ef4444", animation:"pulse-slow 0.8s ease-in-out infinite" }} />
                <span style={{ fontSize:9, fontWeight:800, color:"#ef4444", fontFamily:"'Rajdhani',sans-serif", letterSpacing:"0.12em", textTransform:"uppercase" }}>
                  ⚠ Collision Vector Detected — Execute Avoidance Burn Immediately
                </span>
              </div>
            )}

            {/* Selected satellite quick HUD */}
            {selectedSat && !isMobile && (
              <div style={{
                marginTop: (launchNotification || activeHazard) ? 0 : 10,
                display:"flex", alignItems:"center", gap:6,
                padding:"5px 14px",
                background:"rgba(4,8,26,0.88)",
                border:"1px solid rgba(14,165,233,0.3)",
                borderRadius: 20,
                boxShadow:"0 0 12px rgba(14,165,233,0.15)",
                backdropFilter:"blur(12px)",
                pointerEvents:"auto",
                animation:"fade-in 0.2s ease forwards"
              }}>
                <span style={{ width:5, height:5, borderRadius:"50%", background:"#10b981", boxShadow:"0 0 6px #10b981", display:"inline-block", animation:"pulse-slow 1.5s infinite" }} />
                <span style={{ fontSize:9, fontWeight:700, color:"#e2e8f0", fontFamily:"'Rajdhani',sans-serif", letterSpacing:"0.1em" }}>
                  {selectedSat.name}
                </span>
                <span style={{ fontSize:8, color:"#475569", fontFamily:"'Share Tech Mono',monospace" }}>·</span>
                <span style={{ fontSize:8, color:"#0ea5e9", fontFamily:"'Share Tech Mono',monospace" }}>
                  {cameraMode.toUpperCase()}
                </span>
                <span style={{ fontSize:8, color:"#475569", fontFamily:"'Share Tech Mono',monospace" }}>·</span>
                <span style={{ fontSize:8, color:"#94a3b8", fontFamily:"'Share Tech Mono',monospace" }}>
                  ESC to deselect
                </span>
                <button
                  onClick={() => handleSelectSat(null)}
                  style={{ background:"none", border:"1px solid rgba(14,165,233,0.3)", borderRadius:3, color:"#0ea5e9", cursor:"pointer", padding:"1px 6px", fontSize:8, fontFamily:"'Rajdhani',sans-serif", fontWeight:700, letterSpacing:"0.08em", marginLeft:4 }}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(14,165,233,0.15)"}
                  onMouseLeave={e=>e.currentTarget.style.background="none"}
                >✕</button>
              </div>
            )}
          </div>

          {/* ── RIGHT PANEL (desktop/tablet) ── */}
          {!isMobile && (
            <div style={{
              position:"relative", height:"100%", flexShrink:0, pointerEvents:"auto"
            }}>
              <div style={{
                width: panelW,
                minWidth: isRightPanelCollapsed ? 0 : (isTablet ? 260 : 300),
                maxWidth: 380,
                height:"100%",
                transition:"width 0.25s cubic-bezier(0.4,0,0.2,1), min-width 0.25s cubic-bezier(0.4,0,0.2,1)",
                overflow:"hidden"
              }}>
                {!isRightPanelCollapsed && (
                  <RightPanel
                    selectedSat={selectedSat} setSelectedSat={handleSelectSat}
                    predictions={predictions} onExecuteManeuver={handleExecuteManeuver}
                    isManeuvering={isManeuvering} analyticsData={analytics}
                    cameraMode={cameraMode} setCameraMode={setCameraMode}
                    activeTab={activeTab} satellites={satellites} debris={debris}
                  />
                )}
              </div>
              {/* Collapse toggle */}
              <button onClick={() => setIsRightPanelCollapsed(v => !v)} style={{
                position:"absolute", top:"50%", transform:"translateY(-50%)",
                left:-15, zIndex:20,
                width:15, height:48,
                background:"rgba(4,8,26,0.9)",
                border:"1px solid rgba(14,165,233,0.3)", borderRight:"none",
                borderRadius:"4px 0 0 4px",
                color:"#0ea5e9", cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:9, fontWeight:700, fontFamily:"'Share Tech Mono',monospace"
              }}>
                {isRightPanelCollapsed ? "«" : "»"}
              </button>
            </div>
          )}
        </div>

        {/* ── BOTTOM PANEL ── */}
        <div style={{ pointerEvents:"auto", flexShrink:0 }}>
          <BottomPanel
            timeOffset={timeOffset} setTimeOffset={setTimeOffset}
            isPlaying={isPlaying} setIsPlaying={setIsPlaying}
            speed={speed} setSpeed={setSpeed}
            selectedSat={selectedSat} predictions={predictions}
            analyticsData={analytics} utcTime={utcTime}
            isMobile={isMobile} isTablet={isTablet}
          />
        </div>
      </div>

      {/* ============================================================
          MOBILE DRAWERS
          ============================================================ */}
      {isMobile && showMobileLeft && (
        <div className="drawer-left" style={{
          position:"fixed", top:0, left:0, bottom:0,
          width:"78vw", maxWidth:280,
          zIndex:50, pointerEvents:"auto"
        }}>
          <Sidebar
            activeTab={activeTab} setActiveTab={(tab) => { setActiveTab(tab); setShowMobileLeft(false); }}
            onDeploySat={handleDeploySat}
            alertCount={predictions.length > 0 && predictions[0].recommended_action !== "Maneuver Completed" ? 3 : 0}
            showOrbits={showOrbits} setShowOrbits={setShowOrbits}
            showDebris={showDebris} setShowDebris={setShowDebris}
            showSpaceWeather={showSpaceWeather} setShowSpaceWeather={setShowSpaceWeather}
            showHeatmap={showHeatmap} setShowHeatmap={setShowHeatmap}
            showLEO={showLEO} setShowLEO={setShowLEO}
            showMEO={showMEO} setShowMEO={setShowMEO}
            showGEO={showGEO} setShowGEO={setShowGEO}
            showPolar={showPolar} setShowPolar={setShowPolar}
            showSSO={showSSO} setShowSSO={setShowSSO}
            dbStatus={dbStatus} analyticsData={analytics} utcTime={utcTime}
            satellites={satellites} onSelectSat={(sat) => { handleSelectSat(sat); setShowMobileLeft(false); }}
            selectedSat={selectedSat}
            isCollapsed={false}
          />
        </div>
      )}

      {isMobile && showMobileRight && (
        <div className="drawer-up" style={{
          position:"fixed", left:0, right:0, bottom:0,
          height:"72vh", maxHeight:620,
          zIndex:50, pointerEvents:"auto",
          borderRadius:"16px 16px 0 0", overflow:"hidden"
        }}>
          {/* Drag handle */}
          <div style={{ display:"flex", justifyContent:"center", padding:"10px 0 4px", background:"rgba(4,8,26,0.95)", cursor:"pointer" }}
            onClick={() => setShowMobileRight(false)}>
            <div style={{ width:40, height:3, borderRadius:2, background:"rgba(14,165,233,0.4)" }} />
          </div>
          <div style={{ height:"calc(100% - 24px)", overflow:"hidden" }}>
            <RightPanel
              selectedSat={selectedSat} setSelectedSat={handleSelectSat}
              predictions={predictions} onExecuteManeuver={handleExecuteManeuver}
              isManeuvering={isManeuvering} analyticsData={analytics}
              cameraMode={cameraMode} setCameraMode={setCameraMode}
              activeTab={activeTab} satellites={satellites} debris={debris}
            />
          </div>
        </div>
      )}

      {/* ── MOBILE FLOATING CONTROLS ── */}
      {isMobile && (
        <div style={{
          position:"fixed", bottom:90, right:12,
          display:"flex", flexDirection:"column", gap:8,
          zIndex:30, pointerEvents:"auto"
        }}>
          {/* Satellite panel toggle */}
          <button
            className={`mobile-fab ${showMobileRight ? "active" : ""}`}
            onClick={() => setShowMobileRight(v => !v)}
            title="Satellite Info"
          >
            <Satellite style={{ width:16, height:16 }} />
          </button>
          {/* Layers toggle */}
          <button
            className={`mobile-fab ${showMobileLeft ? "active" : ""}`}
            onClick={() => setShowMobileLeft(v => !v)}
            title="Navigation"
          >
            <Layers style={{ width:16, height:16 }} />
          </button>
        </div>
      )}
    </div>
  );
}
