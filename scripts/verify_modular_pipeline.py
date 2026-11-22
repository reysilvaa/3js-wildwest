"""
Comprehensive QA Verification Suite for Modular 3D Character Pipeline
Rey01 Game Engine - Modular Humanoid NPC System

Verifies:
1. Neck boundary loop of head and collar of outfit overlap/lock with < 1mm deviation.
2. All 79 bones are intact and watertight (0 unweighted vertices).
3. Facing is -Y (forward), boots grounded at Z=0.000m.
4. Clean hierarchy (no stray cameras, lights, empties, or icospheres).
"""

import os
import sys
import math
from typing import Dict, Any, List

import bpy
import bmesh
from mathutils import Vector

def run_verification(base_dir: str):
    print("\n" + "=" * 70)
    print("RUNNING MODULAR 3D CHARACTER PIPELINE QA VERIFICATION SUITE")
    print("=" * 70)
    
    head_path = os.path.join(base_dir, "heads", "arthur_head.glb")
    outfit_path = os.path.join(base_dir, "outfits", "outfit_arthur.glb")
    armature_path = os.path.join(base_dir, "armature", "armature.glb")
    
    assert os.path.exists(head_path), f"Head file missing: {head_path}"
    assert os.path.exists(outfit_path), f"Outfit file missing: {outfit_path}"
    assert os.path.exists(armature_path), f"Armature file missing: {armature_path}"
    
    # -------------------------------------------------------------------------
    # 1. Master Armature Reference
    # -------------------------------------------------------------------------
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=armature_path, disable_bone_shape=True)
    ref_arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    ref_bones = [b.name for b in ref_arm.data.bones]
    print(f"[*] Master Reference Armature: '{ref_arm.name}' with {len(ref_bones)} bones")
    assert len(ref_bones) == 79, f"Master armature has {len(ref_bones)} bones (expected 79)!"
    
    # -------------------------------------------------------------------------
    # 2. Inspect Head Asset
    # -------------------------------------------------------------------------
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=head_path, disable_bone_shape=True)
    
    head_strays = [o for o in bpy.data.objects if 'icosphere' in o.name.lower() or o.type in ('CAMERA', 'LIGHT', 'EMPTY')]
    assert len(head_strays) == 0, f"Head asset contains {len(head_strays)} stray nodes: {[o.name for o in head_strays]}"
    print("[✓ PASS] Head asset clean: 0 stray nodes (cameras, lights, icospheres, empties)")
    
    head_arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
    head_mesh = next((o for o in bpy.data.objects if o.type == 'MESH'), None)
    assert head_arm is not None, "Head asset missing armature!"
    assert head_mesh is not None, "Head asset missing mesh!"
    
    head_bones = [b.name for b in head_arm.data.bones]
    assert len(head_bones) == 79, f"Head armature has {len(head_bones)} bones (expected 79)!"
    assert head_bones == ref_bones, "Head bones do not match master armature bone order!"
    print(f"[✓ PASS] Head armature matches all 79 master bones intact")
    
    # Watertight head skinning
    unweighted_head = sum(1 for v in head_mesh.data.vertices if sum(g.weight for g in v.groups) < 0.001)
    assert unweighted_head == 0, f"Head has {unweighted_head} unweighted vertices!"
    print(f"[✓ PASS] Head mesh watertight skinning: {len(head_mesh.data.vertices):,} vertices, 0 unweighted")
    
    # Head facing check (nose/facial features face -Y)
    head_y_avg = sum(v.co.y for v in head_mesh.data.vertices) / len(head_mesh.data.vertices)
    print(f"[*] Head Y coordinate average: {head_y_avg:.4f} m")
    assert head_y_avg < -0.01, f"Head is not facing forward (-Y)! (avg Y = {head_y_avg})"
    print(f"[✓ PASS] Head orientation verified: facing -Y (forward)")
    
    # Extract Head seam boundary verts
    bm_h = bmesh.new()
    bm_h.from_mesh(head_mesh.data)
    bm_h.verts.ensure_lookup_table()
    head_seam = [v for v in bm_h.verts if v.is_boundary and v.co.z < 1.55 and v.co.y < 0.0]
    head_seam = sorted(head_seam, key=lambda v: v.co.x)
    head_seam_coords = [v.co.copy() for v in head_seam]
    head_seam_indices = [v.index for v in head_seam]
    bm_h.free()
    print(f"[*] Head neck seam boundary: {len(head_seam_coords)} vertices at Z={head_seam_coords[0].z:.4f}m")
    
    # Verify Head seam weight lock to Neck_05
    neck_vg = head_mesh.vertex_groups.get("Neck_05")
    assert neck_vg is not None, "Neck_05 vertex group missing in Head!"
    for h_idx in head_seam_indices:
        v = head_mesh.data.vertices[h_idx]
        neck_weight = 0.0
        for g in v.groups:
            if g.group == neck_vg.index:
                neck_weight = g.weight
        assert abs(neck_weight - 1.0) < 0.001, f"Head seam vert {h_idx} weight on Neck_05 is {neck_weight} (expected 1.0)!"
    print(f"[✓ PASS] Head seam boundary vertices 100% locked to Neck_05 (weight = 1.0)")
    
    # -------------------------------------------------------------------------
    # 3. Inspect Outfit Asset
    # -------------------------------------------------------------------------
    old_objs = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=outfit_path, disable_bone_shape=True)
    new_objs = [o for o in bpy.data.objects if o not in old_objs]
    
    outfit_strays = [o for o in new_objs if 'icosphere' in o.name.lower() or o.type in ('CAMERA', 'LIGHT', 'EMPTY')]
    assert len(outfit_strays) == 0, f"Outfit asset contains {len(outfit_strays)} stray nodes: {[o.name for o in outfit_strays]}"
    print("[✓ PASS] Outfit asset clean: 0 stray nodes (cameras, lights, icospheres, empties)")
    
    outfit_arm = next((o for o in new_objs if o.type == 'ARMATURE'), None)
    outfit_mesh = next((o for o in new_objs if o.type == 'MESH'), None)
    assert outfit_arm is not None, "Outfit asset missing armature!"
    assert outfit_mesh is not None, "Outfit asset missing mesh!"
    
    outfit_bones = [b.name for b in outfit_arm.data.bones]
    assert len(outfit_bones) == 79, f"Outfit armature has {len(outfit_bones)} bones (expected 79)!"
    assert outfit_bones == ref_bones, "Outfit bones do not match master armature bone order!"
    print(f"[✓ PASS] Outfit armature matches all 79 master bones intact")
    
    # Watertight outfit skinning
    unweighted_outfit = sum(1 for v in outfit_mesh.data.vertices if sum(g.weight for g in v.groups) < 0.001)
    assert unweighted_outfit == 0, f"Outfit has {unweighted_outfit} unweighted vertices!"
    print(f"[✓ PASS] Outfit mesh watertight skinning: {len(outfit_mesh.data.vertices):,} vertices, 0 unweighted")
    
    # Grounding check: boots grounded at Z=0.000m
    min_z = min(v.co.z for v in outfit_mesh.data.vertices)
    print(f"[*] Outfit boots base Z: {min_z:.6f} m")
    assert abs(min_z) < 0.002, f"Outfit boots not grounded at Z=0.000m! (base Z = {min_z})"
    print(f"[✓ PASS] Outfit boots grounded at Z=0.000m (actual base: {min_z:.6f}m)")
    
    # Outfit facing check: toes point forward in -Y
    boot_verts = [v.co for v in outfit_mesh.data.vertices if v.co.z < 0.15]
    toes_y = min(v.y for v in boot_verts)
    heels_y = max(v.y for v in boot_verts)
    print(f"[*] Outfit boots Y: toes={toes_y:.4f}m (front), heels={heels_y:.4f}m (back)")
    assert toes_y < -0.15, f"Outfit boots not pointing forward in -Y! (toes Y = {toes_y})"
    assert toes_y < heels_y, "Toes must be further forward (-Y) than heels!"
    print(f"[✓ PASS] Outfit orientation verified: facing -Y (forward)")
    
    # -------------------------------------------------------------------------
    # 4. Seam Lock Deviation Check (Head Seam vs Outfit Collar)
    # -------------------------------------------------------------------------
    bm_o = bmesh.new()
    bm_o.from_mesh(outfit_mesh.data)
    bm_o.verts.ensure_lookup_table()
    
    deviations = []
    outfit_matched_indices = []
    for hv_co in head_seam_coords:
        closest = min(bm_o.verts, key=lambda ov: (ov.co - hv_co).length)
        dist = (closest.co - hv_co).length
        deviations.append(dist)
        outfit_matched_indices.append(closest.index)
    bm_o.free()
    
    max_dev = max(deviations)
    avg_dev = sum(deviations) / len(deviations)
    print(f"\n[*] NECK SEAM LOCK METRICS:")
    print(f"    - Maximum Deviation: {max_dev * 1000:.6f} mm")
    print(f"    - Average Deviation: {avg_dev * 1000:.6f} mm")
    print(f"    - Threshold Limit:   1.000000 mm")
    
    assert max_dev < 0.001, f"Seam deviation {max_dev * 1000:.4f}mm exceeds 1mm limit!"
    print(f"[✓ PASS] Neck boundary loop of head and collar of outfit overlap with < 1mm deviation!")
    
    # Verify Outfit seam weight lock to Neck_05
    outfit_neck_vg = outfit_mesh.vertex_groups.get("Neck_05")
    assert outfit_neck_vg is not None, "Neck_05 vertex group missing in Outfit!"
    for o_idx in outfit_matched_indices:
        v = outfit_mesh.data.vertices[o_idx]
        neck_weight = 0.0
        for g in v.groups:
            if g.group == outfit_neck_vg.index:
                neck_weight = g.weight
        assert abs(neck_weight - 1.0) < 0.001, f"Outfit seam vert {o_idx} weight on Neck_05 is {neck_weight} (expected 1.0)!"
    print(f"[✓ PASS] Outfit seam boundary vertices 100% locked to Neck_05 (weight = 1.0)")
    
    print("\n" + "=" * 70)
    print("ALL QA VERIFICATION CHECKS PASSED: STUDIO-GRADE MODULAR PIPELINE")
    print("=" * 70 + "\n")
    return True

if __name__ == "__main__":
    base_dir = r"d:\Koding\Projek\Game\Rey01\public\models\npc\modular"
    if len(sys.argv) > 1 and sys.argv[-1] != "--":
        for a in sys.argv[1:]:
            if os.path.isdir(a):
                base_dir = a
    run_verification(base_dir)
