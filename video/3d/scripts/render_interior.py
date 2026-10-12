# Headless render of interior shots (scene "Interior"): a list of camera:first:last, into one folder,
# frames numbered by scene frame so consecutive shots encode in order.
#   blender -b nuit9-shackleton.blend -S Interior --python scripts/render_interior.py -- <out dir> Cam_A:1:60 Cam_B:61:120 ...
import bpy, sys, os

args = sys.argv[sys.argv.index("--") + 1:]
out, shots = args[0], args[1:]
prefs = bpy.context.preferences.addons["cycles"].preferences
for kind in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = kind
        prefs.get_devices()
        if any(d.type == kind for d in prefs.devices):
            for d in prefs.devices:
                d.use = d.type == kind
            break
    except TypeError:
        pass
sc = bpy.context.scene
sc.cycles.device = "GPU"; sc.cycles.samples = 96; sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1920, 1080, 100
sc.render.image_settings.file_format = "PNG"
os.makedirs(out, exist_ok=True)
for shot in shots:
    cam, f0, f1 = shot.split(":")
    sc.camera = bpy.data.objects[cam]
    for f in range(int(f0), int(f1) + 1):
        path = os.path.join(out, f"frame_{f:04d}.png")
        if os.path.exists(path) and os.path.getsize(path) > 0:
            continue
        sc.frame_set(f); sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
    print("SHOT", cam, f0, f1, "done")
