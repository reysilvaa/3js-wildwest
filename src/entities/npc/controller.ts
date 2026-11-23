import * as THREE from "three";
import { assembleModularCharacter, getRandomHatUrl, getRandomModularConfig, type NPCModel } from "./modular.js";
import { getGroundHeightOnly } from "../../environment/terrain/height.js";
import { CollisionWorld, type SeparableEntity } from "../../core/collision.js";
import { NPCNavigator } from "./navigator.js";
import { getModelsManifest, loadGLTF } from "../../environment/assets.js";
import { triggerBuildingDoor, type InteractiveBuilding } from "../../environment/world/town.js";

export type NPCState = "IDLE" | "WALK" | "GREET" | "ACTIVITY" | "ENTERING" | "INDOORS" | "EXITING";

export type NPCZone = "center" | "south" | "west" | "east";

export interface TownActivity {
  name: string;
  description: string;
  spot: THREE.Vector3;
  facingAngle: number;
  duration: number;
  zone?: NPCZone;
}

export interface NPCOptions {
  name?: string;
  modelUrl?: string;
  modelIndex?: number;
  homeZone?: NPCZone;
  modularAccessory?: "cowboy_hat" | "none" | "random";
  outfitColor?: number | THREE.Color;
  initialPos?: [number, number, number];
  buildingBoxes?: THREE.Box3[];
  camera?: THREE.Camera;
  walkSpeed?: number;
  dataUrl?: string;
  walkAnimUrl?: string;
  idleAnimUrl?: string;
  scale?: number;
  stationary?: boolean;
  facingAngle?: number;
  startActivityIndex?: number;
  getBuildings?: () => readonly InteractiveBuilding[];
}

export interface NPCController extends SeparableEntity {
  name: string;
  model: NPCModel | null;
  update: (dt: number) => void;
  getState: () => NPCState;
  getCurrentActivity: () => string;
  getCurrentActivityIndex?: () => number;
  getPosition: () => THREE.Vector3;
  teleport: (x: number, y: number, z: number) => void;
  faceTarget: (targetPos: THREE.Vector3, duration?: number) => void;
  pause: (duration: number) => void;
  isPaused: () => boolean;
}

let sharedAnimCachePromise: Promise<Map<string, THREE.AnimationClip>> | null = null;

function filterTracks(clip: THREE.AnimationClip): THREE.AnimationClip {
  const cloned = clip.clone();
  cloned.tracks = cloned.tracks.filter((t) => {
    const lower = t.name.toLowerCase();
    // Filter out hand, finger & twist tracks to keep Arthur's hands in natural relaxed pose
    if (
      lower.includes("hand") ||
      lower.includes("thumb") ||
      lower.includes("index") ||
      lower.includes("middle") ||
      lower.includes("ring") ||
      lower.includes("pinky") ||
      lower.includes("forearm1") ||
      lower.includes("forearm2") ||
      lower.includes(".001") ||
      lower.includes(".002") ||
      lower.includes(".003")
    ) {
      return false;
    }
    if (t.name.endsWith(".quaternion") || t.name.endsWith(".rotation")) return true;
    if (lower.includes("hips") && (t.name.endsWith(".position") || t.name.endsWith(".translation"))) return true;
    return false;
  });
  return cloned;
}

interface NPCDataPayload {
  streetNodes?: [number, number, number][];
  activities?: { name: string; description: string; spot: [number, number, number]; facingAngle: number; duration: number; zone?: NPCZone }[];
}

const npcDataCache = new Map<string, Promise<NPCDataPayload | null>>();

function loadNPCData(url: string): Promise<NPCDataPayload | null> {
  let promise = npcDataCache.get(url);
  if (!promise) {
    promise = fetch(url)
      .then((res) => (res.ok ? (res.json() as Promise<NPCDataPayload>) : null))
      .catch((err) => {
        console.warn("[NPC] Failed to load npc_data:", err);
        return null;
      });
    npcDataCache.set(url, promise);
  }
  return promise;
}

async function getSharedNPCAnimations(
  walkUrl?: string,
  idleUrl?: string
): Promise<Map<string, THREE.AnimationClip>> {
  if (sharedAnimCachePromise) return sharedAnimCachePromise;

  sharedAnimCachePromise = (async () => {
    const { animations } = await getModelsManifest();
    const resolvedIdle = idleUrl ?? animations.idle;
    const resolvedWalk = walkUrl ?? animations.walk;
    const map = new Map<string, THREE.AnimationClip>();
    const [idleGltf, walkGltf] = await Promise.all([
      resolvedIdle
        ? loadGLTF(resolvedIdle).catch((err) => {
            console.warn("[NPC] Failed to load idle animation:", err);
            return null;
          })
        : Promise.resolve(null),
      resolvedWalk
        ? loadGLTF(resolvedWalk).catch((err) => {
            console.warn("[NPC] Failed to load walk animation:", err);
            return null;
          })
        : Promise.resolve(null),
    ]);

    if (idleGltf?.animations) {
      for (const a of idleGltf.animations) {
        if (a.name === "Idle" || a.name === "Wave") {
          map.set(a.name, filterTracks(a));
        }
      }
    }

    if (walkGltf?.animations && walkGltf.animations.length > 0) {
      const walkClip = walkGltf.animations[0]!;
      walkClip.name = "Walk";
      map.set("Walk", filterTracks(walkClip));
    }

    return map;
  })();

  return sharedAnimCachePromise;
}

export class NPC implements NPCController {
  public readonly id: string;
  public readonly name: string;
  public model: NPCModel | null = null;

  private state: NPCState = "ACTIVITY";
  private stateTimer = 0.6 + Math.random() * 4.5;
  private stuckTimer = 0;
  private readonly lastProgressPos = new THREE.Vector3();
  private pauseTimer = 0;
  private faceTimer = 0;
  private forcedFaceTarget: THREE.Vector3 | null = null;
  private targetBuilding: InteractiveBuilding | null = null;
  private portraitUrl = "/models/npc/portraits/npc_001.png";
  private baseScale = 0.85;

  private currentActivityIndex: number;
  private readonly activities: TownActivity[] = [];
  private currentActionName = "Idle";
  private activeAction: THREE.AnimationAction | null = null;

  private readonly currentPos: THREE.Vector3;
  private readonly targetRotation = new THREE.Quaternion();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private readonly _tmpDir = new THREE.Vector3();
  private readonly _tmpNext = new THREE.Vector3();

  private readonly navigator: NPCNavigator;
  private readonly collisionWorld: CollisionWorld;
  private readonly options: NPCOptions;
  private readonly otherNPCsRef: () => NPCController[];

  constructor(
    options: NPCOptions,
    collisionWorld: CollisionWorld = CollisionWorld.getInstance(),
    navigator: NPCNavigator = new NPCNavigator(),
    otherNPCsRef: () => NPCController[] = () => []
  ) {
    this.options = options;
    this.id = `npc_${Math.random().toString(36).slice(2, 9)}`;
    this.name = options.name ?? "Resident";
    this.currentPos = new THREE.Vector3(...(options.initialPos ?? [10.0, 0.0, -10.0]));
    this.currentActivityIndex = options.startActivityIndex ?? 0;
    this.collisionWorld = collisionWorld;
    this.navigator = navigator;
    this.otherNPCsRef = otherNPCsRef;

    this.initActivitiesAndNodes();
  }

  private async initActivitiesAndNodes(): Promise<void> {
    const data = await loadNPCData(this.options.dataUrl ?? "/models/npc_data.json");
    if (!data) return;

    if (Array.isArray(data.streetNodes)) {
      const nodes = data.streetNodes.map((n) => new THREE.Vector3(...n));
      this.navigator.setStreetNodes(nodes);
    }

    if (Array.isArray(data.activities) && data.activities.length > 0) {
      this.activities.length = 0;
      for (const a of data.activities) {
        this.activities.push({
          name: a.name,
          description: a.description,
          spot: new THREE.Vector3(...a.spot),
          facingAngle: a.facingAngle,
          duration: a.duration,
          zone: a.zone,
        });
      }
      const initialIdx = Math.min(this.currentActivityIndex, this.activities.length - 1);
      this.currentActivityIndex = initialIdx;
      const curSpot = this.activities[initialIdx]?.spot;
      if (curSpot && !this.options.stationary) {
        this.navigator.planPath(this.currentPos, curSpot);
      }
    }
  }

  public async loadModel(scene: THREE.Scene): Promise<NPCModel> {
    const scale = this.options.scale ?? 0.85;
    this.baseScale = scale;
    const randConfig = await getRandomModularConfig(this.options.modelIndex);

    let accessoryUrl = randConfig.accessoryUrl;
    if (this.options.modularAccessory === "cowboy_hat") {
      accessoryUrl = await getRandomHatUrl();
    } else if (this.options.modularAccessory === "none") {
      accessoryUrl = "";
    }

    const finalColor = this.options.outfitColor ?? randConfig.outfitColor;
    const resolvedModelUrl = this.options.modelUrl ?? randConfig.modelUrl;
    this.portraitUrl = resolvedModelUrl
      .replace("/characters/", "/portraits/")
      .replace(/\.glb$/i, ".png");

    const modelObj = await assembleModularCharacter(
      {
        modelUrl: resolvedModelUrl,
        accessoryUrl,
        holsterUrl: randConfig.holsterUrl,
        outfitColor: finalColor,
        pantsColor: randConfig.pantsColor,
        bootsColor: randConfig.bootsColor,
        hatColor: randConfig.hatColor,
        holsterColor: randConfig.holsterColor,
      },
      {
        position: this.currentPos,
        scale,
        castShadow: true,
        receiveShadow: true,
      },
      scene
    );

    this.model = modelObj;

    try {
      const animMap = await getSharedNPCAnimations(this.options.walkAnimUrl, this.options.idleAnimUrl);
      for (const [name, clip] of animMap) {
        modelObj.animations.set(name, clip);
      }
    } catch (err) {
      console.warn(`[NPC ${this.name}] Failed to load animations:`, err);
    }

    if (this.options.stationary) {
      modelObj.root.rotation.y = this.options.facingAngle ?? 0;
      this.fadeToAction("Idle", 0.2);
      return modelObj;
    }

    this.fadeToAction("Idle", 0.2);
    return modelObj;
  }

  public fadeToAction(name: string, duration = 0.3): void {
    if (!this.model || !this.model.mixer) return;
    if (this.currentActionName === name && this.activeAction && this.activeAction.isRunning()) return;

    const clip = this.model.animations.get(name);
    if (!clip) return;

    const prevAction = this.activeAction;
    const nextAction = this.model.mixer.clipAction(clip);

    nextAction.reset();
    nextAction.enabled = true;
    nextAction.setEffectiveTimeScale(1);
    nextAction.setEffectiveWeight(1);

    if (name === "Wave") {
      nextAction.setLoop(THREE.LoopOnce, 1);
      nextAction.clampWhenFinished = true;
    } else {
      nextAction.setLoop(THREE.LoopRepeat, Infinity);
    }

    if (prevAction) {
      nextAction.crossFadeFrom(prevAction, duration, true);
    }
    nextAction.play();

    this.currentActionName = name;
    this.activeAction = nextAction;
  }

  public update(dt: number): void {
    if (!this.model) return;

    if (this.state === "INDOORS") {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0 && this.targetBuilding) {
        const b = this.targetBuilding;
        triggerBuildingDoor(b, 2.4);
        const idx = b.occupants.findIndex((o) => o.id === this.id);
        if (idx >= 0) b.occupants.splice(idx, 1);
        this.currentPos.set(b.doorPos.x, b.entryPos.y, b.doorPos.z);
        this.model.root.position.copy(this.currentPos);
        this.model.root.scale.setScalar(this.baseScale);
        this._tmpDir.subVectors(b.entryPos, this.currentPos);
        this._tmpDir.y = 0;
        if (this._tmpDir.lengthSq() > 0.001) {
          this.targetRotation.setFromAxisAngle(this.yAxis, Math.atan2(this._tmpDir.x, this._tmpDir.z));
          this.model.root.quaternion.copy(this.targetRotation);
        }
        this.model.root.visible = true;
        this.state = "EXITING";
        this.stateTimer = 1.1; // Step ~1.2m onto porch, then hand over to 16-ray Virtual Eyes
        this.fadeToAction("Walk", 0.15);
      }
      return;
    }

    this.model.update(dt);

    if ((this.state === "ENTERING" || this.state === "EXITING") && this.targetBuilding) {
      this.stateTimer -= dt;
      const b = this.targetBuilding;
      const goal = this.state === "ENTERING" ? b.doorPos : b.entryPos;
      this._tmpDir.set(goal.x - this.currentPos.x, 0, goal.z - this.currentPos.z);
      const dist = this._tmpDir.length();
      const speed = this.options.walkSpeed ?? 1.15;

      if (dist > 0.05) {
        this._tmpDir.divideScalar(dist);
        this.targetRotation.setFromAxisAngle(this.yAxis, Math.atan2(this._tmpDir.x, this._tmpDir.z));
        this.model.root.quaternion.slerp(this.targetRotation, Math.min(1, 8 * dt));
        const step = Math.min(dist, speed * dt);
        this.currentPos.x += this._tmpDir.x * step;
        this.currentPos.z += this._tmpDir.z * step;
      }
      const baseY = getGroundHeightOnly(this.currentPos.x, this.currentPos.z);
      const targetY = this.collisionWorld.getSurfaceHeight(this.currentPos.x, this.currentPos.z, baseY);
      this.currentPos.y += (targetY - this.currentPos.y) * Math.min(1, 14 * dt);
      this.model.root.position.copy(this.currentPos);
      this.fadeToAction("Walk", 0.15);

      if (dist < 0.35 || this.stateTimer <= 0) {
        if (this.state === "ENTERING") {
          this.model.root.visible = false;
          if (!b.occupants.some((o) => o.id === this.id)) {
            b.occupants.push({ id: this.id, name: this.name, portraitUrl: this.portraitUrl });
          }
          this.state = "INDOORS";
          this.stateTimer = 8.0 + Math.random() * 10.0;
        } else {
          this.targetBuilding = null;
          this.advanceToNextActivity();
        }
      }
      return;
    }

    if (this.pauseTimer > 0) {
      this.pauseTimer -= dt;
      if (this.faceTimer > 0 && this.forcedFaceTarget) {
        this.faceTimer -= dt;
        this._tmpDir.subVectors(this.forcedFaceTarget, this.currentPos);
        this._tmpDir.y = 0;
        if (this._tmpDir.lengthSq() > 0.01) {
          this.targetRotation.setFromAxisAngle(this.yAxis, Math.atan2(this._tmpDir.x, this._tmpDir.z));
          this.model.root.quaternion.slerp(this.targetRotation, Math.min(1, 6 * dt));
        }
      }
      this.fadeToAction("Idle", 0.25);
      this.syncPosition(dt);
      return;
    }

    const camera = this.options.camera;
    const playerNearby = camera ? camera.position.distanceToSquared(this.currentPos) < 30.25 : false;

    if (this.options.stationary) {
      if (playerNearby && camera) {
        this._tmpDir.subVectors(camera.position, this.currentPos);
        this._tmpDir.y = 0;
        if (this._tmpDir.lengthSq() > 0.01) {
          this.targetRotation.setFromAxisAngle(this.yAxis, Math.atan2(this._tmpDir.x, this._tmpDir.z));
          this.model.root.quaternion.slerp(this.targetRotation, Math.min(1, 5 * dt));
        }
      }
      return;
    }

    if (playerNearby && this.state !== "GREET") {
      this.state = "GREET";
      this.fadeToAction("Wave", 0.3);
      this.stateTimer = 4.5;
    }

    if (this.state === "GREET") {
      this.stateTimer -= dt;
      if (camera) {
        this._tmpDir.subVectors(camera.position, this.currentPos);
        this._tmpDir.y = 0;
        if (this._tmpDir.lengthSq() > 0.01) {
          this.targetRotation.setFromAxisAngle(this.yAxis, Math.atan2(this._tmpDir.x, this._tmpDir.z));
          this.model.root.quaternion.slerp(this.targetRotation, Math.min(1, 5 * dt));
        }
      }
      if (this.stateTimer <= 0 || !playerNearby) {
        this.state = "ACTIVITY";
        this.fadeToAction("Idle", 0.3);
        const curAct = this.activities[this.currentActivityIndex];
        this.stateTimer = curAct ? curAct.duration * 0.5 : 4.0;
      }
    } else if (this.state === "ACTIVITY" || this.state === "IDLE") {
      this.stateTimer -= dt;
      const curAct = this.activities[this.currentActivityIndex];
      if (curAct) {
        this.targetRotation.setFromAxisAngle(this.yAxis, curAct.facingAngle);
        this.model.root.quaternion.slerp(this.targetRotation, Math.min(1, 4 * dt));
      }
      if (this.stateTimer <= 0) {
        this.advanceToNextActivity();
      }
    } else if (this.state === "WALK") {
      const steering = this.navigator.computeSteering(
        this.currentPos,
        dt,
        this.otherNPCsRef(),
        this.id,
        this.collisionWorld
      );

      if (steering.isArrived) {
        if (this.targetBuilding) {
          triggerBuildingDoor(this.targetBuilding, 2.6);
          this.state = "ENTERING";
          this.stateTimer = 2.6;
          this.fadeToAction("Walk", 0.15);
          return;
        }
        this.state = "ACTIVITY";
        this.fadeToAction("Idle", 0.35);
        const curAct = this.activities[this.currentActivityIndex];
        this.stateTimer = curAct ? curAct.duration : 6.0;
      } else {
        const moveAngle = Math.atan2(steering.steerDir.x, steering.steerDir.z);
        this.targetRotation.setFromAxisAngle(this.yAxis, moveAngle);
        this.model.root.quaternion.slerp(this.targetRotation, Math.min(1, 6 * dt));

        const speed = this.options.walkSpeed ?? 1.15;
        this._tmpNext.copy(this.currentPos).addScaledVector(steering.steerDir, speed * dt);

        if (!this.collisionWorld.checkPointCollision(this._tmpNext, 0.46)) {
          this.currentPos.copy(this._tmpNext);
          this.fadeToAction("Walk", 0.2);
        } else {
          this.fadeToAction("Idle", 0.2);
          if (steering.isBlocked) {
            this.stuckTimer = 0;
            this.advanceToNextActivity();
          }
        }

        // True displacement stuck detector (catches wall-pushback walking in place)
        this.stuckTimer += dt;
        if (this.stuckTimer >= 1.1) {
          const moved = this.currentPos.distanceTo(this.lastProgressPos);
          this.lastProgressPos.copy(this.currentPos);
          this.stuckTimer = 0;
          if (moved < 0.30) {
            this.advanceToNextActivity();
          }
        }
      }
    }

    this.syncPosition(dt);
  }

  private advanceToNextActivity(): void {
    const buildings = this.options.getBuildings?.();
    if (buildings && buildings.length > 0 && Math.random() < 0.38) {
      const available = buildings.filter((b) => b.occupants.length < 4);
      const nearby = available.filter((b) => b.entryPos.distanceTo(this.currentPos) < 42);
      const pool = nearby.length > 0 ? nearby : available;
      if (pool.length > 0) {
        const chosen = pool[Math.floor(Math.random() * pool.length)]!;
        this.targetBuilding = chosen;
        this.navigator.planPath(this.currentPos, chosen.entryPos);
        this.state = "WALK";
        this.fadeToAction("Walk", 0.35);
        return;
      }
    }
    this.targetBuilding = null;

    if (this.activities.length === 0) return;

    const occupiedIndices = new Set<number>();
    const others = this.otherNPCsRef();
    for (let i = 0; i < others.length; i++) {
      const other = others[i]!;
      if (other.id === this.id) continue;
      const oPos = other.getPosition();
      for (let k = 0; k < this.activities.length; k++) {
        if (this.activities[k]!.spot.distanceTo(oPos) < 2.4) {
          occupiedIndices.add(k);
        }
      }
      if (typeof other.getCurrentActivityIndex === "function") {
        occupiedIndices.add(other.getCurrentActivityIndex());
      }
    }

    const homeZone = this.options.homeZone;
    const preferHome = homeZone !== undefined && Math.random() < 0.72;
    const candidates: number[] = [];
    for (let i = 0; i < this.activities.length; i++) {
      if (i === this.currentActivityIndex || occupiedIndices.has(i)) continue;
      if (!preferHome || this.activities[i]!.zone === homeZone) {
        candidates.push(i);
      }
    }
    if (candidates.length === 0) {
      for (let i = 0; i < this.activities.length; i++) {
        if (i !== this.currentActivityIndex && !occupiedIndices.has(i)) candidates.push(i);
      }
    }
    if (candidates.length === 0) {
      for (let i = 0; i < this.activities.length; i++) {
        if (i !== this.currentActivityIndex) candidates.push(i);
      }
    }

    const nextIdx = candidates[Math.floor(Math.random() * candidates.length)] ?? 0;
    this.currentActivityIndex = nextIdx;

    const act = this.activities[nextIdx]!;
    this.navigator.planPath(this.currentPos, act.spot);
    this.state = "WALK";
    this.fadeToAction("Walk", 0.35);
  }

  private syncPosition(dt = 0.016): void {
    const baseY = getGroundHeightOnly(this.currentPos.x, this.currentPos.z);
    const targetY = this.collisionWorld.getSurfaceHeight(this.currentPos.x, this.currentPos.z, baseY);
    this.currentPos.y += (targetY - this.currentPos.y) * Math.min(1, 14 * dt);
    if (this.state === "WALK") {
      this.collisionWorld.resolvePenetration(this.currentPos, 0.46);
    }
    if (this.model) {
      this.model.root.position.copy(this.currentPos);
    }
  }

  public getState(): NPCState {
    return this.state;
  }

  public getCurrentActivity(): string {
    return this.activities[this.currentActivityIndex]?.name ?? "Town Street";
  }

  public getCurrentActivityIndex(): number {
    return this.currentActivityIndex;
  }

  public getPosition(): THREE.Vector3 {
    return this.currentPos;
  }

  public teleport(x: number, y: number, z: number): void {
    this.currentPos.set(x, y, z);
    if (this.model) this.model.root.position.copy(this.currentPos);
  }

  public faceTarget(targetPos: THREE.Vector3, duration = 6.0): void {
    this.forcedFaceTarget = targetPos.clone();
    this.faceTimer = duration;
  }

  public pause(duration: number): void {
    this.pauseTimer = Math.max(this.pauseTimer, duration);
  }

  public isPaused(): boolean {
    return this.pauseTimer > 0 || this.state === "INDOORS" || this.state === "ENTERING" || this.state === "EXITING";
  }
}
