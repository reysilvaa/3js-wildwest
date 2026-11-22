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
    container.className = "absolute inset-0 pointer-events-none overflow-hidden z-30";
    document.body.appendChild(container);
  }

  // Inject custom parchment speech bubble tail & corner styles that supplement Tailwind
  const styleId = "npc-chat-parchment-styles";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .parchment-bubble {
        background-color: #eeddb7;
        background-image: 
          radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.45) 0%, transparent 80%),
          linear-gradient(165deg, #fef8eb 0%, #ecd8a5 55%, #d5b577 100%);
      }
      .parchment-tail::after {
        content: '';
        position: absolute;
        bottom: -11px;
        left: 50%;
        transform: translateX(-50%);
        border-width: 11px 9px 0 9px;
        border-style: solid;
        border-color: #4e280f transparent transparent transparent;
        display: block;
        width: 0;
        z-index: 10;
      }
      .parchment-tail::before {
        content: '';
        position: absolute;
        bottom: -8px;
        left: 50%;
        transform: translateX(-50%);
        border-width: 9px 7px 0 7px;
        border-style: solid;
        border-color: #ecd8a5 transparent transparent transparent;
        display: block;
        width: 0;
        z-index: 11;
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
    duration = 4.8
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
    // Tailwind classes matching the authentic aged Western parchment reference image
    bubbleEl.className =
      "parchment-bubble parchment-tail absolute max-w-[240px] min-w-[140px] p-2.5 rounded-xl border-2 border-[#4e280f] shadow-bubble text-[#2a1306] pointer-events-none -translate-x-1/2 -translate-y-full opacity-0 scale-90 transition-all duration-300 ease-out z-40";

    bubbleEl.innerHTML = `
      <div class="relative p-0.5 border border-[#cba043]/60 rounded-lg">
        <div class="flex items-center justify-between border-b border-[#4e280f]/25 pb-1 mb-1">
          <span class="text-[9px] text-[#cba043]">★</span>
          <span class="font-western text-[10px] uppercase tracking-widest text-[#663511] font-bold">${speaker}</span>
          <span class="text-[9px] text-[#cba043]">★</span>
        </div>
        <div class="font-parchment text-[13px] leading-snug font-semibold text-[#251206] px-1 py-0.5 italic drop-shadow-[0_1px_0_rgba(255,255,255,0.7)] text-center">
          "${text}"
        </div>
      </div>
    `;
    container.appendChild(bubbleEl);

    // Smooth entrance pop-in
    requestAnimationFrame(() => {
      bubbleEl.classList.remove("opacity-0", "scale-90");
      bubbleEl.classList.add("opacity-100", "scale-100");
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
      bubble.timer -= 0.016;

      // Smooth fade-out in last 0.35s
      if (bubble.timer <= 0.35) {
        bubble.element.classList.remove("opacity-100", "scale-100");
        bubble.element.classList.add("opacity-0", "scale-95");
      }

      if (bubble.timer <= 0) {
        if (bubble.element.parentNode) {
          bubble.element.parentNode.removeChild(bubble.element);
        }
        activeBubbles.delete(npcId);
        continue;
      }

      // Calculate 3D position above head (height offset ~1.72m)
      const worldPos = bubble.getWorldPosition();
      projVec.copy(worldPos);
      projVec.y += 1.72;

      const dist = projVec.distanceTo(camera.position);

      // Distance culling: hide if beyond 32 meters
      if (dist > 32.0) {
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

      // Distance scaling: 1.0 at 5m, 0.75 at 25m
      const scale = Math.max(0.72, Math.min(1.08, 1.15 - dist * 0.018));

      bubble.element.style.display = "block";
      bubble.element.style.left = `${screenX}px`;
      bubble.element.style.top = `${screenY - 14}px`;
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
