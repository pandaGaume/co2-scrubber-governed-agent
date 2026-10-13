# Encode the rendered PNG sequence into an H.264 MP4 with Blender's sequencer (no ffmpeg on the machine).
#   blender -b --factory-startup --python scripts/encode_mp4.py -- <frames dir> <output.mp4>
import bpy, os, sys

args = sys.argv[sys.argv.index("--") + 1:]
src, out = args[:2]
files = sorted(f for f in os.listdir(src) if f.endswith(".png") and os.path.getsize(os.path.join(src, f)) > 0)
if len(args) >= 4:                                  # optional first and last frame number (frame_NNNN.png)
    lo, hi = int(args[2]), int(args[3])
    files = [f for f in files if lo <= int(f.split("_")[-1].split(".")[0]) <= hi]
sc = bpy.context.scene
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1920, 1080, 100
sc.render.fps, sc.render.fps_base = 24, 1
sc.sequence_editor_create()
strip = sc.sequence_editor.strips.new_image("flyby", os.path.join(src, files[0]), channel=1, frame_start=1)
for f in files[1:]:
    strip.elements.append(f)
sc.frame_start, sc.frame_end = 1, len(files)
sc.view_settings.view_transform = "Standard"     # frames are already display-referred
r = sc.render
if hasattr(r.image_settings, "media_type"):     # Blender 5: choose video output before the container
    r.image_settings.media_type = "VIDEO"
r.image_settings.file_format = "FFMPEG"
r.ffmpeg.format = "MPEG4"
r.ffmpeg.codec = "H264"
r.ffmpeg.constant_rate_factor = "HIGH"
r.ffmpeg.ffmpeg_preset = "GOOD"
r.ffmpeg.gopsize = 24
r.ffmpeg.audio_codec = "NONE"
r.filepath = out
bpy.ops.render.render(animation=True)
print("encoded", len(files), "frames to", out)
