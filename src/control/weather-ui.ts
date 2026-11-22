import type { TimeOfDay, WeatherCondition } from "../environment/weather/sun-moon.js";

export interface WeatherUIHandlers {
  onToggleTime: () => void;
  onToggleCondition: () => void;
  onToggleCycle: () => void;
}

export interface WeatherUI {
  update: (timeOfDay: TimeOfDay, condition: WeatherCondition, autoCycle: boolean) => void;
  container: HTMLDivElement;
}

export function initWeatherUI(handlers: WeatherUIHandlers): WeatherUI {
  const uiContainer = document.createElement("div");
  uiContainer.id = "weather-controls";
  // Tailwind utility classes for HUD bar
  uiContainer.className =
    "absolute top-4 right-4 z-40 flex items-center gap-2 p-1.5 rounded-xl bg-[#221005]/85 border-2 border-[#542e14] shadow-frame backdrop-blur-md";

  function createBtn(id: string, label: string, title: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.id = id;
    btn.innerHTML = label;
    btn.title = title;
    // Authentic Western parchment button with carved leather border & drop shadow
    btn.className =
      "relative px-3.5 py-1.5 rounded-lg bg-gradient-to-b from-[#fdf8ea] via-[#f3e3be] to-[#d9be85] border border-[#542e14] shadow-western text-[#2a1306] font-western text-[11px] tracking-wider uppercase flex items-center justify-center gap-1.5 hover:from-white hover:to-[#ebd49f] hover:border-[#cba043] hover:shadow-[0_0_12px_rgba(203,160,67,0.6)] active:scale-95 transition-all duration-150 cursor-pointer select-none";

    btn.addEventListener("click", onClick);
    uiContainer.appendChild(btn);
    return btn;
  }

  // NO EMOJIS: Pure authentic Western typographic glyphs and labels
  const timeBtn = createBtn("btn-time", "★ DAY", "Toggle Day/Dusk/Night (Shortcut: N)", handlers.onToggleTime);
  const weatherBtn = createBtn("btn-weather", "◈ FAIR", "Toggle Rain (Shortcut: R)", handlers.onToggleCondition);
  const cycleBtn = createBtn("btn-cycle", "⏱ CYCLE: OFF", "Toggle Auto Cycle (Shortcut: C)", handlers.onToggleCycle);

  document.body.appendChild(uiContainer);

  // Keyboard Shortcuts (N for Night/Day, R for Rain, C for Cycle)
  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key.toLowerCase() === "n") handlers.onToggleTime();
    if (e.key.toLowerCase() === "r") handlers.onToggleCondition();
    if (e.key.toLowerCase() === "c") handlers.onToggleCycle();
  });

  function update(timeOfDay: TimeOfDay, condition: WeatherCondition, autoCycle: boolean): void {
    timeBtn.innerHTML = timeOfDay === "day" ? "★ DAY" : timeOfDay === "sunset" ? "★ DUSK" : "★ NIGHT";
    weatherBtn.innerHTML = condition === "clear" ? "◈ FAIR" : "◈ STORM";
    cycleBtn.innerHTML = autoCycle ? "⏱ CYCLE: 120S" : "⏱ CYCLE: OFF";

    if (autoCycle) {
      cycleBtn.classList.add("text-[#965415]", "font-bold");
    } else {
      cycleBtn.classList.remove("text-[#965415]", "font-bold");
    }
  }

  return { update, container: uiContainer };
}
