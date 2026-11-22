import * as THREE from "three";
import { initScene } from "./core/scene.js";
import { initAudio } from "./core/audio.js";
import { initAudioUI } from "./control/audio-ui.js";
import { initCameraController } from "./control/camera.js";
import { initDesertGround } from "./environment/terrain/ground.js";
import { loadWorld } from "./environment/world/town.js";
import { initClouds } from "./environment/weather/clouds.js";
import { initWeather } from "./environment/weather/weather.js";
import { initNPC } from "./entities/npc/npc.js";
import { initTumbleweeds } from "./entities/tumbleweed.js";

// 1. Scene, Camera, Renderer, Controls & Lighting
const { scene, camera, renderer, controls, sunLight, hemiLight } = initScene();

// 2. Camera WASD & Terrain Elevation Controller
const cameraController = initCameraController(camera, controls);

// 3. Audio Manager
const audio = initAudio();

// 4. World Collisions & Terrain Expanse
const buildingBoxes: THREE.Box3[] = [];
const ground = initDesertGround(scene);
const world = loadWorld(scene, controls, camera, renderer, buildingBoxes);
const clouds = initClouds(scene);
const tumbleweeds = initTumbleweeds(scene);

// 5. Dynamic Weather (Sun, Moon, Rain, Presets & HUD Controls)
const weather = initWeather(scene, sunLight, hemiLight, {
  camera,
  buildingBoxes,
  onTimeChange: (time) => audio.setDayTime(time !== "night"),
  onConditionChange: (condition) => audio.setRain(condition === "rain"),
  onThunder: () => audio.playThunder(),
  onIndoorLightChange: (intensity) => world.setIndoorLighting(intensity),
});

// 6. Sound Toggle UI (integrated into header bar)
initAudioUI({
  onToggleMute: () => audio.toggleMute(),
  isMuted: () => audio.isMuted(),
});

// 7. Intelligent Town NPC AI
const npc = initNPC(scene, buildingBoxes, camera);

// 7. Clean Declarative Game Loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  cameraController.update(dt);
  ground.update(dt, weather.getState().condition === "rain");
  world.update(dt);
  weather.update(dt);
  audio.update(dt);
  npc.update(dt);
  tumbleweeds.update(dt, buildingBoxes);
  clouds.update(dt, weather.getState());
  controls.update();

  renderer.render(scene, camera);
}

animate();
