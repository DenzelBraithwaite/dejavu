<script lang="ts">
  import { localPlayer } from '../stores/campaign';
  import location from '../stores/location';
  import { characterRegistry } from '../story/characters';
</script>

<section class="bag" class:hide={$location !== 'bag'} aria-labelledby="bag-title">
  <header>DEJAVU://BAG</header>

  <div class="bag-content">
    <h1 id="bag-title">Bag and known contacts</h1>

    <div class="bag-grid">
      <article>
        <h2>Inventory</h2>
        {#if $localPlayer?.inventory.length}
          <ul class="inventory-list">
            {#each $localPlayer.inventory as item}
              <li>{item}</li>
            {/each}
          </ul>
        {:else}
          <p class="empty-state">Your bag is empty.</p>
        {/if}
      </article>

      <article>
        <h2>Known contacts</h2>
        {#if $localPlayer?.knownCharacters.length}
          <div class="contact-list">
            {#each $localPlayer.knownCharacters as characterId}
              {@const character = characterRegistry[characterId]}
              {#if character}
                <div class="contact-card">
                  {#if character.image}
                    <img src={character.image} alt="">
                  {/if}
                  <div>
                    <h3>{character.name}</h3>
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
  </div>
</section>

<style lang="scss">
  .bag {
    width: 100%;
    height: 95vh;
    max-width: 1100px;
    overflow: hidden;
    background: #07100e;
    border: 1px solid #4f813d;
    border-radius: 8px;
    box-shadow: 0 0 30px #4f813d2f;

    > header {
      padding: 11px 14px;
      color: #d7f0bb;
      background: #112016;
      border-bottom: 1px solid #4f813d;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.75rem;
      letter-spacing: 2px;
    }
  }

  .bag-content {
    height: calc(100% - 38px);
    padding: clamp(22px, 4vw, 48px);
    overflow-y: auto;
  }

  h1 {
    margin-bottom: 28px;
    font-family: "Orbitron", "Space Mono", sans-serif;
  }

  .bag-grid {
    display: grid;
    grid-template-columns: minmax(220px, 0.7fr) minmax(0, 1.3fr);
    gap: 20px;

    article {
      padding: 20px;
      background: #0d1713;
      border: 1px solid #2c4024;
    }

    h2 {
      margin-bottom: 18px;
      color: #9fcf87;
      font-size: 1rem;
    }
  }

  .inventory-list {
    list-style: square inside;

    li {
      padding: 8px 0;
      color: #e8edf6;
      border-bottom: 1px dashed #2c4024;
    }
  }

  .contact-list {
    display: grid;
    gap: 12px;
  }

  .contact-card {
    padding: 14px;
    background: #08100c;
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

    h3 {
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
