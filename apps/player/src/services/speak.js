// Avisos falados e bipes (chamada de senhas, alerta urgente, cronômetro). Tudo gerado na hora.
let ctx;
function audio() {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Bipes: lista de [frequência, início em s, duração em s]. */
export function tones(list, volume = 0.5) {
  try {
    const c = audio();
    const t0 = c.currentTime + 0.02;
    for (const [freq, at, dur = 0.25] of list) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), t0 + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g).connect(c.destination);
      o.start(t0 + at);
      o.stop(t0 + at + dur + 0.05);
    }
  } catch (e) {
    console.warn('[vx] som', e);
  }
}

export const dingDong = (v) => tones([[880, 0, 0.6], [659.25, 0.45, 0.9]], v);
export const alarm = (v) => tones([[740, 0, 0.3], [988, 0.35, 0.3], [740, 0.7, 0.3], [988, 1.05, 0.3]], v);
export const beep = (high = false, v) => tones([[high ? 1320 : 880, 0, high ? 0.6 : 0.18]], v);

/** Fala em português, se o aparelho tiver voz instalada. */
export function speak(text, rate = 0.95) {
  try {
    const s = window.speechSynthesis;
    if (!s || !text) return;
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR';
    u.rate = rate;
    const v = s.getVoices().find((x) => /^pt(-|_)BR/i.test(x.lang)) || s.getVoices().find((x) => /^pt/i.test(x.lang));
    if (v) u.voice = v;
    s.speak(u);
  } catch (e) {
    console.warn('[vx] voz', e);
  }
}
