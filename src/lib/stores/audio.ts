import { get, writable } from 'svelte/store';

export type AudioSettings = {
  musicEnabled: boolean;
  musicVolume: number;
  soundsEnabled: boolean;
  soundsVolume: number;
};

const STORAGE_KEY = 'dejavu-audio-settings';
const defaultSettings: AudioSettings = {
  musicEnabled: true,
  musicVolume: 0.6,
  soundsEnabled: true,
  soundsVolume: 0.8
};

export const audioSettings = writable<AudioSettings>(loadAudioSettings());

audioSettings.subscribe((settings) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Audio preferences still work for this session when storage is unavailable.
  }
});

export function updateAudioSettings(
  changes: Partial<AudioSettings>
): void {
  audioSettings.update((settings) => ({
    ...settings,
    ...changes
  }));
}

export function getAudioSettings(): AudioSettings {
  return get(audioSettings);
}

function loadAudioSettings(): AudioSettings {
  if (typeof window === 'undefined') {
    return defaultSettings;
  }

  try {
    const storedSettings = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? '{}'
    );

    return {
      musicEnabled: storedSettings.musicEnabled ?? defaultSettings.musicEnabled,
      musicVolume: normalizeVolume(
        storedSettings.musicVolume ?? defaultSettings.musicVolume
      ),
      soundsEnabled: storedSettings.soundsEnabled ?? defaultSettings.soundsEnabled,
      soundsVolume: normalizeVolume(
        storedSettings.soundsVolume ?? defaultSettings.soundsVolume
      )
    };
  } catch {
    return defaultSettings;
  }
}

function normalizeVolume(value: number): number {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.min(1, Math.max(0, numericValue));
}
