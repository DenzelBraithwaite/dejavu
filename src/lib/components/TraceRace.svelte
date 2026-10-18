<script lang="ts">
  import { onDestroy } from 'svelte';
  import { fly } from 'svelte/transition';
  import { socket } from '../socket';
  import { campaignState } from '../stores/campaign';
  import location from '../stores/location';
  import { sessionState, type PlayerId } from '../stores/session';
  import { traceRaceServerState } from '../stores/traceRaceSession';

  type Mode = 'menu' | 'singleplayer' | 'multiplayer';
  type ActionType = 'move' | 'trace' | 'ping' | 'scan' | 'scramble';

  const positions = [
    { x: 6, y: 12 }, { x: 24, y: 8 }, { x: 43, y: 15 },
    { x: 62, y: 8 }, { x: 81, y: 15 }, { x: 13, y: 37 },
    { x: 32, y: 34 }, { x: 52, y: 39 }, { x: 72, y: 34 },
    { x: 91, y: 40 }, { x: 6, y: 66 }, { x: 25, y: 61 },
    { x: 44, y: 69 }, { x: 64, y: 62 }, { x: 83, y: 68 },
    { x: 18, y: 89 }, { x: 50, y: 91 }, { x: 78, y: 90 }
  ];
  const links: [number, number][] = [
    [0, 1], [0, 5], [1, 2], [1, 5], [1, 6],
    [2, 3], [2, 6], [2, 7], [3, 4], [3, 7], [3, 8],
    [4, 8], [4, 9], [5, 6], [5, 10], [6, 7], [6, 11],
    [7, 8], [7, 12], [8, 9], [8, 13], [9, 14],
    [10, 11], [10, 15], [11, 12], [11, 15], [12, 13],
    [12, 16], [13, 14], [13, 16], [14, 17], [15, 16], [16, 17]
  ];

  let mode: Mode = 'menu';
  let joined = false;
  let selectedNode: number | null = null;
  let errorMessage = '';
  let showInstructions = false;
  let waitingForStoryPartner = false;
  let localStatus: 'playing' | 'finished' = 'playing';
  let localActivePlayer: 'player' | 'cpu' = 'player';
  let localWinner: 'player' | 'cpu' | null = null;
  let localPlayerPosition = 0;
  let localCpuPosition = 11;
  let localPlayerExposure = 0;
  let localCpuExposure = 0;
  let localTraceRange: number | null = null;
  let localTurn = 1;
  let localIntel: string[] = [];
  let cpuTimer: number | undefined;

  $: playerId = $sessionState.playerId;
  $: launchedFromStory = $campaignState?.activeMinigame?.id === 'trace-race';
  $: serverPlayer = playerId && $traceRaceServerState
    ? $traceRaceServerState.players[playerId]
    : null;
  $: displayedPosition = mode === 'singleplayer'
    ? localPlayerPosition
    : serverPlayer?.position ?? null;
  $: displayedExposure = mode === 'singleplayer'
    ? localPlayerExposure
    : serverPlayer?.exposure ?? 0;
  $: displayedTraceRange = mode === 'singleplayer'
    ? localTraceRange
    : serverPlayer?.lastTraceRange ?? null;
  $: displayedIntel = mode === 'singleplayer'
    ? localIntel
    : serverPlayer?.intel ?? [];
  $: isMyTurn = mode === 'singleplayer'
    ? localStatus === 'playing' && localActivePlayer === 'player'
    : $traceRaceServerState?.status === 'playing'
      && $traceRaceServerState.activePlayer === playerId;
  $: winner = mode === 'singleplayer'
    ? localWinner
    : $traceRaceServerState?.winner ?? null;

  $: if (launchedFromStory && mode === 'menu') {
    selectMultiplayer();
  }

  $: if ($location !== 'trace-race' && joined) {
    leaveMultiplayer(false);
  }

  onDestroy(() => {
    window.clearTimeout(cpuTimer);

    if (joined) {
      socket.emit('trace-race:leave');
    }
  });

  function startSingleplayer(): void {
    leaveMultiplayer(false);
    mode = 'singleplayer';
    resetLocalGame();
    showInstructions = true;
  }

  function selectMultiplayer(): void {
    mode = 'multiplayer';
    selectedNode = null;
    errorMessage = '';
    waitingForStoryPartner = false;
    showInstructions = true;

    if (!joined) {
      joined = true;
      socket.emit('trace-race:join');
    }
  }

  function resetLocalGame(): void {
    window.clearTimeout(cpuTimer);
    localStatus = 'playing';
    localWinner = null;
    localActivePlayer = 'player';
    [localPlayerPosition, localCpuPosition] = randomDistinctPositions();
    localPlayerExposure = 0;
    localCpuExposure = 0;
    localTraceRange = null;
    localTurn = 1;
    selectedNode = null;
    errorMessage = '';
    localIntel = [`LINK ESTABLISHED: Your signal entered at NODE ${formatNode(localPlayerPosition)}.`];
  }

  function performAction(type: ActionType): void {
    errorMessage = '';

    if (!isMyTurn) {
      return;
    }

    if ((type === 'move' || type === 'ping') && selectedNode === null) {
      errorMessage = 'Select a network node first.';
      return;
    }

    if (mode === 'multiplayer') {
      socket.emit(
        'trace-race:action',
        {
          type,
          target: selectedNode
        },
        handleActionResult
      );
      selectedNode = null;
      return;
    }

    performLocalAction(type);
  }

  function performLocalAction(type: ActionType): void {
    if (type !== 'trace') {
      localTraceRange = null;
    }

    if (type === 'move') {
      if (!neighborsOf(localPlayerPosition).includes(selectedNode as number)) {
        errorMessage = 'Choose a node directly linked to your current position.';
        return;
      }

      localPlayerPosition = selectedNode as number;
      localPlayerExposure = Math.max(0, localPlayerExposure - 1);
      addLocalIntel(`TURN ${localTurn}: Relocated to NODE ${formatNode(localPlayerPosition)}.`);
    }

    if (type === 'trace') {
      const distance = shortestDistance(localPlayerPosition, localCpuPosition);
      const range = distance + randomInteger(1, 2);
      localPlayerExposure = Math.min(9, localPlayerExposure + 2);
      localTraceRange = range;
      addLocalIntel(`TURN ${localTurn}: TRACE reports the rival is fewer than ${range} hops away. Candidate nodes highlighted; your action window remains open.`);
      return;
    }

    if (type === 'ping') {
      if (selectedNode === localCpuPosition) {
        localStatus = 'finished';
        localWinner = 'player';
        addLocalIntel(`PING LOCKED: Rival found at NODE ${formatNode(localCpuPosition)}.`);
        return;
      }

      localPlayerExposure = Math.min(9, localPlayerExposure + 3);
      addLocalIntel(`TURN ${localTurn}: NODE ${formatNode(selectedNode as number)} was empty.`);
    }

    if (type === 'scan') {
      const nearby = shortestDistance(localPlayerPosition, localCpuPosition) <= 2;
      localPlayerExposure = Math.min(9, localPlayerExposure + 1);
      addLocalIntel(nearby
        ? `TURN ${localTurn}: SCAN POSITIVE. Rival signal detected within 2 hops.`
        : `TURN ${localTurn}: SCAN CLEAR. No rival signal within 2 hops.`);
    }

    if (type === 'scramble') {
      localPlayerExposure = Math.max(0, localPlayerExposure - 3);
      addLocalIntel(`TURN ${localTurn}: Signal signature scrambled.`);
    }

    selectedNode = null;
    localActivePlayer = 'cpu';
    localTurn += 1;
    cpuTimer = window.setTimeout(runCpuTurn, 700);
  }

  function runCpuTurn(): void {
    if (localStatus !== 'playing') {
      return;
    }

    const distance = shortestDistance(localCpuPosition, localPlayerPosition);

    if ((distance <= 1 || localPlayerExposure >= 7) && Math.random() < 0.58) {
      if (Math.random() < 0.7) {
        localStatus = 'finished';
        localWinner = 'cpu';
        addLocalIntel(`PING BREACH: CPU located you at NODE ${formatNode(localPlayerPosition)}.`);
        return;
      }

      localCpuExposure = Math.min(9, localCpuExposure + 3);
      addLocalIntel('RIVAL PING MISSED: The CPU searched an empty node.');
    } else if (Math.random() < 0.42) {
      localCpuExposure = Math.min(9, localCpuExposure + 2);
      addLocalIntel('HOSTILE TRACE: The CPU sampled your signal range.');
    } else {
      const options = neighborsOf(localCpuPosition);
      localCpuPosition = options[Math.floor(Math.random() * options.length)];
      localCpuExposure = Math.max(0, localCpuExposure - 1);
      addLocalIntel('SIGNAL SHIFT: The CPU moved through the network.');
    }

    if (localCpuExposure >= 7) {
      addLocalIntel(`EXPOSURE LOCK: Rival is currently at NODE ${formatNode(localCpuPosition)}.`);
    }

    localActivePlayer = 'player';
    localTurn += 1;
  }

  function neighborsOf(node: number): number[] {
    return links.flatMap(([left, right]) => {
      if (left === node) {
        return [right];
      }

      if (right === node) {
        return [left];
      }

      return [];
    });
  }

  function shortestDistance(start: number, destination: number): number {
    const queue: Array<[number, number]> = [[start, 0]];
    const visited = new Set([start]);

    while (queue.length > 0) {
      const [node, distance] = queue.shift() as [number, number];

      if (node === destination) {
        return distance;
      }

      for (const neighbor of neighborsOf(node)) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([neighbor, distance + 1]);
        }
      }
    }

    return positions.length;
  }

  function addLocalIntel(message: string): void {
    localIntel = [...localIntel, message];
  }

  function intelClass(message: string): string {
    if (message.includes('PING LOCKED') || message.includes('EXPOSURE LOCK') || message.includes('SCAN POSITIVE')) {
      return 'success';
    }

    if (message.includes('PING BREACH') || message.includes('HOSTILE')) {
      return 'danger';
    }

    if (message.includes('TRACE') || message.includes('SCAN')) {
      return 'scan';
    }

    return 'standard';
  }

  function isTraceCandidate(node: number): boolean {
    return displayedPosition !== null
      && displayedTraceRange !== null
      && shortestDistance(displayedPosition, node) < displayedTraceRange;
  }

  function handleActionResult(result: { ok: boolean; error?: string }): void {
    if (!result.ok) {
      errorMessage = result.error ?? 'The network rejected that action.';
    }
  }

  function leaveMultiplayer(returnToLibrary = true): void {
    if (joined) {
      joined = false;
      socket.emit('trace-race:leave');
    }

    mode = 'menu';

    if (returnToLibrary) {
      location.set('minigames');
    }
  }

  function exitGame(): void {
    if (!launchedFromStory) {
      leaveMultiplayer();
      return;
    }

    socket.emit(
      'trace-race:story-complete',
      (result: { ok: boolean; error?: string; waitingForPartner?: boolean }) => {
        if (!result.ok) {
          errorMessage = result.error ?? 'Could not return to the story.';
          return;
        }

        waitingForStoryPartner = Boolean(result.waitingForPartner);
      }
    );
  }

  function cancelStoryGame(): void {
    socket.emit('trace-race:story-cancel', handleActionResult);
  }

  function requestRematch(wantsRematch: boolean): void {
    if (mode === 'singleplayer') {
      if (wantsRematch) {
        resetLocalGame();
      } else {
        location.set('minigames');
      }
      return;
    }

    socket.emit('trace-race:rematch', wantsRematch, handleActionResult);

    if (!wantsRematch) {
      leaveMultiplayer();
    }
  }

  function formatNode(node: number): string {
    return String(node + 1).padStart(2, '0');
  }

  function randomDistinctPositions(): [number, number] {
    const firstPosition = randomInteger(0, positions.length - 1);
    let secondPosition = randomInteger(0, positions.length - 1);

    while (secondPosition === firstPosition) {
      secondPosition = randomInteger(0, positions.length - 1);
    }

    return [firstPosition, secondPosition];
  }

  function randomInteger(minimum: number, maximum: number): number {
    return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      showInstructions = false;
    }
  }
</script>

<svelte:window on:keydown={handleWindowKeydown} />

<section class="trace-race" class:hide={$location !== 'trace-race'} aria-labelledby="trace-race-title">
  <header>
    <span>DEJAVU://TRACE_RACE</span>
    <div>
      <button type="button" on:click={() => showInstructions = true}>HOW TO PLAY</button>
      <button type="button" on:click={() => launchedFromStory ? cancelStoryGame() : leaveMultiplayer()}>
        EXIT
      </button>
    </div>
  </header>

  {#if showInstructions}
    <div class="instructions-backdrop">
      <section
        class="instructions"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trace-instructions-title"
      >
        <p class="eyebrow">TRACE RACE FIELD MANUAL</p>
        <h2 id="trace-instructions-title">Find them before they find you</h2>
        <p>
          You and your rival occupy hidden nodes on the same network. Your own
          node glows cyan. Each connection line you cross counts as one
          <strong>hop</strong>. Select nodes on the map, gather distance clues, and
          use <strong>Ping</strong> when you think you know the rival's exact location.
        </p>
        <dl>
          <div><dt>MOVE</dt><dd>Relocate to a directly connected node and reduce exposure by 1.</dd></div>
          <div><dt>TRACE</dt><dd>Reveal that the rival is fewer than a reported number of hops away. Highlights every possible node, adds 2 exposure, and keeps your turn open.</dd></div>
          <div><dt>PING</dt><dd>Attack the selected node. A correct Ping wins; a miss adds 3 exposure.</dd></div>
          <div><dt>SCAN</dt><dd>Detect whether the rival is anywhere within 2 hops. Adds 1 exposure and ends your turn.</dd></div>
          <div><dt>SCRAMBLE</dt><dd>Spend your turn reducing exposure by 3.</dd></div>
        </dl>
        <p class="instruction-tip">
          A yellow node after Trace is a possible rival location. Trace gives an
          intentionally broad “fewer than” range rather than an exact distance.
          At 7 exposure,
          your opponent receives your exact current node. Movement only works
          along the glowing connection lines.
        </p>
        <button type="button" on:click={() => showInstructions = false}>BEGIN TRACE</button>
      </section>
    </div>
  {/if}

  {#if mode === 'menu'}
    <div class="menu-screen">
      <p class="eyebrow">STEALTH PURSUIT PROTOCOL</p>
      <h1 id="trace-race-title">TRACE<span>RACE</span></h1>
      <p>
        Move unseen, read the signal echoes, and identify the rival node before
        your own position burns through the grid.
      </p>
      <div class="mode-grid">
        <button type="button" on:click={startSingleplayer}>
          <strong>1P VS CPU</strong>
          <span>Practice against an adaptive trace daemon</span>
        </button>
        <button type="button" on:click={selectMultiplayer} disabled={!$sessionState.bothPlayersConnected}>
          <strong>1P VS 2P</strong>
          <span>{$sessionState.bothPlayersConnected ? 'Challenge the connected player' : 'Requires a second connected player'}</span>
        </button>
      </div>
    </div>
  {:else if mode === 'multiplayer' && $traceRaceServerState?.status === 'waiting'}
    <div class="waiting-screen">
      <div class="radar-ring"></div>
      <p class="eyebrow">AWAITING SECOND SIGNAL</p>
      <h1>{$traceRaceServerState.participantCount}/2</h1>
      <p>Keep this terminal open while the other player enters Trace Race.</p>
    </div>
  {:else}
    <div class="game-layout">
      {#key mode === 'singleplayer' ? localTurn : $traceRaceServerState?.turn}
        <div class="turn-banner" class:turn-banner--mine={isMyTurn}>
          <strong>{isMyTurn ? 'YOUR MOVE' : 'RIVAL MOVING'}</strong>
          <span>Turn {mode === 'singleplayer' ? localTurn : $traceRaceServerState?.turn}</span>
        </div>
      {/key}

      <div class="network-panel">
        <div class="game-heading">
          <div>
            <p class="eyebrow">NETWORK MAP · TURN {mode === 'singleplayer' ? localTurn : $traceRaceServerState?.turn}</p>
            <h1 id="trace-race-title">TRACE<span>RACE</span></h1>
          </div>
          <div class="exposure">
            <span>EXPOSURE</span>
            <strong>{displayedExposure}/9</strong>
          </div>
        </div>

        <div class="network-grid" aria-label="Trace Race network map">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {#each links as link}
              <line
                x1={positions[link[0]].x}
                y1={positions[link[0]].y}
                x2={positions[link[1]].x}
                y2={positions[link[1]].y}
              />
            {/each}
          </svg>

          {#each positions as position, index}
            <button
              class="network-node"
              class:network-node--current={displayedPosition === index}
              class:network-node--selected={selectedNode === index}
              class:network-node--candidate={isTraceCandidate(index)}
              class:network-node--enemy={(mode === 'singleplayer' && localStatus === 'finished' && localCpuPosition === index)
                || (mode === 'multiplayer' && $traceRaceServerState?.status === 'finished'
                  && playerId
                  && $traceRaceServerState.players[playerId === 'p1' ? 'p2' : 'p1'].position === index)}
              style={`left: ${position.x}%; top: ${position.y}%;`}
              type="button"
              aria-label={`Select network node ${formatNode(index)}`}
              on:click={() => selectedNode = index}
            >
              {formatNode(index)}
            </button>
          {/each}
        </div>
      </div>

      <aside>
        {#if (mode === 'singleplayer' && localStatus === 'finished')
          || (mode === 'multiplayer' && $traceRaceServerState?.status === 'finished')}
          <div class="result-card">
            <p class="eyebrow">TRACE CLOSED</p>
            <h2>{winner === 'player' || winner === playerId ? 'TARGET ACQUIRED' : 'SIGNAL COMPROMISED'}</h2>
            <p>{winner === 'player' || winner === playerId ? 'You found the rival signal first.' : 'The rival locked onto your position.'}</p>

            {#if waitingForStoryPartner}
              <p class="waiting-copy">Waiting for your partner to close the simulation…</p>
            {:else if launchedFromStory}
              <button type="button" on:click={exitGame}>RETURN TO STORY</button>
            {:else}
              <button type="button" on:click={() => requestRematch(true)}>REMATCH</button>
              <button class="secondary" type="button" on:click={() => requestRematch(false)}>LIBRARY</button>
            {/if}
          </div>
        {:else}
          <div class="action-card">
            <p class="turn-status">{isMyTurn ? 'YOUR WINDOW' : 'RIVAL WINDOW'}</p>
            <p class="selection">Selected: {selectedNode === null ? 'NONE' : `NODE ${formatNode(selectedNode)}`}</p>
            <div class="action-grid">
              <button type="button" disabled={!isMyTurn} on:click={() => performAction('move')}>MOVE</button>
              <button type="button" disabled={!isMyTurn} on:click={() => performAction('trace')}>TRACE</button>
              <button type="button" disabled={!isMyTurn} on:click={() => performAction('ping')}>PING</button>
              <button type="button" disabled={!isMyTurn} on:click={() => performAction('scan')}>SCAN</button>
              <button type="button" disabled={!isMyTurn} on:click={() => performAction('scramble')}>SCRAMBLE</button>
            </div>
            <p class="hint">Each line is one hop. Trace highlights a broad set of possible nodes and keeps your turn open. Ping a selected node to attempt the winning lock.</p>
          </div>
        {/if}

        {#if errorMessage}
          <p class="error" role="alert">{errorMessage}</p>
        {/if}

        <div class="intel-feed" aria-live="polite">
          <p class="eyebrow">INTEL FEED</p>
          {#each [...displayedIntel].reverse() as message, index (`${displayedIntel.length - index - 1}-${message}`)}
            <p
              class="intel-entry intel-entry--{intelClass(message)}"
              in:fly={{ y: -14, duration: 280 }}
            >&gt; {message}</p>
          {/each}
        </div>
      </aside>
    </div>
  {/if}
</section>

<style lang="scss">
  .trace-race {
    width: 100%;
    height: 95vh;
    overflow: hidden;
    color: #dafcff;
    background:
      radial-gradient(circle at 30% 30%, #00e5ff18, transparent 32%),
      #02090d;
    border: 1px solid #00d7eb;
    border-radius: 8px;
    box-shadow: 0 0 36px #00d7eb2f;

    > header {
      min-height: 42px;
      padding: 9px 14px;
      color: #7ef9ff;
      background: #06161c;
      border-bottom: 1px solid #167c88;
      font-size: 0.72rem;
      letter-spacing: 2px;

      display: flex;
      justify-content: space-between;
      align-items: center;

      button {
        padding: 6px 12px;
        color: #ff9cbd;
        background: transparent;
        border: 1px solid #9f395d;
        cursor: pointer;
      }

      > div {
        display: flex;
        gap: 8px;
      }
    }
  }

  .instructions-backdrop {
    position: fixed;
    z-index: 100;
    inset: 0;
    padding: 24px;
    background: #01070bea;

    display: grid;
    place-items: center;
  }

  .instructions {
    width: min(680px, 100%);
    max-height: 90vh;
    padding: clamp(24px, 5vw, 42px);
    overflow-y: auto;
    color: #dafcff;
    background: #061219;
    border: 1px solid #00d7eb;
    box-shadow: 0 0 42px #00d7eb44;

    h2 {
      margin: 10px 0 14px;
      color: #ffffff;
      font-size: clamp(1.35rem, 4vw, 2rem);
    }

    > p:not(.eyebrow) {
      color: #a6c4cb;
      line-height: 1.65;
    }

    strong,
    dt {
      color: #7ef9ff;
    }

    dl {
      margin: 22px 0;

      display: grid;
      gap: 9px;
    }

    dl div {
      padding: 12px;
      background: #091b22;
      border-left: 3px solid #00d7eb;

      display: grid;
      grid-template-columns: 100px 1fr;
      gap: 12px;
    }

    dt {
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-weight: 800;
    }

    dd {
      margin: 0;
      color: #a6c4cb;
      line-height: 1.45;
    }

    > button {
      width: 100%;
      min-height: 46px;
      margin-top: 8px;
      color: #02090d;
      background: #00d7eb;
      border: 1px solid #bffaff;
      font-weight: 800;
      cursor: pointer;
    }
  }

  .instruction-tip {
    padding: 12px;
    color: #f8e69a !important;
    background: #28220b;
    border: 1px solid #ad781c;
  }

  .menu-screen,
  .waiting-screen {
    height: calc(100% - 42px);
    padding: clamp(28px, 6vw, 80px);

    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;

    > p:not(.eyebrow) {
      max-width: 62ch;
      color: #91aeb5;
      line-height: 1.6;
    }
  }

  h1,
  h2,
  button,
  .eyebrow {
    font-family: "Orbitron", "Space Mono", sans-serif;
  }

  h1 {
    margin: 8px 0 18px;
    font-size: clamp(2.2rem, 7vw, 5rem);
    letter-spacing: 4px;

    span {
      color: #ff4e9b;
    }
  }

  .eyebrow {
    margin: 0;
    color: #00d7eb;
    font-size: 0.68rem;
    letter-spacing: 2px;
  }

  .mode-grid {
    width: min(720px, 100%);
    margin-top: 34px;

    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;

    button {
      min-height: 120px;
      padding: 20px;
      color: #dafcff;
      background: #06161c;
      border: 1px solid #167c88;
      cursor: pointer;

      display: grid;
      gap: 9px;

      &:hover:not(:disabled),
      &:focus-visible {
        color: #02090d;
        background: #00d7eb;
        outline: 2px solid #ffffff;
      }

      &:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      span {
        font-family: "Space Mono", monospace;
        font-size: 0.75rem;
      }
    }
  }

  .radar-ring {
    width: 120px;
    height: 120px;
    margin-bottom: 24px;
    border: 2px solid #00d7eb;
    border-radius: 50%;
    box-shadow: 0 0 25px #00d7eb77, inset 0 0 25px #00d7eb44;
    animation: pulse 1.6s ease-in-out infinite;
  }

  .game-layout {
    position: relative;
    height: calc(100% - 42px);
    padding: 22px;
    overflow-y: auto;

    display: grid;
    grid-template-columns: minmax(480px, 1.6fr) minmax(280px, 0.8fr);
    gap: 18px;
  }

  .turn-banner {
    position: absolute;
    z-index: 10;
    top: 14px;
    left: 50%;
    padding: 9px 18px;
    color: #ffb7d5;
    background: #2a0b1b;
    border: 1px solid #ff4e9b;
    box-shadow: 0 0 22px #ff4e9b55;
    transform: translateX(-50%);
    animation: turn-arrival 0.55s ease-out;

    display: flex;
    align-items: center;
    gap: 12px;

    strong {
      font-family: "Orbitron", "Space Mono", sans-serif;
      letter-spacing: 1px;
    }

    span {
      color: #c991aa;
      font-size: 0.66rem;
    }

    &--mine {
      color: #02090d;
      background: #00d7eb;
      border-color: #bffaff;
      box-shadow: 0 0 22px #00d7eb88;

      span {
        color: #164851;
      }
    }
  }

  .network-panel,
  aside > div {
    background: #061219d9;
    border: 1px solid #145b65;
  }

  .network-panel {
    min-height: 620px;
    padding: 20px;
  }

  .game-heading {
    display: flex;
    justify-content: space-between;
    align-items: start;

    h1 {
      margin: 5px 0 10px;
      font-size: clamp(1.8rem, 4vw, 3rem);
    }
  }

  .exposure {
    padding: 10px 14px;
    color: #ff83b9;
    border: 1px solid #9f395d;
    text-align: right;

    display: grid;
    gap: 4px;

    span {
      font-size: 0.62rem;
      letter-spacing: 1px;
    }
  }

  .network-grid {
    position: relative;
    width: 100%;
    height: calc(100% - 88px);
    min-height: 480px;
    background:
      linear-gradient(#00d7eb0b 1px, transparent 1px),
      linear-gradient(90deg, #00d7eb0b 1px, transparent 1px);
    background-size: 28px 28px;

    svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;

      line {
        stroke: #167c88;
        stroke-width: 0.35;
        stroke-dasharray: 1.5 1;
      }
    }
  }

  .network-node {
    position: absolute;
    z-index: 2;
    width: 48px;
    height: 48px;
    color: #7ef9ff;
    background: #06161c;
    border: 2px solid #167c88;
    border-radius: 50%;
    box-shadow: 0 0 12px #00d7eb44;
    cursor: pointer;
    transform: translate(-50%, -50%);

    &:hover,
    &:focus-visible,
    &--selected {
      color: #02090d;
      background: #f2d40e;
      border-color: #fff39a;
      outline: none;
    }

    &--current {
      color: #02090d;
      background: #00d7eb;
      border-color: #d9fdff;
      box-shadow: 0 0 24px #00d7eb;
    }

    &--candidate:not(.network-node--current) {
      color: #211b00;
      background: #f2d40e;
      border-color: #fff3a1;
      box-shadow: 0 0 22px #f2d40eaa;
      animation: candidate-pulse 1.1s ease-in-out infinite;
    }

    &--candidate.network-node--current {
      outline: 4px solid #f2d40e;
      outline-offset: 4px;
    }

    &--enemy {
      color: #ffffff;
      background: #ff4e9b;
      border-color: #ffc4df;
      box-shadow: 0 0 24px #ff4e9b;
    }
  }

  aside {
    min-width: 0;

    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .action-card,
  .result-card,
  .intel-feed {
    padding: 18px;
  }

  .turn-status {
    margin: 0 0 8px;
    color: #f2d40e;
    font-weight: 800;
    letter-spacing: 2px;
  }

  .selection,
  .hint {
    color: #91aeb5;
    font-size: 0.75rem;
    line-height: 1.5;
  }

  .action-grid {
    margin: 18px 0;

    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .action-card button,
  .result-card button {
    min-height: 42px;
    color: #dafcff;
    background: #0b2d36;
    border: 1px solid #00d7eb;
    cursor: pointer;

    &:hover:not(:disabled),
    &:focus-visible {
      color: #02090d;
      background: #00d7eb;
    }

    &:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }
  }

  .result-card {
    h2 {
      margin: 10px 0;
      color: #ff83b9;
    }

    > p:not(.eyebrow) {
      color: #91aeb5;
      line-height: 1.5;
    }

    button {
      width: 100%;
      margin-top: 8px;
    }

    .secondary {
      color: #91aeb5;
      background: transparent;
      border-color: #355861;
    }
  }

  .intel-feed {
    flex: 1;
    overflow-y: auto;

    p:not(.eyebrow) {
      padding: 9px 0;
      color: #a6c4cb;
      border-bottom: 1px solid #12333a;
      font-size: 0.75rem;
      line-height: 1.45;
    }
  }

  .intel-entry--scan {
    color: #7ef9ff !important;
  }

  .intel-entry--success {
    color: #a7f3cf !important;
    border-left: 2px solid #53e6a1;
    padding-left: 9px !important;
  }

  .intel-entry--danger {
    color: #ff9fc7 !important;
    border-left: 2px solid #ff4e9b;
    padding-left: 9px !important;
  }

  .error {
    padding: 10px;
    color: #ffd0dc;
    background: #3a1020;
    border: 1px solid #ff4e9b;
    font-size: 0.75rem;
  }

  .waiting-copy {
    color: #f2d40e !important;
  }

  @keyframes pulse {
    50% {
      opacity: 0.4;
      transform: scale(0.88);
    }
  }

  @keyframes turn-arrival {
    from {
      opacity: 0;
      transform: translate(-50%, -14px) scale(0.94);
    }
  }

  @keyframes candidate-pulse {
    50% {
      box-shadow: 0 0 34px #f2d40e;
      transform: translate(-50%, -50%) scale(1.08);
    }
  }

  @media (max-width: 980px) {
    .game-layout {
      grid-template-columns: 1fr;
    }

    .network-panel {
      min-height: 560px;
    }
  }

  @media (max-width: 640px) {
    .mode-grid {
      grid-template-columns: 1fr;
    }

    .game-layout {
      padding: 12px;
    }

    .network-panel {
      min-height: 500px;
      padding: 12px;
    }

    .network-grid {
      min-height: 400px;
    }

    .network-node {
      width: 40px;
      height: 40px;
    }
  }
</style>
