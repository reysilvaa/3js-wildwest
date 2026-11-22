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
import { inspectNPC } from "./entities/npc/modular.js";
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

// 7. Intelligent Town NPCs (Jokowi Roaming + Frontier Cowboy Guard)
// 7. Intelligent Town NPCs (5 Procedurally Generated Modular Residents)
const NPC_SPAWN_SPOTS: [number, number, number][] = [
  [13.2, 0.45, -7.5], // Saloon Porch
  [6.8, 0.45, 7.0],   // Bank Steps
  [13.0, 0.45, 0.5],  // Sheriff Office
  [13.0, 0.45, 12.0], // General Store
  [6.8, 0.45, -16.0], // Train Depot
];

const NPC_NAMES = ["Arthur", "Wyatt", "Doc", "Jesse", "Sadie"];

const npcs = NPC_SPAWN_SPOTS.map((pos, i) =>
  initNPC(scene, buildingBoxes, camera, {
    name: NPC_NAMES[i] ?? `Resident ${i + 1}`,
    useModular: true,
    modularHead: "random",
    modularAccessory: "random",
    initialPos: pos,
    scale: 0.83 + (i % 3) * 0.025,
    walkSpeed: 1.02 + (i % 4) * 0.05,
    stationary: false,
    startActivityIndex: i,
  })
);

// Diagnostic quick-inspection hook on window
(window as unknown as Record<string, unknown>).__npcs = npcs;
(window as unknown as Record<string, unknown>).inspectNPC = (index = 0) => {
  const npc = npcs[index];
  if (!npc || !npc.model) {
    console.warn(`[inspectNPC] NPC ${index} model not loaded yet (total: ${npcs.length})`);
    return;
  }
  console.log(`%c=== Inspecting NPC ${index} (${npc.getState()}) ===`, "color: #ffaa00; font-weight: bold;");
  return inspectNPC(npc.model);
};

// 8. Clean Declarative Game Loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  cameraController.update(dt);
  ground.update(dt, weather.getState().condition === "rain");
  world.update(dt);
  weather.update(dt);
  audio.update(dt);
  for (let i = 0; i < npcs.length; i++) {
    npcs[i]?.update(dt);
  }
  tumbleweeds.update(dt, buildingBoxes);
  clouds.update(dt, weather.getState());
  controls.update();

  renderer.render(scene, camera);
}

animate();
