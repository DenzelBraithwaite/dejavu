<script lang="ts">
  import location from '../stores/location';
  import { minigameSessions, type MinigameId } from '../stores/minigameSessions';

  const minigames: Array<{
    id: MinigameId;
    title: string;
    description: string;
    playerCount: number;
    playerLabel?: string;
    status: string;
    artwork: string;
  }> = [
    {
      id: 'netrunners',
      title: 'NetRunners',
      description: 'Bet on rival hacker factions as they race across a volatile data grid.',
      playerCount: 2,
      playerLabel: '1–2 PLAYERS',
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
    },
    {
      id: 'pigz',
      title: 'Pigz',
      description: 'Roll, bank, and push your luck in a neon-pink race to 100.',
      playerCount: 2,
      playerLabel: '1–2 PLAYERS',
      status: 'READY',
      artwork: 'pigz'
    },
    {
      id: 'trace-race',
      title: 'TracerT',
      description: 'Hunt a hidden rival signal through a neon network before they trace you first.',
      playerCount: 2,
      playerLabel: '1–2 PLAYERS',
      status: 'READY',
      artwork: 'trace-race'
    },
    {
      id: 'packet-war',
      title: 'Packettack',
      description: 'Deploy tactical programs in a runner duel or breach hostile BLACK ICE together.',
      playerCount: 2,
      status: 'READY',
      artwork: 'packet-war'
    },
    {
      id: 'lo-hi',
      title: 'Lo-Hi',
      description: 'Predict the next card, take calculated risks, and hold before the signal breaks.',
      playerCount: 2,
      playerLabel: '1–2 PLAYERS',
      status: 'READY',
      artwork: 'lo-hi'
    },
    {
      id: 'mastermind',
      title: 'Cipher',
      description: 'Crack a hidden four-digit cipher alone or race another codebreaker round by round.',
      playerCount: 2,
      playerLabel: '1–2 PLAYERS',
      status: 'READY',
      artwork: 'mastermind'
    },
    {
      id: 'chopsticks',
      title: 'Overclock',
      description: 'Overload enemy RAM sticks while redistributing your own memory across four slots.',
      playerCount: 2,
      playerLabel: '1–2 PLAYERS',
      status: 'READY',
      artwork: 'chopsticks'
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
            {:else if minigame.artwork === 'billywig'}
              <div class="billywig-card billywig-card--left">09</div>
              <div class="billywig-card billywig-card--center">26</div>
              <div class="billywig-card billywig-card--right">16</div>
              <span class="billywig-scanline"></span>
            {:else if minigame.artwork === 'pigz'}
              <div class="pigz-die">
                <i></i>
                <i></i>
                <i></i>
                <i></i>
                <i></i>
              </div>
              <div class="pigz-score pigz-score--left">72</div>
              <div class="pigz-score pigz-score--right">89</div>
            {:else if minigame.artwork === 'trace-race'}
              <div class="trace-map">
                <i class="trace-line trace-line--one"></i>
                <i class="trace-line trace-line--two"></i>
                <i class="trace-line trace-line--three"></i>
                <span class="trace-node trace-node--one">01</span>
                <span class="trace-node trace-node--two">05</span>
                <span class="trace-node trace-node--three">09</span>
                <span class="trace-node trace-node--four">12</span>
              </div>
            {:else if minigame.artwork === 'packet-war'}
              <div class="packet-route">
                <span class="packet-deck">P1</span>
                <div class="packet-stream"><i></i><i></i><i></i></div>
                <span class="packet-deck packet-deck--hostile">ICE</span>
              </div>
            {:else}
              {#if minigame.artwork === 'lo-hi'}
                <div class="lohi-preview">
                  <span class="lohi-card lohi-card--left"><small>YM</small><strong>03</strong><img src="/yellow_monkey.png" alt=""></span>
                  <span class="lohi-card lohi-card--center"><small>BE</small><strong>07</strong><img src="/blue_eagle.png" alt=""></span>
                  <span class="lohi-card lohi-card--right"><small>PC</small><strong>10</strong><img src="/purple_cougar.png" alt=""></span>
                </div>
              {:else if minigame.artwork === 'chopsticks'}
                <div class="ram-preview">
                  <span><i></i><strong>1<small>GB</small></strong></span>
                  <span><i></i><strong>2<small>GB</small></strong></span>
                  <span class="hot"><i></i><strong>4<small>GB</small></strong></span>
                  <span class="empty"><i></i><strong>0<small>GB</small></strong></span>
                </div>
              {:else}
                <div class="arcade-glyph arcade-glyph--{minigame.artwork}">
                  <span>•</span><span>4</span><span>?</span><span>1</span>
                </div>
              {/if}
            {/if}
          </div>
          <div class="module-copy">
            <div class="module-meta">
              <span>{minigame.status}</span>
              <span>{minigame.playerLabel ?? `${minigame.playerCount} ${minigame.playerCount === 1 ? 'PLAYER' : 'PLAYERS'}`}</span>
            </div>
            <h2>{minigame.title}</h2>
            <p>{minigame.description}</p>
            <button type="button" on:click={() => location.set(minigame.id)}>
              {$minigameSessions[minigame.id]?.active ? 'Resume' : 'Launch'}
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

    display: flex;
    flex-direction: column;
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

  .module-art--pigz {
    background:
      linear-gradient(90deg, #ff75fd12 1px, transparent 1px),
      linear-gradient(#ff75fd12 1px, transparent 1px),
      radial-gradient(circle at center, #5c1f68, #09040d 68%);
    background-size: 22px 22px, 22px 22px, auto;

    display: grid;
    place-items: center;
  }

  .pigz-die {
    z-index: 2;
    width: 104px;
    height: 104px;
    padding: 18px;
    background: #fff6fc;
    border: 3px solid #ff3dbb;
    border-radius: 18px;
    box-shadow: 0 0 25px #ff75fdaa;

    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);

    i {
      width: 14px;
      height: 14px;
      place-self: center;
      background: #ff3dbb;
      border-radius: 50%;
      box-shadow: 0 0 7px #ff3dbb88;

      &:nth-child(1) {
        grid-area: 1 / 1;
      }

      &:nth-child(2) {
        grid-area: 1 / 3;
      }

      &:nth-child(3) {
        grid-area: 2 / 2;
      }

      &:nth-child(4) {
        grid-area: 3 / 1;
      }

      &:nth-child(5) {
        grid-area: 3 / 3;
      }
    }
  }

  .pigz-score {
    position: absolute;
    color: #ffb4e5;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: 1.35rem;
    font-weight: 900;
  }

  .pigz-score--left {
    left: 16%;
  }

  .pigz-score--right {
    right: 16%;
  }

  .module-art--trace-race {
    background:
      linear-gradient(90deg, #00d7eb0d 1px, transparent 1px),
      linear-gradient(#00d7eb0d 1px, transparent 1px),
      radial-gradient(circle at center, #073c47, #02090d 70%);
    background-size: 22px 22px, 22px 22px, auto;
  }

  .trace-map {
    position: absolute;
    inset: 0;
  }

  .trace-line {
    position: absolute;
    height: 2px;
    background: #00d7eb;
    box-shadow: 0 0 8px #00d7eb;
    transform-origin: left center;
  }

  .trace-line--one {
    width: 38%;
    left: 19%;
    top: 36%;
    transform: rotate(16deg);
  }

  .trace-line--two {
    width: 40%;
    left: 44%;
    top: 48%;
    transform: rotate(-20deg);
  }

  .trace-line--three {
    width: 48%;
    left: 23%;
    top: 67%;
    transform: rotate(-5deg);
  }

  .trace-node {
    position: absolute;
    width: 42px;
    height: 42px;
    color: #051013;
    background: #00d7eb;
    border: 2px solid #c9fcff;
    border-radius: 50%;
    box-shadow: 0 0 18px #00d7eb;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: 0.65rem;

    display: grid;
    place-items: center;
  }

  .trace-node--one {
    left: 13%;
    top: 23%;
  }

  .trace-node--two {
    left: 43%;
    top: 43%;
  }

  .trace-node--three {
    left: 22%;
    top: 66%;
  }

  .trace-node--four {
    right: 12%;
    top: 24%;
    color: #ffffff;
    background: #ff4e9b;
    border-color: #ffc4df;
    box-shadow: 0 0 18px #ff4e9b;
  }

  .module-art--packet-war {
    background:
      linear-gradient(90deg, #9b72ff0d 1px, transparent 1px),
      linear-gradient(#9b72ff0d 1px, transparent 1px),
      radial-gradient(circle at center, #2b1852, #060612 70%);
    background-size: 22px 22px, 22px 22px, auto;

    display: grid;
    place-items: center;
  }

  .module-art--lo-hi,
  .module-art--mastermind,
  .module-art--chopsticks {
    background:
      linear-gradient(90deg, #ffffff0b 1px, transparent 1px),
      linear-gradient(#ffffff0b 1px, transparent 1px),
      radial-gradient(circle at center, #17344b, #050812 68%);
    background-size: 22px 22px, 22px 22px, auto;

    display: grid;
    place-items: center;
  }

  .module-art--mastermind {
    background-image: radial-gradient(circle at center, #4f2f7c, #080610 70%);
  }

  .module-art--chopsticks {
    background-image: radial-gradient(circle at center, #165435, #030905 70%);
  }

  .arcade-glyph {
    display: flex;
    align-items: center;
    gap: 10px;

    span,
    strong {
      min-width: 46px;
      padding: 12px;
      color: #02fbfb;
      background: #071521;
      border: 1px solid currentColor;
      box-shadow: 0 0 15px #02fbfb44;
      text-align: center;
    }

    strong {
      color: #ff75fd;
      font-size: 2rem;
    }
  }

  .arcade-glyph--mastermind span {
    color: #c9a7ff;
  }

  .arcade-glyph--chopsticks span,
  .arcade-glyph--chopsticks strong {
    min-width: 34px;
    color: #55f09a;
  }

  .lohi-preview {
    position: relative;
    width: 250px;
    height: 150px;
  }

  .lohi-card {
    position: absolute;
    top: 12px;
    left: 75px;
    width: 100px;
    height: 132px;
    overflow: hidden;
    color: #02fbfb;
    background: #071521;
    border: 1px solid currentColor;
    border-radius: 8px;
    box-shadow: 0 0 18px currentColor;

    display: grid;
    place-items: center;

    small {
      position: absolute;
      top: 7px;
      left: 8px;
      font-size: 0.56rem;
    }

    strong {
      position: relative;
      z-index: 2;
      font-size: 1.7rem;
      text-shadow: 0 0 10px #020617;
    }

    img {
      position: absolute;
      inset: 26px 8px 8px;
      width: calc(100% - 16px);
      height: calc(100% - 34px);
      object-fit: contain;
      opacity: 0.68;
    }

    &--left {
      left: 22px;
      color: #f2d40e;
      transform: rotate(-10deg);
    }

    &--center {
      z-index: 2;
      color: #27a7ff;
    }

    &--right {
      left: 128px;
      color: #b45cff;
      transform: rotate(10deg);
    }
  }

  .ram-preview {
    width: 86%;

    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 9px;

    > span {
      position: relative;
      height: 116px;
      color: #55f09a;
      background: #071c11;
      border: 2px solid currentColor;
      clip-path: polygon(0 0, 84% 0, 100% 13%, 100% 87%, 84% 100%, 0 100%);
      box-shadow: inset 0 0 16px #55f09a30;

      display: grid;
      place-items: center;

      i {
        position: absolute;
        right: 8px;
        bottom: 9px;
        left: 8px;
        height: 8px;
        border: 1px solid currentColor;
      }

      strong {
        font-size: 1.5rem;

        small {
          margin-left: 2px;
          font-size: 0.5rem;
        }
      }

      &.hot {
        color: #ff697f;
        background: #26090f;
        box-shadow: inset 0 0 16px #ff697f35;
      }

      &.empty {
        color: #64748b;
        background: #0c1117;
        border-style: dashed;
      }
    }
  }

  .packet-route {
    width: 82%;

    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .packet-deck {
    width: 68px;
    height: 92px;
    color: #7ef9ff;
    background: #09191f;
    border: 2px solid #00d7eb;
    box-shadow: 0 0 18px #00d7eb66;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-weight: 900;

    display: grid;
    place-items: center;
  }

  .packet-deck--hostile {
    color: #ff9bc5;
    background: #250c1a;
    border-color: #ff4e9b;
    box-shadow: 0 0 18px #ff4e9b66;
  }

  .packet-stream {
    position: relative;
    flex: 1;
    height: 2px;
    background: #7047c2;

    display: flex;
    justify-content: space-around;

    i {
      width: 12px;
      height: 12px;
      background: #bd9cff;
      box-shadow: 0 0 10px #9b72ff;
      transform: translateY(-5px) rotate(45deg);
    }
  }

  .module-copy {
    flex: 1;
    padding: 20px;

    display: flex;
    flex-direction: column;

    h2 {
      margin: 12px 0 10px;
      color: #ff75fd;
      font-family: "Orbitron", "Space Mono", sans-serif;
    }

    > p {
      min-height: 3.2em;
      margin-bottom: 20px;
      color: #aeb9c9;
      line-height: 1.55;
    }

    button {
      width: 100%;
      min-height: 46px;
      margin-top: auto;
      padding-top: 12px;
      padding-bottom: 12px;
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
