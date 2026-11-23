import * as THREE from "three";
import { getGroundElevation, getGroundHeightOnly } from "./height.js";

export { getGroundElevation, getGroundHeightOnly };

export interface GroundOptions {
  size?: number;
  segments?: number;
  townCenter?: [number, number];
  flatRadius?: number;
}

export interface GroundSystem {
  mesh: THREE.Mesh;
  puddleMesh: THREE.Object3D | null;
  update: (dt: number, isRaining: boolean) => void;
}

function createSoftAlphaMap(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, 256, 256);

    const radGrad = ctx.createRadialGradient(128, 128, 40, 128, 128, 122);
    radGrad.addColorStop(0, "rgba(255, 255, 255, 1.0)");
    radGrad.addColorStop(0.6, "rgba(255, 255, 255, 0.85)");
    radGrad.addColorStop(1, "rgba(255, 255, 255, 0.0)");
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function initDesertGround(scene: THREE.Scene, options: GroundOptions = {}): GroundSystem {
  const {
    size = 1200,
    segments = 64,
    townCenter = [10, -5],
    flatRadius = 85,
  } = options;

  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  // SAFETY: Standard position attribute from PlaneGeometry
  const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
  const count = posAttr.count;
  const [tcX, tcZ] = townCenter;

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    posAttr.setY(i, getGroundHeightOnly(x, z, tcX, tcZ, flatRadius));
  }

  geo.computeVertexNormals();
  geo.setAttribute("uv2", geo.getAttribute("uv"));

  const texLoader = new THREE.TextureLoader();

  function loadPbrSet(folder: string, repX: number, repY = repX) {
    const load = (name: string, isColor = false): THREE.Texture => {
      const tex = texLoader.load(`${folder}/${name}.jpg`);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repX, repY);
      if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };
    return {
      color: load("color", true),
      normal: load("normal"),
      roughness: load("roughness"),
      ao: load("ao"),
    };
  }

  const sand = loadPbrSet("/models/ground/sand", 120);
  const mud = loadPbrSet("/models/ground/mud", 6, 10);

  const drySandColor = new THREE.Color(0xdab47c);
  const wetSandColor = new THREE.Color(0x7c5836);

  const sandMat = new THREE.MeshStandardMaterial({
    map: sand.color,
    normalMap: sand.normal,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: sand.roughness,
    aoMap: sand.ao,
    color: drySandColor.clone(),
    roughness: 0.94,
    metalness: 0.0,
    envMapIntensity: 0.5,
  });

  const mesh = new THREE.Mesh(geo, sandMat);
  mesh.name = "DesertGroundExpanse";
  mesh.receiveShadow = true;
  scene.add(mesh);

  const streetGeo = new THREE.PlaneGeometry(54, 88, 2, 2);
  streetGeo.rotateX(-Math.PI / 2);
  streetGeo.translate(10, 0.014, -7);
  streetGeo.setAttribute("uv2", streetGeo.getAttribute("uv"));

  const softAlphaTex = createSoftAlphaMap();

  const mudStreetMat = new THREE.MeshStandardMaterial({
    map: mud.color,
    normalMap: mud.normal,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughnessMap: mud.roughness,
    aoMap: mud.ao,
    alphaMap: softAlphaTex,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    roughness: 0.28,
    metalness: 0.04,
    envMapIntensity: 2.2,
  });

  const mudStreetMesh = new THREE.Mesh(streetGeo, mudStreetMat);
  mudStreetMesh.name = "TownStreetMudPuddles";
  mudStreetMesh.receiveShadow = true;
  mudStreetMesh.visible = false;
  scene.add(mudStreetMesh);

  let wetness = 0; // 0 (dry) -> 1 (full rain accumulation)

  function update(dt: number, isRaining: boolean): void {
    const targetWetness = isRaining ? 1.0 : 0.0;
    const transitionRate = (isRaining ? 0.35 : 0.16) * dt;

    if (Math.abs(wetness - targetWetness) > 0.005) {
      wetness += Math.sign(targetWetness - wetness) * Math.min(transitionRate, Math.abs(targetWetness - wetness));
    } else {
      wetness = targetWetness;
    }

    sandMat.roughness = THREE.MathUtils.lerp(0.94, 0.65, wetness);
    sandMat.color.lerpColors(drySandColor, wetSandColor, wetness);

    mudStreetMat.opacity = wetness;
    mudStreetMesh.visible = wetness > 0.01;
  }

  return {
    mesh,
    get puddleMesh() { return mudStreetMesh; },
    update,
  };
}
