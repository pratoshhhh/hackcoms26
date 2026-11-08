/**
 * Vercel Function: send an SMS alert through Twilio.
 * Mirrors backend/app/api/notify.py. TWILIO_* stay in the project environment.
 */

const E164 = /^\+\d{10,15}$/;
/** Trial accounts reject custom text and only accept a template name as Body. */
const TRIAL_TEMPLATE = "sms_internal_alerts";

function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  let candidate: string;
  if (trimmed.startsWith("+")) candidate = `+${digits}`;
  else if (digits.length === 10) candidate = `+1${digits}`;
  else if (digits.length === 11 && digits.startsWith("1")) candidate = `+${digits}`;
  else return null;
  return E164.test(candidate) ? candidate : null;
}

const maskPhone = (phone: string) => phone.replace(/\d(?=\d{2})/g, "•");

function config() {
  const env = process.env;
  return {
    sid: env.TWILIO_ACCOUNT_SID ?? "",
    token: env.TWILIO_AUTH_TOKEN ?? "",
    from: env.TWILIO_FROM_NUMBER ?? "",
    service: env.TWILIO_MESSAGING_SERVICE_SID ?? "",
    demoTo: env.TWILIO_DEMO_TO_NUMBER ? normalizePhone(env.TWILIO_DEMO_TO_NUMBER) : null,
  };
}

const configured = (c: ReturnType<typeof config>) => Boolean(c.sid && c.token && (c.from || c.service));
const fail = (detail: string, status: number) => Response.json({ detail }, { status });

export async function GET(): Promise<Response> {
  const c = config();
  return Response.json({ configured: configured(c), demo_to: c.demoTo ? maskPhone(c.demoTo) : null });
}

export async function POST(request: Request): Promise<Response> {
  const c = config();
  if (!configured(c)) return fail("Twilio is not configured on the server", 503);

  let body: { to?: unknown; body?: unknown };
  try {
    body = (await request.json()) as { to?: unknown; body?: unknown };
  } catch {
    return fail("Expected a JSON body", 400);
  }
  if (typeof body.body !== "string" || !body.body.trim() || body.body.length > 480) {
    return fail("body must be 1–480 characters", 400);
  }
  const to = typeof body.to === "string" && body.to.trim() ? normalizePhone(body.to) : c.demoTo;
  if (!to) return fail(body.to ? "Recipient must be a valid phone number" : "TWILIO_DEMO_TO_NUMBER is not set", 400);

  const base: Record<string, string> = { To: to };
  if (c.service) base.MessagingServiceSid = c.service;
  else base.From = c.from;

  const send = (text: string) =>
    fetch(`https://api.twilio.com/2010-04-01/Accounts/${c.sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${c.sid}:${c.token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ ...base, Body: text }),
      signal: AbortSignal.timeout(15_000),
    });

  let upstream: globalThis.Response;
  try {
    upstream = await send(body.body);
  } catch (error) {
    return fail(`Twilio did not respond: ${error instanceof Error ? error.message : String(error)}`, 504);
  }

  let payload = (await upstream.json().catch(() => ({}))) as { sid?: string; status?: string; message?: string; code?: number };
  let via = "alert";
  const trialOnly = payload.code === 572006 || (payload.message ?? "").includes("predefined SMS templates");
  if (!upstream.ok && trialOnly && body.body !== TRIAL_TEMPLATE) {
    try {
      upstream = await send(TRIAL_TEMPLATE);
    } catch (error) {
      return fail(`Twilio did not respond: ${error instanceof Error ? error.message : String(error)}`, 504);
    }
    payload = (await upstream.json().catch(() => ({}))) as typeof payload;
    via = "trial_template";
  }
  if (!upstream.ok) {
    console.error("Twilio error", upstream.status, payload.message);
    return fail(payload.message || `Twilio error ${upstream.status}`, 502);
  }
  return Response.json({ sid: payload.sid ?? "", status: payload.status ?? "", to: maskPhone(to), via });
}
