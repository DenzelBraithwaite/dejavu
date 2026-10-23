import { audioSettings, getAudioSettings } from '../stores/audio';

export type SceneAudio = {
  music?: string | null;
  sound?: string;
  stopMusic?: boolean;
};

const activeMusic = new Map<string, HTMLAudioElement>();
const activeSounds = new Set<HTMLAudioElement>();

if (typeof window !== 'undefined') {
  audioSettings.subscribe((settings) => {
    for (const music of activeMusic.values()) {
      music.volume = settings.musicVolume;
      music.muted = !settings.musicEnabled;

      if (settings.musicEnabled) {
        void safelyPlay(music);
      } else {
        music.pause();
      }
    }

    for (const sound of activeSounds) {
      sound.volume = settings.soundsVolume;
      sound.muted = !settings.soundsEnabled;
    }
  });
}

export function applySceneAudio(sceneAudio: SceneAudio | SceneAudio[]): void {
  const cues = Array.isArray(sceneAudio) ? sceneAudio : [sceneAudio];

  for (const cue of cues) {
    if (cue.stopMusic || cue.music === null) {
      stopMusic();
    }

    if (cue.music) {
      playMusic(cue.music);
    }

    if (cue.sound) {
      playSound(cue.sound);
    }
  }
}

export function playMusic(source: string): void {
  if (typeof window === 'undefined' || activeMusic.has(source)) {
    return;
  }

  const settings = getAudioSettings();
  const music = new Audio(source);
  music.loop = true;
  music.volume = settings.musicVolume;
  music.muted = !settings.musicEnabled;
  activeMusic.set(source, music);

  if (settings.musicEnabled) {
    void safelyPlay(music);
  }
}

export function stopMusic(): void {
  for (const music of activeMusic.values()) {
    music.pause();
    music.removeAttribute('src');
    music.load();
  }

  activeMusic.clear();
}

export function playSound(source: string): void {
  const settings = getAudioSettings();

  if (typeof window === 'undefined' || !settings.soundsEnabled) {
    return;
  }

  const sound = new Audio(source);
  sound.volume = settings.soundsVolume;
  activeSounds.add(sound);

  const releaseSound = (): void => {
    activeSounds.delete(sound);
  };

  sound.addEventListener('ended', releaseSound, { once: true });
  sound.addEventListener('error', releaseSound, { once: true });
  void safelyPlay(sound).then((started) => {
    if (!started) {
      releaseSound();
    }
  });
}

async function safelyPlay(audio: HTMLAudioElement): Promise<boolean> {
  try {
    await audio.play();
    return true;
  } catch {
    // Browsers can defer playback until the player interacts with the page.
    return false;
  }
}
