import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Lensflare, LensflareElement } from "three/addons/objects/Lensflare.js";

export interface SceneOptions {
  fogColor?: number;
  fogDensity?: number;
  cameraPos?: [number, number, number];
  sunPos?: [number, number, number];
}

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  sunLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  flare: Lensflare;
}

export function initScene(options: SceneOptions = {}): SceneContext {
  const {
    fogColor = 0xd6a876,
    fogDensity = 0.01,
    cameraPos = [10, 12, -25],
    sunPos = [30, 45, -20],
  } = options;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(fogColor);
  scene.fog = new THREE.FogExp2(fogColor, fogDensity);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(...cameraPos);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.15));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;
  document.body.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.minDistance = 2;
  controls.maxDistance = 150;
  controls.target.set(10, 3, 15);

  const hemiLight = new THREE.HemisphereLight(0xffe2b8, 0x8a6a4b, 1.2);
  hemiLight.position.set(0, 50, 0);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfff5dd, 2.6);
  sunLight.position.set(...sunPos);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 150;
  sunLight.shadow.camera.left = -55;
  sunLight.shadow.camera.right = 55;
  sunLight.shadow.camera.top = 55;
  sunLight.shadow.camera.bottom = -55;
  sunLight.shadow.bias = -0.0003;
  sunLight.shadow.radius = 1.5;
  scene.add(sunLight);

  // Lightweight procedural lens flare
  const flareCanvas = document.createElement("canvas");
  flareCanvas.width = 64;
  flareCanvas.height = 64;
  const fCtx = flareCanvas.getContext("2d");
  if (fCtx) {
    const grad = fCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255, 255, 255, 1)");
    grad.addColorStop(0.3, "rgba(255, 220, 140, 0.5)");
    grad.addColorStop(1, "rgba(255, 200, 100, 0)");
    fCtx.fillStyle = grad;
    fCtx.fillRect(0, 0, 64, 64);
  }
  const flareTex = new THREE.CanvasTexture(flareCanvas);
  const flare = new Lensflare();
  flare.addElement(new LensflareElement(flareTex, 320, 0, new THREE.Color(0xfff0cc)));
  flare.addElement(new LensflareElement(flareTex, 70, 0.5, new THREE.Color(0xffaa44)));
  flare.addElement(new LensflareElement(flareTex, 120, 0.8, new THREE.Color(0xff7722)));
  sunLight.add(flare);

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer, controls, sunLight, hemiLight, flare };
}
