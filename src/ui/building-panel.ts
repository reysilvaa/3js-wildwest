import * as THREE from "three";
import type { InteractiveBuilding } from "@/environment/world/town.js";

export function initBuildingPanels(getBuildings: () => readonly InteractiveBuilding[]) {
  const layer = document.createElement("div");
  layer.className = "bldg-occ-layer";
  document.body.appendChild(layer);

  const nodes = new Map<string, { el: HTMLDivElement; sig: string; lastTf: string }>();
  const proj = new THREE.Vector3();
  let vpW = window.innerWidth;
  let vpH = window.innerHeight;
  window.addEventListener("resize", () => {
    vpW = window.innerWidth;
    vpH = window.innerHeight;
  });

  function update(camera: THREE.Camera): void {
    const buildings = getBuildings();

    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i]!;
      const occ = b.occupants;
      let entry = nodes.get(b.id);

      if (occ.length === 0) {
        if (entry && entry.el.style.display !== "none") {
          entry.el.style.display = "none";
          entry.sig = "";
          entry.lastTf = "";
        }
        continue;
      }

      proj.copy(b.roofPos).project(camera);
      const dist = camera.position.distanceTo(b.roofPos);
      const inView = proj.z >= -1 && proj.z <= 1 && dist < 85;

      if (!inView) {
        if (entry && entry.el.style.display !== "none") {
          entry.el.style.display = "none";
          entry.lastTf = "";
        }
        continue;
      }

      if (!entry) {
        const el = document.createElement("div");
        el.className = "bldg-occ-bubble";
        layer.appendChild(el);
        entry = { el, sig: "", lastTf: "" };
        nodes.set(b.id, entry);
      }

      let sig = "";
      for (let k = 0; k < occ.length; k++) {
        sig += (k > 0 ? "," : "") + occ[k]!.id;
      }
      if (entry.sig !== sig) {
        entry.sig = sig;
        let chips = "";
        for (let k = 0; k < occ.length; k++) {
          const o = occ[k]!;
          chips +=
            `<div class="bldg-occ-chip">` +
            `<img class="bldg-occ-avatar" src="${o.portraitUrl}" alt="${o.name}" />` +
            `<span class="bldg-occ-name">${o.name}</span>` +
            `</div>`;
        }
        entry.el.innerHTML = `<div class="bldg-occ-title">${b.label} (${occ.length})</div><div class="bldg-occ-faces">${chips}</div>`;
      }

      const sx = ((proj.x * 0.5 + 0.5) * vpW).toFixed(1);
      const sy = ((-proj.y * 0.5 + 0.5) * vpH).toFixed(1);
      const scale = Math.max(0.65, Math.min(1.05, 36 / Math.max(18, dist))).toFixed(2);
      const tf = `translate3d(${sx}px,${sy}px,0) translate(-50%,-100%) scale(${scale})`;
      if (entry.el.style.display !== "flex") entry.el.style.display = "flex";
      if (entry.lastTf !== tf) {
        entry.lastTf = tf;
        entry.el.style.transform = tf;
      }
    }
  }

  return { update };
}
