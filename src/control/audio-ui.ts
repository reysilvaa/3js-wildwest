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
    audioBtn.innerHTML = '<span style="color:#84181a;font-weight:900">❖</span> AUDIO: ON';
    audioBtn.title = "Toggle Sound & Music (Shortcut: M)";
    audioBtn.className = "rdr2-btn px-3.5 py-1.5 rounded-lg flex items-center justify-center gap-1.5";

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
      audioBtn.innerHTML = `<span style="color:#84181a;font-weight:900">❖</span> ${muted ? "AUDIO: OFF" : "AUDIO: ON"}`;
      if (muted) {
        audioBtn.classList.add("opacity-50", "grayscale");
      } else {
        audioBtn.classList.remove("opacity-50", "grayscale");
      }
    }
  }

  return { update };
}
