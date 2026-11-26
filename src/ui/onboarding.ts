import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  createElement,
  Building2,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  Compass,
  Eye,
  MessageSquareQuote,
  Move,
  SlidersHorizontal,
  SunMoon,
  UserSearch,
  X,
  type IconNode,
} from "lucide";
import type { NPCController } from "@/entities/npc/controller.js";
import { triggerBuildingDoor, type InteractiveBuilding } from "@/environment/world/town.js";
import type { BubbleChatManager } from "@/ui/bubble-chat.js";
import { IS_MOBILE } from "@/ui/mobile.js";

const TOUR_STORAGE_KEY = "rey_ww_tour_done";

export interface OnboardingOptions {
  camera: THREE.Camera;
  controls: OrbitControls;
  npcs: readonly NPCController[];
  getBuildings: () => readonly InteractiveBuilding[];
  bubbleChat: BubbleChatManager;
}

interface TourStep {
  kicker: string;
  title: string;
  desc: string;
  icon: IconNode;
  targetSelector?: string;
  getWorldRect?: () => DOMRect | null;
  onEnter?: () => void;
  onLeave?: () => void;
}

function renderIcon(icon: IconNode, size = 16): string {
  return createElement(icon, { width: size, height: size, "stroke-width": 2.2 }).outerHTML;
}

export interface OnboardingTour {
  start: (force?: boolean) => void;
  startIfFirstVisit: () => void;
  close: () => void;
}

/**
 * Comprehensive walkthrough.js-style spotlight tour covering 3D navigation, NPCs, conversations,
 * buildings, 3D inspector, dynamic weather/mud, solar-lunar cycle, audio, and settings.
 */
export function initOnboarding({ camera, controls, npcs, getBuildings, bubbleChat }: OnboardingOptions): OnboardingTour {
  const root = document.createElement("div");
  root.className = "onb-root";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Frontier Town Walkthrough");

  const spotlight = document.createElement("div");
  spotlight.className = "onb-spotlight centered";
  const card = document.createElement("div");
  card.className = "onb-card";
  root.append(spotlight, card);
  document.body.appendChild(root);

  const replayBtn = document.createElement("button");
  replayBtn.className = "onb-replay-btn";
  replayBtn.type = "button";
  replayBtn.title = "Open Feature Walkthrough";
  replayBtn.innerHTML = `${renderIcon(Compass, 14)}<span>GUIDE</span>`;
  replayBtn.addEventListener("click", () => start(true));
  document.body.appendChild(replayBtn);

  let active = false;
  let stepIdx = 0;
  let openedSettingsForTour = false;
  let camMovedByTour = false;

  const projVec = new THREE.Vector3();
  const focusCam = (tx: number, ty: number, tz: number, cx: number, cy: number, cz: number) => {
    controls.target.set(tx, ty, tz);
    camera.position.set(cx, cy, cz);
    controls.update();
    camera.updateMatrixWorld(true);
    camMovedByTour = true;
  };

  const restoreDefaultCam = () => {
    if (!camMovedByTour) return;
    controls.target.set(9.5, 4.5, -16.0);
    camera.position.set(10.0, 11.5, 30.0);
    controls.update();
    camMovedByTour = false;
  };

  const projectBoxToRect = (center: THREE.Vector3, halfW: number, halfH: number): DOMRect => {
    const pts = [
      [center.x - halfW, center.y - halfH, center.z],
      [center.x + halfW, center.y + halfH, center.z],
      [center.x, center.y - halfH, center.z - halfW],
      [center.x, center.y + halfH, center.z + halfW],
    ] as const;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const vw = window.innerWidth, vh = window.innerHeight;
    for (const [x, y, z] of pts) {
      projVec.set(x, y, z).project(camera);
      const sx = (projVec.x * 0.5 + 0.5) * vw;
      const sy = (-projVec.y * 0.5 + 0.5) * vh;
      if (sx < minX) minX = sx;
      if (sy < minY) minY = sy;
      if (sx > maxX) maxX = sx;
      if (sy > maxY) maxY = sy;
    }
    return new DOMRect(minX, minY, Math.max(48, maxX - minX), Math.max(48, maxY - minY));
  };

  let demoNpc: NPCController | undefined;
  let demoBuilding: InteractiveBuilding | undefined;

  const toggleSettingsMenu = (wantOpen: boolean) => {
    const menu = document.getElementById("western-settings-menu");
    const btn = document.getElementById("western-menu-toggle");
    if (!menu || !btn) return;
    const isCollapsed = menu.classList.contains("collapsed");
    if (wantOpen && isCollapsed) {
      btn.click();
      openedSettingsForTour = true;
    } else if (!wantOpen && !isCollapsed && openedSettingsForTour) {
      btn.click();
      openedSettingsForTour = false;
    }
  };

  const steps: TourStep[] = [
    {
      kicker: "Welcome Partner",
      title: "Frontier Town 1885",
      desc: "Kota Wild West 3D hidup dengan siklus <b>matahari & bulan</b>, badai hujan + lumpur, warga otonom ber-lentera, AI dialog, dan bangunan interaktif.",
      icon: Compass,
    },
    {
      kicker: "Step 1 · Navigation",
      title: "Kamera & Street View",
      desc: IS_MOBILE
        ? "Geser <b>sisi kiri</b> untuk putar kamera, <b>sisi kanan</b> untuk geser peta, <b>cubit</b> untuk zoom. Buka Settings untuk ganti <b>Orbit / Street</b>."
        : "<b>WASD</b> berjalan, <b>Drag kiri</b> putar, <b>Drag kanan</b> geser peta, <b>Scroll</b> zoom, dan tekan <b>[V]</b> untuk ganti <b>Orbit / Street View</b>.",
      icon: Move,
    },
    {
      kicker: "Step 2 · 3D Citizens",
      title: "Warga Otonom & Lentera",
      desc: "Warga berjalan antar gedung, beristirahat di dalam, dan sebagian membawa <b>lentera minyak</b> yang menyala otomatis saat senja & malam.",
      icon: UserSearch,
      onEnter: () => {
        demoNpc = npcs.find((n) => n.model?.root.visible && n.getState() !== "INDOORS") ?? npcs[0];
        if (!demoNpc) return;
        const p = demoNpc.getPosition();
        demoNpc.pause(4.0);
        focusCam(p.x, p.y + 1.1, p.z, p.x + 2.8, p.y + 2.2, p.z + 5.2);
      },
      getWorldRect: () => {
        if (!demoNpc) return null;
        const p = demoNpc.getPosition();
        return projectBoxToRect(new THREE.Vector3(p.x, p.y + 0.95, p.z), 0.7, 1.1);
      },
    },
    {
      kicker: "Step 3 · Dialogue",
      title: "AI Bubble Chat",
      desc: "Warga saling mengobrol spontan dengan gelembung kertas minyak. Tekan <b>[T]</b> di Settings atau tombol <b>Greet</b> untuk memicu percakapan langsung.",
      icon: MessageSquareQuote,
      targetSelector: ".western-bubble",
      onEnter: () => {
        demoNpc = demoNpc && demoNpc.model?.root.visible ? demoNpc : npcs.find((n) => n.model?.root.visible) ?? npcs[0];
        if (!demoNpc?.model) return;
        const p = demoNpc.getPosition();
        demoNpc.pause(6.0);
        demoNpc.faceTarget(camera.position, 6.0);
        focusCam(p.x, p.y + 1.5, p.z, p.x + 2.4, p.y + 2.3, p.z + 5.6);
        bubbleChat.show(
          demoNpc.model.root,
          demoNpc.name,
          "Howdy, partner! Fine evening in Frontier Town.",
          8000,
          "tour-demo-bubble"
        );
      },
      onLeave: () => bubbleChat.hide("tour-demo-bubble"),
    },
    {
      kicker: "Step 4 · 3D Buildings",
      title: "Bangunan & Penghuni",
      desc: "Setiap gedung (Saloon, Bank, Sheriff, Church, Hotel) punya <b>panel penghuni di atap</b>, pintu animasi, serta cahaya jendela hangat saat malam.",
      icon: Building2,
      onEnter: () => {
        const list = getBuildings();
        demoBuilding = list.find((b) => b.id.toLowerCase().includes("saloon")) ?? list[0];
        if (!demoBuilding) return;
        const e = demoBuilding.entryPos;
        const d = demoBuilding.doorPos;
        const outX = e.x - d.x;
        const outZ = e.z - d.z;
        const len = Math.hypot(outX, outZ) || 1;
        const nx = outX / len;
        const nz = outZ / len;
        triggerBuildingDoor(demoBuilding, 3.0);
        focusCam(d.x, d.y + 2.4, d.z, d.x + nx * 13 + nz * 4, d.y + 5.5, d.z + nz * 13 - nx * 4);
      },
      getWorldRect: () => {
        if (!demoBuilding) return null;
        const d = demoBuilding.doorPos;
        return projectBoxToRect(new THREE.Vector3(d.x, d.y + 2.5, d.z), 3.6, 3.2);
      },
    },
    {
      kicker: "Step 5 · 3D Inspector",
      title: "Detail & Preview 3D",
      desc: "Klik/tap <b>NPC</b> atau <b>Bangunan</b> untuk membuka laci <b>Inspector</b>: putar model 3D, <b>Focus Cam</b>, <b>Greet</b>, <b>Open Door</b>, atau klik chip penghuni.",
      icon: Eye,
      onEnter: restoreDefaultCam,
    },
    {
      kicker: "Step 6 · Dynamic Weather",
      title: "Hujan, Lumpur & Petir",
      desc: "Cuaca berubah acak secara berkala (atau manual via <b>[R]</b>): hujan gurun, genangan <b>lumpur jalanan</b>, awan gelap, kilat & suara guntur.",
      icon: CloudRain,
    },
    {
      kicker: "Step 7 · Settings [L]",
      title: "Panel Kontrol Utama",
      desc: "Klik <b>Settings [L]</b> (atau tekan <b>Tab</b>) untuk membuka seluruh pengaturan dunia, musik, kamera, dan panduan kontrol.",
      icon: SlidersHorizontal,
      targetSelector: "#western-menu-toggle",
    },
    {
      kicker: "Step 8 · Cycle & Audio",
      title: "Waktu, Musik & Replay",
      desc: "<b>Day Cycle [C]</b> memutar matahari & bulan 6 menit (mengunci Time of Day). Matikan untuk atur <b>[N]</b> manual. Tekan <b>[M]</b> untuk musik Western.",
      icon: SunMoon,
      targetSelector: "#western-settings-menu",
      onEnter: () => toggleSettingsMenu(true),
      onLeave: () => toggleSettingsMenu(false),
    },
  ];

  function positionCard(rect: DOMRect | null): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cw = Math.min(360, vw - 24);
    const ch = card.offsetHeight || 200;

    if (!rect) {
      spotlight.classList.add("centered");
      card.style.left = `${Math.round((vw - cw) * 0.5)}px`;
      card.style.top = `${Math.round((vh - ch) * 0.5)}px`;
      return;
    }

    const pad = 8;
    const sx = Math.max(4, rect.left - pad);
    const sy = Math.max(4, rect.top - pad);
    const sw = Math.min(vw - sx - 4, rect.width + pad * 2);
    const sh = Math.min(vh - sy - 4, rect.height + pad * 2);

    spotlight.classList.remove("centered");
    spotlight.style.left = `${sx}px`;
    spotlight.style.top = `${sy}px`;
    spotlight.style.width = `${sw}px`;
    spotlight.style.height = `${sh}px`;

    let left = sx + sw + 16;
    let top = sy;
    if (left + cw > vw - 12) {
      left = Math.max(12, Math.min(vw - cw - 12, sx));
      top = sy + sh + 14;
      if (top + ch > vh - 12) top = Math.max(12, sy - ch - 14);
      if (top + ch > vh - 12) top = Math.max(12, vh - ch - 16);
    } else {
      top = Math.max(12, Math.min(vh - ch - 12, sy));
    }

    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
  }

  function getStepRect(step: TourStep): DOMRect | null {
    if (step.getWorldRect) return step.getWorldRect();
    if (!step.targetSelector) return null;
    const target = document.querySelector<HTMLElement>(step.targetSelector);
    if (!target) return null;
    const r = target.getBoundingClientRect();
    return r.width > 4 && r.height > 4 ? r : null;
  }

  function renderStep(): void {
    const step = steps[stepIdx]!;
    const isLast = stepIdx === steps.length - 1;
    const dots = steps.map((_, i) => `<span class="onb-dot${i === stepIdx ? " active" : ""}"></span>`).join("");

    card.innerHTML = `
      <div class="onb-head">
        <div class="onb-icon">${renderIcon(step.icon, 16)}</div>
        <div>
          <div class="onb-kicker">${step.kicker}</div>
          <div class="onb-title">${step.title}</div>
        </div>
        <button class="onb-skip-x" data-act="skip" title="Skip Tour (Esc)">${renderIcon(X, 16)}</button>
      </div>
      <p class="onb-desc">${step.desc}</p>
      <div class="onb-foot">
        <div class="onb-dots">${dots}</div>
        <div class="onb-actions">
          <button class="onb-btn" data-act="skip">Skip</button>
          ${stepIdx > 0 ? `<button class="onb-btn" data-act="prev">${renderIcon(ChevronLeft, 13)}Back</button>` : ""}
          <button class="onb-btn primary" data-act="next">${isLast ? "Mulai" : "Next"}${isLast ? "" : renderIcon(ChevronRight, 13)}</button>
        </div>
      </div>
    `;

    const syncRect = () => {
      if (active && steps[stepIdx] === step) positionCard(getStepRect(step));
    };
    requestAnimationFrame(syncRect);
    if (step.onEnter) {
      setTimeout(syncRect, 120);
      setTimeout(syncRect, 320);
    }
  }

  function goTo(nextIdx: number): void {
    if (nextIdx >= steps.length) {
      close();
      return;
    }
    if (nextIdx < 0) return;
    steps[stepIdx]?.onLeave?.();
    stepIdx = nextIdx;
    steps[stepIdx]?.onEnter?.();
    renderStep();
  }

  function start(force = false): void {
    if (!force && localStorage.getItem(TOUR_STORAGE_KEY) === "1") return;
    if (active) return;
    active = true;
    stepIdx = 0;
    openedSettingsForTour = false;
    root.classList.add("active");
    steps[0]?.onEnter?.();
    renderStep();
  }

  function startIfFirstVisit(): void {
    start(false);
  }

  function close(): void {
    if (!active) return;
    steps[stepIdx]?.onLeave?.();
    restoreDefaultCam();
    active = false;
    root.classList.remove("active");
    localStorage.setItem(TOUR_STORAGE_KEY, "1");
  }

  card.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "skip") close();
    else if (act === "prev") goTo(stepIdx - 1);
    else if (act === "next") goTo(stepIdx + 1);
  });

  window.addEventListener("resize", () => {
    if (!active) return;
    positionCard(getStepRect(steps[stepIdx]!));
  });

  window.addEventListener("keydown", (e) => {
    if (!active) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight" || e.key === "Enter") goTo(stepIdx + 1);
    else if (e.key === "ArrowLeft") goTo(stepIdx - 1);
  });

  Object.assign(window, { __startOnboarding: () => start(true) });

  return { start, startIfFirstVisit, close };
}
