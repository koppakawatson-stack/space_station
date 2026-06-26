// Web Audio API Synthesizer Service for Premium Sci-Fi Sound Effects
let audioCtx = null;
let isMuted = false;

// Initialize AudioContext lazily on user interaction
function getAudioContext() {
  if (isMuted) return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

export const soundService = {
  isMuted() {
    return isMuted;
  },

  setMuted(muted) {
    isMuted = muted;
    if (muted && audioCtx) {
      audioCtx.suspend();
    } else if (!muted && audioCtx) {
      audioCtx.resume();
    }
  },

  toggleMute() {
    this.setMuted(!isMuted);
    return isMuted;
  },

  // Subtle telemetry tick on button/item hover
  playHover() {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      // Quick descending click
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(700, now + 0.03);

      gain.gain.setValueAtTime(0.015, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.03);
    } catch (e) {
      console.warn("Audio playback failed:", e);
    }
  },

  // Futuristic electronic chirp on button click
  playClick() {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      // Quick sci-fi chirp upward
      osc.frequency.setValueAtTime(450, now);
      osc.frequency.exponentialRampToValueAtTime(1000, now + 0.06);

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.06);
    } catch (e) {
      console.warn("Audio playback failed:", e);
    }
  },

  // Pleasant double chime for selects / activations
  playSelect() {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      
      // Tone 1: C5 (523.25 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0.035, now);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.15);

      // Tone 2: G5 (783.99 Hz) delayed slightly
      const delay = 0.06;
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(783.99, now + delay);
      gain2.gain.setValueAtTime(0.035, now + delay);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.2);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + delay);
      osc2.stop(now + delay + 0.2);

    } catch (e) {
      console.warn("Audio playback failed:", e);
    }
  },

  // Thruster charge alarm / swoosh sound when firing engine maneuvers
  playManeuver() {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const duration = 0.8;
      
      const osc = ctx.createOscillator();
      const modulation = ctx.createOscillator();
      const modGain = ctx.createGain();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.linearRampToValueAtTime(680, now + duration);

      // LFO modulation for rumbling engine feel
      modulation.frequency.setValueAtTime(32, now);
      modGain.gain.setValueAtTime(25, now);
      
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.linearRampToValueAtTime(0.09, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      modulation.connect(modGain);
      modGain.connect(osc.frequency);
      osc.connect(gain);
      gain.connect(ctx.destination);

      modulation.start(now);
      osc.start(now);

      modulation.stop(now + duration);
      osc.stop(now + duration);
    } catch (e) {
      console.warn("Audio playback failed:", e);
    }
  },

  // Alarm sound for critical threats / warning triggers
  playWarning() {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const duration = 0.45;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      // Pulsing frequency (two-tone siren style)
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.setValueAtTime(460, now + 0.15);
      osc.frequency.setValueAtTime(580, now + 0.3);

      gain.gain.setValueAtTime(0.045, now);
      gain.gain.linearRampToValueAtTime(0.045, now + 0.35);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {
      console.warn("Audio playback failed:", e);
    }
  }
};
