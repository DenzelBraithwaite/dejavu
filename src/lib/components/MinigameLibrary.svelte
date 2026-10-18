<script lang="ts">
  import location from '../stores/location';

  const minigames = [
    {
      id: 'netrunners',
      title: 'NetRunners',
      description: 'Bet on rival hacker factions as they race across a volatile data grid.',
      playerCount: 2,
      status: 'READY',
      artwork: 'netrunners'
    },
    {
      id: 'billywig',
      title: 'Billywig',
      description: 'Risk your ₭rypto against Tilda in a neon card duel where 26 is perfection.',
      playerCount: 1,
      status: 'READY',
      artwork: 'billywig'
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
          <div class="module-art module-art--{minigame.artwork}" aria-hidden="true">
            {#if minigame.artwork === 'netrunners'}
              <img src="/neon_animals.png" alt="">
            {:else}
              <div class="billywig-card billywig-card--left">09</div>
              <div class="billywig-card billywig-card--center">26</div>
              <div class="billywig-card billywig-card--right">16</div>
              <span class="billywig-scanline"></span>
            {/if}
          </div>
          <div class="module-copy">
            <div class="module-meta">
              <span>{minigame.status}</span>
              <span>{minigame.playerCount} {minigame.playerCount === 1 ? 'PLAYER' : 'PLAYERS'}</span>
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
    position: relative;
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

  .module-art--billywig {
    background:
      linear-gradient(90deg, #ff75fd12 1px, transparent 1px),
      linear-gradient(#6dc2fb12 1px, transparent 1px),
      radial-gradient(circle at 50% 45%, #453b82, #080610 68%);
    background-size: 24px 24px, 24px 24px, auto;

    display: flex;
    justify-content: center;
    align-items: center;
  }

  .billywig-card {
    position: absolute;
    width: 84px;
    height: 122px;
    padding: 12px;
    color: #6dc2fb;
    background: #0a1324;
    border: 2px solid #6dc2fb;
    border-radius: 6px 22px;
    box-shadow: 0 0 18px #6dc2fb66;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: 1.4rem;
    font-weight: 800;
  }

  .billywig-card--left {
    transform: translateX(-64px) rotate(-12deg);
  }

  .billywig-card--center {
    z-index: 2;
    color: #ff75fd;
    border-color: #ff75fd;
    box-shadow: 0 0 26px #ff75fd88;
    transform: translateY(-8px);
  }

  .billywig-card--right {
    color: #f2d40e;
    border-color: #f2d40e;
    box-shadow: 0 0 18px #f2d40e66;
    transform: translateX(64px) rotate(12deg);
  }

  .billywig-scanline {
    position: absolute;
    z-index: 3;
    inset: 0;
    background: repeating-linear-gradient(
      transparent 0,
      transparent 4px,
      #ffffff08 5px
    );
    pointer-events: none;
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
