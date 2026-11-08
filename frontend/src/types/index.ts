// Domain types for Hydrant Halo. These mirror the backend contract in docs/ARCHITECTURE.md
// so mock services can be swapped for real API clients without touching components.

export type HydrantStatus = "clear" | "warning" | "blocked" | "offline";
export type ObstructionType = "snow" | "vehicle" | "debris" | "vegetation" | "ice";
export type RiskLevel = "low" | "moderate" | "high" | "critical";
/** Where the hydrant's *location* came from. Telemetry is always simulated in this build. */
export type LocationSource = "osm-live" | "osm-cache" | "osm-snapshot" | "seeded";

export interface Hydrant {
  id: string;
  osmId?: number;
  locationSource: LocationSource;
  lat: number;
  lng: number;
  /** Street name (from the geocoded address, else nearest major street). */
  street: string;
  /** Full postal address of the nearest addressed building, e.g. "66 Eastland Ave, Rochester, NY 14618". */
  address: string | null;
  /** How the address relates to the hydrant: directly in front (< 35 m), nearby, or an approximation. */
  addressPrecision: "front" | "near" | "approximate";
  neighborhood: string;
  city: string;
  /** False = no sensor installed; shown grey as "unmonitored". */
  monitored: boolean;
  status: HydrantStatus;
  obstructionType: ObstructionType | null;
  /** What exactly is blocking it, e.g. "Plow windrow about 1.2 m high, pumper nozzle covered". */
  obstructionDetail: string | null;
  statusSince: number;
  lastInspection: number;
  /** Device-side metric only. Says nothing about water delivery. */
  uptimePct: number;
  /** Seconds between telemetry packets. */
  reportIntervalS: number;
  riskScore: number;
  riskLevel: RiskLevel;
  osmTags?: Record<string, string>;
  seed: number;
}

export interface SensorReading {
  t: number;
  distanceCm: number | null;
  temperatureC: number | null;
}

export type IncidentKind = "obstruction" | "device";
export type IncidentOrigin = "seeded" | "demo" | "report";

export interface Incident {
  id: string;
  hydrantId: string;
  kind: IncidentKind;
  obstructionType: ObstructionType | null;
  severity: "warning" | "critical";
  status: "active" | "resolved";
  startedAt: number;
  resolvedAt?: number;
  origin: IncidentOrigin;
  /** Specific description of the obstruction. */
  detail?: string;
  note?: string;
}

export type AlertKind = "blocked" | "warning" | "cleared" | "offline" | "restored" | "report";

/** In-app notification (bell + toast). */
export interface Alert {
  id: string;
  kind: AlertKind;
  hydrantId: string;
  incidentId?: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
}

export type Channel = "email" | "sms";

export interface NotificationSubscription {
  id: string;
  email?: string;
  phone?: string;
  channels: Channel[];
  events: AlertKind[];
  scope: { type: "hydrant"; hydrantId: string } | { type: "area"; neighborhood: string };
  createdAt: number;
}

/** A record of what *would* be delivered. Never claims a real send. */
export interface DeliveryRecord {
  id: string;
  subscriptionId: string;
  alertId: string;
  channel: Channel;
  provider: "resend" | "twilio";
  to: string;
  subject: string;
  status: "simulated";
  createdAt: number;
}

export type VerificationState = "pending_review" | "likely_cleared" | "needs_inspection" | "rejected";

export interface VerificationCheck {
  label: string;
  passed: boolean;
  detail: string;
}

export interface VerificationResult {
  state: VerificationState;
  confidence: number;
  obstructionType: ObstructionType | null;
  checks: VerificationCheck[];
  summary: string;
  generatedAt: number;
  /** Always true until the Gemini integration lands. */
  simulated: true;
}

export type TaskStatus = "open" | "claimed" | "evidence" | "verifying" | "review" | "approved" | "rejected";

export interface MaintenanceTask {
  id: string;
  hydrantId: string;
  incidentId: string;
  obstructionType: ObstructionType;
  urgency: "routine" | "priority" | "urgent";
  bountyUsdc: number;
  status: TaskStatus;
  claimedBy?: string;
  qrVerified: boolean;
  beforePhoto?: string;
  afterPhoto?: string;
  verification?: VerificationResult;
  reward: { status: "none" | "pending" | "simulated"; signature?: string };
  timeline: { status: TaskStatus; at: number; note?: string }[];
  createdAt: number;
}

export interface AnalyticsSummary {
  totalHydrants: number;
  monitored: number;
  blocked: number;
  warning: number;
  offline: number;
  avgClearMinutes: number;
  deviceAvailabilityPct: number;
  incidents30d: number;
  incidentsPrev30d: number;
}

export type TimeRange = "1H" | "6H" | "24H" | "7D" | "30D";

export interface Filters {
  statuses: HydrantStatus[];
  obstructionTypes: ObstructionType[];
  riskLevels: RiskLevel[];
  /** Only show hydrants whose last update is within N minutes (null = any). */
  updatedWithinMin: number | null;
  includeUnmonitored: boolean;
}
