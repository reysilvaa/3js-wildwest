import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
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
.insp-tip{position:fixed;left:0;top:0;z-index:60;pointer-events:none;display:none;flex-direction:column;align-items:center;gap:2px;min-width:128px;padding:12px 20px 26px 20px;background:url("/ui/bubble-frame.png") center/100% 100% no-repeat;filter:drop-shadow(0 12px 24px rgba(0,0,0,.78));font:900 12px/1.1 'Cinzel','Rye',Georgia,serif;color:#84181a;letter-spacing:.07em;text-transform:uppercase;text-shadow:0 1px 0 rgba(255,245,220,.75);white-space:nowrap;will-change:transform}
.insp-tip small{font:700 10.5px/1.1 Georgia,serif;color:#2c1810;letter-spacing:.02em;text-transform:none;text-shadow:0 1px 0 rgba(255,245,220,.6)}
.insp-drawer{position:fixed;top:16px;right:16px;bottom:16px;z-index:65;width:356px;max-width:calc(100vw - 32px);display:flex;flex-direction:column;gap:14px;padding:48px 44px 44px;border:none;border-radius:6px;background:url("/ui/detail-panel-frame.jpg") center/100% 100% no-repeat;box-shadow:-10px 14px 36px rgba(0,0,0,.78);color:#2c1810;font-family:Georgia,serif;transform:translateX(calc(100% + 28px));opacity:0;pointer-events:none;transition:transform .24s cubic-bezier(.22,1,.36,1),opacity .2s ease;overflow-y:auto}
.insp-drawer.open{transform:translateX(0);opacity:1;pointer-events:auto}
.insp-stage{position:relative;width:100%;aspect-ratio:1/1;flex-shrink:0;border-radius:5px;overflow:hidden;border:1.5px solid #7d1214;background:radial-gradient(circle at 50% 42%,#3b2618 0%,#1a100a 100%);box-shadow:inset 0 0 24px rgba(0,0,0,.65);cursor:grab}
.insp-stage:active{cursor:grabbing}
.insp-stage canvas{width:100%;height:100%;display:block}
.insp-stage-hint{position:absolute;bottom:6px;right:8px;font:700 10px Georgia,serif;color:rgba(245,232,200,.55);pointer-events:none;letter-spacing:.04em}
.insp-body{display:flex;flex-direction:column;gap:10px;flex:1}
.insp-head{display:flex;align-items:center;gap:10px;padding-bottom:8px;border-bottom:1px solid rgba(125,18,20,.28)}
.insp-av{width:46px;height:46px;border-radius:50%;object-fit:cover;flex-shrink:0;background:#dfc392;border:2px solid #7d1214}
.insp-ic{width:44px;height:44px;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:#2c1810;color:#cba043;border:2px solid #7d1214;font:900 18px 'Cinzel',Georgia,serif}
.insp-name{font:900 15px 'Cinzel',Georgia,serif;color:#84181a;text-transform:uppercase;letter-spacing:.05em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.insp-tags{display:flex;gap:5px;margin-top:3px}
.insp-tag{font:800 10px Georgia,serif;text-transform:uppercase;padding:2px 6px;border-radius:3px;background:#2c1810;color:#f5e8c8}
.insp-tag.red{background:#84181a}
.insp-x{margin-left:auto;align-self:flex-start;background:none;border:none;cursor:pointer;color:#7d1214;font:900 18px/1 sans-serif;padding:2px 4px}
.insp-grid{display:grid;grid-template-columns:auto 1fr;gap:6px 10px;font-size:12.5px}
.insp-k{font:700 10px Georgia,serif;color:#6b442a;text-transform:uppercase;letter-spacing:.04em}
.insp-v{font-weight:600;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.insp-occ{display:flex;flex-wrap:wrap;gap:6px;padding:8px;border-radius:4px;background:rgba(44,24,16,.08)}
.insp-chip{display:flex;align-items:center;gap:5px;padding:3px 8px 3px 3px;border-radius:99px;border:1.5px solid #7d1214;background:#f8edd2;cursor:pointer;color:#2c1810;font:700 11px Georgia,serif}
.insp-chip img{width:22px;height:22px;border-radius:50%;object-fit:cover;border:1px solid #7d1214}
.insp-acts{display:flex;gap:10px;margin-top:auto;padding-top:10px;border-top:1px solid rgba(125,18,20,.25)}
.insp-btn{flex:1;padding:10px 12px;border-radius:3px;border:1.5px solid #4a0a0c;background:linear-gradient(180deg,#8d1a1c,#670f11);box-shadow:0 3px 8px rgba(44,24,16,.38),inset 0 0 0 1px rgba(203,160,67,.42);cursor:pointer;color:#f7ebd0;font:800 11px/1.1 'Cinzel',Georgia,serif;text-transform:uppercase;letter-spacing:.08em;text-shadow:0 1px 2px rgba(0,0,0,.55);transition:filter .12s ease,transform .12s ease}
.insp-btn:hover{filter:brightness(1.12);transform:translateY(-1px)}
.insp-btn:active{transform:translateY(0);filter:brightness(.95)}
.insp-btn.alt{border-color:#2c1810;background:linear-gradient(180deg,#3b2317,#24130b);color:#f3e2bc}
`;

export function initInspector({ scene, camera, controls, domElement, npcs, getBuildings, onTalk }: InspectorOptions) {
  if (!document.getElementById("frontier-inspector-styles")) {
    const s = document.createElement("style");
    s.id = "frontier-inspector-styles";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  const tip = document.body.appendChild(Object.assign(document.createElement("div"), { className: "insp-tip" }));
  const drawer = document.body.appendChild(Object.assign(document.createElement("aside"), { className: "insp-drawer" }));
  drawer.setAttribute("role", "dialog");
  const stage = drawer.appendChild(Object.assign(document.createElement("div"), { className: "insp-stage" }));
  stage.appendChild(Object.assign(document.createElement("div"), { className: "insp-stage-hint", textContent: "DRAG TO ROTATE" }));
  const body = drawer.appendChild(Object.assign(document.createElement("div"), { className: "insp-body" }));

  // Lazy 1:1 live preview renderer (0 GPU RAM until first click, 30Hz while open)
  const pvScene = new THREE.Scene();
  const pvCam = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
  let pvRenderer: THREE.WebGLRenderer | null = null;
  function getPvRenderer(): THREE.WebGLRenderer {
    if (pvRenderer) return pvRenderer;
    pvRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    pvRenderer.setPixelRatio(1);
    pvRenderer.setSize(288, 288, false);
    pvRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    pvRenderer.toneMappingExposure = 1.25;
    stage.prepend(pvRenderer.domElement);
    return pvRenderer;
  }

  const keyLight = new THREE.DirectionalLight(0xfff2d6, 2.2);
  keyLight.position.set(4, 7, 6);
  const rimLight = new THREE.DirectionalLight(0xffb45c, 0.9);
  rimLight.position.set(-5, 4, -5);
  const pvPivot = new THREE.Group();
  pvScene.add(new THREE.HemisphereLight(0xfff1d6, 0x4a2f1d, 1.35), keyLight, rimLight, pvPivot);

  let pvMixer: THREE.AnimationMixer | null = null;
  let pvKey = "", pvSpin = 0, pvDrag = false, pvDragX = 0, pvAccum = 0;
  stage.addEventListener("pointerdown", (e) => { pvDrag = true; pvDragX = e.clientX; });
  window.addEventListener("pointermove", (e) => { if (pvDrag) { pvSpin += (e.clientX - pvDragX) * 0.012; pvDragX = e.clientX; } });
  window.addEventListener("pointerup", () => { pvDrag = false; });

  function mountNPCPreview(npc: NPCController) {
    if (!npc.model) return;
    const clone = SkeletonUtils.clone(npc.model.root);
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, 0, 0);
    clone.scale.setScalar(1);
    clone.traverse((c) => { c.frustumCulled = false; c.visible = true; });
    pvPivot.add(clone);

    const st = npc.getState();
    const pref = st === "WALK" || st === "ENTERING" || st === "EXITING" ? "Walk" : "Wave";
    const clip = npc.model.animations.get(pref) ?? npc.model.animations.get("Walk") ?? npc.model.animations.get("Wave");
    if (clip) { pvMixer = new THREE.AnimationMixer(clone); pvMixer.clipAction(clip).play(); pvMixer.update(0.016); }
    pvPivot.updateMatrixWorld(true);

    const head = clone.getObjectByName("Head_08");
    const hp = head ? head.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 1.55, 0);
    clone.position.set(-hp.x, 0, -hp.z);
    pvCam.position.set(0, hp.y - 0.02, 1.35);
    pvCam.lookAt(0, hp.y - 0.08, 0);
  }

  function mountBuildingPreview(bldg: InteractiveBuilding) {
    const clone = bldg.root.clone(true);
    clone.visible = true;
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, 0, 0);
    clone.getObjectByName("__inspHl")?.removeFromParent();
    clone.traverse((c) => { c.frustumCulled = false; });
    pvPivot.add(clone);
    pvPivot.updateMatrixWorld(true);

    const door = clone.getObjectByName("DoorPivot");
    const entry = clone.getObjectByName("DoorEntry");
    if (door && entry) {
      const dp = door.getWorldPosition(new THREE.Vector3());
      const ep = entry.getWorldPosition(new THREE.Vector3());
      clone.rotation.y = -Math.atan2(ep.x - dp.x, ep.z - dp.z) + 0.32;
      pvPivot.updateMatrixWorld(true);
    }
    const box = new THREE.Box3().setFromObject(clone);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    clone.position.set(-center.x, -center.y, -center.z);
    const dist = Math.max(Math.max(size.x, size.y * 1.15, size.z * 0.85) * 1.75, 7);
    pvCam.position.set(0, size.y * 0.22, dist);
    pvCam.lookAt(0, -size.y * 0.04, 0);
  }

  function setPreviewTarget(target: Target) {
    const key = !target ? "" : target.kind === "npc" ? `n:${target.npc.id}` : `b:${target.building.id}`;
    if (key === pvKey) return;
    pvKey = key;
    pvMixer?.stopAllAction();
    pvMixer = null;
    pvPivot.clear();
    pvPivot.rotation.set(0, 0, 0);
    pvSpin = 0;
    if (!target) return;
    if (target.kind === "npc") mountNPCPreview(target.npc);
    else mountBuildingPreview(target.building);
    getPvRenderer().render(pvScene, pvCam);
  }

  // Hover visuals: NPC foot ring + full-building additive silhouette (0 material clones)
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.75, 1.0, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xe6b84c, transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide })
  );
  ring.visible = false;
  scene.add(ring);

  const bldgHlMat = new THREE.MeshBasicMaterial({
    color: 0xf5c84c, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const noop = () => {};
  const bldgHlMap = new WeakMap<THREE.Object3D, THREE.Group>();
  let activeBldgHl: THREE.Group | null = null;

  function getBuildingHighlight(root: THREE.Object3D): THREE.Group {
    const cached = bldgHlMap.get(root);
    if (cached) return cached;
    const hl = Object.assign(new THREE.Group(), { name: "__inspHl", visible: false });
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    root.traverse((c) => {
      // SAFETY: Type assertion verified by Three.js isMesh property check
      if (!(c as THREE.Mesh).isMesh || c.name === "DoorBackdrop") return;
      const m = new THREE.Mesh((c as THREE.Mesh).geometry, bldgHlMat);
      m.matrixAutoUpdate = false;
      m.matrix.multiplyMatrices(inv, c.matrixWorld);
      m.raycast = noop;
      hl.add(m);
    });
    root.add(hl);
    bldgHlMap.set(root, hl);
    return hl;
  }

  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let hovered: Target = null, selected: Target = null;
  let px = 0, py = 0, dx = 0, dy = 0, lastMove = 0, refresh = 0, pulse = 0, lastSig = "";

  // ponytail: linear scan over <=32 NPCs & <=25 buildings on click/16Hz hover; use Map if >200
  function resolveHit(obj: THREE.Object3D | null): Target {
    for (let c = obj; c; c = c.parent) {
      const { npcId, buildingId } = c.userData;
      if (npcId) { const npc = npcs.find((n) => n.id === npcId); if (npc) return { kind: "npc", npc }; }
      if (buildingId) { const building = getBuildings().find((b) => b.id === buildingId); if (building) return { kind: "building", building }; }
    }
    return null;
  }

  function pickAt(cx: number, cy: number): Target {
    const r = domElement.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    for (const list of [npcs.map((n) => n.model?.root).filter((x): x is THREE.Group => !!x?.visible), getBuildings().map((b) => b.root)]) {
      if (!list.length) continue;
      const hit = raycaster.intersectObjects(list, true)[0];
      if (hit) return resolveHit(hit.object);
    }
    return null;
  }

  const focusOn = (p: THREE.Vector3, dist: number, h: number) => {
    controls.target.set(p.x, p.y + 1.4, p.z);
    camera.position.set(p.x + dist * 0.45, p.y + h, p.z + dist);
    controls.update();
  };

  function select(target: Target) {
    selected = target;
    renderDrawer(true);
  }

  function renderDrawer(force = false) {
    setPreviewTarget(selected);
    if (!selected) { drawer.classList.remove("open"); lastSig = ""; return; }
    if (selected.kind === "npc") {
      const n = selected.npc, p = n.getPosition(), st = n.getState(), act = n.getCurrentActivity(), bldg = n.getCurrentBuilding();
      const sig = `n:${n.id}:${st}:${act}:${bldg ?? ""}:${p.x.toFixed(0)},${p.z.toFixed(0)}`;
      if (!force && sig === lastSig) return;
      lastSig = sig;
      body.innerHTML =
        `<div class="insp-head"><img class="insp-av" src="${n.getPortraitUrl()}" alt="${n.name}"/><div>` +
        `<div class="insp-name">${n.name}</div><div class="insp-tags"><span class="insp-tag red">${st}</span><span class="insp-tag">${n.getZone()}</span></div></div>` +
        `<button class="insp-x" data-act="close" title="Close (Esc)">✕</button></div>` +
        `<div class="insp-grid"><span class="insp-k">Activity</span><span class="insp-v">${st === "INDOORS" && bldg ? `Inside ${bldg}` : act}</span>` +
        `<span class="insp-k">District</span><span class="insp-v">${n.getZone().toUpperCase()} TOWN</span>` +
        `<span class="insp-k">Position</span><span class="insp-v">${p.x.toFixed(1)}, ${p.z.toFixed(1)}</span></div>` +
        `<div class="insp-acts"><button class="insp-btn" data-act="focus">Focus Cam</button><button class="insp-btn alt" data-act="talk">Greet</button></div>`;
    } else {
      const b = selected.building, sig = `b:${b.id}:${b.occupants.map((o) => o.id).join(",")}`;
      if (!force && sig === lastSig) return;
      lastSig = sig;
      const occ = b.occupants.length
        ? b.occupants.map((o) => `<button class="insp-chip" data-npc="${o.id}"><img src="${o.portraitUrl}" alt="${o.name}"/>${o.name}</button>`).join("")
        : `<small style="font-style:italic;color:#6b442a">Empty right now.</small>`;
      const iconHtml = b.iconUrl
        ? `<img class="insp-av" src="${b.iconUrl}" alt="${b.label}"/>`
        : `<div class="insp-ic">${b.label[0]}</div>`;
      body.innerHTML =
        `<div class="insp-head">${iconHtml}<div>` +
        `<div class="insp-name">${b.label}</div><div class="insp-tags"><span class="insp-tag red">OPEN</span><span class="insp-tag">${b.occupants.length} INSIDE</span></div></div>` +
        `<button class="insp-x" data-act="close" title="Close (Esc)">✕</button></div>` +
        `<div class="insp-k">Occupants</div><div class="insp-occ">${occ}</div>` +
        `<div class="insp-acts"><button class="insp-btn" data-act="focus">Focus Cam</button><button class="insp-btn alt" data-act="door">Open Door</button></div>`;
    }
    drawer.classList.add("open");
  }

  body.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-act],[data-npc]");
    if (!el) return;
    if (el.dataset.npc) { const npc = npcs.find((n) => n.id === el.dataset.npc); if (npc) select({ kind: "npc", npc }); return; }
    const act = el.dataset.act;
    if (act === "close") select(null);
    else if (act === "focus" && selected) focusOn(selected.kind === "npc" ? selected.npc.getPosition() : selected.building.entryPos, selected.kind === "npc" ? 5.5 : 11.5, selected.kind === "npc" ? 2.8 : 6);
    else if (act === "talk" && selected?.kind === "npc") { selected.npc.faceTarget(camera.position, 4.5); selected.npc.pause(3.5); onTalk?.(selected.npc); }
    else if (act === "door" && selected?.kind === "building") triggerBuildingDoor(selected.building, 3.0);
  });

  domElement.addEventListener("pointermove", (e) => {
    px = e.clientX; py = e.clientY;
    if (hovered) tip.style.transform = `translate3d(${px}px,${py - 6}px,0) translate(-13.27%,-100%)`;
    const now = performance.now();
    if (now - lastMove < 60) return;
    lastMove = now;
    hovered = pickAt(px, py);
    domElement.style.cursor = hovered ? "pointer" : "";
    if (!hovered) { tip.style.display = "none"; return; }
    tip.innerHTML = hovered.kind === "npc"
      ? `<span>${hovered.npc.name}</span><small>${hovered.npc.getState()} · ${hovered.npc.getCurrentActivity()}</small>`
      : `<span>${hovered.building.label}</span><small>${hovered.building.occupants.length ? `${hovered.building.occupants.length} inside` : "Click to inspect"}</small>`;
    tip.style.display = "flex";
    tip.style.transform = `translate3d(${px}px,${py - 6}px,0) translate(-13.27%,-100%)`;
  });
  domElement.addEventListener("pointerleave", () => { hovered = null; domElement.style.cursor = ""; tip.style.display = "none"; });
  domElement.addEventListener("pointerdown", (e) => { dx = e.clientX; dy = e.clientY; });
  domElement.addEventListener("pointerup", (e) => { if (e.button === 0 && Math.hypot(e.clientX - dx, e.clientY - dy) <= 6) { const hit = pickAt(e.clientX, e.clientY); if (hit) select(hit); } });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && selected) select(null); });

  return {
    inspectNPCByIndex(i: number) {
      const npc = npcs[i % npcs.length];
      if (npc) { select({ kind: "npc", npc }); focusOn(npc.getPosition(), 5.5, 2.8); }
    },
    update(dt: number) {
      const active = hovered ?? selected;
      const isNpc = active?.kind === "npc" && !!active.npc.model?.root.visible;
      const isBldg = active?.kind === "building";
      ring.visible = isNpc;
      if (isNpc) {
        pulse += dt * 4.2;
        const p = active.npc.getPosition();
        ring.position.set(p.x, p.y + 0.07, p.z);
        ring.scale.setScalar(0.68 * (1 + Math.sin(pulse) * 0.06));
      }
      const nextHl = isBldg ? getBuildingHighlight(active.building.root) : null;
      if (activeBldgHl && activeBldgHl !== nextHl) activeBldgHl.visible = false;
      activeBldgHl = nextHl;
      if (activeBldgHl) { pulse += dt * 3.5; bldgHlMat.opacity = 0.16 + Math.sin(pulse) * 0.05; activeBldgHl.visible = true; }
      if (selected) {
        pvAccum += dt;
        if (pvAccum >= 0.033 || pvDrag) {
          pvPivot.rotation.y = pvSpin;
          pvMixer?.update(pvAccum);
          pvAccum = 0;
          getPvRenderer().render(pvScene, pvCam);
        }
        if ((refresh += dt) >= 0.35) { refresh = 0; renderDrawer(false); }
      }
    },
  };
}

