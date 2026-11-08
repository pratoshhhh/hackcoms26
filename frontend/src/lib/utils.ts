import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Read a design token (RGB channels) as a CSS color string usable by MapLibre / Three.js. */
export function token(name: string, alpha = 1): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  const [r, g, b] = raw.split(/\s+/).map(Number);
  return alpha >= 1 && alpha !== 0 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
