<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { StoryVersionSummary } from '../../stores/library';

  export let versions: StoryVersionSummary[] = [];
  export let currentVersion = 1;
  export let loading = false;
  export let restoring = false;

  const dispatch = createEventDispatcher<{
    refresh: void;
    restore: { version: number };
  }>();

  let selectedVersion = 0;
  let confirmationOpen = false;

  $: availableVersions = versions.filter((entry) => {
    return entry.version !== currentVersion;
  });

  $: if (!availableVersions.some((entry) => entry.version === selectedVersion)) {
    selectedVersion = availableVersions[0]?.version ?? 0;
    confirmationOpen = false;
  }

  function requestRestore(): void {
    if (!selectedVersion) {
      return;
    }

    confirmationOpen = true;
  }

  function cancelRestore(): void {
    confirmationOpen = false;
  }

  function confirmRestore(): void {
    dispatch('restore', {
      version: selectedVersion
    });
    confirmationOpen = false;
  }

  function formatSavedAt(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return 'Unknown save time';
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  }
</script>

<section class="version-history settings-section" aria-labelledby="version-history-title">
  <div class="version-history-heading">
    <div>
      <span>05</span>
      <div>
        <h3 id="version-history-title">Version history</h3>
        <p>The newest ten saved cartridge versions are retained on this host.</p>
      </div>
    </div>
    <button type="button" disabled={loading || restoring} on:click={() => dispatch('refresh')}>
      {loading ? 'Loading…' : 'Refresh'}
    </button>
  </div>

  {#if versions.length === 0 && !loading}
    <p class="empty-history">No saved versions are available yet.</p>
  {:else}
    <div class="version-list" aria-label="Saved story versions">
      {#each versions as entry (entry.version)}
        <article class:current={entry.version === currentVersion}>
          <div>
            <strong>Version {entry.version}</strong>
            {#if entry.version === currentVersion}
              <span>CURRENT</span>
            {/if}
          </div>
          <p>{formatSavedAt(entry.savedAt)}</p>
          <small>{entry.status === 'playable' ? 'Playable' : 'Draft'} · {entry.author || 'Unknown author'}</small>
        </article>
      {/each}
    </div>

    {#if availableVersions.length > 0}
      <div class="restore-controls">
        <label>
          <span>Version to restore</span>
          <select bind:value={selectedVersion} disabled={restoring}>
            {#each availableVersions as entry}
              <option value={entry.version}>
                Version {entry.version} · {formatSavedAt(entry.savedAt)}
              </option>
            {/each}
          </select>
        </label>
        <button type="button" disabled={!selectedVersion || restoring} on:click={requestRestore}>
          {restoring ? 'Restoring…' : 'Restore selected version'}
        </button>
      </div>
    {/if}
  {/if}

  <p class="history-explanation">
    Restoring never deletes newer work. The selected snapshot is copied into a new version at the top of the history.
  </p>

  {#if confirmationOpen}
    <div class="restore-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="restore-version-title">
      <p>RESTORE CARTRIDGE</p>
      <h4 id="restore-version-title">Copy version {selectedVersion} into a new version?</h4>
      <p>The current version remains in history, and the restored copy becomes version {currentVersion + 1}.</p>
      <div>
        <button type="button" disabled={restoring} on:click={cancelRestore}>Cancel</button>
        <button class="confirm-restore" type="button" disabled={restoring} on:click={confirmRestore}>
          Restore as version {currentVersion + 1}
        </button>
      </div>
    </div>
  {/if}
</section>

<style lang="scss">
  .version-history {
    position: relative;
    display: grid;
    gap: 18px;
  }

  .version-history-heading {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 18px;

    > div {
      display: flex;
      align-items: start;
      gap: 12px;
    }

    > div > span {
      color: #ff9c51;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.74rem;
    }

    h3,
    p {
      margin: 0;
    }

    p {
      margin-top: 5px;
      color: #9aa9bc;
      font-size: 0.78rem;
    }
  }

  button,
  select {
    min-height: 40px;
    color: #e9f0fa;
    background: #0c1522;
    border: 1px solid #53647b;
    border-radius: 5px;
    font: inherit;
  }

  button {
    padding: 9px 14px;
    cursor: pointer;

    &:hover:not(:disabled) {
      color: #ffffff;
      border-color: #ff9c51;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }

  .version-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;

    article {
      padding: 12px;
      background: #09111c;
      border: 1px solid #314258;
      border-left: 3px solid #596b82;
      border-radius: 4px;

      &.current {
        border-color: #ff9c51;
        box-shadow: 0 0 16px #ff8a3222;
      }

      > div {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }

      span {
        padding: 3px 6px;
        color: #160b04;
        background: #ff9c51;
        border-radius: 3px;
        font-size: 0.58rem;
        font-weight: 800;
      }

      p {
        margin: 7px 0 3px;
        color: #c7d2e1;
        font-size: 0.72rem;
      }

      small {
        color: #8494a9;
      }
    }
  }

  .restore-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 12px;

    label {
      display: grid;
      gap: 7px;
    }

    label > span {
      color: #aebdd0;
      font-size: 0.7rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    select {
      width: 100%;
      padding: 8px 10px;
    }
  }

  .history-explanation,
  .empty-history {
    margin: 0;
    color: #96a8be;
    font-size: 0.76rem;
    line-height: 1.6;
  }

  .restore-confirmation {
    padding: 18px;
    background: #160d08;
    border: 1px solid #ff9c51;
    border-radius: 6px;
    box-shadow: 0 12px 36px #00000066;

    > p:first-child {
      margin: 0 0 6px;
      color: #ff9c51;
      font-size: 0.66rem;
      letter-spacing: 0.14em;
    }

    h4 {
      margin: 0;
      color: #ffffff;
    }

    > p:not(:first-child) {
      color: #b9c5d4;
    }

    > div {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }

    .confirm-restore {
      color: #1a0d05;
      background: #ff9c51;
      border-color: #ff9c51;
      font-weight: 800;
    }
  }

  @media (max-width: 720px) {
    .version-history-heading,
    .restore-controls {
      grid-template-columns: 1fr;
      flex-direction: column;
    }

    .version-history-heading > button,
    .restore-controls > button {
      width: 100%;
    }
  }
</style>
