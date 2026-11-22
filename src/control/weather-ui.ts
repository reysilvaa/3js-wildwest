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
  uiContainer.className =
    "absolute top-4 right-4 z-40 flex items-center gap-2 p-1.5 rounded-xl bg-[#140b07]/80 border-2 border-[#7d1214] shadow-frame backdrop-blur-md";

  function createBtn(id: string, label: string, title: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.id = id;
    btn.innerHTML = label;
    btn.title = title;
    btn.className = "rdr2-btn px-3.5 py-1.5 rounded-lg flex items-center justify-center gap-1.5";

    btn.addEventListener("click", onClick);
    uiContainer.appendChild(btn);
    return btn;
  }

  const timeBtn = createBtn("btn-time", '<span style="color:#84181a;font-weight:900">★</span> DAY', "Toggle Day/Dusk/Night (Shortcut: N)", handlers.onToggleTime);
  const weatherBtn = createBtn("btn-weather", '<span style="color:#84181a;font-weight:900">◈</span> FAIR', "Toggle Rain (Shortcut: R)", handlers.onToggleCondition);
  const cycleBtn = createBtn("btn-cycle", '<span style="color:#84181a;font-weight:900">⏱</span> CYCLE: OFF', "Toggle Auto Cycle (Shortcut: C)", handlers.onToggleCycle);

  document.body.appendChild(uiContainer);

  // Keyboard Shortcuts (N for Night/Day, R for Rain, C for Cycle)
  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key.toLowerCase() === "n") handlers.onToggleTime();
    if (e.key.toLowerCase() === "r") handlers.onToggleCondition();
    if (e.key.toLowerCase() === "c") handlers.onToggleCycle();
  });

  function update(timeOfDay: TimeOfDay, condition: WeatherCondition, autoCycle: boolean): void {
    const timeLabel = timeOfDay === "day" ? "DAY" : timeOfDay === "sunset" ? "DUSK" : "NIGHT";
    const weatherLabel = condition === "clear" ? "FAIR" : "STORM";
    const cycleLabel = autoCycle ? "CYCLE: 120S" : "CYCLE: OFF";

    timeBtn.innerHTML = `<span style="color:#84181a;font-weight:900">★</span> ${timeLabel}`;
    weatherBtn.innerHTML = `<span style="color:#84181a;font-weight:900">◈</span> ${weatherLabel}`;
    cycleBtn.innerHTML = `<span style="color:#84181a;font-weight:900">⏱</span> ${cycleLabel}`;

    if (autoCycle) {
      cycleBtn.classList.add("border-[#cba043]", "shadow-[0_0_12px_rgba(203,160,67,0.7)]");
    } else {
      cycleBtn.classList.remove("border-[#cba043]", "shadow-[0_0_12px_rgba(203,160,67,0.7)]");
    }
  }

  return { update, container: uiContainer };
}
