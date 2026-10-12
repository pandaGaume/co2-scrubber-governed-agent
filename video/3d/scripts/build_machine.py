# The machine of Mother's control room (dashboard/room-model.js), built solid and PBR in a
# Blender scene of its own ("Machine"), as a technical cutaway: the half that faces the
# camera is open, so the crew, the impeller, the motor and the sorbent bed are seen.
#
# Geometry: room-model.js values, one unit = 0.5 m, Y up. The canvas projection of the page is
# a mirror image of a physical camera, so the model is mapped (x, y, z) -> (x, z, y) * 0.5,
# which makes the camera below a proper rotation and the render match the page.
#
# Run inside Blender: exec(open(path).read())
import bpy, bmesh, math
from mathutils import Vector, Matrix

S = 0.5
def P(x, y, z): return Vector((x * S, z * S, y * S))

CABIN = dict(x0=-4.3, x1=-1.25, r=1.25)
COL = dict(x=1.85, top=1.45, bottom=-1.75, r=0.84)
IMP = dict(y=0.88, r=0.7)
MOTOR = dict(y0=0.08, y1=0.55, r=0.34)
BED = dict(y0=-1.6, y1=-0.6, r=0.76)
DUCT_OUT = [(-2.1, 1.25, 0), (-2.1, 2.05, 0), (COL["x"], 2.05, 0), (COL["x"], COL["top"], 0)]
DUCT_BACK = [(COL["x"], COL["bottom"], 0), (COL["x"], -2.35, 0), (-3.2, -2.35, 0), (-3.2, -1.25, 0)]
DUCT_R = 0.24
CREW_X = [-3.7, -3.1, -2.5, -1.9]
TEAL = (0.028, 0.745, 0.578, 1)          # #2fe0c8, linear

# ---------------------------------------------------------------- scene
if "Machine" in bpy.data.scenes:
    old = bpy.data.scenes["Machine"]
    for o in list(old.objects): bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections):
        if c.name.startswith("Machine_"): bpy.data.collections.remove(c)
    if bpy.context.window.scene == old:
        bpy.context.window.scene = bpy.data.scenes["Scene"]
    bpy.data.scenes.remove(old)
    bpy.ops.outliner.orphans_purge(do_recursive=True)
sc = bpy.data.scenes.new("Machine")
bpy.context.window.scene = sc
sc.render.engine = 'CYCLES'
sc.cycles.device = 'GPU'; sc.cycles.samples = 128; sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y, sc.render.fps = 1920, 1080, 24
sc.view_settings.view_transform = 'AgX'
w = bpy.data.worlds.new("Machine_World"); sc.world = w; w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs["Color"].default_value = (0.0012, 0.0034, 0.0043, 1)     # Mother's ground, rgba(4, 11, 14)
bg.inputs["Strength"].default_value = 1.0
root_col = sc.collection

def coll(name):
    c = bpy.data.collections.new(name); root_col.children.link(c); return c
C_HULL, C_PARTS, C_DATA, C_CREW, C_RIG = coll("Machine_Hull"), coll("Machine_Parts"), coll("Machine_Data"), coll("Machine_Crew"), coll("Machine_Rig")

# ---------------------------------------------------------------- materials
M = bpy.data.materials
def pbr(name, base, metal=0.0, rough=0.5, **kw):
    m = M.get(name) or M.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = base; b.inputs["Metallic"].default_value = metal; b.inputs["Roughness"].default_value = rough
    for k, v in kw.items(): b.inputs[k].default_value = v
    return m
def emissive(name, colour, strength):
    m = M.get(name) or M.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    o = nt.nodes.new("ShaderNodeOutputMaterial"); e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = colour; e.inputs["Strength"].default_value = strength
    nt.links.new(e.outputs[0], o.inputs[0]); return m
mat_coat = pbr("M_Coating", (0.776, 0.738, 0.651, 1), 0.0, 0.55)
mat_inner = pbr("M_Inner_Wall", (0.55, 0.56, 0.56, 1), 0.0, 0.7)
mat_alu = pbr("M_Alu_Brushed", (0.91, 0.915, 0.92, 1), 1.0, 0.28, **{"Anisotropic": 0.6})
mat_alu_mach = pbr("M_Alu_Machined", (0.93, 0.93, 0.94, 1), 1.0, 0.18)
mat_steel = pbr("M_Steel", (0.55, 0.54, 0.52, 1), 1.0, 0.35)
mat_motor = pbr("M_Motor_Black", (0.025, 0.025, 0.028, 1), 0.6, 0.35)
mat_cut = pbr("M_Cut_Edge", (0.30, 0.30, 0.31, 1), 0.8, 0.45)
mat_bag = pbr("M_Sleeping_Bag", (0.09, 0.12, 0.16, 1), 0.0, 0.8, **{"Sheen Weight": 0.5})
mat_skin = pbr("M_Head", (0.55, 0.47, 0.42, 1), 0.0, 0.6)
mat_deck = pbr("M_Deck", (0.06, 0.065, 0.07, 1), 0.7, 0.5)
mat_mesh = pbr("M_Perforated", (0.6, 0.6, 0.6, 1), 1.0, 0.4)
# sorbent pellets: granular bump on an off-white fill
mat_sorb = pbr("M_Sorbent", (0.80, 0.80, 0.76, 1), 0.0, 0.85)
nt = mat_sorb.node_tree; b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
vo = nt.nodes.new("ShaderNodeTexVoronoi"); vo.inputs["Scale"].default_value = 140
tc = nt.nodes.new("ShaderNodeTexCoord"); nt.links.new(tc.outputs["Object"], vo.inputs["Vector"])
bu = nt.nodes.new("ShaderNodeBump"); bu.inputs["Strength"].default_value = 0.9; bu.inputs["Distance"].default_value = 0.004
nt.links.new(vo.outputs["Distance"], bu.inputs["Height"]); nt.links.new(bu.outputs["Normal"], b.inputs["Normal"])
# data layer: Mother's teal, the only saturated colour in the scene
mat_data = emissive("M_Data_Teal", TEAL, 6.0)

def link(o, c, mat=None, smooth=True):
    for x in list(o.users_collection): x.objects.unlink(o)
    c.objects.link(o)
    if mat is not None:
        o.data.materials.clear(); o.data.materials.append(mat)
    if smooth and o.type == 'MESH':
        for p in o.data.polygons: p.use_smooth = True
        try:
            o.data.set_sharp_from_angle(angle=math.radians(40))
        except Exception:
            pass
    return o

def cylinder_y(name, x, y0, y1, r, c, mat, verts=96, z=0.0, caps=True):
    """A cylinder along the model's Y (Blender Z)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, segments=verts, radius1=r * S, radius2=r * S, depth=(y1 - y0) * S)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); o.location = P(x, (y0 + y1) / 2, z)
    return link(o, c, mat)

def cylinder_x(name, x0, x1, r, c, mat, verts=96, y=0.0, caps=True):
    o = cylinder_y(name, 0, x0, x1, r, c, mat, verts, caps=caps)
    o.rotation_euler = (0, math.pi / 2, 0); o.location = P((x0 + x1) / 2, y, 0)
    return o

def cut_front(o, thickness, margin=0.0):
    """Open the half that faces the camera (Blender Y < 0) and give the shell a wall.
    The front half is deleted from the mesh itself (a boolean is fragile on open shells);
    the solidify's rim closes the cut edge, in the cut-edge material."""
    bpy.context.view_layer.update()
    mw = o.matrix_world
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if (mw @ v.co).y < -1e-5], context='VERTS')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data); bm.free()
    while len(o.data.materials) < 2: o.data.materials.append(mat_inner)
    o.data.materials.append(mat_cut)
    sol = o.modifiers.new("Wall", "SOLIDIFY"); sol.thickness = thickness; sol.offset = -1; sol.use_even_offset = True
    sol.material_offset = 1; sol.material_offset_rim = 2
    return o

# the cutter: everything in front of the model's z = 0 plane (Blender Y < 0)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -5.0, 0))
CUTTER = bpy.context.active_object; CUTTER.name = "Cutaway_Box"; CUTTER.scale = (40, 10, 40)
link(CUTTER, C_RIG, None, False); CUTTER.hide_render = True; CUTTER.display_type = 'WIRE'

# ---------------------------------------------------------------- cabin
cab = cylinder_x("Cabin_Hull", CABIN["x0"], CABIN["x1"], CABIN["r"], C_HULL, mat_coat, caps=False)
cab.data.materials.append(mat_inner)
for side, xx in (("A", CABIN["x0"]), ("B", CABIN["x1"])):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=48, radius=CABIN["r"] * S)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if (v.co.x > 1e-4 if side == "A" else v.co.x < -1e-4)], context='VERTS')
    me = bpy.data.meshes.new("Cabin_End_" + side); bm.to_mesh(me); bm.free()
    d = bpy.data.objects.new("Cabin_End_" + side, me); d.location = P(xx, 0, 0); d.scale = (0.3 / CABIN["r"], 1, 1)
    link(d, C_HULL, mat_coat); d.data.materials.append(mat_inner)
    cut_front(d, 0.03)
cut_front(cab, 0.03)
for k, xx in enumerate((CABIN["x0"] + 0.05, (CABIN["x0"] + CABIN["x1"]) / 2, CABIN["x1"] - 0.05)):
    bpy.ops.mesh.primitive_torus_add(major_radius=(CABIN["r"] + 0.03) * S, minor_radius=0.035 * S, major_segments=96, minor_segments=12,
                                     location=P(xx, 0, 0), rotation=(0, math.pi / 2, 0))
    t = link(bpy.context.active_object, C_HULL, mat_alu); t.name = f"Cabin_Ring_{k}"
    bo = t.modifiers.new("Cutaway", "BOOLEAN"); bo.operation = 'DIFFERENCE'; bo.object = CUTTER; bo.solver = 'EXACT'
# cabin floor: the crew stand on it at the page's foot line (y = -1.18); its width is the hull chord there
FLOOR_Y = -1.15
half = math.sqrt(CABIN["r"] ** 2 - FLOOR_Y ** 2) - 0.03
bpy.ops.mesh.primitive_cube_add(size=1, location=P((CABIN["x0"] + CABIN["x1"]) / 2, FLOOR_Y - 0.02, half / 2))
fl = link(bpy.context.active_object, C_HULL, mat_deck, False); fl.name = "Cabin_Floor"
fl.scale = ((CABIN["x1"] - CABIN["x0"]) * S, half * S, 0.04 * S)

# ---------------------------------------------------------------- crew: four sleepers, at the page's positions
for k, x in enumerate(CREW_X):
    # the page draws a head ring at y = -0.72 and a body line from -0.89 down to -1.18
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.14 * S, location=P(x, -0.74, 0.15))
    link(bpy.context.active_object, C_CREW, mat_skin).name = f"Crew_Head_{k}"
    # an upright sleeping bag, as in crew quarters, from the shoulders to the floor
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.15 * S, depth=0.29 * S, location=P(x, -1.18 + 0.145, 0.15))
    bag = link(bpy.context.active_object, C_CREW, mat_bag); bag.name = f"Crew_Bag_{k}"
    sub = bag.modifiers.new("Round", "BEVEL"); sub.width = 0.06 * S; sub.segments = 6

# ---------------------------------------------------------------- ducts: rounded tubes along the page's paths
def rounded(path, rc=0.32, steps=10):
    pts = [Vector(path[0])]
    for i in range(1, len(path) - 1):
        a, b, c = Vector(path[i - 1]), Vector(path[i]), Vector(path[i + 1])
        d1 = (b - a).normalized(); d2 = (c - b).normalized()
        p1 = b - d1 * rc; p2 = b + d2 * rc
        for k in range(steps + 1):
            t = k / steps
            pts.append((1 - t) ** 2 * p1 + 2 * (1 - t) * t * b + t * t * p2)
    pts.append(Vector(path[-1])); return pts
def tube(name, path, r, mat, c):
    cu = bpy.data.curves.new(name, "CURVE"); cu.dimensions = '3D'; cu.bevel_depth = r * S; cu.bevel_resolution = 8
    cu.use_fill_caps = False
    sp = cu.splines.new('POLY'); pts = rounded(path); sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        q = P(*p); sp.points[i].co = (q.x, q.y, q.z, 1)
    o = bpy.data.objects.new(name, cu); c.objects.link(o)
    bpy.context.view_layer.objects.active = o
    for x in bpy.context.view_layer.objects: x.select_set(False)
    o.select_set(True); bpy.ops.object.convert(target='MESH'); o = bpy.context.active_object
    link(o, c, mat); o.data.materials.append(mat_inner)
    return o
for name, path in (("Duct_Out", DUCT_OUT), ("Duct_Back", DUCT_BACK)):
    d = tube(name, path, DUCT_R, mat_alu, C_HULL)
    cut_front(d, 0.025)
    # flanges at both ends
    for end, nxt in ((path[0], path[1]), (path[-1], path[-2])):
        e, n = Vector(end), Vector(nxt); ax = (n - e).normalized()
        bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=(DUCT_R + 0.07) * S, depth=0.05 * S, location=P(*(e + ax * 0.05)))
        f = link(bpy.context.active_object, C_HULL, mat_steel); f.name = name + "_Flange"
        f.rotation_euler = Vector((ax.x, ax.z, ax.y)).to_track_quat('Z', 'Y').to_euler()
        bo = f.modifiers.new("Cutaway", "BOOLEAN"); bo.operation = 'DIFFERENCE'; bo.object = CUTTER; bo.solver = 'EXACT'

# ---------------------------------------------------------------- scrubber column
col = cylinder_y("Column_Housing", COL["x"], COL["bottom"], COL["top"], COL["r"], C_HULL, mat_coat, caps=False)
col.data.materials.append(mat_inner)
cut_front(col, 0.035)
for k, (yy, nm) in enumerate(((COL["top"], "Top"), (COL["bottom"], "Bottom"))):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=48, radius=COL["r"] * S)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if (v.co.z < -1e-4 if nm == "Top" else v.co.z > 1e-4)], context='VERTS')
    me = bpy.data.meshes.new("Column_" + nm); bm.to_mesh(me); bm.free()
    cap = bpy.data.objects.new("Column_" + nm, me); cap.location = P(COL["x"], yy, 0); cap.scale = (1, 1, 0.22 / COL["r"])
    link(cap, C_HULL, mat_coat); cap.data.materials.append(mat_inner); cut_front(cap, 0.035)
for k, yy in enumerate((COL["top"] - 0.04, (COL["top"] + COL["bottom"]) / 2 + 0.3, COL["bottom"] + 0.04)):
    bpy.ops.mesh.primitive_torus_add(major_radius=(COL["r"] + 0.03) * S, minor_radius=0.035 * S, major_segments=96, minor_segments=12, location=P(COL["x"], yy, 0))
    t = link(bpy.context.active_object, C_HULL, mat_alu); t.name = f"Column_Ring_{k}"
    bo = t.modifiers.new("Cutaway", "BOOLEAN"); bo.operation = 'DIFFERENCE'; bo.object = CUTTER; bo.solver = 'EXACT'

# motor, shaft and the spider that holds them
cylinder_y("Motor_Can", COL["x"], MOTOR["y0"], MOTOR["y1"], MOTOR["r"], C_PARTS, mat_motor)
cylinder_y("Motor_EndBell", COL["x"], MOTOR["y1"], MOTOR["y1"] + 0.05, MOTOR["r"] * 0.8, C_PARTS, mat_alu)
cylinder_y("Shaft", COL["x"], MOTOR["y1"], IMP["y"] - 0.05, 0.04, C_PARTS, mat_steel, 24)
for k in range(3):
    a = math.radians(90 + k * 120)
    p0 = P(COL["x"] + math.cos(a) * MOTOR["r"], 0.32, math.sin(a) * MOTOR["r"])
    p1 = P(COL["x"] + math.cos(a) * (COL["r"] - 0.02), 0.32, math.sin(a) * (COL["r"] - 0.02))
    d = p1 - p0
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.025 * S, depth=d.length, location=(p0 + p1) / 2)
    s_ = link(bpy.context.active_object, C_PARTS, mat_steel); s_.name = f"Motor_Strut_{k}"
    s_.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()

# sorbent bed: perforated canister, granular fill, perforated plates
cylinder_y("Bed_Fill", COL["x"], BED["y0"] + 0.02, BED["y1"] - 0.04, BED["r"] - 0.03, C_PARTS, mat_sorb)
bed = cylinder_y("Bed_Canister", COL["x"], BED["y0"], BED["y1"], BED["r"], C_PARTS, mat_mesh, caps=False)
sol = bed.modifiers.new("Wall", "SOLIDIFY"); sol.thickness = 0.01
bo = bed.modifiers.new("Cutaway", "BOOLEAN"); bo.operation = 'DIFFERENCE'; bo.object = CUTTER; bo.solver = 'EXACT'
fill = bpy.data.objects["Bed_Fill"]
bo = fill.modifiers.new("Cutaway", "BOOLEAN"); bo.operation = 'DIFFERENCE'; bo.object = CUTTER; bo.solver = 'EXACT'
for yy in (BED["y0"], BED["y1"]):
    cylinder_y(f"Bed_Plate_{yy}", COL["x"], yy - 0.015, yy + 0.015, BED["r"], C_PARTS, mat_mesh)

# ---------------------------------------------------------------- impeller (the only thing that turns)
IMP_ROOT = bpy.data.objects.new("Impeller", None); C_PARTS.objects.link(IMP_ROOT)
IMP_ROOT.location = P(COL["x"], IMP["y"], 0)
def blade(i):
    a0 = i / 6 * 2 * math.pi
    bm = bmesh.new(); N, T = 10, 10; grid = []
    for si in range(N + 1):
        s = si / N; rad = 0.2 + 0.5 * s; h = 0.07 + 0.09 * s; row = []
        for ti in range(T + 1):
            t = ti / T; a = a0 + 0.42 * t; y = -h + 2 * h * t
            row.append(bm.verts.new(Vector((math.cos(a) * rad * S, math.sin(a) * rad * S, y * S))))
        grid.append(row)
    for si in range(N):
        for ti in range(T):
            bm.faces.new((grid[si][ti], grid[si + 1][ti], grid[si + 1][ti + 1], grid[si][ti + 1]))
    me = bpy.data.meshes.new(f"Blade_{i}"); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(f"Blade_{i}", me); link(o, C_PARTS, mat_alu_mach)
    so = o.modifiers.new("Thick", "SOLIDIFY"); so.thickness = 0.018 * S; so.offset = 0
    o.parent = IMP_ROOT; return o
for i in range(6): blade(i)
hub = cylinder_y("Impeller_Hub", 0, -0.1, 0.1, 0.2, C_PARTS, mat_alu_mach, 64); hub.parent = IMP_ROOT; hub.location = (0, 0, 0)
cone = cylinder_y("Impeller_Nose", 0, 0.1, 0.16, 0.12, C_PARTS, mat_alu_mach, 48); cone.parent = IMP_ROOT; cone.location = (0, 0, 0.13 * S)
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=(IMP["r"] + 0.01) * S, depth=0.34 * S, end_fill_type='NOTHING', location=(0, 0, 0))
shroud = link(bpy.context.active_object, C_PARTS, mat_alu_mach); shroud.name = "Impeller_Shroud"
so = shroud.modifiers.new("Thick", "SOLIDIFY"); so.thickness = 0.02 * S
shroud.parent = IMP_ROOT; shroud.location = (0, 0, 0)
# a stator ring in the housing, at the impeller (static)
bpy.ops.mesh.primitive_torus_add(major_radius=(IMP["r"] + 0.06) * S, minor_radius=0.03 * S, major_segments=96, minor_segments=12, location=P(COL["x"], IMP["y"] - 0.2, 0))
st = link(bpy.context.active_object, C_PARTS, mat_steel); st.name = "Stator_Ring"

# ---------------------------------------------------------------- data layer (teal): CO2 motes, flow dashes, bed residual
seed = 11
def rnd():
    global seed
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
MOTES = []
for i in range(260):
    a = rnd() * 2 * math.pi; rr = math.sqrt(rnd()) * (CABIN["r"] - 0.12)
    MOTES.append((CABIN["x0"] + 0.15 + rnd() * (CABIN["x1"] - CABIN["x0"] - 0.3), math.sin(a) * rr, math.cos(a) * rr))
for i, (x, y, z) in enumerate(MOTES):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.018 * S, location=P(x, y, abs(z)))   # behind the cut plane
    m = link(bpy.context.active_object, C_DATA, mat_data, False); m.name = f"Mote_{i:03d}"
for path_name, path in (("Out", DUCT_OUT), ("Back", DUCT_BACK)):
    for i in range(7):
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.035 * S, depth=0.34 * S)
        d = link(bpy.context.active_object, C_DATA, mat_data, False); d.name = f"Dash_{path_name}_{i}"
for i in range(7):
    bpy.ops.mesh.primitive_torus_add(major_radius=(BED["r"] - 0.04) * S, minor_radius=0.006 * S, major_segments=64, minor_segments=6, location=P(COL["x"], BED["y0"], 0))
    r_ = link(bpy.context.active_object, C_DATA, mat_data, False); r_.name = f"Residual_Ring_{i}"

# ---------------------------------------------------------------- the reading the scene shows (driven by bake_reading.py)
READ = bpy.data.objects.new("Reading", None); C_RIG.objects.link(READ)
READ["speed_pct"] = 33.0; READ["power"] = 1; READ["ppm"] = 1200.0; READ["residual"] = 0.02; READ["state"] = "NOMINAL"

# ---------------------------------------------------------------- lights: neutral studio
def area(name, loc, target, power, size):
    ld = bpy.data.lights.new(name, "AREA"); ld.energy = power; ld.size = size; ld.color = (1, 0.99, 0.98)
    o = bpy.data.objects.new(name, ld); C_RIG.objects.link(o); o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); return o
area("Key", (-1.5, -4.0, 3.2), (0, 0, 0), 900, 3.0)
area("Fill", (3.5, -3.5, 0.5), (0.5, 0, 0), 250, 2.5)
area("Rim", (0.5, 3.5, 3.0), (0, 0, 0), 500, 2.0)
area("Inside_Cabin", P(-2.8, 1.0, 0.6), P(-2.8, -1.0, 0.4), 15, 0.4)

# ---------------------------------------------------------------- camera of plan 2: the page's projection
YAW, PITCH, DIST = -0.58, 0.30, 15.0
cY, sY, cP, sP = math.cos(YAW), math.sin(YAW), math.cos(PITCH), math.sin(PITCH)
Ry = Matrix(((cY, 0, -sY), (0, 1, 0), (sY, 0, cY)))
Rp = Matrix(((1, 0, 0), (0, cP, -sP), (0, sP, cP)))
R = Rp @ Ry
Rt = R.transposed()
def mvec(v): return Vector((v.x, v.z, v.y))          # model direction -> Blender
cam_m = Rt @ Vector((0, 0, -DIST)); right = mvec(Rt @ Vector((1, 0, 0))); up = mvec(Rt @ Vector((0, 1, 0))); fwd = mvec(Rt @ Vector((0, 0, 1)))
cd = bpy.data.cameras.new("Cam_Plan2"); cam = bpy.data.objects.new("Cam_Plan2", cd); C_RIG.objects.link(cam)
cam.matrix_world = Matrix((
    (right.x, up.x, -fwd.x, cam_m.x * S),
    (right.y, up.y, -fwd.y, cam_m.z * S),
    (right.z, up.z, -fwd.z, cam_m.y * S),
    (0, 0, 0, 1)))
# the page fits the model in 63 % of the width and 94 % of the height, centred at 33.5 % of the width
def proj(p):
    v = R @ Vector(p); f = DIST / (DIST + v.z); return v.x * f, v.y * f
pts = []
for x in (CABIN["x0"] - 0.3, CABIN["x1"] + 0.3):
    for a in range(0, 360, 15):
        pts.append((x, math.cos(math.radians(a)) * CABIN["r"], math.sin(math.radians(a)) * CABIN["r"]))
for y in (COL["bottom"] - 0.22, COL["top"] + 0.22):
    for a in range(0, 360, 15):
        pts.append((COL["x"] + math.cos(math.radians(a)) * COL["r"], y, math.sin(math.radians(a)) * COL["r"]))
for path in (DUCT_OUT, DUCT_BACK):
    for p in path:
        for dx in (-DUCT_R, DUCT_R):
            for dy in (-DUCT_R, DUCT_R): pts.append((p[0] + dx, p[1] + dy, p[2]))
xs, ys = zip(*[proj(p) for p in pts])
W, H = 1920, 1080
scale = min(W * 0.63 / (max(xs) - min(xs)), H * 0.94 / (max(ys) - min(ys)))
cd.sensor_fit = 'HORIZONTAL'; cd.sensor_width = 36.0
cd.lens = DIST * scale / W * cd.sensor_width          # pixels per unit of x/depth -> focal length
cd.shift_x = (W * 0.335 - ((min(xs) + max(xs)) / 2) * scale - W / 2) / W
cd.shift_y = -((min(ys) + max(ys)) / 2) * scale / W
cd.clip_start = 0.05; cd.clip_end = 100
sc.camera = cam
# camera of plan 4: the impeller, close
cd4 = bpy.data.cameras.new("Cam_Plan4"); cd4.lens = 50; cam4 = bpy.data.objects.new("Cam_Plan4", cd4); C_RIG.objects.link(cam4)
tgt = P(COL["x"], IMP["y"], 0.1); cam4.location = tgt + Vector((-0.55, -1.35, 0.55))
cam4.rotation_euler = (tgt - cam4.location).to_track_quat('-Z', 'Y').to_euler()
cd4.dof.use_dof = True; cd4.dof.focus_distance = (tgt - cam4.location).length; cd4.dof.aperture_fstop = 2.8
print("machine built: lens", round(cd.lens, 2), "shift", round(cd.shift_x, 3), round(cd.shift_y, 3))
