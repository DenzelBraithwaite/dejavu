import { audioSettings, getAudioSettings } from '../stores/audio';

export type SceneAudio = {
  music?: string | null;
  sound?: string;
};

let musicPlayer: HTMLAudioElement | null = null;
let currentMusic = '';
const activeSounds = new Set<HTMLAudioElement>();

if (typeof window !== 'undefined') {
  musicPlayer = new Audio();
  musicPlayer.loop = true;

  audioSettings.subscribe((settings) => {
    if (!musicPlayer) {
      return;
    }

    musicPlayer.volume = settings.musicVolume;
    musicPlayer.muted = !settings.musicEnabled;

    for (const sound of activeSounds) {
      sound.volume = settings.soundsVolume;
      sound.muted = !settings.soundsEnabled;
    }

    if (settings.musicEnabled && currentMusic) {
      void safelyPlay(musicPlayer);
    }
  });
}

export function applySceneAudio(scene: SceneAudio): void {
  if (scene.music !== undefined) {
    if (scene.music) {
      playMusic(scene.music);
    } else {
      stopMusic();
    }
  }

  if (scene.sound) {
    playSound(scene.sound);
  }
}

export function playMusic(source: string): void {
  if (!musicPlayer || currentMusic === source) {
    return;
  }

  currentMusic = source;
  musicPlayer.src = source;
  musicPlayer.load();

  if (getAudioSettings().musicEnabled) {
    void safelyPlay(musicPlayer);
  }
}

export function stopMusic(): void {
  if (!musicPlayer) {
    return;
  }

  musicPlayer.pause();
  musicPlayer.removeAttribute('src');
  musicPlayer.load();
  currentMusic = '';
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
