import React, { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import { EffectComposer, Bloom, ChromaticAberration, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";

// Scale configurations (1 unit = 1000 km)
const EARTH_RADIUS = 6.371;
const MU = 398600.4418; // Earth Gravitational Parameter

// Colors matching orbital layer requirements
const getOrbitColor = (type) => {
  if (type === "LEO") return "#0ea5e9";
  if (type === "MEO") return "#f97316";
  if (type === "GEO") return "#06b6d4";
  if (type === "Polar") return "#ffffff";
  if (type === "SSO") return "#eab308";
  return "#94a3b8";
};

// ============================================================
// ULTRA-REALISTIC EARTH SURFACE SHADER (Day/Night/Specular)
// ============================================================
const EarthShaderMaterial = {
  uniforms: {
    dayTexture: { value: null },
    nightTexture: { value: null },
    cloudsTexture: { value: null },
    specularTexture: { value: null },
    normalTexture: { value: null },
    sunDirection: { value: new THREE.Vector3(1.2, 0.2, 0.6).normalize() },
    time: { value: 0 },
    cloudsRotation: { value: 0 }
  },
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vLocalPos;
    varying vec3 vWorldNormal;
    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
      vLocalPos = position;
      vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D dayTexture;
    uniform sampler2D nightTexture;
    uniform sampler2D cloudsTexture;
    uniform sampler2D specularTexture;
    uniform sampler2D normalTexture;
    uniform vec3 sunDirection;
    uniform float time;
    uniform float cloudsRotation;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vLocalPos;
    varying vec3 vWorldNormal;

    void main() {
      vec3 normal = normalize(vNormal);
      vec3 sunDir = normalize(sunDirection);

      // Compute tangent and bitangent analytically for normal mapping
      vec3 tangent = normalize(vec3(-normal.z, 0.0, normal.x));
      vec3 bitangent = cross(normal, tangent);
      vec3 mapNormal = texture2D(normalTexture, vUv).rgb * 2.0 - 1.0;
      vec3 perturbedNormal = normalize(tangent * mapNormal.x * 0.85 + bitangent * mapNormal.y * 0.85 + normal * 1.0);

      float intensity = dot(perturbedNormal, sunDir);

      vec4 dayColor = texture2D(dayTexture, vUv);
      vec4 nightColor = texture2D(nightTexture, vUv);
      float specMask = texture2D(specularTexture, vUv).r;

      // Ocean mask: water has higher blue channel
      float waterMask = clamp(dayColor.b * 1.8 - dayColor.r * 0.9 - dayColor.g * 0.3, 0.0, 1.0);

      // Dynamic clouds with parallax offset
      float uOffset = cloudsRotation / (2.0 * 3.14159265);
      vec2 cloudUv = vec2(fract(vUv.x - uOffset), vUv.y);
      float cloudAlpha = texture2D(cloudsTexture, cloudUv).r;
      
      // Cloud shadow
      vec2 shadowUv = vec2(fract(cloudUv.x + sunDir.x * 0.014), cloudUv.y + sunDir.y * 0.014);
      float shadowAlpha = texture2D(cloudsTexture, shadowUv).r;
      float shadowMult = mix(1.0, 0.38, shadowAlpha * smoothstep(0.0, 0.3, intensity));
      dayColor.rgb *= shadowMult;

      // Blend clouds on day side
      float cloudWhite = cloudAlpha * smoothstep(-0.05, 0.15, intensity);
      vec3 cloudColor = vec3(0.92, 0.94, 1.0);
      dayColor.rgb = mix(dayColor.rgb, cloudColor, cloudWhite * 0.88);

      // Smooth terminator with soft falloff (realistic penumbra)
      float blend = smoothstep(-0.08, 0.15, intensity);
      vec4 finalColor = mix(nightColor * 2.8, dayColor, blend);

      // Terminator orange sunset glow
      float sunsetGlow = smoothstep(0.12, 0.0, abs(intensity - 0.05));
      finalColor.rgb = mix(finalColor.rgb, vec3(1.0, 0.38, 0.12) * 0.65, sunsetGlow * 0.45);

      // Specular reflections from ocean (Phong)
      if (intensity > 0.05) {
        vec3 viewDir = normalize(-vPosition);
        vec3 halfDir = normalize(sunDir + viewDir);
        float specAngle = max(dot(perturbedNormal, halfDir), 0.0);
        float specFactor = pow(specAngle, 80.0) * specMask * waterMask;
        float specFactor2 = pow(specAngle, 20.0) * specMask * waterMask * 0.12;
        vec3 specColor = vec3(0.75, 0.92, 1.0) * specFactor * 2.8;
        vec3 specColor2 = vec3(1.0, 0.98, 0.92) * specFactor2;
        finalColor.rgb += (specColor + specColor2) * smoothstep(0.0, 0.18, intensity);
      }

      gl_FragColor = vec4(finalColor.rgb, 1.0);
    }
  `
};

const AtmosphereShaderMaterial = {
  uniforms: {
    sunDirection: { value: new THREE.Vector3(1.2, 0.2, 0.6).normalize() },
    time: { value: 0 }
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;
    void main() {
      vNormal = normalize(normal);
      vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
      vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 sunDirection;
    uniform float time;
    varying vec3 vNormal;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;

    void main() {
      vec3 viewDir = normalize(cameraPosition - vWorldPosition);
      vec3 normal = normalize(vWorldNormal);
      vec3 sunDir = normalize(sunDirection);

      // Fresnel atmosphere limb glow
      float edgeFactor = 1.0 - max(0.0, dot(viewDir, normal));
      float edgeGlow = pow(edgeFactor, 3.2);

      float sunDot = dot(normal, sunDir);
      float daySide = smoothstep(-0.25, 0.2, sunDot);

      // Backlight scattering (glow when looking towards sun)
      float backscatter = pow(max(0.0, dot(-viewDir, sunDir)), 6.0) * 0.7;

      // Rayleigh scattering base color
      vec3 rayleigh = vec3(0.08, 0.45, 1.0) * edgeGlow * 2.0;

      // Sunset terminator band
      float sunsetGlow = smoothstep(0.18, -0.05, sunDot) * smoothstep(-0.25, -0.05, sunDot);
      vec3 sunsetColor = vec3(1.0, 0.42, 0.12) * sunsetGlow * edgeGlow * 2.4;

      // Sunlight glare/corona
      vec3 corona = vec3(1.0, 0.88, 0.65) * backscatter * (edgeGlow + 0.25);

      vec3 finalColor = (rayleigh + sunsetColor) * daySide + corona;
      float alpha = (edgeGlow * 1.35 * daySide) + (backscatter * 0.9 * edgeGlow);

      // Inner atmospheric haze
      float innerHaze = pow(edgeFactor, 6.0) * 0.45 * daySide;
      finalColor += vec3(0.12, 0.52, 1.0) * innerHaze;

      gl_FragColor = vec4(finalColor, clamp(alpha, 0.0, 1.0));
    }
  `
};

const IonosphereShader = {
  uniforms: {
    sunDirection: { value: new THREE.Vector3(1.2, 0.2, 0.6).normalize() },
    time: { value: 0 }
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vViewNormal;
    void main() {
      vNormal = normalize(normal);
      vViewNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 sunDirection;
    uniform float time;
    varying vec3 vNormal;
    varying vec3 vViewNormal;
    void main() {
      float edge = 1.0 - dot(vViewNormal, vec3(0.0, 0.0, 1.0));
      float ionoGlow = pow(edge, 4.5) * 0.22;
      float sunDot = dot(vNormal, sunDirection);
      float dayFade = smoothstep(-0.1, 0.3, sunDot);
      vec3 ionoColor = mix(vec3(0.1, 0.4, 1.0), vec3(0.0, 0.9, 0.5), 0.3);
      gl_FragColor = vec4(ionoColor, ionoGlow * dayFade * 0.55);
    }
  `
};

const AuroraShaderMaterial = {
  uniforms: {
    time: { value: 0 }
  },
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vPosition;
    void main() {
      vUv = uv;
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float time;
    varying vec2 vUv;
    varying vec3 vPosition;

    // Simple pseudo-random hash
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    // 2D noise
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
                 mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
    }

    void main() {
      // Shimmering curtains: vertical stripes that drift over time
      float shimmer = sin(vUv.x * 55.0 + time * 1.6) * 0.4 + 0.6;
      shimmer += cos(vUv.x * 20.0 - time * 0.9) * 0.3;
      
      // Vertical height falloff (glows in the middle/bottom, fades at top)
      float verticalGlow = pow(1.0 - vUv.y, 2.5) * (vUv.y * 3.8);
      
      // Dynamic noise movement
      float wave = noise(vec2(vUv.x * 25.0, time * 0.4)) * 0.35 + 0.65;
      
      float alpha = verticalGlow * shimmer * wave * 0.9;
      
      // Color transition: green near the bottom, purple/violet at the top
      vec3 finalColor = mix(vec3(0.0, 1.0, 0.4), vec3(0.52, 0.05, 1.0), vUv.y * 0.85);
      
      gl_FragColor = vec4(finalColor, alpha);
    }
  `
};

function createFallbackTexture(type) {
  const W = 2048, H = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Reusable continent outline coordinates
  const continents = [
    // North America
    { pts: [[260,200],[420,170],[500,230],[490,310],[440,370],[360,390],[290,360],[240,300],[250,240]], color: "#2d6a3f" },
    // South America
    { pts: [[320,430],[400,410],[430,450],[440,530],[420,620],[370,660],[320,640],[290,570],[300,490]], color: "#2d7a41" },
    // Europe
    { pts: [[700,160],[800,140],[850,190],[820,250],[760,270],[700,250],[680,200]], color: "#3d7040" },
    // Africa
    { pts: [[720,270],[820,260],[870,310],[890,420],[870,530],[820,600],[740,610],[690,540],[670,420],[680,330]], color: "#3a6e35" },
    // Asia (large)
    { pts: [[830,130],[1100,110],[1250,150],[1300,220],[1280,300],[1200,340],[1100,360],[950,320],[860,270],[820,200]], color: "#2e6838" },
    // South/Southeast Asia
    { pts: [[980,320],[1050,310],[1100,360],[1120,420],[1080,450],[1020,440],[970,390],[960,350]], color: "#2a6230" },
    // Australia
    { pts: [[1150,510],[1260,490],[1310,550],[1290,620],[1200,650],[1130,620],[1100,560]], color: "#4a7c3a" },
    // Greenland
    { pts: [[440,100],[530,90],[560,140],[530,190],[460,200],[420,160]], color: "#d0e8f0" },
  ];

  if (type === "day") {
    // Deep ocean background — more realistic deep blue
    const seaGrad = ctx.createLinearGradient(0, 0, 0, H);
    seaGrad.addColorStop(0,    "#041428");
    seaGrad.addColorStop(0.12, "#052040");
    seaGrad.addColorStop(0.5,  "#063060");
    seaGrad.addColorStop(0.88, "#052040");
    seaGrad.addColorStop(1,    "#041428");
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, 0, W, H);

    // Subtle latitude banding
    const latBand = ctx.createLinearGradient(0, H*0.3, 0, H*0.7);
    latBand.addColorStop(0, "rgba(6,45,90,0)");
    latBand.addColorStop(0.5, "rgba(6,48,95,0.25)");
    latBand.addColorStop(1, "rgba(6,45,90,0)");
    ctx.fillStyle = latBand;
    ctx.fillRect(0, 0, W, H);

    continents.forEach(({ pts, color }) => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0] * W / 1440, pts[0][1] * H / 720);
      pts.slice(1).forEach(([px, py]) => ctx.lineTo(px * W / 1440, py * H / 720));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      // Darker forest shading
      ctx.fillStyle = "rgba(15,40,15,0.4)";
      ctx.fill();
      // Terrain texture dots
      for (let n = 0; n < 100; n++) {
        const bx = pts[0][0] * W / 1440 + (Math.random() - 0.5) * (W * 0.12);
        const by = pts[0][1] * H / 720  + (Math.random() - 0.5) * (H * 0.15);
        const br = 8 + Math.random() * 28;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fillStyle = Math.random() > 0.5 ? "rgba(55,100,40,0.28)" : "rgba(20,55,20,0.22)";
        ctx.fill();
      }
    });

    // Sahara / desert highlights
    ctx.fillStyle = "rgba(180,140,60,0.14)";
    ctx.beginPath(); ctx.ellipse(870*W/1440, 310*H/720, 100*W/1440, 60*H/720, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(780*W/1440, 350*H/720, 70*W/1440, 40*H/720, 0.2, 0, Math.PI*2); ctx.fill();

    // Polar ice caps with brighter edge
    const iceCap = (y, h) => {
      const grad = ctx.createLinearGradient(0, y, 0, y + h);
      grad.addColorStop(0, "rgba(225,240,252,0.98)");
      grad.addColorStop(0.5, "rgba(200,225,245,0.75)");
      grad.addColorStop(1, "rgba(175,210,235,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, y, W, h);
    };
    iceCap(0, H * 0.12);
    iceCap(H * 0.88, H * 0.12);

    // Atmosphere limb tint (blue ring)
    const limbGrad = ctx.createLinearGradient(0, 0, 0, H);
    limbGrad.addColorStop(0,    "rgba(60,120,220,0.22)");
    limbGrad.addColorStop(0.06, "rgba(0,0,0,0)");
    limbGrad.addColorStop(0.94, "rgba(0,0,0,0)");
    limbGrad.addColorStop(1,    "rgba(60,120,220,0.22)");
    ctx.fillStyle = limbGrad;
    ctx.fillRect(0, 0, W, H);

    // Ocean light scatter
    const scatterGrad = ctx.createRadialGradient(W*0.35, H*0.45, 0, W*0.35, H*0.45, W*0.28);
    scatterGrad.addColorStop(0, "rgba(30,100,200,0.12)");
    scatterGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = scatterGrad;
    ctx.fillRect(0, 0, W, H);

  } else if (type === "night") {
    ctx.fillStyle = "#01020a";
    ctx.fillRect(0, 0, W, H);

    // City light clusters matching continent positions
    const clusters = [
      { cx: 0.22, cy: 0.28, r: 0.09, density: 200 }, // N America
      { cx: 0.30, cy: 0.55, r: 0.05, density: 60 },  // S America
      { cx: 0.50, cy: 0.23, r: 0.08, density: 220 }, // Europe
      { cx: 0.55, cy: 0.42, r: 0.07, density: 80 },  // Africa
      { cx: 0.70, cy: 0.21, r: 0.12, density: 350 }, // Asia
      { cx: 0.78, cy: 0.38, r: 0.05, density: 100 }, // SE Asia
      { cx: 0.85, cy: 0.62, r: 0.05, density: 60 },  // Australia
      { cx: 0.90, cy: 0.26, r: 0.03, density: 40 },  // Japan
    ];

    clusters.forEach(({ cx, cy, r, density }) => {
      for (let i = 0; i < density; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.pow(Math.random(), 0.5) * r;
        const x = (cx + Math.cos(angle) * dist) * W;
        const y = (cy + Math.sin(angle) * dist) * H;
        const size = Math.random() * 2.2 + 0.3;
        const brightness = 0.4 + Math.random() * 0.6;
        const hue = Math.random() > 0.3 ? `rgba(255,${200 + Math.random()*55},${80 + Math.random()*80},${brightness})` : `rgba(255,${160+Math.random()*60},60,${brightness * 0.6})`;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 4);
        glow.addColorStop(0, hue);
        glow.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(x, y, size * 4, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
      }
    });

    // Sparse global dots
    for (let i = 0; i < 300; i++) {
      const x = Math.random() * W;
      const y = H * 0.08 + Math.random() * H * 0.84;
      ctx.beginPath();
      ctx.arc(x, y, Math.random() * 0.8 + 0.1, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,220,120,${0.1 + Math.random() * 0.5})`;
      ctx.fill();
    }

  } else if (type === "clouds") {
    ctx.clearRect(0, 0, W, H);
    // Layered cloud bands
    const cloudBands = [
      { y: 0.08, spread: 0.06, opacity: 0.7, count: 12 },
      { y: 0.22, spread: 0.05, opacity: 0.5, count: 8 },
      { y: 0.45, spread: 0.07, opacity: 0.55, count: 10 },
      { y: 0.62, spread: 0.05, opacity: 0.5, count: 8 },
      { y: 0.80, spread: 0.04, opacity: 0.45, count: 7 },
      { y: 0.92, spread: 0.05, opacity: 0.7, count: 11 },
    ];
    cloudBands.forEach(({ y, spread, opacity, count }) => {
      for (let i = 0; i < count; i++) {
        const cx = Math.random() * W;
        const cy = (y + (Math.random() - 0.5) * spread * 2) * H;
        const rx = 100 + Math.random() * 250;
        const ry = 22 + Math.random() * 45;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
        g.addColorStop(0,   `rgba(255,255,255,${opacity})`);
        g.addColorStop(0.5, `rgba(235,240,255,${opacity * 0.6})`);
        g.addColorStop(1,   "rgba(220,228,255,0)");
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, (Math.random() - 0.5) * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }
    });

  } else if (type === "specular") {
    // Ocean = white (specular), land = dark
    ctx.fillStyle = "#aac4d8";
    ctx.fillRect(0, 0, W, H);
    
    ctx.fillStyle = "#1a1a1a";
    continents.forEach(({ pts }) => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0] * W / 1440, pts[0][1] * H / 720);
      pts.slice(1).forEach(([px, py]) => ctx.lineTo(px * W / 1440, py * H / 720));
      ctx.closePath();
      ctx.fill();
    });
    // Polar caps
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, W, H * 0.09);
    ctx.fillRect(0, H * 0.91, W, H * 0.09);

  } else if (type === "normal") {
    // Create temporary heightmap
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = W; tempCanvas.height = H;
    const tCtx = tempCanvas.getContext("2d");
    tCtx.fillStyle = "#000000"; // ocean = 0
    tCtx.fillRect(0, 0, W, H);
    
    continents.forEach(({ pts }) => {
      tCtx.beginPath();
      tCtx.moveTo(pts[0][0] * W / 1440, pts[0][1] * H / 720);
      pts.slice(1).forEach(([px, py]) => tCtx.lineTo(px * W / 1440, py * H / 720));
      tCtx.closePath();
      tCtx.fillStyle = "#666666"; // land height base
      tCtx.fill();
      
      // Mountains
      for (let n = 0; n < 35; n++) {
        const bx = pts[0][0] * W / 1440 + (Math.random() - 0.5) * (W * 0.1);
        const by = pts[0][1] * H / 720  + (Math.random() - 0.5) * (H * 0.12);
        const br = 20 + Math.random() * 40;
        const grad = tCtx.createRadialGradient(bx, by, 0, bx, by, br);
        grad.addColorStop(0, "rgba(255,255,255,0.35)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        tCtx.beginPath();
        tCtx.arc(bx, by, br, 0, Math.PI * 2);
        tCtx.fillStyle = grad;
        tCtx.fill();
      }
    });

    // Finite differences for Normal map
    const hData = tCtx.getImageData(0, 0, W, H).data;
    const nImg = ctx.createImageData(W, H);
    const nData = nImg.data;

    const getH = (x, y) => {
      const px = Math.min(W - 1, Math.max(0, x));
      const py = Math.min(H - 1, Math.max(0, y));
      return hData[(py * W + px) * 4];
    };

    const strength = 18.0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const hL = getH(x - 1, y);
        const hR = getH(x + 1, y);
        const hD = getH(x, y - 1);
        const hU = getH(x, y + 1);

        const dx = (hR - hL) / 255.0;
        const dy = (hU - hD) / 255.0;

        const nx = -dx * strength;
        const ny = -dy * strength;
        const nz = 1.0;

        const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
        const r = (nx / len) * 0.5 + 0.5;
        const g = (ny / len) * 0.5 + 0.5;
        const b = (nz / len) * 0.5 + 0.5;

        const idx = (y * W + x) * 4;
        nData[idx] = r * 255;
        nData[idx+1] = g * 255;
        nData[idx+2] = b * 255;
        nData[idx+3] = 255;
      }
    }
    ctx.putImageData(nImg, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

// ============================================================
// EARTH COMPONENT WITH SPECULAR MAP + LAT/LON GRID
// ============================================================
// Earth axial tilt in radians (23.5 degrees)
const EARTH_AXIAL_TILT = THREE.MathUtils.degToRad(23.5);
// Earth sidereal day in seconds
const EARTH_SIDEREAL_DAY = 86164.1;

function PolarAurora({ position, rotation }) {
  const auroraMatRef = useRef();
  useFrame((state) => {
    if (auroraMatRef.current) {
      auroraMatRef.current.uniforms.time.value = state.clock.getElapsedTime();
    }
  });
  return (
    <mesh position={position} rotation={rotation}>
      <cylinderGeometry args={[EARTH_RADIUS * 0.35, EARTH_RADIUS * 0.38, 0.45, 64, 8, true]} />
      <shaderMaterial
        ref={auroraMatRef}
        vertexShader={AuroraShaderMaterial.vertexShader}
        fragmentShader={AuroraShaderMaterial.fragmentShader}
        uniforms={{
          time: { value: 0 }
        }}
        blending={THREE.AdditiveBlending}
        transparent={true}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function Earth({ sunDirection }) {
  const earthGroupRef = useRef(); // tilted group
  const earthRef = useRef();
  const cloudsRef = useRef();
  const earthMatRef = useRef();
  const atmoRef = useRef();
  const ionoRef = useRef();
  const graticuleRef = useRef();

  // Always start with procedural fallback textures so Earth renders immediately
  const [textures] = useState(() => {
    const fallback = {
      day: createFallbackTexture("day"),
      night: createFallbackTexture("night"),
      clouds: createFallbackTexture("clouds"),
      specular: createFallbackTexture("specular"),
      normal: createFallbackTexture("normal"),
    };

    // Try to load real textures in background and patch the material when ready
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    const urls = {
      day: "https://raw.githubusercontent.com/turban/webgl-earth/master/images/2_no_clouds_4k.jpg",
      night: "https://raw.githubusercontent.com/turban/webgl-earth/master/images/5_night_4k.jpg",
      clouds: "https://raw.githubusercontent.com/turban/webgl-earth/master/images/fair_clouds_4k.png",
      specular: "https://raw.githubusercontent.com/turban/webgl-earth/master/images/water_4k.png",
      normal: "https://raw.githubusercontent.com/turban/webgl-earth/master/images/elev_bump_4k.jpg",
    };
    Object.entries(urls).forEach(([key, url]) => {
      loader.load(
        url,
        (tex) => {
          fallback[key].dispose();
          fallback[key] = tex;
          // Patch live shader uniforms if already mounted
          if (earthMatRef.current && earthMatRef.current.uniforms?.[`${key}Texture`]) {
            earthMatRef.current.uniforms[`${key}Texture`].value = tex;
            earthMatRef.current.needsUpdate = true;
          }
        },
        undefined,
        () => { /* keep fallback */ }
      );
    });

    return fallback;
  });

  useFrame((state, delta) => {
    const t = window.simTimeOffset ?? 0;
    const elapsed = state.clock.getElapsedTime();

    // Always-visible base rotation (1 full revolution every 120 real-time seconds)
    // plus the physics-accurate rotation from simulation time.
    // At 1× sim speed physics adds ≈0.0000728 rad/s (imperceptible),
    // so we keep a minimum visual spin of 0.052 rad/s (~2rpm) at all times.
    const physicsRotation = (2 * Math.PI / EARTH_SIDEREAL_DAY) * t;
    const visualBase = elapsed * 0.052; // always-visible spin
    const earthRotation = -Math.PI / 2 + physicsRotation + visualBase;
    // Clouds drift ~6% faster than the surface
    const cloudsRotation = earthRotation * 1.06;

    if (earthRef.current) earthRef.current.rotation.y = earthRotation;
    if (cloudsRef.current) cloudsRef.current.rotation.y = cloudsRotation;
    if (graticuleRef.current) graticuleRef.current.rotation.y = earthRotation;

    if (earthMatRef.current) {
      earthMatRef.current.uniforms.time.value = elapsed;
      earthMatRef.current.uniforms.cloudsRotation.value = cloudsRotation;
    }
    if (atmoRef.current) atmoRef.current.uniforms.time.value = elapsed;
    if (ionoRef.current) ionoRef.current.uniforms.time.value = elapsed;
  });

  // Lat/Lon graticule (computed once)
  const graticuleLines = useMemo(() => {
    const lines = [];
    const R = EARTH_RADIUS + 0.005;

    for (let lat = -60; lat <= 60; lat += 30) {
      const pts = [];
      const latRad = THREE.MathUtils.degToRad(lat);
      for (let lon = 0; lon <= 360; lon += 3) {
        const lonRad = THREE.MathUtils.degToRad(lon);
        pts.push(new THREE.Vector3(
          R * Math.cos(latRad) * Math.cos(lonRad),
          R * Math.sin(latRad),
          R * Math.cos(latRad) * Math.sin(lonRad)
        ));
      }
      lines.push({ pts, isEquator: lat === 0 });
    }
    for (let lon = 0; lon < 360; lon += 45) {
      const pts = [];
      const lonRad = THREE.MathUtils.degToRad(lon);
      for (let lat = -90; lat <= 90; lat += 3) {
        const latRad = THREE.MathUtils.degToRad(lat);
        pts.push(new THREE.Vector3(
          R * Math.cos(latRad) * Math.cos(lonRad),
          R * Math.sin(latRad),
          R * Math.cos(latRad) * Math.sin(lonRad)
        ));
      }
      lines.push({ pts, isEquator: false });
    }
    return lines;
  }, []);

  return (
    // Axially tilted group — all Earth layers tilt together
    <group rotation={[EARTH_AXIAL_TILT, 0, 0]}>
      {/* Outer atmosphere - Rayleigh/Mie scattering */}
      <mesh scale={[1.165, 1.165, 1.165]}>
        <sphereGeometry args={[EARTH_RADIUS, 128, 128]} />
        <shaderMaterial
          ref={atmoRef}
          vertexShader={AtmosphereShaderMaterial.vertexShader}
          fragmentShader={AtmosphereShaderMaterial.fragmentShader}
          uniforms={{
            sunDirection: { value: sunDirection },
            time: { value: 0 }
          }}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
          transparent={true}
          depthWrite={false}
        />
      </mesh>

      {/* Ionosphere / inner glow */}
      <mesh scale={[1.04, 1.04, 1.04]}>
        <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
        <shaderMaterial
          ref={ionoRef}
          vertexShader={IonosphereShader.vertexShader}
          fragmentShader={IonosphereShader.fragmentShader}
          uniforms={{
            sunDirection: { value: sunDirection },
            time: { value: 0 }
          }}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
          transparent={true}
          depthWrite={false}
        />
      </mesh>

      {/* Earth Surface Globe */}
      <mesh ref={earthRef}>
        <sphereGeometry args={[EARTH_RADIUS, 128, 128]} />
        <shaderMaterial
          ref={earthMatRef}
          vertexShader={EarthShaderMaterial.vertexShader}
          fragmentShader={EarthShaderMaterial.fragmentShader}
          uniforms={useMemo(() => ({
            dayTexture: { value: textures.day },
            nightTexture: { value: textures.night },
            cloudsTexture: { value: textures.clouds },
            specularTexture: { value: textures.specular },
            normalTexture: { value: textures.normal },
            sunDirection: { value: sunDirection },
            time: { value: 0 },
            cloudsRotation: { value: 0 }
          }), [textures, sunDirection])}
        />
      </mesh>

      {/* Cloud layer */}
      <mesh ref={cloudsRef} scale={[1.012, 1.012, 1.012]}>
        <sphereGeometry args={[EARTH_RADIUS, 96, 96]} />
        <meshStandardMaterial
          alphaMap={textures.clouds}
          transparent={true}
          depthWrite={false}
          blending={THREE.NormalBlending}
          color="#e8f0ff"
          opacity={0.88}
        />
      </mesh>

      {/* Graticule — co-rotates with the surface */}
      <group ref={graticuleRef}>
        <PolarAurora position={[0, EARTH_RADIUS * 0.97, 0]} rotation={[0, 0, 0]} />
        <PolarAurora position={[0, -EARTH_RADIUS * 0.97, 0]} rotation={[Math.PI, 0, 0]} />

        {/* Ground Station Markers */}
        <GroundStations />

        {graticuleLines.map((line, i) => (
          <Line
            key={`grid-${i}`}
            points={line.pts}
            color={line.isEquator ? "#0ea5e9" : "#1e3a5f"}
            lineWidth={line.isEquator ? 0.9 : 0.3}
            opacity={line.isEquator ? 0.55 : 0.15}
            transparent={true}
          />
        ))}
      </group>
    </group>
  );
}

// ============================================================
// CINEMATIC SUN WITH LENS FLARE & CORONA
// ============================================================
function CinematicSun() {
  const coronaRef = useRef();
  const flareRef = useRef();
  const sunPos = new THREE.Vector3(-25, 8, -12);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (coronaRef.current) {
      coronaRef.current.rotation.z = t * 0.08;
      const pulse = 1.0 + Math.sin(t * 2.0) * 0.04;
      coronaRef.current.scale.setScalar(pulse);
    }
    if (flareRef.current) {
      flareRef.current.rotation.z = t * 0.15;
    }
  });

  return (
    <group position={sunPos.toArray()}>
      {/* Core solar disk */}
      <mesh>
        <sphereGeometry args={[1.8, 32, 32]} />
        <meshBasicMaterial color="#fff8e0" toneMapped={false} />
      </mesh>

      {/* Inner corona glow */}
      <mesh scale={[1.6, 1.6, 1.6]}>
        <sphereGeometry args={[1.8, 16, 16]} />
        <meshBasicMaterial color="#ffe066" transparent opacity={0.35} toneMapped={false} side={THREE.BackSide} />
      </mesh>

      {/* Outer corona */}
      <mesh scale={[2.5, 2.5, 2.5]}>
        <sphereGeometry args={[1.8, 16, 16]} />
        <meshBasicMaterial color="#ff8c00" transparent opacity={0.12} toneMapped={false} side={THREE.BackSide} />
      </mesh>

      {/* Rotating corona spikes */}
      <group ref={coronaRef}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
          <mesh key={i} rotation={[0, 0, THREE.MathUtils.degToRad(angle)]}>
            <planeGeometry args={[0.08, 4.5]} />
            <meshBasicMaterial color="#ffe566" transparent opacity={0.18} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        ))}
      </group>

      {/* Lens flare cross */}
      <group ref={flareRef}>
        {[0, 90].map((angle, i) => (
          <mesh key={i} rotation={[0, 0, THREE.MathUtils.degToRad(angle)]}>
            <planeGeometry args={[0.06, 6.0]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.08} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ============================================================
// MILKY WAY + DEEP SPACE ENVIRONMENT
// ============================================================
function SpaceEnvironment() {
  return (
    <mesh scale={[-120, -120, -120]}>
      <sphereGeometry args={[1, 64, 64]} />
      <shaderMaterial
        vertexShader={`
          varying vec3 vPosition;
          void main() {
            vPosition = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          varying vec3 vPosition;
          float hash31(vec3 p) {
            return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
          }
          float hash21(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }
          float noise3(vec3 p) {
            vec3 i = floor(p);
            vec3 f = fract(p);
            vec3 u = f*f*(3.0-2.0*f);
            return mix(
              mix(mix(hash31(i), hash31(i+vec3(1,0,0)), u.x),
                  mix(hash31(i+vec3(0,1,0)), hash31(i+vec3(1,1,0)), u.x), u.y),
              mix(mix(hash31(i+vec3(0,0,1)), hash31(i+vec3(1,0,1)), u.x),
                  mix(hash31(i+vec3(0,1,1)), hash31(i+vec3(1,1,1)), u.x), u.y),
              u.z);
          }
          void main() {
            vec3 normPos = normalize(vPosition);

            // Deep space base
            vec3 colBase = vec3(0.003, 0.004, 0.012);

            // Milky Way band
            float mwBand = smoothstep(0.42, 0.0, abs(normPos.x*0.5 + normPos.y*0.6 - normPos.z*0.5));
            float n1 = noise3(normPos * 3.5);
            float n2 = noise3(normPos * 7.0 + vec3(n1*0.2));
            float n3 = noise3(normPos * 15.0);

            vec3 mwColor = vec3(0.08, 0.05, 0.14) * (n1 * 0.6 + 0.4);
            vec3 nebulaBlue = vec3(0.04, 0.08, 0.22) * smoothstep(0.3, 0.7, n2);
            vec3 nebulaPink = vec3(0.18, 0.04, 0.12) * smoothstep(0.5, 0.8, n3);
            vec3 dustLane = vec3(0.22, 0.16, 0.08) * pow(noise3(normPos * 12.0), 10.0);

            vec3 finalColor = colBase
              + mwColor * mwBand * 1.2
              + nebulaBlue * mwBand * 0.9
              + nebulaPink * (1.0 - mwBand) * 0.4
              + dustLane;

            gl_FragColor = vec4(finalColor, 1.0);
          }
        `}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ============================================================
// CAMERA CONTROLLER
// ============================================================
function CameraController({ selectedSat, cameraMode }) {
  const { camera, controls } = useThree();

  useEffect(() => {
    if (controls) {
      if (cameraMode === "pov" && selectedSat) {
        controls.enablePan = false;
        controls.minDistance = 0.2;
        controls.maxDistance = 3.0;
      } else if (cameraMode === "tracking" && selectedSat) {
        controls.enablePan = true;
        controls.minDistance = 1.2;
        controls.maxDistance = 40.0;
      } else {
        controls.enablePan = true;
        controls.minDistance = 8.2;
        controls.maxDistance = 90.0;
      }
    }
  }, [cameraMode, selectedSat, controls]);

  useFrame(() => {
    if (!controls) return;
    if (selectedSat && (cameraMode === "tracking" || cameraMode === "pov")) {
      const targetPos = new THREE.Vector3(
        (selectedSat.x ?? 0) / 1000,
        (selectedSat.z ?? 0) / 1000,
        (selectedSat.y ?? 0) / 1000
      );
      if (cameraMode === "pov") {
        controls.target.copy(targetPos);
        const satDirection = targetPos.clone().normalize();
        const crossDir = new THREE.Vector3(0, 1, 0).cross(satDirection).normalize();
        const povCamPos = targetPos.clone().sub(crossDir.clone().multiplyScalar(0.4)).add(satDirection.clone().multiplyScalar(0.12));
        camera.position.copy(povCamPos);
      } else {
        controls.target.lerp(targetPos, 0.08);
        const desiredCamPos = targetPos.clone().add(new THREE.Vector3(1.4, 0.9, 1.4));
        camera.position.lerp(desiredCamPos, 0.05);
      }
    } else {
      controls.target.lerp(new THREE.Vector3(0, 0, 0), 0.06);
      if (cameraMode === "earth") {
        const radialPos = camera.position.clone().normalize().multiplyScalar(8.8);
        camera.position.lerp(radialPos, 0.06);
      } else if (cameraMode === "analysis") {
        camera.position.lerp(new THREE.Vector3(0, 20.0, 0.01), 0.06);
      } else if (cameraMode === "global") {
        const currentRadius = camera.position.length();
        if (currentRadius < 24.0) {
          const radialPos = camera.position.clone().normalize().multiplyScalar(26.0);
          camera.position.lerp(radialPos, 0.05);
        }
      }
    }

    // Absolute guard to prevent the camera from going inside the Earth mesh (causing it to vanish)
    const minDistanceToCenter = 6.6;
    if (camera.position.length() < minDistanceToCenter) {
      camera.position.normalize().multiplyScalar(minDistanceToCenter);
      controls.update();
    }
  });

  return null;
}

// ============================================================
// BACKGROUND CLICK MESH — for deselecting satellite
// ============================================================
function BackgroundClickPlane({ onClickBackground }) {
  return (
    <mesh
      position={[0, 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onClickBackground();
      }}
    >
      <sphereGeometry args={[200, 8, 8]} />
      <meshBasicMaterial transparent opacity={0} side={THREE.BackSide} depthWrite={false} />
    </mesh>
  );
}

// ============================================================
// RESET VIEW CONTROLLER (imperative)
// ============================================================
function ResetViewController({ resetRef }) {
  const { camera, controls } = useThree();
  useEffect(() => {
    resetRef.current = () => {
      camera.position.set(0, 0, 26.0);
      if (controls) {
        controls.target.set(0, 0, 0);
        controls.update();
      }
    };
  }, [camera, controls, resetRef]);
  return null;
}

// ============================================================
// KEPLERIAN ELEMENTS
// ============================================================
function getKeplerianElements(satName, index) {
  if (satName === "ISS (ZARYA)") return { node: 215, peri: 110, M0: 180 };
  if (satName === "STARLINK-4217") return { node: 120, peri: 45, M0: 0 };
  if (satName === "GPS IIF-11") return { node: 60, peri: 150, M0: 270 };
  if (satName === "GALILEO-02") return { node: 180, peri: 30, M0: 120 };
  if (satName === "INSAT-3DR") return { node: 82, peri: 0, M0: 0 };
  if (satName === "GOES-16") return { node: 140, peri: 0, M0: 90 };
  if (satName === "LANDSAT-9") return { node: 310, peri: 45, M0: 180 };
  if (satName === "CRYOSAT-2") return { node: 150, peri: 90, M0: 0 };
  if (satName === "SENTINEL-6") return { node: 45, peri: 120, M0: 240 };
  if (satName === "AQUA") return { node: 270, peri: 180, M0: 0 };
  if (satName === "HUBBLE") return { node: 25, peri: 60, M0: 300 };
  const match = satName.match(/\d+$/);
  const iVal = match ? parseInt(match[0], 10) - 100 : index + 1;
  return {
    node: (iVal * 17) % 360,
    peri: (iVal * 29) % 360,
    M0: (iVal * 43) % 360
  };
}

// ============================================================
// ORBIT LINE — opacity dims when another satellite is selected
// ============================================================
function OrbitLine({ satellite, color, isSelected, hasSelection }) {
  const elements = useMemo(() => getKeplerianElements(satellite.name, 0), [satellite.name]);

  const points = useMemo(() => {
    const arr = [];
    const segments = 180;
    const a = satellite.a / 1000;
    const e = satellite.e || 0.0001;
    const i = THREE.MathUtils.degToRad(satellite.i_deg || 28.5);
    const node = THREE.MathUtils.degToRad(elements.node);
    const peri = THREE.MathUtils.degToRad(elements.peri);
    for (let idx = 0; idx <= segments; idx++) {
      const E = (idx / segments) * Math.PI * 2;
      const xp = a * (Math.cos(E) - e);
      const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
      const x = xp * (Math.cos(peri) * Math.cos(node) - Math.sin(peri) * Math.sin(node) * Math.cos(i)) - yp * (Math.sin(peri) * Math.cos(node) + Math.cos(peri) * Math.sin(node) * Math.cos(i));
      const y = xp * (Math.cos(peri) * Math.sin(node) + Math.sin(peri) * Math.cos(node) * Math.cos(i)) - yp * (Math.sin(peri) * Math.sin(node) - Math.cos(peri) * Math.cos(node) * Math.cos(i));
      const z = xp * (Math.sin(peri) * Math.sin(i)) + yp * (Math.cos(peri) * Math.sin(i));
      arr.push(new THREE.Vector3(x, z, y));
    }
    return arr;
  }, [satellite, elements]);

  // Dim all orbits when something is selected; highlight only the selected one
  const lineOpacity  = isSelected ? 0.92 : (hasSelection ? 0.05 : 0.28);
  const lineWidth    = isSelected ? 2.2  : (hasSelection ? 0.6  : 1.0);
  const lineColor    = isSelected ? color : (hasSelection ? "#1e3a5f" : color);

  return (
    <Line
      points={points}
      color={lineColor}
      lineWidth={lineWidth}
      opacity={lineOpacity}
      transparent={true}
    />
  );
}

// ============================================================
// CLEAN GLOWING SATELLITE MARKER
// (replaces complex 3D models — with floating HTML labels)
// ============================================================
function SatelliteMesh({ sat, index, onSelect, isSelected, predictions = [], thrusterActive }) {
  const meshRef  = useRef();
  const [hovered, setHovered] = useState(false);
  const activeHazard = predictions.find(p => p.satellite === sat.name && p.recommended_action !== "Maneuver Completed");

  const a  = sat.a / 1000;
  const e  = sat.e || 0.0001;
  const i  = THREE.MathUtils.degToRad(sat.i_deg || 28.5);
  const elements   = useMemo(() => getKeplerianElements(sat.name, index), [sat.name, index]);
  const node       = THREE.MathUtils.degToRad(elements.node);
  const peri       = THREE.MathUtils.degToRad(elements.peri);
  const M0         = THREE.MathUtils.degToRad(elements.M0);
  const period     = useMemo(() => 2 * Math.PI * Math.sqrt(Math.pow(sat.a, 3) / MU), [sat.a]);
  const meanMotion = useMemo(() => (2 * Math.PI) / period, [period]);

  useFrame(() => {
    if (!meshRef.current) return;
    const t = window.simTimeOffset ?? 0;
    const M = (M0 + meanMotion * t) % (2 * Math.PI);
    let E = M;
    for (let j = 0; j < 6; j++) E = E - (E - e * Math.sin(E) - M) / (1.0 - e * Math.cos(E));
    const xp = a * (Math.cos(E) - e);
    const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const cos_node = Math.cos(node); const sin_node = Math.sin(node);
    const cos_peri = Math.cos(peri); const sin_peri = Math.sin(peri);
    const cos_i = Math.cos(i);      const sin_i    = Math.sin(i);
    const x_eci = xp * (cos_peri * cos_node - sin_peri * sin_node * cos_i) - yp * (sin_peri * cos_node + cos_peri * sin_node * cos_i);
    const y_eci = xp * (cos_peri * sin_node + sin_peri * cos_node * cos_i) - yp * (sin_peri * sin_node - cos_peri * cos_node * cos_i);
    const z_eci = xp * (sin_peri * sin_i) + yp * (cos_peri * sin_i);
    meshRef.current.position.set(x_eci, z_eci, y_eci);
    sat.x = x_eci * 1000; sat.z = z_eci * 1000; sat.y = y_eci * 1000;
  });

  const satColor   = getOrbitColor(sat.orbit_type);
  const activeColor = activeHazard ? "#ef4444" : satColor;
  const markerSize  = isSelected ? 0.09 : (hovered ? 0.08 : 0.055);
  const glowSize    = isSelected ? 0.22 : (hovered ? 0.18 : 0.0);
  const glowOpacity = isSelected ? 0.5  : (hovered ? 0.35 : 0.0);
  const altKm = sat.a ? (sat.a - 6371).toFixed(0) : "—";
  const velKms = sat.a ? Math.sqrt(398600.44 / sat.a).toFixed(2) : "—";

  return (
    <group ref={meshRef}>
      {/* Invisible large hit zone for easy clicking */}
      <mesh
        onClick={(e) => { e.stopPropagation(); onSelect(sat); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = "default"; }}
      >
        <sphereGeometry args={[0.35, 6, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Core glowing marker */}
      <mesh>
        <sphereGeometry args={[markerSize, 10, 10]} />
        <meshBasicMaterial color={activeColor} toneMapped={false} />
      </mesh>

      {/* Hover/selection outer glow */}
      {(hovered || isSelected) && (
        <mesh>
          <sphereGeometry args={[glowSize, 10, 10]} />
          <meshBasicMaterial
            color={activeColor}
            transparent opacity={glowOpacity}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* Hover name label */}
      {hovered && !isSelected && (
        <Html position={[0, 0.32, 0]} center distanceFactor={10}>
          <div style={{
            background: "rgba(2,4,16,0.92)",
            border: `1px solid ${activeColor}55`,
            borderRadius: 4,
            padding: "3px 8px",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            boxShadow: `0 0 10px ${activeColor}44`,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#fff", fontFamily: "'Rajdhani',sans-serif", letterSpacing: "0.08em" }}>{sat.name}</div>
            <div style={{ fontSize: 7.5, color: activeColor, fontFamily: "'Share Tech Mono',monospace" }}>{sat.orbit_type} · {altKm} km · {velKms} km/s</div>
          </div>
        </Html>
      )}

      {/* Selection ring (flat ring around satellite) + pulsing rings */}
      {isSelected && (
        <>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.28, 0.38, 32]} />
            <meshBasicMaterial color={activeColor} side={THREE.DoubleSide} transparent opacity={0.75} toneMapped={false} depthWrite={false} />
          </mesh>
          {/* Selected name label */}
          <Html position={[0, 0.55, 0]} center distanceFactor={9}>
            <div style={{
              background: "rgba(2,4,16,0.95)",
              border: `1px solid ${activeColor}80`,
              borderRadius: 5,
              padding: "4px 10px",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              boxShadow: `0 0 14px ${activeColor}55`,
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#fff", fontFamily: "'Rajdhani',sans-serif", letterSpacing: "0.1em" }}>{sat.name}</div>
              <div style={{ fontSize: 7.5, color: activeColor, fontFamily: "'Share Tech Mono',monospace", marginTop: 1 }}>
                ▲ {altKm} km &nbsp;|&nbsp; {velKms} km/s
              </div>
            </div>
          </Html>
        </>
      )}

      {/* Thruster plume */}
      {isSelected && thrusterActive && (
        <points position={[0, -0.15, 0]}>
          <sphereGeometry args={[0.04, 6, 6]} />
          <pointsMaterial size={0.08} color="#f97316" blending={THREE.AdditiveBlending} transparent opacity={0.85} />
        </points>
      )}
    </group>
  );
}

// ──────────────────────────────────────────────────────────────
// (legacy placeholder — keep signature so nothing else breaks)
const SatelliteModel = ({ color, satName, isSelected }) => {
  const panelRef = useRef();
  useFrame((state) => {
    if (panelRef.current) {
      panelRef.current.rotation.y = state.clock.getElapsedTime() * 0.3;
    }
  });

  const isISS = satName === "ISS (ZARYA)";
  const isHub = satName === "HUBBLE";

  if (isISS) {
    // ISS-like model
    return (
      <group>
        {/* Main truss */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.018, 0.018, 0.45, 6]} />
          <meshStandardMaterial color="#c0ccd0" metalness={0.9} roughness={0.15} />
        </mesh>
        {/* Hab modules */}
        {[-0.08, 0, 0.08].map((z, i) => (
          <mesh key={i} position={[0, 0, z]}>
            <cylinderGeometry args={[0.03, 0.03, 0.1, 8]} />
            <meshStandardMaterial color="#a8b8c0" metalness={0.85} roughness={0.2} />
          </mesh>
        ))}
        {/* Solar panels x4 */}
        {[[-0.18, 0.07], [-0.18, -0.07], [0.18, 0.07], [0.18, -0.07]].map(([x, z], i) => (
          <mesh key={`sp${i}`} position={[x, 0, z]}>
            <boxGeometry args={[0.2, 0.005, 0.065]} />
            <meshStandardMaterial color={i % 2 === 0 ? "#1e3a8a" : "#1e40af"} metalness={0.4} roughness={0.15} emissive="#0f1f54" emissiveIntensity={0.3} />
          </mesh>
        ))}
        {/* Antenna */}
        <mesh position={[0, 0.06, 0]}>
          <cylinderGeometry args={[0.006, 0.006, 0.1, 4]} />
          <meshStandardMaterial color="#dde0e4" metalness={0.8} />
        </mesh>
      </group>
    );
  }

  if (isHub) {
    return (
      <group>
        <mesh>
          <cylinderGeometry args={[0.035, 0.03, 0.18, 12]} />
          <meshStandardMaterial color="#888" metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[0.015, 0.035, 0.05, 8]} />
          <meshStandardMaterial color="#999" metalness={0.7} roughness={0.2} />
        </mesh>
        {/* Solar wings */}
        {[[-0.16, 0], [0.16, 0]].map(([x], i) => (
          <mesh key={i} position={[x, 0, 0]}>
            <boxGeometry args={[0.18, 0.004, 0.055]} />
            <meshStandardMaterial color="#1e40af" emissive="#1d4ed8" emissiveIntensity={0.25} roughness={0.08} />
          </mesh>
        ))}
      </group>
    );
  }

  // Generic satellite with rotating solar panel orientation
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.055, 0.055, 0.1]} />
        <meshStandardMaterial color="#8a9ab0" metalness={0.88} roughness={0.18} />
      </mesh>
      {/* Rotating solar panels */}
      <group ref={panelRef}>
        <mesh position={[-0.14, 0, 0]}>
          <boxGeometry args={[0.16, 0.004, 0.058]} />
          <meshStandardMaterial color="#1a3a9a" emissive="#1533a0" emissiveIntensity={0.25} roughness={0.08} metalness={0.3} />
        </mesh>
        <mesh position={[0.14, 0, 0]}>
          <boxGeometry args={[0.16, 0.004, 0.058]} />
          <meshStandardMaterial color="#1a3a9a" emissive="#1533a0" emissiveIntensity={0.25} roughness={0.08} metalness={0.3} />
        </mesh>
        {/* Panel connections */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.006, 0.006, 0.18, 4]} />
          <meshStandardMaterial color="#445566" metalness={0.7} />
        </mesh>
      </group>
      {/* Antenna dish */}
      <mesh position={[0, -0.08, 0]} rotation={[Math.PI / 4, 0, 0]}>
        <coneGeometry args={[0.022, 0.03, 12, 1, true]} />
        <meshStandardMaterial color={color} transparent opacity={0.8} toneMapped={false} metalness={0.6} />
      </mesh>
      {/* Comm sphere */}
      <mesh position={[0, -0.062, 0.025]}>
        <sphereGeometry args={[0.012, 8, 8]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  );
};



// ============================================================
// ACTIVE SATELLITES GROUP
// ============================================================
function ActiveSatellitesGroup({ satellites, onSelect, selectedSat, predictions, thrusterActive, showLEO, showMEO, showGEO, showPolar, showSSO }) {
  return (
    <group>
      {satellites.map((sat, index) => {
        const isVisible =
          (sat.orbit_type === "LEO" && showLEO) ||
          (sat.orbit_type === "MEO" && showMEO) ||
          (sat.orbit_type === "GEO" && showGEO) ||
          (sat.orbit_type === "Polar" && showPolar) ||
          (sat.orbit_type === "SSO" && showSSO);
        if (!isVisible) return null;
        return (
          <SatelliteMesh
            key={sat.name}
            sat={sat}
            index={index}
            onSelect={onSelect}
            isSelected={selectedSat && selectedSat.name === sat.name}
            predictions={predictions}
            thrusterActive={thrusterActive}
          />
        );
      })}
    </group>
  );
}

// ============================================================
// DEBRIS MESH (irregular tumbling fragments)
// ============================================================
function DebrisMesh({ deb, onSelect, isSelected }) {
  const meshRef = useRef();
  const tumble = useMemo(() => ({
    x: (Math.random() - 0.5) * 1.8,
    y: (Math.random() - 0.5) * 1.8,
    z: (Math.random() - 0.5) * 1.8
  }), []);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    meshRef.current.position.set(deb.x / 1000, deb.z / 1000, deb.y / 1000);
    meshRef.current.rotation.x += tumble.x * delta;
    meshRef.current.rotation.y += tumble.y * delta;
    meshRef.current.rotation.z += tumble.z * delta;
  });

  let color = "#4a5568";
  if (deb.status === "CRITICAL") color = "#ef4444";
  else if (deb.status === "HIGH") color = "#f97316";
  else if (deb.status === "MEDIUM") color = "#eab308";

  return (
    <group ref={meshRef}>
      <mesh onClick={(e) => { e.stopPropagation(); onSelect(deb); }}>
        <dodecahedronGeometry args={[isSelected ? 0.18 : 0.07, 0]} />
        <meshStandardMaterial
          color={color}
          metalness={0.96}
          roughness={0.28}
          emissive={color}
          emissiveIntensity={isSelected ? 0.7 : 0.12}
        />
      </mesh>
      {(isSelected || deb.name === "DEBRIS-10023") && (
        <Html position={[0, 0, 0]} center>
          <div className="w-7 h-7 border border-red-500/50 rounded relative flex items-center justify-center animate-pulse">
            <div className="absolute top-0 left-0.5 w-1.5 h-1.5 border-t border-l border-red-400" />
            <div className="absolute top-0 right-0.5 w-1.5 h-1.5 border-t border-r border-red-400" />
            <div className="absolute bottom-0 left-0.5 w-1.5 h-1.5 border-b border-l border-red-400" />
            <div className="absolute bottom-0 right-0.5 w-1.5 h-1.5 border-b border-r border-red-400" />
          </div>
        </Html>
      )}
      {deb.name === "DEBRIS-10023" && (
        <Html distanceFactor={22} position={[0, 0.28, 0]} center>
          <div className="font-telemetry select-none text-[7.5px] bg-[#020208]/88 text-red-400 border border-red-500/40 px-1 py-0.5 rounded shadow whitespace-nowrap">
            DEBRIS-10023 ⚠
          </div>
        </Html>
      )}
    </group>
  );
}

function ActiveDebrisGroup({ debris, onSelect, selectedSat }) {
  return (
    <group>
      {debris.map((deb) => (
        <DebrisMesh key={deb.name} deb={deb} onSelect={onSelect} isSelected={selectedSat && selectedSat.name === deb.name} />
      ))}
    </group>
  );
}

// ============================================================
// BACKGROUND DEBRIS PARTICLE CLOUD
// ============================================================
function BackgroundDebrisParticles() {
  const leoCount = 42000;
  const meoCount = 7500;
  const geoCount = 3200;

  const safeColor = new THREE.Color("#0f766e");
  const monitorColor = new THREE.Color("#ca8a04");
  const dangerousColor = new THREE.Color("#c2410c");
  const criticalColor = new THREE.Color("#b91c1c");

  const getRiskColor = (v) => {
    if (v > 0.985) return criticalColor;
    if (v > 0.93) return dangerousColor;
    if (v > 0.78) return monitorColor;
    return safeColor;
  };

  const createBeltData = (count, minAlt, maxAlt, meanInc) => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let idx = 0; idx < count; idx++) {
      const alt = minAlt + Math.random() * (maxAlt - minAlt);
      const r = (6371.0 + alt) / 1000;
      const inc = THREE.MathUtils.degToRad(meanInc + (Math.random() - 0.5) * 18.0);
      const node = THREE.MathUtils.degToRad(Math.random() * 360);
      const M = THREE.MathUtils.degToRad(Math.random() * 360);
      const xp = r * Math.cos(M); const yp = r * Math.sin(M);
      const cn = Math.cos(node); const sn = Math.sin(node);
      const ci = Math.cos(inc); const si = Math.sin(inc);
      const x = xp * cn - yp * sn * ci;
      const y = xp * sn + yp * cn * ci;
      const z = yp * si;
      positions[idx * 3] = x; positions[idx * 3 + 1] = z; positions[idx * 3 + 2] = y;
      const c = getRiskColor(Math.random());
      colors[idx * 3] = c.r; colors[idx * 3 + 1] = c.g; colors[idx * 3 + 2] = c.b;
    }
    return [positions, colors];
  };

  const leoData = useMemo(() => createBeltData(leoCount, 400, 1500, 53.0), []);
  const meoData = useMemo(() => createBeltData(meoCount, 5000, 22000, 55.0), []);
  const geoData = useMemo(() => createBeltData(geoCount, 35400, 36200, 1.5), []);

  const leoRef = useRef(); const meoRef = useRef(); const geoRef = useRef();

  useFrame((state, delta) => {
    const sm = window.simTimeOffset ? 1.0 + Math.min(8.0, Math.log10(window.simTimeOffset + 1)) : 1.0;
    if (leoRef.current) leoRef.current.rotation.y += delta * 0.0032 * sm;
    if (meoRef.current) meoRef.current.rotation.y += delta * 0.0013 * sm;
    if (geoRef.current) geoRef.current.rotation.y += delta * 0.00022 * sm;
  });

  return (
    <group>
      <points ref={leoRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[leoData[0], 3]} />
          <bufferAttribute attach="attributes-color" args={[leoData[1], 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.018} vertexColors={true} transparent opacity={0.32} depthWrite={false} sizeAttenuation={true} />
      </points>
      <points ref={meoRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[meoData[0], 3]} />
          <bufferAttribute attach="attributes-color" args={[meoData[1], 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.022} vertexColors={true} transparent opacity={0.38} depthWrite={false} sizeAttenuation={true} />
      </points>
      <points ref={geoRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[geoData[0], 3]} />
          <bufferAttribute attach="attributes-color" args={[geoData[1], 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.025} vertexColors={true} transparent opacity={0.44} depthWrite={false} sizeAttenuation={true} />
      </points>
    </group>
  );
}

// ============================================================
// CONSTELLATION SATELLITE POINTS
// ============================================================
function ConstellationSatellites({ showLEO, showMEO, showGEO, showPolar, showSSO }) {
  const count = 10000;
  const orbits = useMemo(() => {
    const data = [];
    const shells = [
      { alt: 550, inc: 53.0, num: 5000, color: new THREE.Color("#0ea5e9"), type: "LEO" },
      { alt: 1100, inc: 97.6, num: 1300, color: new THREE.Color("#eab308"), type: "SSO" },
      { alt: 20180, inc: 55.0, num: 1500, color: new THREE.Color("#f97316"), type: "MEO" },
      { alt: 35786, inc: 0.1, num: 1000, color: new THREE.Color("#06b6d4"), type: "GEO" },
      { alt: 800, inc: 90.0, num: 1200, color: new THREE.Color("#e2e8f0"), type: "Polar" }
    ];
    let shellIdx = 0; let shellAccum = 0;
    for (let j = 0; j < count; j++) {
      if (j - shellAccum >= shells[shellIdx].num && shellIdx < shells.length - 1) {
        shellAccum += shells[shellIdx].num; shellIdx++;
      }
      const shell = shells[shellIdx];
      const r = (6371.0 + shell.alt) / 1000;
      const inc = THREE.MathUtils.degToRad(shell.inc + (Math.random() - 0.5) * 1.5);
      const node = THREE.MathUtils.degToRad(Math.random() * 360);
      const M0 = THREE.MathUtils.degToRad(Math.random() * 360);
      const period = 2 * Math.PI * Math.sqrt(Math.pow(6371.0 + shell.alt, 3) / MU);
      const meanMotion = (2 * Math.PI) / period;
      data.push({ r, inc, node, M0, meanMotion, color: shell.color, type: shell.type });
    }
    return data;
  }, []);

  const pointsRef = useRef();
  const positions = useMemo(() => new Float32Array(count * 3), []);
  const colors = useMemo(() => new Float32Array(count * 3), []);

  useFrame(() => {
    if (!pointsRef.current) return;
    const posArr = pointsRef.current.geometry.attributes.position.array;
    const colArr = pointsRef.current.geometry.attributes.color.array;
    const t = window.simTimeOffset ?? 0;
    for (let j = 0; j < count; j++) {
      const o = orbits[j];
      const isVisible =
        (o.type === "LEO" && showLEO) || (o.type === "MEO" && showMEO) ||
        (o.type === "GEO" && showGEO) || (o.type === "Polar" && showPolar) ||
        (o.type === "SSO" && showSSO);
      if (!isVisible) { posArr[j*3] = posArr[j*3+1] = posArr[j*3+2] = 99999; continue; }
      const M = (o.M0 + o.meanMotion * t) % (2 * Math.PI);
      const xp = o.r * Math.cos(M); const yp = o.r * Math.sin(M);
      const cn = Math.cos(o.node); const sn = Math.sin(o.node);
      const ci = Math.cos(o.inc); const si = Math.sin(o.inc);
      const x = xp * cn - yp * sn * ci;
      const y = xp * sn + yp * cn * ci;
      const z = yp * si;
      posArr[j*3] = x; posArr[j*3+1] = z; posArr[j*3+2] = y;
      colArr[j*3] = o.color.r; colArr[j*3+1] = o.color.g; colArr[j*3+2] = o.color.b;
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
    pointsRef.current.geometry.attributes.color.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.022} vertexColors={true} transparent opacity={0.38} depthWrite={false} sizeAttenuation={true} />
    </points>
  );
}

// ============================================================
// SOLAR WIND / SPACE WEATHER FLOW
// ============================================================
function SolarWindFlow() {
  const pointsRef = useRef();
  const particleCount = 220;
  const [positions, speeds] = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const spd = new Float32Array(particleCount);
    for (let idx = 0; idx < particleCount; idx++) {
      pos[idx*3] = -40 + Math.random() * 80;
      pos[idx*3+1] = -25 + Math.random() * 50;
      pos[idx*3+2] = -40 + Math.random() * 80;
      spd[idx] = 14.0 + Math.random() * 22.0;
    }
    return [pos, spd];
  }, []);

  useFrame((state, delta) => {
    if (!pointsRef.current) return;
    const posArr = pointsRef.current.geometry.attributes.position.array;
    for (let idx = 0; idx < particleCount; idx++) {
      posArr[idx*3] += speeds[idx] * delta;
      if (posArr[idx*3] > 40) {
        posArr[idx*3] = -40;
        posArr[idx*3+1] = -25 + Math.random() * 50;
        posArr[idx*3+2] = -40 + Math.random() * 80;
      }
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.1} color="#fbbf24" transparent opacity={0.28} blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  );
}

// ============================================================
// HEATMAP SHELLS
// ============================================================
function HeatmapShells() {
  const meshRef = useRef();
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.04;
      meshRef.current.rotation.x = state.clock.getElapsedTime() * 0.018;
    }
  });
  return (
    <group ref={meshRef}>
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS + 0.9, 32, 32]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.1} wireframe side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[Math.PI / 2.2, 0, 0]}>
        <ringGeometry args={[EARTH_RADIUS + 0.8, EARTH_RADIUS + 1.2, 64]} />
        <meshBasicMaterial color="#f97316" transparent opacity={0.2} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ============================================================
// CONJUNCTION THREAT VISUALIZER
// ============================================================
function ThreatWarningVisualizer({ selectedSat, debrisData, predictions }) {
  if (!selectedSat || !predictions || predictions.length === 0) return null;
  const alert = predictions.find(p => p.satellite === selectedSat.name && p.recommended_action !== "Maneuver Completed");
  if (!alert) return null;
  const debItem = debrisData.find(d => d.name === alert.debris);
  if (!debItem) return null;
  const satPos = new THREE.Vector3(selectedSat.x / 1000, selectedSat.z / 1000, selectedSat.y / 1000);
  const debPos = new THREE.Vector3(debItem.x / 1000, debItem.z / 1000, debItem.y / 1000);
  const encounterPos = new THREE.Vector3(
    (alert.x_encounter || 3460.5) / 1000,
    (alert.z_encounter || 2500.1) / 1000,
    (alert.y_encounter || 4210.2) / 1000
  );
  return (
    <group>
      <Line points={[satPos, debPos]} color="#ef4444" lineWidth={2.2} dashed={true} dashSize={0.2} gapSize={0.1} />
      <mesh position={satPos}>
        <sphereGeometry args={[0.55, 16, 16]} />
        <meshBasicMaterial color="#ef4444" transparent={true} opacity={0.12} wireframe={true} />
      </mesh>
      <mesh position={encounterPos} rotation={[Math.PI / 4, 0, Math.PI / 6]}>
        <coneGeometry args={[0.7, 2.2, 16, 1, true]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.14} wireframe side={THREE.DoubleSide} />
      </mesh>
      <mesh position={encounterPos}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshBasicMaterial color="#ef4444" toneMapped={false} />
      </mesh>
      <mesh position={encounterPos}>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.28} toneMapped={false} />
      </mesh>
      <Html position={encounterPos} center distanceFactor={14}>
        <div className="font-telemetry font-bold text-[8px] bg-red-950/90 border border-red-500 text-red-400 px-2 py-0.5 rounded whitespace-nowrap animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.6)]">
          CLOSEST APPROACH ({alert.closest_approach_km})
        </div>
      </Html>
    </group>
  );
}

// ============================================================
// SATELLITE SENSOR CONE & COVERAGE FOOTPRINT
// ============================================================
function SensorFootprint({ alignAxis, baseRadius, selectedSat }) {
  const footprintPos = useMemo(() => alignAxis.clone().multiplyScalar(EARTH_RADIUS + 0.015), [alignAxis]);
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), alignAxis), [alignAxis]);

  const coordText = useMemo(() => {
    const latDeg = Math.asin(alignAxis.y) * (180 / Math.PI);
    const lonDeg = Math.atan2(alignAxis.z, alignAxis.x) * (180 / Math.PI);
    return `${latDeg >= 0 ? "N" : "S"}${Math.abs(latDeg).toFixed(2)}° / ${lonDeg >= 0 ? "E" : "W"}${Math.abs(lonDeg).toFixed(2)}°`;
  }, [alignAxis]);

  return (
    <group position={footprintPos} quaternion={q}>
      {/* Pulsing outer ring */}
      <mesh>
        <ringGeometry args={[baseRadius * 0.95, baseRadius * 1.0, 64]} />
        <meshBasicMaterial color="#00f0ff" side={THREE.DoubleSide} transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      
      {/* Semi-transparent filled disk */}
      <mesh>
        <ringGeometry args={[0, baseRadius * 0.95, 64]} />
        <meshBasicMaterial color="#00f0ff" side={THREE.DoubleSide} transparent opacity={0.06} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      
      {/* Telemetry HTML Overlay */}
      <Html position={[0, -baseRadius * 1.05, 0]} center distanceFactor={14}>
        <div style={{
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: "7px",
          color: "#00f0ff",
          background: "rgba(2,4,16,0.85)",
          border: "1px solid rgba(0,240,255,0.4)",
          padding: "2px 6px",
          borderRadius: "3px",
          whiteSpace: "nowrap",
          boxShadow: "0 0 10px rgba(0,240,255,0.3)"
        }}>
          SCAN FOOTPRINT: {coordText}
        </div>
      </Html>
    </group>
  );
}

function SatelliteSensorCone({ selectedSat }) {
  if (!selectedSat || selectedSat.orbit_type === "DEBRIS") return null;

  const satPos = new THREE.Vector3(selectedSat.x / 1000, selectedSat.z / 1000, selectedSat.y / 1000);
  const r = satPos.length();
  const height = r - EARTH_RADIUS;
  if (height <= 0) return null;

  const midDist = r - height / 2;
  const conePos = satPos.clone().normalize().multiplyScalar(midDist);
  const fovHalfAngle = THREE.MathUtils.degToRad(11); // 11 degrees footprint
  const baseRadius = height * Math.tan(fovHalfAngle);

  const alignAxis = satPos.clone().normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), alignAxis);

  return (
    <group>
      {/* Translucent volumetric sensor cone */}
      <mesh position={conePos} quaternion={q}>
        <coneGeometry args={[baseRadius, height, 32, 1, true]} />
        <meshBasicMaterial
          color="#00f0ff"
          transparent
          opacity={0.1}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      
      {/* Wireframe overlay for a technological grid appearance */}
      <mesh position={conePos} quaternion={q}>
        <coneGeometry args={[baseRadius, height, 32, 1, true]} />
        <meshBasicMaterial
          color="#00f0ff"
          transparent
          opacity={0.04}
          wireframe
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <SensorFootprint alignAxis={alignAxis} baseRadius={baseRadius} selectedSat={selectedSat} />
    </group>
  );
}

// ============================================================
// GROUND STATIONS & TELEMETRY BEAM VISUALS
// ============================================================
const GROUND_STATIONS = [
  { name: "SGS (Norway)", lat: 78.23, lon: 15.65, color: "#06b6d4" },
  { name: "GDS (California)", lat: 35.42, lon: -116.89, color: "#f97316" },
  { name: "HBK (South Africa)", lat: -25.88, lon: 27.70, color: "#eab308" },
  { name: "ISTRAC (India)", lat: 13.03, lon: 77.51, color: "#10b981" },
  { name: "KRU (French Guiana)", lat: 5.25, lon: -52.79, color: "#ef4444" }
];

function getGSWorldPos(gs, elapsed, timeOffset) {
  const R = EARTH_RADIUS;
  const latRad = THREE.MathUtils.degToRad(gs.lat);
  const lonRad = THREE.MathUtils.degToRad(gs.lon);

  const localPos = new THREE.Vector3(
    Math.cos(latRad) * Math.cos(lonRad),
    Math.sin(latRad),
    Math.cos(latRad) * Math.sin(lonRad)
  );

  const EARTH_SIDEREAL_DAY = 86164.1;
  const physicsRotation = (2 * Math.PI / EARTH_SIDEREAL_DAY) * timeOffset;
  const visualBase = elapsed * 0.052;
  const earthRotation = -Math.PI / 2 + physicsRotation + visualBase;

  const rotX = localPos.x * Math.cos(earthRotation) + localPos.z * Math.sin(earthRotation);
  const rotZ = -localPos.x * Math.sin(earthRotation) + localPos.z * Math.cos(earthRotation);
  const rotY = localPos.y;

  const tiltedPos = new THREE.Vector3(rotX, rotY, rotZ);

  const EARTH_AXIAL_TILT = THREE.MathUtils.degToRad(23.5);
  const cosTilt = Math.cos(EARTH_AXIAL_TILT);
  const sinTilt = Math.sin(EARTH_AXIAL_TILT);

  const worldPos = new THREE.Vector3(
    tiltedPos.x * R,
    (tiltedPos.y * cosTilt - tiltedPos.z * sinTilt) * R,
    (tiltedPos.y * sinTilt + tiltedPos.z * cosTilt) * R
  );

  return worldPos;
}

function GroundStations() {
  const R = EARTH_RADIUS;
  return (
    <group>
      {GROUND_STATIONS.map((gs) => {
        const latRad = THREE.MathUtils.degToRad(gs.lat);
        const lonRad = THREE.MathUtils.degToRad(gs.lon);
        const pos = new THREE.Vector3(
          R * Math.cos(latRad) * Math.cos(lonRad),
          R * Math.sin(latRad),
          R * Math.cos(latRad) * Math.sin(lonRad)
        );
        const normal = pos.clone().normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
        return (
          <group key={gs.name} position={pos} quaternion={q}>
            {/* Radar dome */}
            <mesh>
              <sphereGeometry args={[0.07, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshBasicMaterial color={gs.color} transparent opacity={0.8} />
            </mesh>
            {/* Ground ring */}
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.08, 0.15, 32]} />
              <meshBasicMaterial color={gs.color} side={THREE.DoubleSide} transparent opacity={0.25} />
            </mesh>
            {/* Label marker dot */}
            <mesh position={[0, 0.08, 0]}>
              <sphereGeometry args={[0.02, 8, 8]} />
              <meshBasicMaterial color="#fff" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function GroundStationsLinkBeam({ selectedSat }) {
  const [activeGS, setActiveGS] = useState(null);
  const lineRef = useRef();

  useFrame((state) => {
    if (!selectedSat || selectedSat.orbit_type === "DEBRIS") {
      window.activeGroundLink = null;
      if (activeGS) setActiveGS(null);
      return;
    }

    const t = window.simTimeOffset ?? 0;
    const elapsed = state.clock.getElapsedTime();
    const satWorldPos = new THREE.Vector3(selectedSat.x / 1000, selectedSat.z / 1000, selectedSat.y / 1000);
    const satVel = new THREE.Vector3(selectedSat.vx ?? 0, selectedSat.vz ?? 0, selectedSat.vy ?? 0);

    let bestGS = null;
    let maxCosElev = -1;
    let bestGSWorldPos = null;

    GROUND_STATIONS.forEach((gs) => {
      const gsWorldPos = getGSWorldPos(gs, elapsed, t);
      const gsNormal = gsWorldPos.clone().normalize();
      const lookVec = satWorldPos.clone().sub(gsWorldPos);
      const lookDir = lookVec.clone().normalize();

      const cosElev = gsNormal.dot(lookDir);
      if (cosElev > 0.08) { // elevation > ~5 degrees
        if (cosElev > maxCosElev) {
          maxCosElev = cosElev;
          bestGS = gs;
          bestGSWorldPos = gsWorldPos;
        }
      }
    });

    if (bestGS && bestGSWorldPos) {
      const gsWorldPos = bestGSWorldPos;
      const lookVec = satWorldPos.clone().sub(gsWorldPos);
      const distKm = lookVec.length() * 1000;
      const lookDir = lookVec.clone().normalize();

      const radialVel = satVel.dot(lookDir); // Doppler factor
      const latencyMs = (distKm / 299792.458) * 1000;
      
      const carrierFreqHz = 8.4e9; // 8.4 GHz
      const dopplerShiftKHz = ((carrierFreqHz * (radialVel / 299792.458)) / 1000);

      const snr = Math.max(3.2, 85.0 - 20 * Math.log10(distKm));
      const bitErrorRate = Math.max(1e-9, 1e-3 / (1.0 + Math.pow(snr / 8.0, 3.5)));

      window.activeGroundLink = {
        name: bestGS.name,
        distance: distKm.toFixed(1),
        elevation: (Math.asin(maxCosElev) * (180 / Math.PI)).toFixed(1),
        latency: latencyMs.toFixed(2),
        doppler: dopplerShiftKHz.toFixed(2),
        snr: snr.toFixed(1),
        ber: bitErrorRate.toExponential(1),
        color: bestGS.color
      };

      if (!activeGS || activeGS.name !== bestGS.name) {
        setActiveGS(bestGS);
      }

      if (lineRef.current) {
        lineRef.current.geometry.setFromPoints([gsWorldPos, satWorldPos]);
      }
    } else {
      window.activeGroundLink = null;
      if (activeGS) setActiveGS(null);
    }
  });

  if (!activeGS || !selectedSat) return null;

  return (
    <group>
      <Line
        ref={lineRef}
        points={[new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0)]}
        color={activeGS.color}
        lineWidth={1.2}
        dashed={true}
        dashSize={0.12}
        gapSize={0.06}
        transparent
        opacity={0.65}
      />
    </group>
  );
}

// ============================================================
// VISUAL MAGNETOSPHERE FIELD LINES (Space situational B-field)
// ============================================================
function MagnetosphereFieldLines({ sunDirection }) {
  const groupRef = useRef();

  const loops = useMemo(() => {
    const lines = [];
    const phiSteps = 8;
    const pointsPerLoop = 40;
    const shellRadii = [EARTH_RADIUS * 1.35, EARTH_RADIUS * 1.65, EARTH_RADIUS * 2.0];

    shellRadii.forEach((r0) => {
      for (let p = 0; p < phiSteps; p++) {
        const phi = (p / phiSteps) * Math.PI * 2;
        const pts = [];
        const minTheta = 0.3;
        const maxTheta = Math.PI - 0.3;

        for (let i = 0; i <= pointsPerLoop; i++) {
          const theta = minTheta + (i / pointsPerLoop) * (maxTheta - minTheta);
          const sinTheta = Math.sin(theta);
          const r = r0 * sinTheta * sinTheta;

          const y = r * Math.cos(theta);
          const x = r * sinTheta * Math.cos(phi);
          const z = r * sinTheta * Math.sin(phi);

          // Magnetotail stretching away from the sun
          const dist = r;
          const tailStretch = Math.pow(dist / EARTH_RADIUS, 1.8) * 0.15;
          const oppositeSun = sunDirection.clone().multiplyScalar(-1);
          const pos = new THREE.Vector3(x, y, z).add(oppositeSun.multiplyScalar(tailStretch));

          pts.push(pos);
        }
        lines.push(pts);
      }
    });
    return lines;
  }, [sunDirection]);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.getElapsedTime() * 0.04;
    }
  });

  const bowShockPos = useMemo(() => sunDirection.clone().multiplyScalar(EARTH_RADIUS * 2.05), [sunDirection]);
  const bowShockRotation = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), sunDirection), [sunDirection]);

  return (
    <group ref={groupRef} rotation={[EARTH_AXIAL_TILT, 0, 0]}>
      {/* Magnetic field line loops */}
      {loops.map((pts, idx) => (
        <Line
          key={idx}
          points={pts}
          color="#06b6d4"
          lineWidth={0.35}
          opacity={0.16}
          transparent
          depthWrite={false}
        />
      ))}

      {/* Bow Shock boundary facing solar wind */}
      <group position={bowShockPos} quaternion={bowShockRotation}>
        <mesh>
          <ringGeometry args={[0, EARTH_RADIUS * 1.4, 32]} />
          <meshBasicMaterial
            color="#38bdf8"
            transparent
            opacity={0.06}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <mesh>
          <ringGeometry args={[EARTH_RADIUS * 1.36, EARTH_RADIUS * 1.4, 64]} />
          <meshBasicMaterial
            color="#38bdf8"
            transparent
            opacity={0.4}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
}

// ============================================================
// MAIN EXPORT
// ============================================================
export default function SpaceCanvas({
  satellites,
  debris,
  selectedSat,
  onSelectSat,
  predictions,
  cameraMode,
  thrusterActive,
  showOrbits = true,
  showDebris = true,
  showSpaceWeather = false,
  showHeatmap = false,
  showLEO = true,
  showMEO = true,
  showGEO = true,
  showPolar = true,
  showSSO = true,
  selectedSatName = null
}) {
  const sunDirection = useMemo(() => new THREE.Vector3(-2.2, 0.8, -1.2).normalize(), []);
  const resetViewRef = useRef(null);

  const handleResetView = () => {
    if (resetViewRef.current) resetViewRef.current();
    onSelectSat(null);
  };

  return (
    <div className="w-full h-full relative scanlines">
      {/* ── RESET VIEW BUTTON ── */}
      {selectedSat && (
        <button
          onClick={handleResetView}
          title="Reset to global view"
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 14px",
            background: "rgba(4,8,26,0.88)",
            border: "1px solid rgba(14,165,233,0.55)",
            borderRadius: 20,
            color: "#0ea5e9",
            fontSize: 10,
            fontWeight: 700,
            fontFamily: "'Rajdhani', sans-serif",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            cursor: "pointer",
            boxShadow: "0 0 16px rgba(14,165,233,0.25), inset 0 1px 0 rgba(255,255,255,0.06)",
            backdropFilter: "blur(12px)",
            transition: "all 0.18s ease",
            pointerEvents: "auto",
            whiteSpace: "nowrap",
            animation: "fade-in 0.25s ease forwards"
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(14,165,233,0.2)"; e.currentTarget.style.boxShadow = "0 0 24px rgba(14,165,233,0.45)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(4,8,26,0.88)"; e.currentTarget.style.boxShadow = "0 0 16px rgba(14,165,233,0.25)"; }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 .49-3.65"/>
          </svg>
          Reset View
        </button>
      )}

      <Canvas
        camera={{ position: [0, 0, 26.0], fov: 38, near: 0.1, far: 300 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      >
        <color attach="background" args={["#000004"]} />
        <ambientLight intensity={0.08} />
        <directionalLight position={[-22, 8, -12]} intensity={5.0} color="#fff5e0" />
        <pointLight position={[-22, 8, -12]} intensity={1.5} distance={120} color="#ffe080" />

        {/* Deep Space + Milky Way */}
        <SpaceEnvironment />

        {/* Stars */}
        <Stars radius={140} depth={55} count={8000} factor={7} saturation={0.9} fade speed={0.8} />

        {/* Cinematic Sun */}
        <CinematicSun />

        {/* Ultra-Realistic Earth */}
        <Earth sunDirection={sunDirection} />

        {/* Orbit Lines — selected orbit highlighted, others dimmed */}
        {showOrbits && satellites.map((sat) => {
          const isVisible =
            (sat.orbit_type === "LEO" && showLEO) || (sat.orbit_type === "MEO" && showMEO) ||
            (sat.orbit_type === "GEO" && showGEO) || (sat.orbit_type === "Polar" && showPolar) ||
            (sat.orbit_type === "SSO" && showSSO);
          if (!isVisible) return null;
          let orbitColor = getOrbitColor(sat.orbit_type);
          if (predictions && predictions.some(p => p.satellite === sat.name && p.recommended_action !== "Maneuver Completed")) {
            orbitColor = "#ef4444";
          }
          const isSatSelected = sat.name === selectedSatName;
          const hasAnySelection = !!selectedSatName;
          return (
            <OrbitLine
              key={`orbit-${sat.name}`}
              satellite={sat}
              color={orbitColor}
              isSelected={isSatSelected}
              hasSelection={hasAnySelection}
            />
          );
        })}

        {/* Debris Layer */}
        {showDebris && (
          <>
            <BackgroundDebrisParticles />
            <ActiveDebrisGroup debris={debris} onSelect={onSelectSat} selectedSat={selectedSat} />
          </>
        )}

        {/* Constellation satellite dots */}
        {showOrbits && (
          <ConstellationSatellites
            showLEO={showLEO} showMEO={showMEO} showGEO={showGEO}
            showPolar={showPolar} showSSO={showSSO}
          />
        )}

        {/* Space Weather */}
        {showSpaceWeather && <SolarWindFlow />}
        {showSpaceWeather && <MagnetosphereFieldLines sunDirection={sunDirection} />}
        {showHeatmap && <HeatmapShells />}

        {/* Satellites */}
        <ActiveSatellitesGroup
          satellites={satellites}
          onSelect={onSelectSat}
          selectedSat={selectedSat}
          predictions={predictions}
          thrusterActive={thrusterActive}
          showLEO={showLEO} showMEO={showMEO} showGEO={showGEO}
          showPolar={showPolar} showSSO={showSSO}
        />

        {/* Threat Warning */}
        <ThreatWarningVisualizer selectedSat={selectedSat} debrisData={debris} predictions={predictions} />

        {/* Satellite Sensor Cone */}
        <SatelliteSensorCone selectedSat={selectedSat} />

        {/* Telemetry Link Beam */}
        <GroundStationsLinkBeam selectedSat={selectedSat} />

        {/* Background click to deselect */}
        <BackgroundClickPlane onClickBackground={() => onSelectSat(null)} />

        <CameraController selectedSat={selectedSat} cameraMode={cameraMode} />
        <ResetViewController resetRef={resetViewRef} />

        <OrbitControls
          enablePan={cameraMode !== "pov"}
          enableZoom={true}
          enableRotate={true}
          minDistance={cameraMode === "pov" ? 0.2 : (cameraMode === "tracking" && selectedSat ? 1.2 : 8.2)}
          maxDistance={cameraMode === "pov" ? 3.0 : (cameraMode === "tracking" && selectedSat ? 40.0 : 90.0)}
          makeDefault
        />

        {/* Post-Processing — tuned for clean cinematic look */}
        <EffectComposer>
          <Bloom
            luminanceThreshold={0.12}
            luminanceSmoothing={0.78}
            height={512}
            intensity={1.2}
            blendFunction={BlendFunction.SCREEN}
          />
          <ChromaticAberration
            offset={[0.00015, 0.00015]}
            blendFunction={BlendFunction.NORMAL}
          />
          <Vignette
            darkness={0.6}
            offset={0.32}
            blendFunction={BlendFunction.NORMAL}
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
