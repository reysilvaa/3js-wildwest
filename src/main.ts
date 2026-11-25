import * as THREE from "three";
import { initScene } from "./core/scene.js";
import { initAudio } from "./core/audio.js";
import { initAudioUI } from "./control/audio-ui.js";
import { initCameraController } from "./control/camera.js";
import { initDesertGround } from "./environment/terrain/ground.js";
import { loadWorld } from "./environment/world/town.js";
import { initClouds } from "./environment/weather/clouds.js";
import { initWeather } from "./environment/weather/weather.js";
import { spawnTownNPCs, resolveNPCCollisions } from "./entities/npc/npc.js";
import { initConversationManager } from "./entities/npc/conversation.js";
import { initTumbleweeds } from "./entities/tumbleweed.js";
import { initBubbleChat } from "./ui/bubble-chat.js";
import { initBuildingPanels } from "./ui/building-panel.js";
import { initInspector } from "./ui/inspector.js";
import { initMobileExperience } from "./ui/mobile.js";

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
  onConditionChange: (c) => audio.setRain(c === "rain"),
  onThunder: () => audio.playThunder(),
  onIndoorLightChange: (v) => world.setIndoorLighting(v),
  onToggleMute: () => audio.toggleMute(),
  isMuted: () => audio.isMuted(),
});
audio.setTimeOfDay(weather.getState().timeOfDay);
initAudioUI({ onToggleMute: () => audio.toggleMute(), isMuted: () => audio.isMuted() });
initMobileExperience();

const npcs = spawnTownNPCs(scene, buildingBoxes, camera, world.getBuildings);
const bubbleChat = initBubbleChat({ camera, headOffsetY: 1.45 });
const buildingPanels = initBuildingPanels(world.getBuildings);
const conversations = initConversationManager(npcs, bubbleChat);
const inspector = initInspector({
  scene,
  camera,
  controls,
  domElement: renderer.domElement,
  npcs,
  getBuildings: world.getBuildings,
  onTalk: (npc) => {
    const partner = npcs.find((n) => n.id !== npc.id && n.model?.root.visible);
    if (partner) conversations.triggerPairConversation(npc, partner);
  },
});

let inspectIdx = 0;
Object.assign(window, {
  __npcs: npcs,
  inspectNPC: (i?: number) => inspector.inspectNPCByIndex(typeof i === "number" ? i : inspectIdx++),
  triggerConversation: (i = 0, j = 1) => {
    if (npcs[i] && npcs[j]) conversations.triggerPairConversation(npcs[i]!, npcs[j]!);
  },
});

const clock = new THREE.Clock();
let shadowTimer = 0;
let rafId = 0;

function animate() {
  if (document.hidden) {
    rafId = 0;
    return;
  }
  rafId = requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const wState = weather.getState();

  cameraController.update(dt);
  ground.update(dt, wState.condition === "rain");
  world.update(dt);
  weather.update(dt);
  audio.update(dt);
  for (let i = 0; i < npcs.length; i++) npcs[i]?.update(dt);
  resolveNPCCollisions(npcs);
  conversations.update(dt);
  bubbleChat.update(camera, dt);
  buildingPanels.update(camera);
  inspector.update(dt);
  tumbleweeds.update(dt, buildingBoxes);
  clouds.update(dt, wState);
  controls.update();

  // Throttle dynamic shadow map updates to 15Hz (cuts 75% shadow-pass GPU work)
  shadowTimer += dt;
  if (shadowTimer >= 0.066) {
    shadowTimer = 0;
    renderer.shadowMap.needsUpdate = true;
  }

  renderer.render(scene, camera);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !rafId) {
    clock.getDelta();
    animate();
  }
});

animate();
