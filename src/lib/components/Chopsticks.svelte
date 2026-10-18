<script lang="ts">
  import { onDestroy } from 'svelte';
  import location from '../stores/location';
  import { arcadeStates, type ArcadeState } from '../stores/arcade';
  import { sessionState, type PlayerId } from '../stores/session';
  import { campaignState } from '../stores/campaign';
  import { socket } from '../socket';

  type Mode = 'menu' | 'instructions' | 'solo' | 'multi';

  let mode: Mode = 'menu';
  let pendingMode: 'solo' | 'multi' = 'solo';
  let selectedHand: number | null = null;
  let error = '';
  let localState = createLocalState();
  let waitingForStoryPartner = false;
  let helpReturnMode: Mode | null = null;
  let showResetConfirmation = false;
  let resetShouldExit = false;

  $: serverState = $arcadeStates.chopsticks ?? null;
  $: state = mode === 'solo' ? localState : serverState;
  $: playerId = ($sessionState.playerId ?? 'p1') as PlayerId;
  $: opponentId = playerId === 'p1' ? 'p2' : 'p1';
  $: canAct = state?.status === 'playing'
    && (mode === 'solo' ? state.activePlayer === 'p1' : state.activePlayer === playerId);
  $: launchedFromStory = $campaignState?.activeMinigame?.id === 'chopsticks';
  $: if (launchedFromStory && mode === 'menu') {
    pendingMode = $campaignState?.sessionMode === 'singleplayer' ? 'solo' : 'multi';
    mode = 'instructions';
  }
  $: if ($location !== 'chopsticks' && mode === 'multi') {
    socket.emit('arcade:leave', 'chopsticks');
    mode = 'menu';
  }

  onDestroy(() => {
    if (mode === 'multi') {
      socket.emit('arcade:leave', 'chopsticks');
    }
  });

  function createLocalState(): ArcadeState {
    return {
      game: 'chopsticks',
      status: 'playing',
      participants: { p1: true, p2: true },
      participantCount: 2,
      players: { p1: { name: 'You' }, p2: { name: 'CPU' } },
      winner: null,
      log: [],
      hands: { p1: [1, 1], p2: [1, 1] },
      activePlayer: 'p1',
      turn: 1
    };
  }

  function openInstructions(nextMode: 'solo' | 'multi'): void {
    pendingMode = nextMode;
    mode = 'instructions';
  }

  function begin(): void {
    selectedHand = null;
    error = '';

    if (pendingMode === 'solo') {
      localState = createLocalState();
      mode = 'solo';
    } else {
      mode = 'multi';
      socket.emit('arcade:join', 'chopsticks', 'versus', handleResult);
    }
  }

  function selectOwnHand(index: number): void {
    if (!state || !canAct || state.hands[playerId][index] === 0) {
      return;
    }

    selectedHand = index;
  }

  function attack(target: number): void {
    if (!state || !canAct || selectedHand === null || state.hands[opponentId][target] === 0) {
      return;
    }

    sendAction({ type: 'attack', source: selectedHand, target });
    selectedHand = null;
  }

  function split(): void {
    sendAction({ type: 'split' });
    selectedHand = null;
  }

  function sendAction(action: Record<string, unknown>): void {
    if (mode === 'solo') {
      applyLocalAction('p1', action);
    } else {
      socket.emit('arcade:action', { game: 'chopsticks', action }, handleResult);
    }
  }

  function applyLocalAction(actor: PlayerId, action: Record<string, any>): void {
    if (localState.status !== 'playing' || localState.activePlayer !== actor) {
      return;
    }

    const targetPlayer = actor === 'p1' ? 'p2' : 'p1';

    if (action.type === 'split') {
      const hands = localState.hands[actor];
      const liveValue = hands.find((value: number) => value > 0);

      if (!hands.includes(0) || !liveValue || liveValue % 2 !== 0) {
        error = 'Split requires one empty hand and an even live hand.';
        return;
      }

      localState.hands[actor] = [liveValue / 2, liveValue / 2];
      addLog(`${localState.players[actor].name} splits into two equal hands.`);
    } else {
      const source = Number(action.source);
      const target = Number(action.target);
      const nextValue = localState.hands[targetPlayer][target] + localState.hands[actor][source];
      localState.hands[targetPlayer][target] = nextValue >= 5 ? 0 : nextValue;
      addLog(`${localState.players[actor].name} attacks the ${target === 0 ? 'left' : 'right'} hand.`);
    }

    error = '';

    if (localState.hands[targetPlayer].every((value: number) => value === 0)) {
      localState.winner = actor;
      localState.status = 'finished';
    } else {
      localState.activePlayer = targetPlayer;
      localState.turn += 1;
    }

    localState = { ...localState };

    if (localState.activePlayer === 'p2' && localState.status === 'playing') {
      window.setTimeout(cpuTurn, 650);
    }
  }

  function cpuTurn(): void {
    const hands = localState.hands.p2;
    const canSplit = hands.includes(0) && hands.some((value: number) => value > 0 && value % 2 === 0);

    if (canSplit && Math.random() < 0.35) {
      applyLocalAction('p2', { type: 'split' });
      return;
    }

    const sources = hands.map((value: number, index: number) => value > 0 ? index : -1).filter((index: number) => index >= 0);
    const targets = localState.hands.p1.map((value: number, index: number) => value > 0 ? index : -1).filter((index: number) => index >= 0);
    const source = sources[Math.floor(Math.random() * sources.length)];
    const target = targets[Math.floor(Math.random() * targets.length)];
    applyLocalAction('p2', { type: 'attack', source, target });
  }

  function restart(): void {
    selectedHand = null;

    if (mode === 'solo') {
      mode = 'menu';
      localState = createLocalState();
    } else {
      resetShouldExit = false;
      showResetConfirmation = true;
    }
  }

  function openHelp(): void {
    helpReturnMode = mode;
    mode = 'instructions';
  }

  function closeHelp(): void {
    mode = helpReturnMode ?? 'menu';
    helpReturnMode = null;
  }

  function confirmMultiplayerReset(): void {
    socket.emit('arcade:leave', 'chopsticks');
    showResetConfirmation = false;
    mode = 'menu';

    if (resetShouldExit) {
      location.set('minigames');
    }
  }

  function requestExit(): void {
    if (mode === 'multi') {
      resetShouldExit = true;
      showResetConfirmation = true;
      return;
    }

    location.set('minigames');
  }

  function returnToMenu(): void {
    if (mode === 'multi') {
      socket.emit('arcade:leave', 'chopsticks');
    }

    mode = 'menu';
  }

  function splitAvailable(): boolean {
    if (!state) {
      return false;
    }

    const hands = state.hands[playerId];
    return hands.includes(0) && hands.some((value: number) => value > 0 && value % 2 === 0);
  }

  function addLog(message: string): void {
    localState.log = [{ id: `${Date.now()}-${Math.random()}`, message }, ...localState.log];
  }

  function winnerName(currentState: ArcadeState): string {
    return currentState.winner
      ? currentState.players[currentState.winner]?.name ?? 'Unknown player'
      : 'Unknown player';
  }

  function returnToStory(): void {
    socket.emit(
      'arcade:story-complete',
      'chopsticks',
      (result: { ok: boolean; error?: string; waitingForPartner?: boolean }) => {
        error = result.ok ? '' : result.error ?? 'Could not return to the story.';
        waitingForStoryPartner = Boolean(result.waitingForPartner);
      }
    );
  }

  function handleResult(result: { ok: boolean; error?: string }): void {
    error = result.ok ? '' : result.error ?? 'The move failed.';
  }
</script>

<section class="chopsticks" class:hide={$location !== 'chopsticks'}>
  <header>
    <span>DEJAVU://CHOPSTICKS</span>
    <div class="header-actions">
      {#if mode === 'solo' || mode === 'multi'}<button on:click={openHelp}>HOW TO PLAY</button><button on:click={restart}>RESET</button>{/if}
      <button class="exit" on:click={requestExit}>EXIT</button>
    </div>
  </header>

  {#if showResetConfirmation}
    <div class="backdrop"><section class="reset-confirm" role="alertdialog" aria-modal="true"><h2>{resetShouldExit ? 'Exit this multiplayer game?' : 'Reset this multiplayer game?'}</h2><p>The other player will be notified that the shared session ended.</p><div><button on:click={() => showResetConfirmation = false}>CANCEL</button><button class="exit" on:click={confirmMultiplayerReset}>{resetShouldExit ? 'EXIT GAME' : 'RESET GAME'}</button></div></section></div>
  {/if}

  {#if mode === 'menu'}
    <div class="menu">
      <p>HAND-TO-HAND LOGIC DUEL</p>
      <h1>CHOPSTICKS</h1>
      <span>Transfer signals between hands. Zero both enemy channels to win.</span>
      <div><button on:click={() => openInstructions('solo')}>1P VS CPU</button><button on:click={() => openInstructions('multi')}>1P VS 2P</button></div>
    </div>
  {:else if mode === 'instructions'}
    <div class="backdrop">
      <section class="instructions">
        <button class="close" on:click={closeHelp} aria-label="Close">×</button>
        <div>
          <p>TACTICAL BRIEF</p>
          <h2>Transfer the signal</h2>
          <ul>
            <li>Both players begin with one point on each hand.</li>
            <li>Select one of your live hands, then an enemy live hand. Your points are added to theirs.</li>
            <li>A hand that reaches five or more becomes zero and is eliminated. Values never wrap around.</li>
            <li>If one hand is empty and the other contains an even value (2 or 4), you may spend your turn splitting it equally.</li>
            <li>Eliminate both opposing hands to win.</li>
          </ul>
        </div>
        <button class="primary" on:click={() => helpReturnMode ? closeHelp() : begin()}>{helpReturnMode ? 'RETURN TO GAME' : 'BEGIN DUEL'}</button>
      </section>
    </div>
  {:else if state?.status === 'waiting'}
    <div class="waiting"><h2>{state.departureNotice ? 'CONNECTION SEVERED' : 'WAITING FOR SECOND PLAYER'}</h2><p>{state.departureNotice ?? `${state.participantCount}/2 CONNECTED`}</p>{#if state.departureNotice}<button on:click={returnToMenu}>RETURN TO MAIN MENU</button>{/if}</div>
  {:else if state}
    <div class="game">
      <div class="turn"><span>TURN {state.turn}</span><strong>{state.players[state.activePlayer].name}'S MOVE</strong></div>

      <section class="player-zone opponent">
        <h2>{state.players[opponentId].name}</h2>
        <div class="hands">
          {#each state.hands[opponentId] as value, index}
            <button class:dead={value === 0} class:targetable={canAct && selectedHand !== null && value > 0} on:click={() => attack(index)}>
              <span>{index === 0 ? 'LEFT' : 'RIGHT'}</span><strong>{value}</strong><i style={`--fingers: ${value}`}></i>
            </button>
          {/each}
        </div>
      </section>

      <div class="divider">NETWORK DIVIDE</div>

      <section class="player-zone self">
        <h2>{state.players[playerId].name}</h2>
        <div class="hands">
          {#each state.hands[playerId] as value, index}
            <button class:selected={selectedHand === index} class:dead={value === 0} disabled={!canAct || value === 0} on:click={() => selectOwnHand(index)}>
              <span>{index === 0 ? 'LEFT' : 'RIGHT'}</span><strong>{value}</strong><i style={`--fingers: ${value}`}></i>
            </button>
          {/each}
        </div>
        <button class="split" disabled={!canAct || !splitAvailable()} on:click={split}>SPLIT SIGNAL</button>
      </section>

      {#if state.status === 'finished'}
        <section class:lost={state.winner !== playerId} class="result">
          <p>{state.winner === playerId ? 'VICTORY' : 'SIGNALS SEVERED'}</p>
          <h2>{winnerName(state)} WINS</h2>
          {#if waitingForStoryPartner}
            <p>Waiting for your partner to close the duel…</p>
          {:else if launchedFromStory}
            <button on:click={returnToStory}>RETURN TO STORY</button>
          {:else}
            <button on:click={restart}>PLAY AGAIN</button><button on:click={returnToMenu}>MODE MENU</button>
          {/if}
        </section>
      {/if}

      {#if error}<p class="error">{error}</p>{/if}
      <section class="log"><h3>MOVE LOG</h3>{#each state.log as entry}<p>{entry.message}</p>{/each}</section>
    </div>
  {/if}
</section>

<style lang="scss">
  .chopsticks {
    width: min(1050px, 100%);
    height: 95vh;
    overflow: hidden;
    color: #d9ffe8;
    background: #040d0a;
    border: 1px solid #55f09a;
    box-shadow: 0 0 34px #55f09a2e;

    > header {
      min-height: 42px;
      padding: 9px 14px;
      color: #55f09a;
      background: #0a1b14;
      border-bottom: 1px solid #55f09a66;

      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  }

  .header-actions {
    display: flex;
    gap: 7px;

    button {
      padding: 6px 10px;
    }
  }

  .exit {
    color: #ff91aa;
    background: #290a13;
    border-color: #b93452;
  }

  .reset-confirm {
    width: min(460px, 90vw);
    padding: 26px;
    background: #0a1b14;
    border: 1px solid #ff6688;

    > div {
      margin-top: 20px;

      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  }

  button {
    padding: 9px 13px;
    color: #bfffdc;
    background: #0b2017;
    border: 1px solid #2e8a59;
    cursor: pointer;
  }

  button:hover,
  button.selected,
  .primary {
    color: #031009;
    background: #55f09a;
    border-color: #ffffff;
  }

  button:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }

  .menu,
  .waiting {
    height: calc(100% - 42px);
    padding: 36px;

    display: grid;
    place-content: center;
    gap: 16px;
    text-align: center;

  }

  .menu h1 {
    margin: 0;
    color: #55f09a;
    font-size: clamp(3rem, 9vw, 6.5rem);
  }

  .menu > div {
    display: flex;
    justify-content: center;
    gap: 8px;
  }

  .backdrop {
    position: fixed;
    z-index: 30;
    inset: 0;
    background: #010704df;

    display: grid;
    place-items: center;
  }

  .instructions {
    position: relative;
    width: min(620px, 90vw);
    max-height: 88vh;
    overflow: hidden;
    background: #07150f;
    border: 1px solid #55f09a;

    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;

    > div {
      padding: 32px;
      overflow-y: auto;
      line-height: 1.6;
    }

    .primary {
      margin: 0 24px 24px;
    }
  }

  .close {
    position: absolute;
    z-index: 2;
    top: 10px;
    right: 10px;
  }

  .game {
    height: calc(100% - 42px);
    padding: 18px;
    overflow-y: auto;
  }

  .turn {
    display: flex;
    justify-content: space-between;
  }

  .player-zone {
    margin: 14px auto;
    text-align: center;
  }

  .hands {
    display: flex;
    justify-content: center;
    gap: 16px;

    button {
      width: 150px;
      height: 120px;

      display: grid;
      place-items: center;

      strong {
        font-size: 2.5rem;
      }

      i {
        width: calc(var(--fingers) * 18px);
        height: 8px;
        max-width: 84px;
        background: repeating-linear-gradient(90deg, #55f09a 0 11px, transparent 11px 18px);
      }
    }

    button.targetable {
      border-color: #f8e69a;
      box-shadow: 0 0 16px #f8e69a44;
    }

    button.dead {
      color: #64748b;
      background: #11161a;
      border-color: #38434b;
    }
  }

  .divider {
    color: #477a5e;
    text-align: center;
    letter-spacing: 3px;
  }

  .split {
    margin-top: 12px;
  }

  .log {
    max-width: 720px;
    max-height: 150px;
    margin: 18px auto;
    overflow-y: auto;
    background: #07150f;
    border: 1px solid #214c35;

    h3 {
      position: sticky;
      top: 0;
      margin: 0;
      padding: 10px;
      color: #55f09a;
      background: #07150f;
    }

    p {
      padding: 0 10px;
    }
  }

  .result {
    max-width: 720px;
    margin: 18px auto;
    padding: 20px;
    color: #78ff9f;
    background: #07160d;
    border: 1px solid #78ff9f;
    text-align: center;

    &.lost {
      color: #ff6b7a;
      background: #19090d;
      border-color: #ff6b7a;
    }
  }

  .error {
    color: #ff6b7a;
    text-align: center;
  }
</style>
