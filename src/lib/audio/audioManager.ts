import { audioSettings, getAudioSettings } from '../stores/audio';

export type SceneAudio = {
  type?: string;
  music?: string | null;
  sound?: string;
  audioKind?: 'music' | 'sound';
  stopMusic?: boolean;
  audioId?: string;
  audioLayer?: number;
  audioLoop?: boolean;
  audioVolume?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  audioRangeMode?: 'full' | 'partial';
  audioStartSeconds?: number;
  audioStopSeconds?: number;
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
  startSeconds: number;
  stopSeconds: number | null;
  shouldLoop: boolean;
};

const activeMusic = new Map<string, ActiveAudio>();
const activeSounds = new Map<string, ActiveAudio>();
const pendingPlayback = new Set<HTMLAudioElement>();
const silentWaveData = 'data:audio/wav;base64,UklGRioAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQYAAACAgICAgA==';
let storyAudioPaused = false;

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
    const stopsLegacyMusic = cue.type === 'stop-music';
    const stopsSelectedMusic = cue.type === 'stop-audio' && cue.stopMusic !== false;

    if (cue.stopMusic || cue.music === null || stopsLegacyMusic || stopsSelectedMusic) {
      stopMusic(cue.stopMusicIds, cue.stopMusicLayers, cue.fadeOutSeconds ?? 0);
    }

    if (cue.stopSounds) {
      stopSounds(cue.fadeOutSeconds ?? 0);
    }

    if (cue.music) {
      playMusic(cue);
    }

    if (cue.sound) {
      playSound(cue);
    }
  }
}

// Prime browser media playback during the player's Play-button gesture so
// audio loaded after the asynchronous save response can begin immediately.
export function unlockAudioPlayback(): void {
  if (typeof window === 'undefined') {
    return;
  }

  retryPendingPlayback();
  const unlocker = new Audio(silentWaveData);

  void unlocker.play().then(() => {
    unlocker.pause();
    unlocker.removeAttribute('src');
  }).catch(() => {
    // The normal pending-playback retry remains available on the next input.
  });
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
  track.element.loop = track.shouldLoop && track.stopSeconds === null;
  activeMusic.set(id, track);
  configureSegment(activeMusic, track);
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
  sound.element.loop = sound.shouldLoop && sound.stopSeconds === null;
  activeSounds.set(id, sound);
  configureSegment(activeSounds, sound);
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

export function pauseStoryAudio(): void {
  storyAudioPaused = true;

  for (const track of [...activeMusic.values(), ...activeSounds.values()]) {
    track.element.pause();
  }
}

export function resumeStoryAudio(): void {
  const settings = getAudioSettings();

  storyAudioPaused = false;

  for (const track of activeMusic.values()) {
    if (settings.musicEnabled) {
      void safelyPlay(track.element);
    }
  }

  for (const sound of activeSounds.values()) {
    if (settings.soundsEnabled) {
      void safelyPlay(sound.element);
    }
  }
}

function createTrack(source: string, id: string, cue: SceneAudio): ActiveAudio {
  const partialRange = cue.audioRangeMode === 'partial';
  const startSeconds = partialRange
    ? Math.max(0, Number(cue.audioStartSeconds ?? 0))
    : 0;
  const configuredStop = partialRange
    ? Number(cue.audioStopSeconds ?? 0)
    : 0;

  return {
    element: new Audio(source),
    id,
    layer: Math.min(10, Math.max(1, Math.round(Number(cue.audioLayer ?? 1)))),
    volume: Math.min(1, Math.max(0, Number(cue.audioVolume ?? 1))),
    fadeFrame: null,
    startSeconds,
    stopSeconds: configuredStop > startSeconds ? configuredStop : null,
    shouldLoop: Boolean(cue.audioLoop)
  };
}

function configureSegment(
  collection: Map<string, ActiveAudio>,
  track: ActiveAudio
): void {
  const seekToStart = (): void => {
    if (track.startSeconds > 0 && track.element.currentTime < track.startSeconds) {
      track.element.currentTime = track.startSeconds;
    }
  };

  track.element.addEventListener('loadedmetadata', seekToStart, { once: true });
  track.element.addEventListener('play', seekToStart);

  if (track.stopSeconds === null) {
    return;
  }

  track.element.addEventListener('timeupdate', () => {
    if (track.element.currentTime < Number(track.stopSeconds)) {
      return;
    }

    if (track.shouldLoop) {
      track.element.currentTime = track.startSeconds;
      void safelyPlay(track.element);
      return;
    }

    releaseTrack(collection, track.id);
  });
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

  if (enabled && !storyAudioPaused) {
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

  if (enabled && !storyAudioPaused) {
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
  if (track.shouldLoop || fadeOutSeconds <= 0) {
    return;
  }

  const beginFadeNearEnd = (): void => {
    const playbackEnd = track.stopSeconds ?? track.element.duration;

    if (!Number.isFinite(playbackEnd)
      || track.element.currentTime < playbackEnd - fadeOutSeconds) {
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
  if (storyAudioPaused) {
    return;
  }

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
