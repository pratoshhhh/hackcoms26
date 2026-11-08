"""One-time reverse geocode of the bundled OSM hydrant snapshot via Nominatim.

Respects the Nominatim usage policy: 1 request/second, identifying User-Agent,
results cached into the snapshot so the app never calls Nominatim at runtime.

Usage: python scripts/geocode_snapshot.py   (from frontend/)
"""
import json
import math
import time
import urllib.parse
import urllib.request

PATH = "public/data/osm-rochester-hydrants.json"
UA = "HydrantHalo/0.1 (hackathon prototype; https://github.com/pratoshhhh/hackcoms26)"


def dist_m(lat1, lon1, lat2, lon2):
    k = math.cos(math.radians(lat1)) * 111320
    return math.hypot((lon2 - lon1) * k, (lat2 - lat1) * 110540)


def reverse(lat, lon):
    q = urllib.parse.urlencode({"format": "jsonv2", "lat": lat, "lon": lon, "zoom": 18, "addressdetails": 1})
    req = urllib.request.Request(f"https://nominatim.openstreetmap.org/reverse?{q}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def main():
    data = json.load(open(PATH, encoding="utf8"))
    done = 0
    for e in data["elements"]:
        if e.get("addr"):
            continue
        for attempt in range(3):
            try:
                res = reverse(e["lat"], e["lon"])
                a = res.get("address", {})
                e["addr"] = {
                    "houseNumber": a.get("house_number"),
                    "road": a.get("road"),
                    "neighbourhood": a.get("neighbourhood") or a.get("suburb") or a.get("quarter"),
                    "city": a.get("city") or a.get("town") or a.get("village") or a.get("hamlet"),
                    "postcode": a.get("postcode"),
                    "matchDistanceM": round(dist_m(e["lat"], e["lon"], float(res["lat"]), float(res["lon"])), 1),
                }
                done += 1
                break
            except Exception as ex:  # network hiccup: back off and retry
                print("retry", e["id"], ex)
                time.sleep(3 * (attempt + 1))
        time.sleep(1.1)
        if done % 20 == 0:
            json.dump(data, open(PATH, "w", encoding="utf8"), separators=(",", ":"))
            print("progress", done)
    data["addressSource"] = "Nominatim reverse geocoding (OpenStreetMap, ODbL), nearest addressed feature"
    json.dump(data, open(PATH, "w", encoding="utf8"), separators=(",", ":"))
    print("done", done, "of", len(data["elements"]))


if __name__ == "__main__":
    main()
