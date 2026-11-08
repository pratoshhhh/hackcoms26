/**
 * notificationService — decides who should be told about an alert and sends it.
 *
 *   - Twilio (SMS)   — off for now. Alerts stay on the site and are not texted.
 *   - Resend (email) — still simulated; no API key yet.
 */
import type { Alert, AlertKind, Channel, DeliveryRecord, Hydrant, NotificationSubscription } from "@/types";
import { uid } from "@/lib/utils";
import { OBSTRUCTION_LABELS } from "./analyticsService";
import { fmtTime } from "@/utils/format";

type SendResult = { status: "simulated" | "sent"; note?: string } | { status: "failed"; error: string };

export interface NotificationProvider {
  channel: Channel;
  name: DeliveryRecord["provider"];
  /** Records start as "sending" when `live`, else "simulated". */
  live: boolean;
  send(to: string | undefined, subject: string, body: string): Promise<SendResult>;
}

export const providers: Record<Channel, NotificationProvider> = {
  email: {
    channel: "email",
    name: "resend",
    live: false,
    async send() {
      return { status: "simulated" };
    },
  },
  sms: {
    channel: "sms",
    name: "twilio",
    live: false,
    async send() {
      return { status: "simulated" };
    },
  },
};

/** Plain-ASCII text so carriers keep the 160-character GSM segment size. */
export function smsText(alert: Alert, h: Hydrant): string {
  const label = h.obstructionType && ["blocked", "warning", "report"].includes(alert.kind) ? `${OBSTRUCTION_LABELS[h.obstructionType]}. ` : "";
  return `Fire Fighters: ${alert.title}. ${label}${alert.body} (${fmtTime(alert.createdAt)})`
    .replace(/\s*·\s*/g, " - ")
    .replace(/[—–]/g, "-")
    .replace(/[^\x20-\x7E\n]/g, "");
}

export type DeliveryUpdate = (id: string, patch: Pick<DeliveryRecord, "status" | "error">) => void;

/** Sends through a provider and reports the outcome; returns the record in its initial state. */
export function deliver(
  channel: Channel,
  to: string | undefined,
  displayTo: string,
  alert: Alert,
  hydrant: Hydrant,
  subscriptionId: string,
  onUpdate: DeliveryUpdate,
): DeliveryRecord {
  const provider = providers[channel];
  const record: DeliveryRecord = {
    id: uid("DLV"),
    subscriptionId,
    alertId: alert.id,
    channel,
    provider: provider.name,
    to: displayTo,
    subject: alert.title,
    status: provider.live ? "sending" : "simulated",
    createdAt: alert.createdAt,
  };
  const body = channel === "sms" ? smsText(alert, hydrant) : alert.body;
  void provider.send(to, alert.title, body).then((r) => {
    if (provider.live) {
      onUpdate(record.id, r.status === "failed" ? { status: "failed", error: r.error } : { status: r.status, error: r.note });
    }
  });
  return record;
}

export const ALERT_KIND_LABELS: Record<AlertKind, string> = {
  blocked: "Hydrant blocked",
  warning: "Possible obstruction",
  cleared: "Obstruction cleared",
  offline: "Device offline",
  restored: "Device back online",
  report: "Community report",
};

export function matches(sub: NotificationSubscription, alert: Alert, hydrant: Hydrant): boolean {
  if (!sub.events.includes(alert.kind)) return false;
  if (sub.scope.type === "hydrant") return sub.scope.hydrantId === hydrant.id;
  return sub.scope.neighborhood === hydrant.neighborhood;
}

export function dispatch(alert: Alert, hydrant: Hydrant, subs: NotificationSubscription[], onUpdate: DeliveryUpdate): DeliveryRecord[] {
  const out: DeliveryRecord[] = [];
  for (const sub of subs) {
    if (!matches(sub, alert, hydrant)) continue;
    for (const channel of sub.channels) {
      const to = channel === "email" ? sub.email : sub.phone;
      if (!to) continue;
      out.push(deliver(channel, to, to, alert, hydrant, sub.id, onUpdate));
    }
  }
  return out;
}

/** Which ESP32 events text the demo phone. Warnings are skipped to keep the demo phone quiet. */
export const DEMO_SMS_KINDS: AlertKind[] = ["blocked", "cleared", "offline"];

export function maskContact(v: string): string {
  if (v.includes("@")) {
    const [u, d] = v.split("@");
    return `${u.slice(0, 2)}•••@${d}`;
  }
  return v.replace(/\d(?=\d{2})/g, "•");
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
export const isPhone = (v: string) => /^\+?[\d\s().-]{10,16}$/.test(v.trim());
