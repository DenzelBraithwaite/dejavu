import { audioSettings, getAudioSettings } from '../stores/audio';

export type SceneAudio = {
  type?: string;
  music?: string | null;
  sound?: string;
  stopMusic?: boolean;
  audioId?: string;
  audioLayer?: number;
  audioLoop?: boolean;
  audioVolume?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  stopMusicIds?: string[];
  stopMusicLayers?: number[];
  stopSounds?: boolean;
};

type ActiveAudio = {
  element: HTMLAudioElement;
  id: string;
  layer: number;
  volume: number;
  fadeFrame: number | null;
};

const activeMusic = new Map<string, ActiveAudio>();
const activeSounds = new Map<string, ActiveAudio>();
const pendingPlayback = new Set<HTMLAudioElement>();

if (typeof window !== 'undefined') {
  audioSettings.subscribe((settings) => {
    for (const track of activeMusic.values()) {
      updateTrackSettings(track, settings.musicVolume, settings.musicEnabled);
    }

    for (const sound of activeSounds.values()) {
      updateTrackSettings(sound, settings.soundsVolume, settings.soundsEnabled);
    }
  });

  // A story scene can arrive after the click that advanced into it. When a
  // browser declines that delayed playback, retry on the player's next input.
  window.addEventListener('pointerdown', retryPendingPlayback);
  window.addEventListener('keydown', retryPendingPlayback);
}

export function applySceneAudio(sceneAudio: SceneAudio | SceneAudio[]): void {
  const cues = Array.isArray(sceneAudio) ? sceneAudio : [sceneAudio];

  for (const cue of cues) {
    if (cue.stopMusic || cue.music === null || cue.type === 'stop-music') {
      stopMusic(cue.stopMusicIds, cue.stopMusicLayers, cue.fadeOutSeconds ?? 0);

      if (cue.stopSounds) {
        stopSounds(cue.fadeOutSeconds ?? 0);
      }
    }

    if (cue.music) {
      playMusic(cue);
    }

    if (cue.sound) {
      playSound(cue);
    }
  }
}

export function playMusic(cue: SceneAudio): void {
  if (typeof window === 'undefined' || !cue.music) {
    return;
  }

  const id = cue.audioId?.trim() || cue.music;

  if (activeMusic.has(id)) {
    return;
  }

  const settings = getAudioSettings();
  const track = createTrack(cue.music, id, cue);
  track.element.loop = cue.audioLoop ?? true;
  activeMusic.set(id, track);
  scheduleNaturalFadeOut(track, cue.fadeOutSeconds ?? 0);
  prepareTrack(track, settings.musicVolume, settings.musicEnabled, cue.fadeInSeconds ?? 0);

  track.element.addEventListener('ended', () => {
    releaseTrack(activeMusic, id);
  }, { once: true });

  track.element.addEventListener('error', () => {
    releaseTrack(activeMusic, id);
  }, { once: true });
}

export function stopMusic(
  ids: string[] = [],
  layers: number[] = [],
  fadeOutSeconds = 0
): void {
  const hasFilter = ids.length > 0 || layers.length > 0;

  for (const [id, track] of activeMusic.entries()) {
    const selected = !hasFilter || ids.includes(id) || layers.includes(track.layer);

    if (selected) {
      fadeAndRelease(activeMusic, id, track, fadeOutSeconds);
    }
  }
}

export function playSound(cue: SceneAudio): void {
  if (typeof window === 'undefined' || !cue.sound) {
    return;
  }

  const settings = getAudioSettings();
  const id = cue.audioId?.trim() || cue.sound;

  if (!settings.soundsEnabled || activeSounds.has(id)) {
    return;
  }

  const sound = createTrack(cue.sound, id, cue);
  sound.element.loop = cue.audioLoop ?? false;
  activeSounds.set(id, sound);
  scheduleNaturalFadeOut(sound, cue.fadeOutSeconds ?? 0);
  prepareTrack(sound, settings.soundsVolume, settings.soundsEnabled, cue.fadeInSeconds ?? 0);

  sound.element.addEventListener('ended', () => {
    releaseTrack(activeSounds, id);
  }, { once: true });

  sound.element.addEventListener('error', () => {
    releaseTrack(activeSounds, id);
  }, { once: true });
}

export function stopSounds(fadeOutSeconds = 0): void {
  for (const [id, sound] of activeSounds.entries()) {
    fadeAndRelease(activeSounds, id, sound, fadeOutSeconds);
  }
}

function createTrack(source: string, id: string, cue: SceneAudio): ActiveAudio {
  return {
    element: new Audio(source),
    id,
    layer: Math.min(10, Math.max(1, Math.round(Number(cue.audioLayer ?? 1)))),
    volume: Math.min(1, Math.max(0, Number(cue.audioVolume ?? 1))),
    fadeFrame: null
  };
}

function prepareTrack(
  track: ActiveAudio,
  categoryVolume: number,
  enabled: boolean,
  fadeInSeconds: number
): void {
  const targetVolume = track.volume * categoryVolume;
  track.element.volume = fadeInSeconds > 0 ? 0 : targetVolume;
  track.element.muted = !enabled;

  if (enabled) {
    void safelyPlay(track.element);
  }

  if (fadeInSeconds > 0) {
    fadeTrack(track, targetVolume, fadeInSeconds);
  }
}

function updateTrackSettings(
  track: ActiveAudio,
  categoryVolume: number,
  enabled: boolean
): void {
  track.element.muted = !enabled;
  track.element.volume = track.volume * categoryVolume;

  if (enabled) {
    void safelyPlay(track.element);
  } else {
    track.element.pause();
  }
}

function fadeAndRelease(
  collection: Map<string, ActiveAudio>,
  id: string,
  track: ActiveAudio,
  fadeOutSeconds: number
): void {
  if (fadeOutSeconds <= 0) {
    releaseTrack(collection, id);
    return;
  }

  fadeTrack(track, 0, fadeOutSeconds, () => {
    releaseTrack(collection, id);
  });
}

function fadeTrack(
  track: ActiveAudio,
  targetVolume: number,
  durationSeconds: number,
  onComplete?: () => void
): void {
  const startVolume = track.element.volume;
  const startedAt = performance.now();
  const durationMs = Math.max(1, durationSeconds * 1000);

  if (track.fadeFrame !== null) {
    cancelAnimationFrame(track.fadeFrame);
  }

  const update = (now: number): void => {
    const progress = Math.min(1, (now - startedAt) / durationMs);
    track.element.volume = startVolume + ((targetVolume - startVolume) * progress);

    if (progress < 1) {
      track.fadeFrame = requestAnimationFrame(update);
      return;
    }

    track.fadeFrame = null;
    onComplete?.();
  };

  track.fadeFrame = requestAnimationFrame(update);
}

function scheduleNaturalFadeOut(track: ActiveAudio, fadeOutSeconds: number): void {
  if (track.element.loop || fadeOutSeconds <= 0) {
    return;
  }

  const beginFadeNearEnd = (): void => {
    if (!Number.isFinite(track.element.duration)
      || track.element.currentTime < track.element.duration - fadeOutSeconds) {
      return;
    }

    track.element.removeEventListener('timeupdate', beginFadeNearEnd);
    fadeTrack(track, 0, fadeOutSeconds);
  };

  track.element.addEventListener('timeupdate', beginFadeNearEnd);
}

function releaseTrack(collection: Map<string, ActiveAudio>, id: string): void {
  const track = collection.get(id);

  if (!track) {
    return;
  }

  if (track.fadeFrame !== null) {
    cancelAnimationFrame(track.fadeFrame);
  }

  track.element.pause();
  pendingPlayback.delete(track.element);
  track.element.removeAttribute('src');
  track.element.load();
  collection.delete(id);
}

function retryPendingPlayback(): void {
  for (const audio of pendingPlayback) {
    void safelyPlay(audio);
  }
}

async function safelyPlay(audio: HTMLAudioElement): Promise<boolean> {
  try {
    await audio.play();
    pendingPlayback.delete(audio);
    return true;
  } catch {
    // Browsers can defer playback until the player interacts with the page.
    pendingPlayback.add(audio);
    return false;
  }
}
