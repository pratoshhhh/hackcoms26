export type LngLat = [number, number];

const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Haversine distance in metres. */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Approximate distance (metres) from point to segment, using a local equirectangular projection. */
export function distanceToSegmentM(lat: number, lng: number, a: LngLat, b: LngLat): number {
  const kx = Math.cos(toRad(lat)) * 111320;
  const ky = 110540;
  const px = lng * kx, py = lat * ky;
  const ax = a[0] * kx, ay = a[1] * ky;
  const bx = b[0] * kx, by = b[1] * ky;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Parse "43.155, -77.61" or "43.155 -77.61" into lat/lng if inside a sane range. */
export function parseCoordinates(input: string): { lat: number; lng: number } | null {
  const m = input.trim().match(/^(-?\d{1,2}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function formatCoord(lat: number, lng: number, digits = 5): string {
  return `${lat.toFixed(digits)}, ${lng.toFixed(digits)}`;
}
