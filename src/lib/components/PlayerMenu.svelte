<script lang="ts">
  import { localPlayer } from '../stores/campaign';
  import location from '../stores/location';
</script>

<section class="player-menu" class:hide={$location !== 'player'} aria-labelledby="player-menu-title">
  <header>DEJAVU://CARTRIDGE_PLAYER</header>

  <div class="player-content">
    <p class="eyebrow">ACTIVE STORY IDENTITY</p>
    <h1 id="player-menu-title">{$localPlayer?.name ?? 'No player loaded'}</h1>

    {#if $localPlayer}
      <div class="player-grid">
        <article class="identity-card">
          <span>STORY PLAYER</span>
          <strong>{$localPlayer.name}</strong>
          <p>
            This identity, wallet, and stat profile belong to the current cartridge session.
          </p>
        </article>

        <article>
          <h2>Player state</h2>
          <dl>
            <div>
              <dt>Wallet</dt>
              <dd>{$localPlayer.wallet.toLocaleString()}₭</dd>
            </div>
            {#each Object.entries($localPlayer.stats) as [stat, value]}
              <div>
                <dt>{stat}</dt>
                <dd>{value}</dd>
              </div>
            {/each}
          </dl>
        </article>
      </div>
    {:else}
      <div class="empty-state">
        Insert and start a cartridge to view its active player.
      </div>
    {/if}
  </div>
</section>

<style lang="scss">
  .player-menu {
    width: 100%;
    height: 100%;
    max-width: 1100px;
    overflow: hidden;
    background: #07111c;
    border: 1px solid #6aaee8;
    border-radius: 8px;
    box-shadow: 0 0 30px #6aaee838;

    > header {
      padding: 11px 14px;
      color: #d2eaff;
      background: #122942;
      border-bottom: 1px solid #6aaee8;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.75rem;
      letter-spacing: 2px;
    }
  }

  .player-content {
    height: calc(100% - 38px);
    padding: clamp(22px, 4vw, 48px);
    overflow-y: auto;
  }

  .eyebrow {
    margin-bottom: 7px;
    color: #82bced;
    font-size: 0.68rem;
    letter-spacing: 1.5px;
  }

  h1 {
    margin-bottom: 28px;
    font-family: "Orbitron", "Space Mono", sans-serif;
  }

  .player-grid {
    display: grid;
    grid-template-columns: minmax(220px, 0.65fr) minmax(0, 1.35fr);
    gap: 20px;

    article {
      padding: 22px;
      background: #0b1827;
      border: 1px solid #315f87;
    }
  }

  .identity-card {
    align-content: start;

    display: grid;
    gap: 12px;

    span {
      color: #82bced;
      font-size: 0.65rem;
      letter-spacing: 1.4px;
    }

    strong {
      color: #d2eaff;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 1.25rem;
    }

    p {
      color: #a9bdd1;
      line-height: 1.65;
    }
  }

  h2 {
    margin-bottom: 16px;
    color: #b9dcf8;
    font-size: 1rem;
  }

  dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;

    div {
      padding: 11px 13px;
      background: #08131f;
      border: 1px solid #294d6d;
    }
  }

  dt {
    color: #7f9bb5;
    font-size: 0.63rem;
    text-transform: uppercase;
  }

  dd {
    margin-top: 5px;
    color: #9fd0f7;
    font-weight: 800;
  }

  .empty-state {
    padding: 24px;
    color: #a9bdd1;
    background: #0b1827;
    border: 1px solid #315f87;
  }

  @media (max-width: 760px) {
    .player-grid {
      grid-template-columns: 1fr;
    }

    dl {
      grid-template-columns: 1fr;
    }
  }
</style>
