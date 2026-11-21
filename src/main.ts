import * as THREE from "three";
import { initScene } from "./core/scene.js";
import { loadWorld } from "./environment/world.js";
import { initDesertGround } from "./environment/ground.js";
import { initClouds } from "./environment/clouds.js";
import { initTumbleweeds } from "./entities/tumbleweed.js";
import { initWeather } from "./environment/weather.js";
import { initAudio } from "./core/audio.js";
import { initNPC } from "./entities/npc.js";

// Initialize Scene, Camera, Renderer, Controls & Lighting
const { scene, camera, renderer, controls, sunLight, hemiLight, flare } = initScene();

// Shared solid building collision boxes
const buildingBoxes: THREE.Box3[] = [];

// Initialize Expansive Desert Ground Expanse (seamless horizon dunes & procedural sand)
initDesertGround(scene);

// Load Wild West Town environment (with interactive windmill)
const world = loadWorld(scene, controls, camera, renderer, buildingBoxes);

// Initialize Dynamic Clouds & Tumbleweeds
const clouds = initClouds(scene);
const tumbleweeds = initTumbleweeds(scene);

// Initialize Audio System (Day BGM: /bgm/day.ogg)
const audio = initAudio();

// Initialize Dynamic Weather System (Day/Night cycle, Rain particles, Lightning, BGM synchronization, Indoor lighting)
const weather = initWeather(scene, sunLight, hemiLight, flare, {
  onTimeChange: (time) => audio.setDayTime(time === "day"),
  onIndoorLightChange: (intensity) => world.setIndoorLighting(intensity),
});

// Initialize Intelligent Town NPC AI (Street Navigation, Building Collision Prevention, Interactive Greeting)
const npc = initNPC(scene, buildingBoxes, camera);

const clock = new THREE.Clock();
const speed = 20; // units per second — adjusted for perceptible movement

// WASD movement control
const keys = {
  w: false,
  a: false,
  s: false,
  d: false,
};

window.addEventListener("keydown", (e) => {
  if (e.key in keys) keys[e.key as keyof typeof keys] = true;
});
window.addEventListener("keyup", (e) => {
  if (e.key in keys) keys[e.key as keyof typeof keys] = false;
});

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  // WASD camera movement
  const moveSpeed = speed * dt;
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  right.crossVectors(forward, camera.up).normalize();

  if (keys.w) camera.position.add(forward.multiplyScalar(moveSpeed));
  if (keys.s) camera.position.add(forward.multiplyScalar(-moveSpeed));
  if (keys.a) camera.position.add(right.multiplyScalar(-moveSpeed));
  if (keys.d) camera.position.add(right.multiplyScalar(moveSpeed));

  world.update(dt);
  weather.update(dt);
  audio.update(dt);
  npc.update(dt);
  tumbleweeds.update(dt, buildingBoxes);
  clouds.update(dt);
  controls.update();

  renderer.render(scene, camera);
}

animate();