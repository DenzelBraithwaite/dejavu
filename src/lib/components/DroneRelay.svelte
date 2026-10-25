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
  type Command = 'forward' | 'left' | 'right' | 'wait' | 'shoot' | 'long-shot' | 'pulse' | 'jump' | 'shield';

  const walls = new Set(['0-2', '1-2', '3-1', '3-2', '3-4', '3-5', '5-4', '6-4']);
  const exitCell = '0-3';
  const basicCommands: Command[] = ['forward', 'left', 'right', 'wait', 'shoot'];
  const abilityCommands: Command[] = ['long-shot', 'pulse', 'jump', 'shield'];
  const commandLabels: Record<Command, string> = {
    forward: '↑ FORWARD',
    left: '↺ LEFT',
    right: '↻ RIGHT',
    wait: '· WAIT',
    shoot: '⌁ SHOOT',
    'long-shot': '⇈ LONG SHOT',
    pulse: '✦ PULSE',
    jump: '⇑ JUMP',
    shield: '⬡ SHIELD'
  };
  const directionGlyphs: Record<string, string> = {
    N: '▲',
    E: '▶',
    S: '▼',
    W: '◀'
  };

  let screen: Screen = 'menu';
  let pendingMode: PlayMode = 'solo';
  let queue: Command[] = [];
  let error = '';
  let waitingForStoryPartner = false;
  let animatedExecutionId = 0;
  let isAnimating = false;
  let activeFrame: Record<string, any> | null = null;
  let playbackFrames: Array<Record<string, any>> = [];
  let playbackFrameIndex = -1;
  let animationTimer: number | null = null;

  $: state = $arcadeStates['drone-relay'] ?? null;
  $: playerId = ($sessionState.playerId ?? 'p1') as PlayerId;
  $: opponentId = playerId === 'p1' ? 'p2' : 'p1';
  $: submitted = Boolean(state?.submitted?.[playerId]);
  $: displayDrones = activeFrame?.drones ?? state?.drones ?? null;
  $: displayHealthPack = activeFrame?.healthPack ?? state?.healthPack ?? null;
  $: currentAbilities = state?.abilities?.[playerId] ?? {};
  $: launchedFromStory = $campaignState?.activeMinigame?.id === 'drone-relay';
  $: setMinigameSessionActive('drone-relay', screen === 'game' && Boolean(state?.participants[playerId]));
  $: if (launchedFromStory && screen === 'menu') {
    pendingMode = $campaignState?.sessionMode === 'singleplayer' ? 'solo' : 'multi';
    screen = 'instructions';
  }
  $: if (state?.executionId && state.executionId !== animatedExecutionId) {
    playExecution(state.executionId, state.lastExecution);
  }


  // Timers are cancelled when leaving so playback cannot mutate a hidden game.
  onDestroy(() => {
    cancelAnimation();

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
    animatedExecutionId = 0;
    screen = 'game';
    socket.emit('arcade:join', 'drone-relay', pendingMode, handleResult);
  }

  function addCommand(command: Command): void {
    if (queue.length >= 5 || submitted || isAnimating || commandUnavailable(command)) {
      return;
    }

    queue = [...queue, command];
  }

  function removeCommand(index: number): void {
    if (submitted || isAnimating) {
      return;
    }

    queue = queue.filter((_, commandIndex) => commandIndex !== index);
  }

  function commandUnavailable(command: Command): boolean {
    if (!abilityCommands.includes(command)) {
      return false;
    }

    return !currentAbilities[command] || queue.includes(command);
  }

  function submitQueue(): void {
    socket.emit(
      'arcade:action',
      {
        game: 'drone-relay',
        action: { type: 'program', queue }
      },
      (result: { ok: boolean; error?: string }) => {
        handleResult(result);

        if (result.ok) {
          queue = [];
        }
      }
    );
  }

  function restart(): void {
    cancelAnimation();
    queue = [];
    animatedExecutionId = 0;
    waitingForStoryPartner = false;
    socket.emit('arcade:restart', 'drone-relay');
  }

  function returnToMenu(): void {
    cancelAnimation();
    socket.emit('arcade:leave', 'drone-relay');
    queue = [];
    waitingForStoryPartner = false;
    screen = 'menu';
  }

  function exitGame(): void {
    returnToMenu();
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
    if (!displayDrones) {
      return null;
    }

    for (const droneId of ['p1', 'p2'] as PlayerId[]) {
      const drone = displayDrones[droneId];

      if (drone.row === row && drone.column === column) {
        return droneId;
      }
    }

    return null;
  }

  function playExecution(executionId: number, frames: Array<Record<string, any>>): void {
    cancelAnimation();
    animatedExecutionId = executionId;
    playbackFrames = structuredClone(frames ?? []);
    playbackFrameIndex = 0;
    activeFrame = playbackFrames[0] ?? null;
    isAnimating = Boolean(activeFrame);

    if (!activeFrame) {
      return;
    }

    // Each resolved action remains on screen for a full second before advancing.
    animationTimer = window.setInterval(() => {
      playbackFrameIndex += 1;

      if (playbackFrameIndex >= playbackFrames.length) {
        finishAnimation();
        return;
      }

      activeFrame = playbackFrames[playbackFrameIndex];
    }, 1000);
  }

  function cancelAnimation(): void {
    if (animationTimer !== null) {
      window.clearInterval(animationTimer);
      animationTimer = null;
    }

    activeFrame = null;
    playbackFrames = [];
    playbackFrameIndex = -1;
    isAnimating = false;
  }

  function finishAnimation(): void {
    cancelAnimation();
  }

  function cellHasEffect(row: number, column: number, type: string): boolean {
    return Boolean(activeFrame?.cellEffects?.some((effect: Record<string, any>) => (
      effect.row === row
      && effect.column === column
      && effect.type === type
    )));
  }

  function commandLabel(command: string): string {
    return commandLabels[command as Command] ?? command.toUpperCase();
  }

  function resultTitle(): string {
    if (state?.winner === 'tie') {
      return 'BATTLE DRAWN';
    }

    return state?.winner === playerId ? 'DRONE VICTORIOUS' : 'DRONE DESTROYED';
  }
</script>

<section class="drone-relay" class:hide={$location !== 'drone-relay'}>
  <header>
    <span>DEJAVU://DRONE_RELAY</span>
    <button class="exit" on:click={exitGame}>EXIT</button>
  </header>

  {#if screen === 'menu'}
    <div class="menu">
      <p>SIMULTANEOUS PROGRAMMING DUEL</p>
      <h1>DRONE RELAY</h1>
      <span>Out-program the rival drone, destroy it, or reach extraction first.</span>
      <div>
        <button on:click={() => openInstructions('solo')}>1P VS CPU</button>
        <button on:click={() => openInstructions('multi')}>1P VS 2P</button>
      </div>
    </div>
  {:else if screen === 'instructions'}
    <div class="instructions">
      <p>BATTLE BRIEF</p>
      <h2>Lock five actions. Watch both programs execute together.</h2>
      <ul>
        <li>Both drones have three health. Shots, collisions, and wall impacts deal one damage.</li>
        <li><strong>SHOOT</strong> hits one square ahead and has unlimited uses.</li>
        <li><strong>LONG SHOT</strong> reaches three squares, <strong>PULSE</strong> hits every adjacent square, and <strong>JUMP</strong> moves two squares. Each is available once.</li>
        <li><strong>SHIELD</strong> lasts three action ticks and blocks the next damage from any source. It is available once.</li>
        <li>The visible health pack restores one health and respawns after collection.</li>
        <li>Destroy the opponent or reach the single EXIT square. Round ten ends in a draw if neither happens.</li>
      </ul>
      <div>
        <button on:click={() => screen = 'menu'}>BACK</button>
        <button class="primary" on:click={begin}>ENTER ARENA</button>
      </div>
    </div>
  {:else if state?.status === 'waiting'}
    <div class="waiting">
      <h2>WAITING FOR OPPONENT</h2>
      <p>{state.participantCount}/2 CONNECTED</p>
    </div>
  {:else if state && displayDrones}
    <div class="game">
      <section class="mission-status">
        <span>ROUND {activeFrame?.round ?? state.round}/{state.maximumRounds}</span>
        <span class="health health--self">YOU {'♥'.repeat(displayDrones[playerId].health)}{'♡'.repeat(3 - displayDrones[playerId].health)}</span>
        <span class="health health--rival">RIVAL {'♥'.repeat(displayDrones[opponentId].health)}{'♡'.repeat(3 - displayDrones[opponentId].health)}</span>
        <span>{isAnimating ? `EXECUTING TICK ${activeFrame?.step ?? 1}` : submitted ? 'QUEUE LOCKED' : 'PROGRAM READY'}</span>
      </section>

      <div class="workspace">
        <section class="grid" aria-label="Drone battle arena">
          {#each Array(49) as _, index}
            {@const row = Math.floor(index / 7)}
            {@const column = index % 7}
            {@const key = `${row}-${column}`}
            {@const droneId = cellDrone(row, column)}
            <div
              class:wall={walls.has(key)}
              class:exit-cell={key === exitCell}
              class:health-pack={displayHealthPack?.row === row && displayHealthPack?.column === column}
              class:damage-flash={cellHasEffect(row, column, 'damage')}
              class:heal-flash={cellHasEffect(row, column, 'heal')}
              class:shield-flash={cellHasEffect(row, column, 'shield')}
              class:extraction-flash={cellHasEffect(row, column, 'extraction')}
            >
              {#if droneId}
                <strong class="drone drone--{droneId}" class:shielded={displayDrones[droneId].shieldTicks > 0}>
                  {directionGlyphs[displayDrones[droneId].direction]}
                </strong>
              {:else if walls.has(key)}
                <span>▓</span>
              {:else if key === exitCell}
                <span>EXIT</span>
              {:else if displayHealthPack?.row === row && displayHealthPack?.column === column}
                <span class="pack">✚</span>
              {/if}
            </div>
          {/each}
        </section>

        <aside>
          <h2>PROGRAM YOUR DRONE</h2>
          {#if isAnimating && activeFrame}
            <section class="execution-panel">
              <p>YOU: <strong>{commandLabel(activeFrame.commands[playerId])}</strong></p>
              <p>RIVAL: <strong>{commandLabel(activeFrame.commands[opponentId])}</strong></p>
              {#each activeFrame.events as event}<span>{event}</span>{/each}
            </section>
          {:else if submitted}
            <p>Queue encrypted. Waiting for the opposing program…</p>
          {:else if state.status === 'playing'}
            <h3>BASIC COMMANDS</h3>
            <div class="command-buttons">
              {#each basicCommands as command}
                <button on:click={() => addCommand(command)} disabled={queue.length >= 5}>{commandLabels[command]}</button>
              {/each}
            </div>

            <h3>ONE-USE ABILITIES</h3>
            <div class="command-buttons ability-buttons">
              {#each abilityCommands as command}
                <button
                  class:spent={!currentAbilities[command]}
                  on:click={() => addCommand(command)}
                  disabled={queue.length >= 5 || commandUnavailable(command)}
                >{commandLabels[command]} <small>{currentAbilities[command] ? '1' : '0'}</small></button>
              {/each}
            </div>

            <div class="queue">
              {#each Array(5) as _, index}
                <button class:filled={Boolean(queue[index])} on:click={() => removeCommand(index)}>
                  {queue[index] ? commandLabels[queue[index]] : `${index + 1}. ---`}
                </button>
              {/each}
            </div>
            <button class="primary submit" disabled={queue.length === 0} on:click={submitQueue}>LOCK PROGRAM</button>
          {/if}

          <section class="log">
            {#each state.log.slice(0, 5) as entry}<p>{entry.message}</p>{/each}
          </section>
        </aside>
      </div>

      {#if state.status === 'finished' && !isAnimating}
        <section class:lost={state.winner !== playerId && state.winner !== 'tie'} class="result">
          <h2>{resultTitle()}</h2>
          {#if waitingForStoryPartner}
            <p>Waiting for your opponent to return…</p>
          {:else if launchedFromStory}
            <button on:click={returnToStory}>RETURN TO STORY</button>
          {:else}
            <div>
              <button on:click={restart}>REMATCH</button>
              <button on:click={returnToMenu}>MAIN MENU</button>
            </div>
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
  .primary {
    color: #03130b;
    background: #63efa8;
  }

  button:disabled,
  button.spent {
    opacity: 0.38;
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
    width: min(760px, 100%);
    margin: auto;
    line-height: 1.55;

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

  .health {
    letter-spacing: 2px;
  }

  .health--self {
    color: #67dfff;
  }

  .health--rival {
    color: #ff75c8;
  }

  .workspace {
    margin-top: 14px;

    display: grid;
    grid-template-columns: minmax(380px, 1.25fr) minmax(290px, 0.75fr);
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
    grid-template-rows: repeat(7, minmax(0, 1fr));
    gap: 4px;

    > div {
      min-width: 0;
      min-height: 0;
      overflow: hidden;
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

    > div.exit-cell {
      color: #73f7b5;
      border: 2px dashed #49e89b;
      box-shadow: inset 0 0 18px #49e89b22;
    }

    > div.health-pack {
      border-color: #ffe26b;
      box-shadow: inset 0 0 18px #ffe26b2d;
    }

    > div.damage-flash {
      z-index: 2;
      background: #501018;
      border-color: #ff4e63;
      box-shadow: inset 0 0 22px #ff344f99, 0 0 12px #ff344f88;
      animation: damage-cell-pulse 700ms ease-out;
    }

    > div.heal-flash {
      z-index: 2;
      background: #0b492b;
      border-color: #63f5a8;
      box-shadow: inset 0 0 22px #42ef9299, 0 0 12px #42ef9288;
      animation: heal-cell-pulse 700ms ease-out;
    }

    > div.shield-flash {
      z-index: 2;
      border-color: #ffe26b;
      box-shadow: inset 0 0 22px #ffe26b88, 0 0 12px #ffe26b77;
      animation: shield-cell-pulse 700ms ease-out;
    }

    > div.extraction-flash {
      z-index: 2;
      background: #0a5338;
      border-color: #8affbd;
      box-shadow: inset 0 0 26px #63efa8aa, 0 0 14px #63efa899;
      animation: heal-cell-pulse 700ms ease-out;
    }
  }

  .pack {
    color: #ffe26b;
    font-size: clamp(1rem, 3vw, 1.8rem);
    filter: drop-shadow(0 0 7px #ffe26b);
  }

  .drone {
    width: 62%;
    aspect-ratio: 1;
    border: 2px solid transparent;
    border-radius: 50%;
    font-size: clamp(1rem, 3vw, 2rem);
    filter: drop-shadow(0 0 7px currentColor);

    display: grid;
    place-items: center;

    &.shielded {
      border-color: #ffe26b;
      box-shadow: 0 0 18px #ffe26b;
    }
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

    h3 {
      margin: 15px 0 7px;
      color: #91b5a2;
      font-size: 0.7rem;
      letter-spacing: 1px;
    }
  }

  .command-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;

    button {
      position: relative;
      font-size: 0.72rem;

      small {
        position: absolute;
        right: 5px;
        top: 4px;
        color: #ffe26b;
      }
    }
  }

  .ability-buttons button {
    color: #ffe26b;
    background: #211d08;
    border-color: #91761c;
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

  .execution-panel {
    padding: 12px;
    background: #10251c;
    border: 1px solid #49e89b;

    span {
      margin-top: 6px;

      display: block;
      color: #ffe26b;
      font-size: 0.76rem;
    }
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

    > div {
      display: flex;
      justify-content: center;
      gap: 8px;
    }

    &.lost {
      background: #290812ef;
      border-color: #ff5577;
    }
  }

  .error {
    color: #ff8299;
  }

  @keyframes damage-cell-pulse {
    0%, 100% {
      transform: scale(1);
    }

    35% {
      transform: scale(0.92);
    }
  }

  @keyframes heal-cell-pulse {
    0%, 100% {
      transform: scale(1);
    }

    35% {
      transform: scale(0.92);
    }
  }

  @keyframes shield-cell-pulse {
    0%, 100% {
      filter: brightness(1);
    }

    35% {
      filter: brightness(1.75);
    }
  }

  @media (max-width: 760px) {
    .workspace {
      grid-template-columns: 1fr;
    }

    .grid {
      min-width: 0;
    }

    .mission-status {
      justify-content: flex-start;
    }
  }
</style>
