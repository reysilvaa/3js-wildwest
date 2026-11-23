import * as THREE from "three";
import { loadGLTF, resolveAssetUrl } from "../assets.js";

export interface CloudOptions {
  modelUrl?: string;
  shadowTexSize?: number;
}

export interface CloudWeatherState {
  timeOfDay?: "day" | "sunset" | "night";
  condition?: "clear" | "rain";
}

export interface CloudSystem {
  update: (dt: number, weatherState?: CloudWeatherState) => void;
}

interface CloudEntity {
  mesh: THREE.Object3D;
  shadow: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  speed: number;
}

function createBlobShadowTexture(size = 64): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const center = size / 2;
    const grad = ctx.createRadialGradient(center, center, 0, center, center, center);
    grad.addColorStop(0, "rgba(0, 0, 0, 0.45)");
    grad.addColorStop(0.5, "rgba(0, 0, 0, 0.2)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function initClouds(scene: THREE.Scene, options: CloudOptions = {}): CloudSystem {
  const {
    modelUrl = "cloud",
    shadowTexSize = 64,
  } = options;

  const clouds: CloudEntity[] = [];
  const cloudCount = 12;
  const shadowTex = createBlobShadowTexture(shadowTexSize);

  const dayColor = new THREE.Color(0xf6ebd9);
  const sunsetColor = new THREE.Color(0xd27546);
  const nightColor = new THREE.Color(0x0e1424);
  const rainDayColor = new THREE.Color(0x404550);
  const rainNightColor = new THREE.Color(0x05070c);
  const targetColor = new THREE.Color(0xf6ebd9);

  let cloudMaterials: THREE.MeshStandardMaterial[] = [];

  const sharedShadowGeo = new THREE.PlaneGeometry(16, 16);
  sharedShadowGeo.rotateX(-Math.PI / 2);
  const sharedShadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });

  resolveAssetUrl(modelUrl).then(loadGLTF).then((gltf) => {
    const baseModel = gltf.scene;

    baseModel.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const oldMat = mesh.material as THREE.MeshStandardMaterial;

        const newMat = new THREE.MeshStandardMaterial({
          color: dayColor.clone(),
          roughness: 0.95,
          metalness: 0.0,
          flatShading: oldMat.flatShading,
          fog: true,
        });

        mesh.material = newMat;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        cloudMaterials.push(newMat);
      }
    });

    for (let i = 0; i < cloudCount; i++) {
      const cloudMesh = baseModel.clone();
      const s = 1.2 + Math.random() * 2.2;
      cloudMesh.scale.set(s, s * (0.8 + Math.random() * 0.4), s);

      const shadowMesh = new THREE.Mesh(sharedShadowGeo, sharedShadowMat);
      shadowMesh.scale.setScalar(s);
      shadowMesh.position.y = 0.05;

      const entity: CloudEntity = {
        mesh: cloudMesh,
        shadow: shadowMesh,
        x: (Math.random() - 0.5) * 450 + 10,
        y: 35 + Math.random() * 15,
        z: (Math.random() - 0.5) * 450 - 5,
        speed: 1.2 + Math.random() * 2.0,
      };

      cloudMesh.position.set(entity.x, entity.y, entity.z);
      shadowMesh.position.set(entity.x, 0.05, entity.z);

      scene.add(cloudMesh);
      scene.add(shadowMesh);
      clouds.push(entity);
    }
  });

  function update(dt: number, weatherState?: CloudWeatherState): void {
    if (weatherState) {
      const time = weatherState.timeOfDay ?? "day";
      const isRain = weatherState.condition === "rain";

      if (time === "day") {
        targetColor.copy(isRain ? rainDayColor : dayColor);
      } else if (time === "sunset") {
        targetColor.copy(isRain ? rainDayColor : sunsetColor);
      } else {
        targetColor.copy(isRain ? rainNightColor : nightColor);
      }
    }

    for (let m = 0; m < cloudMaterials.length; m++) {
      cloudMaterials[m]?.color.lerp(targetColor, 1.5 * dt);
    }

    const boundX = 260;
    const boundZ = 260;

    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      if (!c) continue;

      c.x += c.speed * dt;
      if (c.x > boundX + 10) {
        c.x = -boundX + 10;
        c.z = (Math.random() - 0.5) * (boundZ * 2) - 5;
        c.y = 35 + Math.random() * 15;
      }

      c.mesh.position.set(c.x, c.y, c.z);
      c.shadow.position.set(c.x, 0.05, c.z);
    }
  }

  return { update };
}
