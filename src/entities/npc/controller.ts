import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createModelObject, type ModelObject } from "../../core/models.js";
import { assembleModularCharacter, getRandomModularConfig } from "./modular.js";
import { getGroundElevation } from "../../environment/terrain/height.js";
import { CollisionWorld, type ICollisionWorld, type SeparableEntity } from "../../core/collision.js";
import { NPCNavigator, type INPCNavigator } from "./navigator.js";
import type { AssetKey } from "../../environment/assets.js";

export type NPCState = "IDLE" | "WALK" | "GREET" | "ACTIVITY";

export interface TownActivity {
  name: string;
  description: string;
  spot: THREE.Vector3;
  facingAngle: number;
  duration: number;
}

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

export interface NPCController extends SeparableEntity {
  name: string;
  model: ModelObject | null;
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

export class NPC implements NPCController {
  public readonly id: string;
  public readonly name: string;
  public model: ModelObject | null = null;

  private state: NPCState = "ACTIVITY";
  private stateTimer = 3.0;
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

  private readonly navigator: INPCNavigator;
  private readonly collisionWorld: ICollisionWorld;
  private readonly options: NPCOptions;
  private readonly otherNPCsRef: () => NPCController[];

  constructor(
    options: NPCOptions,
    collisionWorld: ICollisionWorld = CollisionWorld.getInstance(),
    navigator: INPCNavigator = new NPCNavigator(),
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
    const dataUrl = this.options.dataUrl ?? "/models/npc_data.json";
    try {
      const res = await fetch(dataUrl);
      if (!res.ok) return;
      const data = await res.json();

      if (Array.isArray(data.streetNodes)) {
        const nodes = data.streetNodes.map((n: [number, number, number]) => new THREE.Vector3(...n));
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
          });
        }
        const initialIdx = Math.min(this.currentActivityIndex, this.activities.length - 1);
        this.currentActivityIndex = initialIdx;
        const curSpot = this.activities[initialIdx]?.spot;
        if (curSpot && !this.options.stationary) {
          this.navigator.planPath(this.currentPos, curSpot);
        }
      }
    } catch (err) {
      console.warn(`[NPC ${this.name}] Failed to load activities:`, err);
    }
  }

  public async loadModel(scene: THREE.Scene): Promise<ModelObject> {
    const scale = this.options.scale ?? 0.85;
    const randConfig = getRandomModularConfig();

    let headUrl = randConfig.headUrl;
    if (this.options.modularHead === "jokowi") {
      headUrl = "/models/npc/modular/heads/head_default.glb";
    } else if (this.options.modularHead === "arthur") {
      headUrl = "/models/npc/modular/heads/arthur_head.glb";
    } else if (this.options.modularHead === "cowboy") {
      headUrl = "/models/npc/modular/heads/cowboy_head.glb";
    } else if (this.options.modularHead === "outlaw") {
      headUrl = "/models/npc/modular/heads/outlaw_head.glb";
    }

    let outfitUrl = randConfig.outfitUrl;
    if (this.options.modularOutfit === "suit") {
      outfitUrl = "/models/npc/modular/outfits/outfit_suit.glb";
    } else if (this.options.modularOutfit === "arthur" || this.options.modularOutfit === "cowboy") {
      outfitUrl = "/models/npc/modular/outfits/outfit_arthur.glb";
    }

    let accessoryUrl = randConfig.accessoryUrl;
    let bandanaUrl = randConfig.bandanaUrl;
    if (this.options.modularAccessory === "cowboy_hat") {
      accessoryUrl = "/models/npc/modular/accessories/arthur_hat.glb";
    } else if (this.options.modularAccessory === "none") {
      accessoryUrl = "";
    }
    if (headUrl.includes("cowboy_head") || headUrl.includes("outlaw_head")) {
      accessoryUrl = "";
      bandanaUrl = "";
    }

    const finalColor = this.options.outfitColor ?? randConfig.outfitColor;

    const modelObj = (this.options.useModular ?? true) || !this.options.modelKey
      ? await assembleModularCharacter({
          headUrl,
          outfitUrl,
          bodyUrl: "/models/npc/modular/bodies/body_hands.glb",
          accessoryUrl,
          bandanaUrl,
          holsterUrl: randConfig.holsterUrl,
          bootsUrl: randConfig.bootsUrl,
          outfitColor: finalColor,
        }, {
          position: this.currentPos,
          scale,
          castShadow: true,
          receiveShadow: true,
        }, scene)
      : await createModelObject(
          this.options.modelKey!,
          { position: this.currentPos, scale, castShadow: true, receiveShadow: true },
          scene
        );

    this.model = modelObj;

    if (this.options.stationary) {
      modelObj.root.rotation.y = this.options.facingAngle ?? 0;
      return modelObj;
    }

    // Load walk animation
    const gltfLoader = new GLTFLoader();
    const walkUrl = this.options.walkAnimUrl ?? "/models/movement/walk.glb";
    try {
      const animGltf = await gltfLoader.loadAsync(walkUrl);
      if (animGltf.animations && animGltf.animations.length > 0) {
        const walkClip = animGltf.animations[0]!;
        walkClip.name = "Walk";
        walkClip.tracks = walkClip.tracks.filter((t) => {
          if (t.name.endsWith(".quaternion") || t.name.endsWith(".rotation")) return true;
          if (t.name.toLowerCase().includes("hips") && (t.name.endsWith(".position") || t.name.endsWith(".translation"))) return true;
          return false;
        });
        modelObj.animations.set("Walk", walkClip);
      }
    } catch (err) {
      console.warn(`[NPC ${this.name}] Failed to load walk animation:`, err);
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
        const dir = this.forcedFaceTarget.clone().sub(this.currentPos);
        dir.y = 0;
        if (dir.lengthSq() > 0.01) {
          const targetAngle = Math.atan2(dir.x, dir.z);
          this.targetRotation.setFromAxisAngle(this.yAxis, targetAngle);
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
        const dir = camera.position.clone().sub(this.currentPos);
        dir.y = 0;
        if (dir.lengthSq() > 0.01) {
          const targetAngle = Math.atan2(dir.x, dir.z);
          this.targetRotation.setFromAxisAngle(this.yAxis, targetAngle);
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
        const dir = camera.position.clone().sub(this.currentPos);
        dir.y = 0;
        if (dir.lengthSq() > 0.01) {
          const targetAngle = Math.atan2(dir.x, dir.z);
          this.targetRotation.setFromAxisAngle(this.yAxis, targetAngle);
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
        const step = steering.steerDir.clone().multiplyScalar(speed * dt);
        const nextPos = this.currentPos.clone().add(step);

        if (!this.collisionWorld.checkPointCollision(nextPos, 0.46)) {
          this.currentPos.copy(nextPos);
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

    const candidates: number[] = [];
    for (let i = 0; i < this.activities.length; i++) {
      if (i !== this.currentActivityIndex && !occupiedIndices.has(i)) {
        candidates.push(i);
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
