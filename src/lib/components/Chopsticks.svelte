<script lang="ts">
  import { onDestroy } from 'svelte';
  import location from '../stores/location';
  import { arcadeStates, type ArcadeState } from '../stores/arcade';
  import { sessionState, type PlayerId } from '../stores/session';
  import { campaignState } from '../stores/campaign';
  import { socket } from '../socket';
  import { setMinigameSessionActive } from '../stores/minigameSessions';
  import { netRunnersGameState } from '../stores/netRunnersGameState';
  import { settleWager } from '../game/wager';
  import WagerPanel from './WagerPanel.svelte';

  type Mode = 'menu' | 'instructions' | 'solo' | 'multi';

  let mode: Mode = 'menu';
  let pendingMode: 'solo' | 'multi' = 'solo';
  let selectedHand: number | null = null;
  let redistributionPattern: 'halves' | 'four-ones' | null = null;
  let error = '';
  let localState = createLocalState();
  let waitingForStoryPartner = false;
  let helpReturnMode: Mode | null = null;
  let showResetConfirmation = false;
  let resetShouldExit = false;
  let showWager = false;
  let wager = 0;
  let wagerSettled = false;
  let wagerArmed = false;

  $: serverState = $arcadeStates.chopsticks ?? null;
  $: state = mode === 'solo' ? localState : serverState;
  $: networkPlayerId = ($sessionState.playerId ?? 'p1') as PlayerId;
  $: playerId = (mode === 'solo' ? 'p1' : networkPlayerId) as PlayerId;
  $: opponentId = playerId === 'p1' ? 'p2' : 'p1';
  $: redistributionsRemaining = state?.redistributionsRemaining ?? { p1: 3, p2: 3 };
  $: playerRedistributionsRemaining = redistributionsRemaining[playerId] ?? 3;
  $: canAct = state?.status === 'playing'
    && (mode === 'solo' ? state.activePlayer === 'p1' : state.activePlayer === playerId);
  $: playerHands = state?.hands[playerId] ?? [];
  $: canRedistribute = selectedHand !== null
    && playerRedistributionsRemaining > 0
    && playerHands.includes(0)
    && [2, 4].includes(playerHands[selectedHand]);
  $: canRedistributeFourWays = selectedHand !== null
    && playerHands[selectedHand] === 4
    && playerHands.filter((value: number) => value > 0).length === 1
    && playerHands.filter((value: number) => value === 0).length === 3;
  $: launchedFromStory = $campaignState?.activeMinigame?.id === 'chopsticks';
  $: setMinigameSessionActive(
    'chopsticks',
    (mode === 'solo' || mode === 'multi') && !state?.departureNotice
  );
  $: if ((mode === 'solo' || mode === 'multi') && state?.status === 'playing') {
    wagerArmed = true;
  }
  $: if (state?.status === 'finished' && wagerArmed && !wagerSettled) {
    settleWager(wager, state.winner === playerId ? 'win' : 'loss');
    wagerSettled = true;
    wagerArmed = false;
  }
  $: if (launchedFromStory && mode === 'menu') {
    pendingMode = $campaignState?.sessionMode === 'singleplayer' ? 'solo' : 'multi';
    mode = 'instructions';
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
      hands: { p1: [1, 1, 0, 0], p2: [1, 1, 0, 0] },
      redistributionsRemaining: { p1: 3, p2: 3 },
      activePlayer: 'p1',
      turn: 1
    };
  }

  function openInstructions(nextMode: 'solo' | 'multi'): void {
    pendingMode = nextMode;
    mode = 'instructions';
  }

  function begin(): void {
    if (helpReturnMode) {
      closeHelp();
      return;
    }

    mode = 'menu';
    showWager = true;
  }

  function confirmWager(event: CustomEvent<number>): void {
    wager = event.detail;
    wagerSettled = false;
    wagerArmed = false;
    showWager = false;
    selectedHand = null;
    redistributionPattern = null;
    error = '';

    if (pendingMode === 'solo') {
      localState = createLocalState();
      mode = 'solo';
    } else {
      mode = 'multi';
      socket.emit('arcade:join', 'chopsticks', 'versus', handleResult);
    }
  }

  function selectOwnSlot(index: number): void {
    if (!state || !canAct) {
      return;
    }

    if (state.hands[playerId][index] === 0) {
      completeRedistribution(index);
      return;
    }

    selectedHand = selectedHand === index ? null : index;
    redistributionPattern = null;
  }

  function attack(target: number): void {
    if (!state || !canAct || selectedHand === null || state.hands[opponentId][target] === 0) {
      return;
    }

    sendAction({ type: 'attack', source: selectedHand, target });
    selectedHand = null;
    redistributionPattern = null;
  }

  function prepareRedistribution(pattern: 'halves' | 'four-ones'): void {
    if (selectedHand === null) {
      error = 'Select a 2GB or 4GB RAM stick before redistributing.';
      return;
    }

    redistributionPattern = redistributionPattern === pattern ? null : pattern;
    error = '';
  }

  function completeRedistribution(target: number): void {
    if (selectedHand === null || redistributionPattern === null) {
      return;
    }

    sendAction({
      type: 'redistribute',
      source: selectedHand,
      target,
      pattern: redistributionPattern
    });
    selectedHand = null;
    redistributionPattern = null;
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

    if (action.type === 'redistribute') {
      const hands = localState.hands[actor];
      const remaining = localState.redistributionsRemaining[actor];
      const source = Number(action.source);
      const target = Number(action.target);
      const sourceValue = hands[source];
      const emptySlots = hands
        .map((value: number, index: number) => value === 0 ? index : -1)
        .filter((index: number) => index >= 0);

      if (remaining <= 0) {
        error = 'No redistributions remain. Use your RAM sticks to attack.';
        return;
      }

      if (![2, 4].includes(sourceValue) || !emptySlots.includes(target)) {
        error = 'Redistribution requires a 2GB or 4GB live stick and an empty RAM slot.';
        return;
      }

      if (sourceValue === 4 && action.pattern === 'four-ones') {
        if (hands.filter((value: number) => value > 0).length !== 1 || emptySlots.length !== 3) {
          error = 'Four-way redistribution requires one live 4GB stick and three empty slots.';
          return;
        }

        localState.hands[actor] = [1, 1, 1, 1];
        addLog(`${localState.players[actor].name} redistributed 4GB across four 1GB sticks.`);
      } else {
        const nextValue = sourceValue / 2;
        hands[source] = nextValue;
        hands[target] = nextValue;
        addLog(`${localState.players[actor].name} redistributed ${sourceValue}GB into two ${nextValue}GB sticks.`);
      }

      localState.redistributionsRemaining[actor] -= 1;
      addLog(
        `${localState.players[actor].name} has ${localState.redistributionsRemaining[actor]}/3 redistributions remaining.`
      );
    } else {
      const source = Number(action.source);
      const target = Number(action.target);
      const nextValue = localState.hands[targetPlayer][target] + localState.hands[actor][source];
      localState.hands[targetPlayer][target] = nextValue >= 5 ? 0 : nextValue;
      addLog(`${localState.players[actor].name} overclocked RAM-${target + 1} by ${localState.hands[actor][source]}GB.`);
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
    const redistributable = hands
      .map((value: number, index: number) => [value, index])
      .filter(([value]: number[]) => value === 2 || value === 4);

    if (localState.redistributionsRemaining.p2 > 0
      && hands.includes(0)
      && redistributable.length > 0
      && Math.random() < 0.35) {
      const [value, source] = redistributable[Math.floor(Math.random() * redistributable.length)];
      const fourOnes = value === 4
        && hands.filter((candidate: number) => candidate > 0).length === 1
        && Math.random() < 0.5;
      applyLocalAction('p2', {
        type: 'redistribute',
        source,
        target: hands.findIndex((candidate: number) => candidate === 0),
        pattern: fourOnes ? 'four-ones' : 'halves'
      });
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
    redistributionPattern = null;

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
    <span>DEJAVU://OVERCLOCK</span>
    <div class="header-actions">
      {#if mode === 'solo' || mode === 'multi'}<button on:click={openHelp}>HOW TO PLAY</button><button on:click={restart}>RESET</button>{/if}
      <button class="exit" on:click={requestExit}>EXIT</button>
    </div>
  </header>

  {#if showResetConfirmation}
    <div class="backdrop"><section class="reset-confirm" role="alertdialog" aria-modal="true"><h2>{resetShouldExit ? 'Exit this multiplayer game?' : 'Reset this multiplayer game?'}</h2><p>The other player will be notified that the shared session ended.</p><div><button on:click={() => showResetConfirmation = false}>CANCEL</button><button class="exit" on:click={confirmMultiplayerReset}>{resetShouldExit ? 'EXIT GAME' : 'RESET GAME'}</button></div></section></div>
  {/if}

  {#if showWager}
    <div class="backdrop">
      <WagerPanel
        bind:wager
        balance={$netRunnersGameState.p1.money}
        accent="#55f09a"
        title="FUND THE OVERCLOCK"
        actionLabel="LOCK WAGER & BOOT"
        on:confirm={confirmWager}
        on:cancel={() => { showWager = false; mode = 'menu'; }}
      />
    </div>
  {/if}

  {#if mode === 'menu'}
    <div class="menu">
      <p>MEMORY PRESSURE DUEL</p>
      <h1>OVERCLOCK</h1>
      <span>Push hostile RAM to 5GB and burn every active stick.</span>
      <div><button on:click={() => openInstructions('solo')}>1P VS CPU</button><button on:click={() => openInstructions('multi')}>1P VS 2P</button></div>
    </div>
  {:else if mode === 'instructions'}
    <div class="backdrop">
      <section class="instructions">
        <button class="close" on:click={closeHelp} aria-label="Close">×</button>
        <div>
          <p>TACTICAL BRIEF</p>
          <h2>Overload the rival rig</h2>
          <ul>
            <li>Both rigs begin with two active 1GB RAM sticks and two empty slots.</li>
            <li>Select one of your live sticks, then an enemy live stick. Your GB value is added to theirs.</li>
            <li>A stick that reaches 5GB or more overloads and becomes an empty 0GB slot. Values never wrap around.</li>
            <li>Select a 2GB stick and choose <strong>REDISTRIBUTE 1+1</strong> to divide it across itself and the first empty slot.</li>
            <li>Select a 4GB stick and choose <strong>REDISTRIBUTE 2+2</strong>. It uses the first empty slot.</li>
            <li>If a 4GB stick is your only live stick, all three other slots are empty, and you may instead choose <strong>REDISTRIBUTE 1+1+1+1</strong>.</li>
            <li>Each player may redistribute only <strong>three times per match</strong>, regardless of the pattern used.</li>
            <li>Redistribution consumes the turn. Overload every opposing RAM stick to win.</li>
          </ul>
        </div>
        <button class="primary" on:click={() => helpReturnMode ? closeHelp() : begin()}>{helpReturnMode ? 'RETURN TO GAME' : 'BEGIN DUEL'}</button>
      </section>
    </div>
  {:else if state?.status === 'waiting'}
    <div class="waiting"><h2>{state.departureNotice ? 'CONNECTION SEVERED' : 'WAITING FOR SECOND PLAYER'}</h2><p>{state.departureNotice ?? `${state.participantCount}/2 CONNECTED`}</p>{#if state.departureNotice}<button on:click={returnToMenu}>RETURN TO MAIN MENU</button>{/if}</div>
  {:else if state}
    <div class="game">
      <div class="turn">
        <span>TURN {state.turn}</span>
        <strong>
          {state.activePlayer === playerId
            ? 'YOUR MOVE'
            : `${state.players[state.activePlayer].name}'S MOVE`}
        </strong>
      </div>

      <section class="player-zone opponent">
        <div class="zone-heading">
          <h2>{state.players[opponentId].name}</h2>
          <span class:exhausted={redistributionsRemaining[opponentId] === 0}>
            REDISTRIBUTIONS {redistributionsRemaining[opponentId]}/3
          </span>
        </div>
        <div class="hands">
          {#each state.hands[opponentId] as value, index}
            <button class:dead={value === 0} class:targetable={canAct && selectedHand !== null && value > 0} on:click={() => attack(index)}>
              <span>RAM-{index + 1}</span><strong>{value}<small>GB</small></strong><i></i>
            </button>
          {/each}
        </div>
      </section>

      <div class="divider">MEMORY BUS</div>

      <section class="player-zone self">
        <div class="zone-heading">
          <h2>{state.players[playerId].name}</h2>
          <span class:exhausted={playerRedistributionsRemaining === 0}>
            REDISTRIBUTIONS {playerRedistributionsRemaining}/3
          </span>
        </div>
        <div class="hands">
          {#each state.hands[playerId] as value, index}
            <button
              class:selected={selectedHand === index}
              class:dead={value === 0}
              class:redistribution-target={value === 0 && redistributionPattern !== null}
              disabled={!canAct || (value === 0 && redistributionPattern === null)}
              on:click={() => selectOwnSlot(index)}
            >
              <span>RAM-{index + 1}</span><strong>{value}<small>GB</small></strong><i></i>
            </button>
          {/each}
        </div>
        {#if canRedistribute}
          <div class="redistribute-controls">
            <button
              class:active={redistributionPattern === 'halves'}
              on:click={() => prepareRedistribution('halves')}
            >
              {selectedHand !== null && state.hands[playerId][selectedHand] === 4
                ? 'REDISTRIBUTE 2+2'
                : 'REDISTRIBUTE 1+1'}
            </button>
            {#if canRedistributeFourWays}
              <button
                class:active={redistributionPattern === 'four-ones'}
                on:click={() => prepareRedistribution('four-ones')}
              >REDISTRIBUTE 1+1+1+1</button>
            {/if}
          </div>
          {#if redistributionPattern}
            <p class="redistribution-hint">Select a highlighted 0GB slot to complete the redistribution.</p>
          {/if}
        {:else if playerRedistributionsRemaining === 0}
          <p class="redistribution-exhausted">REDISTRIBUTION LIMIT REACHED · ATTACKS ONLY</p>
        {/if}
      </section>

      {#if state.status === 'finished'}
        <section class:lost={state.winner !== playerId} class="result">
          <p>{state.winner === playerId ? 'VICTORY' : 'MEMORY FAILURE'}</p>
          <h2>{winnerName(state)} WINS</h2>
          {#if waitingForStoryPartner}
            <p>Waiting for your partner to close the duel…</p>
          {:else if launchedFromStory}
            <button on:click={returnToStory}>RETURN TO STORY</button>
          {:else}
            <button on:click={restart}>PLAY AGAIN</button><button on:click={returnToMenu}>MAIN MENU</button>
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

  .zone-heading {
    max-width: 648px;
    margin: 0 auto 10px;

    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;

    h2 {
      margin: 0;
    }

    span {
      padding: 6px 9px;
      color: #f8e69a;
      background: #211b08;
      border: 1px solid #ad781c;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.68rem;
      letter-spacing: 1px;

      &.exhausted {
        color: #ff91aa;
        background: #290a13;
        border-color: #b93452;
      }
    }
  }

  .hands {
    display: grid;
    grid-template-columns: repeat(4, minmax(105px, 150px));
    justify-content: center;
    gap: 16px;

    button {
      width: 100%;
      height: 120px;
      clip-path: polygon(0 0, 88% 0, 100% 14%, 100% 86%, 88% 100%, 0 100%);

      display: grid;
      place-items: center;

      strong {
        font-size: 2.5rem;

        small {
          margin-left: 3px;
          font-size: 0.7rem;
        }
      }

      i {
        width: 76%;
        height: 12px;
        border: 1px solid currentColor;
        box-shadow: inset 0 0 10px currentColor;
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

  .opponent .hands button:not(.dead) {
    color: #ff8396;
    background: #26090f;
    border-color: #df3e56;
    box-shadow: inset 0 0 18px #df3e5626;
  }

  .self .hands button:not(.dead) {
    color: #8affb8;
    background: #071c11;
    border-color: #55f09a;
    box-shadow: inset 0 0 18px #55f09a26;
  }

  .self .hands button.selected:not(.dead) {
    color: #06130b;
    background: #f8e69a;
    border-color: #ffffff;
    box-shadow: 0 0 24px #f8e69a88, inset 0 0 16px #ffffff66;
    transform: translateY(-3px);
  }

  .self .hands button.redistribution-target {
    color: #f8e69a;
    background: #211b08;
    border-color: #f8e69a;
    box-shadow: 0 0 18px #f8e69a66, inset 0 0 12px #f8e69a22;
  }

  .divider {
    color: #477a5e;
    text-align: center;
    letter-spacing: 3px;
  }

  .redistribute-controls {
    margin-top: 12px;

    display: flex;
    justify-content: center;
    gap: 8px;

    button.active {
      color: #06130b;
      background: #f8e69a;
      border-color: #ffffff;
      box-shadow: 0 0 18px #f8e69a66;
    }
  }

  .redistribution-hint {
    margin: 10px 0 0;
    color: #f8e69a;
    text-align: center;
  }

  .redistribution-exhausted {
    width: fit-content;
    margin: 12px auto 0;
    padding: 7px 10px;
    color: #ff91aa;
    background: #290a13;
    border: 1px solid #b93452;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: 0.7rem;
    letter-spacing: 1px;
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

  @media (max-width: 680px) {
    .hands {
      grid-template-columns: repeat(2, minmax(105px, 150px));
    }
  }
</style>
