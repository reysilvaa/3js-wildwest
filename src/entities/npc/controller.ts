import * as THREE from "three";
import { assembleModularCharacter, getRandomHatUrl, getRandomModularConfig, type NPCModel } from "./modular.js";
import { getGroundElevation } from "../../environment/terrain/height.js";
import { CollisionWorld, type SeparableEntity } from "../../core/collision.js";
import { NPCNavigator } from "./navigator.js";
import { getModelsManifest, loadGLTF } from "../../environment/assets.js";

export type NPCState = "IDLE" | "WALK" | "GREET" | "ACTIVITY";

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
  private pauseTimer = 0;
  private faceTimer = 0;
  private forcedFaceTarget: THREE.Vector3 | null = null;

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
    const randConfig = await getRandomModularConfig(this.options.modelIndex);

    let accessoryUrl = randConfig.accessoryUrl;
    if (this.options.modularAccessory === "cowboy_hat") {
      accessoryUrl = await getRandomHatUrl();
    } else if (this.options.modularAccessory === "none") {
      accessoryUrl = "";
    }

    const finalColor = this.options.outfitColor ?? randConfig.outfitColor;
    const resolvedModelUrl = this.options.modelUrl ?? randConfig.modelUrl;

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
        modelObj.animations.set(name, clip.clone());
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
    this.model.update(dt);

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
      this.syncPosition();
      return;
    }

    const camera = this.options.camera;
    const playerNearby = camera ? camera.position.distanceTo(this.currentPos) < 5.5 : false;

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
            this.advanceToNextActivity();
          }
        }
      }
    }

    this.syncPosition();
  }

  private advanceToNextActivity(): void {
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

  private syncPosition(): void {
    const centerElev = getGroundElevation(this.currentPos.x, this.currentPos.z);
    this.currentPos.y = centerElev.height;
    this.collisionWorld.resolvePenetration(this.currentPos, 0.46);
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
    return this.pauseTimer > 0;
  }
}
