export interface AudioUIHandlers {
  onToggleMute: () => boolean;
  isMuted: () => boolean;
}

export function initAudioUI(handlers: AudioUIHandlers): { update: () => void } {
  let audioBtn = document.getElementById("btn-audio") as HTMLButtonElement | null;
  const controlsEl = document.getElementById("weather-controls") ?? document.body;

  if (!audioBtn) {
    audioBtn = document.createElement("button");
    audioBtn.id = "btn-audio";
    audioBtn.innerHTML = "🔊 Sound: On";
    audioBtn.title = "Toggle Sound & Music (Shortcut: M)";
    audioBtn.style.cssText = `
      background: rgba(20, 15, 10, 0.7);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 13px;
      cursor: pointer;
      backdrop-filter: blur(6px);
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 6px;
      user-select: none;
    `;
    audioBtn.addEventListener("mouseenter", () => {
      audioBtn!.style.background = "rgba(45, 35, 25, 0.9)";
      audioBtn!.style.borderColor = "rgba(229, 155, 60, 0.5)";
    });
    audioBtn.addEventListener("mouseleave", () => {
      audioBtn!.style.background = "rgba(20, 15, 10, 0.7)";
      audioBtn!.style.borderColor = "rgba(255, 255, 255, 0.15)";
    });
    audioBtn.addEventListener("click", () => {
      handlers.onToggleMute();
      update();
    });
    controlsEl.appendChild(audioBtn);
  }

  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key.toLowerCase() === "m") {
      handlers.onToggleMute();
      update();
    }
  });

  function update(): void {
    if (audioBtn) {
      const muted = handlers.isMuted();
      audioBtn.innerHTML = muted ? "🔇 Sound: Off" : "🔊 Sound: On";
      audioBtn.style.color = muted ? "#888" : "#fff";
    }
  }

  return { update };
}
