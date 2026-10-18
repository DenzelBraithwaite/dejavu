<script lang="ts">
  import { onDestroy } from 'svelte';
  import location from '../stores/location';
  import { arcadeStates, type ArcadeState } from '../stores/arcade';
  import { sessionState } from '../stores/session';
  import { campaignState } from '../stores/campaign';
  import { socket } from '../socket';

  const factions = [
    { id: 'purple', name: 'Purple Cougar', short: 'PC', image: '/purple_cougar.png' },
    { id: 'pink', name: 'Pink Mouse', short: 'PM', image: '/pink_mouse.png' },
    { id: 'yellow', name: 'Yellow Monkey', short: 'YM', image: '/yellow_monkey.png' },
    { id: 'cyan', name: 'Cyan Shark', short: 'CS', image: '/cyan_shark.png' },
    { id: 'blue', name: 'Blue Eagle', short: 'BE', image: '/blue_eagle.png' }
  ];
  const suits = factions.map((faction) => faction.id);
  let mode: 'menu' | 'instructions' | 'solo' | 'multi' = 'menu';
  let pendingMode: 'solo' | 'multi' = 'solo';
  let error = '';
  let actionType: 'direction' | 'suits' | 'numbers' | 'exact' = 'direction';
  let direction = 'higher';
  let selectedSuits: string[] = [];
  let selectedNumbers: number[] = [];
  let exactNumber = 0;
  let exactSuit = suits[0];
  let localState = createLocalState();
  let waitingForStoryPartner = false;

  $: serverState = $arcadeStates['lo-hi'] ?? null;
  $: state = mode === 'solo' ? localState : serverState;
  $: playerId = $sessionState.playerId ?? 'p1';
  $: canAct = state?.status === 'playing'
    && (mode === 'solo' || state.activePlayer === playerId)
    && state.players[playerId]?.state === 'active';
  $: liveFaction = factionFor(state?.currentCard?.suit);
  $: launchedFromStory = $campaignState?.activeMinigame?.id === 'lo-hi';
  $: if (launchedFromStory && mode === 'menu') {
    pendingMode = $campaignState?.sessionMode === 'singleplayer' ? 'solo' : 'multi';
    mode = 'instructions';
  }
  $: if ($location !== 'lo-hi' && mode === 'multi') {
    socket.emit('arcade:leave', 'lo-hi');
    mode = 'menu';
  }

  onDestroy(() => {
    if (mode === 'multi') {
      socket.emit('arcade:leave', 'lo-hi');
    }
  });

  function createLocalState(): ArcadeState {
    return {
      game: 'lo-hi',
      status: 'playing',
      participants: { p1: true, p2: true },
      participantCount: 2,
      players: {
        p1: { name: 'You', score: 0, state: 'active' },
        p2: { name: 'CPU', score: 0, state: 'active' }
      },
      winner: null,
      log: [],
      currentCard: randomCard(),
      activePlayer: 'p1',
      turn: 1
    };
  }

  function openInstructions(nextMode: 'solo' | 'multi'): void {
    pendingMode = nextMode;
    mode = 'instructions';
  }

  function begin(): void {
    error = '';

    if (pendingMode === 'solo') {
      localState = createLocalState();
      mode = 'solo';
      return;
    }

    mode = 'multi';
    socket.emit('arcade:join', 'lo-hi', handleResult);
  }

  function returnToMenu(): void {
    if (mode === 'multi') {
      socket.emit('arcade:leave', 'lo-hi');
    }

    mode = 'menu';
  }

  function submitAction(): void {
    let action: Record<string, unknown> = { type: actionType };

    if (actionType === 'direction') {
      action.value = direction;
    } else if (actionType === 'suits') {
      action.values = selectedSuits;
    } else if (actionType === 'numbers') {
      action.values = selectedNumbers;
    } else {
      action.number = exactNumber;
      action.suit = exactSuit;
    }

    if (mode === 'solo') {
      applyLocalAction('p1', action);
      return;
    }

    socket.emit('arcade:action', { game: 'lo-hi', action }, handleResult);
  }

  function hold(): void {
    const action = { type: 'hold' };

    if (mode === 'solo') {
      applyLocalAction('p1', action);
    } else {
      socket.emit('arcade:action', { game: 'lo-hi', action }, handleResult);
    }
  }

  function applyLocalAction(actor: 'p1' | 'p2', action: Record<string, any>): void {
    if (localState.status !== 'playing' || localState.activePlayer !== actor) {
      return;
    }

    const player = localState.players[actor];

    if (action.type === 'hold') {
      player.state = 'held';
      addLocalLog(`${player.name} holds at ${player.score}.`);
    } else {
      const nextCard = randomCard();
      const won = localBetWon(localState.currentCard, nextCard, action);
      const points = action.type === 'direction' ? 1 : action.type === 'suits' ? 3 : action.type === 'numbers' ? 10 : 100;
      localState.currentCard = nextCard;

      if (won) {
        player.score += points;
        addLocalLog(`${player.name} wins +${points}. ${cardLabel(nextCard)} is live.`);

        if (action.type === 'exact') {
          localState.winner = actor;
          localState.status = 'finished';
        }
      } else {
        player.state = 'lost';
        addLocalLog(`${player.name} misses. ${cardLabel(nextCard)} was transmitted.`);
      }
    }

    finishOrAdvanceLocal(actor);
  }

  function finishOrAdvanceLocal(actor: 'p1' | 'p2'): void {
    if (localState.status === 'finished') {
      localState = { ...localState };
      return;
    }

    const active = (['p1', 'p2'] as const).filter((id) => localState.players[id].state === 'active');

    if (!active.length) {
      const p1Score = localState.players.p1.score;
      const p2Score = localState.players.p2.score;
      localState.winner = p1Score === p2Score ? 'tie' : p1Score > p2Score ? 'p1' : 'p2';
      localState.status = 'finished';
      localState = { ...localState };
      return;
    }

    const other = actor === 'p1' ? 'p2' : 'p1';
    localState.activePlayer = localState.players[other].state === 'active' ? other : actor;
    localState.turn += 1;
    localState = { ...localState };

    if (localState.activePlayer === 'p2') {
      window.setTimeout(cpuTurn, 700);
    }
  }

  function cpuTurn(): void {
    if (localState.status !== 'playing' || localState.activePlayer !== 'p2') {
      return;
    }

    if (localState.players.p2.score >= 5 && Math.random() < 0.35) {
      applyLocalAction('p2', { type: 'hold' });
      return;
    }

    applyLocalAction('p2', {
      type: 'direction',
      value: localState.currentCard.number < 5 ? 'higher' : 'lower'
    });
  }

  function restart(): void {
    if (mode === 'solo') {
      localState = createLocalState();
    } else {
      socket.emit('arcade:restart', 'lo-hi');
    }
  }

  function returnToStory(): void {
    socket.emit(
      'arcade:story-complete',
      'lo-hi',
      (result: { ok: boolean; error?: string; waitingForPartner?: boolean }) => {
        error = result.ok ? '' : result.error ?? 'Could not return to the story.';
        waitingForStoryPartner = Boolean(result.waitingForPartner);
      }
    );
  }

  function toggleSuit(suit: string): void {
    selectedSuits = toggleLimited(selectedSuits, suit, 2);
  }

  function toggleNumber(number: number): void {
    selectedNumbers = toggleLimited(selectedNumbers, number, 3);
  }

  function toggleLimited<T>(values: T[], value: T, limit: number): T[] {
    if (values.includes(value)) {
      return values.filter((item) => item !== value);
    }

    return values.length < limit ? [...values, value] : values;
  }

  function randomCard(): { number: number; suit: string } {
    return {
      number: Math.floor(Math.random() * 11),
      suit: suits[Math.floor(Math.random() * suits.length)]
    };
  }

  function localBetWon(current: any, next: any, action: Record<string, any>): boolean {
    if (action.type === 'direction') {
      return action.value === 'higher' ? next.number > current.number : next.number < current.number;
    }

    if (action.type === 'suits') {
      return action.values.includes(next.suit);
    }

    if (action.type === 'numbers') {
      return action.values.includes(next.number);
    }

    return Number(action.number) === next.number && action.suit === next.suit;
  }

  function addLocalLog(message: string): void {
    localState.log = [{ id: `${Date.now()}-${Math.random()}`, message }, ...localState.log];
  }

  function cardLabel(card: any): string {
    return `${factionFor(card.suit).name} ${card.number}`;
  }

  function factionFor(suit: string | undefined): typeof factions[number] {
    return factions.find((faction) => faction.id === suit) ?? factions[0];
  }

  function winnerName(currentState: ArcadeState): string {
    return currentState.winner
      ? currentState.players[currentState.winner]?.name ?? 'Unknown player'
      : 'Unknown player';
  }

  function handleResult(result: { ok: boolean; error?: string }): void {
    error = result.ok ? '' : result.error ?? 'The action failed.';
  }
</script>

<section class="lohi terminal-game" class:hide={$location !== 'lo-hi'}>
  <header>
    <span>DEJAVU://LO_HI</span>
    {#if mode === 'solo' || mode === 'multi'}
      <button type="button" on:click={restart}>RESET</button>
    {/if}
  </header>

  {#if mode === 'menu'}
    <div class="menu-screen">
      <p class="eyebrow">PROBABILITY ENGINE</p>
      <h1>LO-HI</h1>
      <p>Read the live card. Push your luck. Hold before the signal turns against you.</p>
      <div class="mode-buttons">
        <button type="button" on:click={() => openInstructions('solo')}>1P VS CPU</button>
        <button type="button" on:click={() => openInstructions('multi')}>1P VS 2P</button>
      </div>
      <button class="back-link" type="button" on:click={() => location.set('minigames')}>← MINIGAMES</button>
    </div>
  {:else if mode === 'instructions'}
    <div class="modal-backdrop">
      <section class="instructions">
        <button class="close" type="button" on:click={() => mode = 'menu'} aria-label="Close instructions">×</button>
        <div class="instructions-copy">
          <p class="eyebrow">CONNECTION BRIEF</p>
          <h2>How to play Lo-Hi</h2>
          <p>Each turn, predict the next card or hold. A failed prediction eliminates you from the match. Holding keeps your points safe but ends all of your remaining turns.</p>
          <ul>
            <li><strong>Higher / lower:</strong> +1 point. An equal number loses.</li>
            <li><strong>Faction window:</strong> choose two of the five NetRunners factions for +3.</li>
            <li><strong>Number window:</strong> choose three numbers from 0–10 for +10.</li>
            <li><strong>Exact card:</strong> one number and one suit. A correct prediction wins immediately.</li>
          </ul>
          <p>When every runner has held or dropped, the highest score wins.</p>
        </div>
        <button class="primary" type="button" on:click={begin}>OPEN CONNECTION</button>
      </section>
    </div>
  {:else if state}
    <div class="game-screen">
      {#if state.status === 'waiting'}
        <div class="waiting"><h2>WAITING FOR SECOND RUNNER</h2><p>{state.participantCount}/2 CONNECTED</p></div>
      {:else}
        <div class="scoreboard">
          {#each ['p1', 'p2'] as id}
            <div class:active={state.activePlayer === id}>
              <span>{state.players[id].name}</span>
              <strong>{state.players[id].score ?? 0}</strong>
              <small>{state.players[id].state ?? 'ACTIVE'}</small>
            </div>
          {/each}
        </div>

        <div class="live-card live-card--{liveFaction.id}">
          <span class="card-corner card-corner--top">{state.currentCard.number}<small>{liveFaction.short}</small></span>
          <img src={liveFaction.image} alt={liveFaction.name}>
          <strong>{state.currentCard.number}</strong>
          <span class="faction-name">{liveFaction.name}</span>
          <span class="card-corner card-corner--bottom">{state.currentCard.number}<small>{liveFaction.short}</small></span>
        </div>

        {#if state.status === 'finished'}
          <div class:lost={state.winner !== playerId && state.winner !== 'tie'} class="result-panel">
            <p>{state.winner === 'tie' ? 'SIGNAL DEADLOCK' : state.winner === playerId ? 'VICTORY' : 'CONNECTION LOST'}</p>
            <h2>{state.winner === 'tie' ? 'TIE GAME' : `${winnerName(state)} WINS`}</h2>
            {#if waitingForStoryPartner}
              <p>Waiting for your partner to close the table…</p>
            {:else if launchedFromStory}
              <button type="button" on:click={returnToStory}>RETURN TO STORY</button>
            {:else}
              <button type="button" on:click={restart}>PLAY AGAIN</button>
              <button type="button" on:click={returnToMenu}>MODE MENU</button>
            {/if}
          </div>
        {:else if canAct}
          <div class="controls">
            <div class="action-tabs">
              <button class:active={actionType === 'direction'} on:click={() => actionType = 'direction'}>HIGH / LOW</button>
              <button class:active={actionType === 'suits'} on:click={() => actionType = 'suits'}>2 SUITS</button>
              <button class:active={actionType === 'numbers'} on:click={() => actionType = 'numbers'}>3 NUMBERS</button>
              <button class:active={actionType === 'exact'} on:click={() => actionType = 'exact'}>EXACT</button>
            </div>
            {#if actionType === 'direction'}
              <div class="choice-row"><button class:active={direction === 'higher'} on:click={() => direction = 'higher'}>HIGHER</button><button class:active={direction === 'lower'} on:click={() => direction = 'lower'}>LOWER</button></div>
            {:else if actionType === 'suits'}
              <div class="choice-row wrap">{#each factions as faction}<button class="faction-choice faction-choice--{faction.id}" class:active={selectedSuits.includes(faction.id)} on:click={() => toggleSuit(faction.id)}>{faction.name}</button>{/each}</div>
            {:else if actionType === 'numbers'}
              <div class="choice-row wrap">{#each Array(11) as _, number}<button class:active={selectedNumbers.includes(number)} on:click={() => toggleNumber(number)}>{number}</button>{/each}</div>
            {:else}
              <div class="choice-row"><select bind:value={exactNumber}>{#each Array(11) as _, number}<option value={number}>{number}</option>{/each}</select><select bind:value={exactSuit}>{#each factions as faction}<option value={faction.id}>{faction.name}</option>{/each}</select></div>
            {/if}
            <div class="commit-row"><button class="primary" type="button" on:click={submitAction}>COMMIT BET</button><button type="button" on:click={hold}>HOLD</button></div>
          </div>
        {:else}
          <p class="turn-message">{state.players[playerId]?.state === 'active' ? 'WAITING FOR RIVAL MOVE…' : 'YOU ARE SAFE. OBSERVING REMAINING SIGNALS…'}</p>
        {/if}

        <div class="game-log"><h3>TRANSMISSION LOG</h3>{#each state.log as entry}<p>{entry.message}</p>{/each}</div>
      {/if}
      {#if error}<p class="error">{error}</p>{/if}
    </div>
  {/if}
</section>

<style lang="scss">
  .terminal-game {
    width: min(1120px, 100%);
    height: 95vh;
    overflow: hidden;
    color: #d8fbff;
    background: #050b12;
    border: 1px solid #02fbfb;
    box-shadow: 0 0 34px #02fbfb25;

    > header {
      min-height: 42px;
      padding: 9px 14px;
      color: #02fbfb;
      background: #0b1720;
      border-bottom: 1px solid #02fbfb55;

      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  }

  button,
  select {
    padding: 9px 12px;
    color: #a9eef4;
    background: #081925;
    border: 1px solid #247e8d;
  }

  button {
    cursor: pointer;
  }

  button:hover,
  button.active,
  .primary {
    color: #041014;
    background: #02fbfb;
    border-color: #ffffff;
    box-shadow: 0 0 14px #02fbfb55;
  }

  .menu-screen,
  .waiting {
    height: calc(100% - 42px);
    padding: 48px;

    display: grid;
    place-content: center;
    text-align: center;
  }

  h1 {
    margin: 10px 0;
    color: #02fbfb;
    font-size: clamp(3rem, 10vw, 7rem);
  }

  .eyebrow {
    color: #ff75fd;
    letter-spacing: 2px;
  }

  .mode-buttons,
  .choice-row,
  .commit-row {
    margin-top: 18px;

    display: flex;
    justify-content: center;
    gap: 8px;
  }

  .back-link {
    margin: 18px auto 0;
    background: transparent;
    border-color: transparent;
  }

  .modal-backdrop {
    position: fixed;
    z-index: 30;
    inset: 0;
    background: #02060bd9;

    display: grid;
    place-items: center;
  }

  .instructions {
    position: relative;
    width: min(620px, 90vw);
    max-height: min(720px, 88vh);
    overflow: hidden;
    background: #08131e;
    border: 1px solid #02fbfb;

    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;

    .close {
      position: absolute;
      z-index: 2;
      top: 10px;
      right: 10px;
    }

    .primary {
      margin: 0 24px 24px;
    }
  }

  .instructions-copy {
    padding: 32px;
    overflow-y: auto;
    line-height: 1.6;
  }

  .game-screen {
    position: relative;
    height: calc(100% - 42px);
    padding: 22px;
    overflow-y: auto;
  }

  .scoreboard {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;

    div {
      padding: 12px;
      background: #07131d;
      border: 1px solid #24394a;

      display: grid;
      grid-template-columns: 1fr auto;
      gap: 3px 12px;
    }

    div.active {
      border-color: #02fbfb;
    }

    strong {
      grid-row: span 2;
      color: #f8e69a;
      font-size: 2rem;
    }
  }

  .live-card {
    --card-accent: #ff75fd;
    width: 170px;
    height: 240px;
    margin: 24px auto;
    padding: 16px;
    position: relative;
    overflow: hidden;
    background:
      linear-gradient(145deg, #102a38e8, #071019f2),
      repeating-linear-gradient(45deg, transparent 0 9px, #ffffff08 9px 10px);
    border: 2px solid var(--card-accent);
    border-radius: 8px 24px;
    box-shadow: 0 0 24px color-mix(in srgb, var(--card-accent) 38%, transparent);

    display: grid;
    place-items: center;

    img {
      width: 110px;
      height: 118px;
      object-fit: contain;
      filter: drop-shadow(0 0 10px var(--card-accent));
    }

    > strong {
      position: absolute;
      z-index: 2;
      color: #ffffff;
      font-size: 4.8rem;
      text-shadow: 0 0 12px #020617, 0 0 20px var(--card-accent);
    }
  }

  .live-card--purple {
    --card-accent: #9962ff;
  }

  .live-card--pink {
    --card-accent: #ff75fd;
  }

  .live-card--yellow {
    --card-accent: #f2d40e;
  }

  .live-card--cyan {
    --card-accent: #02fbfb;
  }

  .live-card--blue {
    --card-accent: #4a98d9;
  }

  .card-corner {
    position: absolute;
    z-index: 3;
    color: var(--card-accent);
    font-size: 1.3rem;
    font-weight: 900;
    line-height: 1;

    display: grid;

    small {
      margin-top: 3px;
      font-size: 0.58rem;
    }
  }

  .card-corner--top {
    top: 12px;
    left: 12px;
  }

  .card-corner--bottom {
    right: 12px;
    bottom: 12px;
    transform: rotate(180deg);
  }

  .faction-name {
    position: absolute;
    z-index: 3;
    bottom: 15px;
    color: var(--card-accent);
    font-size: 0.64rem;
    font-weight: 900;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .faction-choice--purple {
    color: #c9a7ff;
  }

  .faction-choice--pink {
    color: #ff9dfd;
  }

  .faction-choice--yellow {
    color: #f2d40e;
  }

  .faction-choice--cyan {
    color: #02fbfb;
  }

  .faction-choice--blue {
    color: #6dc2fb;
  }

  .controls,
  .game-log {
    max-width: 800px;
    margin: 0 auto 18px;
    padding: 14px;
    background: #071019;
    border: 1px solid #24394a;
  }

  .action-tabs {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }

  .wrap {
    flex-wrap: wrap;
  }

  .game-log {
    max-height: 180px;
    overflow-y: auto;

    h3 {
      position: sticky;
      top: -14px;
      padding: 8px 0;
      color: #02fbfb;
      background: #071019;
    }
  }

  .result-panel {
    margin: 18px auto;
    padding: 22px;
    color: #78ff9f;
    background: #07160d;
    border: 1px solid #78ff9f;
    box-shadow: 0 0 24px #78ff9f33;
    text-align: center;

    &.lost {
      color: #ff6b7a;
      background: #19090d;
      border-color: #ff6b7a;
    }
  }

  .turn-message,
  .error {
    text-align: center;
  }

  .error {
    color: #ff6b7a;
  }

  @media (max-width: 700px) {
    .action-tabs {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
