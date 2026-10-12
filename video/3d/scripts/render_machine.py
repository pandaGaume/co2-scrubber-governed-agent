# Headless render of a plan of the "Machine" scene.
#   blender -b nuit9-shackleton.blend -S Machine --python scripts/render_machine.py -a -- Cam_Plan2 //render/plan2/frame_####
import bpy, sys

cam_name, out = sys.argv[sys.argv.index("--") + 1:][:2]
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
sc.camera = bpy.data.objects[cam_name]
sc.render.filepath = out
sc.render.image_settings.file_format = "PNG"
sc.render.use_overwrite = False
sc.render.use_placeholder = True
print("render", sc.name, cam_name, "->", out, "frames", sc.frame_start, sc.frame_end)
