<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { blur } from 'svelte/transition';
  import { LogPage } from '../../routes';
  import { socket, storeSessionToken } from '../socket';
  import { campaignState, type CampaignState } from '../stores/campaign';
  import { chatMessages, type ChatMessage } from '../stores/chat';
  import location from '../stores/location';
  import { libraryState, type LibraryState } from '../stores/library';
  import {
    netRunnersServerState,
    type NetRunnersServerState
  } from '../stores/netRunnersSession';
  import { pigzServerState, type PigzServerState } from '../stores/pigzSession';
  import {
    traceRaceServerState,
    type TraceRaceState
  } from '../stores/traceRaceSession';
  import {
    packetWarServerState,
    type PacketWarState
  } from '../stores/packetWarSession';
  import { sessionState, type PlayerId } from '../stores/session';
  import ChatPanel from './ChatPanel.svelte';
  import Sidebar from './Sidebar.svelte';

  let sidebarExpanded = false;
  let minigameWasActive = false;
  let chatOpen = false;
  let unreadChatCount = 0;
  let showChatToast = false;
  let chatToastTimer: number;
  let pendingPage: string | null = null;

  $: neuroChatInstalled = Boolean(
    $campaignState?.installedMods.includes('neuro-link-chat')
  );

  $: if (!neuroChatInstalled && chatOpen) {
    chatOpen = false;
    unreadChatCount = 0;
    showChatToast = false;
  }

  onMount(() => {
    socket.on('connect_error', handleConnectionError);
    socket.on('session:status', handleSessionStatus);
    socket.on('campaign:state', handleCampaignState);
    socket.on('library:state', handleLibraryState);
    socket.on('netrunners:state', handleNetRunnersState);
    socket.on('pigz:state', handlePigzState);
    socket.on('trace-race:state', handleTraceRaceState);
    socket.on('packet-war:state', handlePacketWarState);
    socket.on('chat:history', handleChatHistory);
    socket.on('chat:message', handleChatMessage);
    socket.connect();
  });

  onDestroy(() => {
    socket.off('connect_error', handleConnectionError);
    socket.off('session:status', handleSessionStatus);
    socket.off('campaign:state', handleCampaignState);
    socket.off('library:state', handleLibraryState);
    socket.off('netrunners:state', handleNetRunnersState);
    socket.off('pigz:state', handlePigzState);
    socket.off('trace-race:state', handleTraceRaceState);
    socket.off('packet-war:state', handlePacketWarState);
    socket.off('chat:history', handleChatHistory);
    socket.off('chat:message', handleChatMessage);
    window.clearTimeout(chatToastTimer);
  });

  function handleConnectionError(error: Error): void {
    sessionState.update((state) => ({
      ...state,
      status: 'error',
      error: error.message
    }));
  }

  function handleSessionStatus(data: {
    status: 'joined' | 'full';
    playerId?: PlayerId;
    playerCount?: number;
    bothPlayersConnected?: boolean;
    sessionToken?: string;
  }): void {
    if (data.status === 'full') {
      sessionState.set({
        status: 'full',
        playerId: null,
        playerCount: 2,
        bothPlayersConnected: true,
        error: ''
      });
      return;
    }

    if (data.sessionToken) {
      storeSessionToken(data.sessionToken);
    }

    sessionState.set({
      status: 'joined',
      playerId: data.playerId ?? null,
      playerCount: data.playerCount ?? 0,
      bothPlayersConnected: data.bothPlayersConnected ?? false,
      error: ''
    });
  }

  function handleCampaignState(state: CampaignState): void {
    campaignState.set(state);

    if (state.activeMinigame) {
      minigameWasActive = true;
      location.set(state.activeMinigame.id);

      if (state.activeMinigame.id === 'netrunners') {
        socket.emit('netrunners:join');
      }

      if (state.activeMinigame.id === 'pigz') {
        socket.emit('pigz:join');
      }
    } else if (minigameWasActive) {
      minigameWasActive = false;
      location.set('terminal');
    }
  }

  function handleLibraryState(state: LibraryState): void {
    libraryState.set(state);
  }

  function handleNetRunnersState(state: NetRunnersServerState): void {
    netRunnersServerState.set(state);
  }

  function handlePigzState(state: PigzServerState): void {
    pigzServerState.set(state);
  }

  function handleTraceRaceState(state: TraceRaceState): void {
    traceRaceServerState.set(state);
  }

  function handlePacketWarState(state: PacketWarState): void {
    packetWarServerState.set(state);
  }

  function handleChatHistory(messages: ChatMessage[]): void {
    chatMessages.set(messages);
  }

  function handleChatMessage(message: ChatMessage): void {
    if (!neuroChatInstalled) {
      return;
    }

    chatMessages.update((messages) => [...messages, message]);

    if (message.playerId === $sessionState.playerId || chatOpen) {
      return;
    }

    unreadChatCount += 1;
    showChatToast = true;
    window.clearTimeout(chatToastTimer);
    chatToastTimer = window.setTimeout(() => {
      showChatToast = false;
    }, 3200);
  }

  function toggleChat(): void {
    chatOpen = !chatOpen;

    if (chatOpen) {
      unreadChatCount = 0;
      showChatToast = false;
      window.clearTimeout(chatToastTimer);
    }
  }

  function changePage(event: CustomEvent<string>): void {
    if (event.detail === $location) {
      return;
    }

    if (shouldConfirmMinigameExit()) {
      pendingPage = event.detail;
      return;
    }

    location.set(event.detail);
  }

  function shouldConfirmMinigameExit(): boolean {
    const minigameLocations = ['netrunners', 'billywig', 'pigz', 'trace-race', 'packet-war'];

    if (!minigameLocations.includes($location)) {
      return false;
    }

    if ($location === 'trace-race' && $traceRaceServerState?.status === 'finished') {
      return false;
    }

    if ($location === 'packet-war' && $packetWarServerState?.status === 'finished') {
      return false;
    }

    if ($location === 'pigz' && $pigzServerState?.status === 'finished') {
      return false;
    }

    if ($location === 'netrunners' && $netRunnersServerState?.status === 'finished') {
      return false;
    }

    return true;
  }

  function confirmMinigameExit(): void {
    if (pendingPage) {
      location.set(pendingPage);
    }

    pendingPage = null;
  }
</script>

{#if $sessionState.status === 'full'}
  <main class="status-screen" aria-labelledby="full-title">
    <p class="status-code">CONNECTION REFUSED</p>
    <h1 id="full-title">Game is full</h1>
    <p>Déjà Vu requires exactly two players. Both player slots are currently occupied.</p>
  </main>
{:else if $sessionState.status === 'error'}
  <main class="status-screen" aria-labelledby="error-title">
    <p class="status-code">CONNECTION ERROR</p>
    <h1 id="error-title">Unable to reach the game server</h1>
    <p>{$sessionState.error}</p>
  </main>
{:else if $sessionState.status === 'connecting'}
  <main class="status-screen" aria-labelledby="connecting-title">
    <p class="status-code">INITIALIZING</p>
    <h1 id="connecting-title">Connecting to Déjà Vu</h1>
  </main>
{:else}
  <div
    in:blur={{ duration: 600 }}
    class="client"
    class:client-collapsed={!sidebarExpanded}
  >
    <Sidebar
      {sidebarExpanded}
      chatAvailable={neuroChatInstalled}
      chatUnreadCount={unreadChatCount}
      on:select={changePage}
      on:toggle-chat={toggleChat}
      on:toggle-sidebar={() => sidebarExpanded = !sidebarExpanded}
    />

    <div class="main-content">
      {#if pendingPage}
        <div class="exit-confirmation-backdrop">
          <section class="exit-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="exit-minigame-title">
            <p>ACTIVE CONNECTION</p>
            <h2 id="exit-minigame-title">Exit this minigame?</h2>
            <span>Leaving now may abandon an active partner and end the current round.</span>
            <div>
              <button type="button" on:click={() => pendingPage = null}>STAY IN GAME</button>
              <button class="exit-button" type="button" on:click={confirmMinigameExit}>EXIT MINIGAME</button>
            </div>
          </section>
        </div>
      {/if}

      {#if !$sessionState.bothPlayersConnected}
        <div class="partner-status" role="status">
          Waiting for player 2 · {$sessionState.playerCount}/2 connected
        </div>
      {/if}

      <LogPage />

      {#if chatOpen}
        <ChatPanel on:close={toggleChat} />
      {/if}

      {#if showChatToast}
        <button class="chat-toast" type="button" on:click={toggleChat}>
          <strong>NEW MESSAGE</strong>
          <span>Open player chat</span>
        </button>
      {/if}
    </div>
  </div>
{/if}

<style lang="scss">
  .client {
    position: relative;
    width: 100%;
    height: 100%;
    background:
      radial-gradient(circle at 75% 20%, #09579724, transparent 38%),
      #020617;
    transition: grid-template-columns 0.4s ease-out;

    display: grid;
    grid-template-columns: 300px minmax(0, 1fr);
  }

  .client-collapsed {
    grid-template-columns: 70px minmax(0, 1fr);
  }

  .main-content {
    position: relative;
    width: 100%;
    min-width: 0;
    padding: 18px;
    grid-column: 2;
    box-shadow: inset 0 0 12px var(--box-shadow-color);

    display: flex;
    justify-content: center;
    align-items: center;
  }

  .exit-confirmation-backdrop {
    position: fixed;
    z-index: 1000;
    inset: 0;
    padding: 24px;
    background: #020617df;

    display: grid;
    place-items: center;
  }

  .exit-confirmation {
    width: min(460px, 100%);
    padding: 28px;
    color: #dbeafe;
    background: #0f172a;
    border: 1px solid #f837cd;
    box-shadow: 0 0 36px #f837cd44;

    > p {
      margin: 0 0 8px;
      color: #02fbfb;
      font-size: 0.68rem;
      font-weight: 800;
      letter-spacing: 2px;
    }

    h2 {
      margin: 0 0 12px;
      color: #ffffff;
      font-family: "Orbitron", "Space Mono", sans-serif;
    }

    > span {
      color: #aeb9c9;
      line-height: 1.6;
    }

    > div {
      margin-top: 24px;

      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }

    button {
      min-height: 42px;
      padding: 9px 14px;
      color: #dbeafe;
      background: #1e293b;
      border: 1px solid #64748b;
      font-weight: 800;
      cursor: pointer;
    }

    .exit-button {
      color: #160811;
      background: #ff83b9;
      border-color: #ffc5de;
    }
  }

  .partner-status {
    position: absolute;
    z-index: 5;
    top: 10px;
    left: 50%;
    padding: 8px 14px;
    color: #f8e69a;
    background: #2a260f;
    border: 1px solid #e0ad03;
    border-radius: 4px;
    font-size: 0.75rem;
    transform: translateX(-50%);
  }

  .chat-toast {
    position: absolute;
    z-index: 40;
    right: 24px;
    top: 24px;
    padding: 12px 16px;
    color: #e8edf6;
    background: #171329;
    border: 1px solid #ff75fd;
    border-radius: 4px;
    box-shadow: 0 0 22px #ff75fd44;
    cursor: pointer;
    text-align: left;

    display: grid;
    gap: 3px;

    strong {
      color: #ff75fd;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.72rem;
      letter-spacing: 1px;
    }

    span {
      font-size: 0.8rem;
    }
  }

  .status-screen {
    width: min(680px, calc(100vw - 40px));
    padding: 52px;
    color: #e8edf6;
    background: #070b16;
    border: 1px solid #4a98d9;
    border-top: 18px solid #19406c;
    border-radius: 6px;
    box-shadow: 0 0 60px #1472bf33;
    text-align: center;

    h1 {
      margin-bottom: 18px;
      color: #e8edf6;
      font-family: "Orbitron", "Space Mono", sans-serif;
    }

    p {
      line-height: 1.6;
    }
  }

  .status-code {
    margin-bottom: 12px;
    color: #e58271;
    font-size: 0.8rem;
    letter-spacing: 2px;
  }

  @media (max-width: 760px) {
    .main-content {
      padding: 14px;
    }
  }
</style>
