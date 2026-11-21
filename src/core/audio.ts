export interface AudioOptions {
  dayBgmUrl?: string;
  volume?: number;
}

export interface AudioSystem {
  update: (dt: number) => void;
  setDayTime: (isDay: boolean) => void;
  toggleMute: () => boolean;
  isMuted: () => boolean;
}

export function initAudio(options: AudioOptions = {}): AudioSystem {
  const { dayBgmUrl = "/bgm/day.ogg", volume = 0.45 } = options;

  const dayAudio = new Audio(dayBgmUrl);
  dayAudio.loop = true;
  dayAudio.preload = "metadata";
  dayAudio.volume = 0;

  let isDay = true;
  let muted = false;
  let targetVolume = volume;
  let currentVolume = 0;
  let unlocked = false;

  function tryPlay() {
    if (unlocked && isDay && !muted && dayAudio.paused) {
      dayAudio.play().catch(() => {});
    }
  }

  // Browser Autoplay Policy: unlock on first interaction
  function unlockAudio() {
    if (unlocked) return;
    unlocked = true;
    window.removeEventListener("pointerdown", unlockAudio);
    window.removeEventListener("keydown", unlockAudio);
    tryPlay();
  }

  window.addEventListener("pointerdown", unlockAudio);
  window.addEventListener("keydown", unlockAudio);

  // Floating BGM button in weather-controls or standalone
  let audioBtn: HTMLButtonElement | null = null;
  const controlsEl = document.getElementById("weather-controls");
  if (controlsEl) {
    audioBtn = document.createElement("button");
    audioBtn.id = "btn-audio";
    audioBtn.innerHTML = "🔊 BGM";
    audioBtn.title = "Toggle Background Music (Shortcut: M)";
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
      toggleMute();
    });
    controlsEl.appendChild(audioBtn);
  }

  function updateBtnUI() {
    if (audioBtn) {
      audioBtn.innerHTML = muted ? "🔇 BGM: Off" : "🔊 BGM: On";
      audioBtn.style.color = muted ? "#888" : "#fff";
    }
  }

  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key.toLowerCase() === "m") {
      toggleMute();
    }
  });

  function setDayTime(active: boolean) {
    isDay = active;
    tryPlay();
  }

  function toggleMute(): boolean {
    muted = !muted;
    updateBtnUI();
    tryPlay();
    return muted;
  }

  function isMuted(): boolean {
    return muted;
  }

  function update(dt: number) {
    const desired = (isDay && !muted && unlocked) ? targetVolume : 0;
    const fadeRate = 1.2 * dt;

    if (Math.abs(currentVolume - desired) > 0.005) {
      const step = Math.sign(desired - currentVolume) * Math.min(fadeRate, Math.abs(desired - currentVolume));
      currentVolume += step;
      dayAudio.volume = Math.max(0, Math.min(1, currentVolume));
    } else {
      currentVolume = desired;
      dayAudio.volume = currentVolume;
      if (currentVolume === 0 && !dayAudio.paused && desired === 0) {
        dayAudio.pause();
      }
    }

    if (desired > 0 && dayAudio.paused && unlocked) {
      dayAudio.play().catch(() => {});
    }
  }

  return { update, setDayTime, toggleMute, isMuted };
}
