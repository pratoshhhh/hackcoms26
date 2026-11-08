/**
 * alertAudio — audible alerts for the live demo: a synthesized tone per alert kind
 * (Web Audio, no sound files) followed by a spoken announcement (Web Speech API).
 *
 * Browsers block audio until the user interacts with the page, so unlockAudio() must
 * run from a click or key press before the first alert can be heard.
 */
import type { Alert, AlertKind, Hydrant } from "@/types";
import { OBSTRUCTION_LABELS } from "./analyticsService";

let ctx: AudioContext | null = null;
let toneBusyUntil = 0;

export function unlockAudio(): void {
  if (typeof window === "undefined" || !("AudioContext" in window)) return;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}

export const audioUnlocked = () => ctx?.state === "running";
export const speechSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;

function note(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.18, toFreq?: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (toFreq) osc.frequency.linearRampToValueAtTime(toFreq, start + dur);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(vol, start + 0.015);
  gain.gain.setValueAtTime(vol, start + dur - 0.04);
  gain.gain.linearRampToValueAtTime(0, start + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

/** Plays the tone for an alert kind and returns its length in ms (0 if nothing played). */
function playTone(kind: AlertKind): number {
  if (!ctx || ctx.state !== "running") return 0;
  const now = ctx.currentTime;
  if (performance.now() < toneBusyUntil) return 0;
  let dur = 0;
  switch (kind) {
    case "blocked":
      // Hi-lo two-tone siren, three cycles.
      for (let i = 0; i < 6; i++) note(ctx, i % 2 ? 660 : 880, now + i * 0.32, 0.3, "square", 0.08);
      dur = 1.92;
      break;
    case "warning":
    case "report":
      note(ctx, 880, now, 0.14, "triangle");
      note(ctx, 880, now + 0.22, 0.14, "triangle");
      dur = 0.4;
      break;
    case "offline":
      note(ctx, 620, now, 0.5, "sine", 0.18, 310);
      dur = 0.55;
      break;
    case "cleared":
    case "restored":
      [523, 659, 784].forEach((f, i) => note(ctx!, f, now + i * 0.13, 0.16, "sine"));
      dur = 0.45;
      break;
  }
  toneBusyUntil = performance.now() + dur * 1000;
  return dur * 1000;
}

/** "ROC-0042" → "42", read naturally by speech engines. */
const spokenId = (id: string) => id.replace(/^[A-Z]+-0*/, "") || id;
/** Street part only: "66 Eastland Ave, Rochester, NY 14618" → "66 Eastland Ave". */
const spokenPlace = (h: Hydrant) => (h.address ?? `${h.street}, ${h.neighborhood}`).split(",")[0].replace(/\(approximate\)/, "").trim();

export function spokenAlert(kind: AlertKind, h: Hydrant): string {
  const n = spokenId(h.id);
  const place = spokenPlace(h);
  const what = h.obstructionType ? OBSTRUCTION_LABELS[h.obstructionType].toLowerCase() : "an obstruction";
  switch (kind) {
    case "blocked":
      return `Alert. Hydrant ${n} at ${place} is blocked by ${what}. Sensor confirmed.`;
    case "warning":
      return `Caution. Possible obstruction at hydrant ${n}, ${place}.`;
    case "cleared":
      return `Hydrant ${n} at ${place} is clear again.`;
    case "offline":
      return `Hydrant ${n} sensor is offline.`;
    case "restored":
      return `Hydrant ${n} sensor is back online.`;
    case "report":
      return `Community report. Possible obstruction at hydrant ${n}, ${place}.`;
  }
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
  return voices.find((v) => /natural|google us english|aria|jenny|samantha/i.test(v.name)) ?? voices.find((v) => v.lang === "en-US") ?? voices[0];
}

function speak(text: string, interrupt: boolean) {
  if (!speechSupported()) return;
  const synth = window.speechSynthesis;
  if (interrupt) synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 1;
  const voice = pickVoice();
  if (voice) u.voice = voice;
  synth.speak(u);
}

export function announce(alert: Pick<Alert, "kind">, h: Hydrant, opts: { voice: boolean }): void {
  const toneMs = playTone(alert.kind);
  if (!opts.voice) return;
  const text = spokenAlert(alert.kind, h);
  // A confirmed block cuts off whatever is still being read out.
  window.setTimeout(() => speak(text, alert.kind === "blocked"), toneMs);
}
