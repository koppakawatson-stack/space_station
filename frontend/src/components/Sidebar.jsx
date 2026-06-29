import React, { useState, useMemo } from "react";
import {
  LayoutDashboard, Satellite, Trash2, TrendingUp,
  BarChart3, Settings, ShieldAlert, FileText, Radio,
  Sun, Search, X, ChevronRight, Filter, Sparkles
} from "lucide-react";
import { soundService } from "../utils/soundService";

const ORBIT_COLORS = {
  LEO:   "#0ea5e9",
  MEO:   "#f97316",
  GEO:   "#06b6d4",
  Polar: "#e2e8f0",
  SSO:   "#eab308",
};

function OrbitDesigner({ onDeploySat }) {
  const [name, setName] = useState("SAT-USER-01");
  const [operator, setOperator] = useState("USER");
  const [orbitType, setOrbitType] = useState("LEO");
  const [altitude, setAltitude] = useState(650);
  const [inc, setInc] = useState(53.0);
  const [ecc, setEcc] = useState(0.0001);

  const handleTypeChange = (type) => {
    setOrbitType(type);
    if (type === "LEO") {
      setAltitude(650); setInc(53.0);
    } else if (type === "MEO") {
      setAltitude(20180); setInc(55.0);
    } else if (type === "GEO") {
      setAltitude(35786); setInc(0.1);
    } else if (type === "Polar") {
      setAltitude(830); setInc(98.7);
    } else if (type === "SSO") {
      setAltitude(800); setInc(98.6);
    }
  };

  const handleDeploy = () => {
    if (!name.trim()) return;
    const a = parseFloat(altitude) + 6371;
    onDeploySat({
      name: name.toUpperCase(),
      operator: operator || "USER",
      orbit_type: orbitType,
      a,
      e: parseFloat(ecc) || 0.0001,
      i_deg: parseFloat(inc) || 0,
      launch_date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      status: "OPERATIONAL",
      fuel_status: 100
    });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="hud-bracket mx-2 mt-2 mb-2 px-2.5 py-2.5 rounded-lg relative" style={{ background: "rgba(4,8,26,0.8)" }}>
        <div className="hud-corners-bottom" />
        <div className="section-header" style={{ fontSize: "9px", marginBottom: 10 }}>
          <Radio style={{ width: 10, height: 10, color: "#f97316" }} />
          Keplerian Orbit Designer
        </div>
        
        <div className="space-y-2.5 font-hud text-[9px] text-[#cbd5e1]">
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <label style={{ color: "#64748b", textTransform: "uppercase" }}>Satellite Identifier</label>
            <input
              className="sat-search-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. SAT-CUSTOM-01"
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <label style={{ color: "#64748b", textTransform: "uppercase" }}>Agency / Operator</label>
            <input
              className="sat-search-input"
              value={operator}
              onChange={e => setOperator(e.target.value)}
              placeholder="e.g. NASA, SpaceX"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <label style={{ color: "#64748b", textTransform: "uppercase" }}>Orbit Class</label>
              <select value={orbitType} onChange={e => handleTypeChange(e.target.value)} style={{ width: "100%" }}>
                <option value="LEO">LEO</option>
                <option value="MEO">MEO</option>
                <option value="GEO">GEO</option>
                <option value="Polar">Polar</option>
                <option value="SSO">SSO</option>
              </select>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <label style={{ color: "#64748b", textTransform: "uppercase" }}>Altitude (km)</label>
              <input
                className="sat-search-input"
                type="number"
                value={altitude}
                onChange={e => setAltitude(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <label style={{ color: "#64748b", textTransform: "uppercase" }}>Inclination (°)</label>
              <input
                className="sat-search-input"
                type="number"
                step="0.1"
                value={inc}
                onChange={e => setInc(e.target.value)}
              />
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <label style={{ color: "#64748b", textTransform: "uppercase" }}>Eccentricity (e)</label>
              <input
                className="sat-search-input"
                type="number"
                step="0.0001"
                value={ecc}
                onChange={e => setEcc(e.target.value)}
              />
            </div>
          </div>

          <button
            className="btn-execute"
            onClick={() => { handleDeploy(); soundService.playManeuver(); }}
            onMouseEnter={() => soundService.playHover()}
            style={{ marginTop: 6, borderColor: "#f97316", background: "linear-gradient(135deg, rgba(249,115,22,0.2), rgba(249,115,22,0.05))" }}
          >
            <Sparkles style={{ width: 11, height: 11 }} /> Inject to Orbit
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({
  activeTab, setActiveTab,
  onDeploySat,
  alertCount = 0,
  showOrbits, setShowOrbits,
  showDebris, setShowDebris,
  showSpaceWeather, setShowSpaceWeather,
  showHeatmap, setShowHeatmap,
  showLEO, setShowLEO,
  showMEO, setShowMEO,
  showGEO, setShowGEO,
  showPolar, setShowPolar,
  showSSO, setShowSSO,
  analyticsData,
  satellites = [],
  onSelectSat,
  selectedSat,
  isCollapsed = false,
}) {
  const [satSearch, setSatSearch]     = useState("");
  const [satFilter, setSatFilter]     = useState("ALL");

  const navItems = [
    { id:"dashboard",   label:"Dashboard",   icon:LayoutDashboard },
    { id:"satellites",  label:"Satellites",  icon:Satellite },
    { id:"debris",      label:"Debris",      icon:Trash2 },
    { id:"predictions", label:"Predictions", icon:TrendingUp },
    { id:"alerts",      label:"Alerts",      icon:ShieldAlert, badge:alertCount || 0 },
    { id:"analytics",   label:"Analytics",   icon:BarChart3 },
    { id:"simulation",  label:"Simulation",  icon:Radio },
    { id:"reports",     label:"Reports",     icon:FileText },
    { id:"settings",    label:"Settings",    icon:Settings },
  ];

  const orbitLayers = [
    { id:"leo",    label:"LEO (160–2,000km)",    color:"#0ea5e9", checked:showLEO,    onChange:()=>setShowLEO(!showLEO)    },
    { id:"meo",    label:"MEO (2k–35,786km)",    color:"#f97316", checked:showMEO,    onChange:()=>setShowMEO(!showMEO)    },
    { id:"geo",    label:"GEO (35,786km)",        color:"#06b6d4", checked:showGEO,    onChange:()=>setShowGEO(!showGEO)    },
    { id:"polar",  label:"Polar Orbit",           color:"#e2e8f0", checked:showPolar,  onChange:()=>setShowPolar(!showPolar) },
    { id:"sso",    label:"Sun-Synchronous",       color:"#eab308", checked:showSSO,    onChange:()=>setShowSSO(!showSSO)    },
    { id:"debris", label:"Debris",                color:"#ef4444", checked:showDebris, onChange:()=>setShowDebris(!showDebris) },
  ];

  const weather = analyticsData?.space_weather;

  const filteredSats = useMemo(() => {
    return satellites.filter(s => {
      const matchType  = satFilter === "ALL" || s.orbit_type === satFilter;
      const matchSearch = !satSearch.trim() || s.name.toLowerCase().includes(satSearch.toLowerCase());
      return matchType && matchSearch;
    });
  }, [satellites, satFilter, satSearch]);

  /* ── icon-only collapsed sidebar ─────────────────────────── */
  if (isCollapsed) {
    return (
      <aside className="w-full h-full glass-panel-premium rounded-lg flex flex-col items-center py-2 gap-1 select-none overflow-hidden relative" style={{ fontFamily:"'Rajdhani',sans-serif" }}>
        {/* Top accent */}
        <div style={{ position:"absolute", top:0, left:"10%", right:"10%", height:"2px", background:"linear-gradient(90deg, transparent, rgba(14,165,233,0.7) 50%, transparent)", borderRadius:"0 0 2px 2px" }} />
        {navItems.map(({ id, icon:Icon, badge }) => (
          <button
            key={id}
            className={`nav-btn-icon ${activeTab===id ? "active" : ""}`}
            onClick={() => { setActiveTab(id); soundService.playClick(); }}
            onMouseEnter={() => soundService.playHover()}
            title={id.charAt(0).toUpperCase()+id.slice(1)}
          >
            <Icon style={{ width:15, height:15 }} />
            {badge > 0 && (
              <span className="alert-badge-flash" style={{ position:"absolute", top:4, right:4, width:7, height:7, borderRadius:"50%", background:"#ef4444", boxShadow:"0 0 6px #ef4444, 0 0 12px rgba(239,68,68,0.5)" }} />
            )}
          </button>
        ))}
      </aside>
    );
  }

  /* ── full sidebar ─────────────────────────────────────────── */
  return (
    <aside className="w-full h-full glass-panel-premium rounded-lg flex flex-col select-none relative overflow-hidden" style={{ fontFamily:"'Rajdhani',sans-serif" }}>
      <div className="hud-corners-bottom rounded-lg" />

      {/* Premium top accent line */}
      <div style={{ position:"absolute", top:0, left:"8%", right:"8%", height:"2px", background:"linear-gradient(90deg, transparent, rgba(14,165,233,0.7) 30%, rgba(6,182,212,1.0) 50%, rgba(139,92,246,0.6) 70%, transparent)", borderRadius:"0 0 2px 2px", zIndex:2, pointerEvents:"none" }} />

      {/* Scanline overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{ background:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.035) 3px,rgba(0,0,0,0.035) 4px)" }} />

      {/* NAV MENU */}
      <nav className="p-2 space-y-0.5 flex-shrink-0">
        {navItems.map(({ id, label, icon:Icon, badge }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => { setActiveTab(id); soundService.playClick(); }}
              onMouseEnter={() => soundService.playHover()}
              className={`nav-btn ${isActive ? "active" : ""}`}
            >
              <Icon style={{ width:13, height:13, flexShrink:0, color:isActive ? "#38bdf8" : "#475569" }} />
              <span style={{ flex:1 }}>{label}</span>
              {badge > 0 && (
                <span className="alert-badge-flash" style={{ background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.65)", color:"#fca5a5", fontSize:"8px", fontWeight:700, padding:"1px 5px", borderRadius:"10px" }}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div style={{ height:"1px", background:"linear-gradient(90deg,transparent,rgba(14,165,233,0.2),transparent)", margin:"4px 12px", flexShrink:0 }} />

      {/* ── SATELLITE EXPLORER ── */}
      {activeTab === "satellites" ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Header */}
          <div className="hud-bracket mx-2 mt-2 px-2.5 py-2 rounded-lg flex-shrink-0 relative">
            <div className="hud-corners-bottom" />
            <div className="section-header" style={{ fontSize:"9px", marginBottom:8 }}>
              <Satellite style={{ width:10, height:10, color:"#0ea5e9" }} />
              Satellite Explorer
            </div>

            {/* Search */}
            <div style={{ position:"relative", marginBottom:8 }}>
              <Search style={{ position:"absolute", left:8, top:"50%", transform:"translateY(-50%)", width:10, height:10, color:"#475569", pointerEvents:"none" }} />
              <input
                className="sat-search-input"
                style={{ paddingLeft:24 }}
                placeholder="Search satellites..."
                value={satSearch}
                onChange={e => setSatSearch(e.target.value)}
              />
              {satSearch && (
                <button onClick={() => setSatSearch("")} style={{ position:"absolute", right:6, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#475569", padding:2 }}>
                  <X style={{ width:10, height:10 }} />
                </button>
              )}
            </div>

            {/* Filter chips */}
            <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
              {["ALL","LEO","MEO","GEO","Polar","SSO"].map(f => (
                <button
                  key={f}
                  className={`filter-chip ${satFilter===f ? "active" : ""}`}
                  style={{ ...(f !== "ALL" && ORBIT_COLORS[f] && satFilter===f ? { borderColor: ORBIT_COLORS[f], color: ORBIT_COLORS[f] } : {}) }}
                  onClick={() => { setSatFilter(f); soundService.playClick(); }}
                  onMouseEnter={() => soundService.playHover()}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Satellite list */}
          <div className="flex-1 overflow-y-auto px-2 pb-2 mt-2" style={{ minHeight:0 }}>
            {filteredSats.length === 0 ? (
              <div style={{ textAlign:"center", padding:"20px 0", color:"#475569", fontSize:"9px", fontFamily:"'Rajdhani',sans-serif" }}>
                No satellites found
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                {filteredSats.map(sat => {
                  const isActive = selectedSat?.name === sat.name;
                  const oc = ORBIT_COLORS[sat.orbit_type] || "#94a3b8";
                  const alt = (sat.altitude ?? (sat.a - 6371)).toFixed(0);
                  return (
                    <button
                      key={sat.name}
                      className={`sat-list-item ${isActive ? "active" : ""}`}
                      onClick={() => onSelectSat && onSelectSat(sat)}
                      onMouseEnter={() => soundService.playHover()}
                    >
                      {/* Orbit color dot */}
                      <span style={{ width:6, height:6, borderRadius:"50%", background:oc, boxShadow:`0 0 5px ${oc}`, flexShrink:0, display:"inline-block" }} />

                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:"9px", fontWeight:700, color: isActive ? "#fff" : "#cbd5e1", letterSpacing:"0.04em", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                          {sat.name}
                        </div>
                        <div style={{ fontSize:"7.5px", color:"#64748b", fontFamily:"'Share Tech Mono',monospace" }}>
                          {sat.orbit_type} · {alt} km
                        </div>
                      </div>

                      {/* Status indicator */}
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2, flexShrink:0 }}>
                        <span style={{ fontSize:"7px", fontWeight:700, color: sat.status==="OPERATIONAL" ? "#10b981" : "#eab308", fontFamily:"'Rajdhani',sans-serif", letterSpacing:"0.06em" }}>
                          {sat.status === "OPERATIONAL" ? "●" : "◉"}
                        </span>
                        <span style={{ fontSize:"7px", color:"#475569", fontFamily:"'Share Tech Mono',monospace" }}>
                          {(sat.fuel_status ?? 78).toFixed(0)}%
                        </span>
                      </div>

                      {isActive && <ChevronRight style={{ width:10, height:10, color:"#0ea5e9", flexShrink:0 }} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : activeTab === "simulation" ? (
        <OrbitDesigner onDeploySat={onDeploySat} />
      ) : (
        /* ── DEFAULT: ORBIT LAYERS + SPACE WEATHER ── */
        <div className="flex-1 flex flex-col overflow-y-auto min-h-0">

          {/* ORBIT LAYERS */}
          <div className="hud-bracket mx-2 mt-2 p-2.5 rounded-lg flex-shrink-0 relative">
            <div className="hud-corners-bottom" />
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
              <div className="section-header" style={{ marginBottom:0, paddingBottom:0, border:"none", fontSize:"9px" }}>
                Orbit Layers
              </div>
              <button
                onClick={() => setShowOrbits(!showOrbits)}
                style={{ display:"flex", alignItems:"center", gap:3, fontSize:"8px", color:showOrbits?"#0ea5e9":"#475569", background:"none", border:"none", cursor:"pointer", fontFamily:"'Rajdhani',sans-serif", fontWeight:600 }}
              >
                <X style={{ width:10, height:10 }} />
              </button>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {orbitLayers.map(layer => (
                <div key={layer.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ width:7, height:7, borderRadius:"50%", background:layer.color, boxShadow:`0 0 5px ${layer.color}`, flexShrink:0, display:"inline-block" }} />
                    <span style={{ fontSize:"8.5px", color:"#94a3b8", fontFamily:"'Rajdhani',sans-serif", fontWeight:500 }}>{layer.label}</span>
                  </div>
                  <input type="checkbox" className="orbit-toggle" checked={layer.checked} onChange={layer.onChange} />
                </div>
              ))}
            </div>

            {/* ALL LAYERS */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:8, paddingTop:6, borderTop:"1px solid rgba(14,165,233,0.1)" }}>
              <span style={{ fontSize:"8.5px", color:"#64748b", fontFamily:"'Rajdhani',sans-serif", fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase" }}>All Layers</span>
              <input
                type="checkbox"
                className="orbit-toggle"
                checked={showOrbits && showDebris && showLEO && showMEO && showGEO && showPolar && showSSO}
                onChange={() => {
                  const allOn = showOrbits && showDebris && showLEO && showMEO && showGEO && showPolar && showSSO;
                  setShowOrbits(!allOn); setShowDebris(!allOn);
                  setShowLEO(!allOn); setShowMEO(!allOn); setShowGEO(!allOn); setShowPolar(!allOn); setShowSSO(!allOn);
                }}
              />
            </div>
          </div>

          {/* SPACE WEATHER */}
          <div className="hud-bracket mx-2 mt-2 mb-2 p-2.5 rounded-lg flex-shrink-0 relative">
            <div className="hud-corners-bottom" />
            <div className="section-header" style={{ fontSize:"9px" }}>
              <Sun style={{ width:10, height:10, color:"#f97316" }} />
              Space Weather
            </div>

            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <div style={{ width:44, height:44, flexShrink:0, background:"radial-gradient(circle,rgba(249,115,22,0.25) 0%,rgba(249,115,22,0.05) 70%)", border:"1px solid rgba(249,115,22,0.3)", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", animation:"pulse-slow 3s ease-in-out infinite" }}>
                <Sun style={{ width:22, height:22, color:"#f97316" }} />
              </div>
              <div style={{ flex:1, display:"flex", flexDirection:"column", gap:3 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:"8px", color:"#64748b", fontFamily:"'Rajdhani',sans-serif", fontWeight:500, textTransform:"uppercase" }}>Solar Activity</span>
                  <span style={{ fontSize:"8px", color:"#f97316", fontWeight:700, fontFamily:"'Rajdhani',sans-serif" }}>Moderate</span>
                </div>
                <div>
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontSize:"8px", color:"#64748b", fontFamily:"'Share Tech Mono',monospace" }}>Kp INDEX</span>
                    <span style={{ fontSize:"9px", color:"#f97316", fontWeight:700, fontFamily:"'Share Tech Mono',monospace" }}>{weather?.kp_index || 3.2}</span>
                  </div>
                  <div style={{ height:3, background:"rgba(14,165,233,0.1)", borderRadius:2, overflow:"hidden", marginTop:2 }}>
                    <div style={{ height:"100%", width:`${((weather?.kp_index||3.2)/9)*100}%`, background:"linear-gradient(90deg,#10b981,#eab308,#ef4444)", borderRadius:2 }} />
                  </div>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ fontSize:"8px", color:"#64748b", fontFamily:"'Share Tech Mono',monospace" }}>Solar Wind</span>
                  <span style={{ fontSize:"8px", color:"#e2e8f0", fontFamily:"'Share Tech Mono',monospace" }}>{weather?.solar_wind_kms||412} km/s</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ fontSize:"8px", color:"#64748b", fontFamily:"'Share Tech Mono',monospace" }}>Density</span>
                  <span style={{ fontSize:"8px", color:"#e2e8f0", fontFamily:"'Share Tech Mono',monospace" }}>{weather?.density_p_cm3||5.1} p/cm³</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
