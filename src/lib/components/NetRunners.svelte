<script lang="ts">
  // Hooks
  import { createEventDispatcher } from 'svelte';

  // Transitions
  import { blur } from 'svelte/transition';

  // stores
  import { type Writable } from 'svelte/store';
  // import { socket } from '../socket';
  import { player1, player2, type Player } from '../stores/players';
  import { currentGameState } from '../stores/gameState';
  import { netRunnersgameState } from '../stores/netRunnersgameState';

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

  // TODO: singplayer first, then when game is done, add multi
  let gameMode: 'singleplayer' | 'multiplayer' = 'singleplayer';

  // Starts game
  function startGame(): void {
    resetGame();
    netRunnersgameState.set({...$netRunnersgameState,
      gameInProgress: true,
      menuVisible: false,
      colorSelectVisible: true
    })
    trackCards = drawLaneCards();
    odds = calculateBettingOdds();
    
    // TODO: Players choose which color to vote for.
  }

  // Ends game
  function endGame() {
    netRunnersgameState.set({...$netRunnersgameState, gameInProgress: false});
    // TODO:
  }

  // Resets game, restoring original deck.
  function resetGame(): void {
    fullDeck = [...purpleDeck, ...pinkDeck, ...yellowDeck, ...cyanDeck, ...blueDeck];
    trackCards = [];
    odds = {pink: 0, purple: 0, yellow: 0, cyan: 0, blue: 0};

    netRunnersgameState.update($netRunnersgameState => {
      $netRunnersgameState.p1.amountBet = 0;
      $netRunnersgameState.p2.amountBet = 0;
      $netRunnersgameState.p3.amountBet = 0;
      $netRunnersgameState.p4.amountBet = 0;
      $netRunnersgameState.p1.colorBet = '';
      $netRunnersgameState.p2.colorBet = '';
      $netRunnersgameState.p3.colorBet = '';
      $netRunnersgameState.p4.colorBet = '';

      return $netRunnersgameState;
    });
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

  // event: any bcuz event: customEvent makes normal <button> with on:click complain due to lacking event listeners.
  function selectColor(color: 'purple' | 'pink' | 'yellow' | 'cyan' | 'blue'): void {
    // TODO: determine if player is  1p or 2p in future if multiplayer.
    netRunnersgameState.update($netRunnersgameState => {
      $netRunnersgameState.p1.colorBet = color;
      return $netRunnersgameState;
    })
  }

  function selectBotColors(singleplayer = true): void {
    if (singleplayer) {
      const colors = ['purple', 'pink', 'yellow', 'cyan', 'blue'];
      netRunnersgameState.update($netRunnersgameState => {
        $netRunnersgameState.p2.colorBet = colors[Math.floor(Math.random() * 5)];
        $netRunnersgameState.p3.colorBet = colors[Math.floor(Math.random() * 5)];
        $netRunnersgameState.p4.colorBet = colors[Math.floor(Math.random() * 5)];

        return $netRunnersgameState;
      })
    }
  }

  function startRound(): void {
    selectBotColors();
    netRunnersgameState.set({...$netRunnersgameState, 
      colorSelectVisible: false,
      roundStarted: true,
      lanesVisible: true
    })
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

  function setSingleplayer(): void {
    netRunnersgameState.set({...$netRunnersgameState, singleplayer: true})
  }

  function setMultiplayer(): void {
    netRunnersgameState.set({...$netRunnersgameState, singleplayer: false})
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
        {#each Array(7) as _}
          <NetRunnersCard placeholder={true}/>
        {/each}
      {/each}
      <div class="color-odds-wrapper">
        <p class="color-odds odds-color-purple">purple: {odds.purple}%</p>
        <p class="color-odds odds-color-pink">pink:{odds.pink}%</p>
        <p class="color-odds odds-color-yellow">yellow:{odds.yellow}%</p>
        <p class="color-odds odds-color-cyan">cyan:{odds.cyan}%</p>
        <p class="color-odds odds-color-blue">blue:{odds.blue}%</p>
      </div>
    </div>

    <div class="game-area">
      <div class="menu" class:hide={!$netRunnersgameState.menuVisible}>
        <button class="menu-btn" on:click={setSingleplayer} class:btn-selected={$netRunnersgameState.singleplayer}>SINGLEPLAYER</button>
        <button class="menu-btn" on:click={setMultiplayer} class:btn-selected={!$netRunnersgameState.singleplayer}>MULTIPLAYER</button>
        <br>
        <br>
        <button class="menu-btn" on:click={startGame}>START</button>
      </div>

    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="color-select" class:hide={!$netRunnersgameState.colorSelectVisible}>
        <div class="color-select-grid">
          <div on:click={() => selectColor('purple')} class="grid-child">
            <NetRunnersCard bettingCard={true} backgroundRepeat={false} canHover={true} color="purple"/>
          </div>
          <div on:click={() => selectColor('pink')} class="grid-child">
            <NetRunnersCard bettingCard={true} backgroundRepeat={false} canHover={true} color="pink"/>
          </div>
          <div on:click={() => selectColor('yellow')} class="grid-child">
            <NetRunnersCard bettingCard={true} backgroundRepeat={false} canHover={true} color="yellow"/>
          </div>
          <div on:click={() => selectColor('cyan')} class="grid-child">
            <NetRunnersCard bettingCard={true} backgroundRepeat={false} canHover={true} color="cyan"/>
          </div>
          <div on:click={() => selectColor('blue')} class="grid-child">
            <NetRunnersCard bettingCard={true} backgroundRepeat={false} canHover={true} color="blue"/>
          </div>
        </div>

        <button on:click={startRound} class="confirm-btn">CONFIRM</button>
      </div>

      <div class="track" class:hide={!$netRunnersgameState.lanesVisible}>
        <div class="lane-{$netRunnersgameState.p1.colorBet}">
          <NetRunnersCard placeholder={Boolean(!$netRunnersgameState.p1.colorBet)}/>
        </div>

        <div class="lane-{$netRunnersgameState.p2.colorBet}">
          <NetRunnersCard placeholder={Boolean(!$netRunnersgameState.p2.colorBet)}/>
        </div>

        <div class="lane-{$netRunnersgameState.p3.colorBet}">
          <NetRunnersCard placeholder={Boolean(!$netRunnersgameState.p3.colorBet)}/>
        </div>

        <div class="lane-{$netRunnersgameState.p4.colorBet}">
          <NetRunnersCard placeholder={Boolean(!$netRunnersgameState.p4.colorBet)}/>
        </div>
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

  .lane-cards,
  .game-area {
    position: relative;
    background-color: color.scale($yellow, $alpha: -90%);
    border: 1px solid color.scale($yellow, $alpha: -50%);
    box-shadow: 0 0 8px color.scale($yellow, $alpha: -70%);
    border-radius: 8px;
    width: 100%;
  }
  
  .game-area {
    min-height: 70%;
  }
  
  .lane-cards {
    padding: 16px 20px 42px;
    margin: 50px auto 20px;
    
    display: flex;
    justify-content: space-evenly;
    
  }
  
  .track {
    padding: 4px;
    margin: 0 auto;
    border: 3px solid rebeccapurple;
    min-height: 70%;
    
    display: grid;
    grid-template-columns: repeat(1fr, 7);
    row-gap: 4px;
  }

  .menu {
    background-color: white;
    padding: 8px;
    border-radius: 8px;
    border: 2px double $yellow;
    background-color: $terminalBg;

    position: absolute;
    bottom: 50%;
    right: 50%;
    transform: translate(50%, 50%);
  }

  .color-select-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    justify-items: center;
    row-gap: 50px;
    margin-top: 100px;

    :nth-of-type(3).grid-child {
      grid-column: 1 / span 2;
    }
  }

  .lane-purple {
    background-color: color.scale($purple, $alpha: -75%);
  }

  .lane-pink {
    background-color: color.scale($pink, $alpha: -75%);
  }

  .lane-yellow {
    background-color: color.scale($yellow, $alpha: -75%);
  }

  .lane-cyan {
    background-color: color.scale($cyan, $alpha: -75%);
  }

  .lane-blue {
    background-color: color.scale($blue, $alpha: -75%);
  }

  .menu-btn,
  .confirm-btn {
    display: block;
    margin: 0 auto;
    padding: 6px;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-weight: bold;
    font-size: 1.25rem;
    border: 2px double $purple;
    border-radius: 2px;
    letter-spacing: 2px;
    background-color: #aaa
  }

  .confirm-btn {

  }

  .btn-selected {
    background-color: #444;
    color: $cyan;
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
    border-left: 2px double $pink;
    border-right: 2px double $pink;
  }

  .odds-color-yellow {
    color: $yellow;
    text-shadow: 0 0 4px $yellow;
    border-left: 2px double $yellow;
    border-right: 2px double $yellow;
  }
  
  .odds-color-cyan {
    color: $cyan;
    text-shadow: 0 0 4px $cyan;
    border-left: 2px double $cyan;
    border-right: 2px double $cyan;
  }

  .odds-color-blue {
    color: $blue;
    text-shadow: 0 0 4px $blue;
    border-left: 2px double $blue;
    border-right: 2px double $blue;
  }
</style>