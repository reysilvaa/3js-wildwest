import { createElement, Lock, Settings, X, type IconNode } from "lucide";
import type { TimeOfDay, WeatherCondition } from "@/environment/weather/sun-moon.js";

function renderLucideIcon(icon: IconNode, size = 12, cls = ""): string {
  const el = createElement(icon, { width: size, height: size, "stroke-width": 2.3 });
  if (cls) el.setAttribute("class", cls);
  return el.outerHTML;
}

export interface WeatherUIHandlers {
  onToggleTime: () => void;
  onToggleCondition: () => void;
  onToggleCycle: () => void;
  onToggleMute?: () => boolean;
  isMuted?: () => boolean;
  onTriggerDialogue?: () => void;
  onToggleCamera?: () => void;
}

export interface WeatherUI {
  update: (timeOfDay: TimeOfDay, condition: WeatherCondition, autoCycle: boolean) => void;
  container: HTMLDivElement;
  setAudioMuted: (muted: boolean) => void;
  toggleMenu: (open?: boolean) => void;
}

interface MenuItemDef {
  id: string;
  label: string;
  shortcut: string;
  getBadge: () => string;
  getDesc: () => string;
  isLocked?: () => boolean;
  action: () => void;
}

export function initWeatherUI(handlers: WeatherUIHandlers): WeatherUI {
  let currentTimeOfDay: TimeOfDay = "day";
  let currentCondition: WeatherCondition = "clear";
  let currentAutoCycle = false;
  let isAudioMuted = handlers.isMuted ? handlers.isMuted() : false;
  let isMenuOpen = false;
  let selectedIdx = 0;
  let isStreetCam = false;

  const toggleBtn = document.createElement("button");
  toggleBtn.id = "western-menu-toggle";
  toggleBtn.className = "western-menu-toggle";
  toggleBtn.innerHTML = `${renderLucideIcon(Settings, 13, "text-brass shrink-0")} SETTINGS <span style="opacity:0.6;font-size:10px">[L]</span>`;
  toggleBtn.title = "Toggle Settings Menu (Shortcut: L or Tab)";
  document.body.appendChild(toggleBtn);

  const menuContainer = document.createElement("div");
  menuContainer.id = "western-settings-menu";
  menuContainer.className = "western-side-menu collapsed";
  menuContainer.setAttribute("role", "menu");
  menuContainer.setAttribute("aria-label", "Frontier Town Settings Menu");

  const headerSpacer = document.createElement("div");
  headerSpacer.className = "western-menu-header-spacer";
  headerSpacer.title = "Frontier Settings (Shortcut: L to collapse)";
  menuContainer.appendChild(headerSpacer);

  const listContainer = document.createElement("div");
  listContainer.className = "western-menu-list";
  menuContainer.appendChild(listContainer);

  const footer = document.createElement("div");
  footer.className = "western-menu-footer";
  footer.innerHTML = `
    <div class="western-menu-divider"></div>
    <div id="western-menu-desc" class="western-menu-desc"></div>
  `;
  menuContainer.appendChild(footer);

  document.body.appendChild(menuContainer);

  const descEl = footer.querySelector("#western-menu-desc") as HTMLDivElement;

  function toggleCamera() {
    isStreetCam = !isStreetCam;
    if (typeof (window as unknown as { __toggleCameraView?: () => void }).__toggleCameraView === "function") {
      (window as unknown as { __toggleCameraView: () => void }).__toggleCameraView();
    }
    renderRows();
  }

  function triggerTalk() {
    if (typeof (window as unknown as { triggerConversation?: (a?: number, b?: number) => void }).triggerConversation === "function") {
      (window as unknown as { triggerConversation: (a?: number, b?: number) => void }).triggerConversation(0, 1);
    }
    renderRows();
  }

  function inspectNextNPC() {
    if (typeof (window as unknown as { inspectNPC?: (i?: number) => void }).inspectNPC === "function") {
      (window as unknown as { inspectNPC: (i?: number) => void }).inspectNPC(0);
    }
    renderRows();
  }

  function toggleWasdGuide() {
    const el = document.getElementById("wasd-indicator");
    if (el) {
      const isVisible = el.classList.contains("opacity-100");
      if (isVisible) {
        el.classList.remove("opacity-100");
        el.classList.add("opacity-0");
      } else {
        el.classList.remove("opacity-0");
        el.classList.add("opacity-100");
      }
    }
    renderRows();
  }

  const menuItems: MenuItemDef[] = [
    {
      id: "time-of-day",
      label: "Time of Day",
      shortcut: "N",
      isLocked: () => currentAutoCycle,
      getBadge: () => {
        const t = currentTimeOfDay === "day" ? "DAY" : currentTimeOfDay === "sunset" ? "DUSK" : "NIGHT";
        return currentAutoCycle ? `${renderLucideIcon(Lock, 11, "inline-block align-[-1px] mr-1")}${t}` : t;
      },
      getDesc: () =>
        currentAutoCycle
          ? "Locked while Day Cycle is ON. Turn off Day Cycle [C] to set time manually."
          : "Advance frontier sunlight between noon, golden sunset, and starry midnight. [Shortcut: N]",
      action: () => {
        if (!currentAutoCycle) handlers.onToggleTime();
      },
    },
    {
      id: "weather",
      label: "Weather",
      shortcut: "R",
      getBadge: () => (currentCondition === "rain" ? "STORM" : "FAIR"),
      getDesc: () => "Summon desert rainfall, street mud accumulation, and distant thunderclaps. [Shortcut: R]",
      action: () => handlers.onToggleCondition(),
    },
    {
      id: "day-cycle",
      label: "Day Cycle",
      shortcut: "C",
      getBadge: () => (currentAutoCycle ? "120S LOOP" : "OFF"),
      getDesc: () => "Automate 120-second dynamic progression of lighting and celestial bodies. [Shortcut: C]",
      action: () => handlers.onToggleCycle(),
    },
    {
      id: "frontier-audio",
      label: "Frontier Music",
      shortcut: "M",
      getBadge: () => (isAudioMuted ? "MUTED" : "ACTIVE"),
      getDesc: () => "Toggle authentic western acoustic guitar, banjo, and environmental audio. [Shortcut: M]",
      action: () => {
        if (handlers.onToggleMute) {
          isAudioMuted = handlers.onToggleMute();
          renderRows();
        }
      },
    },
    {
      id: "trigger-talk",
      label: "Trigger Dialogue",
      shortcut: "T",
      getBadge: () => "CHAT",
      getDesc: () => "Prompt nearby town residents to initiate spontaneous voice conversation. [Shortcut: T]",
      action: triggerTalk,
    },
    {
      id: "camera-view",
      label: "Camera View",
      shortcut: "V",
      getBadge: () => (isStreetCam ? "STREET" : "ORBIT"),
      getDesc: () => "Switch camera between free-orbit town overview and street-level exploration.",
      action: toggleCamera,
    },
    {
      id: "town-residents",
      label: "Town Residents",
      shortcut: "I",
      getBadge: () => `${(window as unknown as { __npcs?: unknown[] }).__npcs?.length ?? 10} CITIZENS`,
      getDesc: () => "Inspect autonomous townsfolk navigating the boardwalks, saloon, and depot.",
      action: inspectNextNPC,
    },
    {
      id: "controls-guide",
      label: "Controls Guide",
      shortcut: "H",
      getBadge: () => "WASD + MOUSE",
      getDesc: () => "WASD to walk · Mouse to look · [L] or [Tab] to toggle this Settings menu.",
      action: toggleWasdGuide,
    },
  ];



  function renderRows(): void {
    listContainer.innerHTML = "";
    menuItems.forEach((item, idx) => {
      const row = document.createElement("div");
      const isSelected = idx === selectedIdx;
      const isLocked = item.isLocked?.() ?? false;
      row.className = `western-menu-row${isSelected ? " selected" : ""}${isLocked ? " locked" : ""}`;
      row.setAttribute("role", "menuitem");
      row.setAttribute("tabindex", "0");
      if (isLocked) row.setAttribute("aria-disabled", "true");

      row.innerHTML = `
        <span class="flex items-center gap-2">
          <span>${item.label}</span>
        </span>
        <span class="row-badge">${item.getBadge()}</span>
      `;

      row.addEventListener("mouseenter", () => {
        selectedIdx = idx;
        updateSelectedRowVisuals();
      });

      row.addEventListener("click", () => {
        selectedIdx = idx;
        if (!isLocked) item.action();
        updateSelectedRowVisuals();
      });

      listContainer.appendChild(row);
    });

    updateDescription();
  }

  function updateSelectedRowVisuals(): void {
    const rows = listContainer.querySelectorAll(".western-menu-row");
    rows.forEach((r, i) => {
      if (i === selectedIdx) {
        r.classList.add("selected");
      } else {
        r.classList.remove("selected");
      }
    });
    updateDescription();
  }

  function updateDescription(): void {
    const item = menuItems[selectedIdx];
    if (item && descEl) {
      descEl.textContent = item.getDesc();
    }
  }

  function toggleMenu(open?: boolean): void {
    isMenuOpen = open !== undefined ? open : !isMenuOpen;
    if (isMenuOpen) {
      menuContainer.classList.remove("collapsed");
      toggleBtn.innerHTML = `${renderLucideIcon(X, 13, "text-brass shrink-0")} CLOSE <span style="opacity:0.6;font-size:10px">[L]</span>`;
    } else {
      menuContainer.classList.add("collapsed");
      toggleBtn.innerHTML = `${renderLucideIcon(Settings, 13, "text-brass shrink-0")} SETTINGS <span style="opacity:0.6;font-size:10px">[L]</span>`;
    }
  }

  headerSpacer.addEventListener("click", () => toggleMenu(false));
  toggleBtn.addEventListener("click", () => toggleMenu());

  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    if (e.key.toLowerCase() === "l" || e.key === "Tab") {
      e.preventDefault();
      toggleMenu();
      return;
    }

    if (!isMenuOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIdx = (selectedIdx + 1) % menuItems.length;
      updateSelectedRowVisuals();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIdx = (selectedIdx - 1 + menuItems.length) % menuItems.length;
      updateSelectedRowVisuals();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const item = menuItems[selectedIdx];
      item?.action();
      updateSelectedRowVisuals();
    } else if (e.key.toLowerCase() === "n") {
      handlers.onToggleTime();
    } else if (e.key.toLowerCase() === "r") {
      handlers.onToggleCondition();
    } else if (e.key.toLowerCase() === "c") {
      handlers.onToggleCycle();
    } else if (e.key.toLowerCase() === "t") {
      triggerTalk();
    }
  });

  (window as unknown as { __updateAudioUI?: (muted: boolean) => void }).__updateAudioUI = (muted: boolean) => {
    isAudioMuted = muted;
    renderRows();
  };

  renderRows();

  function update(timeOfDay: TimeOfDay, condition: WeatherCondition, autoCycle: boolean): void {
    currentTimeOfDay = timeOfDay;
    currentCondition = condition;
    currentAutoCycle = autoCycle;
    renderRows();
  }

  function setAudioMuted(muted: boolean): void {
    isAudioMuted = muted;
    renderRows();
  }

  return {
    update,
    setAudioMuted,
    toggleMenu,
    container: menuContainer,
  };
}

