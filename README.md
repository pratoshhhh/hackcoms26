# Hydrant Halo

Real-time smart fire hydrant monitoring and community maintenance platform.

**Physical obstruction → ESP32 detection → Vultr backend → live dashboard alert → Tiger Data analytics → community clearing → Gemini verification → reviewer sign-off.**

## Repo layout

```
hackcoms26/
├── backend/            FastAPI service (Python) — ingest, state machine, REST + WebSocket, Gemini
│   ├── app/
│   │   ├── api/        REST routers (hydrants, incidents, tasks, verify, analytics)
│   │   ├── core/       config, logging, security
│   │   ├── db/         asyncpg pool + queries
│   │   ├── models/     Pydantic schemas (payloads, API models)
│   │   ├── mqtt/       RabbitMQ consumer (MQTT topics arrive on amq.topic)
│   │   ├── services/   state machine, incident service, gemini, storage, opencv checks
│   │   └── ws/         WebSocket connection manager / broadcaster
│   ├── db/init/        SQL schema (TimescaleDB hypertables, continuous aggregates)
│   ├── rabbitmq/       RabbitMQ plugin + config
│   ├── simulator/      Sensor simulator (dev/demo only, tagged source=simulated)
│   └── tests/
├── frontend/           React + Vite + TypeScript + Tailwind + MapLibre + three.js console (see frontend/README.md)
│   └── src/
│       ├── pages/      / (landing), /map, /incidents, /analytics, /maintenance, /settings
│       ├── components/ layout, map, hydrants, charts, three, ai, maintenance, ui
│       ├── services/   mock services behind swappable interfaces
│       └── stores/     single Zustand store
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
cd frontend && npm install && npm run dev   # http://localhost:5173
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full plan.

## Open-source components

| Component | Role |
|---|---|
| RabbitMQ + MQTT plugin | Device messaging broker |
| FastAPI / Uvicorn | REST + WebSocket backend |
| PostgreSQL + TimescaleDB | Time-series storage (hosted on Tiger Data) |
| MapLibre GL + OpenStreetMap | Live map and hydrant locations |
| OpenCV | Image sanity checks / before-after diff |
| React, Vite, Tailwind CSS, three.js | Console UI and 3D twin |
| Docker Compose | Reproducible deployment on Vultr |
