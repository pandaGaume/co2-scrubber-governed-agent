# Bake a sequence of board readings into the "Machine" scene, with the same encodings as the
# control room (dashboard/room-model.js), so the solid machine moves exactly as the page does:
#   - the impeller turns at the measured flow: +3.4 rad/s x speed/100, and stops dead without power;
#   - the dashes in the ducts run at that flow: 0.9 cycle/s x speed/100, seven per duct;
#   - the CO2 motes lit in the cabin: round(clamp((ppm - 400) / 4600) x 260);
#   - the bed rings rise with the health residual: clamp(residual / 0.1), amber when the bed is hot;
#   - the data hue follows the state word the board sent: NOMINAL teal, ELEVATED amber, CRITICAL red.
# Nothing else moves. Readings are held until the next one (the board reports every 2 s).
#
# Readings file (JSON): {"source": "...", "readings": [{"t": 0, "speed": 33, "power": true,
#   "ppm": 1200, "residual": 0.02, "state": "NOMINAL", "hotBed": false}, ...], "duration": 12}
# Run inside Blender: READINGS = r"...json"; exec(open(path).read())
import bpy, json, math
from mathutils import Vector

S = 0.5
def P(x, y, z): return Vector((x * S, z * S, y * S))
COL = dict(x=1.85, top=1.45, bottom=-1.75, r=0.84)
BED = dict(y0=-1.6, y1=-0.6, r=0.76)
DUCT_OUT = [(-2.1, 1.25, 0), (-2.1, 2.05, 0), (COL["x"], 2.05, 0), (COL["x"], COL["top"], 0)]
DUCT_BACK = [(COL["x"], COL["bottom"], 0), (COL["x"], -2.35, 0), (-3.2, -2.35, 0), (-3.2, -1.25, 0)]
HUE = {"NOMINAL": (0.028, 0.745, 0.578, 1), "ELEVATED": (1.0, 0.468, 0.065, 1), "CRITICAL": (1.0, 0.081, 0.133, 1)}
AMBER = HUE["ELEVATED"]

def rounded(path, rc=0.32, steps=10):
    pts = [Vector(path[0])]
    for i in range(1, len(path) - 1):
        a, b, c = Vector(path[i - 1]), Vector(path[i]), Vector(path[i + 1])
        d1 = (b - a).normalized(); d2 = (c - b).normalized(); p1 = b - d1 * rc; p2 = b + d2 * rc
        for k in range(steps + 1):
            t = k / steps; pts.append((1 - t) ** 2 * p1 + 2 * (1 - t) * t * b + t * t * p2)
    pts.append(Vector(path[-1])); return [P(*p) for p in pts]

class Path:
    def __init__(self, pts):
        self.pts = pts; self.cum = [0.0]
        for a, b in zip(pts, pts[1:]): self.cum.append(self.cum[-1] + (b - a).length)
        self.total = self.cum[-1]
    def at(self, d):
        d = max(0.0, min(self.total, d))
        for i in range(1, len(self.cum)):
            if self.cum[i] >= d:
                a, b = self.pts[i - 1], self.pts[i]; t = (d - self.cum[i - 1]) / max(self.cum[i] - self.cum[i - 1], 1e-9)
                return a.lerp(b, t), (b - a).normalized()
        return self.pts[-1], (self.pts[-1] - self.pts[-2]).normalized()

def bake(readings_path):
    sc = bpy.data.scenes["Machine"]; O = bpy.data.objects; fps = sc.render.fps
    data = json.load(open(readings_path, encoding="utf-8"))
    rs = sorted(data["readings"], key=lambda r: r["t"])
    duration = data.get("duration", rs[-1]["t"] + 2)
    nframes = int(round(duration * fps)); sc.frame_start, sc.frame_end = 1, nframes
    def reading_at(t):
        cur = rs[0]
        for r in rs:
            if r["t"] <= t: cur = r
        return cur
    imp = O["Impeller"]; motes = sorted([o for o in sc.objects if o.name.startswith("Mote_")], key=lambda o: o.name)
    dashes = {k: sorted([o for o in sc.objects if o.name.startswith(f"Dash_{k}_")], key=lambda o: o.name) for k in ("Out", "Back")}
    paths = {"Out": Path(rounded(DUCT_OUT)), "Back": Path(rounded(DUCT_BACK))}
    rings = sorted([o for o in sc.objects if o.name.startswith("Residual_Ring_")], key=lambda o: o.name)
    m_data = bpy.data.materials["M_Data_Teal"]
    m_bed = bpy.data.materials.get("M_Data_Bed") or m_data.copy(); m_bed.name = "M_Data_Bed"
    for r_ in rings: r_.data.materials.clear(); r_.data.materials.append(m_bed)
    for o in [imp] + motes + rings + dashes["Out"] + dashes["Back"]: o.animation_data_clear()
    for m in (m_data, m_bed):
        if m.node_tree.animation_data: m.node_tree.animation_data_clear()
    em_data = next(n for n in m_data.node_tree.nodes if n.type == "EMISSION")
    em_bed = next(n for n in m_bed.node_tree.nodes if n.type == "EMISSION")
    angle = 0.0; phase = 0.0; prev = {}
    for f in range(1, nframes + 1):
        t = (f - 1) / fps; r = reading_at(t)
        spin = r.get("power", True) and r.get("speed", 0) > 0
        if f > 1 and spin:
            angle += (1 / fps) * (r["speed"] / 100) * 3.4
            phase = (phase + (1 / fps) * (r["speed"] / 100) * 0.9) % 1
        imp.rotation_euler = (0, 0, angle); imp.keyframe_insert("rotation_euler", index=2, frame=f)
        for k, ds in dashes.items():
            path = paths[k]
            for i, d in enumerate(ds):
                dd = ((i / len(ds) + phase) % 1) * path.total
                p, tan = path.at(dd + 0.085)
                d.location = p; d.rotation_euler = tan.to_track_quat('Z', 'Y').to_euler()
                d.hide_render = d.hide_viewport = not spin
                d.keyframe_insert("location", frame=f); d.keyframe_insert("rotation_euler", frame=f)
                d.keyframe_insert("hide_render", frame=f); d.keyframe_insert("hide_viewport", frame=f)
        # discrete encodings: keyed only when they change
        lit = round(max(0.0, min(1.0, (r["ppm"] - 400) / 4600)) * len(motes))
        load = max(0.0, min(1.0, r.get("residual", 0) / 0.1))
        state = (lit, round(load, 4), r.get("state", "NOMINAL"), bool(r.get("hotBed", False)))
        if state != prev.get("state"):
            for i, m in enumerate(motes):
                m.hide_render = m.hide_viewport = i >= lit
                m.keyframe_insert("hide_render", frame=f); m.keyframe_insert("hide_viewport", frame=f)
            top = BED["y0"] + (BED["y1"] - BED["y0"]) * load
            for i, rg in enumerate(rings):
                rg.location = P(COL["x"], BED["y0"] + (top - BED["y0"]) * i / (len(rings) - 1), 0)
                rg.hide_render = rg.hide_viewport = load <= 0
                rg.keyframe_insert("location", frame=f); rg.keyframe_insert("hide_render", frame=f); rg.keyframe_insert("hide_viewport", frame=f)
            em_data.inputs["Color"].default_value = HUE.get(state[2], HUE["NOMINAL"]); em_data.inputs["Color"].keyframe_insert("default_value", frame=f)
            em_bed.inputs["Color"].default_value = AMBER if state[3] else HUE["NOMINAL"]; em_bed.inputs["Color"].keyframe_insert("default_value", frame=f)
            prev["state"] = state
    # held values, no easing: everything is CONSTANT except the integrated angle and the dashes (LINEAR)
    for o in [imp] + motes + rings + dashes["Out"] + dashes["Back"]:
        ad = o.animation_data
        if not ad or not ad.action: continue
        for fc in getattr(ad.action, "fcurves", []):
            for kp in fc.keyframe_points: kp.interpolation = 'LINEAR' if o == imp else 'CONSTANT'
    for m in (m_data, m_bed):
        ad = m.node_tree.animation_data
        if ad and ad.action:
            for fc in getattr(ad.action, "fcurves", []):
                for kp in fc.keyframe_points: kp.interpolation = 'CONSTANT'
    O["Reading"]["source"] = data.get("source", "")
    print("baked", nframes, "frames from", readings_path, "| final angle", round(angle, 2), "rad")

bake(READINGS)
