import * as THREE from "three";
import { initScene } from "./core/scene.js";
import { loadWorld } from "./environment/world.js";
import { initDesertGround, getGroundElevation } from "./environment/ground.js";
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
const speed = 15; // base units per second

// Comprehensive keyboard state tracking (WASD, Arrows, QE elevation, Shift sprint)
const activeKeys = new Set<string>();

window.addEventListener("keydown", (e) => {
  activeKeys.add(e.code);
  activeKeys.add(e.key.toLowerCase());
});

window.addEventListener("keyup", (e) => {
  activeKeys.delete(e.code);
  activeKeys.delete(e.key.toLowerCase());
});

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  // Smooth WASD camera movement synchronized with OrbitControls
  const isSprinting = activeKeys.has("ShiftLeft") || activeKeys.has("ShiftRight");
  const moveSpeed = (isSprinting ? speed * 2.2 : speed) * dt;

  const moveDir = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  right.crossVectors(forward, camera.up).normalize();

  if (activeKeys.has("KeyW") || activeKeys.has("w") || activeKeys.has("ArrowUp")) moveDir.add(forward);
  if (activeKeys.has("KeyS") || activeKeys.has("s") || activeKeys.has("ArrowDown")) moveDir.sub(forward);
  if (activeKeys.has("KeyD") || activeKeys.has("d") || activeKeys.has("ArrowRight")) moveDir.add(right);
  if (activeKeys.has("KeyA") || activeKeys.has("a") || activeKeys.has("ArrowLeft")) moveDir.sub(right);
  if (activeKeys.has("KeyE") || activeKeys.has("e") || activeKeys.has("Space")) moveDir.y += 1;
  if (activeKeys.has("KeyQ") || activeKeys.has("q")) moveDir.y -= 1;

  if (moveDir.lengthSq() > 0) {
    moveDir.normalize().multiplyScalar(moveSpeed);
    camera.position.add(moveDir);
    controls.target.add(moveDir); // Shift orbit focal target in lockstep with camera
  }

  // Prevent camera from clipping underneath sand dunes
  const minGroundY = getGroundElevation(camera.position.x, camera.position.z).height + 1.2;
  if (camera.position.y < minGroundY) {
    const diff = minGroundY - camera.position.y;
    camera.position.y = minGroundY;
    controls.target.y += diff;
  }

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