import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createModelObject, ModelObject } from "../../core/models.js";
import { assembleModularCharacter, getRandomModularConfig } from "./modular.js";
import { getGroundElevation } from "../../environment/terrain/height.js";
import type { AssetKey } from "../../environment/assets.js";

export * from "./modular.js";

export interface NPCOptions {
  name?: string;
  modelKey?: AssetKey;
  useModular?: boolean;
  modularHead?: "cowboy" | "outlaw" | "jokowi" | "arthur" | "random";
  modularOutfit?: "suit" | "cowboy" | "arthur" | "random";
  modularAccessory?: "cowboy_hat" | "arthur_hat" | "none" | "random";
  outfitColor?: number | THREE.Color;
  initialPos?: [number, number, number];
  buildingBoxes?: THREE.Box3[];
  camera?: THREE.Camera;
  walkSpeed?: number;
  dataUrl?: string;
  walkAnimUrl?: string;
  scale?: number;
  stationary?: boolean;
  facingAngle?: number;
  startActivityIndex?: number;
}

export interface NPCController {
  id: string;
  name: string;
  model: ModelObject | null;
  update: (dt: number) => void;
  getState: () => "IDLE" | "WALK" | "GREET" | "ACTIVITY";
  getCurrentActivity: () => string;
  getPosition: () => THREE.Vector3;
  teleport: (x: number, y: number, z: number) => void;
  faceTarget: (targetPos: THREE.Vector3, duration?: number) => void;
  pause: (duration: number) => void;
  isPaused: () => boolean;
}

export function initNPC(
  scene: THREE.Scene,
  buildingBoxes: THREE.Box3[] = [],
  camera?: THREE.Camera,
  options: NPCOptions = {}
): NPCController {
  const {
    name: _name = "Resident",
    modelKey,
    useModular = true,
    modularHead = "random",
    modularOutfit: _modularOutfit,
    modularAccessory = "random",
    outfitColor,
    initialPos = [10.0, 0.0, -10.0],
    walkSpeed = 1.15,
    dataUrl = "/models/npc_data.json",
    walkAnimUrl = "/models/movement/walk.glb",
    scale = 0.85,
    stationary = false,
    facingAngle = 0,
  } = options;

  const npcName = options.name ?? "Resident";
  const npcId = `npc_${Math.random().toString(36).slice(2, 9)}`;
  let pauseTimer = 0;
  let forcedFaceTarget: THREE.Vector3 | null = null;
  let faceTimer = 0;

  let model: ModelObject | null = null;
  let state: "IDLE" | "WALK" | "GREET" | "ACTIVITY" = "ACTIVITY";
  let stateTimer = 3.0;
  let currentActionName = "Idle";
  let activeAction: THREE.AnimationAction | null = null;
  let currentActivityIndex = options.startActivityIndex ?? 0;

  interface TownActivity {
    name: string;
    description: string;
    spot: THREE.Vector3;
    facingAngle: number;
    duration: number;
  }

  interface NPCDataConfig {
    streetNodes?: [number, number, number][];
    activities?: {
      name: string;
      description: string;
      spot: [number, number, number];
      facingAngle: number;
      duration: number;
    }[];
    staticBoxes?: { min: [number, number, number]; max: [number, number, number] }[];
  }

  // Fallback defaults for immediate sync safety
  const activities: TownActivity[] = [
    {
      name: "Saloon Porch",
      description: "Resting on the wooden boardwalk outside the Saloon",
      spot: new THREE.Vector3(13.2, 0.45, -7.5),
      facingAngle: -Math.PI / 2,
      duration: 8.0,
    },
  ];

  const streetNodes: THREE.Vector3[] = [
    new THREE.Vector3(10.0, 0, -5.5),
  ];

  const staticBoxes: THREE.Box3[] = [];

  // Load external NPC navigation, schedule, and collision data
  fetch(dataUrl)
    .then((res) => (res.ok ? res.json() : {}))
    .then((data: NPCDataConfig) => {
      if (data.streetNodes && data.streetNodes.length > 0) {
        streetNodes.length = 0;
        for (const n of data.streetNodes) {
          streetNodes.push(new THREE.Vector3(...n));
        }
      }
      if (data.activities && data.activities.length > 0) {
        activities.length = 0;
        for (const a of data.activities) {
          activities.push({
            name: a.name,
            description: a.description,
            spot: new THREE.Vector3(...a.spot),
            facingAngle: a.facingAngle,
            duration: a.duration,
          });
        }
        const initialIdx = Math.min(currentActivityIndex, activities.length - 1);
        currentActivityIndex = initialIdx;
        if (currentTarget) {
          currentTarget.copy(activities[initialIdx]!.spot);
          planPathTo(currentTarget);
        }
      }
      if (data.staticBoxes && data.staticBoxes.length > 0) {
        staticBoxes.length = 0;
        for (const b of data.staticBoxes) {
          staticBoxes.push(
            new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max))
          );
        }
      }
    })
    .catch((err) => console.warn("Failed to load NPC data:", err));

  const currentPos = new THREE.Vector3(...initialPos);
  const targetRotation = new THREE.Quaternion();
  const dirVec = new THREE.Vector3();
  // SAFETY: activities array is non-empty constant defined above
  const currentTarget = activities[0]!.spot.clone();
  const pathQueue: THREE.Vector3[] = [];
  const lastPos = currentPos.clone();
  let stuckTimer = 0;
  const yAxis = new THREE.Vector3(0, 1, 0);

  function planPathTo(destination: THREE.Vector3) {
    pathQueue.length = 0;
    if (streetNodes.length === 0) {
      pathQueue.push(destination.clone());
      return;
    }

    let startNodeIdx = 0;
    let minStartDist = Infinity;
    for (let i = 0; i < streetNodes.length; i++) {
      // SAFETY: Index is within streetNodes length
      const node = streetNodes[i]!;
      const d = currentPos.distanceTo(node);
      if (d < minStartDist) {
        minStartDist = d;
        startNodeIdx = i;
      }
    }

    let endNodeIdx = 0;
    let minEndDist = Infinity;
    for (let i = 0; i < streetNodes.length; i++) {
      // SAFETY: Index is within streetNodes length
      const node = streetNodes[i]!;
      const d = destination.distanceTo(node);
      if (d < minEndDist) {
        minEndDist = d;
        endNodeIdx = i;
      }
    }

    if (minStartDist > 1.2) {
      // SAFETY: startNodeIdx is valid index
      pathQueue.push(streetNodes[startNodeIdx]!.clone());
    }

    if (startNodeIdx !== endNodeIdx) {
      const step = startNodeIdx < endNodeIdx ? 1 : -1;
      for (let i = startNodeIdx + step; ; i += step) {
        // SAFETY: Loop bounded by endNodeIdx
        pathQueue.push(streetNodes[i]!.clone());
        if (i === endNodeIdx) break;
      }
    }

    pathQueue.push(destination.clone());
  }

  function checkCollision(pos: THREE.Vector3, radius = 0.46): boolean {
    const min = new THREE.Vector3(pos.x - radius, pos.y + 0.1, pos.z - radius);
    const max = new THREE.Vector3(pos.x + radius, pos.y + 1.55, pos.z + radius);
    const npcBox = new THREE.Box3(min, max);

    for (const b of buildingBoxes) {
      if (b.intersectsBox(npcBox)) return true;
    }
    for (const b of staticBoxes) {
      if (b.intersectsBox(npcBox)) return true;
    }
    return false;
  }

  function resolvePenetration(pos: THREE.Vector3, radius = 0.46): void {
    const applyBoxes = (boxes: THREE.Box3[]) => {
      for (const box of boxes) {
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
            if (overlapX1 < overlapX2) pos.x = box.min.x - radius - 0.08;
            else pos.x = box.max.x + radius + 0.08;
          } else {
            if (overlapZ1 < overlapZ2) pos.z = box.min.z - radius - 0.08;
            else pos.z = box.max.z + radius + 0.08;
          }
        }
      }
    };
    applyBoxes(buildingBoxes);
    applyBoxes(staticBoxes);
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
    planPathTo(currentTarget);
    stuckTimer = 0;
    state = "WALK";
    fadeToAction("Walk", 0.35);
  }

  const gltfLoader = new GLTFLoader();

  // Skinned Model Instance
  // Load 3D Skinned Model (Human scale 0.85 to fit modular buildings & doorframes)
  const randConfig = getRandomModularConfig();
  let headUrl = randConfig.headUrl;
  if (modularHead === "jokowi") {
    headUrl = "/models/npc/modular/heads/head_default.glb";
  } else if (modularHead === "arthur") {
    headUrl = "/models/npc/modular/heads/arthur_head.glb";
  } else if (modularHead === "cowboy") {
    headUrl = "/models/npc/modular/heads/cowboy_head.glb";
  } else if (modularHead === "outlaw") {
    headUrl = "/models/npc/modular/heads/outlaw_head.glb";
  }

  let accessoryUrl = randConfig.accessoryUrl;
  let bandanaUrl = randConfig.bandanaUrl;
  if (modularAccessory === "cowboy_hat") {
    accessoryUrl = "/models/npc/modular/accessories/arthur_hat.glb";
  } else if (modularAccessory === "none") {
    accessoryUrl = "";
  }
  // Heads that already include modeled accessories (hat & neck scarf) never get accessory overlays
  if (headUrl.includes("cowboy_head") || headUrl.includes("outlaw_head")) {
    accessoryUrl = "";
    bandanaUrl = "";
  }

  const finalColor = outfitColor ?? randConfig.outfitColor;

  const modelPromise: Promise<ModelObject> = (useModular || !modelKey)
    ? assembleModularCharacter({
        headUrl,
        outfitUrl: randConfig.outfitUrl,
        bodyUrl: "/models/npc/modular/bodies/body_hands.glb",
        accessoryUrl,
        bandanaUrl,
        holsterUrl: randConfig.holsterUrl,
        bootsUrl: randConfig.bootsUrl,
        outfitColor: finalColor,
      }, {
        position: currentPos,
        scale,
        castShadow: true,
        receiveShadow: true,
      }, scene)
    : createModelObject(
        modelKey,
        {
          position: currentPos,
          scale,
          castShadow: true,
          receiveShadow: true,
        },
        scene
      );

  modelPromise
    .then(async (obj: ModelObject) => {
      model = obj;

      if (stationary) {
        obj.root.rotation.y = facingAngle;
        return;
      }

      // Load external walk animation from /models/movement/walk.glb (exported from walk.blend)
      try {
        const animGltf = await gltfLoader.loadAsync(walkAnimUrl);
        if (animGltf.animations && animGltf.animations.length > 0) {
          const walkClip = animGltf.animations[0]!;
          walkClip.name = "Walk";
          // Retain joint rotations and root hips translation; avoid child bone stretching
          walkClip.tracks = walkClip.tracks.filter((t) => {
            if (t.name.endsWith(".quaternion") || t.name.endsWith(".rotation")) return true;
            if (t.name.toLowerCase().includes("hips") && (t.name.endsWith(".position") || t.name.endsWith(".translation"))) return true;
            return false;
          });
          obj.animations.set("Walk", walkClip);
          if (state === "WALK") {
            fadeToAction("Walk", 0.2);
          }
        }
      } catch (err) {
        console.warn("Failed to load external walk animation:", err);
      }

      // Only fade to Idle if a clip is available — Walk clip is used as the base animation.
      // If animations Map is empty (walk load failed), skip to avoid stuck A-pose with no clip.
      if (obj.animations.size > 0) {
        fadeToAction("Walk", 0.1);
      }
    })
    .catch((err: unknown) => console.warn("Failed to load NPC:", err));

  function update(dt: number) {
    if (!model) return;
    model.update(dt);

    if (pauseTimer > 0) {
      pauseTimer -= dt;
      if (faceTimer > 0 && forcedFaceTarget) {
        faceTimer -= dt;
        dirVec.copy(forcedFaceTarget).sub(currentPos);
        dirVec.y = 0;
        if (dirVec.lengthSq() > 0.01) {
          dirVec.normalize();
          const targetAngle = Math.atan2(dirVec.x, dirVec.z);
          targetRotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
          model.root.quaternion.slerp(targetRotation, Math.min(1, 6 * dt));
        }
      }
      fadeToAction("Idle", 0.25);
      const centerElev = getGroundElevation(currentPos.x, currentPos.z);
      currentPos.y = centerElev.height;
      resolvePenetration(currentPos, 0.46);
      model.root.position.copy(currentPos);
      return;
    }

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

    if (stationary) {
      if (playerNearby && camera) {
        dirVec.copy(camera.position).sub(currentPos);
        dirVec.y = 0;
        if (dirVec.lengthSq() > 0.01) {
          dirVec.normalize();
          const targetAngle = Math.atan2(dirVec.x, dirVec.z);
          targetRotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
          model.root.quaternion.slerp(targetRotation, Math.min(1, 5 * dt));
        }
      } else {
        targetRotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), facingAngle);
        model.root.quaternion.slerp(targetRotation, Math.min(1, 3 * dt));
      }
      return;
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
      // SAFETY: Array fallback ensures non-empty target
      const activeWaypoint = pathQueue.length > 0 ? pathQueue[0]! : currentTarget;
      dirVec.copy(activeWaypoint).sub(currentPos);
      dirVec.y = 0;
      const dist = dirVec.length();

      const isFinalDestination = pathQueue.length <= 1;
      const arrivalThreshold = isFinalDestination ? 0.9 : 0.8;

      if (dist < arrivalThreshold) {
        if (pathQueue.length > 0) {
          pathQueue.shift();
        }
        if (pathQueue.length === 0) {
          // Arrived at activity spot!
          state = "ACTIVITY";
          fadeToAction("Idle", 0.35);
          stuckTimer = 0;
          // SAFETY: Clamped by modulo operation
          const curAct = activities[currentActivityIndex]!;
          stateTimer = curAct.duration;
        }
      } else {
        dirVec.normalize();

        // Lookahead collision avoidance: probe 0.95m in front
        let steerDir = dirVec.clone();
        const lookaheadDist = 0.95;
        const probeFront = currentPos.clone().add(steerDir.clone().multiplyScalar(lookaheadDist));

        if (checkCollision(probeFront, 0.46)) {
          // Probe left & right whisker angles to steer clear of walls
          const angles = [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2];
          for (const angle of angles) {
            const candidate = dirVec.clone().applyAxisAngle(yAxis, angle);
            const probeCandidate = currentPos.clone().add(candidate.clone().multiplyScalar(lookaheadDist));
            if (!checkCollision(probeCandidate, 0.46)) {
              steerDir = candidate;
              break;
            }
          }
        }

        const moveAngle = Math.atan2(steerDir.x, steerDir.z);
        targetRotation.setFromAxisAngle(yAxis, moveAngle);
        model.root.quaternion.slerp(targetRotation, Math.min(1, 6 * dt));

        // Advance position with wall sliding fallback
        const stepDist = walkSpeed * dt;
        const step = steerDir.clone().multiplyScalar(stepDist);
        const nextPos = currentPos.clone().add(step);

        if (!checkCollision(nextPos, 0.46)) {
          currentPos.copy(nextPos);
        } else {
          const nextX = currentPos.clone().add(new THREE.Vector3(step.x, 0, 0));
          const nextZ = currentPos.clone().add(new THREE.Vector3(0, 0, step.z));
          if (!checkCollision(nextX, 0.46)) {
            currentPos.copy(nextX);
          } else if (!checkCollision(nextZ, 0.46)) {
            currentPos.copy(nextZ);
          }
        }

        // Stuck detection & animation state synchronization
        const movedDist = currentPos.distanceTo(lastPos);
        lastPos.copy(currentPos);

        if (movedDist < 0.003) {
          stuckTimer += dt;
          if (stuckTimer > 0.25) {
            fadeToAction("Idle", 0.2);
          }
          if (stuckTimer > 0.8) {
            // Unstick: pop blocked intermediate node or replan
            if (pathQueue.length > 1) {
              pathQueue.shift();
            } else {
              planPathTo(currentTarget);
            }
            stuckTimer = 0;
          }
        } else {
          stuckTimer = 0;
          if (currentActionName !== "Walk") {
            fadeToAction("Walk", 0.2);
          }
        }
      }
    }

    // -------------------------------------------------------------
    // 2. Terrain Height & Collision Resolution for NPC Root
    // -------------------------------------------------------------
    const centerElev = getGroundElevation(currentPos.x, currentPos.z);
    currentPos.y = centerElev.height;
    resolvePenetration(currentPos, 0.46);
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

  function getPosition() {
    return currentPos;
  }

  function faceTarget(targetPos: THREE.Vector3, duration = 6.0) {
    forcedFaceTarget = targetPos.clone();
    faceTimer = duration;
  }

  function pause(duration: number) {
    pauseTimer = Math.max(pauseTimer, duration);
  }

  function isPaused() {
    return pauseTimer > 0;
  }

  return {
    id: npcId,
    name: npcName,
    get model() { return model; },
    update,
    getState,
    getCurrentActivity,
    getPosition,
    teleport,
    faceTarget,
    pause,
    isPaused,
  };
}
