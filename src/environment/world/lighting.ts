import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { IS_MOBILE } from "@/ui/mobile.js";

export interface TownLightsConfig {
  indoor?: Array<{ pos: [number, number, number]; color: number; maxIntensity: number; distance: number; decay: number }>;
  lanterns?: Array<[number, number, number]>;
  windowSpills?: Array<{ origin: [number, number, number]; target: [number, number, number]; angle: number; penumbra: number; distance: number; maxIntensity: number }>;
}

export interface TownLightingOptions {
  lightsUrl?: string;
  poolSize?: number;
  lightColor?: number;
  windowColor?: number;
  shaftLodDist?: number;
}

export interface TownLightingSystem {
  registerWindowMaterial: (mat: THREE.MeshStandardMaterial) => void;
  registerLightShaft: (mesh: THREE.Mesh) => void;
  registerAnchor: (pos: THREE.Vector3) => void;
  update: (dt: number) => void;
  setFactor: (factor: number) => void;
}

const NOOP_RAYCAST = () => {};

/**
 * Reusable 1885 frontier firelight/lantern lighting system:
 * - 1 shared Fresnel-softened volumetric window shaft ShaderMaterial
 * - Fixed N-PointLight dynamic pool (0 GLSL shader recompiles)
 * - Emissive window glass + dual-harmonic flame flicker + distance LOD
 */
export function initTownLighting(
  scene: THREE.Scene,
  camera: THREE.Camera,
  controls: OrbitControls,
  options: TownLightingOptions = {}
): TownLightingSystem {
  const {
    lightsUrl = IS_MOBILE ? "" : "/models/town_lights.json",
    poolSize = IS_MOBILE ? 3 : 6,
    lightColor = 0xe66e1e,
    windowColor = 0xd96e1c,
    shaftLodDist = IS_MOBILE ? 60 : 85,
  } = options;

  const shaftLodDistSq = shaftLodDist * shaftLodDist;
  const windowMaterials: THREE.MeshStandardMaterial[] = [];
  const shaftMeshes: THREE.Mesh[] = [];
  const dynamicLights: { light: THREE.PointLight | THREE.SpotLight; max: number }[] = [];
  const anchors: THREE.Vector3[] = [];

  const shaftUniforms = { uIntensity: { value: 0 } };
  const shaftMat = new THREE.ShaderMaterial({
    uniforms: shaftUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalV;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vNormalV = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uIntensity;
      varying vec2 vUv;
      varying vec3 vNormalV;
      varying vec3 vViewDir;
      void main() {
        float distT = clamp(1.0 - vUv.y, 0.0, 1.0);
        float startSoft = smoothstep(0.0, 0.14, distT);
        float lenFade = pow(smoothstep(0.92, 0.0, distT), 2.8) * startSoft;
        float sideSoft = pow(sin(clamp(vUv.x, 0.0, 1.0) * 3.14159265), 2.6);
        float fresnel = pow(abs(dot(normalize(vNormalV), normalize(vViewDir))), 2.5);
        float alpha = lenFade * fresnel * sideSoft * uIntensity * 0.14;
        if (alpha < 0.002) discard;
        vec3 col = mix(vec3(0.94, 0.52, 0.16), vec3(0.62, 0.20, 0.04), distT);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  // Fixed PointLight pool (never toggles .visible -> 0 shader recompilations)
  const pooledLights: THREE.PointLight[] = [];
  for (let i = 0; i < poolSize; i++) {
    const pl = new THREE.PointLight(lightColor, 0, 15, 1.85);
    pl.position.set(0, -100, 0);
    scene.add(pl);
    pooledLights.push(pl);
  }

  if (lightsUrl) {
    fetch(lightsUrl)
      .then((res): Promise<TownLightsConfig> => (res.ok ? res.json() : Promise.resolve({})))
      .then((data) => {
        for (const cfg of data.indoor ?? []) {
          const light = new THREE.PointLight(cfg.color, 0, cfg.distance, cfg.decay);
          light.position.set(...cfg.pos);
          scene.add(light);
          dynamicLights.push({ light, max: cfg.maxIntensity });
        }
        for (const pos of data.lanterns ?? []) {
          const light = new THREE.PointLight(lightColor, 0, 16, 2.0);
          light.position.set(...pos);
          scene.add(light);
          dynamicLights.push({ light, max: 2.2 });
        }
        for (const cfg of data.windowSpills ?? []) {
          const light = new THREE.SpotLight(lightColor, 0, cfg.distance, cfg.angle, cfg.penumbra, 2.0);
          light.position.set(...cfg.origin);
          light.target.position.set(...cfg.target);
          scene.add(light, light.target);
          dynamicLights.push({ light, max: cfg.maxIntensity });
        }
      })
      .catch((err) => console.warn("[TownLighting] Failed to load lights config:", err));
  }

  let lastFactor = -1;
  let flickerPhase = 0;
  let lodTimer = 0;

  function registerWindowMaterial(mat: THREE.MeshStandardMaterial): void {
    if (windowMaterials.includes(mat)) return;
    windowMaterials.push(mat);
    mat.emissive.setHex(windowColor);
    mat.emissiveIntensity = 0;
  }

  function registerLightShaft(mesh: THREE.Mesh): void {
    mesh.material = shaftMat;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = false;
    mesh.raycast = NOOP_RAYCAST;
    shaftMeshes.push(mesh);
  }

  function registerAnchor(pos: THREE.Vector3): void {
    anchors.push(pos);
  }

  function update(dt: number): void {
    flickerPhase += dt;
    lodTimer += dt;
  }

  function setFactor(factor: number): void {
    const clamped = Math.max(0, Math.min(1, factor));
    const active = clamped > 0.01;
    if (!active && lastFactor <= 0.01 && lastFactor >= 0) return;
    if (active && Math.abs(clamped - lastFactor) < 0.004 && lodTimer < 0.12) return;
    lodTimer = 0;
    lastFactor = clamped;

    const pulse = active
      ? 1.0 + Math.sin(flickerPhase * 6.3) * 0.045 + Math.sin(flickerPhase * 13.7) * 0.025
      : 0;

    for (let i = 0; i < windowMaterials.length; i++) {
      windowMaterials[i]!.emissiveIntensity = clamped * 2.4 * pulse;
    }

    const camPos = camera.position;
    shaftUniforms.uIntensity.value = clamped * pulse;
    for (let i = 0; i < shaftMeshes.length; i++) {
      const m = shaftMeshes[i]!;
      const p = m.parent ? m.parent.position : m.position;
      m.visible = active && camPos.distanceToSquared(p) < shaftLodDistSq;
    }

    const focusPos = controls.target;
    if (!active || anchors.length === 0) {
      for (let i = 0; i < pooledLights.length; i++) pooledLights[i]!.intensity = 0;
    } else {
      const scored = anchors
        .map((pos) => ({ pos, dSq: focusPos.distanceToSquared(pos) }))
        .sort((a, b) => a.dSq - b.dSq);
      for (let i = 0; i < pooledLights.length; i++) {
        const pl = pooledLights[i]!;
        const target = scored[i];
        if (!target || target.dSq > 2025) {
          pl.intensity = 0;
        } else {
          pl.position.copy(target.pos);
          const fade = target.dSq > 900 ? 1.0 - (Math.sqrt(target.dSq) - 30) / 15 : 1.0;
          pl.intensity = clamped * 4.2 * pulse * fade;
        }
      }
    }

    for (let i = 0; i < dynamicLights.length; i++) {
      const item = dynamicLights[i]!;
      if (!active) {
        item.light.intensity = 0;
        continue;
      }
      const dSq = camPos.distanceToSquared(item.light.position);
      if (dSq > 1600) {
        item.light.intensity = 0;
      } else {
        const fade = dSq > 784 ? 1.0 - (Math.sqrt(dSq) - 28) / 12 : 1.0;
        item.light.intensity = clamped * item.max * pulse * fade;
      }
    }
  }

  return { registerWindowMaterial, registerLightShaft, registerAnchor, update, setFactor };
}
