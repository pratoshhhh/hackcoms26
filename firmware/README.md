# ESP32 firmware

ESP IDF sketch for the hydrant node: HC-SR04 ultrasonic (median of 5 pings), DS18B20 temperature,
buzzer + LED local alarm, MQTT publish to `halo/v1/hydrants/{id}/telemetry` with LWT on `.../status`.
Sketch lives in `esp32_hydrant_node/` (TODO). Credentials go in `secrets.h` (gitignored).

## Live demo over USB (no backend needed)

The console's **ESP32 live demo** page (`/device`) reads the board directly over USB with Web Serial
(Chrome or Edge, on `localhost` or HTTPS). The board stands in for one map hydrant; blocks, clears and
offline events raise the normal alerts and are announced out loud.

Print one reading per line at **115200 baud**. Any of these work:

```
{"hydrant_id":"HYD-001","distance_cm":32.4,"temp_c":-2.1}   ← same JSON as the MQTT telemetry payload
distance_cm=32.4 temp_c=-2.1
32.4
```

- `0` (no echo) is treated as nothing in range.
- Boot logs and other non-matching lines are ignored.
- Send at least every 2 s; after 10 s of silence the hydrant goes offline.
- Close the Arduino Serial Monitor before connecting; only one program can hold the port.

Detection (in `frontend/src/services/obstructionDetector.ts`): under 40 cm for 4 s → blocked,
over 60 cm for 2 s → clear.
