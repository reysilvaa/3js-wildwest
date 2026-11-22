/**
 * AI Frontier Dialogue Service
 * Calls LLM endpoint at https://bansos.dudul.dev/v1/chat/completions
 * with automatic fallback to authentic 19th century Western frontier autonomy dialogue.
 */

const API_URL = import.meta.env.VITE_AI_API_URL || "https://bansos.dudul.dev/v1/chat/completions";
const API_KEY = import.meta.env.VITE_AI_API_KEY || "";
const PRIMARY_MODEL = "deepseek-v4.1-flash-free";
const REQUEST_TIMEOUT_MS = 3800;

export interface DialogueRequest {
  speaker: string;
  listener?: string;
  location?: string;
  previousLine?: string;
}

// Fallback bank of authentic frontier dialogue pairs and ambient lines
const FALLBACK_CONVERSATIONS: Record<string, string[]> = {
  greetings_start: [
    "Howdy partner, dry wind blowing off the ridge today.",
    "Good to see you on your feet, friend.",
    "Dust never settles in this town, does it?",
    "Keep your wits sharp, friend. Strange folks around.",
    "Morning. Train brought in a fresh batch of rumors.",
    "Sun's already high enough to bake a biscuit.",
    "Reckon we'll see any rain before sunset?",
  ],
  greetings_reply: [
    "Reckon so. Rain ain't coming till harvest time.",
    "Just another day dodging rattlesnakes and trouble.",
    "Aye, but at least the saloon whiskey stays cold.",
    "Sheriff's got his eyes peeled, so tread light.",
    "Always rumors in these hills, partner. Few hold water.",
    "Could be worse—could be caught out in the canyon.",
    "Ain't no rest for the wicked out here.",
  ],
  saloon_start: [
    "Pour me something strong before the law comes looking.",
    "Bartender says cards have been running cold all night.",
    "A shot of rye is the only honest thing left in town.",
  ],
  saloon_reply: [
    "Liquor won't fix your debts, partner, but drink up.",
    "Gamblers out front took two greenhorns for all they had.",
    "Careful what you drink—water's cleaner than the rye.",
  ],
  sheriff_start: [
    "Sheriff's got his hand on his revolver today.",
    "Hear that whistle? Bounty hunters rode in from the south.",
    "Town's quiet... quiet as a graveyard before a storm.",
  ],
  sheriff_reply: [
    "Let 'em ride. As long as they don't draw here.",
    "Bounty hunters only mean trouble for everybody.",
    "Quiet suits me fine. I'm too old for shootouts.",
  ],
  bank_start: [
    "Vault wagon rolled in under heavy guard this morning.",
    "Banker looks nervous every time the wind slams the shutter.",
  ],
  bank_reply: [
    "With all that gold inside, I'd sleep with a shotgun too.",
    "Let him sweat. Money breeds misery out west.",
  ],
  solo_ambient: [
    "Sure could use a canteen of fresh spring water...",
    "Reckon I oughta check the horses before dusk...",
    "Nothing like the desert breeze to clear a man's head.",
    "Hope that tumbleweed ain't the only traveler today.",
    "Quiet day on the frontier. The way it oughta be.",
    "Boot leather's wearing thin... need a cobbler soon.",
  ],
};

function getRandomItem(list: readonly string[]): string {
  const index = Math.floor(Math.random() * list.length);
  return list[index] ?? list[0] ?? "";
}

/**
 * Generates autonomous fallback dialogue without calling the network.
 */
export function getFallbackDialogue(request: DialogueRequest): string {
  const { location = "", previousLine } = request;
  const locLower = location.toLowerCase();

  if (previousLine) {
    if (locLower.includes("saloon")) return getRandomItem(FALLBACK_CONVERSATIONS["saloon_reply"]!);
    if (locLower.includes("sheriff")) return getRandomItem(FALLBACK_CONVERSATIONS["sheriff_reply"]!);
    if (locLower.includes("bank")) return getRandomItem(FALLBACK_CONVERSATIONS["bank_reply"]!);
    return getRandomItem(FALLBACK_CONVERSATIONS["greetings_reply"]!);
  }

  if (locLower.includes("saloon")) return getRandomItem(FALLBACK_CONVERSATIONS["saloon_start"]!);
  if (locLower.includes("sheriff")) return getRandomItem(FALLBACK_CONVERSATIONS["sheriff_start"]!);
  if (locLower.includes("bank")) return getRandomItem(FALLBACK_CONVERSATIONS["bank_start"]!);
  if (!request.listener) return getRandomItem(FALLBACK_CONVERSATIONS["solo_ambient"]!);
  return getRandomItem(FALLBACK_CONVERSATIONS["greetings_start"]!);
}

/**
 * Calls the AI endpoint to generate contextual dialogue for NPCs.
 * Gracefully falls back to hardcoded autonomy dialogue on timeout, error, or network drop.
 */
export async function requestAIDialogue(request: DialogueRequest): Promise<string> {
  const { speaker, listener, location = "Frontier Town", previousLine } = request;

  let prompt = "";
  if (listener && previousLine) {
    prompt = `You are ${speaker}, a resident in a 19th-century Wild West town (1885). ${listener} just said to you: "${previousLine}". Reply in ONE short, natural sentence (max 10 words) in authentic frontier dialect. Do not use quotes, emojis, or stage directions.`;
  } else if (listener) {
    prompt = `You are ${speaker}, a resident in a 19th-century Wild West town (1885). You meet ${listener} near the ${location}. Say ONE short opening line (max 10 words) in authentic frontier cowboy dialect. Do not use quotes, emojis, or stage directions.`;
  } else {
    prompt = `You are ${speaker}, resting near the ${location} in an 1885 frontier town. Speak ONE short ambient thought or mutter (max 8 words) to yourself. Do not use quotes, emojis, or stage directions.`;
  }

  const payload = {
    model: PRIMARY_MODEL,
    messages: [
      {
        role: "system",
        content: "You are an NPC dialogue writer for a gritty 1885 Western frontier video game. Keep responses under 10 words, rugged, period-accurate, strictly plain text with zero quotes or emojis.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    max_tokens: 35,
    temperature: 0.8,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[AI Dialogue] API returned ${res.status}. Falling back to autonomy.`);
      return getFallbackDialogue(request);
    }

    interface ChatCompletionResponse {
      choices?: {
        message?: {
          content?: string;
        };
      }[];
    }

    // SAFETY: Response is parsed from OpenAI-compatible JSON schema
    const data = (await res.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content?.trim();

    if (content && content.length > 0) {
      const cleaned = content.replace(/^["']|["']$/g, "").replace(/\n.*/g, "").trim();
      return cleaned.slice(0, 100);
    }

    return getFallbackDialogue(request);
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    // Network error or timeout: seamlessly use local autonomy fallback
    return getFallbackDialogue(request);
  }
}
