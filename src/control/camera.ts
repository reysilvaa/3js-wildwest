import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { isPressed } from "./keyboard.js";
import { getGroundHeightOnly } from "../environment/terrain/height.js";

export interface CameraControllerOptions {
  speed?: number;
  sprintMultiplier?: number;
  minHeightOffset?: number;
}

export interface CameraController {
  update: (dt: number) => void;
}

export function initCameraController(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  options: CameraControllerOptions = {}
): CameraController {
  const {
    speed = 12,
    sprintMultiplier = 2.2,
    minHeightOffset = 1.2,
  } = options;

  const moveDir = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  function update(dt: number): void {
    const isSprinting = isPressed("ShiftLeft", "ShiftRight");
    const moveSpeed = (isSprinting ? speed * sprintMultiplier : speed) * dt;

    moveDir.set(0, 0, 0);
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, camera.up).normalize();

    if (isPressed("KeyW", "w", "ArrowUp")) moveDir.add(forward);
    if (isPressed("KeyS", "s", "ArrowDown")) moveDir.sub(forward);
    if (isPressed("KeyD", "d", "ArrowRight")) moveDir.add(right);
    if (isPressed("KeyA", "a", "ArrowLeft")) moveDir.sub(right);
    if (isPressed("KeyE", "e", "Space")) moveDir.y += 1;
    if (isPressed("KeyQ", "q")) moveDir.y -= 1;

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize().multiplyScalar(moveSpeed);
      camera.position.add(moveDir);
      controls.target.add(moveDir);
    }

    // Clamp camera altitude above terrain dunes
    const minGroundY = getGroundHeightOnly(camera.position.x, camera.position.z) + minHeightOffset;
    if (camera.position.y < minGroundY) {
      const diff = minGroundY - camera.position.y;
      camera.position.y = minGroundY;
      controls.target.y += diff;
    }
  }

  let streetView = false;
  Object.assign(window, {
    __toggleCameraView: () => {
      streetView = !streetView;
      camera.position.set(10.0, streetView ? 1.8 : 11.5, streetView ? 5.0 : 30.0);
      controls.target.set(streetView ? 10.0 : 9.5, streetView ? 1.6 : 4.5, streetView ? -10.0 : -16.0);
    },
  });

  return { update };
}
