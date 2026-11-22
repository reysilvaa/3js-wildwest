import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

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
}

export function initScene(options: SceneOptions = {}): SceneContext {
  const {
    fogColor = 0xd6a876,
    fogDensity = 0.01,
    cameraPos = [10.0, 14.0, 28.0],
    sunPos = [30, 45, -20],
  } = options;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(fogColor);
  scene.fog = new THREE.FogExp2(fogColor, fogDensity);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(...cameraPos);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
    precision: "mediump",
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = true;
  document.body.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.minDistance = 2;
  controls.maxDistance = 70;
  controls.target.set(10.0, 1.5, -6.0);

  // Warm western hemisphere light: sky warm gold, ground warm desert sand bounce
  const hemiLight = new THREE.HemisphereLight(0xffeedd, 0xd4a578, 1.4);
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

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer, controls, sunLight, hemiLight };
}
