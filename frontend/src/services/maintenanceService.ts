/**
 * maintenanceService — volunteer task lifecycle and *simulated* evidence verification.
 *
 * Future integration:
 *   claim     → POST /api/v1/incidents/{id}/claim
 *   evidence  → POST /api/v1/claims/{id}/photos   (multipart, QR token)
 *   verify    → backend runs Gemini + OpenCV + sensor cross-check, pushes claim.verification_ready
 *   approve   → POST /api/v1/claims/{id}/review   → Solana Devnet payout (server-side)
 *
 * verify() below is a deterministic rule set over the evidence we have. It does not
 * look at image content and must never be presented as AI analysis.
 */
import type { Hydrant, Incident, MaintenanceTask, VerificationResult } from "@/types";
import { BLOCK_THRESHOLD_CM, CLEAR_THRESHOLD_CM } from "./telemetryService";

export function bountyFor(urgency: MaintenanceTask["urgency"]): number {
  return urgency === "urgent" ? 15 : urgency === "priority" ? 10 : 5;
}

export function taskFromIncident(incident: Incident, hydrant: Hydrant, now: number): MaintenanceTask {
  const urgency: MaintenanceTask["urgency"] =
    incident.severity === "critical" ? (hydrant.riskLevel === "critical" || hydrant.riskLevel === "high" ? "urgent" : "priority") : "routine";
  return {
    id: `TSK-${incident.id.replace(/^INC-/, "")}`,
    hydrantId: hydrant.id,
    incidentId: incident.id,
    obstructionType: incident.obstructionType ?? "debris",
    urgency,
    bountyUsdc: bountyFor(urgency),
    status: "open",
    qrVerified: false,
    reward: { status: "none" },
    timeline: [{ status: "open", at: Math.min(now, incident.startedAt + 60000), note: "Task created from incident" }],
    createdAt: incident.startedAt,
  };
}

export function verify(task: MaintenanceTask, hydrant: Hydrant, latestDistance: number | null, now: number): VerificationResult {
  const hasBoth = Boolean(task.beforePhoto && task.afterPhoto);
  const identical = hasBoth && task.beforePhoto === task.afterPhoto;
  const sensorClear = hydrant.status === "clear" && latestDistance !== null && latestDistance > CLEAR_THRESHOLD_CM;
  const sensorOffline = hydrant.status === "offline";

  const checks = [
    { label: "QR code matches hydrant", passed: task.qrVerified, detail: task.qrVerified ? `Scanned ${hydrant.id}` : "QR scan not completed" },
    { label: "Before and after photos", passed: hasBoth, detail: hasBoth ? "Both photos attached" : "One or both photos missing" },
    { label: "Photos differ", passed: hasBoth && !identical, detail: identical ? "The two photos are the same file" : hasBoth ? "Files differ (simulated comparison)" : "—" },
    {
      label: "Sensor confirms clearance",
      passed: sensorClear,
      detail: sensorOffline
        ? "Device offline — no fresh reading"
        : latestDistance === null
          ? "No reading"
          : `${latestDistance.toFixed(0)} cm (block < ${BLOCK_THRESHOLD_CM}, clear > ${CLEAR_THRESHOLD_CM})`,
    },
  ];

  let state: VerificationResult["state"];
  let summary: string;
  let confidence: number;
  if (!hasBoth) {
    state = "pending_review";
    confidence = 0;
    summary = "Waiting for both photos before a recommendation can be made.";
  } else if (identical) {
    state = "rejected";
    confidence = 0.1;
    summary = "Before and after photos are identical, so clearance can't be shown.";
  } else if (!task.qrVerified || sensorOffline || !sensorClear) {
    state = "needs_inspection";
    confidence = sensorClear ? 0.55 : 0.35;
    summary = !sensorClear
      ? `Photos submitted, but the sensor still reads ${latestDistance === null ? "no data" : `${latestDistance.toFixed(0)} cm`}. Send an inspector before approving.`
      : "Sensor agrees, but the QR scan is missing. Confirm the volunteer was on site.";
  } else {
    state = "likely_cleared";
    confidence = 0.86;
    summary = `Evidence and sensor agree: ${hydrant.id} reads ${latestDistance!.toFixed(0)} cm clearance. Ready for reviewer approval.`;
  }
  return { state, confidence, obstructionType: task.obstructionType, checks, summary, generatedAt: now, simulated: true };
}

/** Clearly fake, Solana-shaped signature for the simulated reward state. */
export function simulatedSignature(seed: string): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let h = 0;
  let out = "";
  for (let i = 0; i < 88; i++) {
    h = (h * 31 + seed.charCodeAt(i % seed.length) + i) >>> 0;
    out += alphabet[h % alphabet.length];
  }
  return out;
}

/** Illustrative sample photos (SVG) so judges can run the flow without a camera. */
export function samplePhoto(kind: "before" | "after", obstruction: string): string {
  const snow = kind === "before";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'>
  <rect width='400' height='300' fill='rgb(40,48,60)'/>
  <rect y='210' width='400' height='90' fill='rgb(70,76,86)'/>
  <rect x='182' y='120' width='36' height='100' rx='6' fill='rgb(176,58,52)'/>
  <rect x='170' y='150' width='60' height='14' rx='4' fill='rgb(176,58,52)'/>
  <ellipse cx='200' cy='118' rx='22' ry='10' fill='rgb(196,160,70)'/>
  ${snow ? "<ellipse cx='200' cy='215' rx='150' ry='70' fill='rgb(222,230,238)'/><ellipse cx='150' cy='200' rx='70' ry='40' fill='rgb(236,240,245)'/>" : ""}
  <text x='12' y='24' fill='rgb(230,235,241)' font-family='monospace' font-size='13'>SAMPLE ${kind.toUpperCase()} — ${obstruction}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
