// Short synthesized feedback sounds (Web Audio, no files).
// The AudioContext is created lazily inside a user gesture so iOS lets it play.

let ctx = null;

function context() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Call from any user gesture (keypress, tap) so the first sound is not delayed. */
export function unlockAudio() {
  try { context(); } catch { /* no audio available */ }
}

function tone(c, freq, at, dur, type, vol) {
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const C6 = 1046.5, E6 = 1318.5, G6 = 1568;
const G4 = 392, E4 = 329.6, C4 = 261.6;

/** Rising 8-bit arpeggio C6 → E6 → G6. */
export function playCorrect() {
  try {
    const c = context();
    if (!c) return;
    tone(c, C6, 0, 0.06, 'square', 0.32);
    tone(c, E6, 0.06, 0.06, 'square', 0.32);
    tone(c, G6, 0.12, 0.14, 'square', 0.32);
  } catch { /* ignore */ }
}

/** Falling soft triad G4 → E4 → C4. */
export function playWrong() {
  try {
    const c = context();
    if (!c) return;
    tone(c, G4, 0, 0.09, 'sine', 1.0);
    tone(c, E4, 0.08, 0.09, 'sine', 1.0);
    tone(c, C4, 0.16, 0.18, 'sine', 1.0);
  } catch { /* ignore */ }
}
