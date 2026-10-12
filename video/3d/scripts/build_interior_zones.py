# The three zones inside the habitat (run after build_interior.py, can be re-run alone):
#   crew quarters  (+y wall, aft):   four bunks in two stacks, curtains half drawn, sleepers only guessed;
#   watch station  (-y wall, middle, under the lit porthole): the control center screen and, on its
#                   left, the medical monitoring screen, both playing the recorded station screens;
#   life-support bay (+y wall, forward): the scrubber in its rack with an inspection window on the
#                   impeller, the broker plate, the board in its enclosure; the crew cut-off by the hatch.
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

ZC, R_IN, FLOOR, CEIL = 3.4, 2.08, 2.1, 4.75
O = bpy.data.objects; M = bpy.data.materials; root = O["Habitat_Root"]
BASE = r"C:\Users\GuillaumePelletier\Documents\GitHub\Gaume\co2-scrubber-governed-agent\video\3d"
cols = {n: bpy.data.collections[n] for n in ("Int_Crew", "Int_Watch", "Int_ECLSS")}
for c in cols.values():
    for o in list(c.all_objects): bpy.data.objects.remove(o, do_unlink=True)
C_CREW, C_WATCH, C_ECLSS = cols["Int_Crew"], cols["Int_Watch"], cols["Int_ECLSS"]
def wall_y(z): return math.sqrt(max(R_IN ** 2 - (z - ZC) ** 2, 0.0))

def pbr(name, base, metal=0.0, rough=0.5, **kw):
    old = M.get(name)
    if old: M.remove(old)
    m = M.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = base; b.inputs["Metallic"].default_value = metal; b.inputs["Roughness"].default_value = rough
    for k, v in kw.items(): b.inputs[k].default_value = v
    return m, b
mat_comp = M["I_Composite_White"]; mat_frame = M["I_Rack_Frame"]; mat_fabric = M["I_Curtain"]; mat_bag = M["I_Sleeping_Bag"]
mat_pillow = M["I_Pillow"]; mat_dark = M["I_Plastic_Dark"]; mat_rack = M["I_Rack_Front"]; mat_cable = M["I_Cable"]
mat_alu = M["Aluminium_Brushed"]; mat_steel = M["Steel_Titanium"]; mat_rail = M["I_Handrail"]
mat_mattress, _ = pbr("I_Mattress", (0.10, 0.10, 0.11, 1), 0.0, 0.9)
mat_glass, _ = pbr("I_Polycarbonate", (1, 1, 1, 1), 0.0, 0.05, **{"Transmission Weight": 1.0, "IOR": 1.58})
mat_pcb, _ = pbr("I_PCB_Black", (0.012, 0.013, 0.014, 1), 0.0, 0.35, **{"Coat Weight": 0.6})
mat_tin, _ = pbr("I_Shield_Can", (0.75, 0.75, 0.74, 1), 1.0, 0.3)
mat_anod, _ = pbr("I_Anodised_Plate", (0.08, 0.085, 0.09, 1), 0.9, 0.35)
mat_engr, _ = pbr("I_Engraving", (0.75, 0.76, 0.77, 1), 1.0, 0.4)
def emissive(name, colour, strength):
    old = M.get(name)
    if old: M.remove(old)
    m = M.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    o = nt.nodes.new("ShaderNodeOutputMaterial"); e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = colour; e.inputs["Strength"].default_value = strength; nt.links.new(e.outputs[0], o.inputs[0]); return m
TEAL = (0.028, 0.745, 0.578, 1)
mat_led_teal = emissive("I_LED_Teal", TEAL, 8.0)       # armed / data: Mother's teal
mat_led_white = emissive("I_LED_Status", (0.9, 0.95, 1.0, 1), 4.0)

def put(o, col, mat=None, smooth=False):
    for x in list(o.users_collection): x.objects.unlink(o)
    col.objects.link(o); o.parent = root
    if mat is not None and o.type in ('MESH', 'CURVE', 'FONT'):
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
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d.length, location=(a + b) / 2, end_fill_type='NGON' if caps else 'NOTHING')
    o = bpy.context.active_object; o.name = name; o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return put(o, col, mat, True)
def text(name, col, body, loc, size, rot, mat, extrude=0.0005):
    cu = bpy.data.curves.new(name, "FONT"); cu.body = body; cu.size = size; cu.extrude = extrude; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    o = bpy.data.objects.new(name, cu); o.location = loc; o.rotation_euler = rot
    return put(o, col, mat)

# ================================================================ crew quarters: +y wall, x -4.75 .. -0.85
def sleeper(name, x0, x1, y, z, curl, head_at_x0):
    """A sleeping bag with someone in it: a body-shaped profile along x, flattened, hood at the head end."""
    prof = [(0.00, 0.10), (0.06, 0.14), (0.30, 0.17), (0.55, 0.20), (0.85, 0.24), (1.10, 0.26), (1.35, 0.27), (1.50, 0.25),
            (1.58, 0.18), (1.66, 0.17), (1.80, 0.16), (1.88, 0.09)]
    L = x1 - x0; bm = bmesh.new(); rings = []; seg = 24
    for t, r in prof:
        ring = []
        for k in range(seg):
            a = 2 * math.pi * k / seg
            yy = math.cos(a) * r; zz = math.sin(a) * r * (0.55 if math.sin(a) > 0 else 0.35)
            xx = (x1 - t / 1.88 * L) if head_at_x0 else (x0 + t / 1.88 * L)
            yy += curl * math.sin(t / 1.88 * math.pi) * 0.12          # a hip turned towards the wall
            ring.append(bm.verts.new((xx, y + yy, z + 0.06 + zz + 0.35 * r)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(seg):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); put(o, C_CREW, mat_bag, True)
    s = o.modifiers.new("Smooth", "SUBSURF"); s.levels = 2; s.render_levels = 2
    d = o.modifiers.new("Folds", "DISPLACE"); tx = bpy.data.textures.new(name + "_folds", "CLOUDS"); tx.noise_scale = 0.12
    d.texture = tx; d.strength = 0.025; d.texture_coords = 'OBJECT'
    return o
def bunk(tag, x0, x1, z, curtain_open, sleeper_curl, head_at_x0):
    y_front, y_back = 1.02, wall_y(z + 0.5) - 0.02
    box(f"Bunk_{tag}_Board", C_CREW, mat_comp, (x0 + x1) / 2, (y_front + y_back) / 2, z, x1 - x0, y_back - y_front, 0.04, 0.006)
    box(f"Bunk_{tag}_Mattress", C_CREW, mat_mattress, (x0 + x1) / 2, (y_front + y_back) / 2 + 0.02, z + 0.06, x1 - x0 - 0.06, y_back - y_front - 0.08, 0.08, 0.03)
    box(f"Bunk_{tag}_Back", C_CREW, mat_comp, (x0 + x1) / 2, y_back, z + 0.5, x1 - x0, 0.02, 0.98, 0.003)
    yp = (y_front + y_back) / 2 + 0.04
    hx = x0 + 0.25 if head_at_x0 else x1 - 0.25
    box(f"Bunk_{tag}_Pillow", C_CREW, mat_pillow, hx, yp, z + 0.15, 0.34, 0.5, 0.09, 0.04)
    sleeper(f"Sleeper_{tag}", x0 + 0.06, x1 - 0.06, yp, z + 0.08, sleeper_curl, head_at_x0)
    # the curtain rail and a curtain, drawn over (1 - open) of the length, in soft folds
    cyl(f"Bunk_{tag}_Rail", C_CREW, mat_alu, (x0 + 0.02, y_front - 0.04, z + 0.95), (x1 - 0.02, y_front - 0.04, z + 0.95), 0.008, 12)
    cl = (x1 - x0) * (1 - curtain_open); cx0 = x1 - cl
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=60, y_subdivisions=12, size=1, location=(cx0 + cl / 2, y_front - 0.04, z + 0.5), rotation=(math.pi / 2, 0, 0))
    cu = bpy.context.active_object; cu.name = f"Bunk_{tag}_Curtain"; cu.scale = (cl, 0.9, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for v in cu.data.vertices:
        v.co.z += 0.035 * math.sin(v.co.x * 2 * math.pi / 0.11)      # pleats (the grid's local z is the room's -y)
    put(cu, C_CREW, mat_fabric, True)
    so = cu.modifiers.new("Cloth", "SOLIDIFY"); so.thickness = 0.004
    # a small reading lamp, off
    box(f"Bunk_{tag}_Lamp", C_CREW, mat_dark, hx, y_back - 0.04, z + 0.75, 0.08, 0.04, 0.03, 0.006)
for i, (x0, x1) in enumerate(((-4.75, -2.85), (-2.75, -0.85))):
    bunk(f"{i}L", x0, x1, FLOOR + 0.25, 0.35 if i else 0.15, 1 if i else -1, i == 0)
    bunk(f"{i}U", x0, x1, FLOOR + 1.35, 0.55 if i else 0.25, -1 if i else 1, i == 1)
    for xx in (x0 - 0.04, x1 + 0.04):
        box(f"Bunk_{i}_Partition_{xx:.2f}", C_CREW, mat_comp, xx, 1.45, (FLOOR + 4.6) / 2 + 0.05, 0.03, 0.9, 2.45, 0.004)
box("Crew_Locker", C_CREW, mat_comp, -2.8, 1.45, CEIL - 0.25, 3.9, 0.85, 0.4, 0.008)

# ================================================================ watch station: -y wall, under the lit porthole (x = -1)
DESK_Z = FLOOR + 0.72
box("Desk", C_WATCH, mat_comp, -1.1, -1.62, DESK_Z, 2.3, 0.62, 0.035, 0.008)
box("Desk_Drawers", C_WATCH, mat_comp, -0.18, -1.66, (FLOOR + DESK_Z) / 2, 0.45, 0.5, DESK_Z - FLOOR - 0.04, 0.008)
box("Keyboard", C_WATCH, mat_dark, -1.05, -1.42, DESK_Z + 0.025, 0.44, 0.15, 0.018, 0.004)
box("Trackball", C_WATCH, mat_dark, -0.68, -1.42, DESK_Z + 0.03, 0.09, 0.11, 0.03, 0.01)
box("Desk_Mic_Base", C_WATCH, mat_dark, -1.55, -1.5, DESK_Z + 0.02, 0.07, 0.07, 0.015, 0.004)
cyl("Desk_Mic_Arm", C_WATCH, mat_steel, (-1.55, -1.5, DESK_Z + 0.03), (-1.45, -1.38, DESK_Z + 0.25), 0.006, 8)
cyl("Desk_Mic", C_WATCH, mat_dark, (-1.45, -1.38, DESK_Z + 0.25), (-1.4, -1.3, DESK_Z + 0.27), 0.012, 12)
# a heart-rate chest strap left on the desk: the only trace of a person here
bpy.ops.mesh.primitive_torus_add(major_radius=0.13, minor_radius=0.012, major_segments=48, minor_segments=8, location=(-0.42, -1.48, DESK_Z + 0.03))
st = put(bpy.context.active_object, C_WATCH, mat_dark, True); st.name = "Chest_Strap"; st.scale = (1.4, 0.55, 1)
box("Chest_Strap_Sensor", C_WATCH, mat_dark, -0.25, -1.48, DESK_Z + 0.035, 0.06, 0.035, 0.012, 0.008)
# stool
cyl("Stool_Post", C_WATCH, mat_steel, (-1.0, -0.9, FLOOR), (-1.0, -0.9, FLOOR + 0.45), 0.025, 16)
cyl("Stool_Seat", C_WATCH, mat_dark, (-1.0, -0.9, FLOOR + 0.45), (-1.0, -0.9, FLOOR + 0.5), 0.2, 32)
cyl("Stool_Foot", C_WATCH, mat_steel, (-1.0, -0.9, FLOOR), (-1.0, -0.9, FLOOR + 0.02), 0.22, 32)

# screens: the recorded station screens (3836 x 912: medical | control center | factory), cropped per screen
SEQ = os.path.join(BASE, "textures", "screens", "screens_0001.jpg")
img = bpy.data.images.get("screens_0001.jpg") or bpy.data.images.load(SEQ)
img.source = 'SEQUENCE'
def screen_material(name, u0, u1):
    m, b = pbr(name, (0.0, 0.0, 0.0, 1), 0.0, 0.12, **{"Coat Weight": 0.6, "Coat Roughness": 0.05})
    nt = m.node_tree; N = nt.nodes; L = nt.links
    tc = N.new("ShaderNodeTexCoord"); mp = N.new("ShaderNodeMapping")
    mp.inputs["Location"].default_value = (u0, 0, 0); mp.inputs["Scale"].default_value = (u1 - u0, 1, 1)
    L.new(tc.outputs["UV"], mp.inputs["Vector"])
    t = N.new("ShaderNodeTexImage"); t.image = img; t.extension = 'CLIP'; t.interpolation = 'Cubic'
    t.image_user.frame_duration = 336; t.image_user.frame_start = 1; t.image_user.frame_offset = 0
    t.image_user.use_auto_refresh = True; t.image_user.use_cyclic = False
    L.new(mp.outputs["Vector"], t.inputs["Vector"])
    L.new(t.outputs["Color"], b.inputs["Emission Color"]); b.inputs["Emission Strength"].default_value = 1.6
    return m
VW = 3836.0
mat_scr_center = screen_material("I_Screen_Control", 958 / VW, 2874 / VW)
mat_scr_med = screen_material("I_Screen_Medical", 0.0, 954 / VW)
def monitor(name, cx, w, h, mat, tilt=0.12):
    """A flat monitor on a wall arm, facing into the room (+y), its screen a UV plane."""
    cz = DESK_Z + 0.08 + h / 2; y = -1.66
    box(name + "_Bezel", C_WATCH, mat_dark, cx, y - 0.02, cz, w + 0.03, 0.03, h + 0.03, 0.006, rot=(tilt, 0, 0))
    bpy.ops.mesh.primitive_plane_add(size=1, location=(cx, y - 0.003, cz), rotation=(math.pi / 2 - tilt, 0, math.pi))   # faces +y, reads upright
    p = bpy.context.active_object; p.name = name + "_Screen"; p.scale = (w, h, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    put(p, C_WATCH, mat)
    cyl(name + "_Arm", C_WATCH, mat_steel, (cx, y - 0.05, cz), (cx, -1.92, cz), 0.018, 12)
    return p
monitor("Monitor_Control", -1.1, 0.86, 0.86 * 912 / 1916, mat_scr_center)
monitor("Monitor_Medical", -0.3, 0.43, 0.43 * 912 / 954, mat_scr_med)

# ================================================================ life-support bay: +y wall, x 0.4 .. 4.6
RACK_Y = 1.25
for k, (x0, x1) in enumerate(((0.45, 1.5), (1.6, 2.65), (2.75, 3.8))):
    cx = (x0 + x1) / 2
    for xx in (x0, x1):
        box(f"Rack_{k}_Post_{xx}", C_ECLSS, mat_frame, xx, RACK_Y + 0.05, (FLOOR + CEIL) / 2, 0.04, 0.06, CEIL - FLOOR - 0.04, 0.003)
    if k != 1:
        # closed racks: three front panels with handles and quick-disconnects
        for j, (z0, z1) in enumerate(((FLOOR + 0.05, FLOOR + 0.95), (FLOOR + 1.0, FLOOR + 1.85), (FLOOR + 1.9, CEIL - 0.08))):
            box(f"Rack_{k}_Panel_{j}", C_ECLSS, mat_rack, cx, RACK_Y + 0.02, (z0 + z1) / 2, x1 - x0 - 0.08, 0.025, z1 - z0 - 0.03, 0.006)
            for hx in (x0 + 0.12, x1 - 0.12):
                cyl(f"Rack_{k}_Handle_{j}_{hx}", C_ECLSS, mat_rail, (hx, RACK_Y - 0.02, (z0 + z1) / 2 - 0.08), (hx, RACK_Y - 0.02, (z0 + z1) / 2 + 0.08), 0.01, 12)
        for q in range(3):
            cyl(f"Rack_{k}_QD_{q}", C_ECLSS, mat_steel, (x0 + 0.3 + q * 0.2, RACK_Y, FLOOR + 1.4), (x0 + 0.3 + q * 0.2, RACK_Y - 0.06, FLOOR + 1.4), 0.025, 16)
        box(f"Rack_{k}_Status", C_ECLSS, mat_led_white, x0 + 0.15, RACK_Y - 0.002, FLOOR + 1.75, 0.012, 0.004, 0.012, 0)

# the scrubber rack (k = 1): the column, its ducts into the ceiling and the floor, an inspection window
SX = 2.125; COL_R = 0.3; COL_Z0, COL_Z1 = FLOOR + 0.35, FLOOR + 1.95; IMP_Z = FLOOR + 1.55
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=COL_R, depth=COL_Z1 - COL_Z0, location=(SX, RACK_Y + 0.38, (COL_Z0 + COL_Z1) / 2))
col_ = put(bpy.context.active_object, C_ECLSS, M["Coating_OffWhite"], True); col_.name = "Scrubber_Column"
col_.data.materials.clear(); col_.data.materials.append(M["Radiator_White"])
sol = col_.modifiers.new("Wall", "SOLIDIFY"); sol.thickness = 0.01; sol.offset = -1
# inspection window on the impeller
bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=0.16, depth=0.6, location=(SX, RACK_Y + 0.1, IMP_Z), rotation=(math.pi / 2, 0, 0))
wc = put(bpy.context.active_object, C_ECLSS); wc.name = "Scrubber_Window_Cut"; wc.hide_render = True; wc.display_type = 'WIRE'
bo = col_.modifiers.new("Window", "BOOLEAN"); bo.operation = 'DIFFERENCE'; bo.object = wc; bo.solver = 'EXACT'
bpy.ops.mesh.primitive_torus_add(major_radius=0.17, minor_radius=0.018, major_segments=64, minor_segments=10, location=(SX, RACK_Y + 0.38 - COL_R - 0.005, IMP_Z), rotation=(math.pi / 2, 0, 0))
put(bpy.context.active_object, C_ECLSS, mat_alu, True).name = "Scrubber_Window_Frame"
cyl("Scrubber_Window_Glass", C_ECLSS, mat_glass, (SX, RACK_Y + 0.38 - COL_R + 0.02, IMP_Z), (SX, RACK_Y + 0.38 - COL_R + 0.03, IMP_Z), 0.165, 64)
# the impeller inside: the same six twisted blades as the machine scene, scaled to the column
imp = bpy.data.objects.new("Bay_Impeller", None); C_ECLSS.objects.link(imp); imp.parent = root
imp.location = (SX, RACK_Y + 0.38, IMP_Z)
for i in range(6):
    a0 = i / 6 * 2 * math.pi; bm = bmesh.new(); N_, T_ = 8, 8; grid = []
    for si in range(N_ + 1):
        s = si / N_; rad = 0.07 + 0.19 * s; h = 0.025 + 0.035 * s; row = []
        for ti in range(T_ + 1):
            t = ti / T_; a = a0 + 0.42 * t; row.append(bm.verts.new((math.cos(a) * rad, math.sin(a) * rad, -h + 2 * h * t)))
        grid.append(row)
    for si in range(N_):
        for ti in range(T_): bm.faces.new((grid[si][ti], grid[si + 1][ti], grid[si + 1][ti + 1], grid[si][ti + 1]))
    me = bpy.data.meshes.new(f"Bay_Blade_{i}"); bm.to_mesh(me); bm.free()
    bl = bpy.data.objects.new(f"Bay_Blade_{i}", me); C_ECLSS.objects.link(bl); bl.parent = imp
    bl.data.materials.append(M["M_Alu_Machined"] if "M_Alu_Machined" in M else mat_alu)
    sm = bl.modifiers.new("Thick", "SOLIDIFY"); sm.thickness = 0.006
hub = cyl("Bay_Impeller_Hub", C_ECLSS, M.get("M_Alu_Machined", mat_alu), (0, 0, -0.04), (0, 0, 0.04), 0.07, 48); hub.parent = imp; hub.location = (0, 0, 0); hub.rotation_euler = (0, 0, 0)
cyl("Bay_Motor", C_ECLSS, M.get("M_Motor_Black", mat_dark), (SX, RACK_Y + 0.38, IMP_Z - 0.35), (SX, RACK_Y + 0.38, IMP_Z - 0.1), 0.12, 48)
cyl("Bay_Shaft", C_ECLSS, mat_steel, (SX, RACK_Y + 0.38, IMP_Z - 0.1), (SX, RACK_Y + 0.38, IMP_Z), 0.012, 16)
# ducts: up into the ceiling (to the cabin air), down into the floor (the return)
cyl("Scrubber_Duct_Up", C_ECLSS, mat_alu, (SX, RACK_Y + 0.38, COL_Z1), (SX, RACK_Y + 0.38, CEIL), 0.11, 48)
cyl("Scrubber_Duct_Down", C_ECLSS, mat_alu, (SX, RACK_Y + 0.38, FLOOR), (SX, RACK_Y + 0.38, COL_Z0), 0.11, 48)
for z in (COL_Z0, COL_Z1, CEIL - 0.03, FLOOR + 0.03):
    cyl(f"Scrubber_Flange_{z:.2f}", C_ECLSS, mat_steel, (SX, RACK_Y + 0.38, z - 0.015), (SX, RACK_Y + 0.38, z + 0.015), 0.15 if z in (CEIL - 0.03, FLOOR + 0.03) else COL_R + 0.03, 64)
# sorbent cartridge door low on the column, and its label
box("Scrubber_Cartridge_Door", C_ECLSS, mat_rack, SX, RACK_Y + 0.38 - COL_R - 0.01, COL_Z0 + 0.35, 0.36, 0.015, 0.42, 0.01)
text("Scrubber_Label", C_ECLSS, "SCR-1  CO2 SCRUBBER", (SX, RACK_Y + 0.38 - COL_R - 0.02, COL_Z1 - 0.1), 0.035, (math.pi / 2, 0, 0), mat_dark)
# the broker plate: the resource path, engraved, and an armed ring (teal); it turns to the colour of a real deny in plan 3
PLATE_Z = CEIL - 0.42
box("Broker_Plate", C_ECLSS, mat_anod, SX, RACK_Y + 0.06, PLATE_Z, 0.62, 0.012, 0.16, 0.004)
text("Broker_Plate_Text", C_ECLSS, "/habitat/cabin-1/eclss/scrubber-1", (SX + 0.03, RACK_Y + 0.052, PLATE_Z + 0.02), 0.03, (math.pi / 2, 0, 0), mat_engr)
text("Broker_Plate_Title", C_ECLSS, "BROKER  -  RIGHTS PER PATH", (SX + 0.03, RACK_Y + 0.052, PLATE_Z - 0.04), 0.018, (math.pi / 2, 0, 0), mat_engr)
bpy.ops.mesh.primitive_torus_add(major_radius=0.03, minor_radius=0.006, major_segments=32, minor_segments=8, location=(SX - 0.25, RACK_Y + 0.05, PLATE_Z), rotation=(math.pi / 2, 0, 0))
put(bpy.context.active_object, C_ECLSS, mat_led_teal, True).name = "Broker_Ring"
# the board in its enclosure, beside the column: ESP32-S3 module, H-bridge, current sensor, the MIN-FLOW guard runs here
BX, BZ = SX + 0.42, FLOOR + 1.2
box("Board_Enclosure_Base", C_ECLSS, mat_rack, BX, RACK_Y + 0.08, BZ, 0.22, 0.04, 0.16, 0.006)
box("Board_PCB", C_ECLSS, mat_pcb, BX, RACK_Y + 0.055, BZ, 0.18, 0.004, 0.12, 0.002)
box("Board_ESP32_Can", C_ECLSS, mat_tin, BX - 0.04, RACK_Y + 0.05, BZ + 0.02, 0.05, 0.006, 0.04, 0.001)
box("Board_HBridge", C_ECLSS, mat_dark, BX + 0.05, RACK_Y + 0.05, BZ - 0.025, 0.035, 0.008, 0.03, 0.002)
box("Board_Current_Sensor", C_ECLSS, mat_dark, BX + 0.05, RACK_Y + 0.05, BZ + 0.03, 0.02, 0.006, 0.015, 0.001)
box("Board_LED", C_ECLSS, mat_led_teal, BX - 0.07, RACK_Y + 0.051, BZ - 0.045, 0.006, 0.003, 0.004, 0)
box("Board_Lid", C_ECLSS, mat_glass, BX, RACK_Y + 0.035, BZ, 0.22, 0.01, 0.16, 0.006)
text("Board_Label", C_ECLSS, "MIN-FLOW GUARD", (BX, RACK_Y + 0.028, BZ - 0.1), 0.014, (math.pi / 2, 0, 0), mat_dark)
for q, (a, b) in enumerate((((BX - 0.11, RACK_Y + 0.07, BZ - 0.03), (SX + 0.12, RACK_Y + 0.25, IMP_Z - 0.25)),
                            ((BX - 0.11, RACK_Y + 0.07, BZ - 0.05), (SX + 0.12, RACK_Y + 0.26, IMP_Z - 0.3)))):
    cyl(f"Board_Cable_{q}", C_ECLSS, mat_cable, a, b, 0.004, 8)

# the crew cut-off: by the hatch, on the -y wall: a switch under a hinged clear guard
CX, CZ = 4.35, FLOOR + 1.3; cy = -(wall_y(CZ) - 0.02)
box("Cutoff_Panel", C_ECLSS, mat_rack, CX, cy + 0.01, CZ, 0.22, 0.02, 0.3, 0.006)
box("Cutoff_Switch_Base", C_ECLSS, mat_dark, CX, cy + 0.03, CZ, 0.06, 0.02, 0.09, 0.004)
cyl("Cutoff_Switch_Lever", C_ECLSS, mat_steel, (CX, cy + 0.04, CZ), (CX, cy + 0.11, CZ + 0.03), 0.008, 12)
box("Cutoff_Guard", C_ECLSS, mat_glass, CX, cy + 0.075, CZ, 0.1, 0.09, 0.14, 0.012)
text("Cutoff_Label", C_ECLSS, "SCRUBBER CUT-OFF\nCREW", (CX, cy + 0.022, CZ + 0.12), 0.016, (math.pi / 2, 0, math.pi), mat_dark)
print("zones built")
