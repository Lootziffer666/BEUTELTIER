#!/usr/bin/env python3
"""Transformiert den OSM-Ausschnitt in BEUTELTIER-Gelaendekoordinaten."""
from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def utm32(lat: float, lon: float) -> tuple[float, float]:
    """WGS84 -> UTM Zone 32N nach den EPSG-Transverse-Mercator-Formeln."""
    a, inv_f, k0 = 6378137.0, 298.257223563, 0.9996
    f = 1 / inv_f
    e2 = f * (2 - f)
    ep2 = e2 / (1 - e2)
    phi, lam, lam0 = map(math.radians, (lat, lon, 9.0))
    n = a / math.sqrt(1 - e2 * math.sin(phi) ** 2)
    t = math.tan(phi) ** 2
    c = ep2 * math.cos(phi) ** 2
    aa = math.cos(phi) * (lam - lam0)
    m = a * ((1-e2/4-3*e2**2/64-5*e2**3/256)*phi
             -(3*e2/8+3*e2**2/32+45*e2**3/1024)*math.sin(2*phi)
             +(15*e2**2/256+45*e2**3/1024)*math.sin(4*phi)
             -(35*e2**3/3072)*math.sin(6*phi))
    x = 500000 + k0*n*(aa+(1-t+c)*aa**3/6+(5-18*t+t*t+72*c-58*ep2)*aa**5/120)
    y = k0*(m+n*math.tan(phi)*(aa**2/2+(5-t+9*c+4*c*c)*aa**4/24
                               +(61-58*t+t*t+600*c-330*ep2)*aa**6/720))
    return x, y


def main() -> int:
    raw = json.loads((ROOT / "data/raw/osm/koelnmesse.json").read_text())
    built = json.loads((ROOT / "data/build/buildings.json").read_text())
    fit = built["fit"]
    angle = math.radians(fit["rotationDeg"])
    co, si = math.cos(angle), math.sin(angle)
    tx, ty = fit["translation"]

    def local(lat, lon):
        x, y = utm32(lat, lon)
        dx, dy = x - tx, y - ty
        ix, iy = co * dx + si * dy, -si * dx + co * dy
        return [round(-ix if fit["mirrored"] else ix, 2), round(iy, 2)]

    nodes = {e["id"]: e for e in raw["elements"] if e["type"] == "node" and "lat" in e}
    roads, markers = [], []
    for element in raw["elements"]:
        tags = element.get("tags", {})
        if element["type"] == "way" and tags.get("highway"):
            points = [local(nodes[n]["lat"], nodes[n]["lon"]) for n in element.get("nodes", []) if n in nodes]
            if len(points) > 1:
                roads.append({"id": element["id"], "kind": tags["highway"], "name": tags.get("name"), "points": points})
        elif element["type"] == "node" and any(k in tags for k in ("entrance", "amenity", "shop", "tourism")):
            markers.append({"id": element["id"], "kind": tags.get("entrance") or tags.get("amenity") or tags.get("shop") or tags.get("tourism"),
                            "name": tags.get("name"), "point": local(element["lat"], element["lon"])})
    payload = {"schema": "beuteltier.surroundings.v1", "attribution": "© OpenStreetMap-Mitwirkende, ODbL",
               "roads": roads, "markers": markers}
    out = ROOT / "data/build/surroundings.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(roads)} Wege, {len(markers)} Marker -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
