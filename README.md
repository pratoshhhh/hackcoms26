# Fire Fighters

Seconds matter once a fire is burning, and a blocked hydrant spends those seconds before a hose is even charged. In 2025, New Yorkers filed 165,466 complaints about blocked hydrants. That February, a parked car blocked the nearest hydrant at a Bronx fire that killed two people. Fire Fighters exists to catch the blockage while nothing is on fire.

Fire Fighters watches fire hydrants and alerts the city when one is blocked. A sensor on the hydrant measures the space in front of it. If something stays too close, the hydrant turns red on a live map, an incident opens, and a text goes out. A neighbor can clear it, and a reviewer signs off once the sensor agrees.

ESP32 → Vultr (RabbitMQ + FastAPI) → dashboard alert → Tiger Data history → photo check → reviewer sign-off.

## Technologies

Tiger Data, Best Use of Tiger Data. Every distance and temperature reading lands in a TimescaleDB hypertable. Readings older than a week are compressed, and continuous aggregates keep per-minute clearance and daily blockage counts current. The risk ranking is a SQL view over that history, so the dashboard asks which hydrants keep getting blocked without a second database or a custom analytics pipeline.

Vultr, Best Use of Vultr. One virtual machine is the public host. Docker Compose runs RabbitMQ and the FastAPI backend on it, so the ESP32 publishes MQTT to the same machine that serves the API and the live map. The alert path is sensor, Vultr, state machine, dashboard.

Gemini API, Best Use of Gemini API. Hydrant Intelligence sends Gemini the question plus the hydrants and incidents on screen and requires a JSON answer. Photo verification is the same idea: Gemini looks at before-and-after evidence only after the alert is already out. A slow model call never sits on the path that pages someone.

Cursor, SpaceXSI track. Cursor was the coding agent for the integration work: the ESP32 feed, the map, the alerts, and the SMS path. We still decided the architecture, the workflow, and which features were worth building.

RabbitMQ. Open-source message broker with the MQTT plugin. The ESP32 publishes to halo/v1/hydrants/{id}/telemetry, and FastAPI consumes it over AMQP. The board never talks to the database directly. There is no sponsor track for it. It is the pipe between the hardware and Vultr.

MapLibre and OpenStreetMap. Open-source map. Hydrant locations are real Rochester hydrants from OpenStreetMap, drawn with MapLibre. A block turns the marker red. No sponsor track. This is the screen a firefighter would actually look at.

FastAPI. Open-source API. It runs the state machine (inside 40 cm confirms a block, past 60 cm clears it), writes to Tiger Data, and broadcasts over a WebSocket. No sponsor track. It is the backend on the Vultr VM.

OpenCV. Open-source check on the volunteer photos: the before and after have to differ, and they cannot be blank. Gemini does not get the only vote. No sponsor track.

React, Vite, and three.js. Open-source console. The live map, the incident list, and the 3D hydrant that changes with the sensor are all in the browser. No sponsor track.

Twilio. A blocked, cleared, or offline hydrant texts the demo phone. The trial account only delivers a predefined template, so the phone buzzes even though the custom sentence is rejected. No sponsor track.

ESP32, HC-SR04, and DS18B20. The node on the hydrant. Median of five ultrasonic pings, plus temperature, a buzzer, and an LED. No sponsor track. It is the reading that starts the Vultr and Tiger Data path.

## Run it locally

```bash
cp .env.example .env
docker compose up -d --build          # RabbitMQ, TimescaleDB, API
cd frontend && npm install && npm run dev   # http://localhost:5173
```

API health check: `curl localhost:8000/health`

No board? From `backend/`, run `python -m simulator.simulate --hydrants 5`.

## What's in the repo

- `frontend/` — map, incidents, and the ESP32 demo page
- `backend/` — API, MQTT ingest, Gemini
- `firmware/` — ESP32 sketch
- `docs/ARCHITECTURE.md` — schema, topics, and API

## Stack

Open source: RabbitMQ, FastAPI, TimescaleDB, MapLibre, OpenStreetMap, OpenCV, React.

Hosted on Vultr. Time-series storage on Tiger Data.
