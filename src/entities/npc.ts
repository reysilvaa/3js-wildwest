import * as THREE from "three";
import { createModelObject, ModelObject } from "../core/models.js";
import { getGroundElevation } from "../environment/ground.js";

export interface NPCOptions {
  initialPos?: [number, number, number];
  buildingBoxes?: THREE.Box3[];
  camera?: THREE.Camera;
  walkSpeed?: number;
}

export interface NPCController {
  model: ModelObject | null;
  update: (dt: number) => void;
  getState: () => "IDLE" | "WALK" | "GREET" | "ACTIVITY";
  getCurrentActivity: () => string;
  teleport: (x: number, y: number, z: number) => void;
}

export function initNPC(
  scene: THREE.Scene,
  buildingBoxes: THREE.Box3[] = [],
  camera?: THREE.Camera,
  options: NPCOptions = {}
): NPCController {
  const {
    initialPos = [10.0, 0.0, -10.0],
    walkSpeed = 1.3,
  } = options;

  let model: ModelObject | null = null;
  let state: "IDLE" | "WALK" | "GREET" | "ACTIVITY" = "ACTIVITY";
  let stateTimer = 3.0;
  let currentActionName = "Idle";
  let activeAction: THREE.AnimationAction | null = null;
  let currentActivityIndex = 0;

  // Pre-initialize static fallback boxes for immediate collision safety
  const staticBoxes: THREE.Box3[] = [
    new THREE.Box3(new THREE.Vector3(5.93, -0.11, -35.86), new THREE.Vector3(15.16, 14.87, -20.97)),
    new THREE.Box3(new THREE.Vector3(14.5, -0.13, -13.82), new THREE.Vector3(26.55, 7.55, -4.59)),
    new THREE.Box3(new THREE.Vector3(-6.38, -0.13, 2.16), new THREE.Vector3(5.5, 7.17, 11.84)),
    new THREE.Box3(new THREE.Vector3(14.31, -0.11, -4.04), new THREE.Vector3(26.31, 7.08, 5.19)),
    new THREE.Box3(new THREE.Vector3(14.31, -0.11, 8.48), new THREE.Vector3(26.31, 7.08, 17.7)),
    new THREE.Box3(new THREE.Vector3(15.52, -0.13, -33.38), new THREE.Vector3(25.2, 7.17, -21.5)),
    new THREE.Box3(new THREE.Vector3(-6.5, -0.11, -21.07), new THREE.Vector3(5.5, 7.08, -11.84)),
    new THREE.Box3(new THREE.Vector3(-6.35, -0.13, -11.33), new THREE.Vector3(5.5, 6.37, -2.62)),
    new THREE.Box3(new THREE.Vector3(-3.32, -4.68, -46.92), new THREE.Vector3(3.39, 6.91, -39.95)),
    new THREE.Box3(new THREE.Vector3(-2.9, -0.21, -1.58), new THREE.Vector3(0.27, 8.84, 1.61)),
    new THREE.Box3(new THREE.Vector3(-3.93, -0.05, 11.33), new THREE.Vector3(-0.76, 2.77, 14.51)),
    new THREE.Box3(new THREE.Vector3(-0.4, -2.5, -26.95), new THREE.Vector3(7.39, 9.33, -19.16)),
    new THREE.Box3(new THREE.Vector3(-16, 0, 10.97), new THREE.Vector3(-14.64, 5.59, 21.12)),
    new THREE.Box3(new THREE.Vector3(5.14, 0.02, 2.14), new THREE.Vector3(6.38, 1.02, 3.13)),
    new THREE.Box3(new THREE.Vector3(2.86, 0.02, -3.19), new THREE.Vector3(4.11, 1.02, -2.11)),
    new THREE.Box3(new THREE.Vector3(0.58, -0.09, 10.96), new THREE.Vector3(2.43, 1.62, 12.02)),
    new THREE.Box3(new THREE.Vector3(5.89, -0.02, 8.62), new THREE.Vector3(6.66, 0.8, 9.4)),
    new THREE.Box3(new THREE.Vector3(5.45, -0.01, 2.96), new THREE.Vector3(6.66, 0.9, 5.32)),
    new THREE.Box3(new THREE.Vector3(5.09, -0.01, -14.91), new THREE.Vector3(6.31, 0.9, -12.56)),
    new THREE.Box3(new THREE.Vector3(2.79, 0, 11.09), new THREE.Vector3(3.06, 12.38, 14.32)),
    new THREE.Box3(new THREE.Vector3(2.85, 0, -0.38), new THREE.Vector3(3.13, 12.38, 2.85)),
    new THREE.Box3(new THREE.Vector3(2.85, 0, -2.99), new THREE.Vector3(3.13, 12.38, -0.17)),
    new THREE.Box3(new THREE.Vector3(0.11, 0, 14.04), new THREE.Vector3(3.02, 12.38, 15.93)),
    new THREE.Box3(new THREE.Vector3(-5.51, 0, 13.91), new THREE.Vector3(-2.66, 12.38, 15.9)),
    new THREE.Box3(new THREE.Vector3(-6.48, 0, 11.02), new THREE.Vector3(-5.21, 12.38, 14.17)),
    new THREE.Box3(new THREE.Vector3(-2.87, 0, 15.39), new THREE.Vector3(0.28, 1.31, 16.05))
  ];

  interface TownActivity {
    name: string;
    description: string;
    spot: THREE.Vector3;
    facingAngle: number;
    duration: number;
  }

  // 5 Autonomous Town Activities
  const activities: TownActivity[] = [
    {
      name: "TOWN_WELL",
      description: "Inspecting water supply and well pulley mechanism",
      spot: new THREE.Vector3(10.5, 0, -5.5),
      facingAngle: 0.0,
      duration: 8.0,
    },
    {
      name: "GENERAL_STORE",
      description: "Inspecting crates outside General Store",
      spot: new THREE.Vector3(10.0, 0, 9.5),
      facingAngle: Math.PI * 0.5,
      duration: 9.0,
    },
    {
      name: "CROSSROADS",
      description: "Surveying street intersection between Bank and Sheriff",
      spot: new THREE.Vector3(8.5, 0, 1.5),
      facingAngle: -Math.PI * 0.5,
      duration: 7.0,
    },
    {
      name: "SALOON_BOARDWALK",
      description: "Resting on Saloon porch listening to piano",
      spot: new THREE.Vector3(11.5, 0, -13.5),
      facingAngle: Math.PI * 0.5,
      duration: 10.0,
    },
    {
      name: "HOTEL_PLAZA",
      description: "Observing town panorama from Hotel front plaza",
      spot: new THREE.Vector3(9.5, 0, -21.0),
      facingAngle: -Math.PI * 0.75,
      duration: 8.5,
    },
  ];

  // Intermediate safe road corridor nodes
  const streetNodes: THREE.Vector3[] = [
    new THREE.Vector3(9.5, 0, -21.0),
    new THREE.Vector3(10.5, 0, -13.5),
    new THREE.Vector3(10.0, 0, -5.5),
    new THREE.Vector3(9.0, 0, 1.5),
    new THREE.Vector3(10.0, 0, 9.5),
  ];

  const currentPos = new THREE.Vector3(...initialPos);
  const targetRotation = new THREE.Quaternion();
  const dirVec = new THREE.Vector3();
  // SAFETY: activities array is non-empty constant defined above
  const currentTarget = activities[0]!.spot.clone();

  function checkCollision(pos: THREE.Vector3, radius = 0.45): boolean {
    const min = new THREE.Vector3(pos.x - radius, pos.y + 0.1, pos.z - radius);
    const max = new THREE.Vector3(pos.x + radius, pos.y + 1.8, pos.z + radius);
    const npcBox = new THREE.Box3(min, max);

    for (const b of buildingBoxes) {
      if (b.intersectsBox(npcBox)) return true;
    }
    for (const b of staticBoxes) {
      if (b.intersectsBox(npcBox)) return true;
    }
    return false;
  }

  function resolvePenetration(pos: THREE.Vector3, radius = 0.45): void {
    const allBoxes = buildingBoxes.length > 0 ? buildingBoxes : staticBoxes;
    for (const box of allBoxes) {
      if (
        pos.x + radius > box.min.x &&
        pos.x - radius < box.max.x &&
        pos.z + radius > box.min.z &&
        pos.z - radius < box.max.z
      ) {
        const overlapX1 = pos.x + radius - box.min.x;
        const overlapX2 = box.max.x - (pos.x - radius);
        const overlapZ1 = pos.z + radius - box.min.z;
        const overlapZ2 = box.max.z - (pos.z - radius);

        const minX = Math.min(overlapX1, overlapX2);
        const minZ = Math.min(overlapZ1, overlapZ2);

        if (minX < minZ) {
          if (overlapX1 < overlapX2) pos.x = box.min.x - radius - 0.05;
          else pos.x = box.max.x + radius + 0.05;
        } else {
          if (overlapZ1 < overlapZ2) pos.z = box.min.z - radius - 0.05;
          else pos.z = box.max.z + radius + 0.05;
        }
      }
    }
  }

  function fadeToAction(name: string, duration = 0.3) {
    if (!model || !model.mixer) return;
    if (currentActionName === name && activeAction) return;

    let clip = model.animations.get(name);
    if (!clip) {
      for (const [k, v] of model.animations.entries()) {
        if (k.toLowerCase() === name.toLowerCase()) {
          clip = v;
          break;
        }
      }
    }
    if (!clip) return;

    const newAction = model.mixer.clipAction(clip);
    newAction.reset();
    newAction.fadeIn(duration);
    newAction.play();

    if (activeAction && activeAction !== newAction) {
      activeAction.fadeOut(duration);
    }

    activeAction = newAction;
    currentActionName = name;
  }

  function advanceToNextActivity() {
    currentActivityIndex = (currentActivityIndex + 1) % activities.length;
    // SAFETY: Clamped by modulo operation
    const nextAct = activities[currentActivityIndex]!;
    currentTarget.copy(nextAct.spot);
    state = "WALK";
    fadeToAction("Walk", 0.35);
  }

  // Skinned Model Instance
  // Load 3D Skinned Model
  createModelObject(
    "npc_jokowi",
    {
      position: currentPos,
      scale: 1.0,
      castShadow: true,
      receiveShadow: true,
    },
    scene
  )
    .then((obj) => {
      model = obj;
      fadeToAction("Idle", 0.1);
    })
    .catch((err) => console.warn("Failed to load NPC:", err));

  function update(dt: number) {
    if (!model) return;
    model.update(dt);

    // -------------------------------------------------------------
    // 1. Social Player Awareness & State Transitions
    // -------------------------------------------------------------
    let playerNearby = false;
    if (camera) {
      const distToPlayer = camera.position.distanceTo(currentPos);
      if (distToPlayer < 5.5) {
        playerNearby = true;
      }
    }

    if (playerNearby && state !== "GREET") {
      state = "GREET";
      fadeToAction("Wave", 0.3);
      stateTimer = 5.0;
    }

    if (state === "GREET") {
      stateTimer -= dt;
      if (camera) {
        dirVec.copy(camera.position).sub(currentPos);
        dirVec.y = 0;
        if (dirVec.lengthSq() > 0.01) {
          dirVec.normalize();
          const targetAngle = Math.atan2(dirVec.x, dirVec.z);
          targetRotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
          model.root.quaternion.slerp(targetRotation, Math.min(1, 5 * dt));
        }
      }

      if (stateTimer <= 0 || !playerNearby) {
        state = "ACTIVITY";
        fadeToAction("Idle", 0.3);
        // SAFETY: Clamped by modulo operation
        const curAct = activities[currentActivityIndex]!;
        stateTimer = curAct.duration * 0.5;
      }
    } else if (state === "ACTIVITY" || state === "IDLE") {
      stateTimer -= dt;
      // SAFETY: Clamped by modulo operation
      const curAct = activities[currentActivityIndex]!;
      targetRotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), curAct.facingAngle);
      model.root.quaternion.slerp(targetRotation, Math.min(1, 4 * dt));

      if (stateTimer <= 0) {
        advanceToNextActivity();
      }
    } else if (state === "WALK") {
      dirVec.copy(currentTarget).sub(currentPos);
      dirVec.y = 0;
      const dist = dirVec.length();

      if (dist < 0.9) {
        // Arrived at activity spot!
        state = "ACTIVITY";
        fadeToAction("Idle", 0.35);
        // SAFETY: Clamped by modulo operation
        const curAct = activities[currentActivityIndex]!;
        stateTimer = curAct.duration;
      } else {
        dirVec.normalize();

        const moveAngle = Math.atan2(dirVec.x, dirVec.z);
        targetRotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), moveAngle);
        model.root.quaternion.slerp(targetRotation, Math.min(1, 6 * dt));

        // Building collision detection with wall sliding
        const stepDist = walkSpeed * dt;
        const step = dirVec.clone().multiplyScalar(stepDist);
        const nextPos = currentPos.clone().add(step);

        if (!checkCollision(nextPos, 0.45)) {
          currentPos.copy(nextPos);
        } else {
          const nextX = currentPos.clone().add(new THREE.Vector3(step.x, 0, 0));
          const nextZ = currentPos.clone().add(new THREE.Vector3(0, 0, step.z));

          if (!checkCollision(nextX, 0.45)) {
            currentPos.copy(nextX);
          } else if (!checkCollision(nextZ, 0.45)) {
            currentPos.copy(nextZ);
          } else {
            // Detour via closest street node
            // SAFETY: Default fallback ensures index 0 always defined
            let closestNode = streetNodes[0]!;
            let minDist = Infinity;
            for (const node of streetNodes) {
              const d = node.distanceTo(currentPos);
              if (d > 1.0 && d < minDist) {
                minDist = d;
                closestNode = node;
              }
            }
            currentTarget.copy(closestNode);
          }
        }
      }
    }

    // -------------------------------------------------------------
    // 2. Terrain Height & Collision Resolution for NPC Root
    // -------------------------------------------------------------
    const centerElev = getGroundElevation(currentPos.x, currentPos.z);
    currentPos.y = centerElev.height;
    resolvePenetration(currentPos, 0.45);
    model.root.position.copy(currentPos);
  }

  function teleport(x: number, y: number, z: number) {
    currentPos.set(x, y, z);
    if (model) model.root.position.copy(currentPos);
  }

  function getState() {
    return state;
  }

  function getCurrentActivity() {
    // SAFETY: Clamped by modulo operation
    return activities[currentActivityIndex]!.name;
  }

  return {
    get model() { return model; },
    update,
    getState,
    getCurrentActivity,
    teleport,
  };
}
