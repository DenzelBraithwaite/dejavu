<script lang="ts">
  // Transitions
  import { blur, fly } from 'svelte/transition';

  // stores
  import { type Writable } from 'svelte/store';
  import { player1, player2, type Player } from '../stores/players';
  import { currentGameState } from '../stores/gameState';
  import { netRunnersGameState, type CardColor } from '../stores/netRunnersGameState';

  // Components
  import { NetRunnersCard, PlayerGamblingCard } from './';

  // Props
  export let location: Writable<string>;

  const player: Player = returnPlayer();

  function returnPlayer(): Player {
    return $currentGameState.playingAs === 'male' ? $player1 : $player2;
  }

  // Starts game
  function startGame(): void {
    resetGame();
    netRunnersGameState.update($netRunnersGameState => {
      $netRunnersGameState.gameInProgress = true;
      $netRunnersGameState.trackCards = drawLaneCards();
      $netRunnersGameState.odds = calculateBettingOdds();
      return $netRunnersGameState;
    });
    
    hideGameMenu();
    showColorSelectScreen();
    showColorOddsCards();
  }

  // Ends game
  function endGame() {
    netRunnersGameState.set({...$netRunnersGameState, gameInProgress: false});
    hideDrawBtn();
    // TODO:
  }

  // Resets game, restoring original deck.
  function resetGame(): void {
    netRunnersGameState.update($netRunnersGameState => {
      $netRunnersGameState.trackCards = [];
      $netRunnersGameState.cardsDrawn = [];
      $netRunnersGameState.odds = {pink: 0, purple: 0, yellow: 0, cyan: 0, blue: 0};
      [$netRunnersGameState.p1.amountBet, $netRunnersGameState.p1.points] = [0, 0];
      [$netRunnersGameState.p2.amountBet, $netRunnersGameState.p2.points] = [0, 0];
      [$netRunnersGameState.p3.amountBet, $netRunnersGameState.p3.points] = [0, 0];
      [$netRunnersGameState.p4.amountBet, $netRunnersGameState.p4.points] = [0, 0];
      $netRunnersGameState.p1.colorBet = '';
      $netRunnersGameState.p2.colorBet = '';
      $netRunnersGameState.p3.colorBet = '';
      $netRunnersGameState.p4.colorBet = '';
      $netRunnersGameState.gameInProgress = false;
      $netRunnersGameState.roundStarted = false;
      return $netRunnersGameState;
    });

    resetDeck();
    showGameMenu();
    hideGameControls();
    hideColorSelectScreen();
    hideLanes();
    hideDrawBtn();
  }

  // Draws initial 7 cards that will represent the track and betting odds
  function drawLaneCards(): CardColor[] {
    let cards: string[] = [];
    const fullDeckCopy = [...$netRunnersGameState.fullDeck];

    for(let i = 0; i < 7; i++) {
      const index = Math.floor(Math.random() * $netRunnersGameState.fullDeck.length);
      const card: string = fullDeckCopy.splice(index, 1)[0];
      netRunnersGameState.set({...$netRunnersGameState, fullDeck: [...fullDeckCopy]});

      cards = [...cards, card];
    }

    return cards;
  }

  // Shuffles lane cards so players can click a few times before starting.
  function shuffleLaneCards(): void{
    resetDeck();
    netRunnersGameState.set({...$netRunnersGameState, trackCards: drawLaneCards()});
  }

  // Calculate odds for each color based on removed track cards
  function calculateBettingOdds(): {pink: number, purple: number, yellow: number, cyan: number, blue: number,} {
    const numOfPinkCards = $netRunnersGameState.fullDeck.filter(c => c === 'pink').length;
    const numOfPurpleCards = $netRunnersGameState.fullDeck.filter(c => c === 'purple').length;
    const numOfYellowCards = $netRunnersGameState.fullDeck.filter(c => c === 'yellow').length;
    const numOfCyanCards = $netRunnersGameState.fullDeck.filter(c => c === 'cyan').length;
    const numOfBlueCards = $netRunnersGameState.fullDeck.filter(c => c === 'blue').length;
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
  function selectColor(color: CardColor): void {
    // TODO: determine if player is  1p or 2p in future if multiplayer.
    netRunnersGameState.update($netRunnersGameState => {
      $netRunnersGameState.p1.colorBet = color;
      return $netRunnersGameState;
    })
  }

  function selectBotColors(singleplayer = true): void {
    if (singleplayer) {
      const colors = ['purple', 'pink', 'yellow', 'cyan', 'blue'];
      netRunnersGameState.update($netRunnersGameState => {
        $netRunnersGameState.p2.colorBet = colors[Math.floor(Math.random() * 5)];
        $netRunnersGameState.p3.colorBet = colors[Math.floor(Math.random() * 5)];
        $netRunnersGameState.p4.colorBet = colors[Math.floor(Math.random() * 5)];

        return $netRunnersGameState;
      })
    }
  }

  function placeBet(): void {
    hideBettingScreen();
    startRound();
  }

  function startRound(): void {
    hideBettingScreen()
    hideColorSelectScreen();
    showGameControls();
    showDrawBtn();
    showLanes();
    showColorOddsCards();
    netRunnersGameState.set({...$netRunnersGameState, roundStarted: true});
  }
  
  // Flip/Draw a card
  function drawCard() {
    if ($netRunnersGameState.cardsDrawn.length === 19)  $netRunnersGameState.cardsDrawn.splice(0, 5);

    const fullDeckCopy = [...$netRunnersGameState.fullDeck];
    const index = Math.floor(Math.random() * $netRunnersGameState.fullDeck.length);
    const card: string = fullDeckCopy.splice(index, 1)[0];

    netRunnersGameState.update($netRunnersGameState => {
      $netRunnersGameState.fullDeck = [...fullDeckCopy];
      $netRunnersGameState.cardsDrawn = [...$netRunnersGameState.cardsDrawn, card]; // looks better this way
      AdvanceColor(card);

      return $netRunnersGameState
    });
    
    if (hasPlayerFinishedRace()) endGame();
  }
  
  // Moves any card if their color matches the flipped card's color.
  function AdvanceColor(card: CardColor): void {
    if ($netRunnersGameState.p1.colorBet === card) $netRunnersGameState.p1.points +=1;
    if ($netRunnersGameState.p2.colorBet === card) $netRunnersGameState.p2.points +=1;
    if ($netRunnersGameState.p3.colorBet === card) $netRunnersGameState.p3.points +=1;
    if ($netRunnersGameState.p4.colorBet === card) $netRunnersGameState.p4.points +=1;
  }

  // Checks each turn if someone has reached the end
  function hasPlayerFinishedRace(): boolean {
    const playerPoints = [$netRunnersGameState.p1.points, $netRunnersGameState.p2.points, $netRunnersGameState.p3.points, $netRunnersGameState.p4.points];
    return playerPoints.some(p => p === 7);
  }

  // Determines how much the player wins based on the odds of their winning bet.
  // 50% chance = 1/2 (keep denominator 2) 2x payout. 10% chance is 1/10 so 10x winnings.
  function calculateWinnings() {
  // TODO:
  }

  function setSingleplayer(): void {
    netRunnersGameState.set({...$netRunnersGameState, singleplayer: true})
  }

  function setMultiplayer(): void {
    netRunnersGameState.set({...$netRunnersGameState, singleplayer: false})
  }

  // Resets deck with all cards
  function resetDeck(): void {
    netRunnersGameState.set({...$netRunnersGameState, fullDeck: [...Array(15).fill('purple'), ...Array(15).fill('pink'), ...Array(15).fill('yellow'), ...Array(15).fill('cyan'), ...Array(15).fill('blue')]});
  }

  // Toggle Visibility
  function showGameMenu(): void {
    netRunnersGameState.set({...$netRunnersGameState, menuVisible: true});
  }

  function hideGameMenu(): void {
    netRunnersGameState.set({...$netRunnersGameState, menuVisible: false});
  }

  function showColorSelectScreen(): void {
    netRunnersGameState.set({...$netRunnersGameState, colorSelectVisible: true});
  }

  function hideColorSelectScreen(): void {
    netRunnersGameState.set({...$netRunnersGameState, colorSelectVisible: false});
    selectBotColors();
  }

  function showBettingScreen(): void {
    hideColorSelectScreen();
    hideColorOddsCards();
    netRunnersGameState.set({...$netRunnersGameState, betSelectVisible: true});
  }

  function hideBettingScreen(): void {
    netRunnersGameState.set({...$netRunnersGameState, betSelectVisible: false});
  }

  function showLanes(): void {
    netRunnersGameState.set({...$netRunnersGameState, lanesVisible: true});
  }

  function hideLanes(): void {
    netRunnersGameState.set({...$netRunnersGameState, lanesVisible: false});
  }

  function showColorOddsCards(): void {
    netRunnersGameState.set({...$netRunnersGameState, colorOddsCardsVisible: true});
  }

  function hideColorOddsCards(): void {
    netRunnersGameState.set({...$netRunnersGameState, colorOddsCardsVisible: false});
  }

  function showGameControls(): void {
    netRunnersGameState.set({...$netRunnersGameState, gameControlsVisible: true});
  }

  function hideGameControls(): void {
    netRunnersGameState.set({...$netRunnersGameState, gameControlsVisible: false});
  }
  
  function showDrawBtn(): void {
    netRunnersGameState.set({...$netRunnersGameState, drawBtnVisible: true});
  }

  function hideDrawBtn(): void {
    netRunnersGameState.set({...$netRunnersGameState, drawBtnVisible: false});
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
      {#if $netRunnersGameState.colorOddsCardsVisible}
        {#each $netRunnersGameState.trackCards as card}
          <NetRunnersCard largeVersion={true} color={card}/>
        {:else}
          {#each Array(7) as _}
            <NetRunnersCard placeholder={true}/>
          {/each}
        {/each}
      {:else if $netRunnersGameState.betSelectVisible}
        <PlayerGamblingCard player={$netRunnersGameState.p1}/>
        <PlayerGamblingCard player={$netRunnersGameState.p2}/>
        <PlayerGamblingCard player={$netRunnersGameState.p3}/>
        <PlayerGamblingCard player={$netRunnersGameState.p4}/>
      {/if}

      <div class="color-odds-wrapper">
        <p class="color-odds odds-color-purple">PC -{$netRunnersGameState.odds.purple}%</p>
        <p class="color-odds odds-color-pink">PM - {$netRunnersGameState.odds.pink}%</p>
        <p class="color-odds odds-color-yellow">YM - {$netRunnersGameState.odds.yellow}%</p>
        <p class="color-odds odds-color-cyan">CS - {$netRunnersGameState.odds.cyan}%</p>
        <p class="color-odds odds-color-blue">BE - {$netRunnersGameState.odds.blue}%</p>
      </div>
    </div>

    <div class="game-controls">
      <button on:click={resetGame} class="menu-btn" class:btn-disabled={!$netRunnersGameState.gameControlsVisible} disabled={!$netRunnersGameState.gameControlsVisible}>RESET</button>
      {#if $netRunnersGameState.roundStarted}
        <button on:click={drawCard} class="menu-btn" class:btn-disabled={!$netRunnersGameState.drawBtnVisible} disabled={!$netRunnersGameState.drawBtnVisible}>DRAW</button>
      {/if}

      {#if $netRunnersGameState.colorSelectVisible}
        <button on:click={showBettingScreen} class="confirm-btn" class:btn-disabled={!$netRunnersGameState.p1.colorBet} disabled={!$netRunnersGameState.p1.colorBet}>CONFIRM</button>
        <button on:click={shuffleLaneCards} class="menu-btn" class:btn-disabled={!$netRunnersGameState.colorSelectVisible} disabled={!$netRunnersGameState.colorSelectVisible}>SHUFFLE</button>
      {/if}

      {#if $netRunnersGameState.betSelectVisible}
        <button on:click={placeBet} class="confirm-btn" class:btn-disabled={$netRunnersGameState.p1.amountBet === 0} disabled={$netRunnersGameState.p1.amountBet === 0}>CONFIRM</button>
      {/if}
    </div>

    <div class="game-area">
      <div class="menu" class:hide={!$netRunnersGameState.menuVisible}>
        <button class="menu-btn" on:click={setSingleplayer} class:btn-selected={$netRunnersGameState.singleplayer}>SINGLEPLAYER</button>
        <button class="menu-btn" on:click={setMultiplayer} class:btn-selected={!$netRunnersGameState.singleplayer}>MULTIPLAYER</button>
        <button class="start-btn" on:click={startGame}>START</button>
      </div>

    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
     <!-- TODO: should i use {#if} for all these?TODO: instead of hide... -->
      <div class:hide={!$netRunnersGameState.colorSelectVisible}>
        <p class="game-message">SELECT A FACTION</p>
        <div class="color-select-grid">
          <div on:click={() => selectColor('purple')} class="card-description-wrapper card-description-wrapper__purple">
            <NetRunnersCard bettingCard={true} backgroundRepeat={false} canHover={true} color="purple"/>
            <div class="faction-description">
              <p class="faction-description__purple">Purple Cougars</p>
            </div>
          </div>
          <div on:click={() => selectColor('pink')} class="card-description-wrapper card-description-wrapper__pink">
            <NetRunnersCard bettingCard={true} backgroundRepeat={false} canHover={true} color="pink"/>
            <div class="faction-description">
              <p class="faction-description__pink">Pink Mice</p>
            </div>
          </div>
          <div on:click={() => selectColor('yellow')} class="card-description-wrapper card-description-wrapper__yellow">
            <NetRunnersCard bettingCard={true} backgroundRepeat={false} canHover={true} color="yellow"/>
            <div class="faction-description">
              <p class="faction-description__yellow">Yellow Monkeys</p>
            </div>
          </div>
          <div on:click={() => selectColor('cyan')} class="card-description-wrapper card-description-wrapper__cyan">
            <NetRunnersCard bettingCard={true} backgroundRepeat={false} canHover={true} color="cyan"/>
            <div class="faction-description">
              <p class="faction-description__cyan">Cyan Sharks</p>
            </div>
          </div>
          <div on:click={() => selectColor('blue')} class="card-description-wrapper card-description-wrapper__blue">
            <NetRunnersCard bettingCard={true} backgroundRepeat={false} canHover={true} color="blue"/>
            <div class="faction-description">
              <p class="faction-description__blue">Blue Eagles</p>
            </div>
          </div>
        </div>
      </div>

      <div class:hide={!$netRunnersGameState.betSelectVisible}>
        <p class="game-message">PLACE YOUR BET</p>
        <!-- TODO: -->
        <div class="bet-select-grid">
          <input on:input={() => netRunnersGameState.set({...$netRunnersGameState, p1: {name: 'CPU Bob', money: 0, amountBet: 1, colorBet: 'purple', points: 0}})} type="text">
        </div>
      </div>

      <div class="track" class:hide={!$netRunnersGameState.lanesVisible}>
        <div class="lane lane__{$netRunnersGameState.p1.colorBet} row-1 col-{$netRunnersGameState.p1.points + 1}">
          <div class="track-card">
            <div class="betting-chip betting-chip__{$netRunnersGameState.p1.colorBet}">
              <p>P1</p>
            </div>
            <NetRunnersCard color={$netRunnersGameState.p1.colorBet}/>
          </div>
        </div>

        <div class="lane lane__{$netRunnersGameState.p2.colorBet} row-2 col-{$netRunnersGameState.p2.points + 1}">
          <div class="track-card">
            <div class="betting-chip betting-chip__{$netRunnersGameState.p2.colorBet}">
              <p>P2</p>
            </div>
            <NetRunnersCard color={$netRunnersGameState.p2.colorBet}/>
          </div>
        </div>

        <div class="lane lane__{$netRunnersGameState.p3.colorBet} row-3 col-{$netRunnersGameState.p3.points + 1}">
          <div class="track-card">
            <div class="betting-chip betting-chip__{$netRunnersGameState.p3.colorBet}">
              <p>P3</p>
            </div>
            <NetRunnersCard color={$netRunnersGameState.p3.colorBet}/>
          </div>
        </div>

        <div class="lane lane__{$netRunnersGameState.p4.colorBet} row-4 col-{$netRunnersGameState.p4.points + 1}">
          <div class="track-card">
            <div class="betting-chip betting-chip__{$netRunnersGameState.p4.colorBet}">
              <p>P4</p>
            </div>
            <NetRunnersCard color={$netRunnersGameState.p4.colorBet}/>
          </div>
        </div>

        <div class="card-log row-5">
          {#each $netRunnersGameState.cardsDrawn as card}
            <span in:fly={{duration: 500, x: 50}} out:blur>
              <NetRunnersCard compactVersion={true} color={card}/>
            </span>
          {/each}
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
    height: 70%;
    overflow-y: scroll;

    &::-webkit-scrollbar {
      width: 0px;
      height: 0px;
    }
  }
  
  .lane-cards {
    padding: 16px 20px 42px;
    margin: 50px auto 12px;
    
    display: flex;
    justify-content: space-evenly;
    gap: 6px;
  }
  
  .track {
    height: 100%;
    position: relative;
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    row-gap: 4px;

    >div {
      position: relative;
      padding: 10px 8px;
    }
  }

  .track-card {
    position: relative;
    margin-left: auto;
    max-width: 75px;
    flex: 0 1 75px;
  }

  .game-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
    margin-bottom: 12px;
  }

  .menu {
    background-color: white;
    padding: 16px;
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
    grid-template-columns: repeat(2, 1fr);
    justify-items: center;
    row-gap: 50px;
    margin: 72px auto 0;
    width: 50%;

    :nth-of-type(3).card-description-wrapper {
      grid-column: 1 / span 2;
    }
  }

  .card-description-wrapper {
    background-color: #00000050;
    border-radius: 100px 10px 4px 100px;
    cursor: default;
    
    display: flex;
    align-items: center;
  }

  .card-description-wrapper__purple {
    border-bottom: 2px solid $purple;
  }

  .card-description-wrapper__pink {
    border-bottom: 2px solid $pink;
  }

  .card-description-wrapper__yellow {
    border-bottom: 2px solid $yellow;
  }

  .card-description-wrapper__cyan {
    border-bottom: 2px solid $cyan;
  }

  .card-description-wrapper__blue {
    border-bottom: 2px solid $blue;
  }
  
  .faction-description {
    text-align: center;
    padding-right: 2px;
    margin-left: 8px;
    margin-top: 4px;
  }

  .faction-description__purple {
    text-shadow: 0 0 0px #fff;
    color: $purple;
    font-weight: bold;
  }

  .faction-description__pink {
    text-shadow: 0 0 0px #fff;
    color: $pink;
    font-weight: bold;
  }

  .faction-description__yellow {
    text-shadow: 0 0 0px #fff;
    color: $yellow;
    font-weight: bold;
  }

  .faction-description__cyan {
    text-shadow: 0 0 0px #fff;
    color: $cyan;
    font-weight: bold;
  }

  .faction-description__blue {
    text-shadow: 0 0 0px #fff;
    color: $blue;
    font-weight: bold;
  }

  .lane {
    border-radius: 0 32px 32px 0;
  }

  .lane__purple {
    background-color: color.scale($purple, $alpha: -75%);
  }

  .lane__pink {
    background-color: color.scale($pink, $alpha: -75%);
  }

  .lane__yellow {
    background-color: color.scale($yellow, $alpha: -75%);
  }

  .lane__cyan {
    background-color: color.scale($cyan, $alpha: -75%);
  }

  .lane__blue {
    background-color: color.scale($blue, $alpha: -75%);
  }

  .card-log {
    background-color: #0000006c;
    min-height: 60px; // to avoid area growing when first card added
    grid-column: 1 / -1;

    display: flex;
    align-items: center;
    gap: 12px;

    span:last-child {
      scale: 1.1;
      box-shadow: 0 0 12px #fff;
      transform: translateY(-4px);
      border-radius: 8px 24px 4px 6px;
    }
  }

  .game-message {
    text-align: center;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-weight: bold;
    letter-spacing: 2px;
    font-size: 1.5rem;
    color: $yellow;
    border-left: 4px double $yellow;
    border-right: 4px double $yellow;
    padding: 0 8px;

    position: absolute;
    top: 16px;
    right: 50%;
    transform: translateX(50%);
  }

  .menu-btn,
  .confirm-btn,
  .start-btn {
    padding: 6px;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-weight: bold;
    font-size: 1.25rem;
    border: 2px double $purple;
    border-radius: 2px;
    letter-spacing: 2px;
    background-color: #aaa;

    &:hover {
      cursor: pointer;
      background-color: #222;
      color: $cyan;
    }
  }

  .start-btn {
    display: block;
    margin: 8px auto 0;
  }

  .btn-selected {
    background-color: #444;
    color: $cyan;
  }

  .btn-disabled,
  .btn-disabled:hover {
    cursor: default;
    background-color: #777;
    color: #444;
    border: none;
  }

  .betting-chip {
    background-color: #000000c3;
    font-size: 0.75rem;
    text-align: center;
    height: 24px;
    width: 24px;
    border-radius: 50%;
    z-index: 1;

    position: absolute;
    top: -8px;
    right: 50%;
    transform: translateX(50%);
    display: flex;
    justify-content: center;
    align-items: center;

    p {
      font-family: "Orbitron", "Space Mono", sans-serif;
    }
  }

  .betting-chip__purple {
    color: $purple;
    border: 2px double $purple;
  }

  .betting-chip__pink {
    color: $pink;
    border: 2px double $pink;
  }

  .betting-chip__yellow {
    color: $yellow;
    border: 2px double $yellow;
  }

  .betting-chip__cyan {
    color: $cyan;
    border: 2px double $cyan;
  }

  .betting-chip__blue {
    color: $blue;
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
    font-size: 0.9rem;
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

  // To move along the track
  .row-1 {
    grid-row: 1 / 2;
  }

  .row-2 {
    grid-row: 2 / 3;
  }

  .row-3 {
    grid-row: 3 / 4;
  }

  .row-4 {
    grid-row: 4 / 5;
  }

  .row-5 {
    grid-row: 5 / 6;
  }

  .col-1 {
    grid-column: 1 / 2;
  }

  .col-2 {
    grid-column: 1 / 3;
  }

  .col-3 {
    grid-column: 1 / 4;
  }

  .col-4 {
    grid-column: 1 / 5;
  }

  .col-5 {
    grid-column: 1 / 6;
  }

  .col-6 {
    grid-column: 1 / 7;
  }

  .col-7 {
    grid-column: 1 / 8;
  }

  .col-8 {
    grid-column: 1 / 9;
  }
</style>