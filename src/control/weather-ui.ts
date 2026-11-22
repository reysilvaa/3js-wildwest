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
  uiContainer.style.cssText = `
    position: absolute;
    top: 16px;
    right: 16px;
    display: flex;
    gap: 8px;
    z-index: 100;
  `;

  function createBtn(id: string, label: string, title: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.id = id;
    btn.innerHTML = label;
    btn.title = title;
    btn.style.cssText = `
      background: rgba(20, 15, 10, 0.7);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      padding: 8px 14px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      backdrop-filter: blur(6px);
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 6px;
      user-select: none;
    `;
    btn.addEventListener("mouseenter", () => {
      btn.style.background = "rgba(45, 35, 25, 0.9)";
      btn.style.borderColor = "rgba(229, 155, 60, 0.5)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "rgba(20, 15, 10, 0.7)";
      btn.style.borderColor = "rgba(255, 255, 255, 0.15)";
    });
    btn.addEventListener("click", onClick);
    uiContainer.appendChild(btn);
    return btn;
  }

  const timeBtn = createBtn("btn-time", "☀️ Day", "Toggle Day/Night (Shortcut: N)", handlers.onToggleTime);
  const weatherBtn = createBtn("btn-weather", "🌤️ Clear", "Toggle Rain (Shortcut: R)", handlers.onToggleCondition);
  const cycleBtn = createBtn("btn-cycle", "⏱️ Cycle: Off", "Toggle Auto Cycle (Shortcut: C)", handlers.onToggleCycle);

  document.body.appendChild(uiContainer);

  // Keyboard Shortcuts (N for Night/Day, R for Rain, C for Cycle)
  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key.toLowerCase() === "n") handlers.onToggleTime();
    if (e.key.toLowerCase() === "r") handlers.onToggleCondition();
    if (e.key.toLowerCase() === "c") handlers.onToggleCycle();
  });

  function update(timeOfDay: TimeOfDay, condition: WeatherCondition, autoCycle: boolean): void {
    timeBtn.innerHTML = timeOfDay === "day" ? "☀️ Day" : timeOfDay === "sunset" ? "🌅 Sunset" : "🌙 Night";
    weatherBtn.innerHTML = condition === "clear" ? "🌤️ Clear" : "🌧️ Rain";
    cycleBtn.innerHTML = autoCycle ? "⏱️ Cycle: 120s" : "⏱️ Cycle: Off";
    cycleBtn.style.color = autoCycle ? "#e59b3c" : "#fff";
  }

  return { update, container: uiContainer };
}
