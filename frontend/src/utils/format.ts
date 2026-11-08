import { format, formatDistanceStrict } from "date-fns";

export function ago(t: number, now: number): string {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function duration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function between(a: number, b: number): string {
  return formatDistanceStrict(a, b);
}

export const fmtTime = (t: number) => format(t, "HH:mm:ss");
export const fmtDateTime = (t: number) => format(t, "MMM d, HH:mm");
export const fmtDate = (t: number) => format(t, "MMM d, yyyy");

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
