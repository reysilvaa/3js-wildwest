import * as THREE from "three";

export interface BubbleChatOptions {
  camera?: THREE.Camera;
  container?: HTMLElement;
  headOffsetY?: number;
  maxDistance?: number;
  minDistance?: number;
  fadeDistance?: number;
  bgImageUrl?: string;
  useProcedural?: boolean;
  raycastObjects?: THREE.Object3D[];
}

export interface ActiveBubble {
  id: string;
  target: THREE.Object3D | THREE.Vector3 | (() => THREE.Vector3);
  speaker: string;
  text: string;
  element: HTMLElement;
  duration: number; // in seconds
  elapsed: number;
  maxDistance: number;
  offsetY: number;
  bgImageUrl?: string;
  isProcedural: boolean;
}

export interface BubbleChatSystem {
  showBubble: (
    npcId: string,
    speaker: string,
    text: string,
    getWorldPosition: () => THREE.Vector3,
    duration?: number
  ) => void;
  update: (camera: THREE.Camera) => void;
  clear: () => void;
}

/**
 * BubbleChatManager - Red Dead Redemption 2 Style Western Speech Bubble System
 * Renders authentic vintage oil parchment ("kertas minyak") dialogue bubbles with distressed crimson borders.
 */
export class BubbleChatManager {
  private container: HTMLElement;
  private camera?: THREE.Camera;
  private headOffsetY: number;
  private maxDistance: number;
  private minDistance: number;
  private fadeDistance: number;
  private defaultBgImage: string;
  private defaultUseProcedural: boolean;
  private raycastObjects: THREE.Object3D[];
  private raycaster = new THREE.Raycaster();
  private occludeCheckTimer = 0;
  private occludedSet = new Set<string>();

  private activeBubbles = new Map<string, ActiveBubble>();
  private tempPos = new THREE.Vector3();
  private camForward = new THREE.Vector3();
  private rayDir = new THREE.Vector3();

  constructor(options: BubbleChatOptions = {}) {
    this.camera = options.camera;
    this.headOffsetY = options.headOffsetY ?? 1.45;
    this.maxDistance = options.maxDistance ?? 38.0;
    this.minDistance = options.minDistance ?? 1.5;
    this.fadeDistance = options.fadeDistance ?? 26.0;
    this.defaultBgImage = options.bgImageUrl ?? "/ui/bubble-frame.png";
    this.defaultUseProcedural = options.useProcedural ?? false;
    this.raycastObjects = options.raycastObjects ?? [];

    this.container = options.container ?? this.ensureContainer();
  }

  private ensureContainer(): HTMLElement {
    let el = document.getElementById("western-chat-overlay");
    if (!el) {
      el = document.createElement("div");
      el.id = "western-chat-overlay";
      el.className = "western-chat-overlay";
      document.body.appendChild(el);
    }
    return el;
  }

  /**
   * Display a speech bubble over a 3D target.
   * @param target Object3D, Vector3, or world position callback
   * @param speaker Character name (e.g. "Arthur")
   * @param text Dialogue text
   * @param duration Duration in ms or seconds (e.g. 5000 or 5.0)
   * @param bubbleId Optional unique identifier
   */
  public show(
    target: THREE.Object3D | THREE.Vector3 | (() => THREE.Vector3),
    speaker: string,
    text: string,
    duration = 5000,
    bubbleId?: string,
    options?: { bgImageUrl?: string; useProcedural?: boolean; offsetY?: number }
  ): string {
    const id = bubbleId ?? `bubble_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const durationSec = duration > 100 ? duration / 1000 : duration;
    const isProcedural = options?.useProcedural ?? this.defaultUseProcedural;
    const bgImage = options?.bgImageUrl ?? (isProcedural ? undefined : this.defaultBgImage);
    const offsetY = options?.offsetY ?? this.headOffsetY;

    this.hide(id);

    const bubbleEl = document.createElement("div");
    bubbleEl.style.opacity = "0";

    if (bgImage && !isProcedural) {
      bubbleEl.className = "western-bubble western-bubble-frame-mode";
      bubbleEl.style.backgroundImage = `url('${bgImage}')`;
      bubbleEl.innerHTML = `
        <div class="western-bubble-speaker">${speaker}</div>
        <div class="western-bubble-text">${text}</div>
      `;
    } else {
      bubbleEl.className = "western-bubble western-bubble-procedural-mode";
      bubbleEl.innerHTML = `
        <div class="western-bubble-parchment-oil">
          <div class="western-bubble-speaker">${speaker}</div>
          <div class="western-bubble-text">${text}</div>
          <div class="western-bubble-seam"></div>
          <svg class="western-tail-svg" viewBox="0 0 32 24">
            <polygon points="6,0 24,0 4,22" fill="#dfbe84" />
            <path d="M 6 0 L 4 22 L 24 0" fill="none" stroke="#7d1214" stroke-width="3.8" stroke-linejoin="round" stroke-linecap="round" />
          </svg>
        </div>
      `;
    }

    this.container.appendChild(bubbleEl);

    const activeItem: ActiveBubble = {
      id,
      target,
      speaker,
      text,
      element: bubbleEl,
      duration: durationSec,
      elapsed: 0,
      maxDistance: this.maxDistance,
      offsetY,
      bgImageUrl: bgImage,
      isProcedural,
    };

    this.activeBubbles.set(id, activeItem);
    return id;
  }

  /**
   * Hide and remove a specific bubble.
   */
  public hide(bubbleId: string): void {
    const existing = this.activeBubbles.get(bubbleId);
    if (existing) {
      if (existing.element.parentNode) {
        existing.element.parentNode.removeChild(existing.element);
      }
      this.activeBubbles.delete(bubbleId);
      this.occludedSet.delete(bubbleId);
    }
  }

  /**
   * Clear all active bubbles.
   */
  public clear(): void {
    for (const bubble of this.activeBubbles.values()) {
      if (bubble.element.parentNode) {
        bubble.element.parentNode.removeChild(bubble.element);
      }
    }
    this.activeBubbles.clear();
    this.occludedSet.clear();
  }

  public setHeadOffset(offsetY: number): void {
    this.headOffsetY = offsetY;
  }

  public setRaycastObjects(objects: THREE.Object3D[]): void {
    this.raycastObjects = objects;
  }

  public setBackgroundImage(url: string): void {
    this.defaultBgImage = url;
  }

  /**
   * Per-frame projection & culling update loop. Call in requestAnimationFrame.
   */
  public update(camera?: THREE.Camera, dt = 0.016): void {
    const cam = camera ?? this.camera;
    if (!cam || this.activeBubbles.size === 0) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    cam.getWorldDirection(this.camForward);

    // Throttled occlusion check every 0.2s for optimal performance
    this.occludeCheckTimer -= dt;
    const runOcclusion = this.occludeCheckTimer <= 0 && this.raycastObjects.length > 0;
    if (runOcclusion) this.occludeCheckTimer = 0.2;

    for (const [id, bubble] of this.activeBubbles.entries()) {
      bubble.elapsed += dt;

      if (bubble.elapsed >= bubble.duration) {
        this.hide(id);
        continue;
      }

      if (bubble.target instanceof THREE.Object3D) {
        bubble.target.getWorldPosition(this.tempPos);
      } else if (typeof bubble.target === "function") {
        this.tempPos.copy(bubble.target());
      } else {
        this.tempPos.copy(bubble.target);
      }

      this.tempPos.y += bubble.offsetY;

      const dist = this.tempPos.distanceTo(cam.position);
      if (dist > bubble.maxDistance || dist < this.minDistance) {
        bubble.element.style.display = "none";
        continue;
      }

      this.rayDir.subVectors(this.tempPos, cam.position);
      if (this.rayDir.dot(this.camForward) <= 0) {
        bubble.element.style.display = "none";
        continue;
      }

      if (runOcclusion) {
        const rayLen = this.rayDir.length();
        this.raycaster.set(cam.position, this.rayDir.normalize());
        const hits = this.raycaster.intersectObjects(this.raycastObjects, true);
        if (hits.length > 0 && hits[0]!.distance < rayLen - 0.6) {
          this.occludedSet.add(id);
        } else {
          this.occludedSet.delete(id);
        }
      }

      if (this.occludedSet.has(id)) {
        bubble.element.style.display = "none";
        continue;
      }

      this.tempPos.project(cam);

      if (
        this.tempPos.z > 1.0 ||
        this.tempPos.z < -1.0 ||
        Math.abs(this.tempPos.x) > 1.3 ||
        Math.abs(this.tempPos.y) > 1.3
      ) {
        bubble.element.style.display = "none";
        continue;
      }

      const screenX = (this.tempPos.x * 0.5 + 0.5) * width;
      const screenY = (-(this.tempPos.y * 0.5) + 0.5) * height;

      const scale = Math.max(0.68, Math.min(1.08, 1.15 - dist * 0.016));

      let opacity = 1.0;
      if (bubble.elapsed < 0.22) {
        opacity = bubble.elapsed / 0.22;
      } else if (bubble.duration - bubble.elapsed < 0.4) {
        opacity = Math.max(0, (bubble.duration - bubble.elapsed) / 0.4);
      }

      if (dist > this.fadeDistance) {
        const distFade = 1.0 - (dist - this.fadeDistance) / (bubble.maxDistance - this.fadeDistance);
        opacity *= Math.max(0, Math.min(1, distFade));
      }

      bubble.element.style.display = "block";
      bubble.element.style.opacity = opacity.toFixed(3);

      // Tail tip in bubble-frame.png is at 13.27% X, 99.3% Y
      if (bubble.bgImageUrl && !bubble.isProcedural) {
        bubble.element.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) translate(-13.27%, -99.3%) scale(${scale})`;
      } else {
        bubble.element.style.transform = `translate3d(${screenX - 22}px, ${screenY - 8}px, 0) translate(-10%, -100%) scale(${scale})`;
      }
    }
  }

  public destroy(): void {
    this.clear();
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}

/**
 * Backward-compatible factory function.
 * Returns an instance implementing both BubbleChatManager and legacy BubbleChatSystem.
 */
export function initBubbleChat(options: BubbleChatOptions = {}): BubbleChatManager & BubbleChatSystem {
  const manager = new BubbleChatManager(options);

  const wrapper = manager as BubbleChatManager & BubbleChatSystem;
  wrapper.showBubble = (
    npcId: string,
    speaker: string,
    text: string,
    getWorldPosition: () => THREE.Vector3,
    duration = 4.8
  ) => {
    manager.show(getWorldPosition, speaker, text, duration, npcId);
  };

  return wrapper;
}


