# Run before -a in a headless Blender: GPU (OptiX) render with the flyby camera.
#   blender -b nuit9-shackleton.blend --python scripts/render_setup.py -s <start> -a
import bpy

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
sc.cycles.device = "GPU"
sc.camera = bpy.data.objects["Cam_Flyby"]
sc.render.use_persistent_data = True # keep the scene (BVH, textures) in memory between frames
sc.render.use_overwrite = False      # resume: frames already on disk are skipped
sc.render.use_placeholder = True
print("render devices:", [d.name for d in prefs.devices if d.use], "frames", sc.frame_start, sc.frame_end)
