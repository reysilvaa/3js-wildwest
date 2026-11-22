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
import { inspectNPC } from "./entities/npc/modular.js";
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

const NPC_SPAWN_SPOTS: [number, number, number][] = [
  [13.2, 0.45, -7.5], // Saloon Porch
  [6.8, 0.45, 7.0],   // Bank Steps
  [13.0, 0.45, 0.5],  // Sheriff Office
  [13.0, 0.45, 12.0], // General Store
  [6.8, 0.45, -16.0], // Train Depot
];

const NPC_NAMES = ["Arthur", "Wyatt", "Doc", "Jack Owi", "Sadie"];

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

const bubbleChat = initBubbleChat({ camera, headOffsetY: 1.45 });
const conversations = initConversationManager(npcs, bubbleChat);

(window as unknown as Record<string, unknown>).__npcs = npcs;
(window as unknown as Record<string, unknown>).triggerConversation = (i = 0, j = 1) => {
  const a = npcs[i];
  const b = npcs[j];
  if (a && b) conversations.triggerPairConversation(a, b);
};
(window as unknown as Record<string, unknown>).sayBubble = (i = 0, text = "Howdy partner!") => {
  const npc = npcs[i];
  if (npc) bubbleChat.showBubble(npc.id, npc.name, text, () => npc.getPosition());
};
(window as unknown as Record<string, unknown>).setBubbleOffset = (y = 1.45) => {
  bubbleChat.setHeadOffset(y);
  console.log(`[BubbleChat] Head vertical offset updated to: ${y}m`);
};
(window as unknown as Record<string, unknown>).inspectNPC = (index = 0) => {
  const npc = npcs[index];
  if (!npc || !npc.model) {
    console.warn(`[inspectNPC] NPC ${index} model not loaded yet (total: ${npcs.length})`);
    return;
  }
  console.log(`%c=== Inspecting NPC ${index} (${npc.getState()}) ===`, "color: #ffaa00; font-weight: bold;");
  return inspectNPC(npc.model);
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
