export interface AudioUIHandlers {
  onToggleMute: () => boolean;
  isMuted: () => boolean;
}

export function initAudioUI(handlers: AudioUIHandlers): { update: () => void } {
  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key.toLowerCase() === "m") {
      handlers.onToggleMute();
      update();
    }
  });

  function update(): void {
    const muted = handlers.isMuted();
    if (typeof (window as unknown as { __updateAudioUI?: (muted: boolean) => void }).__updateAudioUI === "function") {
      (window as unknown as { __updateAudioUI: (muted: boolean) => void }).__updateAudioUI(muted);
    }
  }

  update();

  return { update };
}
