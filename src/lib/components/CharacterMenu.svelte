<script lang="ts">
  import { blur } from 'svelte/transition';
  import { campaignState, localPlayer } from '../stores/campaign';
  import location from '../stores/location';
  import { sessionState } from '../stores/session';
</script>

<section
  class="character-terminal"
  class:hide={$location !== 'character'}
  transition:blur={{ duration: 300 }}
  aria-labelledby="character-title"
>
  <header>
    <span>DEJAVU://IDENTITY</span>
    <span>{$sessionState.playerId?.toUpperCase()}</span>
  </header>

  <div class="screen">
    <p class="eyebrow">SYMBI BIOLINK PROFILE</p>
    <h1 id="character-title">{$localPlayer?.name ?? 'Unknown player'}</h1>

    {#if $localPlayer}
      <dl class="stats-grid">
        {#each Object.entries($localPlayer.stats) as [stat, value]}
          <div>
            <dt>{stat}</dt>
            <dd>{value}</dd>
          </div>
        {/each}
      </dl>

      <div class="profile-summary">
        <p>
          <span>STATUS</span>
          {$localPlayer.statusEffects.length > 0
            ? $localPlayer.statusEffects.join(', ')
            : 'STABLE'}
        </p>
        <p>
          <span>CAMPAIGN</span>
          {$campaignState?.campaignId.slice(0, 8)}
        </p>
      </div>
    {/if}
  </div>
</section>

<style lang="scss">
  .character-terminal {
    width: 100%;
    height: 95vh;
    max-width: 1100px;
    overflow: hidden;
    background: #04101d;
    border: 1px solid #1472bf;
    border-radius: 8px;
    box-shadow: 0 0 34px #1472bf33;

    header {
      min-height: 38px;
      padding: 8px 14px;
      color: #6dc2fb;
      background: #071d33;
      border-bottom: 1px solid #1472bf;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.75rem;
      letter-spacing: 2px;

      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  }

  .screen {
    height: calc(100% - 38px);
    padding: clamp(24px, 5vw, 64px);
    overflow-y: auto;
  }

  .eyebrow {
    margin-bottom: 8px;
    color: #4a98d9;
    font-size: 0.75rem;
    letter-spacing: 2px;
  }

  h1 {
    margin-bottom: 32px;
    color: #e8edf6;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: clamp(2rem, 5vw, 4rem);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px;

    div {
      padding: 16px;
      background: #071a2c;
      border: 1px solid #19406c;
      border-left: 3px solid #02fbfb;
    }

    dt {
      margin-bottom: 8px;
      color: #8893a2;
      font-size: 0.7rem;
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    dd {
      color: #02fbfb;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 1.5rem;
    }
  }

  .profile-summary {
    margin-top: 32px;
    padding-top: 18px;
    border-top: 1px dashed #334155;

    display: flex;
    flex-wrap: wrap;
    gap: 28px;

    p {
      color: #e8edf6;
    }

    span {
      margin-right: 8px;
      color: #4a98d9;
    }
  }
</style>
