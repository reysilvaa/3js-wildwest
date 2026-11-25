import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { NPCController } from "../entities/npc/controller.js";
import { triggerBuildingDoor, type InteractiveBuilding } from "../environment/world/town.js";

export interface InspectorOptions {
  scene: THREE.Scene;
  camera: THREE.Camera;
  controls: OrbitControls;
  domElement: HTMLCanvasElement;
  npcs: readonly NPCController[];
  getBuildings: () => readonly InteractiveBuilding[];
  onTalk?: (npc: NPCController) => void;
}

type Target = { kind: "npc"; npc: NPCController } | { kind: "building"; building: InteractiveBuilding } | null;

const CSS = `
.insp-tip{position:fixed;left:0;top:0;z-index:60;pointer-events:none;display:none;align-items:center;gap:6px;padding:5px 10px;border-radius:4px;background:rgba(244,232,200,.94);border:1.5px solid #7d1214;box-shadow:0 6px 16px rgba(0,0,0,.55);font:800 12px 'Cinzel',Georgia,serif;color:#2c1810;white-space:nowrap;will-change:transform}
.insp-tip small{font:600 11px Georgia,serif;color:#84181a}
.insp-modal{position:fixed;right:20px;bottom:20px;z-index:65;width:300px;max-width:calc(100vw - 32px);display:none;flex-direction:column;gap:10px;padding:15px 16px;border-radius:6px;background:linear-gradient(165deg,#f5e8c8,#e6cfa0);border:2px solid #7d1214;box-shadow:0 14px 36px rgba(0,0,0,.72),inset 0 0 0 1px rgba(203,160,67,.55);color:#2c1810;font-family:Georgia,serif}
.insp-head{display:flex;align-items:center;gap:10px;padding-bottom:8px;border-bottom:1px solid rgba(125,18,20,.28)}
.insp-av{width:52px;height:52px;border-radius:50%;object-fit:cover;flex-shrink:0;background:#dfc392;border:2px solid #7d1214}
.insp-ic{width:46px;height:46px;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:#2c1810;color:#cba043;border:2px solid #7d1214;font:900 19px 'Cinzel',Georgia,serif}
.insp-name{font:900 15px 'Cinzel',Georgia,serif;color:#84181a;text-transform:uppercase;letter-spacing:.05em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.insp-tags{display:flex;gap:5px;margin-top:3px}
.insp-tag{font:800 10px Georgia,serif;text-transform:uppercase;padding:2px 6px;border-radius:3px;background:#2c1810;color:#f5e8c8}
.insp-tag.red{background:#84181a}
.insp-x{margin-left:auto;align-self:flex-start;background:none;border:none;cursor:pointer;color:#7d1214;font:900 17px/1 sans-serif}
.insp-grid{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;font-size:12px}
.insp-k{font:700 10px Georgia,serif;color:#6b442a;text-transform:uppercase}
.insp-v{font-weight:600;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.insp-occ{display:flex;flex-wrap:wrap;gap:6px;padding:7px;border-radius:4px;background:rgba(44,24,16,.08)}
.insp-chip{display:flex;align-items:center;gap:5px;padding:3px 8px 3px 3px;border-radius:99px;border:1.5px solid #7d1214;background:#f8edd2;cursor:pointer;color:#2c1810;font:700 11px Georgia,serif}
.insp-chip img{width:22px;height:22px;border-radius:50%;object-fit:cover;border:1px solid #7d1214}
.insp-acts{display:flex;gap:8px}
.insp-btn{flex:1;padding:7px 8px;border-radius:4px;cursor:pointer;border:1.5px solid #7d1214;background:#2c1810;color:#f5e8c8;font:800 11px 'Cinzel',Georgia,serif;text-transform:uppercase}
.insp-btn:hover{background:#84181a}
.insp-btn.alt{background:rgba(44,24,16,.12);color:#2c1810}
.insp-btn.alt:hover{background:rgba(125,18,20,.2)}
`;

export function initInspector({ scene, camera, controls, domElement, npcs, getBuildings, onTalk }: InspectorOptions) {
  if (!document.getElementById("frontier-inspector-styles")) {
    const s = document.createElement("style");
    s.id = "frontier-inspector-styles";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  const tip = document.body.appendChild(Object.assign(document.createElement("div"), { className: "insp-tip" }));
  const modal = document.body.appendChild(Object.assign(document.createElement("div"), { className: "insp-modal" }));
  modal.setAttribute("role", "dialog");

  const ringGeo = new THREE.RingGeometry(0.75, 1.0, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({ color: 0xe6b84c, transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide })
  );
  ring.visible = false;
  scene.add(ring);

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const roots: THREE.Object3D[] = [];
  let hovered: Target = null;
  let selected: Target = null;
  let px = 0, py = 0, dx = 0, dy = 0, lastMove = 0, refresh = 0, pulse = 0, lastSig = "";

  // ponytail: linear scan over <=32 NPCs & <=25 buildings on click/16Hz hover; use Map if >200
  function resolveHit(obj: THREE.Object3D | null): Target {
    for (let cur = obj; cur; cur = cur.parent) {
      const npcId = cur.userData?.npcId as string | undefined;
      if (npcId) {
        const npc = npcs.find((n) => n.id === npcId);
        if (npc) return { kind: "npc", npc };
      }
      const bldgId = cur.userData?.buildingId as string | undefined;
      if (bldgId) {
        const building = getBuildings().find((b) => b.id === bldgId);
        if (building) return { kind: "building", building };
      }
    }
    return null;
  }

  function pickAt(cx: number, cy: number): Target {
    const r = domElement.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);

    // NPCs first so characters on porches win over building walls
    roots.length = 0;
    for (let i = 0; i < npcs.length; i++) {
      const root = npcs[i]?.model?.root;
      if (root?.visible) roots.push(root);
    }
    const npcHit = roots.length ? raycaster.intersectObjects(roots, true)[0] : undefined;
    if (npcHit) return resolveHit(npcHit.object);

    roots.length = 0;
    const bldgs = getBuildings();
    for (let i = 0; i < bldgs.length; i++) roots.push(bldgs[i]!.root);
    const bldgHit = roots.length ? raycaster.intersectObjects(roots, true)[0] : undefined;
    return bldgHit ? resolveHit(bldgHit.object) : null;
  }

  function focusOn(p: THREE.Vector3, dist: number, h: number) {
    controls.target.set(p.x, p.y + 1.4, p.z);
    camera.position.set(p.x + dist * 0.45, p.y + h, p.z + dist);
    controls.update();
  }

  function renderModal(force = false) {
    if (!selected) {
      modal.style.display = "none";
      lastSig = "";
      return;
    }
    if (selected.kind === "npc") {
      const n = selected.npc, p = n.getPosition(), st = n.getState(), act = n.getCurrentActivity(), bldg = n.getCurrentBuilding();
      const sig = `n:${n.id}:${st}:${act}:${bldg ?? ""}:${p.x.toFixed(0)},${p.z.toFixed(0)}`;
      if (!force && sig === lastSig) return;
      lastSig = sig;
      modal.innerHTML =
        `<div class="insp-head"><img class="insp-av" src="${n.getPortraitUrl()}" alt="${n.name}"/><div>` +
        `<div class="insp-name">${n.name}</div><div class="insp-tags"><span class="insp-tag red">${st}</span><span class="insp-tag">${n.getZone()}</span></div></div>` +
        `<button class="insp-x" data-act="close">✕</button></div>` +
        `<div class="insp-grid"><span class="insp-k">Activity</span><span class="insp-v">${st === "INDOORS" && bldg ? `Inside ${bldg}` : act}</span>` +
        `<span class="insp-k">Pos</span><span class="insp-v">${p.x.toFixed(1)}, ${p.z.toFixed(1)}</span></div>` +
        `<div class="insp-acts"><button class="insp-btn" data-act="focus">Focus Cam</button><button class="insp-btn alt" data-act="talk">Greet</button></div>`;
    } else {
      const b = selected.building;
      const sig = `b:${b.id}:${b.occupants.map((o) => o.id).join(",")}`;
      if (!force && sig === lastSig) return;
      lastSig = sig;
      const occ = b.occupants.length
        ? b.occupants.map((o) => `<button class="insp-chip" data-npc="${o.id}"><img src="${o.portraitUrl}" alt="${o.name}"/>${o.name}</button>`).join("")
        : `<small style="font-style:italic;color:#6b442a">Empty right now.</small>`;
      modal.innerHTML =
        `<div class="insp-head"><div class="insp-ic">${b.label[0]}</div><div>` +
        `<div class="insp-name">${b.label}</div><div class="insp-tags"><span class="insp-tag red">OPEN</span><span class="insp-tag">${b.occupants.length} INSIDE</span></div></div>` +
        `<button class="insp-x" data-act="close">✕</button></div>` +
        `<div class="insp-occ">${occ}</div>` +
        `<div class="insp-acts"><button class="insp-btn" data-act="focus">Focus Cam</button><button class="insp-btn alt" data-act="door">Open Door</button></div>`;
    }
    modal.style.display = "flex";
  }

  modal.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-act],[data-npc]");
    if (!el) return;
    if (el.dataset.npc) {
      const npc = npcs.find((n) => n.id === el.dataset.npc);
      if (npc) { selected = { kind: "npc", npc }; renderModal(true); }
      return;
    }
    const act = el.dataset.act;
    if (act === "close") { selected = null; renderModal(true); }
    else if (act === "focus" && selected) focusOn(selected.kind === "npc" ? selected.npc.getPosition() : selected.building.entryPos, selected.kind === "npc" ? 5.5 : 11.5, selected.kind === "npc" ? 2.8 : 6);
    else if (act === "talk" && selected?.kind === "npc") { selected.npc.faceTarget(camera.position, 4.5); selected.npc.pause(3.5); onTalk?.(selected.npc); }
    else if (act === "door" && selected?.kind === "building") triggerBuildingDoor(selected.building, 3.0);
  });

  domElement.addEventListener("pointermove", (e) => {
    px = e.clientX; py = e.clientY;
    if (hovered) tip.style.transform = `translate3d(${px + 14}px,${py - 12}px,0)`;
    const now = performance.now();
    if (now - lastMove < 60) return;
    lastMove = now;
    hovered = pickAt(px, py);
    domElement.style.cursor = hovered ? "pointer" : "";
    if (!hovered) { tip.style.display = "none"; return; }
    tip.innerHTML = hovered.kind === "npc"
      ? `${hovered.npc.name} <small>· ${hovered.npc.getState()}</small>`
      : `${hovered.building.label} <small>· ${hovered.building.occupants.length ? `${hovered.building.occupants.length} inside` : "Building"}</small>`;
    tip.style.display = "flex";
    tip.style.transform = `translate3d(${px + 14}px,${py - 12}px,0)`;
  });
  domElement.addEventListener("pointerleave", () => { hovered = null; domElement.style.cursor = ""; tip.style.display = "none"; });
  domElement.addEventListener("pointerdown", (e) => { dx = e.clientX; dy = e.clientY; });
  domElement.addEventListener("pointerup", (e) => {
    if (e.button !== 0 || Math.hypot(e.clientX - dx, e.clientY - dy) > 6) return;
    const hit = pickAt(e.clientX, e.clientY);
    if (hit) { selected = hit; renderModal(true); }
  });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && selected) { selected = null; renderModal(true); } });

  return {
    inspectNPCByIndex(i: number) {
      const npc = npcs[i % npcs.length];
      if (!npc) return;
      selected = { kind: "npc", npc };
      renderModal(true);
      focusOn(npc.getPosition(), 5.5, 2.8);
    },
    update(dt: number) {
      const active = hovered ?? selected;
      if (active && (active.kind === "building" || active.npc.model?.root.visible)) {
        pulse += dt * 4.2;
        const p = active.kind === "npc" ? active.npc.getPosition() : active.building.entryPos;
        ring.position.set(p.x, p.y + 0.07, p.z);
        ring.scale.setScalar((active.kind === "npc" ? 0.68 : 1.35) * (1 + Math.sin(pulse) * 0.06));
        ring.visible = true;
      } else {
        ring.visible = false;
      }
      if (selected && (refresh += dt) >= 0.35) { refresh = 0; renderModal(false); }
    },
  };
}

