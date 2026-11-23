import * as THREE from "three";

export function getGroundHeightOnly(
  x: number,
  z: number,
  tcX = 10,
  tcZ = -5,
  flatRadius = 85
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
  flatRadius = 85
): { height: number; normal: THREE.Vector3 } {
  const height = getGroundHeightOnly(x, z, tcX, tcZ, flatRadius);
  const eps = 0.2;
  const hX = getGroundHeightOnly(x + eps, z, tcX, tcZ, flatRadius);
  const hZ = getGroundHeightOnly(x, z + eps, tcX, tcZ, flatRadius);
  const normal = new THREE.Vector3(height - hX, eps, height - hZ).normalize();
  return { height, normal };
}
