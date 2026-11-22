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
    audioBtn.innerHTML = "❖ AUDIO: ON";
    audioBtn.title = "Toggle Sound & Music (Shortcut: M)";
    // Tailwind classes matching the Western carved parchment button style
    audioBtn.className =
      "relative px-3.5 py-1.5 rounded-lg bg-gradient-to-b from-[#fdf8ea] via-[#f3e3be] to-[#d9be85] border border-[#542e14] shadow-western text-[#2a1306] font-western text-[11px] tracking-wider uppercase flex items-center justify-center gap-1.5 hover:from-white hover:to-[#ebd49f] hover:border-[#cba043] hover:shadow-[0_0_12px_rgba(203,160,67,0.6)] active:scale-95 transition-all duration-150 cursor-pointer select-none";

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
      audioBtn.innerHTML = muted ? "❖ AUDIO: OFF" : "❖ AUDIO: ON";
      if (muted) {
        audioBtn.classList.add("opacity-60", "grayscale");
      } else {
        audioBtn.classList.remove("opacity-60", "grayscale");
      }
    }
  }

  return { update };
}
