import * as THREE from "three";
import { Lensflare } from "three/addons/objects/Lensflare.js";

export type TimeOfDay = "day" | "night";
export type WeatherCondition = "clear" | "rain";

export interface WeatherOptions {
  initialTime?: TimeOfDay;
  initialCondition?: WeatherCondition;
  autoCycle?: boolean;
  onTimeChange?: (time: TimeOfDay) => void;
  onIndoorLightChange?: (intensity: number) => void;
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
  flare?: Lensflare,
  options: WeatherOptions = {}
): WeatherSystem {
  let timeOfDay: TimeOfDay = options.initialTime ?? "day";
  let condition: WeatherCondition = options.initialCondition ?? "clear";
  let autoCycle = options.autoCycle ?? false;
  let cycleTimer = 0;
  let currentIndoorLight = 0;

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
    nightClear: {
      bg: new THREE.Color(0x0a0f1d),
      fog: new THREE.Color(0x0a0f1d),
      fogDensity: 0.012,
      sunColor: new THREE.Color(0x6a86ad),
      sunIntensity: 0.35,
      hemiSky: new THREE.Color(0x152238),
      hemiGround: new THREE.Color(0x090d14),
      hemiIntensity: 0.25,
      sunPos: new THREE.Vector3(-25, 40, 15),
      rainOpacity: 0,
    },
    nightRain: {
      bg: new THREE.Color(0x05070e),
      fog: new THREE.Color(0x05070e),
      fogDensity: 0.026,
      sunColor: new THREE.Color(0x32475e),
      sunIntensity: 0.15,
      hemiSky: new THREE.Color(0x0c121e),
      hemiGround: new THREE.Color(0x04060a),
      hemiIntensity: 0.15,
      sunPos: new THREE.Vector3(-20, 30, 10),
      rainOpacity: 0.8,
    },
  };

  let lightningTimer = 5 + Math.random() * 8;
  let lightningFlash = 0;

  function getCurrentPreset() {
    if (timeOfDay === "day") {
      return condition === "clear" ? presets.dayClear : presets.dayRain;
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
  }

  function toggleTimeOfDay() {
    timeOfDay = timeOfDay === "day" ? "night" : "day";
    updateUI();
    options.onTimeChange?.(timeOfDay);
  }

  function toggleCondition() {
    condition = condition === "clear" ? "rain" : "clear";
    updateUI();
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
    timeBtn.innerHTML = timeOfDay === "day" ? "☀️ Day" : "🌙 Night";
    weatherBtn.innerHTML = condition === "clear" ? "🌤️ Clear" : "🌧️ Rain";
    cycleBtn.innerHTML = autoCycle ? "⏱️ Cycle: On" : "⏱️ Cycle: Off";
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
    // Auto day-night cycle (45 seconds per full cycle)
    if (autoCycle) {
      cycleTimer += dt;
      if (cycleTimer > 25) {
        cycleTimer = 0;
        timeOfDay = timeOfDay === "day" ? "night" : "day";
        updateUI();
        options.onTimeChange?.(timeOfDay);
      }
    }

    const p = getCurrentPreset();
    const lerpSpeed = 2.5 * dt;

    // Smooth background & fog interpolation
    if (scene.background instanceof THREE.Color) {
      scene.background.lerp(p.bg, lerpSpeed);
    }
    if (scene.fog && (scene.fog as THREE.FogExp2).color) {
      const fog = scene.fog as THREE.FogExp2;
      fog.color.lerp(p.fog, lerpSpeed);
      fog.density += (p.fogDensity - fog.density) * lerpSpeed;
    }

    // Smooth lighting transition
    sunLight.color.lerp(p.sunColor, lerpSpeed);
    sunLight.intensity += (p.sunIntensity - sunLight.intensity) * lerpSpeed;
    sunLight.position.lerp(p.sunPos, lerpSpeed);

    hemiLight.color.lerp(p.hemiSky, lerpSpeed);
    hemiLight.groundColor.lerp(p.hemiGround, lerpSpeed);
    hemiLight.intensity += (p.hemiIntensity - hemiLight.intensity) * lerpSpeed;

    // Indoor room lighting: activated during dark conditions (night & rain)
    let targetIndoorLight = 0;
    if (timeOfDay === "night" && condition === "rain") {
      targetIndoorLight = 1.0;
    } else if (timeOfDay === "night") {
      targetIndoorLight = 0.85;
    } else if (condition === "rain") {
      targetIndoorLight = 0.65;
    } else {
      targetIndoorLight = 0.0;
    }

    currentIndoorLight += (targetIndoorLight - currentIndoorLight) * (2.5 * dt);
    options.onIndoorLightChange?.(currentIndoorLight);

    // Lensflare only active in clear daylight
    if (flare) {
      const shouldFlare = timeOfDay === "day" && condition === "clear";
      flare.visible = shouldFlare;
    }

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
