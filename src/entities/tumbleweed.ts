import * as THREE from "three";
import { CollisionWorld } from "../core/collision.js";
import { loadGLTF, resolveAssetUrl } from "../environment/assets.js";

export interface TumbleweedOptions {
  modelUrl?: string;
  defaultDiameter?: number;
}

interface TumbleweedEntity {
  mesh: THREE.Object3D;
  x: number;
  y: number;
  vy: number;
  z: number;
  vx: number;
  vz: number;
  r: number;
  bounce: number;
}

export function initTumbleweeds(
  scene: THREE.Scene,
  options: TumbleweedOptions = {}
): { update: (dt: number, buildingBoxes: THREE.Box3[]) => void } {
  const { modelUrl = "tumbleweed", defaultDiameter = 0.8 } = options;
  const tumbleweeds: TumbleweedEntity[] = [];

  resolveAssetUrl(modelUrl).then(loadGLTF).then((gltf) => {
    const baseTW = gltf.scene;
    const twBbox = new THREE.Box3().setFromObject(baseTW);
    const twSize = twBbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(twSize.x, twSize.y, twSize.z) || 1.0;

    function spawnTW(x: number, z: number, vx: number, vz: number, r: number, bounce: number): TumbleweedEntity {
      const twModel = baseTW.clone();
      twModel.scale.setScalar((r * 2) / maxDim);
      scene.add(twModel);

      return {
        mesh: twModel,
        x,
        y: r,
        vy: 0,
        z,
        vx,
        vz,
        r,
        bounce,
      };
    }

    const baseRadius = defaultDiameter / 2;
    tumbleweeds.push(spawnTW(6, 22, 0.6, -5.0, baseRadius, 2.3));
    tumbleweeds.push(spawnTW(11, 28, -0.8, -5.6, baseRadius * 0.8, 2.0));
  });

  function update(dt: number, buildingBoxes?: THREE.Box3[]): void {
    const boxes = buildingBoxes && buildingBoxes.length > 0
      ? buildingBoxes
      : CollisionWorld.getInstance().getBoxes();

    tumbleweeds.forEach((tw) => {
      let nextX = tw.x + tw.vx * dt;
      let nextZ = tw.z + tw.vz * dt;

      tw.vy -= 9.8 * dt;
      tw.y += tw.vy * dt;

      if (tw.y <= tw.r) {
        tw.y = tw.r;
        tw.vy = tw.bounce;
      }

      for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i]!;
        if (tw.y > box.max.y || tw.y + tw.r < box.min.y) continue;

        if (
          nextX + tw.r > box.min.x &&
          nextX - tw.r < box.max.x &&
          nextZ + tw.r > box.min.z &&
          nextZ - tw.r < box.max.z
        ) {
          const overlapX = Math.min(Math.abs(nextX - box.min.x), Math.abs(nextX - box.max.x));
          const overlapZ = Math.min(Math.abs(nextZ - box.min.z), Math.abs(nextZ - box.max.z));

          if (overlapX < overlapZ) {
            tw.vx = -tw.vx * 0.75;
            nextX = tw.x + tw.vx * dt;
          } else {
            tw.vz = -tw.vz * 0.75;
            nextZ = tw.z + tw.vz * dt;
          }
          tw.vy = Math.max(tw.vy, 1.8);
          break;
        }
      }

      tw.x = nextX;
      tw.z = nextZ;

      if (tw.z < -52 || Math.abs(tw.x) > 35 || tw.z > 35) {
        tw.x = 7 + (Math.random() - 0.5) * 6;
        tw.z = 24 + Math.random() * 6;
        tw.y = tw.r + 0.2;
        tw.vx = (Math.random() - 0.5) * 1.5;
        tw.vz = -4.5 - Math.random() * 2;
        tw.vy = 0;
      }

      tw.mesh.position.set(tw.x, tw.y, tw.z);
      tw.mesh.rotation.x -= (tw.vz * dt) / tw.r;
      tw.mesh.rotation.z -= (tw.vx * dt) / tw.r;
      tw.mesh.rotation.y += dt * 0.8;
    });
  }

  return { update };
}
