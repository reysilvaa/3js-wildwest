import * as THREE from "three";
import { initScene } from "./core/scene.js";
import { initAudio } from "./core/audio.js";
import { initAudioUI } from "./control/audio-ui.js";
import { initCameraController } from "./control/camera.js";
import { initDesertGround } from "./environment/terrain/ground.js";
import { loadWorld } from "./environment/world/town.js";
import { initClouds } from "./environment/weather/clouds.js";
import { initWeather } from "./environment/weather/weather.js";
import { initNPC, resolveNPCCollisions } from "./entities/npc/npc.js";
import { initBubbleChat } from "./ui/bubble-chat.js";
import { initConversationManager } from "./entities/npc/conversation.js";
import { initTumbleweeds } from "./entities/tumbleweed.js";

const { scene, camera, renderer, controls, sunLight, hemiLight } = initScene();
const cameraController = initCameraController(camera, controls);
const audio = initAudio();

const buildingBoxes: THREE.Box3[] = [];
const ground = initDesertGround(scene);
const world = loadWorld(scene, controls, camera, renderer, buildingBoxes);
const clouds = initClouds(scene);
const tumbleweeds = initTumbleweeds(scene);

const weather = initWeather(scene, sunLight, hemiLight, {
  camera,
  buildingBoxes,
  onTimeChange: (time) => audio.setTimeOfDay(time),
  onConditionChange: (condition) => audio.setRain(condition === "rain"),
  onThunder: () => audio.playThunder(),
  onIndoorLightChange: (intensity) => world.setIndoorLighting(intensity),
  onToggleMute: () => audio.toggleMute(),
  isMuted: () => audio.isMuted(),
});
audio.setTimeOfDay(weather.getState().timeOfDay);

initAudioUI({
  onToggleMute: () => audio.toggleMute(),
  isMuted: () => audio.isMuted(),
});

let streetCameraActive = false;
(window as unknown as Record<string, unknown>).__toggleCameraView = () => {
  streetCameraActive = !streetCameraActive;
  if (streetCameraActive) {
    camera.position.set(10.0, 1.8, 5.0);
    controls.target.set(10.0, 1.6, -10.0);
  } else {
    camera.position.set(10.0, 14.0, 28.0);
    controls.target.set(10.0, 1.5, -6.0);
  }
};

const NPC_SPAWNS: Array<{ pos: [number, number, number]; zone: "center" | "south" | "west" | "east" }> = [
  // Town Center (14 NPCs — busiest downtown hub!)
  { pos: [13.2, 0.45, -7.5],  zone: "center" },
  { pos: [6.8,  0.45,  7.0],  zone: "center" },
  { pos: [13.0, 0.45,  0.5],  zone: "center" },
  { pos: [13.0, 0.45, 12.0],  zone: "center" },
  { pos: [6.8,  0.45, -16.0], zone: "center" },
  { pos: [10.2, 0.45, -3.5],  zone: "center" },
  { pos: [6.8,  0.45, -6.5],  zone: "center" },
  { pos: [8.8,  0.45, 17.5],  zone: "center" },
  { pos: [9.5,  0.45, -23.5], zone: "center" },
  { pos: [10.0, 0.45, -1.0],  zone: "center" },
  { pos: [11.5, 0.45, -14.0], zone: "center" },
  { pos: [8.2,  0.45,  3.5],  zone: "center" },
  { pos: [12.0, 0.45,  8.5],  zone: "center" },
  { pos: [7.5,  0.45, -11.5], zone: "center" },
  // South Main Street (8 NPCs)
  { pos: [5.2,  0.0, 26.5],   zone: "south" },
  { pos: [15.0, 0.0, 31.0],   zone: "south" },
  { pos: [4.8,  0.0, 39.5],   zone: "south" },
  { pos: [14.8, 0.0, 44.0],   zone: "south" },
  { pos: [4.6,  0.0, 51.5],   zone: "south" },
  { pos: [15.8, 0.0, 55.0],   zone: "south" },
  { pos: [4.8,  0.0, 62.5],   zone: "south" },
  { pos: [16.2, 0.0, 64.0],   zone: "south" },
  // West Homesteads (5 NPCs)
  { pos: [-21.5, 0.0, -10.0], zone: "west" },
  { pos: [-23.0, 0.0,   4.0], zone: "west" },
  { pos: [-22.0, 0.0,  15.0], zone: "west" },
  { pos: [-22.5, 0.0,  28.0], zone: "west" },
  { pos: [-24.0, 0.0,  42.0], zone: "west" },
  // East Frontier Outskirts (5 NPCs)
  { pos: [33.0,  0.0, -12.0], zone: "east" },
  { pos: [38.0,  0.0,   3.0], zone: "east" },
  { pos: [33.5,  0.0,  18.0], zone: "east" },
  { pos: [34.0,  0.0,  32.0], zone: "east" },
  { pos: [35.0,  0.0,  48.0], zone: "east" },
];

const NPC_NAMES = [
  "Arthur", "Wyatt", "Doc", "Sadie", "Jack", "Hosea", "Bill", "Dutch",
  "Abigail", "John", "Charles", "Javier", "Lenny", "Micah", "Pearson", "Sean",
  "Kieran", "Josiah", "Uncle", "Reverend", "Caleb", "Eli", "Silas", "Boone",
  "Harlan", "Wade", "Cole", "Jesse", "Gideon", "Travis", "Beau", "Clint",
];

const npcs = NPC_SPAWNS.map((spawn, i) =>
  initNPC(scene, buildingBoxes, camera, {
    name: NPC_NAMES[i] ?? `Resident ${i + 1}`,
    modelIndex: i,
    homeZone: spawn.zone,
    modularAccessory: "random",
    initialPos: spawn.pos,
    scale: 0.83 + (i % 3) * 0.02,
    walkSpeed: 1.02 + (i % 4) * 0.04,
    stationary: false,
    startActivityIndex: i,
  })
);

const bubbleChat = initBubbleChat({ camera, headOffsetY: 1.45 });
const conversations = initConversationManager(npcs, bubbleChat);

(window as unknown as Record<string, unknown>).triggerConversation = (i = 0, j = 1) => {
  const a = npcs[i];
  const b = npcs[j];
  if (a && b) conversations.triggerPairConversation(a, b);
};

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
  resolveNPCCollisions(npcs);
  conversations.update(dt);
  bubbleChat.update(camera, dt);
  tumbleweeds.update(dt, buildingBoxes);
  clouds.update(dt, weather.getState());
  controls.update();

  renderer.render(scene, camera);
}

animate();
