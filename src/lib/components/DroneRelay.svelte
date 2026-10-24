<script lang="ts">
  import { onDestroy } from 'svelte';
  import location from '../stores/location';
  import { arcadeStates } from '../stores/arcade';
  import { campaignState } from '../stores/campaign';
  import { sessionState, type PlayerId } from '../stores/session';
  import { setMinigameSessionActive } from '../stores/minigameSessions';
  import { socket } from '../socket';

  type Screen = 'menu' | 'instructions' | 'game';
  type PlayMode = 'solo' | 'multi';
  type Command = 'forward' | 'left' | 'right' | 'wait';

  const walls = new Set(['0-2', '1-2', '3-1', '3-2', '3-4', '3-5', '5-4', '6-4']);
  const cores = new Set(['1-3', '5-3']);
  const exits = new Set(['2-0', '4-0']);
  const commandLabels: Record<Command, string> = {
    forward: '↑ FORWARD',
    left: '↺ LEFT',
    right: '↻ RIGHT',
    wait: '· WAIT'
  };
  const commands: Command[] = ['forward', 'left', 'right', 'wait'];
  const directionGlyphs: Record<string, string> = {
    N: '▲',
    E: '▶',
    S: '▼',
    W: '◀'
  };

  let screen: Screen = 'menu';
  let pendingMode: PlayMode = 'solo';
  let selectedDrone: PlayerId = 'p1';
  let queue: Command[] = [];
  let error = '';
  let waitingForStoryPartner = false;

  $: state = $arcadeStates['drone-relay'] ?? null;
  $: playerId = ($sessionState.playerId ?? 'p1') as PlayerId;
  $: isSolo = state?.mode === 'solo';
  $: controlledDrone = isSolo ? selectedDrone : playerId;
  $: submitted = Boolean(state?.submitted?.[controlledDrone]);
  $: launchedFromStory = $campaignState?.activeMinigame?.id === 'drone-relay';
  $: setMinigameSessionActive('drone-relay', screen === 'game' && Boolean(state?.participants[playerId]));
  $: if (launchedFromStory && screen === 'menu') {
    pendingMode = $campaignState?.sessionMode === 'singleplayer' ? 'solo' : 'multi';
    screen = 'instructions';
  }


  // A solo pilot submits two independent queues through the same server rules.
  onDestroy(() => {
    if (screen === 'game') {
      socket.emit('arcade:leave', 'drone-relay');
    }
  });

  function openInstructions(mode: PlayMode): void {
    pendingMode = mode;
    screen = 'instructions';
  }

  function begin(): void {
    queue = [];
    error = '';
    screen = 'game';
    socket.emit('arcade:join', 'drone-relay', pendingMode, handleResult);
  }

  function addCommand(command: Command): void {
    if (queue.length >= 5 || submitted) {
      return;
    }

    queue = [...queue, command];
  }

  function removeCommand(index: number): void {
    if (submitted) {
      return;
    }

    queue = queue.filter((_, commandIndex) => commandIndex !== index);
  }

  function selectDrone(droneId: PlayerId): void {
    if (!isSolo || state?.submitted?.[droneId]) {
      return;
    }

    selectedDrone = droneId;
    queue = [];
  }

  function submitQueue(): void {
    socket.emit(
      'arcade:action',
      {
        game: 'drone-relay',
        action: { type: 'program', droneId: controlledDrone, queue }
      },
      (result: { ok: boolean; error?: string }) => {
        handleResult(result);

        if (result.ok) {
          queue = [];

          if (isSolo && controlledDrone === 'p1') {
            selectedDrone = 'p2';
          }
        }
      }
    );
  }

  function restart(): void {
    queue = [];
    selectedDrone = 'p1';
    waitingForStoryPartner = false;
    socket.emit('arcade:restart', 'drone-relay');
  }

  function exitGame(): void {
    socket.emit('arcade:leave', 'drone-relay');
    screen = 'menu';
    location.set('minigames');
  }

  function returnToStory(): void {
    socket.emit(
      'arcade:story-complete',
      'drone-relay',
      (result: { ok: boolean; error?: string; waitingForPartner?: boolean }) => {
        error = result.ok ? '' : result.error ?? 'Could not return to the story.';
        waitingForStoryPartner = Boolean(result.waitingForPartner);
      }
    );
  }

  function handleResult(result: { ok: boolean; error?: string }): void {
    error = result.ok ? '' : result.error ?? 'The relay rejected that queue.';
  }

  function cellDrone(row: number, column: number): PlayerId | null {
    if (!state) {
      return null;
    }

    for (const droneId of ['p1', 'p2'] as PlayerId[]) {
      const drone = state.drones[droneId];

      if (drone.row === row && drone.column === column) {
        return droneId;
      }
    }

    return null;
  }
</script>

<section class="drone-relay" class:hide={$location !== 'drone-relay'}>
  <header>
    <span>DEJAVU://DRONE_RELAY</span>
    <button class="exit" on:click={exitGame}>EXIT</button>
  </header>

  {#if screen === 'menu'}
    <div class="menu">
      <p>SIMULTANEOUS COMMAND PUZZLE</p>
      <h1>DRONE RELAY</h1>
      <span>Program two drones, recover both data cores, and reach extraction together.</span>
      <div>
        <button on:click={() => openInstructions('solo')}>1P CONTROL BOTH</button>
        <button on:click={() => openInstructions('multi')}>2P CO-OP</button>
      </div>
    </div>
  {:else if screen === 'instructions'}
    <div class="instructions">
      <p>MISSION BRIEF</p>
      <h2>Plan first. Both queues execute together.</h2>
      <ul>
        <li>Queue up to five commands: move forward, rotate left, rotate right, or wait.</li>
        <li>Rotating changes direction without moving. Forward moves one grid cell.</li>
        <li>Drones that hit a wall, collide, or swap cells take damage and stay in place.</li>
        <li>Three damage disables a drone. Recover both cores and park both drones on exits within six cycles.</li>
        <li>In solo mode, submit DRONE 1 and DRONE 2 separately before the cycle executes.</li>
      </ul>
      <div>
        <button on:click={() => screen = 'menu'}>BACK</button>
        <button class="primary" on:click={begin}>DEPLOY DRONES</button>
      </div>
    </div>
  {:else if state?.status === 'waiting'}
    <div class="waiting">
      <h2>WAITING FOR CO-PILOT</h2>
      <p>{state.participantCount}/2 CONNECTED</p>
    </div>
  {:else if state}
    <div class="game">
      <section class="mission-status">
        <span>CYCLE {state.cycle}/{state.maximumCycles}</span>
        <span>CORES {state.collectedCores.length}/2</span>
        <span>D1 DAMAGE {state.drones.p1.damage}/3</span>
        <span>D2 DAMAGE {state.drones.p2.damage}/3</span>
      </section>

      <div class="workspace">
        <section class="grid" aria-label="Drone facility map">
          {#each Array(49) as _, index}
            {@const row = Math.floor(index / 7)}
            {@const column = index % 7}
            {@const key = `${row}-${column}`}
            {@const droneId = cellDrone(row, column)}
            <div class:wall={walls.has(key)} class:core={cores.has(key)} class:exit-cell={exits.has(key)} class:collected={state.collectedCores.includes(key)}>
              {#if droneId}
                <strong class="drone drone--{droneId}">{directionGlyphs[state.drones[droneId].direction]}</strong>
              {:else if walls.has(key)}
                <span>▓</span>
              {:else if cores.has(key) && !state.collectedCores.includes(key)}
                <span>◆</span>
              {:else if exits.has(key)}
                <span>EXIT</span>
              {/if}
            </div>
          {/each}
        </section>

        <aside>
          {#if isSolo}
            <div class="drone-tabs">
              <button class:active={selectedDrone === 'p1'} on:click={() => selectDrone('p1')}>DRONE 1 {state.submitted.p1 ? '✓' : ''}</button>
              <button class:active={selectedDrone === 'p2'} on:click={() => selectDrone('p2')}>DRONE 2 {state.submitted.p2 ? '✓' : ''}</button>
            </div>
          {/if}
          <h2>PROGRAM {controlledDrone === 'p1' ? 'DRONE 1' : 'DRONE 2'}</h2>
          {#if submitted}
            <p>Queue received. Waiting for the other drone.</p>
          {:else if state.status === 'playing'}
            <div class="command-buttons">
              {#each commands as command}
                <button on:click={() => addCommand(command)} disabled={queue.length >= 5}>{commandLabels[command]}</button>
              {/each}
            </div>
            <div class="queue">
              {#each Array(5) as _, index}
                <button class:filled={Boolean(queue[index])} on:click={() => removeCommand(index)}>
                  {queue[index] ? commandLabels[queue[index]] : `${index + 1}. ---`}
                </button>
              {/each}
            </div>
            <button class="primary submit" disabled={queue.length === 0} on:click={submitQueue}>UPLOAD QUEUE</button>
          {/if}
          <section class="log">
            {#each state.log.slice(0, 5) as entry}<p>{entry.message}</p>{/each}
          </section>
        </aside>
      </div>

      {#if state.status === 'finished'}
        <section class:lost={state.winner !== 'players'} class="result">
          <h2>{state.winner === 'players' ? 'EXTRACTION COMPLETE' : 'MISSION FAILED'}</h2>
          {#if waitingForStoryPartner}
            <p>Waiting for your co-pilot to return…</p>
          {:else if launchedFromStory}
            <button on:click={returnToStory}>RETURN TO STORY</button>
          {:else}
            <button on:click={restart}>REDEPLOY</button>
          {/if}
        </section>
      {/if}
      {#if error}<p class="error">{error}</p>{/if}
    </div>
  {/if}
</section>

<style lang="scss">
  .drone-relay {
    width: min(1050px, 100%);
    height: 100%;
    overflow: hidden;
    color: #e6fff2;
    background: #030b08;
    border: 1px solid #49e89b;

    > header {
      min-height: 44px;
      padding: 9px 14px;
      color: #73f7b5;
      background: #071a12;
      border-bottom: 1px solid #27885b;

      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  }

  button {
    padding: 9px 13px;
    color: #caffdf;
    background: #082116;
    border: 1px solid #2d9b68;
    cursor: pointer;
  }

  button:hover,
  button.active,
  .primary {
    color: #03130b;
    background: #63efa8;
  }

  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .exit {
    color: #ff9bad;
    background: #260710;
    border-color: #a6314b;
  }

  .menu,
  .instructions,
  .waiting {
    height: calc(100% - 44px);
    padding: clamp(24px, 6vw, 64px);

    display: grid;
    place-content: center;
    gap: 16px;
  }

  .menu {
    text-align: center;

    h1 {
      margin: 0;
      color: #63efa8;
      font-size: clamp(2.8rem, 8vw, 6.5rem);
    }

    > div {
      display: flex;
      justify-content: center;
      gap: 8px;
    }
  }

  .instructions {
    width: min(720px, 100%);
    margin: auto;
    line-height: 1.6;

    > div {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  }

  .game {
    position: relative;
    height: calc(100% - 44px);
    padding: 14px;
    overflow-y: auto;
  }

  .mission-status {
    padding: 10px;
    background: #071a12;
    border: 1px solid #1f5e43;

    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 12px;
  }

  .workspace {
    margin-top: 14px;

    display: grid;
    grid-template-columns: minmax(380px, 1.25fr) minmax(280px, 0.75fr);
    gap: 16px;
  }

  .grid {
    aspect-ratio: 1;
    min-width: 0;
    padding: 8px;
    background: #06140e;
    border: 1px solid #1f5e43;

    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;

    > div {
      min-width: 0;
      background: #0a2017;
      border: 1px solid #164a34;

      display: grid;
      place-items: center;
      font-size: clamp(0.48rem, 1.4vw, 0.8rem);
    }

    > div.wall {
      color: #59635f;
      background: #161d1a;
      border-color: #3f4944;
    }

    > div.core {
      color: #ffe26b;
      box-shadow: inset 0 0 18px #ffe26b22;
    }

    > div.core.collected {
      opacity: 0.35;
    }

    > div.exit-cell {
      color: #73f7b5;
      border: 2px dashed #49e89b;
    }
  }

  .drone {
    font-size: clamp(1rem, 3vw, 2rem);
    filter: drop-shadow(0 0 7px currentColor);
  }

  .drone--p1 {
    color: #67dfff;
  }

  .drone--p2 {
    color: #ff75c8;
  }

  aside {
    padding: 16px;
    background: #071710;
    border: 1px solid #1f5e43;
  }

  .drone-tabs,
  .command-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .queue {
    margin: 14px 0;

    display: grid;
    gap: 5px;

    button {
      text-align: left;
    }

    button.filled {
      color: #ffe26b;
      border-color: #a98922;
    }
  }

  .submit {
    width: 100%;
  }

  .log {
    margin-top: 18px;
    color: #91b5a2;
    font-size: 0.78rem;
  }

  .result {
    position: absolute;
    z-index: 4;
    inset: 24% 18%;
    padding: 30px;
    background: #06251aef;
    border: 1px solid #49e89b;

    display: grid;
    place-content: center;
    text-align: center;

    &.lost {
      background: #290812ef;
      border-color: #ff5577;
    }
  }

  .error {
    color: #ff8299;
  }

  @media (max-width: 760px) {
    .workspace {
      grid-template-columns: 1fr;
    }

    .grid {
      min-width: 0;
    }
  }
</style>
