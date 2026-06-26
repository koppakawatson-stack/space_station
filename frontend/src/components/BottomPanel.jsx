import React, { useMemo } from "react";
import { Play, Pause, FastForward, Clock, RotateCcw, ChevronUp, ChevronDown } from "lucide-react";
import { soundService } from "../utils/soundService";

const TIME_PRESETS = [
  { label: "NOW", value: 0 },
  { label: "+1H", value: 3600 },
  { label: "+6H", value: 21600 },
  { label: "+24H", value: 86400 },
  { label: "+7D", value: 604800 },
  { label: "+30D", value: 2592000 },
  { label: "+1Y", value: 31536000 },
];

const ORBIT_LEGEND = [
  { label: "LEO", color: "#0ea5e9" },
  { label: "MEO", color: "#f97316" },
  { label: "GEO", color: "#06b6d4" },
  { label: "Polar", color: "#e2e8f0" },
  { label: "Sun-Synchronous", color: "#eab308" },
  { label: "Debris", color: "#ef4444", dashed: true },
  { label: "Predicted Path", color: "#94a3b8", dashed: true },
  { label: "Maneuver Path", color: "#10b981", dashed: true },
];

function getSecondsFromSlider(val) {
  if (val <= 0) return 0;
  if (val <= 16) return (val / 16) * 3600;
  if (val <= 32) return 3600 + ((val - 16) / 16) * (21600 - 3600);
  if (val <= 48) return 21600 + ((val - 32) / 16) * (86400 - 21600);
  if (val <= 64) return 86400 + ((val - 48) / 16) * (604800 - 86400);
  if (val <= 80) return 604800 + ((val - 64) / 16) * (2592000 - 604800);
  return 2592000 + ((val - 80) / 20) * (31536000 - 2592000);
}

function getSliderFromSeconds(sec) {
  if (sec <= 0) return 0;
  if (sec <= 3600) return (sec / 3600) * 16;
  if (sec <= 21600) return 16 + ((sec - 3600) / (21600 - 3600)) * 16;
  if (sec <= 86400) return 32 + ((sec - 21600) / (86400 - 21600)) * 16;
  if (sec <= 604800) return 48 + ((sec - 86400) / (604800 - 86400)) * 16;
  if (sec <= 2592000) return 64 + ((sec - 604800) / (2592000 - 604800)) * 16;
  return 80 + ((sec - 2592000) / (31536000 - 2592000)) * 20;
}

export default function BottomPanel({
  timeOffset,
  setTimeOffset,
  isPlaying,
  setIsPlaying,
  speed,
  setSpeed,
  selectedSat,
  predictions = [],
  analyticsData,
  utcTime,
  isMobile = false,
  isTablet = false,
}) {
  const sliderVal = getSliderFromSeconds(timeOffset);

  const formattedSimTime = useMemo(() => {
    const epoch = new Date();
    epoch.setSeconds(epoch.getSeconds() + timeOffset);
    const h = String(epoch.getUTCHours()).padStart(2, "0");
    const m = String(epoch.getUTCMinutes()).padStart(2, "0");
    const s = String(epoch.getUTCSeconds()).padStart(2, "0");
    return `${h}:${m}:${s} UTC`;
  }, [timeOffset]);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap: isMobile ? 3 : 5, fontFamily:"'Rajdhani', sans-serif" }}>
      
      {/* ── TIME CONTROLS FLOATING PILL ── */}
      <div className="glass-panel hud-bracket rounded-lg" style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px",
        position: "relative"
      }}>
        <div className="hud-corners-bottom" />

        {/* Label */}
        <span style={{ fontSize: "9px", color: "#475569", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
          Time Controls
        </span>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: "rgba(14,165,233,0.2)", flexShrink: 0 }} />

        {/* Play/Pause */}
        <button
          onClick={() => { setIsPlaying(!isPlaying); soundService.playClick(); }}
          style={{
            width: 26, height: 26, borderRadius: 4,
            background: "rgba(14,165,233,0.12)", border: "1px solid rgba(14,165,233,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "#0ea5e9", flexShrink: 0,
            transition: "all 0.15s ease"
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(14,165,233,0.25)"; soundService.playHover(); }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(14,165,233,0.12)"; }}
        >
          {isPlaying
            ? <Pause style={{ width: 12, height: 12, fill: "#0ea5e9" }} />
            : <Play style={{ width: 12, height: 12, fill: "#0ea5e9", marginLeft: 1 }} />}
        </button>

        {/* Forward */}
        <button
          onClick={() => { setTimeOffset(prev => prev + 3600); soundService.playClick(); }}
          style={{
            width: 26, height: 26, borderRadius: 4,
            background: "rgba(14,165,233,0.06)", border: "1px solid rgba(30,41,67,0.8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "#64748b", flexShrink: 0,
            transition: "all 0.15s ease"
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(14,165,233,0.12)"; e.currentTarget.style.color = "#0ea5e9"; soundService.playHover(); }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(14,165,233,0.06)"; e.currentTarget.style.color = "#64748b"; }}
          title="Forward 1 Hour"
        >
          <FastForward style={{ width: 12, height: 12 }} />
        </button>

        {/* Reset */}
        <button
          onClick={() => { setTimeOffset(0); soundService.playClick(); }}
          style={{
            width: 26, height: 26, borderRadius: 4,
            background: "rgba(14,165,233,0.06)", border: "1px solid rgba(30,41,67,0.8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "#64748b", flexShrink: 0,
            transition: "all 0.15s ease"
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(14,165,233,0.12)"; e.currentTarget.style.color = "#0ea5e9"; soundService.playHover(); }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(14,165,233,0.06)"; e.currentTarget.style.color = "#64748b"; }}
          title="Reset to Now"
        >
          <RotateCcw style={{ width: 11, height: 11 }} />
        </button>

        {/* Speed */}
        <select
          value={speed}
          onChange={e => { setSpeed(Number(e.target.value)); soundService.playClick(); }}
          onMouseEnter={() => soundService.playHover()}
          style={{ flexShrink: 0 }}
        >
          <option value={1}>1x</option>
          <option value={10}>10x</option>
          <option value={60}>60x</option>
          <option value={600}>600x</option>
          <option value={3600}>3600x</option>
        </select>

        {/* Divider */}
        {!isMobile && <div style={{ width:1, height:20, background:"rgba(14,165,233,0.2)", flexShrink:0 }} />}

        {/* Slider — hidden on mobile */}
        {!isMobile && (
          <div className="bottom-slider-wrap" style={{ flex:1, display:"flex", alignItems:"center", padding:"0 4px" }}>
            <input type="range" min="0" max="100" value={sliderVal} onChange={e=>{setTimeOffset(getSecondsFromSlider(Number(e.target.value))); soundService.playClick();}} style={{ width:"100%" }}/>
          </div>
        )}

        {/* Preset buttons — hidden on mobile */}
        {!isMobile && (
          <div className="bottom-presets" style={{ display:"flex", gap:3, flexShrink:0 }}>
            {TIME_PRESETS.map(preset => {
              const active = Math.abs(timeOffset - preset.value) < 10;
              return (
                <button key={preset.label} onClick={() => { setTimeOffset(preset.value); soundService.playClick(); }}
                  style={{ fontSize:"8px", fontWeight:700, padding:"3px 6px", borderRadius:3, cursor:"pointer", letterSpacing:"0.05em", fontFamily:"'Share Tech Mono',monospace", transition:"all 0.15s ease", border:`1px solid ${active?"rgba(14,165,233,0.7)":"rgba(30,41,67,0.8)"}`, background:active?"rgba(14,165,233,0.2)":"rgba(4,8,26,0.6)", color:active?"#fff":"#64748b", boxShadow:active?"0 0 8px rgba(14,165,233,0.3)":"none" }}
                  onMouseEnter={e=>{soundService.playHover(); if(!active){e.currentTarget.style.color="#94a3b8";e.currentTarget.style.borderColor="rgba(14,165,233,0.3)";}}} 
                  onMouseLeave={e=>{if(!active){e.currentTarget.style.color="#64748b";e.currentTarget.style.borderColor="rgba(30,41,67,0.8)";}}}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: "rgba(14,165,233,0.2)", flexShrink: 0 }} />

        {/* Clock */}
        <div style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "3px 10px", borderRadius: 4,
          background: "rgba(4,8,26,0.6)", border: "1px solid rgba(14,165,233,0.2)",
          flexShrink: 0
        }}>
          <Clock style={{ width: 11, height: 11, color: "#0ea5e9", animation: "pulse-slow 2s ease-in-out infinite" }} />
          <span style={{ fontSize: "9px", color: "#e2e8f0", fontFamily: "'Share Tech Mono',monospace", whiteSpace: "nowrap" }}>
            {formattedSimTime}
          </span>
        </div>
      </div>

      {/* ── ORBIT LEGEND BAR (hidden on mobile and tablet) ── */}
      {!(isMobile || isTablet) && (
        <div className="bottom-legend-bar" style={{ display:"flex", alignItems:"center", justifyContent:"center", flexWrap:"wrap", gap:"6px 14px", padding:"4px 12px", background:"rgba(4,8,26,0.5)", border:"1px solid rgba(14,165,233,0.08)", borderRadius:6, backdropFilter:"blur(8px)" }}>
          <span style={{ fontSize:"8px", color:"#475569", fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", flexShrink:0 }}>Orbit Legend:</span>
          {ORBIT_LEGEND.map(item => (
            <div key={item.label} style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
              {item.dashed ? (
                <svg width="18" height="4"><line x1="0" y1="2" x2="18" y2="2" stroke={item.color} strokeWidth="1.5" strokeDasharray="3,2"/></svg>
              ) : (
                <span className="legend-dot" style={{ background:item.color, boxShadow:`0 0 4px ${item.color}` }}/>
              )}
              <span className="legend-label-text" style={{ fontSize:"8px", color:"#64748b", fontFamily:"'Rajdhani',sans-serif", fontWeight:500 }}>{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
