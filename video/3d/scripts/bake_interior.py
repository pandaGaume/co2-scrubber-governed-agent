# Bake the readings into the "Interior" scene: the impeller seen through the scrubber's
# inspection window turns at the measured flow, with the control room's encoding
# (+3.4 rad/s x speed/100, stopped without power), like the machine scene.
# Run inside Blender: READINGS = r"...json"; exec(open(path).read())
import bpy, json

def bake_interior(readings_path):
    sc = bpy.data.scenes["Interior"]; fps = sc.render.fps
    data = json.load(open(readings_path, encoding="utf-8"))
    rs = sorted(data["readings"], key=lambda r: r["t"])
    n = sc.frame_end - sc.frame_start + 1
    def at(t):
        cur = rs[0]
        for r in rs:
            if r["t"] <= t: cur = r
        return cur
    imp = bpy.data.objects["Bay_Impeller"]; imp.animation_data_clear()
    angle = 0.0
    for k in range(n):
        f = sc.frame_start + k; r = at(k / fps)
        if k and r.get("power", True) and r.get("speed", 0) > 0:
            angle += (1 / fps) * (r["speed"] / 100) * 3.4
        imp.rotation_euler = (0, 0, angle); imp.keyframe_insert("rotation_euler", index=2, frame=f)
    for fc in getattr(imp.animation_data.action, "fcurves", []):
        for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
    print("interior baked", n, "frames, final angle", round(angle, 2))

bake_interior(READINGS)
