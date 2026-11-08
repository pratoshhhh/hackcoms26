/**
 * Vercel Function: proxy the ESP32 snapshot from the Vultr API.
 * The browser stays on this HTTPS origin. VITE_API_BASE is read here, not in the page.
 */

export async function GET(): Promise<Response> {
  const base = (process.env.VITE_API_BASE ?? "").replace(/\/$/, "");
  if (!base) {
    return Response.json({ detail: "VITE_API_BASE is not set" }, { status: 503 });
  }

  try {
    const upstream = await fetch(`${base}/api/v1/live`, { signal: AbortSignal.timeout(8000) });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return Response.json({ detail: "Vultr API did not respond" }, { status: 504 });
  }
}
