/**
 * smsService — real SMS through Twilio via POST /api/v1/notify/sms
 * (FastAPI locally, frontend/api/v1/notify/sms.ts on Vercel). Credentials stay server-side.
 */

export interface SmsStatus {
  configured: boolean;
  /** Masked TWILIO_DEMO_TO_NUMBER, e.g. "+•••••••••04". */
  demoTo: string | null;
}

async function errorText(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const detail = (JSON.parse(text) as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  } catch {
    /* plain text */
  }
  return text || `Request failed (${res.status})`;
}

export async function smsStatus(): Promise<SmsStatus> {
  const res = await fetch("/api/v1/notify/sms", { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(await errorText(res));
  const data = (await res.json()) as { configured: boolean; demo_to: string | null };
  return { configured: data.configured, demoTo: data.demo_to };
}

/** With no `to`, the server sends to TWILIO_DEMO_TO_NUMBER. Resolves with the masked recipient. */
export async function sendSms(to: string | undefined, body: string): Promise<{ sid: string; to: string; via: string }> {
  const res = await fetch("/api/v1/notify/sms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, body }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(await errorText(res));
  return (await res.json()) as { sid: string; to: string; via: string };
}
