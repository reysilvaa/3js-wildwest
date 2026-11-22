import type { NPCController } from "./npc.js";
import type { BubbleChatSystem } from "../../ui/bubble-chat.js";
import { requestAIDialogue } from "../../services/ai-dialogue.js";

export interface ConversationManager {
  update: (dt: number) => void;
  triggerPairConversation: (npcA: NPCController, npcB: NPCController) => Promise<void>;
}

interface ActiveDialogue {
  npcA: NPCController;
  npcB: NPCController;
  step: "A_SPEAKING" | "B_SPEAKING" | "FINISHED";
  stepTimer: number;
  lineA: string;
}

export function initConversationManager(
  npcs: NPCController[],
  bubbleChat: BubbleChatSystem
): ConversationManager {
  let activeDialogue: ActiveDialogue | null = null;
  let checkTimer = 3.0;
  const pairCooldowns: Map<string, number> = new Map();
  let soloAmbientTimer = 12.0;

  function getPairKey(a: NPCController, b: NPCController): string {
    return [a.id, b.id].sort().join("<->");
  }

  async function triggerPairConversation(npcA: NPCController, npcB: NPCController) {
    if (activeDialogue) return;

    const pairKey = getPairKey(npcA, npcB);
    pairCooldowns.set(pairKey, 30.0);

    npcA.faceTarget(npcB.getPosition(), 10.0);
    npcB.faceTarget(npcA.getPosition(), 10.0);

    npcA.pause(9.5);
    npcB.pause(9.5);

    const location = npcA.getCurrentActivity() || "Town Street";

    const lineA = await requestAIDialogue({
      speaker: npcA.name,
      listener: npcB.name,
      location,
    });

    bubbleChat.showBubble(npcA.id, npcA.name, lineA, () => npcA.getPosition(), 4.2);

    activeDialogue = {
      npcA,
      npcB,
      step: "A_SPEAKING",
      stepTimer: 4.4,
      lineA,
    };
  }

  async function triggerSoloAmbient(npc: NPCController) {
    if (activeDialogue || npc.isPaused()) return;

    const location = npc.getCurrentActivity() || "Wild West";
    const line = await requestAIDialogue({
      speaker: npc.name,
      location,
    });

    bubbleChat.showBubble(npc.id, npc.name, line, () => npc.getPosition(), 4.0);
  }

  function update(dt: number) {
    for (const [key, cd] of pairCooldowns.entries()) {
      const nextCd = cd - dt;
      if (nextCd <= 0) pairCooldowns.delete(key);
      else pairCooldowns.set(key, nextCd);
    }

    if (activeDialogue) {
      activeDialogue.stepTimer -= dt;

      if (activeDialogue.step === "A_SPEAKING" && activeDialogue.stepTimer <= 0) {
        const { npcA, npcB, lineA } = activeDialogue;
        activeDialogue.step = "B_SPEAKING";
        activeDialogue.stepTimer = 4.4;

        const location = npcB.getCurrentActivity() || "Town Street";
        requestAIDialogue({
          speaker: npcB.name,
          listener: npcA.name,
          location,
          previousLine: lineA,
        }).then((lineB) => {
          bubbleChat.showBubble(npcB.id, npcB.name, lineB, () => npcB.getPosition(), 4.2);
        });
      } else if (activeDialogue.step === "B_SPEAKING" && activeDialogue.stepTimer <= 0) {
        activeDialogue = null;
      }
    }

    checkTimer -= dt;
    if (checkTimer <= 0 && !activeDialogue) {
      checkTimer = 2.5;

      for (let i = 0; i < npcs.length; i++) {
        for (let j = i + 1; j < npcs.length; j++) {
          const a = npcs[i]!;
          const b = npcs[j]!;

          const dist = a.getPosition().distanceTo(b.getPosition());
          if (dist < 3.8) {
            const pairKey = getPairKey(a, b);
            if (!pairCooldowns.has(pairKey)) {
              triggerPairConversation(a, b);
              return;
            }
          }
        }
      }
    }

    soloAmbientTimer -= dt;
    if (soloAmbientTimer <= 0 && !activeDialogue) {
      soloAmbientTimer = 18.0 + Math.random() * 12.0;
      const eligible = npcs.filter((n) => n.getState() === "ACTIVITY" && !n.isPaused());
      if (eligible.length > 0) {
        const picked = eligible[Math.floor(Math.random() * eligible.length)]!;
        triggerSoloAmbient(picked);
      }
    }
  }

  return {
    update,
    triggerPairConversation,
  };
}
