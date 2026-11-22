import * as THREE from "three";

export interface RainSystem {
  points: THREE.Points;
  update: (dt: number, isRaining: boolean, targetOpacity: number) => void;
}

export function initRain(scene: THREE.Scene, onThunder?: () => void): RainSystem {
  const rainCount = 3500;
  const rainGeo = new THREE.BufferGeometry();
  const rainPositions = new Float32Array(rainCount * 3);
  const rainVelocities = new Float32Array(rainCount);

  const rangeX = 100;
  const rangeY = 45;
  const rangeZ = 100;

  for (let i = 0; i < rainCount; i++) {
    rainPositions[i * 3 + 0] = (Math.random() - 0.4) * rangeX + 10;
    rainPositions[i * 3 + 1] = Math.random() * rangeY;
    rainPositions[i * 3 + 2] = (Math.random() - 0.5) * rangeZ;
    rainVelocities[i] = 28 + Math.random() * 14;
  }

  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));

  const dropCanvas = document.createElement("canvas");
  dropCanvas.width = 16;
  dropCanvas.height = 32;
  const dCtx = dropCanvas.getContext("2d");
  if (dCtx) {
    const grad = dCtx.createLinearGradient(8, 0, 8, 32);
    grad.addColorStop(0, "rgba(200, 225, 255, 0)");
    grad.addColorStop(0.7, "rgba(220, 235, 255, 0.7)");
    grad.addColorStop(1, "rgba(255, 255, 255, 0.95)");
    dCtx.fillStyle = grad;
    dCtx.fillRect(6, 0, 4, 32);
  }
  const dropTexture = new THREE.CanvasTexture(dropCanvas);

  const rainMat = new THREE.PointsMaterial({
    color: 0xbfd8f5,
    size: 0.6,
    map: dropTexture,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const rainPoints = new THREE.Points(rainGeo, rainMat);
  rainPoints.visible = false;
  scene.add(rainPoints);

  let lightningTimer = 8 + Math.random() * 8;
  let lightningFlash = 0;
  const tempWhite = new THREE.Color(1, 1, 1);

  function update(dt: number, isRaining: boolean, targetOpacity: number): void {
    const destOpacity = isRaining ? targetOpacity : 0;
    rainMat.opacity += (destOpacity - rainMat.opacity) * (4 * dt);
    rainPoints.visible = rainMat.opacity > 0.01;

    if (!rainPoints.visible) return;

    const windX = isRaining ? 4.5 * dt : 0;
    for (let i = 0; i < rainCount; i++) {
      const idx = i * 3;
      const px = rainPositions[idx + 0] ?? 0;
      const py = rainPositions[idx + 1] ?? 0;
      const pz = rainPositions[idx + 2] ?? 0;
      const vel = rainVelocities[i] ?? 30;

      const nextY = py - vel * dt;
      if (nextY < 0) {
        rainPositions[idx + 0] = (Math.random() - 0.4) * rangeX + 10;
        rainPositions[idx + 1] = rangeY + Math.random() * 5;
        rainPositions[idx + 2] = (Math.random() - 0.5) * rangeZ;
      } else {
        rainPositions[idx + 0] = px + windX;
        rainPositions[idx + 1] = nextY;
        rainPositions[idx + 2] = pz;
      }
    }

    const posAttr = rainGeo.getAttribute("position") as THREE.BufferAttribute;
    posAttr.needsUpdate = true;

    // Lightning Flash
    lightningTimer -= dt;
    if (lightningTimer <= 0) {
      lightningFlash = 0.12;
      lightningTimer = 6 + Math.random() * 10;
      onThunder?.();
    }

    if (lightningFlash > 0) {
      lightningFlash -= dt;
      if (scene.fog && (scene.fog as THREE.FogExp2).color) {
        (scene.fog as THREE.FogExp2).color.lerp(tempWhite, 0.4);
      }
    }
  }

  return { points: rainPoints, update };
}
