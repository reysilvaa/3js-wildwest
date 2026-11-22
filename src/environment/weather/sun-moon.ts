import * as THREE from "three";
import { Lensflare, LensflareElement } from "three/addons/objects/Lensflare.js";

export type TimeOfDay = "day" | "sunset" | "night";
export type WeatherCondition = "clear" | "rain";

function createSunburstTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, "rgba(255, 255, 255, 1.0)");
    grad.addColorStop(0.12, "rgba(255, 245, 215, 0.95)");
    grad.addColorStop(0.32, "rgba(255, 195, 75, 0.45)");
    grad.addColorStop(0.68, "rgba(255, 120, 30, 0.08)");
    grad.addColorStop(1, "rgba(255, 100, 20, 0.0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = "rgba(255, 245, 220, 0.32)";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(128 - Math.cos(angle) * 124, 128 - Math.sin(angle) * 124);
      ctx.lineTo(128 + Math.cos(angle) * 124, 128 + Math.sin(angle) * 124);
      ctx.stroke();
    }
  }
  return new THREE.CanvasTexture(canvas);
}

function createHexGhostTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const r = 50;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const x = 64 + r * Math.cos(a);
      const y = 64 + r * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(255, 210, 130, 0.16)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 230, 170, 0.45)";
    ctx.lineWidth = 2.0;
    ctx.stroke();
  }
  return new THREE.CanvasTexture(canvas);
}

function createRingGhostTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.beginPath();
    ctx.arc(64, 64, 46, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 175, 75, 0.35)";
    ctx.lineWidth = 3.5;
    ctx.stroke();
  }
  return new THREE.CanvasTexture(canvas);
}

function createMoonGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(225, 238, 255, 0.9)");
    grad.addColorStop(0.25, "rgba(185, 215, 250, 0.5)");
    grad.addColorStop(0.7, "rgba(100, 150, 220, 0.12)");
    grad.addColorStop(1, "rgba(80, 120, 200, 0.0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(canvas);
}

export interface SunMoonSystem {
  update: (sunPos: THREE.Vector3, timeOfDay: TimeOfDay, condition: WeatherCondition) => void;
}

export function initSunMoon(
  scene: THREE.Scene,
  camera?: THREE.PerspectiveCamera,
  buildingBoxes?: THREE.Box3[]
): SunMoonSystem {
  const sunburstTex = createSunburstTexture();
  const hexGhostTex = createHexGhostTexture();
  const ringGhostTex = createRingGhostTexture();
  const moonGlowTex = createMoonGlowTexture();

  // Celestial Sun (Core + Corona + Optical Lensflare)
  const sunGroup = new THREE.Group();
  sunGroup.name = "CelestialSun";

  const sunCoreGeo = new THREE.SphereGeometry(14, 16, 16);
  const sunCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  const sunCore = new THREE.Mesh(sunCoreGeo, sunCoreMat);
  sunGroup.add(sunCore);

  const sunGlowMat = new THREE.SpriteMaterial({
    map: sunburstTex,
    color: 0xffda73,
    transparent: true,
    blending: THREE.AdditiveBlending,
    opacity: 0.9,
    fog: false,
    depthWrite: false,
  });
  const sunGlow = new THREE.Sprite(sunGlowMat);
  sunGlow.scale.set(85, 85, 1);
  sunGroup.add(sunGlow);

  const opticalFlare = new Lensflare();
  const flareEl0 = new LensflareElement(sunburstTex, 260, 0, new THREE.Color(0xfffae8));
  const flareEl1 = new LensflareElement(sunburstTex, 420, 0, new THREE.Color(0xffa834));
  const flareEl2 = new LensflareElement(hexGhostTex, 60, 0.28, new THREE.Color(0xffaa44));
  const flareEl3 = new LensflareElement(hexGhostTex, 45, 0.48, new THREE.Color(0xff7722));
  const flareEl4 = new LensflareElement(ringGhostTex, 125, 0.68, new THREE.Color(0xff9944));
  const flareEl5 = new LensflareElement(hexGhostTex, 90, 0.88, new THREE.Color(0xff5511));

  opticalFlare.addElement(flareEl0);
  opticalFlare.addElement(flareEl1);
  opticalFlare.addElement(flareEl2);
  opticalFlare.addElement(flareEl3);
  opticalFlare.addElement(flareEl4);
  opticalFlare.addElement(flareEl5);
  sunGroup.add(opticalFlare);
  scene.add(sunGroup);

  // Celestial Moon (Core + Halo Sprite)
  const moonGroup = new THREE.Group();
  moonGroup.name = "CelestialMoon";

  const moonCoreGeo = new THREE.SphereGeometry(10, 16, 16);
  const moonCoreMat = new THREE.MeshBasicMaterial({ color: 0xdce8f8, fog: false });
  const moonCore = new THREE.Mesh(moonCoreGeo, moonCoreMat);
  moonGroup.add(moonCore);

  const moonGlowMat = new THREE.SpriteMaterial({
    map: moonGlowTex,
    color: 0x7a9ec2,
    transparent: true,
    blending: THREE.AdditiveBlending,
    opacity: 0.5,
    fog: false,
    depthWrite: false,
  });
  const moonGlow = new THREE.Sprite(moonGlowMat);
  moonGlow.scale.set(48, 48, 1);
  moonGroup.add(moonGlow);
  scene.add(moonGroup);

  const occlusionRay = new THREE.Ray();
  const camForward = new THREE.Vector3();
  const celestialDist = 450;

  function update(sunPos: THREE.Vector3, timeOfDay: TimeOfDay, condition: WeatherCondition): void {
    const sunDir = sunPos.clone().normalize();
    const camPos = camera ? camera.position : new THREE.Vector3(10, 4.5, -20);
    sunGroup.position.copy(camPos).addScaledVector(sunDir, celestialDist);

    const moonDir = new THREE.Vector3(-sunDir.x, Math.max(0.22, -sunDir.y), -sunDir.z).normalize();
    moonGroup.position.copy(camPos).addScaledVector(moonDir, celestialDist);

    if (timeOfDay === "day") {
      sunGroup.visible = true;
      sunCore.visible = condition === "clear";
      sunCoreMat.color.setHex(0xffffff);
      sunGlowMat.color.setHex(0xffda73);
      sunGlowMat.opacity = condition === "clear" ? 0.9 : 0.12;
      moonGroup.visible = false;
    } else if (timeOfDay === "sunset") {
      sunGroup.visible = true;
      sunCore.visible = condition === "clear";
      sunCoreMat.color.setHex(0xff6020);
      sunGlowMat.color.setHex(0xff3b00);
      sunGlowMat.opacity = condition === "clear" ? 0.95 : 0.15;
      moonGroup.visible = true;
      moonGlowMat.opacity = 0.25;
    } else {
      sunGroup.visible = false;
      moonGroup.visible = condition === "clear";
      moonGlowMat.opacity = 0.5;
    }

    const isSunAboveHorizon = sunDir.y > 0.015;
    const isClearWeather = condition === "clear";
    const isDayOrSunset = timeOfDay === "day" || timeOfDay === "sunset";
    let flareActive = isSunAboveHorizon && isClearWeather && isDayOrSunset;

    if (flareActive && camera) {
      camera.getWorldDirection(camForward);
      const viewDot = camForward.dot(sunDir);

      if (viewDot > 0.12) {
        let occluded = false;
        if (buildingBoxes && buildingBoxes.length > 0) {
          occlusionRay.origin.copy(camera.position);
          occlusionRay.direction.copy(sunDir);
          for (let b = 0; b < buildingBoxes.length; b++) {
            const box = buildingBoxes[b];
            if (box && occlusionRay.intersectsBox(box)) {
              occluded = true;
              break;
            }
          }
        }

        if (occluded) {
          flareActive = false;
        } else {
          const intensity = Math.min(1.0, (viewDot - 0.12) / 0.72);
          const isSunset = timeOfDay === "sunset";
          const baseColor = isSunset ? new THREE.Color(0xff6020) : new THREE.Color(0xfffae8);
          flareEl0.color.copy(baseColor).multiplyScalar(intensity);
          flareEl1.color.setHex(isSunset ? 0xff4411 : 0xffaa33).multiplyScalar(intensity * 0.85);
          flareEl2.color.setHex(isSunset ? 0xff5511 : 0xffaa44).multiplyScalar(intensity * 0.7);
          flareEl3.color.setHex(isSunset ? 0xcc3300 : 0xff7722).multiplyScalar(intensity * 0.6);
          flareEl4.color.setHex(isSunset ? 0xaa2200 : 0xff9944).multiplyScalar(intensity * 0.5);
          flareEl5.color.setHex(isSunset ? 0x881100 : 0xff5511).multiplyScalar(intensity * 0.4);
        }
      } else {
        flareActive = false;
      }
    }

    opticalFlare.visible = flareActive;
  }

  return { update };
}
