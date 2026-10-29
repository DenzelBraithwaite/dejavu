<script lang="ts">
  import { campaignState } from '../stores/campaign';
  import location from '../stores/location';

  function closeLogs(): void {

    // Logs are a cartridge view, not a separate top-level destination.
    location.set('terminal');
  }
</script>

<section class="journal" class:hide={$location !== 'journal'} aria-labelledby="journal-title">
  <header>
    <span>DEJAVU://CARTRIDGE_LOGS</span>
    <button type="button" on:click={closeLogs}>CLOSE LOGS</button>
  </header>

  <div class="journal-content">
    <p class="eyebrow">{$campaignState?.story?.title ?? 'NO CARTRIDGE'}</p>
    <h1 id="journal-title">Campaign logs</h1>

    {#if !$campaignState?.story}
      <div class="no-cartridge">
        <p>Load a story cartridge to create and view its logs.</p>
        <button type="button" on:click={closeLogs}>Return to Cartridge</button>
      </div>
    {:else}

      <div class="journal-grid">
        <article>
          <h2>Decisions</h2>
          {#if $campaignState.decisions.length}
            <ol>
              {#each [...$campaignState.decisions].reverse() as decision}
                <li>
                  <span>{decision.sceneId ?? 'Unknown scene'}</span>
                  <p>
                    {decision.label ?? (decision.successful ? 'Successful roll' : 'Failed roll')}
                    {decision.randomized ? ' · randomly resolved' : ''}
                  </p>
                </li>
              {/each}
            </ol>
          {:else}
            <p class="empty-state">No important decisions recorded for this cartridge.</p>
          {/if}
        </article>

        <article>
          <h2>Transcript</h2>
          {#if $campaignState.transcript.length}
            <ol>
              {#each [...$campaignState.transcript].reverse() as entry}
                <li>
                  <span>{entry.speaker ?? 'Narrator'}{entry.sceneId ? ` · ${entry.sceneId}` : ''}</span>
                  <p>{entry.text}</p>
                </li>
              {/each}
            </ol>
          {:else}
            <p class="empty-state">This cartridge's transcript is empty.</p>
          {/if}
        </article>
      </div>
    {/if}
  </div>
</section>

<style lang="scss">
  .journal {
    width: 100%;
    height: 100%;
    max-width: 1100px;
    overflow: hidden;
    background: #07101a;
    border: 1px solid #4382cf;
    border-radius: 8px;
    box-shadow: 0 0 30px #4382cf38;

    > header {
      padding: 11px 14px;
      color: #bad8f5;
      background: #0e2035;
      border-bottom: 1px solid #4382cf;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.75rem;
      letter-spacing: 2px;

      display: flex;
      justify-content: space-between;
      align-items: center;

      button {
        min-height: 28px;
        padding: 4px 9px;
        color: #d5e9fb;
        background: #091522;
        border: 1px solid #4382cf;
        cursor: pointer;
        font-size: 0.62rem;
      }
    }
  }

  .journal-content {
    height: calc(100% - 38px);
    padding: clamp(22px, 4vw, 48px);
    overflow-y: auto;
  }

  h1 {
    margin-bottom: 28px;
    font-family: "Orbitron", "Space Mono", sans-serif;
  }

  .eyebrow {
    margin-bottom: 7px;
    color: #70a9e2;
    font-size: 0.68rem;
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }

  .no-cartridge {
    padding: 24px;
    background: #0b1725;
    border: 1px solid #274f7b;

    p {
      margin-bottom: 18px;
      color: #afc4d9;
    }

    button {
      min-height: 38px;
      padding: 8px 12px;
      color: #06101b;
      background: #70a9e2;
      border: 1px solid #bad8f5;
      cursor: pointer;
      font-weight: 800;
    }
  }

  .journal-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;

    article {
      padding: 20px;
      background: #0b1725;
      border: 1px solid #274f7b;
    }

    h2 {
      margin-bottom: 18px;
      color: #bad8f5;
      font-size: 1rem;
    }

    ol {
      list-style: none;
    }

    li {
      padding: 12px 0;
      border-bottom: 1px dashed #274f7b;
    }

    span {
      color: #70a9e2;
      font-size: 0.72rem;
      text-transform: uppercase;
    }

    p {
      margin-top: 5px;
      color: #e8edf6;
      line-height: 1.45;
    }
  }

  .empty-state {
    color: #8893a2;
  }

  @media (max-width: 850px) {
    .journal-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
