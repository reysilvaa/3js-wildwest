import * as THREE from "three";
import { Lensflare, LensflareElement } from "three/addons/objects/Lensflare.js";

export type TimeOfDay = "day" | "sunset" | "night";
export type WeatherCondition = "clear" | "rain";

export interface WeatherOptions {
  initialTime?: TimeOfDay;
  initialCondition?: WeatherCondition;
  autoCycle?: boolean;
  camera?: THREE.PerspectiveCamera;
  buildingBoxes?: THREE.Box3[];
  onTimeChange?: (time: TimeOfDay) => void;
  onConditionChange?: (condition: WeatherCondition) => void;
  onThunder?: () => void;
  onIndoorLightChange?: (intensity: number) => void;
}

function createSunburstTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    // 1. Intense solar flare & bloom
    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, "rgba(255, 255, 255, 1.0)");
    grad.addColorStop(0.12, "rgba(255, 245, 215, 0.95)");
    grad.addColorStop(0.32, "rgba(255, 195, 75, 0.45)");
    grad.addColorStop(0.68, "rgba(255, 120, 30, 0.08)");
    grad.addColorStop(1, "rgba(255, 100, 20, 0.0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // 2. 6-point diffraction starburst rays
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

export interface WeatherSystem {
  update: (dt: number) => void;
  setTimeOfDay: (time: TimeOfDay) => void;
  setCondition: (condition: WeatherCondition) => void;
  toggleTimeOfDay: () => void;
  toggleCondition: () => void;
  toggleAutoCycle: () => void;
  getState: () => { timeOfDay: TimeOfDay; condition: WeatherCondition; autoCycle: boolean };
}

export function initWeather(
  scene: THREE.Scene,
  sunLight: THREE.DirectionalLight,
  hemiLight: THREE.HemisphereLight,
  flareOrOptions?: Lensflare | WeatherOptions,
  maybeOptions?: WeatherOptions
): WeatherSystem {
  const options: WeatherOptions =
    flareOrOptions && !("isObject3D" in flareOrOptions)
      ? flareOrOptions
      : maybeOptions ?? {};

  let timeOfDay: TimeOfDay = options.initialTime ?? "day";
  let condition: WeatherCondition = options.initialCondition ?? "clear";
  let autoCycle = options.autoCycle ?? false;
  let cycleTimer = 0;
  let currentIndoorLight = 0;

  const camera = options.camera;
  const buildingBoxes = options.buildingBoxes;

  // 1. Celestial Sun (Glowing Core + Corona Sprite + Optical Lensflare)
  const sunburstTex = createSunburstTexture();
  const hexGhostTex = createHexGhostTexture();
  const ringGhostTex = createRingGhostTexture();
  const moonGlowTex = createMoonGlowTexture();

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

  // Dynamic Optical Lensflare attached to distant sun
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

  // 2. Celestial Moon (Silver Core + Soft Moon Halo Sprite)
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

  // Rain Particles Setup (3500 streaks)
  const rainCount = 3500;
  const rainGeo = new THREE.BufferGeometry();
  const rainPositions = new Float32Array(rainCount * 3);
  const rainVelocities = new Float32Array(rainCount);

  const rangeX = 100;
  const rangeY = 40;
  const rangeZ = 100;

  for (let i = 0; i < rainCount; i++) {
    rainPositions[i * 3 + 0] = (Math.random() - 0.4) * rangeX + 10;
    rainPositions[i * 3 + 1] = Math.random() * rangeY;
    rainPositions[i * 3 + 2] = (Math.random() - 0.5) * rangeZ;
    rainVelocities[i] = 28 + Math.random() * 14;
  }

  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));

  // Procedural raindrop canvas texture
  const dropCanvas = document.createElement("canvas");
  dropCanvas.width = 16;
  dropCanvas.height = 32;
  const dCtx = dropCanvas.getContext("2d");
  if (dCtx) {
    const grad = dCtx.createLinearGradient(8, 0, 8, 32);
    grad.addColorStop(0, "rgba(200, 225, 255, 0)");
    grad.addColorStop(0.7, "rgba(220, 235, 255, 0.7)");
    grad.addColorStop(1, "rgba(255, 255, 255, 0.95)");
    dCtx.fillStyle = grad;
    dCtx.fillRect(6, 0, 4, 32);
  }
  const dropTexture = new THREE.CanvasTexture(dropCanvas);

  const rainMat = new THREE.PointsMaterial({
    color: 0xbfd8f5,
    size: 0.6,
    map: dropTexture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const rainPoints = new THREE.Points(rainGeo, rainMat);
  rainPoints.visible = false;
  scene.add(rainPoints);

  // Weather Presets with realistic solar & atmospheric lighting
  const presets = {
    dayClear: {
      bg: new THREE.Color(0xd6a876),
      fog: new THREE.Color(0xd6a876),
      fogDensity: 0.01,
      sunColor: new THREE.Color(0xfff7e8),
      sunIntensity: 2.8,
      hemiSky: new THREE.Color(0xd6e5fb),
      hemiGround: new THREE.Color(0x9c7a56),
      hemiIntensity: 1.1,
      sunPos: new THREE.Vector3(30, 45, -20),
      rainOpacity: 0,
    },
    dayRain: {
      bg: new THREE.Color(0x565e69),
      fog: new THREE.Color(0x565e69),
      fogDensity: 0.022,
      sunColor: new THREE.Color(0x9ab0c7),
      sunIntensity: 0.55,
      hemiSky: new THREE.Color(0x6e7b8c),
      hemiGround: new THREE.Color(0x383e47),
      hemiIntensity: 0.75,
      sunPos: new THREE.Vector3(20, 35, -15),
      rainOpacity: 0.75,
    },
    sunsetClear: {
      bg: new THREE.Color(0xb84a28),
      fog: new THREE.Color(0x9e3f22),
      fogDensity: 0.012,
      sunColor: new THREE.Color(0xff6e26),
      sunIntensity: 2.2,
      hemiSky: new THREE.Color(0xd25b38),
      hemiGround: new THREE.Color(0x4a2418),
      hemiIntensity: 0.85,
      sunPos: new THREE.Vector3(50, 4.0, -15),
      rainOpacity: 0,
    },
    sunsetRain: {
      bg: new THREE.Color(0x4a2a2e),
      fog: new THREE.Color(0x422428),
      fogDensity: 0.024,
      sunColor: new THREE.Color(0xb55338),
      sunIntensity: 0.6,
      hemiSky: new THREE.Color(0x563035),
      hemiGround: new THREE.Color(0x2a171a),
      hemiIntensity: 0.55,
      sunPos: new THREE.Vector3(40, 5.0, -12),
      rainOpacity: 0.75,
    },
    nightClear: {
      bg: new THREE.Color(0x070b16),
      fog: new THREE.Color(0x070b16),
      fogDensity: 0.012,
      sunColor: new THREE.Color(0x8eaed6),
      sunIntensity: 0.45,
      hemiSky: new THREE.Color(0x121b2d),
      hemiGround: new THREE.Color(0x080c14),
      hemiIntensity: 0.25,
      sunPos: new THREE.Vector3(-35, 45, 25),
      rainOpacity: 0,
    },
    nightRain: {
      bg: new THREE.Color(0x05070e),
      fog: new THREE.Color(0x05070e),
      fogDensity: 0.026,
      sunColor: new THREE.Color(0x3a4c62),
      sunIntensity: 0.2,
      hemiSky: new THREE.Color(0x0c121e),
      hemiGround: new THREE.Color(0x04060a),
      hemiIntensity: 0.15,
      sunPos: new THREE.Vector3(-25, 35, 18),
      rainOpacity: 0.8,
    },
  };

  let lightningTimer = 5 + Math.random() * 8;
  let lightningFlash = 0;

  function getCurrentPreset() {
    if (timeOfDay === "day") {
      return condition === "clear" ? presets.dayClear : presets.dayRain;
    } else if (timeOfDay === "sunset") {
      return condition === "clear" ? presets.sunsetClear : presets.sunsetRain;
    } else {
      return condition === "clear" ? presets.nightClear : presets.nightRain;
    }
  }

  function setTimeOfDay(time: TimeOfDay) {
    timeOfDay = time;
    updateUI();
    options.onTimeChange?.(timeOfDay);
  }

  function setCondition(c: WeatherCondition) {
    condition = c;
    updateUI();
    options.onConditionChange?.(condition);
  }

  function toggleTimeOfDay() {
    if (timeOfDay === "day") timeOfDay = "sunset";
    else if (timeOfDay === "sunset") timeOfDay = "night";
    else timeOfDay = "day";
    updateUI();
    options.onTimeChange?.(timeOfDay);
  }

  function toggleCondition() {
    condition = condition === "clear" ? "rain" : "clear";
    updateUI();
    options.onConditionChange?.(condition);
  }

  function toggleAutoCycle() {
    autoCycle = !autoCycle;
    updateUI();
  }

  function getState() {
    return { timeOfDay, condition, autoCycle };
  }

  // Floating Weather Control Widget
  const uiContainer = document.createElement("div");
  uiContainer.id = "weather-controls";
  uiContainer.style.cssText = `
    position: absolute;
    top: 16px;
    right: 16px;
    display: flex;
    gap: 8px;
    z-index: 100;
  `;

  function createBtn(id: string, initialHtml: string, title: string, onClick: () => void) {
    const btn = document.createElement("button");
    btn.id = id;
    btn.innerHTML = initialHtml;
    btn.title = title;
    btn.style.cssText = `
      background: rgba(20, 15, 10, 0.7);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 13px;
      cursor: pointer;
      backdrop-filter: blur(6px);
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 6px;
      user-select: none;
    `;
    btn.addEventListener("mouseenter", () => {
      btn.style.background = "rgba(45, 35, 25, 0.9)";
      btn.style.borderColor = "rgba(229, 155, 60, 0.5)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "rgba(20, 15, 10, 0.7)";
      btn.style.borderColor = "rgba(255, 255, 255, 0.15)";
    });
    btn.addEventListener("click", onClick);
    uiContainer.appendChild(btn);
    return btn;
  }

  const timeBtn = createBtn("btn-time", "☀️ Day", "Toggle Day/Night (Shortcut: N)", toggleTimeOfDay);
  const weatherBtn = createBtn("btn-weather", "🌤️ Clear", "Toggle Rain (Shortcut: R)", toggleCondition);
  const cycleBtn = createBtn("btn-cycle", "⏱️ Cycle: Off", "Toggle Auto Cycle (Shortcut: C)", toggleAutoCycle);

  document.body.appendChild(uiContainer);

  function updateUI() {
    timeBtn.innerHTML = timeOfDay === "day" ? "☀️ Day" : timeOfDay === "sunset" ? "🌅 Sunset" : "🌙 Night";
    weatherBtn.innerHTML = condition === "clear" ? "🌤️ Clear" : "🌧️ Rain";
    cycleBtn.innerHTML = autoCycle ? "⏱️ Cycle: 120s" : "⏱️ Cycle: Off";
    cycleBtn.style.color = autoCycle ? "#e59b3c" : "#fff";
  }

  // Keyboard shortcut listener
  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const key = e.key.toLowerCase();
    if (key === "n") toggleTimeOfDay();
    if (key === "r") toggleCondition();
    if (key === "c") toggleAutoCycle();
  });

  const tempColor = new THREE.Color();

  function update(dt: number) {
    // Auto day-night cycle (120s full period: Day 0-48s -> Sunset 48-72s -> Night 72-120s)
    if (autoCycle) {
      cycleTimer = (cycleTimer + dt) % 120;
      let newTime: TimeOfDay = "day";
      if (cycleTimer >= 48 && cycleTimer < 72) {
        newTime = "sunset";
      } else if (cycleTimer >= 72) {
        newTime = "night";
      } else {
        newTime = "day";
      }
      if (newTime !== timeOfDay) {
        timeOfDay = newTime;
        updateUI();
        options.onTimeChange?.(timeOfDay);
      }
    }

    const p = getCurrentPreset();
    const lerpSpeed = 1.5 * dt;

    // Smooth background & fog interpolation
    if (scene.background instanceof THREE.Color) {
      scene.background.lerp(p.bg, lerpSpeed);
    }
    if (scene.fog && (scene.fog as THREE.FogExp2).color) {
      const fog = scene.fog as THREE.FogExp2;
      fog.color.lerp(p.fog, lerpSpeed);
      fog.density += (p.fogDensity - fog.density) * lerpSpeed;
    }

    // Smooth lighting transition (Sun arching down into Sunset, then Moon rising)
    sunLight.color.lerp(p.sunColor, lerpSpeed);
    sunLight.intensity += (p.sunIntensity - sunLight.intensity) * lerpSpeed;
    sunLight.position.lerp(p.sunPos, lerpSpeed);

    hemiLight.color.lerp(p.hemiSky, lerpSpeed);
    hemiLight.groundColor.lerp(p.hemiGround, lerpSpeed);
    hemiLight.intensity += (p.hemiIntensity - hemiLight.intensity) * lerpSpeed;

    // Indoor room & porch lighting: activated during sunset, night & rain
    let targetIndoorLight = 0;
    if (timeOfDay === "night" && condition === "rain") {
      targetIndoorLight = 1.0;
    } else if (timeOfDay === "night") {
      targetIndoorLight = 0.85;
    } else if (timeOfDay === "sunset") {
      targetIndoorLight = 0.45;
    } else if (condition === "rain") {
      targetIndoorLight = 0.65;
    } else {
      targetIndoorLight = 0.0;
    }

    currentIndoorLight += (targetIndoorLight - currentIndoorLight) * (2.0 * dt);
    options.onIndoorLightChange?.(currentIndoorLight);

    // 1. Celestial positioning at far sky dome (450m from camera focal center)
    const sunDir = p.sunPos.clone().normalize();
    const camPos = camera ? camera.position : new THREE.Vector3(10, 4.5, -20);
    sunGroup.position.copy(camPos).addScaledVector(sunDir, celestialDist);

    const moonDir = new THREE.Vector3(-sunDir.x, Math.max(0.22, -sunDir.y), -sunDir.z).normalize();
    moonGroup.position.copy(camPos).addScaledVector(moonDir, celestialDist);

    // 2. Synchronize Sun & Moon appearance according to time of day & weather
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
      // Night
      sunGroup.visible = false;
      moonGroup.visible = condition === "clear";
      moonGlowMat.opacity = 0.5;
    }

    // 3. Dynamic Lensflare Intensity, View Angle Falloff & Building Occlusion
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

    // Rain particles animation
    const targetRainOpacity = condition === "rain" ? p.rainOpacity : 0;
    rainMat.opacity += (targetRainOpacity - rainMat.opacity) * (4 * dt);
    rainPoints.visible = rainMat.opacity > 0.01;

    if (rainPoints.visible) {
      const windX = condition === "rain" ? 4.5 * dt : 0;

      for (let i = 0; i < rainCount; i++) {
        const idx = i * 3;
        const px = rainPositions[idx + 0] ?? 0;
        const py = rainPositions[idx + 1] ?? 0;
        const pz = rainPositions[idx + 2] ?? 0;
        const vel = rainVelocities[i] ?? 30;

        const nextY = py - vel * dt;
        if (nextY < 0) {
          rainPositions[idx + 0] = (Math.random() - 0.4) * rangeX + 10;
          rainPositions[idx + 1] = rangeY + Math.random() * 5;
          rainPositions[idx + 2] = (Math.random() - 0.5) * rangeZ;
        } else {
          rainPositions[idx + 0] = px + windX;
          rainPositions[idx + 1] = nextY;
          rainPositions[idx + 2] = pz;
        }
      }
      // SAFETY: Attribute initialized in setup with Float32ArrayBufferAttribute
      const posAttr = rainGeo.getAttribute("position") as THREE.BufferAttribute;
      posAttr.needsUpdate = true;

      // Occasional Thunder & Lightning Flash during rain
      lightningTimer -= dt;
      if (lightningTimer <= 0) {
        lightningFlash = 0.12;
        lightningTimer = 6 + Math.random() * 10;
        options.onThunder?.();
      }

      if (lightningFlash > 0) {
        lightningFlash -= dt;
        tempColor.setRGB(1, 1, 1);
        hemiLight.intensity += 2.0;
        if (scene.fog) {
          (scene.fog as THREE.FogExp2).color.lerp(tempColor, 0.4);
        }
      }
    }
  }

  return {
    update,
    setTimeOfDay,
    setCondition,
    toggleTimeOfDay,
    toggleCondition,
    toggleAutoCycle,
    getState,
  };
}
