"""
Draws `docs/cabin-graph.headless.svg` from `graphs/cabin.spikypanda`: the
nodes at the positions saved in the document, the connections with their
port names. The documentation figure (`docs/cabin-graph.svg`) is the
editor's own export; this drawing is the fallback when no editor is at
hand, run after `npm run twin:build` when the graph or its layout changes:

    python scripts/draw-cabin-graph.py
"""
import json
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
doc = json.loads((ROOT / "graphs" / "cabin.spikypanda").read_text(encoding="utf-8"))
layout = {n["id"]: n for n in doc["layout"]["nodes"]}
model = {n["id"]: n for n in doc["model"]["nodes"]}

# Editor coordinates are top-left corners of 200-wide cards; scale to the page.
S = 1.0
W_NODE, H_NODE = 172, 52
xs = [n["x"] for n in layout.values()]
ys = [n["y"] for n in layout.values()]
OX, OY = 30 - min(xs) * S, 30 - min(ys) * S
WIDTH = int((max(xs) - min(xs)) * S + W_NODE + 60)
HEIGHT = int((max(ys) - min(ys)) * S + H_NODE + 60)

CATEGORY_FILL = {
    "Physics.Scene": "#dfe7f5",
    "Control.Sim": "#eeeeee",
    "Logic.Time": "#fff3d6",
    "Physics.LifeSupport": "#dff5e3",
    "Physics.Electric": "#f5e3df",
}


def fill_of(type_id: str) -> str:
    for prefix, colour in CATEGORY_FILL.items():
        if type_id.startswith(prefix):
            return colour
    return "#ffffff"


def box(node_id: str):
    n = layout[node_id]
    x, y = n["x"] * S + OX, n["y"] * S + OY
    return x, y


parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" font-family="Helvetica, Arial, sans-serif" font-size="12">']
parts.append("<title>The cabin twin graph, as laid out in the editor</title>")
parts.append('<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#333"/></marker></defs>')
parts.append(f'<rect width="{WIDTH}" height="{HEIGHT}" fill="#ffffff"/>')

# connections first, under the boxes
for c in doc["model"]["connections"]:
    fx, fy = box(c["from"]["node"])
    tx, ty = box(c["to"]["node"])
    x1, y1 = fx + W_NODE, fy + H_NODE / 2
    x2, y2 = tx, ty + H_NODE / 2
    dashed = ' stroke-dasharray="5 4"' if c["from"]["port"].endswith("_out") else ""
    mx = (x1 + x2) / 2
    parts.append(f'<path d="M {x1:.0f} {y1:.0f} C {mx:.0f} {y1:.0f}, {mx:.0f} {y2:.0f}, {x2:.0f} {y2:.0f}" fill="none" stroke="#333" stroke-width="1.3" marker-end="url(#arrow)"{dashed}/>')
    label = f'{c["from"]["port"]} -> {c["to"]["port"]}'
    parts.append(f'<text x="{mx:.0f}" y="{(y1 + y2) / 2 - 4:.0f}" text-anchor="middle" font-size="10" fill="#555">{escape(label)}</text>')

for node_id, n in layout.items():
    x, y = box(node_id)
    type_id = n["typeId"]
    label = model[node_id]["label"]
    parts.append(f'<rect x="{x:.0f}" y="{y:.0f}" width="{W_NODE}" height="{H_NODE}" rx="8" fill="{fill_of(type_id)}" stroke="#333" stroke-width="1.3"/>')
    parts.append(f'<text x="{x + 10:.0f}" y="{y + 22:.0f}" font-size="13" font-weight="bold" fill="#111">{escape(label)}</text>')
    parts.append(f'<text x="{x + 10:.0f}" y="{y + 42:.0f}" font-size="10" fill="#444">{escape(type_id)}</text>')

parts.append("</svg>")
out = ROOT / "docs" / "cabin-graph.headless.svg"
out.write_text("\n".join(parts) + "\n", encoding="utf-8")
print(f"{out.relative_to(ROOT)}: {len(layout)} nodes, {len(doc['model']['connections'])} connections, {WIDTH}x{HEIGHT}")
