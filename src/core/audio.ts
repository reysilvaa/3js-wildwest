export type TimeOfDay = "day" | "sunset" | "night";

export interface AudioOptions {
  dayBgmUrl?: string;
  sunsetBgmUrl?: string;
  nightBgmUrl?: string;
  rainAudioUrl?: string;
  thunderAudioUrl?: string;
  volume?: number;
  rainVolume?: number;
  thunderVolume?: number;
  initialTime?: TimeOfDay;
}

export interface AudioSystem {
  update: (dt: number) => void;
  setTimeOfDay: (time: TimeOfDay) => void;
  setDayTime: (isDay: boolean) => void;
  setRain: (isRaining: boolean) => void;
  playThunder: (intensity?: number) => void;
  toggleMute: () => boolean;
  isMuted: () => boolean;
}

export function initAudio(options: AudioOptions = {}): AudioSystem {
  const {
    dayBgmUrl = "/bgm/day.ogg",
    sunsetBgmUrl = "/bgm/sunset.ogg",
    nightBgmUrl = "/bgm/night.ogg",
    rainAudioUrl = "/bgm/weather/rain.ogg",
    thunderAudioUrl = "/bgm/weather/thunder.ogg",
    volume = 0.45,
    rainVolume = 0.55,
    thunderVolume = 0.75,
    initialTime = "day",
  } = options;

  const dayAudio = new Audio(dayBgmUrl);
  dayAudio.loop = true;
  dayAudio.preload = "metadata";
  dayAudio.volume = 0;

  const sunsetAudio = new Audio(sunsetBgmUrl);
  sunsetAudio.loop = true;
  sunsetAudio.preload = "metadata";
  sunsetAudio.volume = 0;

  const nightAudio = new Audio(nightBgmUrl);
  nightAudio.loop = true;
  nightAudio.preload = "metadata";
  nightAudio.volume = 0;

  const rainAudio = new Audio(rainAudioUrl);
  rainAudio.loop = true;
  rainAudio.preload = "metadata";
  rainAudio.volume = 0;

  let currentTimeOfDay: TimeOfDay = initialTime;
  let isRaining = false;
  let muted = false;
  let currentDayVolume = 0;
  let currentSunsetVolume = 0;
  let currentNightVolume = 0;
  let currentRainVolume = 0;
  let unlocked = false;

  function getActiveBgmAudio(): HTMLAudioElement {
    if (currentTimeOfDay === "sunset") return sunsetAudio;
    if (currentTimeOfDay === "night") return nightAudio;
    return dayAudio;
  }

  function tryPlay() {
    if (!unlocked || muted) return;

    const activeAudio = getActiveBgmAudio();
    if (activeAudio.paused) {
      activeAudio.play().catch(() => {});
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

  function setTimeOfDay(time: TimeOfDay) {
    currentTimeOfDay = time;
    tryPlay();
  }

  function setDayTime(active: boolean) {
    setTimeOfDay(active ? "day" : "night");
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
      sunsetAudio.pause();
      nightAudio.pause();
      rainAudio.pause();
    } else {
      tryPlay();
    }
    return muted;
  }

  function isMuted(): boolean {
    return muted;
  }

  function fadeTrack(
    track: HTMLAudioElement,
    currentVol: number,
    targetVol: number,
    rate: number
  ): number {
    if (Math.abs(currentVol - targetVol) > 0.005) {
      const step = Math.sign(targetVol - currentVol) * Math.min(rate, Math.abs(targetVol - currentVol));
      const nextVol = Math.max(0, Math.min(1, currentVol + step));
      track.volume = nextVol;
      return nextVol;
    } else {
      track.volume = targetVol;
      if (targetVol === 0 && !track.paused) {
        track.pause();
      }
      return targetVol;
    }
  }

  function update(dt: number) {
    // Dynamic volume ducking: lower active BGM when raining
    const baseBgm = isRaining ? volume * 0.55 : volume;
    const desiredDay = (!muted && unlocked && currentTimeOfDay === "day") ? baseBgm : 0;
    const desiredSunset = (!muted && unlocked && currentTimeOfDay === "sunset") ? baseBgm : 0;
    const desiredNight = (!muted && unlocked && currentTimeOfDay === "night") ? baseBgm : 0;
    const desiredRain = (isRaining && !muted && unlocked) ? rainVolume : 0;

    const fadeRate = 1.5 * dt;

    if (desiredDay > 0 && dayAudio.paused && unlocked && !muted) {
      dayAudio.play().catch(() => {});
    }
    if (desiredSunset > 0 && sunsetAudio.paused && unlocked && !muted) {
      sunsetAudio.play().catch(() => {});
    }
    if (desiredNight > 0 && nightAudio.paused && unlocked && !muted) {
      nightAudio.play().catch(() => {});
    }
    if (desiredRain > 0 && rainAudio.paused && unlocked && !muted) {
      rainAudio.play().catch(() => {});
    }

    currentDayVolume = fadeTrack(dayAudio, currentDayVolume, desiredDay, fadeRate);
    currentSunsetVolume = fadeTrack(sunsetAudio, currentSunsetVolume, desiredSunset, fadeRate);
    currentNightVolume = fadeTrack(nightAudio, currentNightVolume, desiredNight, fadeRate);
    currentRainVolume = fadeTrack(rainAudio, currentRainVolume, desiredRain, fadeRate);
  }

  return { update, setTimeOfDay, setDayTime, setRain, playThunder, toggleMute, isMuted };
}
