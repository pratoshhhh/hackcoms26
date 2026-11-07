"""Sensor simulator for development/demo. Publishes MQTT telemetry tagged source=simulated.

Usage: python -m simulator.simulate --hydrants 5 --host localhost
Full scenario logic (block/clear on keypress, offline drops) is TODO.
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

    ids = [f"SIM-{i:03d}" for i in range(1, args.hydrants + 1)]
    seq = 0
    while True:
        seq += 1
        for hid in ids:
            payload = {
                "v": 1,
                "hydrant_id": hid,
                "seq": seq,
                "ts": int(time.time()),
                "distance_cm": round(random.gauss(120, 3), 1),
                "distance_samples": 5,
                "temp_c": round(random.gauss(-1.5, 0.3), 1),
                "rssi": random.randint(-75, -55),
                "local_alarm": False,
                "source": "simulated",
            }
            client.publish(f"halo/v1/hydrants/{hid}/telemetry", json.dumps(payload))
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
