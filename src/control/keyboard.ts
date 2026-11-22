export const activeKeys = new Set<string>();

window.addEventListener("keydown", (e) => {
  activeKeys.add(e.code);
  activeKeys.add(e.key.toLowerCase());
});

window.addEventListener("keyup", (e) => {
  activeKeys.delete(e.code);
  activeKeys.delete(e.key.toLowerCase());
});

export function isPressed(...keys: string[]): boolean {
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (k && activeKeys.has(k)) return true;
  }
  return false;
}
