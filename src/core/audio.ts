export interface AudioOptions {
  dayBgmUrl?: string;
  rainAudioUrl?: string;
  thunderAudioUrl?: string;
  volume?: number;
  rainVolume?: number;
  thunderVolume?: number;
}

export interface AudioSystem {
  update: (dt: number) => void;
  setDayTime: (isDay: boolean) => void;
  setRain: (isRaining: boolean) => void;
  playThunder: (intensity?: number) => void;
  toggleMute: () => boolean;
  isMuted: () => boolean;
}

export function initAudio(options: AudioOptions = {}): AudioSystem {
  const {
    dayBgmUrl = "/bgm/day.ogg",
    rainAudioUrl = "/bgm/weather/rain.ogg",
    thunderAudioUrl = "/bgm/weather/thunder.ogg",
    volume = 0.45,
    rainVolume = 0.55,
    thunderVolume = 0.75,
  } = options;

  const dayAudio = new Audio(dayBgmUrl);
  dayAudio.loop = true;
  dayAudio.preload = "metadata";
  dayAudio.volume = 0;

  const rainAudio = new Audio(rainAudioUrl);
  rainAudio.loop = true;
  rainAudio.preload = "metadata";
  rainAudio.volume = 0;

  let isDay = true;
  let isRaining = false;
  let muted = false;
  let currentBgmVolume = 0;
  let currentRainVolume = 0;
  let unlocked = false;

  function tryPlay() {
    if (!unlocked || muted) return;

    if (isDay && dayAudio.paused) {
      dayAudio.play().catch(() => {});
    }
    if (isRaining && rainAudio.paused) {
      rainAudio.play().catch(() => {});
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

  function setDayTime(active: boolean) {
    isDay = active;
    tryPlay();
  }

  function setRain(active: boolean) {
    isRaining = active;
    tryPlay();
  }

  function playThunder(intensity = 1.0) {
    if (muted || !unlocked) return;
    const thunder = new Audio(thunderAudioUrl);
    thunder.volume = Math.max(0, Math.min(1, thunderVolume * intensity));
    thunder.play().catch(() => {});
  }

  function toggleMute(): boolean {
    muted = !muted;
    if (muted) {
      dayAudio.pause();
      rainAudio.pause();
    } else {
      tryPlay();
    }
    return muted;
  }

  function isMuted(): boolean {
    return muted;
  }

  function update(dt: number) {
    // Dynamic volume ducking: lower day BGM when raining
    const desiredBgm = (isDay && !muted && unlocked)
      ? (isRaining ? volume * 0.55 : volume)
      : 0;
    const desiredRain = (isRaining && !muted && unlocked) ? rainVolume : 0;
    const fadeRate = 1.5 * dt;

    // Day BGM fade
    if (Math.abs(currentBgmVolume - desiredBgm) > 0.005) {
      const step = Math.sign(desiredBgm - currentBgmVolume) * Math.min(fadeRate, Math.abs(desiredBgm - currentBgmVolume));
      currentBgmVolume += step;
      dayAudio.volume = Math.max(0, Math.min(1, currentBgmVolume));
    } else {
      currentBgmVolume = desiredBgm;
      dayAudio.volume = currentBgmVolume;
      if (currentBgmVolume === 0 && !dayAudio.paused && desiredBgm === 0) {
        dayAudio.pause();
      }
    }
    if (desiredBgm > 0 && dayAudio.paused && unlocked && !muted) {
      dayAudio.play().catch(() => {});
    }

    // Rain Ambient fade
    if (Math.abs(currentRainVolume - desiredRain) > 0.005) {
      const step = Math.sign(desiredRain - currentRainVolume) * Math.min(fadeRate, Math.abs(desiredRain - currentRainVolume));
      currentRainVolume += step;
      rainAudio.volume = Math.max(0, Math.min(1, currentRainVolume));
    } else {
      currentRainVolume = desiredRain;
      rainAudio.volume = currentRainVolume;
      if (currentRainVolume === 0 && !rainAudio.paused && desiredRain === 0) {
        rainAudio.pause();
      }
    }
    if (desiredRain > 0 && rainAudio.paused && unlocked && !muted) {
      rainAudio.play().catch(() => {});
    }
  }

  return { update, setDayTime, setRain, playThunder, toggleMute, isMuted };
}
