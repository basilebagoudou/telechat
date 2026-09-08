export type RingKind = "ringback" | "ringtone";

function beep(
  ctx: AudioContext,
  freq: number,
  start: number,
  duration: number,
  gainPeak: number
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);

  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(gainPeak, start + 0.02);
  gain.gain.setValueAtTime(gainPeak, Math.max(start + 0.02, start + duration - 0.03));
  gain.gain.linearRampToValueAtTime(0, start + duration);

  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function createRinger() {
  let ctx: AudioContext | null = null;
  let timeoutId: number | null = null;

  function ensureContext() {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }

  function stop() {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
  }

  function start(kind: RingKind) {
    stop();
    const context = ensureContext();
    const cycleMs = kind === "ringback" ? 3000 : 1600;

    function tick() {
      const now = context.currentTime + 0.05;
      if (kind === "ringback") {
        // classic outgoing "brr brr" dial tone
        beep(context, 425, now, 1.2, 0.12);
      } else {
        // incoming "ring ring" — two short beeps per cycle
        beep(context, 880, now, 0.22, 0.2);
        beep(context, 880, now + 0.32, 0.22, 0.2);
      }
      timeoutId = window.setTimeout(tick, cycleMs);
    }
    tick();
  }

  function dispose() {
    stop();
    ctx?.close();
    ctx = null;
  }

  // Call this from a real user gesture (a tap/click anywhere in the app) well
  // before any ring is expected. Mobile browsers only let a page play audio
  // it generates itself — as opposed to audio from a user-initiated <audio>
  // element — after such a gesture has unlocked the AudioContext at least
  // once; an incoming call arrives over the network with no gesture of its
  // own, so without this, the ringtone silently never plays for the callee.
  function warm() {
    ensureContext();
  }

  // A single short "new message" ding, independent of the looping start/stop
  // used for calls. Relies on the same warm-up as the ringtone.
  function ping() {
    const context = ensureContext();
    const now = context.currentTime + 0.02;
    beep(context, 700, now, 0.14, 0.15);
  }

  return { start, stop, dispose, warm, ping };
}

// Shared across the tab: once a tap anywhere unlocks the underlying
// AudioContext, it stays unlocked when navigating between conversations.
export const sharedRinger = createRinger();
