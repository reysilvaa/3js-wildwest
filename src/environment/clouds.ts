import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export interface CloudOptions {
  modelUrl?: string;
  shadowTexSize?: number;
}

interface CloudEntity {
  mesh: THREE.Object3D;
  shadow: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  scale: number;
}

function getCloudShadowTex(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const half = size / 2;
    const grad = ctx.createRadialGradient(half, half, size * 0.12, half, half, half * 0.95);
    grad.addColorStop(0, "rgba(25, 18, 12, 0.42)");
    grad.addColorStop(0.5, "rgba(25, 18, 12, 0.22)");
    grad.addColorStop(1, "rgba(25, 18, 12, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

export function initClouds(scene: THREE.Scene, options: CloudOptions = {}): { update: (dt: number) => void } {
  const { modelUrl = "/models/environment/cloud.glb", shadowTexSize = 128 } = options;
  const clouds: CloudEntity[] = [];

  const cloudShadowMat = new THREE.MeshBasicMaterial({
    map: getCloudShadowTex(shadowTexSize),
    transparent: true,
    depthWrite: false,
  });

  const loader = new GLTFLoader();
  loader.load(modelUrl, (gltf) => {
    const baseCloud = gltf.scene;

    function spawnCloud(initX: number, initY: number, initZ: number, scale = 1.0): CloudEntity {
      const cloudModel = baseCloud.clone();
      cloudModel.scale.setScalar(scale);
      scene.add(cloudModel);

      const shadowGeo = new THREE.PlaneGeometry(28 * scale, 22 * scale);
      const shadow = new THREE.Mesh(shadowGeo, cloudShadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.04;
      scene.add(shadow);

      return {
        mesh: cloudModel,
        shadow,
        x: initX,
        y: initY,
        z: initZ,
        vx: 0.6 + Math.random() * 0.3,
        vz: -1.8 - Math.random() * 0.4,
        scale,
      };
    }

    clouds.push(spawnCloud(-15, 28, 30, 0.9));
    clouds.push(spawnCloud(5, 32, 10, 1.1));
    clouds.push(spawnCloud(-5, 29, -15, 0.8));
    clouds.push(spawnCloud(18, 34, 40, 1.0));
  });

  function update(dt: number): void {
    clouds.forEach((c) => {
      c.x += c.vx * dt;
      c.z += c.vz * dt;

      if (c.z < -65 || c.x > 55) {
        c.z = 45 + Math.random() * 15;
        c.x = -35 + Math.random() * 20;
      }

      c.mesh.position.set(c.x, c.y, c.z);
      c.mesh.rotation.y += dt * 0.015;

      const shadowX = c.x - (30 / 45) * c.y;
      const shadowZ = c.z - (-20 / 45) * c.y;
      c.shadow.position.set(shadowX, 0.04, shadowZ);
    });
  }

  return { update };
}
