import * as THREE from "three";
import type { InteractiveBuilding } from "../environment/world/town.js";

const STYLE_ID = "building-occupant-panel-styles";

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .bldg-occ-layer {
      position: fixed; inset: 0; pointer-events: none; z-index: 44; overflow: hidden;
    }
    .bldg-occ-bubble {
      position: absolute;
      display: flex; flex-direction: column; align-items: center; gap: 5px;
      min-width: 150px;
      background-image: url("/ui/bubble-frame.png");
      background-size: 100% 100%;
      background-repeat: no-repeat;
      padding: 14px 22px 32px 22px;
      filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.78));
      transform-origin: 13.27% 99.3%;
      white-space: nowrap; will-change: transform;
    }
    .bldg-occ-title {
      font-family: 'Cinzel', 'Rye', 'Georgia', serif;
      font-size: 12px; font-weight: 900; letter-spacing: 0.08em;
      color: #84181a; text-transform: uppercase;
      text-shadow: 0 1px 0 rgba(255, 245, 220, 0.75);
      line-height: 1.1;
    }
    .bldg-occ-faces {
      display: flex; align-items: center; justify-content: center; gap: 6px;
    }
    .bldg-occ-chip {
      display: flex; flex-direction: column; align-items: center; gap: 2px;
    }
    .bldg-occ-avatar {
      width: 32px; height: 32px; border-radius: 50%; object-fit: cover;
      background: #dfc392; border: 2px solid #7d1214;
      box-shadow: 0 2px 5px rgba(45, 22, 10, 0.45);
    }
    .bldg-occ-name {
      font-family: 'Georgia', serif; font-size: 10px; font-weight: 700;
      color: #2c1810; max-width: 48px;
      overflow: hidden; text-overflow: ellipsis;
      text-shadow: 0 1px 0 rgba(255, 245, 220, 0.6);
    }
  `;
  document.head.appendChild(style);
}

export function initBuildingPanels(getBuildings: () => readonly InteractiveBuilding[]) {
  injectStyles();
  const layer = document.createElement("div");
  layer.className = "bldg-occ-layer";
  document.body.appendChild(layer);

  const nodes = new Map<string, { el: HTMLDivElement; sig: string }>();
  const proj = new THREE.Vector3();

  function update(camera: THREE.Camera): void {
    const buildings = getBuildings();
    const w = window.innerWidth;
    const h = window.innerHeight;

    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i]!;
      const occ = b.occupants;
      let entry = nodes.get(b.id);

      if (occ.length === 0) {
        if (entry && entry.el.style.display !== "none") {
          entry.el.style.display = "none";
          entry.sig = "";
        }
        continue;
      }

      proj.copy(b.roofPos).project(camera);
      const dist = camera.position.distanceTo(b.roofPos);
      const inView = proj.z >= -1 && proj.z <= 1 && dist < 85;

      if (!inView) {
        if (entry && entry.el.style.display !== "none") entry.el.style.display = "none";
        continue;
      }

      if (!entry) {
        const el = document.createElement("div");
        el.className = "bldg-occ-bubble";
        layer.appendChild(el);
        entry = { el, sig: "" };
        nodes.set(b.id, entry);
      }

      const sig = occ.map((o) => o.id).join(",");
      if (entry.sig !== sig) {
        entry.sig = sig;
        const chips = occ
          .map(
            (o) =>
              `<div class="bldg-occ-chip">` +
              `<img class="bldg-occ-avatar" src="${o.portraitUrl}" alt="${o.name}" />` +
              `<span class="bldg-occ-name">${o.name}</span>` +
              `</div>`
          )
          .join("");
        entry.el.innerHTML = `<div class="bldg-occ-title">${b.label} (${occ.length})</div><div class="bldg-occ-faces">${chips}</div>`;
      }

      const sx = (proj.x * 0.5 + 0.5) * w;
      const sy = (-proj.y * 0.5 + 0.5) * h;
      const scale = Math.max(0.65, Math.min(1.05, 36 / Math.max(18, dist)));
      entry.el.style.display = "flex";
      entry.el.style.left = `${sx.toFixed(1)}px`;
      entry.el.style.top = `${sy.toFixed(1)}px`;
      entry.el.style.transform = `translate(-50%, -100%) scale(${scale.toFixed(2)})`;
    }
  }

  return { update };
}
