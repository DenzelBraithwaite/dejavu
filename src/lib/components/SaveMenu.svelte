<script lang="ts">
  import { socket } from '../socket';
  import location from '../stores/location';
  import { libraryState } from '../stores/library';

  export let embedded = false;

  type SaveSummary = {
    fileName: string;
    storyTitle: string;
    mode: string;
    savedAt: string | null;
  };

  let saveName = 'campaign-01';
  let saves: SaveSummary[] = [];
  let statusMessage = '';
  let loading = false;
  let savesWereVisible = false;

  $: {
    const savesAreVisible = $location === (embedded ? 'settings' : 'saves');

    if (savesAreVisible && !savesWereVisible) {
      refreshSaves();
    }

    savesWereVisible = savesAreVisible;
  }

  function refreshSaves(): void {
    if (loading) {
      return;
    }

    loading = true;
    socket.emit('campaign:list-saves', (result: {
      ok: boolean;
      saves?: SaveSummary[];
      error?: string;
    }) => {
      loading = false;

      if (result.ok) {
        saves = result.saves ?? [];
      } else {
        statusMessage = result.error ?? 'Could not list saves.';
      }
    });
  }

  function saveCampaign(): void {
    if (!$libraryState.activeStoryId) {
      statusMessage = 'Both players must stage the same story before saving.';
      return;
    }

    socket.emit('campaign:save', saveName, (result: {
      ok: boolean;
      fileName?: string;
      error?: string;
    }) => {
      statusMessage = result.ok
        ? `Saved as ${result.fileName}.`
        : result.error ?? 'Could not save the campaign.';

      if (result.ok) {
        refreshSaves();
      }
    });
  }

  function loadCampaign(fileName: string): void {
    socket.emit('campaign:load', fileName, (result: {
      ok: boolean;
      error?: string;
    }) => {
      statusMessage = result.ok
        ? `Loaded ${fileName}.`
        : result.error ?? 'Could not load the campaign.';
    });
  }
</script>

<section
  class="saves"
  class:embedded
  class:hide={!embedded && $location !== 'saves'}
  aria-labelledby="saves-title"
>
  {#if !embedded}
    <header>DEJAVU://SAVE ARCHIVE</header>
  {/if}

  <div class="saves-content">
    <h2 id="saves-title">Campaign saves</h2>
    <p class="description">
      Saves are versioned JSON files stored by the LAN host. Loading affects both players.
      A matching story cartridge must be active before saving.
    </p>

    <div class="save-form">
      <label for="save-name">Save name</label>
      <div>
        <input id="save-name" bind:value={saveName} maxlength="64">
        <button
          type="button"
          disabled={!$libraryState.activeStoryId}
          on:click={saveCampaign}
        >
          Save campaign
        </button>
      </div>
    </div>

    <div class="save-list">
      <h2>Available saves</h2>
      {#if saves.length}
        {#each saves as save}
          <div class="save-row">
            <span>
              <strong>{save.storyTitle}</strong>
              <small>
                {save.fileName} · {save.mode}
                {save.savedAt ? ` · ${new Date(save.savedAt).toLocaleString()}` : ''}
              </small>
            </span>
            <button type="button" on:click={() => loadCampaign(save.fileName)}>Load</button>
          </div>
        {/each}
      {:else}
        <p>No saves found.</p>
      {/if}
    </div>

    {#if statusMessage}
      <p class="status-message" role="status">{statusMessage}</p>
    {/if}
  </div>
</section>

<style lang="scss">
  .saves {
    width: 100%;
    height: 100%;
    max-width: 1100px;
    overflow: hidden;
    background: #080f1b;
    border: 1px solid #326dbd;
    border-radius: 8px;
    box-shadow: 0 0 30px #326dbd2f;

    > header {
      padding: 11px 14px;
      color: #b9d4f5;
      background: #0d1c32;
      border-bottom: 1px solid #326dbd;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.75rem;
      letter-spacing: 2px;
    }
  }

  .saves-content {
    height: calc(100% - 38px);
    padding: clamp(22px, 4vw, 48px);
    overflow-y: auto;
  }

  h2 {
    margin-bottom: 10px;
    font-family: "Orbitron", "Space Mono", sans-serif;
  }

  .saves.embedded {
    width: auto;
    height: auto;
    margin-top: 44px;
    overflow: visible;
    background: transparent;
    border: 0;
    border-top: 1px solid #2c3b54;
    border-radius: 0;
    box-shadow: none;

    .saves-content {
      height: auto;
      padding: 34px 0 0;
      overflow: visible;
    }

    h2 {
      color: #e8edf6;
      font-size: clamp(1.35rem, 3vw, 2rem);
    }
  }

  .description {
    margin-bottom: 30px;
    color: #a8acb5;
    line-height: 1.5;
  }

  .save-form {
    max-width: 650px;
    margin-bottom: 36px;

    label {
      display: block;
      margin-bottom: 8px;
      color: #78a9e8;
      font-size: 0.75rem;
      text-transform: uppercase;
    }

    div {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
    }
  }

  input,
  button {
    min-height: 44px;
    padding: 9px 13px;
    color: #e8edf6;
    background: #0c1728;
    border: 1px solid #326dbd;
    border-radius: 4px;
    font: inherit;
  }

  button {
    cursor: pointer;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }

    &:hover,
    &:focus-visible:not(:disabled) {
      color: #07101d;
      background: #78a9e8;
      outline: 2px solid #ffffff;
      outline-offset: 2px;
    }
  }

  .save-list {
    max-width: 650px;

    h2 {
      margin-bottom: 14px;
      color: #b9d4f5;
      font-size: 1rem;
    }
  }

  .save-row {
    padding: 10px 0;
    border-bottom: 1px dashed #294f80;

    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 14px;

    span {
      display: grid;
      gap: 4px;
    }

    strong {
      color: #b9d4f5;
    }

    small {
      color: #a8acb5;
      line-height: 1.4;
    }
  }

  .status-message {
    margin-top: 24px;
    color: #b9d4f5;
  }
</style>
