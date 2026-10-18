<script lang="ts">
  import { onDestroy } from 'svelte';

  // Transitions
  import { blur, fly } from 'svelte/transition';

  // stores
  import { netRunnersGameState, type CardColor } from '../stores/netRunnersGameState';
  import { netRunnersServerState } from '../stores/netRunnersSession';
  import location from '../stores/location';
  import { sessionState } from '../stores/session';
  import { socket } from '../socket';

  // Components
  import { NetRunnersCard, PlayerGamblingCard } from './';

  const automaticDrawDelayMs = 2000;
  let automaticDrawTimer: number | undefined;
  let lastMultiplayerStatus = '';

  $: multiplayerPlayer = $sessionState.playerId && $netRunnersServerState
    ? $netRunnersServerState.players[$sessionState.playerId]
    : null;

  $: multiplayerRematchVote = $sessionState.playerId && $netRunnersServerState
    ? $netRunnersServerState.rematchVotes[$sessionState.playerId]
    : null;

  $: if (!$netRunnersGameState.singleplayer && $netRunnersServerState) {
    synchronizeMultiplayerState();
  }

  onDestroy(() => {
    stopAutomaticDraws();
  });

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
    stopAutomaticDraws();
    netRunnersGameState.update($netRunnersGameState => {
      $netRunnersGameState.gameInProgress = false;
      $netRunnersGameState.lastWinningColor = returnWinningColor();
      
      return $netRunnersGameState;
    });

    setLosers();
    hideDrawBtn();
    calculateWinnings($netRunnersGameState.p1, 'p1');
    calculateWinnings($netRunnersGameState.p2, 'p2');
    calculateWinnings($netRunnersGameState.p3, 'p3');
    calculateWinnings($netRunnersGameState.p4, 'p4');
  }

  // Resets game, restoring original deck.
  function resetGame(): void {
    stopAutomaticDraws();
    netRunnersGameState.update($netRunnersGameState => {
      $netRunnersGameState.trackCards = [];
      $netRunnersGameState.cardsDrawn = [];
      $netRunnersGameState.odds = {pink: 0, purple: 0, yellow: 0, cyan: 0, blue: 0};
      $netRunnersGameState.points = {pink: 0, purple: 0, yellow: 0, cyan: 0, blue: 0};
      $netRunnersGameState.gameInProgress = false;
      $netRunnersGameState.roundStarted = false;

      // p1
      [$netRunnersGameState.p1.amountBet, $netRunnersGameState.p1.points] = [0, 0];
      $netRunnersGameState.p1.colorBet = '';
      $netRunnersGameState.p1.hasLost = false;

      // p2
      [$netRunnersGameState.p2.amountBet, $netRunnersGameState.p2.points] = [0, 0];
      $netRunnersGameState.p2.colorBet = '';
      $netRunnersGameState.p2.hasLost = false;

      // p3
      [$netRunnersGameState.p3.amountBet, $netRunnersGameState.p3.points] = [0, 0];
      $netRunnersGameState.p3.colorBet = '';
      $netRunnersGameState.p3.hasLost = false;

      // p4
      [$netRunnersGameState.p4.amountBet, $netRunnersGameState.p4.points] = [0, 0];
      $netRunnersGameState.p4.colorBet = '';
      $netRunnersGameState.p4.hasLost = false;

      return $netRunnersGameState;
    });

    resetDeck();
    avoidBankruptcy();
    hideGamblingCards();
    showColorOddsCards();
    showGameMenu();
    hideGameControls();
    hideColorSelectScreen();
    hideLanes();
    hideDrawBtn();
    showColorOdds();
    hideAllColorsProgress();
    resetWinningColor();
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

  // I have them select a num between 5 and their total funds. Then, I ensure it's a multiple of 5, always ending in 0 or 5.
  function selectBotBets(singleplayer = true): void {
    netRunnersGameState.update($netRunnersGameState => {
      if (singleplayer) $netRunnersGameState.p2.amountBet = Math.floor(Math.random() * (($netRunnersGameState.p2.money - 5) / 5)) * 5 + 5;
      $netRunnersGameState.p3.amountBet = Math.floor(Math.random() * (($netRunnersGameState.p3.money - 5) / 5)) * 5 + 5;
      $netRunnersGameState.p4.amountBet = Math.floor(Math.random() * (($netRunnersGameState.p4.money - 5) / 5)) * 5 + 5;

      return $netRunnersGameState;
    })
  }

  function avoidBankruptcy(): void {
    if ($netRunnersGameState.p1.money <= 0) netRunnersGameState.update($netRunnersGameState => {
      $netRunnersGameState.p1.money = 5;
      return $netRunnersGameState;
    });

    if ($netRunnersGameState.p2.money <= 0) netRunnersGameState.update($netRunnersGameState => {
      $netRunnersGameState.p2.money = 5;
      return $netRunnersGameState;
    });

    if ($netRunnersGameState.p3.money <= 0) netRunnersGameState.update($netRunnersGameState => {
      $netRunnersGameState.p3.money = 5;
      return $netRunnersGameState;
    });

    if ($netRunnersGameState.p4.money <= 0) netRunnersGameState.update($netRunnersGameState => {
      $netRunnersGameState.p4.money = 5;
      return $netRunnersGameState;
    });
  }

  function placeBet(): void {
    if (!$netRunnersGameState.singleplayer) {
      submitMultiplayerBet();
      return;
    }

    hideBettingScreen();
    startRound();
  }

  function startRound(): void {
    hideBettingScreen()
    hideColorSelectScreen();
    showGameControls();
    showDrawBtn();
    showLanes();
    showAllColorsProgress();
    netRunnersGameState.set({...$netRunnersGameState, roundStarted: true});
    startAutomaticDraws();
  }
  
  // Flip/Draw a card
  function drawCard() {
    if (!$netRunnersGameState.gameInProgress) {
      return;
    }

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
    
    if (hasColorFinishedRace()) {
      endGame();
    }
  }
  
  // Moves any card if their color matches the flipped card's color.
  function AdvanceColor(card: CardColor): void {
    netRunnersGameState.update($netRunnersGameState => {
      $netRunnersGameState.points[card as 'purple' | 'pink' | 'yellow' | 'cyan' | 'blue'] += 1;
      if ($netRunnersGameState.p1.colorBet === card) $netRunnersGameState.p1.points +=1;
      if ($netRunnersGameState.p2.colorBet === card) $netRunnersGameState.p2.points +=1;
      if ($netRunnersGameState.p3.colorBet === card) $netRunnersGameState.p3.points +=1;
      if ($netRunnersGameState.p4.colorBet === card) $netRunnersGameState.p4.points +=1;

      return $netRunnersGameState;
    });
  }

  // Checks each turn if someone has reached the end
  function hasPlayerFinishedRace(): boolean {
    const playerPoints = [$netRunnersGameState.p1.points, $netRunnersGameState.p2.points, $netRunnersGameState.p3.points, $netRunnersGameState.p4.points];
    return playerPoints.some(p => p === 7);
  }

  // Checks each turn if any color (even if nobody bet on it) has reached the end
  function hasColorFinishedRace(): boolean {
    return Object.values($netRunnersGameState.points).some(points => points === 7);
  }

  function returnWinningColor(): CardColor {
    const winningColor = Object.entries($netRunnersGameState.points).find(([color, points]) => points === 7);

    return winningColor?.[0] ?? '';
  }

  // Determines how much the player wins based on the odds of their winning bet.
  // In all cases, for every time the color bet appears in the odds lane (reducing odds of winning) gain 25%. e.g. 2/7 odds cards are pink, pink gets + 50% on win.
  function calculateWinnings(player: {name: string; money: number; amountBet: number; colorBet: string; points: number}, playerNum: 'p1' | 'p2' | 'p3' | 'p4') {
    if (player.colorBet === $netRunnersGameState.lastWinningColor) {
      netRunnersGameState.update($netRunnersGameState => {
        if (didAllPlayersPickSameColor()) {
          // Bonus 200% from 3x to 5x if all players won with same color.
          $netRunnersGameState[playerNum].money += Math.round(($netRunnersGameState[playerNum].amountBet * (5 + (calculateBonusBasedOnTrackCardOdds(player.colorBet) * 0.25))));
          
        } else if (didOnlyOnePlayerPickThisColor(player.colorBet)) {
          // Bonus 100% from 3x to 4x if player was the only to pick this color.
          $netRunnersGameState[playerNum].money += Math.round(($netRunnersGameState[playerNum].amountBet * (4 + (calculateBonusBasedOnTrackCardOdds(player.colorBet) * 0.25))));

        } else if (calculateHowManyPlayersPickedThisColor(player.colorBet) > 1) {          
          // For every person who also picked that color, reduce reward by 50%
          $netRunnersGameState[playerNum].money += Math.round(($netRunnersGameState[playerNum].amountBet * (3 + (calculateBonusBasedOnTrackCardOdds(player.colorBet) * 0.25) - (calculateHowManyPlayersPickedThisColor(player.colorBet) * 0.5))));
        } else {
          // If no special win conditions, return a simple 3x bet
          $netRunnersGameState[playerNum].money += Math.round(($netRunnersGameState[playerNum].amountBet * (3 + (calculateBonusBasedOnTrackCardOdds(player.colorBet) * 0.25))));
        }
  
        return $netRunnersGameState;
      });
    } else {
      netRunnersGameState.update($netRunnersGameState => {
        $netRunnersGameState[playerNum].money -= $netRunnersGameState[playerNum].amountBet;
        return $netRunnersGameState;
      });
    }
  }

  function didAllPlayersPickSameColor(): boolean {
    const allColorBets = [$netRunnersGameState.p1.colorBet, $netRunnersGameState.p2.colorBet, $netRunnersGameState.p3.colorBet, $netRunnersGameState.p4.colorBet];
    return allColorBets.every(c => c === allColorBets[0]);
  }

  function didOnlyOnePlayerPickThisColor(color: CardColor): boolean {
    const allColorBets = [$netRunnersGameState.p1.colorBet, $netRunnersGameState.p2.colorBet, $netRunnersGameState.p3.colorBet, $netRunnersGameState.p4.colorBet];
    return allColorBets.filter(c => c === color).length === 1;
  }

  function calculateHowManyPlayersPickedThisColor(color: CardColor): number {
    const allColorBets = [$netRunnersGameState.p1.colorBet, $netRunnersGameState.p2.colorBet, $netRunnersGameState.p3.colorBet, $netRunnersGameState.p4.colorBet];
    return allColorBets.filter(c => c === color).length - 1; // don't count self
  }

  // Calculates every time the color bet appears in the odds lane (reducing odds of winning) gain 25%. e.g. 2/7 odds cards are pink, pink gets + 50% on win.
  function calculateBonusBasedOnTrackCardOdds(color: CardColor): number {
    return $netRunnersGameState.trackCards.filter(c => c === color).length;
  }
  

  function setSingleplayer(): void {
    socket.emit('netrunners:leave');
    netRunnersGameState.set({...$netRunnersGameState, singleplayer: true})
  }

  function setMultiplayer(): void {
    netRunnersGameState.set({...$netRunnersGameState, singleplayer: false})
    socket.emit('netrunners:join');
  }

  function startAutomaticDraws(): void {
    stopAutomaticDraws();

    automaticDrawTimer = window.setTimeout(() => {
      drawCard();

      if ($netRunnersGameState.gameInProgress) {
        startAutomaticDraws();
      }
    }, automaticDrawDelayMs);
  }

  function stopAutomaticDraws(): void {
    if (automaticDrawTimer !== undefined) {
      window.clearTimeout(automaticDrawTimer);
      automaticDrawTimer = undefined;
    }
  }

  function submitMultiplayerBet(): void {
    const bet = {
      color: $netRunnersGameState.p1.colorBet,
      amount: $netRunnersGameState.p1.amountBet
    };

    socket.emit('netrunners:bet', bet, (result: {ok: boolean; error?: string}) => {
      if (!result.ok) {
        console.error(result.error);
      }
    });
  }

  function synchronizeMultiplayerState(): void {
    const serverState = $netRunnersServerState;
    const playerId = $sessionState.playerId;

    if (!serverState || !playerId) {
      return;
    }

    const localServerPlayer = serverState.players[playerId];
    const statusChanged = serverState.status !== lastMultiplayerStatus;
    lastMultiplayerStatus = serverState.status;

    if (serverState.status === 'menu' && statusChanged) {
      resetGame();
      netRunnersGameState.update((state) => ({
        ...state,
        singleplayer: true,
        menuVisible: true
      }));
      return;
    }

    if (serverState.status === 'waiting') {
      hideGameMenu();
      hideColorSelectScreen();
      hideBettingScreen();
      return;
    }

    if (serverState.status === 'betting' && statusChanged) {
      resetGame();
      setMultiplayer();
      hideGameMenu();
      showColorSelectScreen();
      showColorOddsCards();

      netRunnersGameState.update((state) => ({
        ...state,
        singleplayer: false,
        gameInProgress: true,
        trackCards: [...serverState.trackCards],
        odds: {
          ...serverState.odds
        },
        p1: {
          ...state.p1,
          name: localServerPlayer.name,
          money: localServerPlayer.money,
          amountBet: 0,
          colorBet: ''
        }
      }));
      return;
    }

    if (serverState.status === 'racing' || serverState.status === 'finished') {
      const isFinished = serverState.status === 'finished';

      netRunnersGameState.update((state) => ({
        ...state,
        singleplayer: false,
        gameInProgress: !isFinished,
        menuVisible: false,
        colorSelectVisible: false,
        betSelectVisible: false,
        lanesVisible: true,
        colorOddsVisible: false,
        colorOddsCardsVisible: false,
        colorsProgressVisible: true,
        gameControlsVisible: false,
        drawBtnVisible: false,
        gamblingCardsVisible: true,
        lastWinningColor: serverState.winner,
        trackCards: [...serverState.trackCards],
        cardsDrawn: [...serverState.cardsDrawn],
        odds: {
          ...serverState.odds
        },
        points: {
          ...serverState.points
        },
        roundStarted: true,
        p1: {
          ...state.p1,
          ...serverState.players.p1
        },
        p2: {
          ...state.p2,
          ...serverState.players.p2
        },
        p3: {
          ...state.p3,
          ...serverState.players.p3
        },
        p4: {
          ...state.p4,
          ...serverState.players.p4
        }
      }));
    }
  }

  function voteForRematch(wantsRematch: boolean): void {
    socket.emit('netrunners:rematch', wantsRematch);
  }

  // Resets deck with all cards
  function resetDeck(): void {
    netRunnersGameState.set({...$netRunnersGameState, fullDeck: [...Array(15).fill('purple'), ...Array(15).fill('pink'), ...Array(15).fill('yellow'), ...Array(15).fill('cyan'), ...Array(15).fill('blue')]});
  }

  // Removes the last winning color so the box-shadow in game area can reset
  function resetWinningColor(): void {
    netRunnersGameState.set({...$netRunnersGameState, lastWinningColor: ''});
  }

  // Handles user setting their bet amount, +/- amount.
  function updateBetAmount(amount: 1 | 10 | 100 | 1000 | -1 | -10 | -100 | -1000): void {
    netRunnersGameState.update($netRunnersGameState => {
      $netRunnersGameState.p1.amountBet += amount;
      if ($netRunnersGameState.p1.amountBet <= 0) $netRunnersGameState.p1.amountBet = 0;
      if ($netRunnersGameState.p1.amountBet > $netRunnersGameState.p1.money) $netRunnersGameState.p1.amountBet = $netRunnersGameState.p1.money;
      return $netRunnersGameState
    });
  }

  // Determines who has lost and won, this greys out the losing bets.
  function setLosers(): void {
    netRunnersGameState.update($netRunnersGameState => {
      if ($netRunnersGameState.p1.points < 7) $netRunnersGameState.p1.hasLost = true;
      if ($netRunnersGameState.p2.points < 7) $netRunnersGameState.p2.hasLost = true;
      if ($netRunnersGameState.p3.points < 7) $netRunnersGameState.p3.hasLost = true;
      if ($netRunnersGameState.p4.points < 7) $netRunnersGameState.p4.hasLost = true;

      return $netRunnersGameState;
    });
  }

  // Toggle Visibility
  function toggleInfo(): void {
    netRunnersGameState.set({...$netRunnersGameState, infoVisible: !$netRunnersGameState.infoVisible});
  }

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
  }

  function showBettingScreen(): void {
    hideColorSelectScreen();
    hideColorOddsCards();

    if ($netRunnersGameState.singleplayer) {
      selectBotColors();
      selectBotBets();
    }

    showGamblingCards();
    netRunnersGameState.set({...$netRunnersGameState, betSelectVisible: true});
  }

  function hideBettingScreen(): void {
    netRunnersGameState.set({...$netRunnersGameState, betSelectVisible: false});
  }

  function showGamblingCards(): void {
    netRunnersGameState.set({...$netRunnersGameState, gamblingCardsVisible: true});
  }

  function hideGamblingCards(): void {
    netRunnersGameState.set({...$netRunnersGameState, gamblingCardsVisible: false});
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

  function showColorOdds(): void {
    netRunnersGameState.set({...$netRunnersGameState, colorOddsVisible: true});
  }
  
  function hideColorOdds(): void {
    netRunnersGameState.set({...$netRunnersGameState, colorOddsVisible: false});
  }
  
  function showAllColorsProgress(): void {
    netRunnersGameState.set({...$netRunnersGameState, colorsProgressVisible: true});
  }

  function hideAllColorsProgress(): void {
    netRunnersGameState.set({...$netRunnersGameState, colorsProgressVisible: false});
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
    {#if $netRunnersGameState.infoVisible}
      <div class="info-screen">
        <h2><strong>INSTRUCTIONS:</strong></h2>
        <p>The object of the game is to bet on the fastest hacker. Seven cards will be drawn randomly from the deck, these cards represent the lane cards. Lane cards can be <span class="color-purple">purple</span>, <span class="color-pink">pink</span>, <span class="color-yellow">yellow</span>, <span class="color-cyan">cyan</span> or <span class="color-blue">blue</span>. This represents what cards have been removed from the deck, which determines the odds for that card to be drawn during the game.</p>
        <br>
        <p>The more times a card appears above as a lane card, the less likely that color is to win. The higher the risk, the better the reward, but it's not that simple. Each round you'll select how much <span class="color-green">₭rypto</span> you want to bet, below is how winning and losing affects your <span class="color-green">₭rypto</span> balance.</p>
        <br>
        <br>
        <h2><strong>WINNING/LOSING</strong></h2>
        <p>&bull; A standard win grants you 300% (3x) your bet.</p>
        <p>&bull; Winning while betting on a color that appeared in the lane section will reward you 25% (0.25) extra per matching card in the lane section.</p>
        <p>&bull; Winning while nobody else bet on the same color rewards you with an extra 100% (4x total) <span class="color-green">₭rypto</span>.</p>
        <p>&bull; Winning while other players bet on the same color will reduce your winnings by 50% (0.5x) per person who bet on the same color.</p>
        <p>&bull; Winning while all others bet on the same color will reward all players with 500% (5x) their bet.</p>
        <br>
        <p>&bull; <span class="color-red">LOSING</span> simply removes your amount bet from your <span class="color-green">₭rypto</span> balance. A minimum of 5 <span class="color-green">₭rypto</span> will always be retained for each player.</p>
        <br>
        <br>
        <br>
        <p><strong>Alright Flop, get back to breaching that network!</strong></p>
        <br>
        <button on:click={toggleInfo} class="menu-btn">BACK TO GAME</button>
      </div>
    {:else}
      {#if $netRunnersGameState.lastWinningColor}
        <p class="winning-message winning-message__{$netRunnersGameState.lastWinningColor}">
          {$netRunnersGameState.lastWinningColor} WINS
        </p>
      {/if}

      <div class="lane-cards">
        {#if $netRunnersGameState.colorOddsCardsVisible}
          {#each $netRunnersGameState.trackCards as card}
            <NetRunnersCard largeVersion={true} color={card}/>
          {:else}
            {#each Array(7) as _}
              <NetRunnersCard placeholder={true}/>
            {/each}
          {/each}
        {:else if $netRunnersGameState.gamblingCardsVisible}
          <PlayerGamblingCard player={$netRunnersGameState.p1}/>
          <PlayerGamblingCard player={$netRunnersGameState.p2}/>
          <PlayerGamblingCard player={$netRunnersGameState.p3}/>
          <PlayerGamblingCard player={$netRunnersGameState.p4}/>
        {/if}

        {#if $netRunnersGameState.colorOddsVisible}
          <div class="color-odds-wrapper">
            <p class="color-odds odds-color-purple">PC -{$netRunnersGameState.odds.purple}%</p>
            <p class="color-odds odds-color-pink">PM - {$netRunnersGameState.odds.pink}%</p>
            <p class="color-odds odds-color-yellow">YM - {$netRunnersGameState.odds.yellow}%</p>
            <p class="color-odds odds-color-cyan">CS - {$netRunnersGameState.odds.cyan}%</p>
            <p class="color-odds odds-color-blue">BE - {$netRunnersGameState.odds.blue}%</p>
          </div>
        {/if}
      </div>

      <div class="game-controls">
        <button on:click={toggleInfo} class="menu-btn">INFO</button>
        <button on:click={resetGame} class="menu-btn" class:btn-disabled={!$netRunnersGameState.gameControlsVisible || !$netRunnersGameState.singleplayer} disabled={!$netRunnersGameState.gameControlsVisible || !$netRunnersGameState.singleplayer}>RESET</button>
        {#if $netRunnersGameState.roundStarted}
          <p class="auto-draw-status">AUTO DRAW · 2 SECONDS</p>
        {/if}

        {#if $netRunnersGameState.colorSelectVisible}
          <button on:click={showBettingScreen} class="confirm-btn" class:btn-disabled={!$netRunnersGameState.p1.colorBet} disabled={!$netRunnersGameState.p1.colorBet}>CONFIRM</button>
          <button on:click={shuffleLaneCards} class="menu-btn" class:btn-disabled={!$netRunnersGameState.colorSelectVisible} disabled={!$netRunnersGameState.colorSelectVisible}>SHUFFLE</button>
        {/if}

      </div>

      <div class="game-area game-area__{$netRunnersGameState.lastWinningColor}">
        <div class="menu" class:hide={!$netRunnersGameState.menuVisible}>
          <div class="mode-heading">
            <span>SELECT CONNECTION</span>
            <strong>Choose a race protocol</strong>
          </div>
          <div class="mode-options">
            <button class="mode-option" on:click={setSingleplayer} class:mode-option--selected={$netRunnersGameState.singleplayer}>
              <span class="mode-option__icon">01</span>
              <strong>SOLO RUN</strong>
              <small>Race against three autonomous runners.</small>
              <i>{$netRunnersGameState.singleplayer ? 'SELECTED' : 'LOCAL'}</i>
            </button>
            <button class="mode-option mode-option--multiplayer" on:click={setMultiplayer} class:mode-option--selected={!$netRunnersGameState.singleplayer}>
              <span class="mode-option__icon">02</span>
              <strong>LINKED RUN</strong>
              <small>Bet alongside the other connected player.</small>
              <i>{$sessionState.bothPlayersConnected ? '2 PLAYERS ONLINE' : 'WAITING FOR SIGNAL'}</i>
            </button>
          </div>
          {#if $netRunnersGameState.singleplayer}
            <button class="start-btn mode-launch" on:click={startGame}>INITIALIZE SOLO RACE</button>
          {/if}
        </div>

        {#if !$netRunnersGameState.singleplayer && $netRunnersServerState?.status === 'waiting'}
          <div class="multiplayer-message" role="status">
            <p class="game-message">WAITING FOR PLAYER</p>
            <p>{$netRunnersServerState.participantCount}/2 PLAYERS</p>
            <button class="menu-btn" on:click={() => socket.emit('netrunners:leave')}>CANCEL</button>
          </div>
        {/if}

        {#if !$netRunnersGameState.singleplayer && $netRunnersServerState?.status === 'betting' && multiplayerPlayer?.ready}
          <div class="multiplayer-message" role="status">
            <p class="game-message">BET LOCKED</p>
            <p>Waiting for the other player to place their bet.</p>
          </div>
        {/if}

        {#if !$netRunnersGameState.singleplayer && $netRunnersServerState?.status === 'finished'}
          <div class="multiplayer-message rematch-message" role="status">
            <p class="game-message">PLAY ANOTHER ROUND?</p>
            {#if multiplayerRematchVote === true}
              <p>1/2 confirmation received. Waiting for your opponent.</p>
            {:else}
              <div class="rematch-controls">
                <button class="confirm-btn" on:click={() => voteForRematch(true)}>PLAY AGAIN</button>
                <button class="menu-btn" on:click={() => voteForRematch(false)}>MAIN MENU</button>
              </div>
            {/if}
          </div>
        {/if}

      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
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

        <div class="netrunner-bet-screen" class:hide={!$netRunnersGameState.betSelectVisible}>
          <div class="netrunner-bet-panel">
            <p class="netrunner-bet-label">NETRUNNER EXCHANGE&gt; PLACE YOUR BET</p>
            <p class="netrunner-bet-context">
              Wagering on <strong class="color-{$netRunnersGameState.p1.colorBet}">{$netRunnersGameState.p1.colorBet}</strong> faction.
            </p>

            <div class="netrunner-bet-display" aria-live="polite">
              <span>WAGER</span>
              <strong>{$netRunnersGameState.p1.amountBet}₭</strong>
              <small>AVAILABLE {$netRunnersGameState.p1.money}₭</small>
            </div>

            <div class="netrunner-bet-controls" aria-label="Adjust wager">
              <button type="button" on:click={() => updateBetAmount(-1000)}>-1000</button>
              <button type="button" on:click={() => updateBetAmount(-100)}>-100</button>
              <button type="button" on:click={() => updateBetAmount(-10)}>-10</button>
              <button type="button" on:click={() => updateBetAmount(-1)}>-1</button>
              <button type="button" on:click={() => updateBetAmount(1)}>+1</button>
              <button type="button" on:click={() => updateBetAmount(10)}>+10</button>
              <button type="button" on:click={() => updateBetAmount(100)}>+100</button>
              <button type="button" on:click={() => updateBetAmount(1000)}>+1000</button>
            </div>

            <button
              type="button"
              class="netrunner-lock-bet"
              disabled={$netRunnersGameState.p1.amountBet === 0}
              on:click={placeBet}
            >
              LOCK BET
            </button>
          </div>
        </div>

        <div class="track" class:hide={!$netRunnersGameState.lanesVisible}>
          <div class="card-log row-1">
            {#each $netRunnersGameState.cardsDrawn as card}
              <span in:fly={{duration: 500, x: 50}} out:blur>
                <NetRunnersCard compactVersion={true} color={card}/>
              </span>
            {/each}
            
            <div class="color-progress-wrapper">
              <div class="progress-circle-group progress-circle-group__purple">
                <div class="progress-circle" class:progress-circle__purple={$netRunnersGameState.points.purple >= 1}></div>
                <div class="progress-circle" class:progress-circle__purple={$netRunnersGameState.points.purple >= 2}></div>
                <div class="progress-circle" class:progress-circle__purple={$netRunnersGameState.points.purple >= 3}></div>
                <div class="progress-circle" class:progress-circle__purple={$netRunnersGameState.points.purple >= 4}></div>
                <div class="progress-circle" class:progress-circle__purple={$netRunnersGameState.points.purple >= 5}></div>
                <div class="progress-circle" class:progress-circle__purple={$netRunnersGameState.points.purple >= 6}></div>
                <div class="progress-circle" class:progress-circle__purple={$netRunnersGameState.points.purple >= 7}></div>
              </div>

              <div class="progress-circle-group progress-circle-group__pink">
                <div class="progress-circle" class:progress-circle__pink={$netRunnersGameState.points.pink >= 1}></div>
                <div class="progress-circle" class:progress-circle__pink={$netRunnersGameState.points.pink >= 2}></div>
                <div class="progress-circle" class:progress-circle__pink={$netRunnersGameState.points.pink >= 3}></div>
                <div class="progress-circle" class:progress-circle__pink={$netRunnersGameState.points.pink >= 4}></div>
                <div class="progress-circle" class:progress-circle__pink={$netRunnersGameState.points.pink >= 5}></div>
                <div class="progress-circle" class:progress-circle__pink={$netRunnersGameState.points.pink >= 6}></div>
                <div class="progress-circle" class:progress-circle__pink={$netRunnersGameState.points.pink >= 7}></div>
              </div>

              <div class="progress-circle-group progress-circle-group__yellow">
                <div class="progress-circle" class:progress-circle__yellow={$netRunnersGameState.points.yellow >= 1}></div>
                <div class="progress-circle" class:progress-circle__yellow={$netRunnersGameState.points.yellow >= 2}></div>
                <div class="progress-circle" class:progress-circle__yellow={$netRunnersGameState.points.yellow >= 3}></div>
                <div class="progress-circle" class:progress-circle__yellow={$netRunnersGameState.points.yellow >= 4}></div>
                <div class="progress-circle" class:progress-circle__yellow={$netRunnersGameState.points.yellow >= 5}></div>
                <div class="progress-circle" class:progress-circle__yellow={$netRunnersGameState.points.yellow >= 6}></div>
                <div class="progress-circle" class:progress-circle__yellow={$netRunnersGameState.points.yellow >= 7}></div>
              </div>

              <div class="progress-circle-group progress-circle-group__cyan">
                <div class="progress-circle" class:progress-circle__cyan={$netRunnersGameState.points.cyan >= 1}></div>
                <div class="progress-circle" class:progress-circle__cyan={$netRunnersGameState.points.cyan >= 2}></div>
                <div class="progress-circle" class:progress-circle__cyan={$netRunnersGameState.points.cyan >= 3}></div>
                <div class="progress-circle" class:progress-circle__cyan={$netRunnersGameState.points.cyan >= 4}></div>
                <div class="progress-circle" class:progress-circle__cyan={$netRunnersGameState.points.cyan >= 5}></div>
                <div class="progress-circle" class:progress-circle__cyan={$netRunnersGameState.points.cyan >= 6}></div>
                <div class="progress-circle" class:progress-circle__cyan={$netRunnersGameState.points.cyan >= 7}></div>
              </div>

              <div class="progress-circle-group progress-circle-group__blue">
                <div class="progress-circle" class:progress-circle__blue={$netRunnersGameState.points.blue >= 1}></div>
                <div class="progress-circle" class:progress-circle__blue={$netRunnersGameState.points.blue >= 2}></div>
                <div class="progress-circle" class:progress-circle__blue={$netRunnersGameState.points.blue >= 3}></div>
                <div class="progress-circle" class:progress-circle__blue={$netRunnersGameState.points.blue >= 4}></div>
                <div class="progress-circle" class:progress-circle__blue={$netRunnersGameState.points.blue >= 5}></div>
                <div class="progress-circle" class:progress-circle__blue={$netRunnersGameState.points.blue >= 6}></div>
                <div class="progress-circle" class:progress-circle__blue={$netRunnersGameState.points.blue >= 7}></div>
              </div>
            </div>
          </div>

          <div class="lane lane__{$netRunnersGameState.p1.colorBet} row-2 col-{$netRunnersGameState.p1.points + 1}" class:lane__grey={$netRunnersGameState.p1.hasLost}>
            <div class="track-card">
              <div class="betting-chip betting-chip__{$netRunnersGameState.p1.colorBet}">
                <p>P1</p>
              </div>
              <NetRunnersCard color={$netRunnersGameState.p1.colorBet}/>
            </div>
          </div>

          <div class="lane lane__{$netRunnersGameState.p2.colorBet} row-3 col-{$netRunnersGameState.p2.points + 1}" class:lane__grey={$netRunnersGameState.p2.hasLost}>
            <div class="track-card">
              <div class="betting-chip betting-chip__{$netRunnersGameState.p2.colorBet}">
                <p>P2</p>
              </div>
              <NetRunnersCard color={$netRunnersGameState.p2.colorBet}/>
            </div>
          </div>

          <div class="lane lane__{$netRunnersGameState.p3.colorBet} row-4 col-{$netRunnersGameState.p3.points + 1}" class:lane__grey={$netRunnersGameState.p3.hasLost}>
            <div class="track-card">
              <div class="betting-chip betting-chip__{$netRunnersGameState.p3.colorBet}">
                <p>P3</p>
              </div>
              <NetRunnersCard color={$netRunnersGameState.p3.colorBet}/>
            </div>
          </div>

          <div class="lane lane__{$netRunnersGameState.p4.colorBet} row-5 col-{$netRunnersGameState.p4.points + 1}" class:lane__grey={$netRunnersGameState.p4.hasLost}>
            <div class="track-card">
              <div class="betting-chip betting-chip__{$netRunnersGameState.p4.colorBet}">
                <p>P4</p>
              </div>
              <NetRunnersCard color={$netRunnersGameState.p4.colorBet}/>
            </div>
          </div>
        </div>
      </div>
    {/if}
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

  // These colors overwrite app.scss
  .color-purple {
    color: $purple;
  }

  .color-pink {
    color: $pink;
  }

  .color-yellow {
    color: $yellow;
  }

  .color-cyan {
    color: $cyan;
  }

  .color-blue {
    color: $blue;
  }

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

  .info-screen {
    padding: 12px;
    margin-top: 100px;
    font-size: 1.25rem;
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

  .game-area__purple {
    box-shadow: inset 0 0 250px color.scale($purple, $alpha: -50%);
  }

  .game-area__pink {
    box-shadow: inset 0 0 250px color.scale($pink, $alpha: -50%);
  }

  .game-area__yellow {
    box-shadow: inset 0 0 250px color.scale($yellow, $alpha: -50%);
  }

  .game-area__cyan {
    box-shadow: inset 0 0 250px color.scale($cyan, $alpha: -50%);
  }

  .game-area__blue {
    box-shadow: inset 0 0 250px color.scale($blue, $alpha: -50%);
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
    width: min(680px, calc(100% - 32px));
    padding: 24px;
    background:
      linear-gradient(135deg, color.scale($purple, $alpha: -88%), transparent 55%),
      #17113d;
    border: 1px solid $purple;
    border-radius: 8px 28px;
    box-shadow: 0 0 32px color.scale($purple, $alpha: -55%);

    position: absolute;
    bottom: 50%;
    right: 50%;
    transform: translate(50%, 50%);
  }

  .mode-heading {
    margin-bottom: 18px;

    display: grid;
    gap: 5px;

    span {
      color: $cyan;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.65rem;
      letter-spacing: 2px;
    }

    strong {
      color: #ffffff;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 1.2rem;
    }
  }

  .mode-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .mode-option {
    position: relative;
    min-height: 155px;
    padding: 18px;
    color: #cbd5e1;
    background: #0d0a25;
    border: 1px solid #53439b;
    border-radius: 4px 18px;
    cursor: pointer;
    text-align: left;

    display: grid;
    align-content: center;
    gap: 8px;

    &:hover,
    &:focus-visible {
      border-color: $cyan;
      box-shadow: 0 0 20px color.scale($cyan, $alpha: -68%);
      outline: 2px solid #ffffff;
      outline-offset: 2px;
    }

    strong {
      color: $cyan;
      font-family: "Orbitron", "Space Mono", sans-serif;
      letter-spacing: 1.5px;
    }

    small {
      color: #9ca3bd;
      line-height: 1.4;
    }

    i {
      color: $yellow;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.58rem;
      font-style: normal;
      letter-spacing: 1px;
    }
  }

  .mode-option__icon {
    position: absolute;
    top: 12px;
    right: 14px;
    color: #7164ad;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: 1.5rem;
  }

  .mode-option--multiplayer strong {
    color: $pink;
  }

  .mode-option--selected {
    border-color: $yellow;
    box-shadow: inset 0 0 28px color.scale($yellow, $alpha: -90%);
  }

  .mode-launch {
    width: 100%;
    min-height: 44px;
    margin-top: 14px !important;
    color: #080612;
    background: $yellow;
    border-color: #fff2a1;
    box-shadow: 0 0 16px color.scale($yellow, $alpha: -55%);
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
    transition: all 0.2s ease-in-out;
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
  
  .lane__grey {
    opacity: 0.5;
    background-color: #000;
    filter: blur(1px);
  }

  .card-log {
    background-color: #0000006c;
    min-height: 70px; // to avoid area growing when first card added
    grid-column: 1 / -1;

    display: flex;
    align-items: flex-start;
    gap: 12px;

    span:last-of-type {
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
    padding: 6px 8px;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-weight: bold;
    font-size: 1rem;
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

  .selected-btn {
    background-color: #444;
    color: $cyan;
  }

  .btn-disabled,
  .btn-disabled:hover {
    cursor: default;
    background-color: #777;
    color: #444;
    border: 2px solid transparent;
  }

  .netrunner-bet-screen {
    position: absolute;
    z-index: 4;
    inset: 0;
    padding: 12px;
    background: radial-gradient(circle at 50% 40%, #28194be8, #080610f5 70%);

    display: flex;
    justify-content: center;
    align-items: center;
  }

  .netrunner-bet-panel {
    width: min(720px, 100%);
    padding: clamp(14px, 2.5vw, 20px);
    background: #100b1cf2;
    border: 1px solid $purple;
    box-shadow: 12px 12px 0 #03020799, 0 0 28px #9962ff35;
  }

  .netrunner-bet-label {
    margin-bottom: 10px;
    color: $cyan;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 1.8px;
  }

  .netrunner-bet-context {
    color: #aeb9c9;
    line-height: 1.5;
    text-transform: capitalize;
  }

  .netrunner-bet-display {
    margin: 14px 0 10px;
    padding: 12px;
    background: #080610;
    border: 1px solid #453b82;
    text-align: center;

    display: grid;
    gap: 7px;

    span,
    small {
      color: #94a3b8;
      font-size: 0.68rem;
      letter-spacing: 2px;
    }

    strong {
      color: #9dffa7;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: clamp(1.8rem, 4vw, 2.8rem);
      text-shadow: 0 0 14px #9dffa755;
    }
  }

  .netrunner-bet-controls {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;

    button {
      min-height: 38px;
      color: #ffffff;
      background: #171126;
      border: 1px solid $purple;
      border-radius: 3px;
      font-family: "Space Mono", monospace;
      font-weight: 800;
      cursor: pointer;

      &:hover,
      &:focus-visible {
        color: #080610;
        background: $cyan;
        border-color: $cyan;
        outline: 2px solid #ffffff;
        outline-offset: 2px;
      }
    }
  }

  .netrunner-lock-bet {
    width: 100%;
    min-height: 42px;
    margin-top: 10px;
    color: #080610;
    background: $pink;
    border: 1px solid $pink;
    border-radius: 3px;
    box-shadow: 0 0 18px #f837cd44;
    font-family: "Space Mono", monospace;
    font-weight: 800;
    cursor: pointer;

    &:hover,
    &:focus-visible {
      background: $cyan;
      border-color: $cyan;
      outline: 2px solid #ffffff;
      outline-offset: 2px;
    }

    &:disabled {
      color: #64748b;
      background: #11101a;
      border-color: #334155;
      box-shadow: none;
      cursor: not-allowed;
    }
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

  .color-odds-wrapper,
  .color-progress-wrapper {
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

  .progress-circle-group {
    padding: 0 8px;

    display: flex;
    justify-content: space-evenly;
    gap: 2px;
  }

  .progress-circle-group__purple {
    border-left: 1px dotted $purple;
    border-right : 1px dotted $purple;
  }

  .progress-circle-group__pink {
    border-left: 1px dotted $pink;
    border-right : 1px dotted $pink;
  }

  .progress-circle-group__yellow {
    border-left: 1px dotted $yellow;
    border-right : 1px dotted $yellow;
  }

  .progress-circle-group__cyan {
    border-left: 1px dotted $cyan;
    border-right : 1px dotted $cyan;
  }

  .progress-circle-group__blue {
    border-left: 1px dotted $blue;
    border-right : 1px dotted $blue;
  }

  .progress-circle {
    height: 12px;
    width: 12px;
    border-radius: 90% 10% 90% 90%;
    border: 1px solid #eeeeeebc;
  }
  
  .progress-circle__purple {
    border: 1px solid $purple;
    background-color: darken($purple, 20%);
    box-shadow: 0 0 6px color.scale($purple, $alpha: -5%);
  }

  .progress-circle__pink {
    border: 1px solid $pink;
    background-color: darken($pink, 20%);
    box-shadow: 0 0 6px color.scale($pink, $alpha: -5%);
  }

  .progress-circle__yellow {
    border: 1px solid $yellow;
    background-color: darken($yellow, 20%);
    box-shadow: 0 0 6px color.scale($yellow, $alpha: -5%);
  }

  .progress-circle__cyan {
    border: 1px solid $cyan;
    background-color: darken($cyan, 20%);
    box-shadow: 0 0 6px color.scale($cyan, $alpha: -5%);
  }

  .progress-circle__blue {
    border: 1px solid $blue;
    background-color: darken($blue, 20%);
    box-shadow: 0 0 6px color.scale($blue, $alpha: -5%);
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
  
  .winning-message {
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: 3rem;
    text-wrap: nowrap;
    font-weight: bold;
    text-transform: uppercase;
    z-index: 1;

    position: absolute;
    right: 50%;
    bottom: 50%;
    transform: translate(50%, 50%);
  }

  .winning-message__purple {
    border-top: 4px double $purple;
    border-bottom: 4px double $purple;
    text-shadow: 0 0 12px $purple;
  }

  .winning-message__pink {
    border-top: 4px double $pink;
    border-bottom: 4px double $pink;
    text-shadow: 0 0 12px $pink;
  }

  .winning-message__yellow {
    border-top: 4px double $yellow;
    border-bottom: 4px double $yellow;
    text-shadow: 0 0 12px $yellow;
  }

  .winning-message__cyan {
    border-top: 4px double $cyan;
    border-bottom: 4px double $cyan;
    text-shadow: 0 0 12px $cyan;
  }

  .winning-message__blue {
    border-top: 4px double $blue;
    border-bottom: 4px double $blue;
    text-shadow: 0 0 12px $blue;
  }

  .auto-draw-status {
    padding: 0.5rem 1rem;
    color: $cyan;
    border: 1px solid $cyan;
    border-radius: var(--border-radius-small);
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: 0.75rem;
    letter-spacing: 1px;
  }

  .multiplayer-message {
    position: absolute;
    z-index: 4;
    inset: 50% auto auto 50%;
    width: min(520px, calc(100% - 32px));
    padding: 32px;
    color: var(--white);
    background: #070b16f2;
    border: 1px solid $cyan;
    border-top: 8px solid $cyan;
    border-radius: var(--border-radius-med);
    box-shadow: 0 0 34px #02fbfb44;
    text-align: center;
    transform: translate(-50%, -50%);

    p {
      margin-bottom: 20px;
    }
  }

  .rematch-message {
    border-color: $purple;
    border-top-color: $purple;
    box-shadow: 0 0 34px #9962ff55;
  }

  .rematch-controls {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
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

  @media (max-width: 680px) {
    .menu {
      padding: 18px;
    }

    .mode-options {
      grid-template-columns: 1fr;
    }

    .mode-option {
      min-height: 125px;
    }
  }
</style>
