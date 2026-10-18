<script lang="ts">
  import { onDestroy } from 'svelte';
  import { socket } from '../socket';
  import { campaignState } from '../stores/campaign';
  import location from '../stores/location';
  import { netRunnersGameState } from '../stores/netRunnersGameState';
  import { pigzServerState } from '../stores/pigzSession';
  import { sessionState } from '../stores/session';

  type Mode = 'singleplayer' | 'multiplayer';
  type LocalPhase = 'menu' | 'betting' | 'playing' | 'finished';

  const winningScore = 100;
  const pipLayouts: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8]
  };

  let mode: Mode = 'singleplayer';
  let localPhase: LocalPhase = 'menu';
  let localScores = [0, 0];
  let localCurrentPoints = 0;
  let localActivePlayer = 0;
  let localWinner: number | null = null;
  let localRoll: number | null = null;
  let wager = 0;
  let rolling = false;
  let visibleRoll = 1;
  let multiplayerJoined = false;
  let waitingForStoryPartner = false;
  let errorMessage = '';
  let animationTimer: number | undefined;
  let cpuTimer: number | undefined;
  let lastServerStatus = '';
  let lastRollSequence = 0;
  let showResetConfirmation = false;

  $: playerId = $sessionState.playerId;
  $: serverPlayer = playerId && $pigzServerState
    ? $pigzServerState.players[playerId]
    : null;
  $: launchedFromStory = $campaignState?.activeMinigame?.id === 'pigz';
  $: activeBalance = mode === 'singleplayer'
    ? $netRunnersGameState.p1.money
    : serverPlayer?.money ?? 0;
  $: displayedScores = mode === 'singleplayer'
    ? localScores
    : [
        $pigzServerState?.players.p1.score ?? 0,
        $pigzServerState?.players.p2.score ?? 0
      ];
  $: displayedCurrentPoints = mode === 'singleplayer'
    ? localCurrentPoints
    : $pigzServerState?.currentPoints ?? 0;
  $: displayedActivePlayer = mode === 'singleplayer'
    ? (localActivePlayer === 0 ? 'p1' : 'p2')
    : $pigzServerState?.activePlayer ?? 'p1';
  $: displayedWinner = mode === 'singleplayer'
    ? (localWinner === null ? null : localWinner === 0 ? 'p1' : 'p2')
    : $pigzServerState?.winner ?? null;
  $: localPlayerWon = displayedWinner === (mode === 'singleplayer' ? 'p1' : playerId);
  $: displayedWinnerName = displayedWinner === 'p1'
    ? (mode === 'singleplayer' ? 'YOU' : $pigzServerState?.players.p1.name ?? 'PLAYER 1')
    : (mode === 'singleplayer' ? 'CPU' : $pigzServerState?.players.p2.name ?? 'PLAYER 2');
  $: displayRoll = rolling
    ? visibleRoll
    : mode === 'singleplayer'
      ? localRoll ?? 1
      : $pigzServerState?.lastRoll ?? 1;
  $: isLocalTurn = mode === 'singleplayer'
    ? localPhase === 'playing' && localActivePlayer === 0
    : $pigzServerState?.status === 'playing' && displayedActivePlayer === playerId;
  $: multiplayerRematchVote = playerId && $pigzServerState
    ? $pigzServerState.rematchVotes[playerId]
    : null;

  $: if (launchedFromStory && mode !== 'multiplayer') {
    mode = 'multiplayer';
    joinMultiplayer();
  }

  $: if ($location !== 'pigz' && multiplayerJoined) {
    leaveMultiplayer(false);
  }

  $: if (mode === 'multiplayer' && $pigzServerState) {
    synchronizeServerState();
  }

  onDestroy(() => {
    window.clearTimeout(animationTimer);
    window.clearTimeout(cpuTimer);

    if (multiplayerJoined) {
      socket.emit('pigz:leave');
    }
  });

  function selectSingleplayer(): void {
    leaveMultiplayer(false);
    mode = 'singleplayer';
    localPhase = 'betting';
    resetLocalRound();
  }

  function selectMultiplayer(): void {
    mode = 'multiplayer';
    wager = 0;
    joinMultiplayer();
  }

  function joinMultiplayer(): void {
    if (multiplayerJoined) {
      return;
    }

    multiplayerJoined = true;
    socket.emit('pigz:join');
  }

  function leaveMultiplayer(returnToLibrary = true): void {
    if (multiplayerJoined) {
      multiplayerJoined = false;
      socket.emit('pigz:leave');
    }

    if (returnToLibrary) {
      location.set('minigames');
    }
  }

  function synchronizeServerState(): void {
    const serverState = $pigzServerState;

    if (!serverState) {
      return;
    }

    if (serverState.status !== lastServerStatus) {
      lastServerStatus = serverState.status;
      errorMessage = '';

      if (serverState.status === 'betting') {
        wager = 0;
        waitingForStoryPartner = false;
      }
    }

    if (serverState.rollSequence !== lastRollSequence) {
      lastRollSequence = serverState.rollSequence;
      animateDie(serverState.lastRoll ?? 1);
    }
  }

  function updateWager(amount: number): void {
    wager = Math.min(activeBalance, Math.max(0, wager + amount));
  }

  function lockWager(): void {
    if (wager < 0 || wager > activeBalance) {
      return;
    }

    if (mode === 'singleplayer') {
      localPhase = 'playing';
      return;
    }

    socket.emit('pigz:bet', wager, handleActionResult);
  }

  function rollDice(): void {
    if (!isLocalTurn || rolling) {
      return;
    }

    if (mode === 'multiplayer') {
      socket.emit('pigz:roll', handleActionResult);
      return;
    }

    const roll = randomRoll();
    animateDie(roll, () => applyLocalRoll(roll));
  }

  function hold(): void {
    if (!isLocalTurn || rolling) {
      return;
    }

    if (mode === 'multiplayer') {
      socket.emit('pigz:hold', handleActionResult);
      return;
    }

    bankLocalPoints();
  }

  function applyLocalRoll(roll: number): void {
    localRoll = roll;

    if (roll === 1) {
      localCurrentPoints = 0;
      localActivePlayer = localActivePlayer === 0 ? 1 : 0;
      scheduleCpuTurn();
      return;
    }

    localCurrentPoints += roll;
  }

  function bankLocalPoints(): void {
    localScores[localActivePlayer] += localCurrentPoints;
    localScores = [...localScores];
    localCurrentPoints = 0;

    if (localScores[localActivePlayer] >= winningScore) {
      finishLocalRound(localActivePlayer);
      return;
    }

    localActivePlayer = localActivePlayer === 0 ? 1 : 0;
    scheduleCpuTurn();
  }

  function scheduleCpuTurn(): void {
    window.clearTimeout(cpuTimer);

    if (localPhase !== 'playing' || localActivePlayer !== 1) {
      return;
    }

    cpuTimer = window.setTimeout(runCpuTurn, 650);
  }

  function runCpuTurn(): void {
    if (localPhase !== 'playing' || localActivePlayer !== 1) {
      return;
    }

    if (localCurrentPoints >= 20) {
      bankLocalPoints();
      return;
    }

    const roll = randomRoll();
    animateDie(roll, () => {
      localRoll = roll;

      if (roll === 1) {
        localCurrentPoints = 0;
        localActivePlayer = 0;
        return;
      }

      localCurrentPoints += roll;
      scheduleCpuTurn();
    });
  }

  function finishLocalRound(winner: number): void {
    localWinner = winner;
    localPhase = 'finished';
    const balanceChange = winner === 0
      ? (wager === 0 ? 100 : wager)
      : -wager;

    netRunnersGameState.update((state) => ({
      ...state,
      p1: {
        ...state.p1,
        money: Math.max(0, state.p1.money + balanceChange)
      }
    }));
  }

  function resetLocalRound(): void {
    window.clearTimeout(cpuTimer);
    localScores = [0, 0];
    localCurrentPoints = 0;
    localActivePlayer = 0;
    localWinner = null;
    localRoll = null;
    wager = 0;
    errorMessage = '';
  }

  function restartRound(): void {
    if (mode === 'singleplayer') {
      resetLocalRound();
      localPhase = 'betting';
      return;
    }

    socket.emit('pigz:restart');
  }

  function voteForRematch(wantsRematch: boolean): void {
    socket.emit(
      'pigz:rematch',
      wantsRematch,
      (response: { ok: boolean; error?: string }) => {
        handleActionResult(response);

        if (response.ok && !wantsRematch) {
          multiplayerJoined = false;
          mode = 'singleplayer';
          localPhase = 'menu';
          location.set('minigames');
        }
      }
    );
  }

  function returnToStory(): void {
    socket.emit(
      'pigz:story-complete',
      (response: { ok: boolean; waitingForPartner?: boolean; error?: string }) => {
        if (!response.ok) {
          errorMessage = response.error ?? 'Could not return to the story.';
          return;
        }

        waitingForStoryPartner = Boolean(response.waitingForPartner);
      }
    );
  }

  function cancelStoryGame(): void {
    socket.emit('pigz:story-cancel', handleActionResult);
  }

  function exitGame(): void {
    if (launchedFromStory) {
      cancelStoryGame();
      return;
    }

    if (mode === 'multiplayer') {
      leaveMultiplayer();
    } else {
      localPhase = 'menu';
      location.set('minigames');
    }
  }

  function returnToPigzMenu(): void {
    resetLocalRound();
    mode = 'singleplayer';
    localPhase = 'menu';
  }

  function requestReset(): void {
    if (mode === 'multiplayer') {
      showResetConfirmation = true;
      return;
    }

    returnToPigzMenu();
  }

  function confirmMultiplayerReset(): void {
    leaveMultiplayer(false);
    showResetConfirmation = false;
    returnToPigzMenu();
  }

  function animateDie(finalRoll: number, onComplete?: () => void): void {
    rolling = true;
    window.clearTimeout(animationTimer);

    let frame = 0;
    const advanceFrame = () => {
      visibleRoll = randomRoll();
      frame += 1;

      if (frame < 6) {
        animationTimer = window.setTimeout(advanceFrame, 70);
        return;
      }

      visibleRoll = finalRoll;
      rolling = false;
      onComplete?.();
    };

    advanceFrame();
  }

  function handleActionResult(response: { ok: boolean; error?: string }): void {
    errorMessage = response.ok ? '' : response.error ?? 'Pigz action failed.';
  }

  function randomRoll(): number {
    return Math.floor(Math.random() * 6) + 1;
  }

  function pipIsVisible(position: number, rollValue: number): boolean {
    return pipLayouts[rollValue].includes(position);
  }
</script>

<section class="pigz" class:hide={$location !== 'pigz'} aria-labelledby="pigz-title">
  <header>
    <div><span class="status-light"></span>DEJAVU://ARCADE/PIGZ</div>
    <span>FIRST TO 100</span>
  </header>

  <div class="pigz-screen">
    <div class="scanlines" aria-hidden="true"></div>

    {#if showResetConfirmation}
      <div class="result-backdrop">
        <section class="reset-confirm" role="alertdialog" aria-modal="true">
          <h2>Reset this multiplayer game?</h2>
          <p>The shared round will close and the other player will be notified.</p>
          <div><button on:click={() => showResetConfirmation = false}>CANCEL</button><button class="exit-button" on:click={confirmMultiplayerReset}>RESET GAME</button></div>
        </section>
      </div>
    {/if}

    <div class="title-row">
      <div>
        <p class="eyebrow">HIGH-STAKES DICE PROTOCOL</p>
        <h1 id="pigz-title">PIG<span>Z</span></h1>
      </div>
      <button class="exit-button" type="button" on:click={exitGame}>EXIT</button>
    </div>

    {#if mode === 'singleplayer' && localPhase === 'menu'}
      <div class="mode-panel panel">
        <p class="terminal-label">PIGZ&gt; SELECT GAME MODE</p>
        <h2>Bank your points—or lose the whole turn.</h2>
        <p>Roll the die to build a turn score. A roll of one wipes the turn and hands control to your opponent.</p>
        <div class="button-row">
          <button class="primary-button" type="button" on:click={selectSingleplayer}>SINGLEPLAYER</button>
          <button type="button" on:click={selectMultiplayer}>MULTIPLAYER</button>
        </div>
      </div>
    {:else if mode === 'multiplayer' && $pigzServerState?.status === 'waiting'}
      <div class="waiting-panel panel" role="status">
        <p class="terminal-label">PIGZ&gt; LINKING TERMINALS</p>
        <div class="waiting-count">{$pigzServerState.participantCount}/2</div>
        <h2>{$pigzServerState.departureNotice ? 'Connection severed' : 'Waiting for your opponent'}</h2>
        <p>{$pigzServerState.departureNotice ?? 'Both players must launch Pigz from the Minigames library.'}</p>
        {#if $pigzServerState.departureNotice}<button on:click={confirmMultiplayerReset}>RETURN TO MAIN MENU</button>{/if}
      </div>
    {:else if (mode === 'singleplayer' && localPhase === 'betting')
      || (mode === 'multiplayer' && $pigzServerState?.status === 'betting')}
      {#if mode === 'multiplayer' && serverPlayer?.ready}
        <div class="waiting-panel panel" role="status">
          <p class="terminal-label">PIGZ&gt; WAGER LOCKED</p>
          <div class="waiting-count">{serverPlayer.amountBet}₭</div>
          <h2>Waiting for the other wager</h2>
        </div>
      {:else}
        <div class="wager-panel panel">
          <p class="terminal-label">PIGZ EXCHANGE&gt; PLACE YOUR BET</p>
          <p>Even money. A free 0₭ wager awards 100₭ on a win and costs nothing on a loss.</p>

          <div class="wager-display" aria-live="polite">
            <span>WAGER</span>
            <strong>{wager}₭</strong>
            <small>AVAILABLE {activeBalance}₭</small>
          </div>

          <div class="wager-controls" aria-label="Adjust wager">
            <button type="button" on:click={() => updateWager(-1000)}>-1000</button>
            <button type="button" on:click={() => updateWager(-100)}>-100</button>
            <button type="button" on:click={() => updateWager(-10)}>-10</button>
            <button type="button" on:click={() => updateWager(-1)}>-1</button>
            <button type="button" on:click={() => updateWager(1)}>+1</button>
            <button type="button" on:click={() => updateWager(10)}>+10</button>
            <button type="button" on:click={() => updateWager(100)}>+100</button>
            <button type="button" on:click={() => updateWager(1000)}>+1000</button>
          </div>

          <button class="lock-button" type="button" on:click={lockWager}>LOCK BET</button>
        </div>
      {/if}
    {:else}
      {#if displayedWinner}
        <div class="result-backdrop">
          <section class="result-panel" class:result-panel--victory={localPlayerWon} class:result-panel--defeat={!localPlayerWon} aria-live="polite">
            <p class="terminal-label">PIGZ&gt; MATCH COMPLETE</p>
            <strong class="result-verdict">{localPlayerWon ? 'VICTORY' : 'DEFEAT'}</strong>
            <h2>{displayedWinnerName} WINS</h2>
            <p>Final score {displayedScores[0]} — {displayedScores[1]}</p>
            <p class:result-credit-win={localPlayerWon} class:result-credit-loss={!localPlayerWon}>
              {localPlayerWon
                ? `WINNINGS +${wager === 0 ? 100 : wager}₭`
                : `LOSS ${wager === 0 ? '0' : `-${wager}`}₭`}
            </p>

            {#if launchedFromStory}
              <button class="primary-button story-button" type="button" disabled={waitingForStoryPartner} on:click={returnToStory}>
                {waitingForStoryPartner ? 'WAITING FOR PARTNER' : 'RETURN TO STORY'}
              </button>
            {:else if mode === 'singleplayer'}
              <button class="primary-button story-button" type="button" on:click={restartRound}>PLAY AGAIN</button>
              <button type="button" on:click={returnToPigzMenu}>MAIN MENU</button>
            {:else if multiplayerRematchVote === true}
              <p class="rematch-status">Waiting for opponent confirmation.</p>
            {:else}
              <div class="dice-actions">
                <button class="primary-button" type="button" on:click={() => voteForRematch(true)}>PLAY AGAIN</button>
                <button type="button" on:click={() => voteForRematch(false)}>EXIT</button>
              </div>
            {/if}
          </section>
        </div>
      {/if}

      <div class="game-board">
        <article
          class="player-panel"
          class:player-panel--active={displayedActivePlayer === 'p1' && !displayedWinner}
          class:player-panel--winner={displayedWinner === 'p1'}
          class:player-panel--loser={displayedWinner === 'p2'}
        >
          <p>PLAYER 1</p>
          <h2>{mode === 'singleplayer' ? 'YOU' : $pigzServerState?.players.p1.name}</h2>
          <strong>{displayedScores[0]}</strong>
          <div><span>CURRENT</span><b>{displayedActivePlayer === 'p1' ? displayedCurrentPoints : 0}</b></div>
        </article>

        <div class="dice-console">
          <p class="turn-label">
            {#if displayedWinner}
              {displayedWinner === 'p1' ? 'PLAYER 1' : 'PLAYER 2'} WINS
            {:else if isLocalTurn}
              YOUR TURN
            {:else}
              OPPONENT TURN
            {/if}
          </p>

          <button
            class="dice"
            class:dice--rolling={rolling}
            type="button"
            aria-label="Roll dice"
            disabled={!isLocalTurn || rolling || Boolean(displayedWinner)}
            on:click={rollDice}
          >
            <span class="pip-grid" aria-hidden="true">
              {#each Array(9) as _, position}
                <i class:pip--visible={pipIsVisible(position, displayRoll)}></i>
              {/each}
            </span>
          </button>

          {#if !displayedWinner}
            <div class="dice-actions">
              <button class="primary-button" type="button" disabled={!isLocalTurn || rolling} on:click={rollDice}>ROLL</button>
              <button type="button" disabled={!isLocalTurn || rolling || displayedCurrentPoints === 0} on:click={hold}>HOLD</button>
            </div>
            <button class="text-button" type="button" on:click={requestReset}>RESET GAME</button>
          {/if}
        </div>

        <article
          class="player-panel"
          class:player-panel--active={displayedActivePlayer === 'p2' && !displayedWinner}
          class:player-panel--winner={displayedWinner === 'p2'}
          class:player-panel--loser={displayedWinner === 'p1'}
        >
          <p>PLAYER 2</p>
          <h2>{mode === 'singleplayer' ? 'CPU' : $pigzServerState?.players.p2.name}</h2>
          <strong>{displayedScores[1]}</strong>
          <div><span>CURRENT</span><b>{displayedActivePlayer === 'p2' ? displayedCurrentPoints : 0}</b></div>
        </article>
      </div>
    {/if}

    {#if errorMessage}
      <p class="error-message" role="alert">{errorMessage}</p>
    {/if}
  </div>
</section>

<style lang="scss">
  $pink: #ff3dbb;
  $hotPink: #ff75fd;
  $softPink: #ffb4e5;
  $violet: #5c1f68;
  $background: #09040d;
  $panel: #160a1c;

  .pigz {
    width: 100%;
    height: 95vh;
    max-width: 1280px;
    overflow: hidden;
    background: $background;
    border: 1px solid $pink;
    border-radius: 8px;
    box-shadow: 0 0 46px #ff3dbb35;

    > header {
      min-height: 42px;
      padding: 10px 14px;
      color: $softPink;
      background: #210c28;
      border-bottom: 1px solid $pink;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.72rem;
      letter-spacing: 1.8px;

      display: flex;
      justify-content: space-between;
      align-items: center;

      div {
        display: flex;
        align-items: center;
        gap: 8px;
      }
    }
  }

  .status-light {
    width: 8px;
    height: 8px;
    background: $hotPink;
    border-radius: 50%;
    box-shadow: 0 0 12px $hotPink;
  }

  .pigz-screen {
    position: relative;
    height: calc(100% - 42px);
    padding: clamp(18px, 4vw, 42px);
    overflow-y: auto;
    background:
      linear-gradient(90deg, #ff3dbb0a 1px, transparent 1px),
      linear-gradient(#ff3dbb0a 1px, transparent 1px),
      radial-gradient(circle at 50% 44%, #45134f 0, #09040d 62%);
    background-size: 30px 30px, 30px 30px, auto;
  }

  .scanlines {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(transparent 0, transparent 5px, #ffffff05 6px);
    pointer-events: none;
  }

  .title-row,
  .panel,
  .game-board,
  .error-message {
    position: relative;
    z-index: 1;
  }

  .result-backdrop {
    position: absolute;
    z-index: 10;
    inset: 0;
    padding: 24px;
    background: #09040de6;

    display: grid;
    place-items: center;
  }

  .result-panel {
    width: min(620px, 100%);
    min-height: 390px;
    padding: clamp(26px, 6vw, 58px);
    text-align: center;
    border: 2px solid $hotPink;

    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 15px;

    h2 {
      color: #ffffff;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: clamp(1.5rem, 4vw, 2.5rem);
    }

    > p:not(.terminal-label) {
      color: $softPink;
    }
  }

  .reset-confirm {
    width: min(470px, 100%);
    padding: 28px;
    color: $softPink;
    background: #160a1c;
    border: 1px solid $pink;

    h2 {
      color: #ffffff;
    }

    > div {
      margin-top: 22px;

      display: flex;
      justify-content: flex-end;
      gap: 9px;
    }
  }

  .result-verdict {
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: clamp(3rem, 8vw, 6rem);
    letter-spacing: 6px;
  }

  .result-credit-win {
    color: #78ff9f;
    font-weight: 900;
  }

  .result-credit-loss {
    color: #ff8eae;
    font-weight: 900;
  }

  .result-panel--victory {
    background: radial-gradient(circle at 50% 25%, #4ff6a526, transparent 60%), #071a14;
    border-color: #53e6a1;
    box-shadow: 0 0 45px #53e6a166;

    .result-verdict {
      color: #79f4b9;
      text-shadow: 0 0 26px #53e6a1aa;
    }
  }

  .result-panel--defeat {
    background: radial-gradient(circle at 50% 25%, #ff3d6b26, transparent 60%), #260912;
    border-color: #ff4f78;
    box-shadow: 0 0 45px #ff3d6b55;

    .result-verdict {
      color: #ff7597;
      text-shadow: 0 0 26px #ff3d6baa;
    }
  }

  .title-row {
    margin-bottom: clamp(24px, 5vh, 54px);

    display: flex;
    justify-content: space-between;
    align-items: end;

    h1 {
      color: #ffffff;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: clamp(2.5rem, 7vw, 5rem);
      letter-spacing: 6px;
      line-height: 0.9;

      span {
        color: $hotPink;
        text-shadow: 0 0 22px #ff75fdaa;
      }
    }
  }

  .eyebrow,
  .terminal-label {
    margin-bottom: 10px;
    color: $softPink;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 2px;
  }

  .panel {
    width: min(760px, 100%);
    margin: 0 auto;
    padding: clamp(24px, 4vw, 42px);
    background: #160a1cf0;
    border: 1px solid $pink;
    box-shadow: 12px 12px 0 #03010499, 0 0 28px #ff3dbb2e;

    h2 {
      margin-bottom: 14px;
      color: #ffffff;
      font-family: "Orbitron", "Space Mono", sans-serif;
    }

    > p:not(.terminal-label) {
      color: #d6bfda;
      line-height: 1.65;
    }
  }

  button {
    min-height: 44px;
    padding: 10px 18px;
    color: #ffffff;
    background: #23102b;
    border: 1px solid $pink;
    border-radius: 3px;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 800;
    cursor: pointer;

    &:hover,
    &:focus-visible {
      color: $background;
      background: $softPink;
      outline: 2px solid #ffffff;
      outline-offset: 2px;
    }

    &:disabled {
      color: #715e74;
      background: #130d15;
      border-color: #513454;
      cursor: not-allowed;
    }
  }

  .primary-button,
  .lock-button {
    color: $background;
    background: $hotPink;
    box-shadow: 0 0 20px #ff75fd55;
  }

  .button-row,
  .dice-actions {
    margin-top: 24px;

    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 10px;
  }

  .exit-button {
    min-height: 36px;
    padding: 7px 14px;
  }

  .waiting-panel {
    text-align: center;
  }

  .waiting-count {
    margin: 20px 0 14px;
    color: $hotPink;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: clamp(2.8rem, 8vw, 5rem);
    font-weight: 900;
    text-shadow: 0 0 22px #ff75fd88;
  }

  .wager-display {
    margin: 26px 0 18px;
    padding: 22px;
    background: #09040d;
    border: 1px solid $violet;
    text-align: center;

    display: grid;
    gap: 8px;

    span,
    small {
      color: #a78aaa;
      font-size: 0.68rem;
      letter-spacing: 2px;
    }

    strong {
      color: $hotPink;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: clamp(2rem, 5vw, 3.5rem);
      text-shadow: 0 0 16px #ff75fd77;
    }
  }

  .wager-controls {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .lock-button {
    width: 100%;
    margin-top: 16px;
  }

  .game-board {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) minmax(230px, 0.8fr) minmax(220px, 1fr);
    gap: clamp(14px, 3vw, 34px);
    align-items: stretch;
  }

  .player-panel {
    min-height: 360px;
    padding: clamp(20px, 3vw, 36px);
    background: #120817e8;
    border: 1px solid #5c1f68;
    opacity: 0.58;
    transition: 180ms ease;

    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    > p {
      color: #a78aaa;
      font-size: 0.68rem;
      letter-spacing: 2px;
    }

    h2 {
      margin: 10px 0 24px;
      color: $softPink;
      font-family: "Orbitron", "Space Mono", sans-serif;
    }

    > strong {
      color: #ffffff;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: clamp(3.5rem, 8vw, 6rem);
    }

    div {
      width: 100%;
      margin-top: 30px;
      padding: 14px;
      background: #09040d;
      border-left: 3px solid $pink;

      display: flex;
      justify-content: space-between;
      align-items: center;

      span {
        color: #a78aaa;
        font-size: 0.68rem;
        letter-spacing: 1.5px;
      }

      b {
        color: $hotPink;
        font-size: 1.5rem;
      }
    }
  }

  .player-panel--active,
  .player-panel--winner {
    border-color: $hotPink;
    box-shadow: 0 0 28px #ff75fd44;
    opacity: 1;
    transform: translateY(-6px);
  }

  .player-panel--winner {
    background: #2c0d35;
  }

  .player-panel--loser {
    filter: grayscale(0.8);
    opacity: 0.32;
  }

  .dice-console {
    text-align: center;

    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .turn-label {
    min-height: 18px;
    margin-bottom: 14px;
    color: $softPink;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 1.8px;
  }

  .dice {
    width: clamp(130px, 17vw, 190px);
    height: clamp(130px, 17vw, 190px);
    padding: 0;
    color: $hotPink;
    background: #fff6fc;
    border: 4px solid $hotPink;
    border-radius: 26px;
    box-shadow: 0 0 36px #ff75fd88, inset 0 0 22px #ff75fd33;
    display: grid;
    place-items: center;
  }

  .pip-grid {
    width: 66%;
    height: 66%;

    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);
    gap: 8px;

    i {
      width: clamp(12px, 2vw, 23px);
      height: clamp(12px, 2vw, 23px);
      place-self: center;
      background: transparent;
      border-radius: 50%;
    }

    .pip--visible {
      background: $pink;
      box-shadow: 0 0 12px #ff3dbb88;
    }
  }

  .dice--rolling {
    animation: dice-shake 90ms linear infinite alternate;
  }

  .text-button {
    min-height: auto;
    margin-top: 16px;
    padding: 4px;
    color: #a78aaa;
    background: transparent;
    border: 0;
    font-size: 0.68rem;
  }

  .story-button {
    margin-top: 22px;
  }

  .rematch-status {
    margin-top: 22px;
    color: $softPink;
    line-height: 1.5;
  }

  .error-message {
    max-width: 760px;
    margin: 18px auto 0;
    padding: 12px;
    color: #ffd6e9;
    background: #4b112b;
    border: 1px solid #ff5a91;
  }

  @keyframes dice-shake {
    from {
      transform: rotate(-5deg) translate(-3px, 1px);
    }

    to {
      transform: rotate(5deg) translate(3px, -1px);
    }
  }

  @media (max-width: 860px) {
    .game-board {
      grid-template-columns: 1fr 1fr;
    }

    .dice-console {
      grid-column: 1 / -1;
      grid-row: 2;
    }

    .player-panel {
      min-height: 250px;
    }
  }

  @media (max-width: 560px) {
    .wager-controls {
      grid-template-columns: repeat(2, 1fr);
    }

    .game-board {
      grid-template-columns: 1fr;
    }

    .dice-console {
      grid-column: 1;
      grid-row: 2;
    }
  }
</style>
