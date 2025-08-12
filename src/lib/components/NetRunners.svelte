<script lang="ts">
  // Hooks
  import { createEventDispatcher } from 'svelte';

  // Transitions
  import { blur } from 'svelte/transition';

  // stores
  import { type Writable } from 'svelte/store';
  import { socket } from '../socket';
  import { player1, player2, type Player } from '../stores/players';
  import { type GameState, currentGameState } from '../stores/gameState';

  // Props
  export let location: Writable<string>;

  const createEvent = createEventDispatcher();
  const player: Player = returnPlayer();

  function returnPlayer(): Player {
    return $currentGameState.playingAs === 'male' ? $player1 : $player2;
  }

  const purpleDeck = Array(10).fill('purple');
  const pinkDeck = Array(10).fill('pink');
  const yellowDeck = Array(10).fill('yellow');
  const cyanDeck = Array(10).fill('cyan');
  const blueDeck = Array(10).fill('blue');
  const fullDeck = [...purpleDeck, ...pinkDeck, ...yellowDeck, ...cyanDeck, ...blueDeck, ];

  // TODO: logic
</script>

<div transition:blur={{duration: 1000}} class="terminal" class:hide={$location !== 'netrunners'}>
  <h1 class="title">
    Net<span class="colored-r">R</span>unners
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon">
      <path d="M12 20v2"/>
      <path d="M12 2v2"/>
      <path d="M17 20v2"/>
      <path d="M17 2v2"/>
      <path d="M2 12h2"/>
      <path d="M2 17h2"/>
      <path d="M2 7h2"/>
      <path d="M20 12h2"/>
      <path d="M20 17h2"/>
      <path d="M20 7h2"/>
      <path d="M7 20v2"/>
      <path d="M7 2v2"/>
      <rect x="4" y="4" width="16" height="16" rx="2"/>
      <rect x="8" y="8" width="8" height="8" rx="1"/>
    </svg>
  </h1>
  <div class="terminal-screen">
    <!-- TODO: suit imgs -->
    <div class="cards">
      <div class="card card__pink">
        Card
      </div>

      <div class="card card__blue">
        Card
      </div>

      <div class="card card__yellow">
        Card
      </div>

      <div class="card card__cyan">
        Card
      </div>

      <div class="card card__purple">
        Card
      </div>
    </div>
  </div>
</div>

<style lang="scss">
  @use 'sass:color';

  $terminalBg: #241c55;
  $purple: #9962ff;
  $pink: #F837CD;
  $yellow: #F2D40E;
  $cyan: #02FBFB;
  $blue: #0779FC;

  // Neons
  $neonPurple: #BC13FE;
  $neonPink: #F535AA;
  $neonYellow: #FFF01F;
  $neonYellowGreen: #CCFF00;
  $neonCyan: #00F0FF;
  $neonBlue: #1F51FF;

  .terminal {
    position: relative;
    background-color: $terminalBg;
    height: 100%;
    max-height: 95vh;
    width: 100%;
    max-width: 1100px; // 
    border: 2px solid $yellow;
    border-top-width: 0;
    border-bottom-width: 4px;
    border-radius: var(--border-radius-small);
    padding: 20px;
    overflow-wrap: break-word;
    transition: all 0.5s ease-out;
    margin-bottom: 20px;

    display: flex;
    flex-direction: column;
  }
  
  .terminal-screen {
    position: relative;
    height: 100%;
    width: 100%;
    min-width: 400px;
    border-radius: 24px;
    padding: 12px;
    overflow-y: scroll;
    box-shadow: inset -4px 0 20px #00000086;

    &::after {
      content: '';
      height: 100%;
      width: 100%;
      opacity: 0.05;
      background: url('/neon_animals.png');
      background-repeat: no-repeat;
      background-position: center;
      background-size: cover;
      filter: blur(6px);

      position: absolute;
      top: 0;
      left: 0;
    }
    
    ::-webkit-scrollbar-track {
      background-color: #111111;
    }
  
    ::-webkit-scrollbar-thumb {
      background: #ddd;
      border-radius: 4px;
    }

    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
  }

  .title {
    font-size: 2rem;
    font-family: "Orbitron", "Space Mono", sans-serif;
    letter-spacing: 2px;
    background-color: $yellow;
    width: 100%;
    border-radius: var(--border-radius-small) var(--border-radius-small) 50% 50%;
    padding: 22px 4px 4px;
    text-align: center;
    font-weight: normal;
    box-shadow: 0 2px 8px color.scale($yellow, $alpha: -50%);
    text-shadow: 0 0 2px #000;

    position: absolute;
    top: 0;
    left: 0;
  }

  .cards {
    background-color: black;
    padding: 18px;
    border: 1px solid grey;
    border-radius: 8px;
    width: 80%;

    position: absolute;
    bottom: 50%;
    right: 50%;
    transform: translate(50%, 50%);

    display: flex;
    justify-content: space-evenly;
  }

  .card {
    font-family: "Orbitron", "Space Mono", sans-serif;
    letter-spacing: 2px;
    height: 200px;
    width: 125px;
    padding: 4px;
    border-radius: 4px 20px;
  }

  .card__purple {
    border: 2px double $purple;
  }

  .card__pink {
    border: 2px double $pink;
  }

  .card__yellow {
    border: 2px double $yellow;
  }

  .card__cyan {
    border: 2px double $cyan;
  }

  .card__blue {
    border: 2px double $blue;
  }

  .colored-r {
    font-weight: bold;
    font-size: 2.5rem;
    color: $purple;
  }
  
  .icon {
    width: 32px;
    height: 32px;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 2.75;
    stroke: $purple;
    fill: none;

    position: relative;
    top: 4px;
  }
</style>