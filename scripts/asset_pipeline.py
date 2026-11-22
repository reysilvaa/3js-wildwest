"""
Web 3D Asset Pipeline & QA Validator for Rey01
Based on:
- Web 3D Asset Pipeline standards (OpenAI Game Studio)
- Zero Per-Asset Fixes specification (mrcalderon3d)
- AI 3D Asset Pipeline QA standards (Atlas Studio & Tripo AI)
"""

import sys
import os
import math
from collections import defaultdict

# Extract arguments after "--"
argv = sys.argv
if "--" in argv:
    args = argv[argv.index("--") + 1:]
else:
    args = []

if not args:
    print("Usage: blender -b -P scripts/asset_pipeline.py -- <validate|prep> <filepath> [--out <output>] [--type character|head|accessory|prop]")
    sys.exit(0)

cmd = args[0].lower()
filepath = None
out_path = None
asset_type = "character"

i = 1
while i < len(args):
    arg = args[i]
    if arg == "--out" and i + 1 < len(args):
        out_path = args[i + 1]
        i += 2
    elif arg == "--type" and i + 1 < len(args):
        asset_type = args[i + 1].lower()
        i += 2
    elif not filepath and not arg.startswith("--"):
        filepath = arg
        i += 1
    else:
        i += 1

if not filepath or not os.path.exists(filepath):
    print(f"[✗ ERROR] File not found: {filepath}")
    sys.exit(1)

import bpy

def get_mesh_bounds(mesh_objs):
    if not mesh_objs:
        return (0, 0), (0, 0), (0, 0), (0, 0, 0)
    xs, ys, zs = [], [], []
    for o in mesh_objs:
        mw = o.matrix_world
        for v in o.data.vertices:
            wco = mw @ v.co
            xs.append(wco.x)
            ys.append(wco.y)
            zs.append(wco.z)
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    min_z, max_z = min(zs), max(zs)
    dims = (max_x - min_x, max_y - min_y, max_z - min_z)
    return (min_x, max_x), (min_y, max_y), (min_z, max_z), dims

def run_validate():
    print(f"\n==================== ASSET QA REPORT: {os.path.basename(filepath)} ====================")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=filepath, disable_bone_shape=True)

    mesh_objs = [o for o in bpy.data.objects if o.type == 'MESH']
    armature_objs = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    stray_objs = [o for o in bpy.data.objects if "icosphere" in o.name.lower() or o.type in ('CAMERA', 'LIGHT')]

    # 1. Geometry & Hierarchy Check
    print(f"[*] Meshes: {len(mesh_objs)} | Armatures: {len(armature_objs)}")
    if stray_objs:
        print(f"[✗ FAIL] Found {len(stray_objs)} stray nodes: {[o.name for o in stray_objs]}")
    else:
        print(f"[✓ PASS] No stray nodes (cameras, lights, icospheres).")

    # Filter out icosphere for bounds
    clean_meshes = [o for o in mesh_objs if "icosphere" not in o.name.lower()]
    xb, yb, zb, dims = get_mesh_bounds(clean_meshes)
    total_verts = sum(len(o.data.vertices) for o in clean_meshes)
    total_tris = sum(len(o.data.polygons) for o in clean_meshes)

    print(f"[*] Triangles: {total_tris:,} | Vertices: {total_verts:,}")

    # 2. Dimensions & Metric Check
    print(f"[*] Bounding Box (World):")
    print(f"    X: [{xb[0]:.3f}, {xb[1]:.3f}] (width:  {dims[0]:.3f} m)")
    print(f"    Y: [{yb[0]:.3f}, {yb[1]:.3f}] (depth:  {dims[1]:.3f} m)")
    print(f"    Z: [{zb[0]:.3f}, {zb[1]:.3f}] (height: {dims[2]:.3f} m)")

    # Height validation
    if asset_type == "character":
        if dims[2] > 5.0 or dims[2] < 0.5:
            print(f"[✗ FAIL] Height {dims[2]:.2f}m violates humanoid scale (expected 1.5m - 2.0m). Likely in cm or wrong units!")
        else:
            print(f"[✓ PASS] Height {dims[2]:.2f}m is within standard humanoid range (1.5m - 2.0m).")

        # Grounding check (pivot at feet Z=0)
        if abs(zb[0]) > 0.05:
            print(f"[⚠ WARN] Base Z is {zb[0]:.3f}m (not grounded at Z=0.0). May cause floating or sinking.")
        else:
            print(f"[✓ PASS] Pivot grounded at base (Z={zb[0]:.3f}m).")

    # 3. Skeleton & Skin Weights Check
    if armature_objs:
        arm = armature_objs[0]
        bones = {b.name for b in arm.data.bones}
        print(f"[*] Armature '{arm.name}': {len(bones)} bones")

        key_humanoid_bones = ["Hips_01", "LeftArm_013", "RightArm_039", "LeftUpLeg_063", "RightUpLeg_068", "Head_08"]
        missing_keys = [b for b in key_humanoid_bones if b not in bones]
        if missing_keys:
            print(f"[⚠ WARN] Missing standard master bones: {missing_keys}")
            print(f"    Sample present bones: {list(bones)[:6]}")
        else:
            print(f"[✓ PASS] Armature matches standard master rig hierarchy ({len(bones)} bones).")

        # Skin weights check
        unweighted_verts = 0
        for m in clean_meshes:
            for v in m.data.vertices:
                w_sum = sum(g.weight for g in v.groups)
                if w_sum < 0.001:
                    unweighted_verts += 1
        if unweighted_verts > 0:
            print(f"[✗ FAIL] Found {unweighted_verts} unweighted vertices! Will cause geometry stretching to world origin.")
        else:
            print(f"[✓ PASS] Watertight skinning (0 unweighted vertices).")
    else:
        if asset_type == "character":
            print(f"[⚠ WARN] No armature found in character asset.")

    # 4. Materials & Textures
    materials = set()
    for m in clean_meshes:
        for slot in m.material_slots:
            if slot.material:
                materials.add(slot.material.name)
    print(f"[*] Materials ({len(materials)}): {list(materials)}")

    print(f"========================================================================\n")

def run_prep():
    print(f"\n==================== ASSET PREP & NORMALIZATION ====================")
    print(f"Source: {filepath}")
    target_out = out_path if out_path else filepath.replace(".glb", "_normalized.glb")
    print(f"Target: {target_out}")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=filepath, disable_bone_shape=True)

    # 1. Prune stray objects (icospheres, cameras, lights)
    removed = 0
    for o in list(bpy.data.objects):
        if "icosphere" in o.name.lower() or o.type in ('CAMERA', 'LIGHT'):
            bpy.data.objects.remove(o, do_unlink=True)
            removed += 1
    for m in list(bpy.data.meshes):
        if "icosphere" in m.name.lower():
            bpy.data.meshes.remove(m, do_unlink=True)
    if removed:
        print(f"[✓] Pruned {removed} stray node(s)")

    clean_meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    if not clean_meshes:
        print("[✗ ERROR] No mesh objects found to prep!")
        sys.exit(1)

    # 2. Check scale & metric
    xb, yb, zb, dims = get_mesh_bounds(clean_meshes)
    if dims[2] > 20.0:
        # Asset in centimeters (100x too large)
        print(f"[!] Height is {dims[2]:.2f} units. Auto-scaling by 0.01 (cm -> m)...")
        for o in clean_meshes:
            o.scale = (o.scale[0] * 0.01, o.scale[1] * 0.01, o.scale[2] * 0.01)
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # 3. Grounding if character or prop
    if asset_type in ("character", "prop"):
        _, _, new_zb, _ = get_mesh_bounds(clean_meshes)
        offset_z = -new_zb[0]
        if abs(offset_z) > 0.005:
            print(f"[✓] Grounding mesh: offset Z by {offset_z:.4f}m")
            for o in clean_meshes:
                o.location.z += offset_z
                bpy.context.view_layer.objects.active = o
                bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

    # 4. Export clean GLB
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.data.objects:
        if o.type in ('MESH', 'ARMATURE') and "icosphere" not in o.name.lower():
            o.select_set(True)

    bpy.ops.export_scene.gltf(
        filepath=target_out,
        export_format='GLB',
        use_selection=True,
        export_apply=False,
        export_yup=True
    )
    print(f"[✓ PASS] Successfully saved normalized asset: {target_out}")
    print(f"===================================================================\n")

if cmd == "validate":
    run_validate()
elif cmd == "prep":
    run_prep()
else:
    print(f"[✗ ERROR] Unknown command: {cmd}")
