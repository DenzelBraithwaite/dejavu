<script lang="ts">
  import location from '../stores/location';

  const minigames = [
    {
      id: 'netrunners',
      title: 'NetRunners',
      description: 'Bet on rival hacker factions as they race across a volatile data grid.',
      playerCount: 2,
      status: 'READY'
    }
  ];
</script>

<section
  class="minigame-library"
  class:hide={$location !== 'minigames'}
  aria-labelledby="minigames-title"
>
  <header>DEJAVU://MINIGAME_LIBRARY</header>

  <div class="library-content">
    <p class="eyebrow">INSTALLED MODULES</p>
    <h1 id="minigames-title">Minigames</h1>
    <p class="introduction">
      Minigames are coded modules that can be played directly or launched from
      a story node.
    </p>

    <div class="minigame-grid">
      {#each minigames as minigame}
        <article>
          <div class="module-art" aria-hidden="true">
            <img src="/neon_animals.png" alt="">
          </div>
          <div class="module-copy">
            <div class="module-meta">
              <span>{minigame.status}</span>
              <span>{minigame.playerCount} PLAYERS</span>
            </div>
            <h2>{minigame.title}</h2>
            <p>{minigame.description}</p>
            <button type="button" on:click={() => location.set(minigame.id)}>
              Launch minigame
            </button>
          </div>
        </article>
      {/each}
    </div>
  </div>
</section>

<style lang="scss">
  .minigame-library {
    width: 100%;
    height: 95vh;
    max-width: 1100px;
    overflow: hidden;
    background: #080610;
    border: 1px solid #9962ff;
    border-radius: 8px;
    box-shadow: 0 0 34px #9962ff35;

    > header {
      padding: 11px 14px;
      color: #ff75fd;
      background: #171126;
      border-bottom: 1px solid #9962ff;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.75rem;
      letter-spacing: 2px;
    }
  }

  .library-content {
    height: calc(100% - 38px);
    padding: clamp(24px, 5vw, 58px);
    overflow-y: auto;
  }

  .eyebrow {
    color: #9962ff;
    font-size: 0.7rem;
    letter-spacing: 2px;
  }

  h1 {
    margin: 8px 0 12px;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: clamp(2rem, 5vw, 3.6rem);
  }

  .introduction {
    max-width: 70ch;
    color: #aeb9c9;
    line-height: 1.6;
  }

  .minigame-grid {
    margin-top: 34px;

    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 18px;
  }

  article {
    overflow: hidden;
    background: #100b1c;
    border: 1px solid #453b82;
  }

  .module-art {
    height: 190px;
    overflow: hidden;
    background: #020617;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0.78;
    }
  }

  .module-copy {
    padding: 20px;

    h2 {
      margin: 12px 0 10px;
      color: #ff75fd;
      font-family: "Orbitron", "Space Mono", sans-serif;
    }

    > p {
      min-height: 3.2em;
      color: #aeb9c9;
      line-height: 1.55;
    }

    button {
      width: 100%;
      min-height: 46px;
      margin-top: 20px;
      color: #ffffff;
      background: #453b82;
      border: 1px solid #9962ff;
      border-radius: 4px;
      font: inherit;
      font-weight: 800;
      cursor: pointer;

      &:hover,
      &:focus-visible {
        color: #080610;
        background: #ff75fd;
        outline: 2px solid #ffffff;
        outline-offset: 2px;
      }
    }
  }

  .module-meta {
    color: #9962ff;
    font-size: 0.68rem;
    letter-spacing: 1px;

    display: flex;
    justify-content: space-between;
  }
</style>
