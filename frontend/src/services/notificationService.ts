/**
 * notificationService — decides who should be told about an alert and records the
 * delivery *intent*. Nothing is sent from the browser.
 *
 * Future integration: POST /api/v1/notifications/dispatch on the backend, which calls
 *   - Resend  (email)  — resend.emails.send({ from, to, subject, html })
 *   - Twilio  (SMS)    — client.messages.create({ from, to, body })
 * API keys must live on the server only. Until then every record is status "simulated".
 */
import type { Alert, AlertKind, Channel, DeliveryRecord, Hydrant, NotificationSubscription } from "@/types";
import { uid } from "@/lib/utils";

export interface NotificationProvider {
  channel: Channel;
  name: DeliveryRecord["provider"];
  /** Returns the record that would be sent. Real providers will resolve after the API call. */
  send(to: string, subject: string, body: string): Promise<{ status: "simulated" }>;
}

const mockProvider = (channel: Channel, name: DeliveryRecord["provider"]): NotificationProvider => ({
  channel,
  name,
  async send() {
    return { status: "simulated" };
  },
});

export const providers: Record<Channel, NotificationProvider> = {
  email: mockProvider("email", "resend"),
  sms: mockProvider("sms", "twilio"),
};

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

export function dispatch(alert: Alert, hydrant: Hydrant, subs: NotificationSubscription[]): DeliveryRecord[] {
  const out: DeliveryRecord[] = [];
  for (const sub of subs) {
    if (!matches(sub, alert, hydrant)) continue;
    for (const channel of sub.channels) {
      const to = channel === "email" ? sub.email : sub.phone;
      if (!to) continue;
      void providers[channel].send(to, alert.title, alert.body);
      out.push({
        id: uid("DLV"),
        subscriptionId: sub.id,
        alertId: alert.id,
        channel,
        provider: providers[channel].name,
        to,
        subject: alert.title,
        status: "simulated",
        createdAt: alert.createdAt,
      });
    }
  }
  return out;
}

export function maskContact(v: string): string {
  if (v.includes("@")) {
    const [u, d] = v.split("@");
    return `${u.slice(0, 2)}•••@${d}`;
  }
  return v.replace(/\d(?=\d{2})/g, "•");
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
export const isPhone = (v: string) => /^\+?[\d\s().-]{10,16}$/.test(v.trim());
