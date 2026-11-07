# Hydrant Halo

Real-time smart fire hydrant monitoring and community maintenance platform.

**Physical obstruction → ESP32 detection → Vultr backend → live dashboard alert → Tiger Data analytics → community clearing → Gemini verification → Solana Devnet reward.**

## Repo layout

```
hackcoms26/
├── backend/            FastAPI service (Python) — ingest, state machine, REST + WebSocket, Gemini, Solana
│   ├── app/
│   │   ├── api/        REST routers (hydrants, incidents, tasks, verify, payouts, analytics)
│   │   ├── core/       config, logging, security
│   │   ├── db/         asyncpg pool + queries
│   │   ├── models/     Pydantic schemas (payloads, API models)
│   │   ├── mqtt/       RabbitMQ consumer (MQTT topics arrive on amq.topic)
│   │   ├── services/   state machine, incident service, gemini, solana, storage, opencv checks
│   │   └── ws/         WebSocket connection manager / broadcaster
│   ├── db/init/        SQL schema (TimescaleDB hypertables, continuous aggregates)
│   ├── rabbitmq/       RabbitMQ plugin + config
│   ├── simulator/      Sensor simulator (dev/demo only, tagged source=simulated)
│   └── tests/
├── frontend/           Next.js 14 + TypeScript + Tailwind + Leaflet dashboard
│   └── src/
│       ├── app/        routes: / (map), /incidents, /tasks, /verify, /rewards, /analytics
│       ├── components/ map, incidents, charts, tasks, verify
│       ├── lib/        API client, WebSocket hook
│       └── types/      shared TS types
├── firmware/           ESP32 Arduino sketch (ultrasonic + temp + buzzer/LED + MQTT)
├── docs/ARCHITECTURE.md  architecture, schemas, topics, API, WS events, roadmap, demo script
└── docker-compose.yml  RabbitMQ (MQTT) + TimescaleDB (local) + backend
```

## Quick start (local)

```bash
cp .env.example .env               # fill in keys
docker compose up -d --build       # rabbitmq, timescaledb, backend
curl localhost:8000/health

# simulator (no ESP32 needed)
cd backend && pip install -r requirements.txt
python -m simulator.simulate --hydrants 5

# frontend
cd frontend && npm install && npm run dev   # http://localhost:3000
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full plan.

## Open-source components

| Component | Role |
|---|---|
| RabbitMQ + MQTT plugin | Device messaging broker |
| FastAPI / Uvicorn | REST + WebSocket backend |
| PostgreSQL + TimescaleDB | Time-series storage (hosted on Tiger Data) |
| Leaflet + OpenStreetMap | Live map |
| OpenCV | Image sanity checks / before-after diff |
| Next.js, Tailwind CSS | Dashboard UI |
| Docker Compose | Reproducible deployment on Vultr |
