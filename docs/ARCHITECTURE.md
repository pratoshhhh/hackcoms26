# Hydrant Halo — Architecture & Implementation Plan

## 1. System architecture & data flow

```
 ┌──────────────┐   MQTT (1883)    ┌─────────────────────── Vultr VM (Docker Compose) ──────────────────────┐
 │ ESP32 node   │ ───────────────▶ │ RabbitMQ (MQTT plugin)                                                 │
 │ HC-SR04 +    │  halo/v1/...     │   amq.topic  ──AMQP──▶  FastAPI                                        │
 │ DS18B20 +    │                  │                          ├─ ingest → state machine (hysteresis)        │
 │ buzzer/LED   │                  │                          ├─ incident service (dedupe)                  │
 └──────────────┘                  │                          ├─ REST API  ◀──────── Next.js dashboard      │
 ┌──────────────┐   MQTT / HTTP    │                          ├─ WebSocket /ws ─────▶ (live map, alerts)    │
 │ Simulator    │ ───────────────▶ │                          ├─ async worker: Gemini + OpenCV (off path)   │
 └──────────────┘ source=simulated │                          └─ Solana Devnet payout (reviewer-gated)      │
                                   └──────────────┬──────────────────────────┬──────────────────────────────┘
                                                  │ asyncpg                  │ S3 API (optional)
                                        ┌─────────▼─────────┐      ┌─────────▼──────────┐
                                        │ Tiger Data         │      │ Vultr Object Store │
                                        │ (TimescaleDB)      │      │ (photos)           │
                                        └────────────────────┘      └────────────────────┘
```

**Critical alert path (target < 2 s):** ESP32 → RabbitMQ → FastAPI ingest → state machine → DB write + WS broadcast.
Gemini, OpenCV, and Solana are **never** on this path.

### Hydrant state machine

States: `CLEAR`, `POSSIBLY_BLOCKED`, `BLOCKED`, `OFFLINE`.

- Device does on-board filtering: median of 5 pings per sample; sends `distance_cm` every 2 s.
- Each hydrant has calibrated `block_threshold_cm` (e.g. 40) and `clear_threshold_cm` (e.g. 60) → hysteresis gap.
- `CLEAR → POSSIBLY_BLOCKED`: distance < block threshold for ≥ 3 consecutive readings.
- `POSSIBLY_BLOCKED → BLOCKED`: still below threshold after `confirm_seconds` (e.g. 10 s demo / 120 s prod). **Incident created here.**
- `POSSIBLY_BLOCKED → CLEAR`: any reading > clear threshold.
- `BLOCKED → CLEAR`: distance > clear threshold for ≥ 5 consecutive readings. Incident marked `SENSOR_CLEARED` (not `RESOLVED` until verified).
- `* → OFFLINE`: no telemetry/heartbeat for 30 s (background sweeper). Returning data restores prior evaluation.
- Dedupe: at most one open incident per hydrant (partial unique index). Re-blocking while open re-uses it.

## 2. Monorepo structure

See root README. Key boundaries:
- `backend/app/services/state_machine.py` — pure function, unit tested, no I/O.
- `backend/app/mqtt/consumer.py` — the only place that reads RabbitMQ.
- `backend/app/ws/manager.py` — the only place that broadcasts.
- `frontend/src/lib/ws.ts` — single WS hook; all pages subscribe through it.

## 3. Database schema

Full DDL in [`backend/db/init/001_schema.sql`](../backend/db/init/001_schema.sql). Summary:

| Table | Type | Purpose |
|---|---|---|
| `hydrants` | regular | id, name, fixed lat/lng, thresholds, `is_simulated`, current state |
| `sensor_readings` | **hypertable** (`time`) | distance_cm, temp_c, rssi, source |
| `hydrant_state_changes` | **hypertable** | every state transition (for timelines) |
| `incidents` | regular | one per obstruction; opened_at, sensor_cleared_at, resolved_at, status, AI summary |
| `volunteer_claims` | regular | volunteer, wallet, before/after photo URLs, Gemini JSON, review status |
| `bounty_payouts` | regular | claim → Solana tx signature, amount, status |
| `readings_1m` | **continuous aggregate** | per-minute min/avg distance, avg temp |
| `incident_daily` | **continuous aggregate** | obstructions per hydrant per day |
| `hydrant_risk` | view | frequency × avg clear time × recency → risk score |

## 4. MQTT topics & payloads

RabbitMQ's MQTT plugin maps `/` to `.` on the `amq.topic` exchange. Backend binds `halo.v1.hydrants.*.telemetry` and `halo.v1.hydrants.*.status`.

| Topic | Direction | QoS |
|---|---|---|
| `halo/v1/hydrants/{hydrant_id}/telemetry` | device → broker | 0 |
| `halo/v1/hydrants/{hydrant_id}/status` | device → broker (boot, heartbeat, LWT "offline") | 1, retained |
| `halo/v1/hydrants/{hydrant_id}/cmd` | backend → device (buzzer test, recalibrate) | 1 |

Telemetry:
```json
{
  "v": 1,
  "hydrant_id": "HYD-001",
  "seq": 1842,
  "ts": 1731000000,
  "distance_cm": 32.4,
  "distance_samples": 5,
  "temp_c": -2.1,
  "rssi": -61,
  "local_alarm": true,
  "source": "device",
  "sig": "hmac-sha256-hex"
}
```
`source` is `device` or `simulated`. In `APP_MODE=production`, `simulated` payloads are rejected.

Status:
```json
{ "v": 1, "hydrant_id": "HYD-001", "status": "online", "fw": "0.1.0", "uptime_s": 3600 }
```

## 5. REST API

Base: `/api/v1`. Reviewer-only endpoints require `X-Reviewer-Key`.

| Method | Path | Description |
|---|---|---|
| GET | `/health` | liveness + DB/RabbitMQ status |
| GET | `/hydrants` | all hydrants with current state |
| POST | `/hydrants` | register hydrant (fixed lat/lng, thresholds) — reviewer |
| GET | `/hydrants/{id}` | detail + latest reading + open incident |
| GET | `/hydrants/{id}/readings?from&to&bucket=1m` | time series (from continuous aggregate) |
| GET | `/hydrants/{id}/qr` | QR PNG encoding claim URL |
| GET | `/incidents?status=open` | incident list |
| GET | `/incidents/{id}` | detail + timeline + claims |
| POST | `/incidents/{id}/claim` | volunteer claims task `{volunteer_name, wallet}` |
| POST | `/claims/{id}/photos` | multipart before/after; `hydrant_qr_token` required |
| GET | `/claims/{id}` | claim incl. Gemini result + sensor cross-check |
| POST | `/claims/{id}/review` | `{approve: bool, note}` — reviewer → triggers payout |
| GET | `/payouts` | payouts with signatures + explorer links |
| GET | `/analytics/summary` | totals, avg time-to-clear, active incidents |
| GET | `/analytics/risk` | hydrant risk ranking |
| GET | `/analytics/frequency?days=30` | obstructions per day |
| POST | `/ingest/telemetry` | HTTP fallback for devices/simulator (same payload as MQTT) |

## 6. WebSocket events

Endpoint `GET /ws`. Server → client envelope: `{ "type": "...", "ts": "...", "data": {...} }`.

| type | data |
|---|---|
| `telemetry` | `{hydrant_id, distance_cm, temp_c, source}` (throttled ≤ 1/s per hydrant) |
| `hydrant.state_changed` | `{hydrant_id, from, to, reason}` |
| `incident.opened` | incident object |
| `incident.sensor_cleared` | `{incident_id, hydrant_id}` |
| `incident.resolved` | `{incident_id, time_to_clear_s}` |
| `claim.created` | claim object |
| `claim.verification_ready` | `{claim_id, gemini, sensor_check, recommendation}` |
| `payout.submitted` / `payout.confirmed` / `payout.failed` | `{payout_id, signature, explorer_url}` |

Client → server: `{"type":"ping"}` only. Dashboard re-fetches REST state on reconnect.

## 7. Integration responsibilities

**Vultr** — One VM (2 vCPU/4 GB) running `docker compose` for RabbitMQ + backend (+ Caddy for TLS/WSS if time). Public IP is the MQTT host for the ESP32 and the API/WS host for the frontend. Optional Object Storage bucket for photos. Frontend can run on the same VM or Vercel.

**Tiger Data** — Managed TimescaleDB. Hypertables for readings and state changes, compression policy on readings > 7 d, continuous aggregates `readings_1m` and `incident_daily`, risk view. Analytics endpoints read only from aggregates/views.

**RabbitMQ** — MQTT plugin terminates device connections; backend consumes via AMQP from a durable queue bound to `amq.topic`. LWT on device gives instant OFFLINE detection.

**Gemini** — Async job after photo upload. Input: before + after images, hydrant metadata, latest sensor state. Output (enforced via `response_schema`):
```json
{
  "obstruction_type": "snow|vehicle|debris|vegetation|none|unknown",
  "before_obstructed": true,
  "after_cleared": true,
  "confidence": 0.86,
  "reasoning": "...",
  "uncertainties": ["after photo taken at night"],
  "recommendation": "APPROVE|REVIEW|REJECT",
  "summary": "Snowbank cleared from HYD-003 by volunteer; hydrant cap visible."
}
```
Final recommendation = Gemini **AND** sensor CLEAR for ≥ N readings **AND** OpenCV sanity (images differ, not duplicates, not blank). A human reviewer always clicks approve.

**Solana** — Devnet only. Treasury keypair holds a self-minted SPL token labeled "demo USDC". On reviewer approval, backend sends an SPL transfer with a memo `halo:{incident_id}:{claim_id}`. Store signature; dashboard links to `https://explorer.solana.com/tx/{sig}?cluster=devnet`. No custom program — task/claim state lives in Postgres; the memo makes it auditable on-chain. Idempotency: unique `claim_id` on `bounty_payouts`.

## 8. 24-hour roadmap (3–4 people)

| Hours | Hardware/firmware | Backend | Frontend | Data/Integrations |
|---|---|---|---|---|
| 0–2 | Wire sensor, read distance | Compose up, schema, `/health` | Next.js shell, map with static markers | Vultr VM, Tiger Data service, Gemini key, Solana devnet wallet |
| 2–6 | MQTT publish to Vultr broker | Consumer → state machine → DB → WS | Live markers via WS, incident sidebar | Simulator; seed 10 hydrants |
| 6–10 | Buzzer/LED, calibration, LWT | Incidents + dedupe, OFFLINE sweeper | Hydrant detail panel + chart | Continuous aggregates, risk view |
| 10–14 | Enclosure, stability test | Claims + photo upload + QR | Task board, claim flow | Gemini verify worker + OpenCV |
| 14–18 | — | Review + Solana payout | Verify page, rewards page | Solana SPL transfer + memo |
| 18–21 | Full physical run ×5 | Hardening, retries, logging | Polish, real-vs-sim badges | Backfill realistic history for analytics |
| 21–24 | — | **Feature freeze.** Rehearse demo 3×, record backup video | | |

**Top failure points (mitigate early):**
1. Venue Wi-Fi blocks port 1883 → HTTP `/ingest/telemetry` fallback + phone hotspot.
2. Ultrasonic noise → median filtering + hysteresis + calibrated thresholds.
3. Devnet RPC rate limits / airdrop failures → pre-fund treasury the day before; retry with backoff.
4. Gemini latency → async, UI shows "analyzing…", never blocks alerting.
5. Mixed content (HTTPS frontend → WS) → serve backend behind Caddy with TLS, or keep both HTTP.
6. Empty analytics → seed historical simulated incidents, clearly labeled.

## 9. 90-second demo script

| Time | Action | Say |
|---|---|---|
| 0–10 s | Dashboard full screen, all green | "Firefighters lose minutes when hydrants are buried or blocked. Hydrant Halo watches them 24/7." |
| 10–25 s | Place a box in front of ESP32; buzzer + LED fire; marker goes yellow → red; incident pops in sidebar | "Ultrasonic + temp on an ESP32, MQTT into RabbitMQ on Vultr. Hysteresis means no false alarms — confirmed blocks only." |
| 25–40 s | Click hydrant: live chart, history, risk rank | "Every reading lands in Tiger Data hypertables. Continuous aggregates rank hydrants by obstruction frequency and clearing time." |
| 40–55 s | Phone: task board → claim → scan QR → upload before photo; remove box; upload after photo | "Any neighbor can claim the task. They scan the hydrant's QR code to prove they're there." |
| 55–70 s | Verify page shows Gemini JSON + sensor check both green | "Gemini classifies the obstruction and checks it's gone — but we never trust AI alone. The sensor must agree." |
| 70–85 s | Reviewer clicks Approve → Solana signature appears → open explorer | "A city reviewer approves, and a Devnet bounty is paid instantly, verifiable on-chain." |
| 85–90 s | Back to map, green; time-to-clear recorded | "Detected, cleared, verified, rewarded — in under two minutes." |
