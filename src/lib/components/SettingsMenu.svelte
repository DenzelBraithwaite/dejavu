<script lang="ts">
  import {
    audioSettings,
    updateAudioSettings
  } from '../stores/audio';
  import location from '../stores/location';

  function setVolume(
    setting: 'musicVolume' | 'soundsVolume',
    event: Event
  ): void {
    const input = event.currentTarget as HTMLInputElement;

    updateAudioSettings({
      [setting]: Number(input.value) / 100
    });
  }
</script>

<section
  class="settings"
  class:hide={$location !== 'settings'}
  aria-labelledby="settings-title"
>
  <header>DEJAVU://SETTINGS</header>

  <div class="settings-content">
    <p class="eyebrow">LOCAL PLAYER PREFERENCES</p>
    <h1 id="settings-title">Audio settings</h1>
    <p class="introduction">
      Music and interface sounds are controlled independently. These settings
      are stored in this browser and do not affect the other player.
    </p>

    <div class="audio-grid">
      <article class="audio-channel">
        <div class="channel-heading">
          <div>
            <p class="channel-code">CHANNEL 01</p>
            <h2>Music</h2>
          </div>

          <button
            class:enabled={$audioSettings.musicEnabled}
            type="button"
            aria-pressed={$audioSettings.musicEnabled}
            on:click={() => updateAudioSettings({
              musicEnabled: !$audioSettings.musicEnabled
            })}
          >
            {$audioSettings.musicEnabled ? 'ON' : 'MUTED'}
          </button>
        </div>

        <label for="music-volume">
          Volume
          <span>{Math.round($audioSettings.musicVolume * 100)}%</span>
        </label>
        <input
          id="music-volume"
          type="range"
          min="0"
          max="100"
          value={$audioSettings.musicVolume * 100}
          on:input={(event) => setVolume('musicVolume', event)}
        >
      </article>

      <article class="audio-channel">
        <div class="channel-heading">
          <div>
            <p class="channel-code">CHANNEL 02</p>
            <h2>Sounds</h2>
          </div>

          <button
            class:enabled={$audioSettings.soundsEnabled}
            type="button"
            aria-pressed={$audioSettings.soundsEnabled}
            on:click={() => updateAudioSettings({
              soundsEnabled: !$audioSettings.soundsEnabled
            })}
          >
            {$audioSettings.soundsEnabled ? 'ON' : 'MUTED'}
          </button>
        </div>

        <label for="sounds-volume">
          Volume
          <span>{Math.round($audioSettings.soundsVolume * 100)}%</span>
        </label>
        <input
          id="sounds-volume"
          type="range"
          min="0"
          max="100"
          value={$audioSettings.soundsVolume * 100}
          on:input={(event) => setVolume('soundsVolume', event)}
        >
      </article>
    </div>

    <aside class="empty-library-notice">
      <strong>AUDIO LIBRARY EMPTY</strong>
      <p>
        Preferences are active, but no story music or sound effects have been
        assigned yet.
      </p>
    </aside>
  </div>
</section>

<style lang="scss">
  .settings {
    width: 100%;
    height: 95vh;
    max-width: 1100px;
    overflow: hidden;
    color: #e8edf6;
    background: #070b16;
    border: 1px solid #4a98d9;
    border-radius: 8px;
    box-shadow: 0 0 30px #4a98d92f;

    > header {
      padding: 11px 14px;
      color: #02fbfb;
      background: #111a2c;
      border-bottom: 1px solid #4a98d9;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.75rem;
      letter-spacing: 2px;
    }
  }

  .settings-content {
    height: calc(100% - 38px);
    padding: clamp(24px, 5vw, 64px);
    overflow-y: auto;
  }

  .eyebrow,
  .channel-code {
    color: #4a98d9;
    font-size: 0.7rem;
    letter-spacing: 1.5px;
  }

  h1 {
    margin: 8px 0 12px;
    font-family: "Orbitron", "Space Mono", sans-serif;
  }

  .introduction {
    max-width: 70ch;
    color: #aeb9c9;
    line-height: 1.6;
  }

  .audio-grid {
    margin-top: 34px;

    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
  }

  .audio-channel {
    padding: 22px;
    background: #0c1322;
    border: 1px solid #2c3b54;

    label {
      margin: 26px 0 10px;
      color: #94a3b8;
      font-size: 0.78rem;
      text-transform: uppercase;

      display: flex;
      justify-content: space-between;
    }

    input {
      width: 100%;
      accent-color: #02fbfb;
    }
  }

  .channel-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;

    h2 {
      margin-top: 4px;
      color: #e8edf6;
      font-size: 1.15rem;
    }

    button {
      min-width: 78px;
      padding: 8px 12px;
      color: #e58271;
      background: #251312;
      border: 1px solid #cb381f;
      border-radius: 4px;
      font: inherit;
      font-size: 0.72rem;
      font-weight: 800;
      cursor: pointer;
    }

    button.enabled {
      color: #d7f0bb;
      background: #10200f;
      border-color: #4f813d;
    }
  }

  .empty-library-notice {
    max-width: 700px;
    margin-top: 26px;
    padding: 16px;
    color: #aeb9c9;
    background: #111827;
    border-left: 3px solid #e0ad03;

    strong {
      color: #f8e69a;
      font-size: 0.75rem;
      letter-spacing: 1px;
    }

    p {
      margin-top: 6px;
      line-height: 1.5;
    }
  }

  @media (max-width: 720px) {
    .audio-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
