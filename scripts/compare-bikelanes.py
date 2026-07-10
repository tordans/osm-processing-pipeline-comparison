#!/usr/bin/env python3
"""Soft-parity comparison of two bikelanes.ndjson exports (tilda osm2pgsql vs OSMnexus).

Usage: compare-bikelanes.py <a.ndjson> <b.ndjson> [--label-a NAME] [--label-b NAME]

Both files carry one GeoJSON feature per line with properties
id, osm_id, category, name, oneway, surface, smoothness, width, side.
Ids share the tilda side-split format (way/123[/prefix/side]) in both tools.

Version skew between current tilda-geo Lua and the OSMnexus config base is
expected — this tool quantifies it; small drift is acceptable by design.
"""

import argparse
import json
import math
import sys
from collections import Counter


def norm_cat(value):
    # tilda uses camelCase (cyclewayOnHighway_advisory), OSMnexus snake_case
    # (cycleway_on_highway_advisory) — same taxonomy, different casing.
    if value is None:
        return None
    return str(value).replace("_", "").lower()


def get_side(props):
    return props.get("side") or props.get("_side")


def load(path):
    feats = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            feat = json.loads(line)
            props = feat.get("properties") or {}
            fid = props.get("id")
            if fid is None:
                continue
            feats[fid] = feat
    return feats


def line_length_deg(geometry):
    if not geometry:
        return 0.0
    gtype = geometry.get("type")
    if gtype == "LineString":
        parts = [geometry.get("coordinates") or []]
    elif gtype == "MultiLineString":
        parts = geometry.get("coordinates") or []
    else:
        return 0.0
    total = 0.0
    for coords in parts:
        for (x1, y1), (x2, y2) in zip(coords, coords[1:]):
            total += math.hypot(x2 - x1, y2 - y1)
    return total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file_a")
    ap.add_argument("file_b")
    ap.add_argument("--label-a", default="A")
    ap.add_argument("--label-b", default="B")
    ap.add_argument("--samples", type=int, default=5)
    args = ap.parse_args()

    a, b = load(args.file_a), load(args.file_b)
    la, lb = args.label_a, args.label_b
    ka, kb = set(a), set(b)
    shared = ka & kb
    only_a, only_b = ka - kb, kb - ka

    print(f"features: {la}={len(a)}  {lb}={len(b)}  shared={len(shared)}")
    print(
        f"only {la}: {len(only_a)} ({len(only_a) / max(len(a), 1):.2%})  "
        f"only {lb}: {len(only_b)} ({len(only_b) / max(len(b), 1):.2%})"
    )

    # Per-category counts side by side
    cat_a = Counter(norm_cat(a[k]["properties"].get("category")) for k in ka)
    cat_b = Counter(norm_cat(b[k]["properties"].get("category")) for k in kb)
    cats = sorted(set(cat_a) | set(cat_b), key=lambda c: -(cat_a[c] + cat_b[c]))
    print(f"\n{'category':<45}{la:>10}{lb:>10}{'delta':>9}")
    for c in cats:
        d = cat_b[c] - cat_a[c]
        flag = "  <<" if cat_a[c] + cat_b[c] > 0 and abs(d) / max(cat_a[c], cat_b[c], 1) > 0.05 and abs(d) > 20 else ""
        print(f"{str(c):<45}{cat_a[c]:>10}{cat_b[c]:>10}{d:>+9}{flag}")

    # Divergent-id samples per category (what one tool has that the other lacks)
    print(f"\nonly-{la} samples by category:")
    by_cat = Counter(norm_cat(a[k]["properties"].get("category")) for k in only_a)
    for c, n in by_cat.most_common(8):
        ids = [k for k in only_a if norm_cat(a[k]["properties"].get("category")) == c][: args.samples]
        print(f"  {c} ({n}): {ids}")
    print(f"only-{lb} samples by category:")
    by_cat = Counter(norm_cat(b[k]["properties"].get("category")) for k in only_b)
    for c, n in by_cat.most_common(8):
        ids = [k for k in only_b if norm_cat(b[k]["properties"].get("category")) == c][: args.samples]
        print(f"  {c} ({n}): {ids}")

    # Attribute agreement on shared ids
    attrs = ["category", "oneway", "surface", "smoothness", "side"]
    mismatch = {attr: 0 for attr in attrs}
    samples = {attr: [] for attr in attrs}
    for k in shared:
        pa, pb = a[k]["properties"], b[k]["properties"]
        for attr in attrs:
            if attr == "category":
                va, vb = norm_cat(pa.get(attr)), norm_cat(pb.get(attr))
            elif attr == "side":
                va, vb = get_side(pa), get_side(pb)
            else:
                va, vb = pa.get(attr), pb.get(attr)
            if va != vb:
                mismatch[attr] += 1
                if len(samples[attr]) < args.samples:
                    samples[attr].append((k, va, vb))
    print(f"\nattribute mismatches on {len(shared)} shared ids:")
    for attr in attrs:
        pct = mismatch[attr] / max(len(shared), 1)
        print(f"  {attr}: {mismatch[attr]} ({pct:.2%})")
        for s in samples[attr]:
            print(f"    {s[0]}: {la}={s[1]!r} {lb}={s[2]!r}")

    # Geometry: length deltas (offset changes lengths slightly; big deltas = wrong geometry)
    rel_diffs = []
    for k in shared:
        ga = line_length_deg(a[k].get("geometry"))
        gb = line_length_deg(b[k].get("geometry"))
        if max(ga, gb) > 0:
            rel_diffs.append(abs(ga - gb) / max(ga, gb))
    rel_diffs.sort()
    if rel_diffs:
        p = lambda q: rel_diffs[min(int(len(rel_diffs) * q), len(rel_diffs) - 1)]
        print(
            f"\ngeometry length rel diff: p50={p(0.5):.4f} p95={p(0.95):.4f} "
            f"p99={p(0.99):.4f} max={rel_diffs[-1]:.4f}"
        )

    drift = (len(only_a) + len(only_b)) / max(len(ka | kb), 1)
    print(f"\nid-set drift: {drift:.2%} (soft-parity target: low single digits)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
