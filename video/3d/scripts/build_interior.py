# The inside of the habitat, at night: crew quarters, the watch station, the life-support bay.
# Built in the habitat's local frame (parented to Habitat_Root: x along the module, the airlock
# at +x, the portholes on the -y wall, hull axis at z = 3.4, inner radius about 2.1 m), in a
# collection shared by the exterior scene ("Scene") and an interior scene ("Interior") that
# carries no terrain, so interior renders stay light.
# Realism goes to the hardware; people are only guessed (shapes in sleeping bags, behind curtains).
# Run inside Blender: exec(open(path).read())
import bpy, bmesh, math
from mathutils import Vector, Matrix

ZC, R_IN = 3.4, 2.08
FLOOR, CEIL = 2.1, 4.75
X0, X1 = -4.85, 4.85
O = bpy.data.objects; M = bpy.data.materials
root = O["Habitat_Root"]

# ---------------------------------------------------------------- collection and scenes
if "Interior" in bpy.data.collections:
    c = bpy.data.collections["Interior"]
    for o in list(c.all_objects): bpy.data.objects.remove(o, do_unlink=True)
    for ch in list(c.children): bpy.data.collections.remove(ch)
else:
    c = bpy.data.collections.new("Interior")
INT = c
ext = bpy.data.scenes["Scene"]
if INT.name not in ext.collection.children: ext.collection.children.link(INT)
if "Interior" not in bpy.data.scenes:
    s = bpy.data.scenes.new("Interior")
    s.collection.children.link(bpy.data.collections["Habitat"]); s.collection.children.link(INT)
    s.world = ext.world
    s.render.engine = 'CYCLES'; s.cycles.device = 'GPU'; s.cycles.samples = 128; s.cycles.use_denoising = True
    s.render.resolution_x, s.render.resolution_y, s.render.fps = 1920, 1080, 24
    s.view_settings.view_transform = 'AgX'
sc_int = bpy.data.scenes["Interior"]
# the stand-in light plates behind the portholes give way to the real interior
for i in range(3):
    o = O.get(f"PortInterior_{i}")
    if o: o.hide_render = True; o.hide_viewport = True

def sub(name):
    ch = bpy.data.collections.new(name); INT.children.link(ch); return ch
C_SHELL, C_CREW, C_WATCH, C_ECLSS, C_LIGHT = sub("Int_Shell"), sub("Int_Crew"), sub("Int_Watch"), sub("Int_ECLSS"), sub("Int_Lights")

# ---------------------------------------------------------------- materials
def pbr(name, base, metal=0.0, rough=0.5, **kw):
    m = M.get(name) or M.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = base; b.inputs["Metallic"].default_value = metal; b.inputs["Roughness"].default_value = rough
    for k, v in kw.items(): b.inputs[k].default_value = v
    return m, b
def panelled(name, base, rough, size, seam=0.004, dark=0.55):
    """Wall/floor panels: a brick texture as seams, darker and recessed."""
    m, b = pbr(name, base, 0.0, rough); nt = m.node_tree; N = nt.nodes; L = nt.links
    tc = N.new("ShaderNodeTexCoord"); br = N.new("ShaderNodeTexBrick"); br.offset = 0.0
    br.inputs["Scale"].default_value = 1.0 / size; br.inputs["Mortar Size"].default_value = seam / size
    br.inputs["Brick Width"].default_value = 1.0; br.inputs["Row Height"].default_value = 1.0
    br.inputs["Color1"].default_value = (1, 1, 1, 1); br.inputs["Color2"].default_value = (1, 1, 1, 1); br.inputs["Mortar"].default_value = (0, 0, 0, 1)
    L.new(tc.outputs["Object"], br.inputs["Vector"])
    mix = N.new("ShaderNodeMix"); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs["Factor"].default_value = 1
    mix.inputs[6].default_value = base
    mr = N.new("ShaderNodeMapRange"); mr.inputs["To Min"].default_value = dark; L.new(br.outputs["Fac"], mr.inputs["Value"])
    L.new(mr.outputs[0], mix.inputs[7]); L.new(mix.outputs[2], b.inputs["Base Color"])
    bu = N.new("ShaderNodeBump"); bu.inputs["Strength"].default_value = 0.6; bu.inputs["Distance"].default_value = 0.003
    L.new(br.outputs["Fac"], bu.inputs["Height"]); L.new(bu.outputs["Normal"], b.inputs["Normal"])
    return m
mat_wall = panelled("I_Wall_Panel", (0.70, 0.69, 0.66, 1), 0.6, 0.6)
mat_floor = panelled("I_Floor_Tile", (0.11, 0.115, 0.12, 1), 0.75, 0.5, seam=0.006, dark=0.4)
mat_ceil = panelled("I_Ceiling_Panel", (0.62, 0.62, 0.60, 1), 0.65, 0.5)
mat_alu = M["Aluminium_Brushed"]; mat_steel = M["Steel_Titanium"]
mat_frame, _ = pbr("I_Rack_Frame", (0.75, 0.76, 0.77, 1), 1.0, 0.35)
mat_rail, _ = pbr("I_Handrail", (0.20, 0.27, 0.35, 1), 0.8, 0.35)          # anodised blue-grey, not a warm colour
mat_fabric, _ = pbr("I_Curtain", (0.16, 0.18, 0.21, 1), 0.0, 0.85, **{"Sheen Weight": 0.6})
mat_bag, _ = pbr("I_Sleeping_Bag", (0.06, 0.08, 0.12, 1), 0.0, 0.7, **{"Sheen Weight": 0.5})
mat_pillow, _ = pbr("I_Pillow", (0.55, 0.56, 0.58, 1), 0.0, 0.85)
mat_plastic, _ = pbr("I_Plastic_Dark", (0.025, 0.025, 0.028, 1), 0.0, 0.45)
mat_composite, _ = pbr("I_Composite_White", (0.78, 0.78, 0.76, 1), 0.0, 0.4)
mat_panel, _ = pbr("I_Rack_Front", (0.58, 0.59, 0.60, 1), 0.2, 0.5)
mat_cable, _ = pbr("I_Cable", (0.03, 0.03, 0.035, 1), 0.0, 0.5)
mat_led = M.get("I_LED_White") or M.new("I_LED_White"); mat_led.use_nodes = True
nt = mat_led.node_tree; nt.nodes.clear(); o_ = nt.nodes.new("ShaderNodeOutputMaterial"); e_ = nt.nodes.new("ShaderNodeEmission")
e_.inputs["Color"].default_value = (1.0, 0.98, 0.95, 1); e_.inputs["Strength"].default_value = 3.0; nt.links.new(e_.outputs[0], o_.inputs[0])

# ---------------------------------------------------------------- helpers (local habitat frame)
def put(o, col, mat=None, smooth=False):
    for x in list(o.users_collection): x.objects.unlink(o)
    col.objects.link(o); o.parent = root
    if mat is not None and o.type in ('MESH', 'CURVE'):
        o.data.materials.clear(); o.data.materials.append(mat)
    if smooth and o.type == 'MESH':
        for p in o.data.polygons: p.use_smooth = True
        try: o.data.set_sharp_from_angle(angle=math.radians(35))
        except Exception: pass
    return o
def box(name, col, mat, cx, cy, cz, sx, sy, sz, bevel=0.004, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(cx, cy, cz), rotation=rot)
    o = bpy.context.active_object; o.name = name; o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        b = o.modifiers.new("Bevel", "BEVEL"); b.width = bevel; b.segments = 2; b.limit_method = 'ANGLE'
    return put(o, col, mat)
def cyl(name, col, mat, a, b, r, verts=24, caps=True):
    a, b = Vector(a), Vector(b); d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d.length, location=(a + b) / 2,
                                        end_fill_type='NGON' if caps else 'NOTHING')
    o = bpy.context.active_object; o.name = name; o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return put(o, col, mat, True)
def wall_y(z):
    """|y| of the inner wall at height z."""
    return math.sqrt(max(R_IN ** 2 - (z - ZC) ** 2, 0.0))

# ---------------------------------------------------------------- shell: liner, floor, ceiling, bulkheads
bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=R_IN, depth=X1 - X0, location=(0, 0, ZC), rotation=(0, math.pi / 2, 0), end_fill_type='NOTHING')
liner = put(bpy.context.active_object, C_SHELL, mat_wall, True); liner.name = "Liner"
so = liner.modifiers.new("Skin", "SOLIDIFY"); so.thickness = 0.02; so.offset = 1
for i in range(3):
    bo = liner.modifiers.new(f"Port{i}", "BOOLEAN"); bo.operation = 'DIFFERENCE'; bo.object = O[f"PortCut_{i}"]; bo.solver = 'EXACT'
# porthole reveals: short tubes through the wall thickness
for i, x in enumerate((-3.0, -1.0, 1.0)):
    cyl(f"Port_Reveal_{i}", C_SHELL, mat_alu, (x, -2.21, ZC + 0.2), (x, -R_IN + 0.01, ZC + 0.2), 0.365, 48, caps=False)
fw = 2 * wall_y(FLOOR) - 0.02
box("Floor", C_SHELL, mat_floor, 0, 0, FLOOR - 0.03, X1 - X0, fw, 0.06, 0.002)
cw = 2 * wall_y(CEIL) - 0.02
box("Ceiling", C_SHELL, mat_ceil, 0, 0, CEIL + 0.02, X1 - X0, cw, 0.04, 0.002)
for sx, nm in ((X0, "Aft"), (X1, "Fwd")):
    bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=R_IN, depth=0.04, location=(sx, 0, ZC), rotation=(0, math.pi / 2, 0))
    bh = put(bpy.context.active_object, C_SHELL, mat_wall, False); bh.name = f"Bulkhead_{nm}"
# the inner hatch to the airlock, in the forward bulkhead
bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=0.55, depth=0.3, location=(X1, 0, ZC - 0.35), rotation=(0, math.pi / 2, 0))
cut = bpy.context.active_object; cut.name = "Hatch_Cut"; cut.hide_render = True; cut.display_type = 'WIRE'; put(cut, C_SHELL)
bo = O["Bulkhead_Fwd"].modifiers.new("Hatch", "BOOLEAN"); bo.operation = 'DIFFERENCE'; bo.object = cut; bo.solver = 'EXACT'
bpy.ops.mesh.primitive_torus_add(major_radius=0.6, minor_radius=0.05, major_segments=64, minor_segments=12, location=(X1 - 0.03, 0, ZC - 0.35), rotation=(0, math.pi / 2, 0))
put(bpy.context.active_object, C_SHELL, mat_alu, True).name = "Hatch_Frame"
box("Hatch_Door", C_SHELL, mat_composite, X1 + 0.25, 0, ZC - 0.35, 0.05, 1.0, 1.0, 0.04)
# handrails along both walls, at shoulder height
for sy in (-1, 1):
    z = FLOOR + 1.45; y = sy * (wall_y(z) - 0.09)
    cyl(f"Handrail_{sy}", C_SHELL, mat_rail, (X0 + 0.3, y, z), (X1 - 0.3, y, z), 0.016, 16)
    for x in (X0 + 0.5, -2.0, 0.6, X1 - 0.5):
        cyl(f"Handrail_Stand_{sy}_{x}", C_SHELL, mat_rail, (x, y, z), (x, sy * (wall_y(z) - 0.01), z), 0.012, 12)
# cable tray along the ceiling edge (+y)
z = CEIL - 0.06; y = wall_y(z) - 0.25
box("Cable_Tray", C_SHELL, mat_frame, 0, y, z, X1 - X0 - 0.4, 0.18, 0.02, 0.002)
for k in range(5):
    cyl(f"Cable_{k}", C_SHELL, mat_cable, (X0 + 0.3, y - 0.06 + k * 0.03, z + 0.025), (X1 - 0.3, y - 0.06 + k * 0.03, z + 0.025), 0.009, 8)

# ---------------------------------------------------------------- night lighting: dim neutral strips, low
def strip(name, x0, x1, y, z, power):
    box(name + "_Diffuser", C_LIGHT, mat_led, (x0 + x1) / 2, y, z, x1 - x0, 0.03, 0.008, 0)
    ld = bpy.data.lights.new(name, "AREA"); ld.shape = 'RECTANGLE'; ld.size = x1 - x0; ld.size_y = 0.03; ld.energy = power
    ld.color = (1.0, 0.98, 0.95)
    lo = bpy.data.objects.new(name, ld); C_LIGHT.objects.link(lo); lo.parent = root
    lo.location = (x0 / 2 + x1 / 2, y, z - 0.01); return lo
for sy in (-1, 1):
    strip(f"Night_Strip_{sy}", X0 + 0.4, X1 - 0.4, sy * (wall_y(CEIL - 0.05) - 0.1), CEIL - 0.03, 6.0)
    strip(f"Floor_Guide_{sy}", X0 + 0.4, X1 - 0.4, sy * (wall_y(FLOOR + 0.1) - 0.06), FLOOR + 0.08, 1.5)
print("interior shell built")
