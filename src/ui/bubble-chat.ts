import * as THREE from "three";

export interface ActiveBubble {
  id: string;
  npcId: string;
  speaker: string;
  text: string;
  getWorldPosition: () => THREE.Vector3;
  element: HTMLElement;
  timer: number;
  duration: number;
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

export function initBubbleChat(): BubbleChatSystem {
  let container = document.getElementById("npc-chat-bubbles");
  if (!container) {
    container = document.createElement("div");
    container.id = "npc-chat-bubbles";
    container.style.position = "absolute";
    container.style.top = "0";
    container.style.left = "0";
    container.style.width = "100%";
    container.style.height = "100%";
    container.style.pointerEvents = "none";
    container.style.overflow = "hidden";
    container.style.zIndex = "40";
    document.body.appendChild(container);
  }

  // Inject vintage Western speech bubble styles
  const styleId = "npc-chat-bubbles-style";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .npc-speech-bubble {
        position: absolute;
        max-width: 210px;
        background: linear-gradient(135deg, #fdf9ee 0%, #faeccb 100%);
        border: 2px solid #4a2f19;
        border-radius: 10px;
        padding: 7px 12px;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.8);
        font-family: 'Georgia', 'Palatino', serif;
        color: #2b1708;
        pointer-events: none;
        transform: translate(-50%, -100%);
        transition: opacity 0.25s ease, transform 0.25s ease;
        opacity: 0;
        z-index: 50;
      }
      .npc-speech-bubble.visible {
        opacity: 1;
        transform: translate(-50%, -100%) scale(1);
      }
      .npc-speech-bubble::after {
        content: '';
        position: absolute;
        bottom: -9px;
        left: 50%;
        transform: translateX(-50%);
        border-width: 9px 8px 0 8px;
        border-style: solid;
        border-color: #4a2f19 transparent transparent transparent;
        display: block;
        width: 0;
      }
      .npc-speech-bubble::before {
        content: '';
        position: absolute;
        bottom: -6px;
        left: 50%;
        transform: translateX(-50%);
        border-width: 7px 6px 0 6px;
        border-style: solid;
        border-color: #faeccb transparent transparent transparent;
        display: block;
        width: 0;
        z-index: 1;
      }
      .npc-speech-name {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        color: #7d4416;
        margin-bottom: 2px;
        border-bottom: 1px dotted rgba(74, 47, 25, 0.3);
        padding-bottom: 2px;
      }
      .npc-speech-text {
        font-size: 12.5px;
        line-height: 1.35;
        font-weight: 500;
        text-shadow: 0 1px 0 rgba(255, 255, 255, 0.5);
      }
    `;
    document.head.appendChild(style);
  }

  const activeBubbles: Map<string, ActiveBubble> = new Map();
  const projVec = new THREE.Vector3();

  function showBubble(
    npcId: string,
    speaker: string,
    text: string,
    getWorldPosition: () => THREE.Vector3,
    duration = 4.5
  ) {
    if (!container) return;

    // Remove existing bubble for this NPC if any
    const existing = activeBubbles.get(npcId);
    if (existing) {
      if (existing.element.parentNode) {
        existing.element.parentNode.removeChild(existing.element);
      }
      activeBubbles.delete(npcId);
    }

    const bubbleEl = document.createElement("div");
    bubbleEl.className = "npc-speech-bubble";
    bubbleEl.innerHTML = `
      <div class="npc-speech-name">${speaker}</div>
      <div class="npc-speech-text">${text}</div>
    `;
    container.appendChild(bubbleEl);

    // Trigger enter transition
    requestAnimationFrame(() => {
      bubbleEl.classList.add("visible");
    });

    activeBubbles.set(npcId, {
      id: `${npcId}_${Date.now()}`,
      npcId,
      speaker,
      text,
      getWorldPosition,
      element: bubbleEl,
      timer: duration,
      duration,
    });
  }

  function update(camera: THREE.Camera) {
    const width = window.innerWidth;
    const height = window.innerHeight;

    for (const [npcId, bubble] of activeBubbles.entries()) {
      bubble.timer -= 0.016; // Average frame step

      if (bubble.timer <= 0.3) {
        bubble.element.classList.remove("visible");
      }

      if (bubble.timer <= 0) {
        if (bubble.element.parentNode) {
          bubble.element.parentNode.removeChild(bubble.element);
        }
        activeBubbles.delete(npcId);
        continue;
      }

      // Calculate 3D position above head (height offset ~1.68m)
      const worldPos = bubble.getWorldPosition();
      projVec.copy(worldPos);
      projVec.y += 1.65;

      const dist = projVec.distanceTo(camera.position);

      // Distance culling: hide if beyond 30 meters
      if (dist > 30.0) {
        bubble.element.style.display = "none";
        continue;
      }

      projVec.project(camera);

      // Check if behind camera
      if (projVec.z > 1.0 || projVec.z < -1.0) {
        bubble.element.style.display = "none";
        continue;
      }

      // Screen coordinates
      const screenX = (projVec.x * 0.5 + 0.5) * width;
      const screenY = (-(projVec.y * 0.5) + 0.5) * height;

      // Scale gently with distance (1.0 at 5m, 0.72 at 25m)
      const scale = Math.max(0.68, Math.min(1.08, 1.15 - dist * 0.018));

      bubble.element.style.display = "block";
      bubble.element.style.left = `${screenX}px`;
      bubble.element.style.top = `${screenY - 12}px`;
      bubble.element.style.transform = `translate(-50%, -100%) scale(${scale})`;
    }
  }

  function clear() {
    for (const bubble of activeBubbles.values()) {
      if (bubble.element.parentNode) {
        bubble.element.parentNode.removeChild(bubble.element);
      }
    }
    activeBubbles.clear();
  }

  return {
    showBubble,
    update,
    clear,
  };
}
