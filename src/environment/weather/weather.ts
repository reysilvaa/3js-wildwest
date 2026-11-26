import * as THREE from "three";
import { initSunMoon, type SunMoonSystem, type TimeOfDay, type WeatherCondition } from "@/environment/weather/sun-moon.js";
import { initRain, type RainSystem } from "@/environment/weather/rain.js";
import { initSettingsMenu, type SettingsMenu } from "@/ui/settings-menu.js";

export type { TimeOfDay, WeatherCondition };

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
  onToggleMute?: () => boolean;
  isMuted?: () => boolean;
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

interface WeatherPreset {
  bg: THREE.Color;
  fog: THREE.Color;
  fogDensity: number;
  sunColor: THREE.Color;
  sunIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  sunPos: THREE.Vector3;
  rainOpacity: number;
}

export function initWeather(
  scene: THREE.Scene,
  sunLight: THREE.DirectionalLight,
  hemiLight: THREE.HemisphereLight,
  options: WeatherOptions = {}
): WeatherSystem {
  const CYCLE_DURATION = 360;
  const phaseForTime = (t: TimeOfDay) => (t === "day" ? 0.25 : t === "sunset" ? 0.48 : 0.75);

  let timeOfDay: TimeOfDay = options.initialTime ?? "day";
  let condition: WeatherCondition = options.initialCondition ?? "clear";
  let autoCycle = options.autoCycle ?? true;
  let cycleTimer = phaseForTime(timeOfDay) * CYCLE_DURATION;
  let rainBlend = condition === "rain" ? 1 : 0;
  let currentIndoorLight = 0;
  const nextRainDelay = (c: WeatherCondition) =>
    c === "rain" ? 25 + Math.random() * 35 : 40 + Math.random() * 65;
  let rainTimer = nextRainDelay(condition);

  const sunMoon: SunMoonSystem = initSunMoon(scene, options.camera, options.buildingBoxes);
  const rain: RainSystem = initRain(scene, options.onThunder);

  const presets: Record<string, WeatherPreset> = {
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
      bg: new THREE.Color(0x2f3640),
      fog: new THREE.Color(0x2f3640),
      fogDensity: 0.019,
      sunColor: new THREE.Color(0x7e8a9c),
      sunIntensity: 0.65,
      hemiSky: new THREE.Color(0x303846),
      hemiGround: new THREE.Color(0x1b2029),
      hemiIntensity: 0.62,
      sunPos: new THREE.Vector3(30, 32, 20),
      rainOpacity: 0.85,
    },
    sunsetClear: {
      bg: new THREE.Color(0xbc4e2c),
      fog: new THREE.Color(0xb54320),
      fogDensity: 0.014,
      sunColor: new THREE.Color(0xff6a28),
      sunIntensity: 2.0,
      hemiSky: new THREE.Color(0xbf5535),
      hemiGround: new THREE.Color(0x4a2215),
      hemiIntensity: 0.85,
      sunPos: new THREE.Vector3(45, 4.0, -10),
      rainOpacity: 0,
    },
    sunsetRain: {
      bg: new THREE.Color(0x331d21),
      fog: new THREE.Color(0x331d21),
      fogDensity: 0.021,
      sunColor: new THREE.Color(0x7c3f34),
      sunIntensity: 0.55,
      hemiSky: new THREE.Color(0x48262b),
      hemiGround: new THREE.Color(0x221215),
      hemiIntensity: 0.48,
      sunPos: new THREE.Vector3(40, 5.0, -12),
      rainOpacity: 0.78,
    },
    nightClear: {
      bg: new THREE.Color(0x060a14),
      fog: new THREE.Color(0x060a14),
      fogDensity: 0.016,
      sunColor: new THREE.Color(0x7a9cc6),
      sunIntensity: 0.35,
      hemiSky: new THREE.Color(0x101c33),
      hemiGround: new THREE.Color(0x060912),
      hemiIntensity: 0.28,
      sunPos: new THREE.Vector3(-30, 45, 20),
      rainOpacity: 0,
    },
    nightRain: {
      bg: new THREE.Color(0x04060c),
      fog: new THREE.Color(0x04060c),
      fogDensity: 0.022,
      sunColor: new THREE.Color(0x455a78),
      sunIntensity: 0.18,
      hemiSky: new THREE.Color(0x0a101c),
      hemiGround: new THREE.Color(0x03050a),
      hemiIntensity: 0.16,
      sunPos: new THREE.Vector3(-25, 35, 18),
      rainOpacity: 0.85,
    },
  };

  const blendedPreset: WeatherPreset = {
    bg: new THREE.Color(),
    fog: new THREE.Color(),
    fogDensity: 0.01,
    sunColor: new THREE.Color(),
    sunIntensity: 2.8,
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    hemiIntensity: 1.1,
    sunPos: new THREE.Vector3(30, 45, -20),
    rainOpacity: 0,
  };
  const clearScratch: WeatherPreset = {
    bg: new THREE.Color(),
    fog: new THREE.Color(),
    fogDensity: 0.01,
    sunColor: new THREE.Color(),
    sunIntensity: 2.8,
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    hemiIntensity: 1.1,
    sunPos: new THREE.Vector3(),
    rainOpacity: 0,
  };
  const rainScratch: WeatherPreset = {
    bg: new THREE.Color(),
    fog: new THREE.Color(),
    fogDensity: 0.01,
    sunColor: new THREE.Color(),
    sunIntensity: 0.65,
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    hemiIntensity: 0.6,
    sunPos: new THREE.Vector3(),
    rainOpacity: 0.85,
  };

  function lerpPreset(out: WeatherPreset, a: WeatherPreset, b: WeatherPreset, t: number): void {
    out.bg.copy(a.bg).lerp(b.bg, t);
    out.fog.copy(a.fog).lerp(b.fog, t);
    out.fogDensity = THREE.MathUtils.lerp(a.fogDensity, b.fogDensity, t);
    out.sunColor.copy(a.sunColor).lerp(b.sunColor, t);
    out.sunIntensity = THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, t);
    out.hemiSky.copy(a.hemiSky).lerp(b.hemiSky, t);
    out.hemiGround.copy(a.hemiGround).lerp(b.hemiGround, t);
    out.hemiIntensity = THREE.MathUtils.lerp(a.hemiIntensity, b.hemiIntensity, t);
    out.rainOpacity = THREE.MathUtils.lerp(a.rainOpacity, b.rainOpacity, t);
  }

  function sampleTimeline(sunElev: number, rBlend: number): WeatherPreset {
    // Smooth transitions: night (<= -0.15) <-> golden dawn/dusk (~0.06) <-> midday (>= 0.35)
    if (sunElev >= 0.06) {
      const t = THREE.MathUtils.smoothstep(sunElev, 0.06, 0.38);
      lerpPreset(clearScratch, presets.sunsetClear!, presets.dayClear!, t);
      lerpPreset(rainScratch, presets.sunsetRain!, presets.dayRain!, t);
    } else {
      const t = THREE.MathUtils.smoothstep(sunElev, -0.18, 0.06);
      lerpPreset(clearScratch, presets.nightClear!, presets.sunsetClear!, t);
      lerpPreset(rainScratch, presets.nightRain!, presets.sunsetRain!, t);
    }
    lerpPreset(blendedPreset, clearScratch, rainScratch, rBlend);
    return blendedPreset;
  }

  function setTimeOfDay(time: TimeOfDay) {
    timeOfDay = time;
    options.onTimeChange?.(timeOfDay);
    ui.update(timeOfDay, condition, autoCycle);
  }

  function setCondition(c: WeatherCondition) {
    condition = c;
    rainTimer = nextRainDelay(condition);
    options.onConditionChange?.(condition);
    ui.update(timeOfDay, condition, autoCycle);
  }

  function toggleTimeOfDay() {
    if (autoCycle) return;
    const times: TimeOfDay[] = ["day", "sunset", "night"];
    const next = times[(times.indexOf(timeOfDay) + 1) % times.length] ?? "day";
    setTimeOfDay(next);
  }

  function toggleCondition() {
    setCondition(condition === "clear" ? "rain" : "clear");
  }

  function toggleAutoCycle() {
    autoCycle = !autoCycle;
    ui.update(timeOfDay, condition, autoCycle);
  }

  const stateObj = { timeOfDay, condition, autoCycle };
  function getState() {
    stateObj.timeOfDay = timeOfDay;
    stateObj.condition = condition;
    stateObj.autoCycle = autoCycle;
    return stateObj;
  }

  const ui: SettingsMenu = initSettingsMenu({
    onToggleTime: toggleTimeOfDay,
    onToggleCondition: toggleCondition,
    onToggleCycle: toggleAutoCycle,
    onToggleMute: options.onToggleMute,
    isMuted: options.isMuted,
  });
  ui.update(timeOfDay, condition, autoCycle);

  const sunBodyPos = new THREE.Vector3();
  const activeLightPos = new THREE.Vector3();

  function update(dt: number) {
    if (autoCycle) {
      cycleTimer = (cycleTimer + dt) % CYCLE_DURATION;
    } else {
      // Smoothly glide toward manual preset phase when autoCycle is paused
      const targetTimer = phaseForTime(timeOfDay) * CYCLE_DURATION;
      let diff = targetTimer - cycleTimer;
      if (diff > CYCLE_DURATION * 0.5) diff -= CYCLE_DURATION;
      if (diff < -CYCLE_DURATION * 0.5) diff += CYCLE_DURATION;
      cycleTimer = (cycleTimer + diff * Math.min(1, 3.5 * dt) + CYCLE_DURATION) % CYCLE_DURATION;
    }

    // Continuous East (+X) -> Overhead (+Y) -> West (-X) solar timeline
    const phase = cycleTimer / CYCLE_DURATION;
    const solarAngle = phase * Math.PI * 2; // 0=dawn(+X), 0.25=noon(+Y), 0.5=dusk(-X), 0.75=midnight(-Y)
    const cosA = Math.cos(solarAngle);
    const sinA = Math.sin(solarAngle);
    sunBodyPos.set(cosA * 52, sinA * 52, -14);
    const sunElev = sinA;

    if (autoCycle) {
      const newTime: TimeOfDay = sunElev >= 0.22 ? "day" : sunElev >= -0.08 ? "sunset" : "night";
      if (newTime !== timeOfDay) {
        timeOfDay = newTime;
        ui.update(timeOfDay, condition, autoCycle);
        options.onTimeChange?.(timeOfDay);
      }
    }

    rainTimer -= dt;
    if (rainTimer <= 0) {
      if (condition === "clear") {
        if (Math.random() < 0.55) setCondition("rain");
        else rainTimer = nextRainDelay("clear");
      } else {
        setCondition("clear");
      }
    }

    rainBlend += ((condition === "rain" ? 1 : 0) - rainBlend) * Math.min(1, 1.4 * dt);
    const p = sampleTimeline(sunElev, rainBlend);

    if (scene.background instanceof THREE.Color) scene.background.copy(p.bg);
    if (scene.fog && (scene.fog as THREE.FogExp2).color) {
      const fog = scene.fog as THREE.FogExp2;
      fog.color.copy(p.fog);
      fog.density = p.fogDensity;
    }

    // Keep DirectionalLight above horizon: follow sun by day, smoothly hand off to moon at night
    if (sunElev >= 0) {
      activeLightPos.set(sunBodyPos.x, Math.max(4.5, sunBodyPos.y), sunBodyPos.z);
    } else {
      activeLightPos.set(-sunBodyPos.x, Math.max(8, -sunBodyPos.y), -sunBodyPos.z);
    }

    sunLight.color.copy(p.sunColor);
    sunLight.intensity = p.sunIntensity;
    sunLight.position.copy(activeLightPos);

    hemiLight.color.copy(p.hemiSky);
    hemiLight.groundColor.copy(p.hemiGround);
    hemiLight.intensity = p.hemiIntensity;

    const nightFactor = THREE.MathUtils.smoothstep(-sunElev, -0.05, 0.25);
    const targetIndoor = Math.min(1.0, nightFactor * 0.85 + rainBlend * 0.35);
    currentIndoorLight += (targetIndoor - currentIndoorLight) * Math.min(1, 2.0 * dt);
    options.onIndoorLightChange?.(currentIndoorLight);

    sunMoon.update(sunBodyPos, timeOfDay, condition);
    rain.update(dt, condition === "rain", p.rainOpacity);
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
