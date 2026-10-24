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

  const nodes = [
    { id: 'A', x: 8, y: 50 },
    { id: 'B', x: 25, y: 25 },
    { id: 'C', x: 25, y: 75 },
    { id: 'D', x: 43, y: 12 },
    { id: 'E', x: 43, y: 50 },
    { id: 'F', x: 43, y: 88 },
    { id: 'G', x: 63, y: 28 },
    { id: 'H', x: 63, y: 72 },
    { id: 'I', x: 80, y: 50 },
    { id: 'J', x: 94, y: 50 }
  ];
  const links = [
    ['A', 'B'], ['A', 'C'], ['B', 'D'], ['B', 'E'], ['C', 'E'], ['C', 'F'],
    ['D', 'G'], ['E', 'G'], ['E', 'H'], ['F', 'H'], ['G', 'I'], ['H', 'I'], ['I', 'J']
  ];
  const adjacency: Record<string, string[]> = {
    A: ['B', 'C'], B: ['A', 'D', 'E'], C: ['A', 'E', 'F'], D: ['B', 'G'],
    E: ['B', 'C', 'G', 'H'], F: ['C', 'H'], G: ['D', 'E', 'I'], H: ['E', 'F', 'I'],
    I: ['G', 'H', 'J'], J: ['I']
  };

  let screen: Screen = 'menu';
  let pendingMode: PlayMode = 'solo';
  let error = '';
  let waitingForStoryPartner = false;

  $: state = $arcadeStates['ghost-packet'] ?? null;
  $: playerId = ($sessionState.playerId ?? 'p1') as PlayerId;
  $: launchedFromStory = $campaignState?.activeMinigame?.id === 'ghost-packet';
  $: isSolo = state?.mode === 'solo';
  $: isScanner = isSolo || playerId === 'p2';
  $: isRouter = isSolo || playerId === 'p1';
  $: availableRoutes = state ? adjacency[state.packetNode] ?? [] : [];
  $: setMinigameSessionActive('ghost-packet', screen === 'game' && Boolean(state?.participants[playerId]));
  $: if (launchedFromStory && screen === 'menu') {
    pendingMode = $campaignState?.sessionMode === 'singleplayer' ? 'solo' : 'multi';
    screen = 'instructions';
  }


  // Leaving the component must also release the shared arcade seat.
  onDestroy(() => {
    if (screen === 'game') {
      socket.emit('arcade:leave', 'ghost-packet');
    }
  });

  function openInstructions(mode: PlayMode): void {
    pendingMode = mode;
    screen = 'instructions';
  }

  function begin(): void {
    screen = 'game';
    error = '';
    socket.emit('arcade:join', 'ghost-packet', pendingMode, handleResult);
  }

  function chooseNode(nodeId: string): void {
    if (!state || state.status !== 'playing') {
      return;
    }

    if (state.phase === 'scan' && isScanner) {

      // The same network buttons serve both asymmetric roles to keep the map readable.
      sendAction({ type: 'scan', node: nodeId });
      return;
    }

    if (state.phase === 'route' && isRouter && availableRoutes.includes(nodeId)) {
      sendAction({ type: 'route', node: nodeId });
    }
  }

  function skipScan(): void {
    sendAction({ type: 'skip-scan' });
  }

  function sendAction(action: Record<string, unknown>): void {
    socket.emit('arcade:action', { game: 'ghost-packet', action }, handleResult);
  }

  function restart(): void {
    socket.emit('arcade:restart', 'ghost-packet');
    waitingForStoryPartner = false;
  }

  function exitGame(): void {
    socket.emit('arcade:leave', 'ghost-packet');
    screen = 'menu';
    location.set('minigames');
  }

  function returnToStory(): void {
    socket.emit(
      'arcade:story-complete',
      'ghost-packet',
      (result: { ok: boolean; error?: string; waitingForPartner?: boolean }) => {
        error = result.ok ? '' : result.error ?? 'Could not return to the story.';
        waitingForStoryPartner = Boolean(result.waitingForPartner);
      }
    );
  }

  function handleResult(result: { ok: boolean; error?: string }): void {
    error = result.ok ? '' : result.error ?? 'The network rejected that command.';
  }

  function lineStyle(firstId: string, secondId: string): string {
    const first = nodes.find((node) => node.id === firstId)!;
    const second = nodes.find((node) => node.id === secondId)!;
    const width = Math.hypot(second.x - first.x, second.y - first.y);
    const angle = Math.atan2(second.y - first.y, second.x - first.x) * 180 / Math.PI;

    return `left:${first.x}%;top:${first.y}%;width:${width}%;transform:rotate(${angle}deg);`;
  }
</script>

<section class="ghost-packet" class:hide={$location !== 'ghost-packet'}>
  <header>
    <span>DEJAVU://GHOST_PACKET</span>
    <button class="exit" on:click={exitGame}>EXIT</button>
  </header>

  {#if screen === 'menu'}
    <div class="menu">
      <p>ASYMMETRIC NETWORK INFILTRATION</p>
      <h1>GHOST PACKET</h1>
      <span>One scanner finds compromised relays. One router moves the packet.</span>
      <div>
        <button on:click={() => openInstructions('solo')}>1P DUAL ROLE</button>
        <button on:click={() => openInstructions('multi')}>2P CO-OP</button>
      </div>
    </div>
  {:else if screen === 'instructions'}
    <div class="instructions">
      <p>OPERATION BRIEF</p>
      <h2>Reach relay J before TRACE reaches four.</h2>
      <ul>
        <li>The Scanner probes one relay each round, or conserves the limited probe.</li>
        <li>The Router sees the route and moves to one connected relay after the scan.</li>
        <li>In two-player mode, scan results are visible only to the Scanner. Communicate carefully.</li>
        <li>A compromised relay adds two TRACE. Four TRACE or seven rounds ends the run.</li>
      </ul>
      <div>
        <button on:click={() => screen = 'menu'}>BACK</button>
        <button class="primary" on:click={begin}>CONNECT</button>
      </div>
    </div>
  {:else if state?.status === 'waiting'}
    <div class="waiting">
      <h2>WAITING FOR OPERATIVE</h2>
      <p>{state.participantCount}/2 CONNECTED</p>
    </div>
  {:else if state}
    <div class="game">
      <section class="status-strip">
        <span>ROUND {state.round}/{state.maximumRounds}</span>
        <span>TRACE {state.trace}/{state.maximumTrace}</span>
        <span>PROBES {state.scansRemaining}</span>
        <strong>{state.phase === 'scan' ? 'SCANNER PHASE' : 'ROUTER PHASE'}</strong>
      </section>

      <div class="workspace">
        <section class="network" aria-label="Packet relay network">
          {#each links as link}
            <i class="link" style={lineStyle(link[0], link[1])}></i>
          {/each}
          {#each nodes as node}
            <button
              class:packet={node.id === state.packetNode}
              class:destination={node.id === state.destination}
              class:safe={state.scanResults?.[node.id] === 'safe'}
              class:compromised={state.scanResults?.[node.id] === 'compromised'}
              class:available={state.phase === 'route' && availableRoutes.includes(node.id)}
              disabled={state.status !== 'playing'}
              style={`left:${node.x}%;top:${node.y}%;`}
              on:click={() => chooseNode(node.id)}
            >{node.id}</button>
          {/each}
        </section>

        <aside>
          <h2>{isSolo ? 'DUAL ROLE CONSOLE' : isScanner ? 'SCANNER CONSOLE' : 'ROUTER CONSOLE'}</h2>
          {#if state.phase === 'scan'}
            <p>{isScanner ? 'Select a relay to probe, or conserve the probe.' : 'Your scanner is analyzing the network.'}</p>
            {#if isScanner}<button on:click={skipScan}>CONSERVE PROBE</button>{/if}
          {:else}
            <p>{isRouter ? `Move from ${state.packetNode} to a highlighted relay.` : 'Your router is moving the hidden packet.'}</p>
          {/if}
          <div class="legend"><span>● PACKET</span><span>◇ SAFE</span><span>× COMPROMISED</span></div>
          <section class="log">
            <h3>TRANSMISSION LOG</h3>
            {#each state.log as entry}<p>{entry.message}</p>{/each}
          </section>
        </aside>
      </div>

      {#if state.status === 'finished'}
        <section class:lost={state.winner !== 'players'} class="result">
          <h2>{state.winner === 'players' ? 'PACKET DELIVERED' : 'PACKET TRACED'}</h2>
          {#if waitingForStoryPartner}
            <p>Waiting for your partner to return…</p>
          {:else if launchedFromStory}
            <button on:click={returnToStory}>RETURN TO STORY</button>
          {:else}
            <button on:click={restart}>RUN AGAIN</button>
          {/if}
        </section>
      {/if}
      {#if error}<p class="error">{error}</p>{/if}
    </div>
  {/if}
</section>

<style lang="scss">
  .ghost-packet {
    width: min(1100px, 100%);
    height: 100%;
    overflow: hidden;
    color: #d8fbff;
    background: #020a10;
    border: 1px solid #42d9ff;

    > header {
      min-height: 44px;
      padding: 9px 14px;
      color: #6ce6ff;
      background: #071621;
      border-bottom: 1px solid #277f9b;

      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  }

  button {
    padding: 9px 13px;
    color: #bff7ff;
    background: #08212d;
    border: 1px solid #2a91ac;
    cursor: pointer;
  }

  button:hover,
  .primary {
    color: #021017;
    background: #63e7ff;
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
      color: #63e7ff;
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

  .status-strip {
    padding: 10px;
    background: #071621;
    border: 1px solid #194b5b;

    display: flex;
    flex-wrap: wrap;
    gap: 18px;

    strong {
      margin-left: auto;
      color: #ffdf70;
    }
  }

  .workspace {
    min-height: 480px;
    margin-top: 14px;

    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(250px, 0.8fr);
    gap: 14px;
  }

  .network {
    position: relative;
    min-height: 460px;
    background-image: linear-gradient(#12303a44 1px, transparent 1px), linear-gradient(90deg, #12303a44 1px, transparent 1px);
    background-size: 32px 32px;
    border: 1px solid #194b5b;

    .link {
      position: absolute;
      z-index: 0;
      height: 1px;
      background: #24738a;
      transform-origin: left center;
    }

    button {
      position: absolute;
      z-index: 1;
      width: 42px;
      height: 42px;
      padding: 0;
      border-radius: 50%;
      transform: translate(-50%, -50%);
    }

    button.packet {
      color: #07131a;
      background: #ffffff;
      box-shadow: 0 0 24px #ffffff;
    }

    button.destination {
      border: 3px double #ffdf70;
    }

    button.available {
      box-shadow: 0 0 18px #63e7ff;
    }

    button.safe {
      color: #8cffbd;
      border-color: #49d987;
    }

    button.compromised {
      color: #ff708d;
      border-color: #ff3d66;
    }
  }

  aside {
    padding: 18px;
    background: #06131c;
    border: 1px solid #194b5b;

    h2 {
      color: #63e7ff;
      font-size: 1rem;
    }
  }

  .legend {
    margin: 22px 0;

    display: grid;
    gap: 7px;
    color: #8aaebb;
    font-size: 0.72rem;
  }

  .log {
    max-height: 210px;
    overflow-y: auto;
    color: #9bbac5;
    font-size: 0.78rem;
  }

  .result {
    position: absolute;
    z-index: 4;
    inset: 20% 15%;
    padding: 30px;
    background: #06251feF;
    border: 1px solid #52f2b1;

    display: grid;
    place-content: center;
    text-align: center;

    &.lost {
      background: #270711ef;
      border-color: #ff5577;
    }
  }

  .error {
    color: #ff8299;
  }

  @media (max-width: 720px) {
    .workspace {
      grid-template-columns: 1fr;
    }

    .network {
      min-height: 360px;
    }

    .status-strip strong {
      width: 100%;
      margin-left: 0;
    }
  }
</style>
