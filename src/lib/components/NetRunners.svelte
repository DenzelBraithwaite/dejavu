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

  // Components
  import { NetRunnersCard } from './';

  // Props
  export let location: Writable<string>;

  const createEvent = createEventDispatcher();
  const player: Player = returnPlayer();

  function returnPlayer(): Player {
    return $currentGameState.playingAs === 'male' ? $player1 : $player2;
  }

  const purpleDeck = Array(15).fill('purple');
  const pinkDeck = Array(15).fill('pink');
  const yellowDeck = Array(15).fill('yellow');
  const cyanDeck = Array(15).fill('cyan');
  const blueDeck = Array(15).fill('blue');
  let fullDeck: string[] = [...purpleDeck, ...pinkDeck, ...yellowDeck, ...cyanDeck, ...blueDeck];
  let trackCards: ('pink' | 'purple' | 'yellow' | 'cyan' | 'blue' | string)[] = [];
  let odds = {pink: 0, purple: 0, yellow: 0, cyan: 0, blue: 0};
  let gameState = {
    gameInProgress: false,
    p1: {
      name: 'should be players actual name from game',
      wallet: 0,
      amountBet: 0,
      colorBet: ''
    },
    p2: {
      name: 'CPU if singleplayer, hooman if multiplayer',
      wallet: 0,
      amountBet: 0,
      colorBet: ''
    },
    p3: {
      name: 'CPU Bob',
      wallet: 0,
      amountBet: 0,
      colorBet: ''
    },
    p4: {
      name: 'CPU Quinn',
      wallet: 0,
      amountBet: 0,
      colorBet: ''
    } // cpu
  };

  // TODO: singplayer first, then when game is done, add multi
  let gameMode: 'singleplayer' | 'multiplayer' = 'singleplayer';

  // Starts game
  function startGame(): void {
    resetGame();
    gameState.gameInProgress = true;
    trackCards = drawLaneCards();
    odds = calculateBettingOdds();
    
    // TODO: Players choose which color to vote for.
  }

  // Ends game
  function endGame() {
    gameState.gameInProgress = false;
    // TODO:
  }

  // Resets game, restoring original deck.
  function resetGame(): void {
    fullDeck = [...purpleDeck, ...pinkDeck, ...yellowDeck, ...cyanDeck, ...blueDeck];
    trackCards = [];
    odds = {pink: 0, purple: 0, yellow: 0, cyan: 0, blue: 0};

    gameState.p1.amountBet = 0;
    gameState.p2.amountBet = 0;
    gameState.p3.amountBet = 0;
    gameState.p4.amountBet = 0;
    gameState.p1.colorBet = '';
    gameState.p2.colorBet = '';
    gameState.p3.colorBet = '';
    gameState.p4.colorBet = '';
  }

  // Draws initial 7 cards that will represent the track and betting odds
  function drawLaneCards(): string[] {
    let cards: string[] = [];
    for(let i = 0; i < 7; i++) {
      const index = Math.floor(Math.random() * fullDeck.length);
      const card: string = fullDeck.splice(index, 1)[0];
      cards = [...cards, card];
    }

    return cards;
  }

  // Calculate odds for each color based on removed track cards
  function calculateBettingOdds(): {pink: number, purple: number, yellow: number, cyan: number, blue: number,} {
    const numOfPinkCards = fullDeck.filter(c => c === 'pink').length;
    const numOfPurpleCards = fullDeck.filter(c => c === 'purple').length;
    const numOfYellowCards = fullDeck.filter(c => c === 'yellow').length;
    const numOfCyanCards = fullDeck.filter(c => c === 'cyan').length;
    const numOfBlueCards = fullDeck.filter(c => c === 'blue').length;
    const total = [numOfPinkCards, numOfPurpleCards, numOfYellowCards, numOfCyanCards, numOfBlueCards].reduce((acc, curr) => acc + curr, 0);

    return {
      pink: Math.round(numOfPinkCards / total * 100),
      purple: Math.round(numOfPurpleCards / total * 100),
      yellow: Math.round(numOfYellowCards / total * 100),
      cyan: Math.round(numOfCyanCards / total * 100),
      blue: Math.round(numOfBlueCards / total * 100)
    }
  }
  
  // Flip/Draw a card
  function drawCard() {
    // TODO:
    
  }
  
  // Move's card after card is flipped
  function moveCard() {
    // TODO:
    
  }

  // Determines how much the player wins based on the odds of their winning bet.
  // 50% chance = 1/2 (keep denominator 2) 2x payout. 10% chance is 1/10 so 10x winnings.
  function calculateWinnings() {

  }
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
    <div class="lane-cards">
      {#each trackCards as card}
        <NetRunnersCard color={card}/>
      {:else}
        <NetRunnersCard placeholder={true}/>
      {/each}
      <div class="color-odds-wrapper">
        <p class="color-odds odds-color-purple">purple: {odds.purple}%</p>
        <p class="color-odds odds-color-pink">pink:{odds.pink}%</p>
        <p class="color-odds odds-color-yellow">yellow:{odds.yellow}%</p>
        <p class="color-odds odds-color-cyan">cyan:{odds.cyan}%</p>
        <p class="color-odds odds-color-blue">blue:{odds.blue}%</p>
      </div>
    </div>

    <div class="track">
      <NetRunnersCard placeholder={Boolean(! gameState.p1.colorBet)}/>
      <NetRunnersCard placeholder={Boolean(! gameState.p2.colorBet)}/>
      <NetRunnersCard placeholder={Boolean(! gameState.p3.colorBet)}/>
      <NetRunnersCard placeholder={Boolean(! gameState.p4.colorBet)}/>
    </div>

    <div style="border: 2px solid red; display: inline-block; padding: 4px; background-color: black">
      <button>SINGLEPLAYER</button>
      <button>MULTIPLAYER</button>
      <br>
      <br>
      <button on:click={startGame}>{gameState.gameInProgress ? 'RESET' : 'START'}</button>
      <br>
      <br>
      <h2>Odds of Winning</h2>
      
      <br>
      <h2>Winning amount</h2>
      <!-- TODO: altho may not make sense to do it like this -->
      <!-- <p>pink: payout multiplier {}, payout ammount if bet was 100$: {}$</p>
      <p>purple: payout multiplier {}, payout ammount if bet was 100$: {}$</p>
      <p>yellow: payout multiplier {}, payout ammount if bet was 100$: {}$</p>
      <p>cyan: payout multiplier {}, payout ammount if bet was 100$: {}$</p>
      <p>blue: payout multiplier {}, payout ammount if bet was 100$: {}$</p> -->
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
    box-shadow: 0 0 20px color.scale($yellow, $alpha: -50%);
    z-index: 0;

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
    z-index: 0;
    
    &::after {
      content: '';
      height: 100%;
      width: 100%;
      opacity: 0.05;
      background: url('/neon_animals.png');
      background-repeat: no-repeat;
      background-position: center;
      background-size: cover;
      filter: blur(4px);
      z-index: -1;

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

  .lane-cards {
    position: relative;
    background-color: color.scale($yellow, $alpha: -90%);
    padding: 16px 20px 42px;
    border: 1px solid color.scale($yellow, $alpha: -50%);
    box-shadow: 0 0 8px color.scale($yellow, $alpha: -70%);
    border-radius: 8px;
    width: 90%;
    margin: 50px auto 0;

    display: flex;
    justify-content: space-evenly;
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

  .color-odds-wrapper {
    background-color: #0000006b;
    border-radius: 0 0 8px 8px;
    width: 100%;
    position: absolute;
    bottom: 0;
    padding: 6px 0;
    
    display: flex;
    justify-content: space-evenly;
    align-content: baseline;
  }

  .color-odds {
    font-family: "Orbitron", "Space Mono", sans-serif;
    letter-spacing: 2px;
    padding: 0 4px;
  }

    // Some overwrite app.scss
  .odds-color-purple {
    color: $purple;
    text-shadow: 0 0 4px $purple;
    border-left: 2px double $purple;
    border-right: 2px double $purple;
  }
  
  .odds-color-pink {
    color: $pink;
    text-shadow: 0 0 4px $pink;
  }

  .odds-color-yellow {
    color: $yellow;
    text-shadow: 0 0 4px $yellow;
  }
  
  .odds-color-cyan {
    color: $cyan;
    text-shadow: 0 0 4px $cyan;
  }

  .odds-color-blue {
    color: $blue;
    text-shadow: 0 0 4px $blue;
  }
</style>