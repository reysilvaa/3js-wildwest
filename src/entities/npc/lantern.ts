import * as THREE from "three";
import { getModelsManifest, loadGLTF } from "@/environment/assets.js";
import { IS_MOBILE } from "@/ui/mobile.js";
import type { NPCController } from "@/entities/npc/controller.js";
import type { NPCModel } from "@/entities/npc/modular.js";

let sharedGlowMaterial: THREE.SpriteMaterial | null = null;
const lanternLightPool: THREE.PointLight[] = [];
const lanternWorldPos = new THREE.Vector3();

const _armPos = new THREE.Vector3();
const _childPos = new THREE.Vector3();
const _curDir = new THREE.Vector3();
const _targetDir = new THREE.Vector3();
const _deltaQ = new THREE.Quaternion();
const _parentQ = new THREE.Quaternion();
const _boneQ = new THREE.Quaternion();

function getLanternGlowMaterial(): THREE.SpriteMaterial {
  if (sharedGlowMaterial) return sharedGlowMaterial;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255, 185, 95, 0.85)");
  g.addColorStop(0.25, "rgba(255, 120, 30, 0.32)");
  g.addColorStop(0.6, "rgba(220, 75, 10, 0.06)");
  g.addColorStop(1, "rgba(200, 50, 0, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  sharedGlowMaterial = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c),
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    fog: false,
    opacity: 0.42,
  });
  return sharedGlowMaterial;
}

/**
 * Attaches an optimized handheld lantern + subtle flame ember to ~32% of NPCs.
 */
export async function attachNPCLantern(root: THREE.Group): Promise<THREE.Group | undefined> {
  if (Math.random() > 0.32) return undefined;
  const manifest = await getModelsManifest();
  const lanternUrl = manifest.npc.lanterns[0];
  const rightHand = root.getObjectByName("RightHand_043");
  if (!lanternUrl || !rightHand) return undefined;

  try {
    const lanternGltf = await loadGLTF(lanternUrl);
    const lantern = lanternGltf.scene.clone(true);
    lantern.name = "NPCLantern";
    lantern.visible = false;
    lantern.scale.setScalar(0.68);
    lantern.position.set(0, 0.04, 0);
    lantern.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = false;
        c.receiveShadow = false;
      }
    });
    const halo = new THREE.Sprite(getLanternGlowMaterial());
    halo.position.set(0, -0.14, 0);
    halo.scale.set(0.28, 0.28, 1);
    lantern.add(halo);
    rightHand.add(lantern);
    return lantern;
  } catch (err) {
    console.warn("[NPCLantern] Failed to attach lantern:", err);
    return undefined;
  }
}

function aimBoneInWorld(
  root: THREE.Group,
  bone: THREE.Object3D,
  child: THREE.Object3D,
  x: number,
  y: number,
  z: number
): void {
  bone.parent?.updateWorldMatrix(true, false);
  bone.updateWorldMatrix(true, true);
  bone.getWorldPosition(_armPos);
  child.getWorldPosition(_childPos);
  _curDir.subVectors(_childPos, _armPos);
  if (_curDir.lengthSq() < 1e-6) return;
  _curDir.normalize();

  _targetDir.set(x, y, z).normalize().applyQuaternion(root.quaternion);
  _deltaQ.setFromUnitVectors(_curDir, _targetDir);
  bone.getWorldQuaternion(_boneQ);
  bone.parent?.getWorldQuaternion(_parentQ);
  _parentQ.invert();
  bone.quaternion.copy(_parentQ).multiply(_deltaQ).multiply(_boneQ);
}

/**
 * Applies the raised-lantern arm pose after animation update and keeps the lantern vertical by gravity.
 */
export function applyLanternArmPose(model: NPCModel): void {
  const lantern = model.lantern;
  if (!lantern || !lantern.visible) return;
  const root = model.root;
  const rightArm = root.getObjectByName("RightArm_039");
  const rightForeArm = root.getObjectByName("RightForeArm_040");
  const rightHand = root.getObjectByName("RightHand_043");
  if (!rightArm || !rightForeArm || !rightHand) return;

  aimBoneInWorld(root, rightArm, rightForeArm, -0.78, -0.35, 0.52);
  aimBoneInWorld(root, rightForeArm, rightHand, -0.08, 0.94, 0.33);

  rightHand.updateWorldMatrix(true, false);
  rightHand.getWorldQuaternion(_parentQ);
  _parentQ.invert();
  lantern.quaternion.copy(_parentQ).multiply(root.quaternion);
}

/**
 * Toggles NPC handheld lanterns at dusk/night and assigns pooled warm PointLights to nearest NPCs.
 */
export function updateNPCLanterns(
  scene: THREE.Scene,
  npcs: readonly NPCController[],
  camera: THREE.Camera,
  nightFactor: number
): void {
  const poolSize = IS_MOBILE ? 3 : 8;
  while (lanternLightPool.length < poolSize) {
    const light = new THREE.PointLight(0xff9238, 0, 10, 1.6);
    scene.add(light);
    lanternLightPool.push(light);
  }

  const showLanterns = nightFactor > 0.3;
  const candidates: Array<{ npc: NPCController; distSq: number }> = [];

  for (let i = 0; i < npcs.length; i++) {
    const npc = npcs[i]!;
    const active = showLanterns && !!npc.model?.lantern && npc.model.root.visible && npc.getState() !== "INDOORS";
    if (npc.model?.lantern) npc.model.lantern.visible = active;
    if (active) {
      candidates.push({ npc, distSq: npc.getPosition().distanceToSquared(camera.position) });
    }
  }

  candidates.sort((a, b) => a.distSq - b.distSq);
  const intensity = showLanterns ? 2.2 * nightFactor : 0;

  for (let i = 0; i < lanternLightPool.length; i++) {
    const light = lanternLightPool[i]!;
    const hit = candidates[i];
    if (hit && hit.distSq < 6400) {
      if (hit.npc.model?.lantern) {
        hit.npc.model.lantern.getWorldPosition(lanternWorldPos);
        light.position.set(lanternWorldPos.x, lanternWorldPos.y - 0.15, lanternWorldPos.z);
      } else {
        const p = hit.npc.getPosition();
        light.position.set(p.x, p.y + 1.0, p.z);
      }
      light.intensity = intensity;
    } else {
      light.intensity = 0;
    }
  }
}
