import * as THREE from "three";

export interface GroundOptions {
  size?: number;
  segments?: number;
  townCenter?: [number, number];
  flatRadius?: number;
}

export function initDesertGround(scene: THREE.Scene, options: GroundOptions = {}): THREE.Mesh {
  const {
    size = 1200,
    segments = 64,
    townCenter = [10, -5],
    flatRadius = 50,
  } = options;

  // 1. Procedural Sand Dunes Geometry
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  // SAFETY: Standard position attribute from PlaneGeometry
  const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
  const count = posAttr.count;
  const [tcX, tcZ] = townCenter;

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);

    const dist = Math.hypot(x - tcX, z - tcZ);

    if (dist < flatRadius) {
      // Flat inner apron around town
      posAttr.setY(i, 0.0);
    } else {
      // Smoothstep transition factor from flat town to rolling dunes
      const t = Math.min(1, Math.max(0, (dist - flatRadius) / 70));
      const blend = t * t * (3 - 2 * t);

      // Rolling desert dunes
      const dunes =
        Math.sin(x * 0.022 + z * 0.015) * 3.2 +
        Math.cos(x * 0.012 - z * 0.018) * 2.6 +
        Math.sin(dist * 0.018) * 1.5;

      // Distant desert mesas and buttes at perimeter (dist > 220m)
      let mesa = 0;
      if (dist > 220) {
        const mesaNoise = Math.sin(x * 0.007) * Math.cos(z * 0.007);
        if (mesaNoise > 0.35) {
          mesa = Math.min(28, (mesaNoise - 0.35) * 60);
        }
      }

      posAttr.setY(i, blend * (dunes + mesa));
    }
  }

  geo.computeVertexNormals();

  // 2. High-Quality Procedural Sand Canvas Texture with wind ripple lines
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    // Base sand gradient
    const grad = ctx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, "#d8a470");
    grad.addColorStop(0.5, "#ce9864");
    grad.addColorStop(1, "#c58e5a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // Subtle desert wind ripple waves
    ctx.strokeStyle = "rgba(180, 130, 80, 0.25)";
    ctx.lineWidth = 1.5;
    for (let y = 0; y < 256; y += 8) {
      ctx.beginPath();
      for (let x = 0; x <= 256; x += 16) {
        const wave = Math.sin(x * 0.05 + y * 0.1) * 3;
        if (x === 0) ctx.moveTo(x, y + wave);
        else ctx.lineTo(x, y + wave);
      }
      ctx.stroke();
    }

    // Granular sand speckle noise
    const imgData = ctx.getImageData(0, 0, 256, 256);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 18;
      // SAFETY: Clamping byte color values
      data[i + 0] = Math.min(255, Math.max(0, (data[i + 0] ?? 200) + noise));
      data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] ?? 150) + noise * 0.8));
      data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] ?? 100) + noise * 0.6));
    }
    ctx.putImageData(imgData, 0, 0);
  }

  const sandTexture = new THREE.CanvasTexture(canvas);
  sandTexture.wrapS = THREE.RepeatWrapping;
  sandTexture.wrapT = THREE.RepeatWrapping;
  sandTexture.repeat.set(120, 120);

  // 3. PBR Desert Sand Material
  const mat = new THREE.MeshStandardMaterial({
    map: sandTexture,
    color: new THREE.Color(0xd29d66),
    roughness: 0.94,
    metalness: 0.02,
    envMapIntensity: 0.8,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "DesertGroundExpanse";
  mesh.receiveShadow = true;
  scene.add(mesh);

  return mesh;
}

export function getGroundHeightOnly(
  x: number,
  z: number,
  tcX = 10,
  tcZ = -5,
  flatRadius = 45
): number {
  const dist = Math.hypot(x - tcX, z - tcZ);
  if (dist < flatRadius) return 0.0;
  const t = Math.min(1, Math.max(0, (dist - flatRadius) / 70));
  const blend = t * t * (3 - 2 * t);
  const dunes =
    Math.sin(x * 0.022 + z * 0.015) * 3.2 +
    Math.cos(x * 0.012 - z * 0.018) * 2.6 +
    Math.sin(dist * 0.018) * 1.5;
  let mesa = 0;
  if (dist > 220) {
    const mesaNoise = Math.sin(x * 0.007) * Math.cos(z * 0.007);
    if (mesaNoise > 0.35) {
      mesa = Math.min(28, (mesaNoise - 0.35) * 60);
    }
  }
  return blend * (dunes + mesa);
}

export function getGroundElevation(
  x: number,
  z: number,
  tcX = 10,
  tcZ = -5,
  flatRadius = 45
): { height: number; normal: THREE.Vector3 } {
  const height = getGroundHeightOnly(x, z, tcX, tcZ, flatRadius);
  const eps = 0.2;
  const hX = getGroundHeightOnly(x + eps, z, tcX, tcZ, flatRadius);
  const hZ = getGroundHeightOnly(x, z + eps, tcX, tcZ, flatRadius);
  const normal = new THREE.Vector3(height - hX, eps, height - hZ).normalize();
  return { height, normal };
}
