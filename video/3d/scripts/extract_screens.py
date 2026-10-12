# Extract a segment of the recorded station screens (3836 x 912, 30 fps: medical monitoring,
# control center, factory) as a 24 fps JPEG sequence, in real time: output frame k shows the
# video frame nearest to k / 24 s. The scene's screen materials crop each screen from these frames.
#   blender -b --factory-startup --python scripts/extract_screens.py -- <video> <out dir> <start s> <seconds>
import bpy, sys, os

video, out, start, seconds = sys.argv[sys.argv.index("--") + 1:][:4]
start, seconds = float(start), float(seconds)
os.makedirs(out, exist_ok=True)
clip = bpy.data.movieclips.load(video)
vfps = clip.fps
sc = bpy.context.scene
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = clip.size[0], clip.size[1], 100
sc.sequence_editor_create()
st = sc.sequence_editor.strips.new_movie("screens", video, channel=1, frame_start=1)
sc.frame_start, sc.frame_end = 1, st.frame_final_duration
sc.view_settings.view_transform = "Standard"
sc.render.image_settings.file_format = "JPEG"; sc.render.image_settings.quality = 92
n = int(round(seconds * 24))
for k in range(n):
    vf = 1 + int(round((start + k / 24) * vfps))
    path = os.path.join(out, f"screens_{k + 1:04d}.jpg")
    if os.path.exists(path): continue
    sc.frame_set(vf); sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
print("EXTRACTED", n, "frames from", start, "s at", vfps, "fps ->", out)
