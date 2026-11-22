import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

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

export function initClouds(scene: THREE.Scene, options: CloudOptions = {}): CloudSystem {
  const { modelUrl = "/models/environment/cloud.glb", shadowTexSize = 128 } = options;
  const clouds: CloudEntity[] = [];
  const cloudMaterials: THREE.MeshStandardMaterial[] = [];
  const currentCloudColor = new THREE.Color(0xfff8ee);
  const currentCloudEmissive = new THREE.Color(0x221a14);

  const cloudShadowMat = new THREE.MeshBasicMaterial({
    map: getCloudShadowTex(shadowTexSize),
    transparent: true,
    depthWrite: false,
    opacity: 0.75,
  });

  const loader = new GLTFLoader();
  loader.load(modelUrl, (gltf) => {
    const baseCloud = gltf.scene;

    function spawnCloud(initX: number, initY: number, initZ: number, scale = 1.0): CloudEntity {
      const cloudModel = baseCloud.clone(true);
      cloudModel.scale.setScalar(scale);

      cloudModel.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const origMat = mesh.material;
          const newMat = Array.isArray(origMat) ? origMat[0]!.clone() : origMat.clone();
          if (newMat instanceof THREE.MeshStandardMaterial) {
            newMat.emissive.setHex(0x221a14);
            newMat.roughness = 0.95;
            newMat.metalness = 0.05;
            cloudMaterials.push(newMat);
          }
          mesh.material = newMat;
        }
      });
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

  function update(dt: number, weatherState?: CloudWeatherState): void {
    const time = weatherState?.timeOfDay ?? "day";
    const condition = weatherState?.condition ?? "clear";

    let targetColorHex = 0xfff8ee;
    let targetEmissiveHex = 0x221a14;
    let targetShadowOpacity = 0.75;

    if (condition === "rain") {
      if (time === "night") {
        targetColorHex = 0x0e131d;
        targetEmissiveHex = 0x010203;
        targetShadowOpacity = 0.05;
      } else if (time === "sunset") {
        targetColorHex = 0x3d282c;
        targetEmissiveHex = 0x080405;
        targetShadowOpacity = 0.15;
      } else {
        targetColorHex = 0x48505c;
        targetEmissiveHex = 0x06080a;
        targetShadowOpacity = 0.2;
      }
    } else {
      if (time === "night") {
        targetColorHex = 0x182234;
        targetEmissiveHex = 0x020407;
        targetShadowOpacity = 0.1;
      } else if (time === "sunset") {
        targetColorHex = 0xf59872;
        targetEmissiveHex = 0x441810;
        targetShadowOpacity = 0.45;
      } else {
        targetColorHex = 0xfff8ee;
        targetEmissiveHex = 0x221a14;
        targetShadowOpacity = 0.75;
      }
    }

    const lerpRate = 2.0 * dt;
    currentCloudColor.lerp(new THREE.Color(targetColorHex), lerpRate);
    currentCloudEmissive.lerp(new THREE.Color(targetEmissiveHex), lerpRate);
    cloudShadowMat.opacity += (targetShadowOpacity - cloudShadowMat.opacity) * lerpRate;

    for (const mat of cloudMaterials) {
      mat.color.copy(currentCloudColor);
      mat.emissive.copy(currentCloudEmissive);
    }

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
