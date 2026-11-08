// Deterministic pseudo-randomness so mock data is stable across renders and reloads.

/** 32-bit string/number hash (FNV-1a). */
export function hash(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG — returns a function producing floats in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash → [0,1). */
export function unit(...parts: (string | number)[]): number {
  return hash(...parts) / 4294967296;
}

/** Smooth 1D value noise in [-1, 1] — consistent for any sampling resolution. */
export function noise1d(seed: number, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = unit(seed, i) * 2 - 1;
  const b = unit(seed, i + 1) * 2 - 1;
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

export function pick<T>(r: () => number, items: readonly T[]): T {
  return items[Math.floor(r() * items.length)];
}

export function weighted<T>(r: () => number, items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of items) {
    if ((x -= w) < 0) return v;
  }
  return items[items.length - 1][0];
}
