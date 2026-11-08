"""Publishes the same MQTT payload the ESP32 firmware sends.

Usage: python -m simulator.simulate --hydrants 5 --host localhost
"""
import argparse
import json
import random
import time

import paho.mqtt.client as mqtt


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="localhost")
    p.add_argument("--port", type=int, default=1883)
    p.add_argument("--user", default="halo")
    p.add_argument("--password", default="halo")
    p.add_argument("--hydrants", type=int, default=5)
    p.add_argument("--interval", type=float, default=2.0)
    args = p.parse_args()

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="halo-simulator")
    client.username_pw_set(args.user, args.password)
    client.connect(args.host, args.port)
    client.loop_start()

    ids = [f"H{i:03d}" for i in range(1, args.hydrants + 1)]
    seq = 0
    while True:
        seq += 1
        for hid in ids:
            payload = {
                "deviceId": "SIM001",
                "hydrantId": hid,
                "sequence": seq,
                "sideDistanceCm": round(random.gauss(150, 2), 2),
                "snowDistanceCm": round(random.gauss(40, 2), 2),
            }
            client.publish(f"hydrants/{hid}/telemetry", json.dumps(payload))
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
