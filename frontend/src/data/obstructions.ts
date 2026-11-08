import type { Hydrant, ObstructionType } from "@/types";
import { hash } from "@/utils/random";

/**
 * Specific, field-report style descriptions used by the simulator. In production these
 * come from the reporter, the reviewer, or Gemini's photo classification.
 * NY parking rule referenced: no parking within 15 ft of a hydrant.
 */
export const OBSTRUCTION_DETAILS: Record<ObstructionType, string[]> = {
  snow: [
    "Plow windrow about 1.2 m high, pumper nozzle fully covered",
    "Snow bank from sidewalk clearing, only the bonnet is visible",
    "Drifted snow roughly 80 cm deep on the street side",
    "Snow pushed off a parking lot and piled onto the hydrant",
  ],
  vehicle: [
    "Gray sedan parked about 1 m from the hydrant, inside the 15 ft no-parking zone",
    "Delivery van double-parked across the hydrant",
    "Pickup truck parked at the curb with its bumper over the hydrant",
    "Contractor trailer left at the curb in front of the hydrant",
  ],
  debris: [
    "Moving boxes and a mattress left at the curb against the hydrant",
    "Construction barrels and a sand pile from road work",
    "Trash and recycling totes lined up in front of the hydrant",
    "Yard-waste bags stacked around the base",
  ],
  vegetation: [
    "Overgrown hedge covering the hydrant on three sides",
    "Fallen tree limb lying across the curb strip",
    "Tall brush hiding the hydrant from the street",
  ],
  ice: [
    "Ice encasing the base after a freeze-thaw cycle",
    "Frozen plow slush, outlet caps frozen in place",
    "Ice sheet from downspout runoff covering the curb",
  ],
};

export function pickDetail(type: ObstructionType, ...seed: (string | number)[]): string {
  const list = OBSTRUCTION_DETAILS[type];
  return list[hash(type, ...seed) % list.length];
}

/** "66 Eastland Ave, Rochester, NY 14618" with an honest qualifier. */
export function addressLine(h: Pick<Hydrant, "address" | "addressPrecision" | "street" | "neighborhood">): string {
  if (!h.address) return `${h.street}, ${h.neighborhood} (approximate)`;
  return h.addressPrecision === "front" ? h.address : `Near ${h.address}`;
}
