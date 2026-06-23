/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: "#050814",
          panel: "rgba(10, 18, 42, 0.75)",
          border: "#1e293b",
          blue: "#0ea5e9", // LEO
          orange: "#f97316", // MEO
          cyan: "#06b6d4", // GEO
          red: "#ef4444", // Debris Critical
          yellow: "#eab308", // Debris Medium
          green: "#10b981", // Debris Safe
          glow: "#38bdf8",
        }
      },
      fontFamily: {
        telemetry: ["Share Tech Mono", "Courier New", "monospace"],
        hud: ["Rajdhani", "Inter", "sans-serif"],
        sans: ["Inter", "sans-serif"],
      },
      boxShadow: {
        'glow-blue': '0 0 15px rgba(14, 165, 233, 0.45)',
        'glow-red': '0 0 15px rgba(239, 68, 68, 0.6)',
        'glow-cyan': '0 0 15px rgba(6, 182, 212, 0.45)',
        'glow-orange': '0 0 15px rgba(249, 115, 22, 0.45)',
      }
    },
  },
  plugins: [],
}
