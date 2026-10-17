<script lang="ts">
  import { campaignState } from '../stores/campaign';
  import location from '../stores/location';
</script>

<section class="journal" class:hide={$location !== 'journal'} aria-labelledby="journal-title">
  <header>DEJAVU://JOURNAL</header>

  <div class="journal-content">
    <h1 id="journal-title">Campaign journal</h1>

    <div class="journal-grid">
      <article>
        <h2>Decisions</h2>
        {#if $campaignState?.decisions.length}
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
          <p class="empty-state">No important decisions recorded.</p>
        {/if}
      </article>

      <article>
        <h2>Transcript</h2>
        {#if $campaignState?.transcript.length}
          <ol>
            {#each [...$campaignState.transcript].reverse() as entry}
              <li>
                <span>{entry.speaker ?? 'Narrator'}</span>
                <p>{entry.text}</p>
              </li>
            {/each}
          </ol>
        {:else}
          <p class="empty-state">The transcript is empty.</p>
        {/if}
      </article>
    </div>
  </div>
</section>

<style lang="scss">
  .journal {
    width: 100%;
    height: 95vh;
    max-width: 1100px;
    overflow: hidden;
    background: #080b13;
    border: 1px solid #9962ff;
    border-radius: 8px;
    box-shadow: 0 0 30px #9962ff2f;

    > header {
      padding: 11px 14px;
      color: #c3a8ff;
      background: #171128;
      border-bottom: 1px solid #9962ff;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.75rem;
      letter-spacing: 2px;
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

  .journal-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;

    article {
      padding: 20px;
      background: #11101b;
      border: 1px solid #34274e;
    }

    h2 {
      margin-bottom: 18px;
      color: #c3a8ff;
      font-size: 1rem;
    }

    ol {
      list-style: none;
    }

    li {
      padding: 12px 0;
      border-bottom: 1px dashed #34274e;
    }

    span {
      color: #9962ff;
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
