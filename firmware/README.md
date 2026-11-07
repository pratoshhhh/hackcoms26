# ESP32 firmware

Arduino sketch for the hydrant node: HC-SR04 ultrasonic (median of 5 pings), DS18B20 temperature,
buzzer + LED local alarm, MQTT publish to `halo/v1/hydrants/{id}/telemetry` with LWT on `.../status`.
Sketch lives in `esp32_hydrant_node/` (TODO). Credentials go in `secrets.h` (gitignored).
