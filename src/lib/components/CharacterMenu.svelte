<script lang="ts">
  import { blur } from 'svelte/transition';
  import { campaignState, localPlayer } from '../stores/campaign';
  import location from '../stores/location';
  import { sessionState } from '../stores/session';
  import { characterRegistry } from '../story/characters';
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

      <section class="equipment-section" aria-labelledby="equipment-title">
        <p class="eyebrow">CARRIED EQUIPMENT</p>
        <h2 id="equipment-title">Bag and known contacts</h2>

        <div class="bag-grid">
          <article>
            <h3>Inventory</h3>
            {#if $localPlayer.inventory.length}
              <ul class="inventory-list">
                {#each $localPlayer.inventory as item}
                  <li>{item}</li>
                {/each}
              </ul>
            {:else}
              <p class="empty-state">Your bag is empty.</p>
            {/if}

            <h3 class="mods-heading">Installed neuro mods</h3>
            {#if $campaignState?.installedMods.length}
              <ul class="inventory-list">
                {#each $campaignState.installedMods as modId}
                  <li>{modId === 'neuro-link-chat' ? 'Neuro-Link Chat' : modId}</li>
                {/each}
              </ul>
            {:else}
              <p class="empty-state">No neuro mods installed.</p>
            {/if}
          </article>

          <article>
            <h3>Known contacts</h3>
            {#if $localPlayer.knownCharacters.length}
              <div class="contact-list">
                {#each $localPlayer.knownCharacters as characterId}
                  {@const character = characterRegistry[characterId]}
                  {#if character}
                    <div class="contact-card">
                      {#if character.image}
                        <img src={character.image} alt="">
                      {/if}
                      <div>
                        <h4>{character.name}</h4>
                        <p class="contact-role">
                          {character.association} · {character.role}
                        </p>
                        <p>{character.summary}</p>
                      </div>
                    </div>
                  {/if}
                {/each}
              </div>
            {:else}
              <p class="empty-state">No contacts have been identified.</p>
            {/if}
          </article>
        </div>
      </section>
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

  .equipment-section {
    margin-top: 52px;
    padding-top: 30px;
    border-top: 1px solid #19406c;

    h2 {
      margin: 8px 0 24px;
      color: #e8edf6;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: clamp(1.35rem, 3vw, 2rem);
    }
  }

  .bag-grid {
    display: grid;
    grid-template-columns: minmax(220px, 0.7fr) minmax(0, 1.3fr);
    gap: 20px;

    article {
      padding: 20px;
      background: #071a2c;
      border: 1px solid #19406c;
    }

    h3 {
      margin-bottom: 18px;
      color: #9dffa6;
      font-size: 1rem;
    }
  }

  .inventory-list {
    list-style: square inside;

    li {
      padding: 8px 0;
      color: #e8edf6;
      border-bottom: 1px dashed #19406c;
    }
  }

  .mods-heading {
    margin-top: 30px;
  }

  .contact-list {
    display: grid;
    gap: 12px;
  }

  .contact-card {
    padding: 14px;
    background: #04101d;
    border-left: 3px solid #4f813d;

    display: grid;
    grid-template-columns: auto 1fr;
    gap: 14px;

    img {
      width: 72px;
      height: 72px;
      object-fit: cover;
      border: 1px solid #4f813d;
    }

    h4 {
      color: #d7f0bb;
    }

    p {
      margin-top: 5px;
      line-height: 1.4;
    }
  }

  .contact-role {
    color: #7fa66c;
    font-size: 0.75rem;
  }

  .empty-state {
    color: #8893a2;
  }

  @media (max-width: 850px) {
    .bag-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
