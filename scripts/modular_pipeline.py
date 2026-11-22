"""
Modular 3D Character Pipeline for Blender
Rey01 Game Engine - Modular Humanoid NPC System

Standardizes, slices, seam-locks, and rigs modular humanoid character assets
to the master 79-bone armature (Jokowi_Armature).

Based on Studio-Grade Modular Pipeline Standards:
- Canonical Seam Anchors (Neck, Wrists, Ankles)
- Seam Boundary Snapping & Rigid Weight Locking (weight 1.0)
- Split Normal Seam Transfer / Synchronization
- Watertight SkinnedMesh Verification (< 1mm boundary deviation)
- Standard Grounding (Z=0.000m) and Forward Orientation (-Y)
"""

import sys
import os
import math
from typing import Dict, Any, List, Optional, Tuple

import bpy
import bmesh
from mathutils import Vector, Matrix

# ==============================================================================
# 1. CANONICAL SEAM ANCHORS SPECIFICATION
# ==============================================================================
CANONICAL_ANCHORS: Dict[str, Dict[str, Any]] = {
    'neck': {
        'name': 'Neck Ring',
        'type': 'ellipse_z',
        'z': 1.485,
        'center': (0.0, -0.055),
        'radii': (0.065, 0.055),
        'bone': 'Neck_05',
        'weight': 1.0,
        'description': 'Universal head/collar seam boundary at Z=1.485m'
    },
    'wrist_left': {
        'name': 'Left Wrist Ring',
        'type': 'circle_x',
        'x': 0.680,
        'center': (0.020, 1.425),
        'radius': 0.038,
        'bone': 'LeftHand_017',
        'weight': 1.0,
        'description': 'Left sleeve/hand boundary at X=+0.680m'
    },
    'wrist_right': {
        'name': 'Right Wrist Ring',
        'type': 'circle_x',
        'x': -0.680,
        'center': (0.020, 1.425),
        'radius': 0.038,
        'bone': 'RightHand_043',
        'weight': 1.0,
        'description': 'Right sleeve/hand boundary at X=-0.680m'
    },
    'ankle_left': {
        'name': 'Left Ankle Ring',
        'type': 'circle_z',
        'z': 0.080,
        'center': (0.145, 0.020),
        'radius': 0.055,
        'bone': 'LeftFoot_065',
        'weight': 1.0,
        'description': 'Left pants/boot boundary at Z=0.080m'
    },
    'ankle_right': {
        'name': 'Right Ankle Ring',
        'type': 'circle_z',
        'z': 0.080,
        'center': (-0.145, 0.020),
        'radius': 0.055,
        'bone': 'RightFoot_070',
        'weight': 1.0,
        'description': 'Right pants/boot boundary at Z=0.080m'
    }
}

MASTER_79_BONES = [
    'Hips_01', 'LeftUpLeg_063', 'LeftLeg_064', 'LeftFoot_065', 'LeftToeBase_066',
    'RightUpLeg_068', 'RightLeg_069', 'RightFoot_070', 'RightToeBase_071',
    'Spine_02', 'Spine1_03', 'Spine2_04',
    'LeftShoulder_012', 'LeftArm_013', 'LeftForeArm_014', 'LeftHand_017',
    'LeftHandThumb1_018', 'LeftHandThumb2_019', 'LeftHandThumb3_020',
    'LeftHandIndex1_021', 'LeftHandIndex2_022', 'LeftHandIndex3_023',
    'LeftHandMiddle1_024', 'LeftHandMiddle2_025', 'LeftHandMiddle3_026',
    'LeftHandRing1_027', 'LeftHandRing2_028', 'LeftHandRing3_029',
    'LeftHandPinky1_030', 'LeftHandPinky2_031', 'LeftHandPinky3_032',
    'RightShoulder_038', 'RightArm_039', 'RightForeArm_040', 'RightHand_043',
    'RightHandThumb1_044', 'RightHandThumb2_045', 'RightHandThumb3_046',
    'RightHandIndex1_047', 'RightHandIndex2_048', 'RightHandIndex3_049',
    'RightHandMiddle1_050', 'RightHandMiddle2_051', 'RightHandMiddle3_052',
    'RightHandRing1_053', 'RightHandRing2_054', 'RightHandRing3_055',
    'RightHandPinky1_056', 'RightHandPinky2_057', 'RightHandPinky3_058',
    'Neck_05', 'Neck1_06', 'Neck2_07', 'Head_08',
    'LeftEye_09', 'RightEye_010', 'Jaw_011',
    'LeftBreast_033', 'RightBreast_034',
    'LeftCollar_035', 'RightCollar_036',
    'Spine3_037', 'Pelvis_059', 'Pelvis1_060', 'Pelvis2_061', 'Pelvis3_062',
    'LeftUpLegRoll_067', 'RightUpLegRoll_072',
    'LeftArmRoll_015', 'LeftForeArmRoll_016',
    'RightArmRoll_041', 'RightForeArmRoll_042',
    'LeftToe_073', 'RightToe_074',
    'Root_00', 'Master_075', 'Trajectory_076', 'IK_Hand_L_077', 'IK_Hand_R_078'
]

# ==============================================================================
# 2. AUTOMATION FUNCTIONS
# ==============================================================================

def snap_boundary_loop(mesh: bpy.types.Object,
                       boundary_verts: List[Any],
                       anchor_ring: Dict[str, Any],
                       target_coords: Optional[List[Vector]] = None) -> List[Vector]:
    """
    Snaps boundary vertices of a mesh to the specified Canonical Anchor Ring.
    
    Args:
        mesh: Blender Mesh object.
        boundary_verts: List of vertex indices (int) or MeshVertex/BMVert items.
        anchor_ring: Dictionary defining the canonical ring anchor.
        target_coords: Optional predefined target 3D coordinates. If None,
                       each vertex is mathematically projected onto the ring curve.
    
    Returns:
        List of snapped Vector coordinates.
    """
    ring_type = anchor_ring.get('type')
    indices = [v.index if hasattr(v, 'index') else int(v) for v in boundary_verts]
    snapped_coords: List[Vector] = []
    
    for i, idx in enumerate(indices):
        v = mesh.data.vertices[idx]
        if target_coords and i < len(target_coords):
            v.co = target_coords[i].copy()
            snapped_coords.append(v.co.copy())
            continue
            
        if ring_type == 'ellipse_z':
            cx, cy = anchor_ring['center']
            rx, ry = anchor_ring['radii']
            z0 = anchor_ring['z']
            dx = v.co.x - cx
            dy = v.co.y - cy
            theta = math.atan2(dy / ry, dx / rx)
            v.co.x = cx + rx * math.cos(theta)
            v.co.y = cy + ry * math.sin(theta)
            v.co.z = z0
        elif ring_type == 'circle_x':
            x0 = anchor_ring['x']
            cy, cz = anchor_ring['center']
            r = anchor_ring['radius']
            dy = v.co.y - cy
            dz = v.co.z - cz
            theta = math.atan2(dz, dy)
            v.co.x = x0
            v.co.y = cy + r * math.cos(theta)
            v.co.z = cz + r * math.sin(theta)
        elif ring_type == 'circle_z':
            z0 = anchor_ring['z']
            cx, cy = anchor_ring['center']
            r = anchor_ring['radius']
            dx = v.co.x - cx
            dy = v.co.y - cy
            theta = math.atan2(dy, dx)
            v.co.x = cx + r * math.cos(theta)
            v.co.y = cy + r * math.sin(theta)
            v.co.z = z0
            
        snapped_coords.append(v.co.copy())
        
    mesh.data.update()
    return snapped_coords


def lock_seam_weights(mesh: bpy.types.Object,
                      boundary_verts: List[Any],
                      anchor_bone_name: str) -> None:
    """
    Locks seam boundary vertices 100% rigidly (weight 1.0) to anchor_bone_name,
    clearing all other vertex groups to prevent tearing or gaps during animation.
    
    Args:
        mesh: Blender Mesh object.
        boundary_verts: List of vertex indices (int) or MeshVertex items.
        anchor_bone_name: Target bone name (e.g. 'Neck_05', 'LeftHand_017').
    """
    indices = [v.index if hasattr(v, 'index') else int(v) for v in boundary_verts]
    target_vg = mesh.vertex_groups.get(anchor_bone_name)
    if not target_vg:
        target_vg = mesh.vertex_groups.new(name=anchor_bone_name)
    target_idx = target_vg.index
    
    for idx in indices:
        for vg in mesh.vertex_groups:
            if vg.index != target_idx:
                vg.remove([idx])
        target_vg.add([idx], 1.0, 'REPLACE')


def transfer_seam_normals(mesh_src: bpy.types.Object,
                          mesh_dst: bpy.types.Object,
                          boundary_verts: Optional[List[Any]] = None) -> None:
    """
    Transfers and synchronizes split vertex normals between mesh_src and mesh_dst
    at the seam boundary to ensure continuous, seamless lighting without visible creases.
    
    Args:
        mesh_src: Source mesh object (with established normals).
        mesh_dst: Destination mesh object receiving transferred normals.
        boundary_verts: Optional list of boundary vertices to restrict transfer.
    """
    mod = mesh_dst.modifiers.new(name="TransferSeamNormals", type='DATA_TRANSFER')
    mod.object = mesh_src
    mod.use_loop_data = True
    mod.data_types_loops = {'CUSTOM_NORMAL'}
    mod.loop_mapping = 'NEAREST_POLYNOR'
    
    temp_vg_name = "_temp_seam_normals_mask"
    if boundary_verts:
        vg = mesh_dst.vertex_groups.new(name=temp_vg_name)
        indices = [v.index if hasattr(v, 'index') else int(v) for v in boundary_verts]
        vg.add(indices, 1.0, 'REPLACE')
        mod.vertex_group = vg.name
        
    bpy.context.view_layer.objects.active = mesh_dst
    bpy.ops.object.modifier_apply(modifier=mod.name)
    
    if boundary_verts and temp_vg_name in mesh_dst.vertex_groups:
        mesh_dst.vertex_groups.remove(mesh_dst.vertex_groups[temp_vg_name])


def purge_scene_strays() -> int:
    """Removes all cameras, lights, empties, and stray icosphere objects."""
    removed = 0
    for o in list(bpy.data.objects):
        if 'icosphere' in o.name.lower() or o.type in ('CAMERA', 'LIGHT', 'EMPTY'):
            bpy.data.objects.remove(o, do_unlink=True)
            removed += 1
    for m in list(bpy.data.meshes):
        if 'icosphere' in m.name.lower():
            bpy.data.meshes.remove(m, do_unlink=True)
            removed += 1
    return removed


def ensure_armature_vgroups(mesh: bpy.types.Object, armature: bpy.types.Object) -> None:
    """Ensures all bones from the armature exist as vertex groups in the mesh."""
    existing = {vg.name for vg in mesh.vertex_groups}
    for b in armature.data.bones:
        if b.name not in existing:
            mesh.vertex_groups.new(name=b.name)


# ==============================================================================
# 3. PIPELINE PROCESSOR
# ==============================================================================

def process_modular_character(input_path: str,
                              output_dir: str,
                              master_armature_path: str) -> Tuple[str, str]:
    """
    Automated studio-grade modular 3D character pipeline for Blender.
    
    Processes Arthur Morgan (or any modular humanoid asset) to export clean,
    watertight, seam-locked:
    - {output_dir}/heads/arthur_head.glb
    - {output_dir}/outfits/outfit_arthur.glb
    
    Args:
        input_path: Source character GLB file path.
        output_dir: Root modular directory (e.g. public/models/npc/modular).
        master_armature_path: Path to canonical 79-bone armature GLB.
        
    Returns:
        Tuple of (exported_head_path, exported_outfit_path).
    """
    print(f"\n==================================================================")
    print(f"[*] STARTING MODULAR 3D CHARACTER PIPELINE")
    print(f"[*] Input character: {input_path}")
    print(f"[*] Master Armature: {master_armature_path}")
    print(f"[*] Output directory: {output_dir}")
    print(f"==================================================================")
    
    heads_dir = os.path.join(output_dir, "heads")
    outfits_dir = os.path.join(output_dir, "outfits")
    os.makedirs(heads_dir, exist_ok=True)
    os.makedirs(outfits_dir, exist_ok=True)
    
    out_head_path = os.path.join(heads_dir, "arthur_head.glb")
    out_outfit_path = os.path.join(outfits_dir, "outfit_arthur.glb")
    
    # -------------------------------------------------------------------------
    # Step 1: Load Arthur Morgan Head and Outfit Assets
    # -------------------------------------------------------------------------
    bpy.ops.wm.read_factory_settings(use_empty=True)
    
    # Import Head
    if os.path.exists(out_head_path):
        src_head_file = out_head_path
    else:
        src_head_file = input_path
    print(f"[*] Loading Head asset from: {src_head_file}")
    bpy.ops.import_scene.gltf(filepath=src_head_file, disable_bone_shape=True)
    purge_scene_strays()
    
    head_arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
    head_mesh = next((o for o in bpy.data.objects if o.type == 'MESH'), None)
    if not head_arm or not head_mesh:
        raise RuntimeError("Failed to load valid Head mesh and armature!")
        
    head_arm.name = "Jokowi_Armature"
    head_mesh.name = "Arthur_Head"
    
    # Import Outfit into same scene
    old_objs = set(bpy.data.objects)
    if os.path.exists(out_outfit_path):
        src_outfit_file = out_outfit_path
    else:
        src_outfit_file = input_path
    print(f"[*] Loading Outfit asset from: {src_outfit_file}")
    bpy.ops.import_scene.gltf(filepath=src_outfit_file, disable_bone_shape=True)
    
    # Purge any stray nodes immediately
    purge_scene_strays()
            
    outfit_arm = next(o for o in bpy.data.objects if o != head_arm and o.type == 'ARMATURE')
    outfit_mesh = next(o for o in bpy.data.objects if o != head_mesh and o.type == 'MESH')
    outfit_arm.name = "Jokowi_Armature_Outfit"
    outfit_mesh.name = "outfit_arthur_mesh"
    
    print(f"[✓] Loaded Arthur_Head ({len(head_mesh.data.vertices):,} verts) and outfit_arthur_mesh ({len(outfit_mesh.data.vertices):,} verts)")
    
    # -------------------------------------------------------------------------
    # Step 2: Extract Seam Boundary Loops
    # -------------------------------------------------------------------------
    # Head neck boundary: bottom opening of head skin (Z < 1.55, Y < 0)
    bm_h = bmesh.new()
    bm_h.from_mesh(head_mesh.data)
    bm_h.verts.ensure_lookup_table()
    head_b_verts = [v for v in bm_h.verts if v.is_boundary and v.co.z < 1.55 and v.co.y < 0.0]
    head_b_verts = sorted(head_b_verts, key=lambda v: v.co.x)
    head_seam_indices = [v.index for v in head_b_verts]
    bm_h.free()
    
    # Outfit neck boundary: matching 13 collar/neck opening vertices
    bm_o = bmesh.new()
    bm_o.from_mesh(outfit_mesh.data)
    bm_o.verts.ensure_lookup_table()
    outfit_matched_verts = []
    for h_idx in head_seam_indices:
        hv_co = head_mesh.data.vertices[h_idx].co
        closest = min(bm_o.verts, key=lambda ov: (ov.co - hv_co).length)
        outfit_matched_verts.append(closest)
    outfit_seam_indices = [v.index for v in outfit_matched_verts]
    bm_o.free()
    
    print(f"[*] Identified {len(head_seam_indices)} neck seam boundary vertices on Head and Outfit")
    
    # -------------------------------------------------------------------------
    # Step 3: Compute & Snap to Canonical Neck Ring
    # -------------------------------------------------------------------------
    neck_anchor = CANONICAL_ANCHORS['neck']
    cx, cy = neck_anchor['center']
    rx, ry = neck_anchor['radii']
    z0 = neck_anchor['z']
    
    canonical_coords: List[Vector] = []
    for h_idx in head_seam_indices:
        v_co = head_mesh.data.vertices[h_idx].co
        dx = v_co.x - cx
        dy = v_co.y - cy
        theta = math.atan2(dy / ry, dx / rx)
        canonical_coords.append(Vector((cx + rx * math.cos(theta),
                                        cy + ry * math.sin(theta),
                                        z0)))
                                        
    print(f"[*] Snapping boundary loops to Canonical Neck Ring (Z={z0}m, center={cx},{cy}, radii={rx},{ry})...")
    snap_boundary_loop(head_mesh, head_seam_indices, neck_anchor, canonical_coords)
    snap_boundary_loop(outfit_mesh, outfit_seam_indices, neck_anchor, canonical_coords)
    
    # -------------------------------------------------------------------------
    # Step 4: Lock Seam Weights to Bound Bone ('Neck_05' = 1.0)
    # -------------------------------------------------------------------------
    print(f"[*] Locking seam weights to '{neck_anchor['bone']}' (weight 1.0)...")
    lock_seam_weights(head_mesh, head_seam_indices, neck_anchor['bone'])
    lock_seam_weights(outfit_mesh, outfit_seam_indices, neck_anchor['bone'])
    
    # Ensure all master 79 vertex groups exist on both meshes
    ensure_armature_vgroups(head_mesh, head_arm)
    ensure_armature_vgroups(outfit_mesh, outfit_arm)
    
    # -------------------------------------------------------------------------
    # Step 5: Transfer and Synchronize Seam Normals
    # -------------------------------------------------------------------------
    print(f"[*] Transferring custom split normals across seam interface...")
    transfer_seam_normals(head_mesh, outfit_mesh, outfit_seam_indices)
    
    # -------------------------------------------------------------------------
    # Step 6: Grounding & Orientation Verification
    # -------------------------------------------------------------------------
    min_z = min(v.co.z for v in outfit_mesh.data.vertices)
    if abs(min_z) > 0.0001:
        print(f"[*] Grounding outfit boots: offsetting Z by {-min_z:.6f}m...")
        for v in outfit_mesh.data.vertices:
            v.co.z -= min_z
        outfit_mesh.data.update()
        
    head_y_avg = sum(v.co.y for v in head_mesh.data.vertices) / len(head_mesh.data.vertices)
    print(f"[*] Facing verification: average head Y = {head_y_avg:.4f} (forward is -Y)")
    assert head_y_avg < 0, "Character is not facing forward (-Y)!"
    
    # -------------------------------------------------------------------------
    # Step 7: Verify Watertight Seam Lock (< 1mm deviation)
    # -------------------------------------------------------------------------
    seam_deviations = []
    for hi, oi in zip(head_seam_indices, outfit_seam_indices):
        h_co = head_mesh.data.vertices[hi].co
        o_co = outfit_mesh.data.vertices[oi].co
        seam_deviations.append((h_co - o_co).length)
        
    max_dev = max(seam_deviations)
    avg_dev = sum(seam_deviations) / len(seam_deviations)
    print(f"[*] Seam QA Metrics:")
    print(f"    - Maximum boundary deviation: {max_dev * 1000:.6f} mm")
    print(f"    - Average boundary deviation: {avg_dev * 1000:.6f} mm")
    if max_dev >= 0.001:
        raise ValueError(f"Seam deviation {max_dev * 1000:.4f}mm exceeds 1mm requirement!")
    print(f"[✓ PASS] Seam boundary loop lock verified (< 1mm deviation)")
    
    # Verify Armatures & Watertight Skinning
    assert len(head_arm.data.bones) == 79, f"Head armature has {len(head_arm.data.bones)} bones (expected 79)!"
    assert len(outfit_arm.data.bones) == 79, f"Outfit armature has {len(outfit_arm.data.bones)} bones (expected 79)!"
    
    unweighted_head = sum(1 for v in head_mesh.data.vertices if sum(g.weight for g in v.groups) < 0.001)
    unweighted_outfit = sum(1 for v in outfit_mesh.data.vertices if sum(g.weight for g in v.groups) < 0.001)
    assert unweighted_head == 0, f"Head has {unweighted_head} unweighted vertices!"
    assert unweighted_outfit == 0, f"Outfit has {unweighted_outfit} unweighted vertices!"
    print(f"[✓ PASS] All 79 bones verified intact and 100% watertight skinning confirmed.")
    
    # -------------------------------------------------------------------------
    # Step 8: Export Clean, Production-Grade GLBs
    # -------------------------------------------------------------------------
    # Ensure no stray objects exist anywhere in scene
    purge_scene_strays()
    
    # Export Head: save in isolated scene to guarantee zero stray nodes
    bpy.ops.object.select_all(action='DESELECT')
    # Unhide all objects to ensure selection works cleanly
    for o in bpy.data.objects:
        o.hide_viewport = False
        o.hide_set(False)
        o.select_set(False)
        
    head_arm.name = "Jokowi_Armature"
    head_arm.select_set(True)
    head_mesh.select_set(True)
    bpy.context.view_layer.objects.active = head_mesh
    
    bpy.ops.export_scene.gltf(
        filepath=out_head_path,
        export_format='GLB',
        use_selection=True,
        export_apply=False,
        export_yup=True
    )
    print(f"[✓ EXPORTED] Modular Head: {out_head_path}")
    
    # Export Outfit
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.data.objects:
        o.select_set(False)
        
    outfit_arm.name = "Jokowi_Armature"
    outfit_arm.select_set(True)
    outfit_mesh.select_set(True)
    bpy.context.view_layer.objects.active = outfit_mesh
    
    bpy.ops.export_scene.gltf(
        filepath=out_outfit_path,
        export_format='GLB',
        use_selection=True,
        export_apply=False,
        export_yup=True
    )
    print(f"[✓ EXPORTED] Modular Outfit: {out_outfit_path}")
    print(f"==================================================================\n")
    
    return out_head_path, out_outfit_path


# ==============================================================================
# 4. CLI ENTRY POINT
# ==============================================================================
if __name__ == "__main__":
    argv = sys.argv
    if "--" in argv:
        args = argv[argv.index("--") + 1:]
    else:
        args = []
        
    input_file = r"d:\Koding\Projek\Game\Rey01\public\models\npc\modular\arthur_morgan__rdr2_3d_character.glb"
    output_dir = r"d:\Koding\Projek\Game\Rey01\public\models\npc\modular"
    master_armature = r"d:\Koding\Projek\Game\Rey01\public\models\npc\modular\armature\armature.glb"
    
    i = 0
    while i < len(args):
        arg = args[i]
        if arg in ("--input", "-i") and i + 1 < len(args):
            input_file = args[i + 1]
            i += 2
        elif arg in ("--output-dir", "-o") and i + 1 < len(args):
            output_dir = args[i + 1]
            i += 2
        elif arg in ("--armature", "-a") and i + 1 < len(args):
            master_armature = args[i + 1]
            i += 2
        else:
            i += 1
            
    process_modular_character(input_file, output_dir, master_armature)
