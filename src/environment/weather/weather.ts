import * as THREE from "three";
import { initSunMoon, type SunMoonSystem, type TimeOfDay, type WeatherCondition } from "./sun-moon.js";
import { initRain, type RainSystem } from "./rain.js";
import { initWeatherUI, type WeatherUI } from "../../control/weather-ui.js";

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
  let timeOfDay: TimeOfDay = options.initialTime ?? "day";
  let condition: WeatherCondition = options.initialCondition ?? "clear";
  let autoCycle = options.autoCycle ?? true;
  let cycleTimer = 0;
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
      bg: new THREE.Color(0x5c6673),
      fog: new THREE.Color(0x5c6673),
      fogDensity: 0.015,
      sunColor: new THREE.Color(0xb6c4d9),
      sunIntensity: 1.25,
      hemiSky: new THREE.Color(0x7b899e),
      hemiGround: new THREE.Color(0x454c57),
      hemiIntensity: 1.15,
      sunPos: new THREE.Vector3(30, 32, 20),
      rainOpacity: 0.8,
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
      bg: new THREE.Color(0x694246),
      fog: new THREE.Color(0x694246),
      fogDensity: 0.017,
      sunColor: new THREE.Color(0xc47b6a),
      sunIntensity: 1.15,
      hemiSky: new THREE.Color(0x8f5b5f),
      hemiGround: new THREE.Color(0x4c3033),
      hemiIntensity: 0.95,
      sunPos: new THREE.Vector3(40, 5.0, -12),
      rainOpacity: 0.72,
    },
    nightClear: {
      bg: new THREE.Color(0x162238),
      fog: new THREE.Color(0x162238),
      fogDensity: 0.012,
      sunColor: new THREE.Color(0xb8d4f2),
      sunIntensity: 1.15,
      hemiSky: new THREE.Color(0x35507a),
      hemiGround: new THREE.Color(0x1c273b),
      hemiIntensity: 0.85,
      sunPos: new THREE.Vector3(-30, 45, 20),
      rainOpacity: 0,
    },
    nightRain: {
      bg: new THREE.Color(0x131b2b),
      fog: new THREE.Color(0x131b2b),
      fogDensity: 0.016,
      sunColor: new THREE.Color(0x7e99bd),
      sunIntensity: 0.85,
      hemiSky: new THREE.Color(0x2c3d59),
      hemiGround: new THREE.Color(0x172030),
      hemiIntensity: 0.72,
      sunPos: new THREE.Vector3(-25, 35, 18),
      rainOpacity: 0.75,
    },
  };

  function getCurrentPreset(): WeatherPreset {
    const key = `${timeOfDay}${condition.charAt(0).toUpperCase() + condition.slice(1)}`;
    return presets[key] ?? presets.dayClear!;
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

  const ui: WeatherUI = initWeatherUI({
    onToggleTime: toggleTimeOfDay,
    onToggleCondition: toggleCondition,
    onToggleCycle: toggleAutoCycle,
    onToggleMute: options.onToggleMute,
    isMuted: options.isMuted,
  });
  ui.update(timeOfDay, condition, autoCycle);

  function update(dt: number) {
    if (autoCycle) {
      cycleTimer = (cycleTimer + dt) % 120;
      let newTime: TimeOfDay = "day";
      if (cycleTimer >= 48 && cycleTimer < 72) newTime = "sunset";
      else if (cycleTimer >= 72) newTime = "night";
      else newTime = "day";

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

    const p = getCurrentPreset();
    const lerpSpeed = 1.5 * dt;

    if (scene.background instanceof THREE.Color) {
      scene.background.lerp(p.bg, lerpSpeed);
    }
    if (scene.fog && (scene.fog as THREE.FogExp2).color) {
      const fog = scene.fog as THREE.FogExp2;
      fog.color.lerp(p.fog, lerpSpeed);
      fog.density += (p.fogDensity - fog.density) * lerpSpeed;
    }

    sunLight.color.lerp(p.sunColor, lerpSpeed);
    sunLight.intensity += (p.sunIntensity - sunLight.intensity) * lerpSpeed;
    sunLight.position.lerp(p.sunPos, lerpSpeed);

    hemiLight.color.lerp(p.hemiSky, lerpSpeed);
    hemiLight.groundColor.lerp(p.hemiGround, lerpSpeed);
    hemiLight.intensity += (p.hemiIntensity - hemiLight.intensity) * lerpSpeed;

    let targetIndoor = 0;
    if (timeOfDay === "night" && condition === "rain") targetIndoor = 1.0;
    else if (timeOfDay === "night") targetIndoor = 0.85;
    else if (timeOfDay === "sunset") targetIndoor = 0.45;
    else if (condition === "rain") targetIndoor = 0.65;
    currentIndoorLight += (targetIndoor - currentIndoorLight) * (2.0 * dt);
    options.onIndoorLightChange?.(currentIndoorLight);

    sunMoon.update(p.sunPos, timeOfDay, condition);
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
