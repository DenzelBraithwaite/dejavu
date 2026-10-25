<script lang="ts">
  import { onDestroy } from 'svelte';
  import { fly } from 'svelte/transition';
  import { socket } from '../socket';
  import { campaignState } from '../stores/campaign';
  import location from '../stores/location';
  import { packetWarServerState, type PacketWarState } from '../stores/packetWarSession';
  import { sessionState, type PlayerId } from '../stores/session';
  import { setMinigameSessionActive } from '../stores/minigameSessions';
  import { netRunnersGameState } from '../stores/netRunnersGameState';
  import { settleWager } from '../game/wager';
  import WagerPanel from './WagerPanel.svelte';

  type GameMode = 'duel' | 'coop';

  let joined = false;
  let selectedMode: GameMode | null = null;
  let pendingMode: GameMode | null = null;
  let errorMessage = '';
  let waitingForStoryPartner = false;
  let showInstructions = false;
  let showWager = false;
  let wager = 0;
  let wagerSettled = false;
  let wagerArmed = false;
  let libraryOpen = false;
  let librarySide: 'runner' | 'boss' = 'runner';
  let editingCard: Record<string, any> | null = null;

  const emptyEffect = () => ({ type: 'damage', target: 'enemy', amount: 1 });

  $: playerId = $sessionState.playerId;
  $: launchedFromStory = $campaignState?.activeMinigame?.id === 'packet-war';
  $: player = playerId && $packetWarServerState
    ? $packetWarServerState.players[playerId]
    : null;
  $: opponentId = (playerId === 'p1' ? 'p2' : 'p1') as PlayerId;
  $: opponent = $packetWarServerState?.players[opponentId];
  $: isMyTurn = $packetWarServerState?.status === 'playing'
    && $packetWarServerState.activePlayer === playerId;
  $: rematchVote = playerId && $packetWarServerState
    ? $packetWarServerState.rematchVotes[playerId]
    : null;
  $: localPlayerWon = $packetWarServerState?.mode === 'coop'
    ? $packetWarServerState?.winner === 'players'
    : $packetWarServerState?.winner === playerId;
  $: setMinigameSessionActive(
    'packet-war',
    joined && !$packetWarServerState?.departureNotice
  );
  $: if (joined && $packetWarServerState?.status === 'playing') {
    wagerArmed = true;
  }
  $: if ($packetWarServerState?.status === 'finished' && wagerArmed && !wagerSettled) {
    settleWager(wager, localPlayerWon ? 'win' : 'loss');
    wagerSettled = true;
    wagerArmed = false;
  }

  onDestroy(() => {
    if (joined) {
      socket.emit('packet-war:leave');
    }
  });

  function selectMode(mode: GameMode): void {
    pendingMode = mode;
    errorMessage = '';
    waitingForStoryPartner = false;
    showInstructions = true;
  }

  function openConnection(): void {
    showInstructions = false;

    if (!pendingMode) {
      return;
    }

    showWager = true;
  }

  function confirmWager(event: CustomEvent<number>): void {
    wager = event.detail;
    wagerSettled = false;
    wagerArmed = false;
    showWager = false;

    const mode = pendingMode;
    pendingMode = null;
    selectedMode = mode;
    joined = true;
    socket.emit('packet-war:join', mode, (result: { ok: boolean; error?: string }) => {
      if (!result.ok) {
        joined = false;
        selectedMode = null;
        errorMessage = result.error ?? 'Could not join Packettack.';
      }
    });
  }

  function closeInstructions(): void {
    showInstructions = false;
    pendingMode = null;
  }

  function playCard(handIndex: number): void {
    if (!isMyTurn) {
      return;
    }

    socket.emit('packet-war:play', handIndex, handleActionResult);
  }

  function passTurn(): void {
    socket.emit('packet-war:pass', handleActionResult);
  }

  function requestRematch(wantsRematch: boolean): void {
    socket.emit('packet-war:rematch', wantsRematch, handleActionResult);

    if (!wantsRematch) {
      leaveGame();
    }
  }

  function leaveGame(returnToLibrary = true): void {
    if (joined) {
      joined = false;
      socket.emit('packet-war:leave');
    }

    selectedMode = null;
    pendingMode = null;

    if (returnToLibrary) {
      location.set('minigames');
    }
  }

  function exitGame(): void {
    if (!launchedFromStory) {
      leaveGame();
      return;
    }

    socket.emit(
      'packet-war:story-complete',
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
    socket.emit('packet-war:story-cancel', handleActionResult);
  }

  function handleActionResult(result: { ok: boolean; error?: string }): void {
    errorMessage = result.ok ? '' : result.error ?? 'The program failed to execute.';
  }

  function outcomeTitle(): string {
    const winner = $packetWarServerState?.winner;

    if ($packetWarServerState?.mode === 'coop') {
      return winner === 'players' ? 'BREACH COMPLETE' : 'RUNNERS FLATLINED';
    }

    return winner === playerId ? 'NETWORK SEIZED' : 'CONNECTION TERMINATED';
  }

  function cardAccent(cardId: string): string {
    const accents: Record<string, string> = {
      spike: 'pink',
      firewall: 'cyan',
      leech: 'green',
      worm: 'yellow',
      reboot: 'blue',
      overclock: 'purple',
      railgun: 'pink',
      fortress: 'cyan',
      blackhole: 'purple',
      uplink: 'yellow',
      guardian: 'cyan',
      meshRepair: 'green',
      darkMirror: 'purple',
      iceStrike: 'pink',
      iceInfect: 'yellow',
      iceReboot: 'blue',
      iceFirewall: 'cyan'
    };

    return $packetWarServerState?.programs?.[cardId]?.color ?? accents[cardId] ?? 'cyan';
  }

  function createCard(): void {
    const availability = librarySide === 'boss' ? 'boss' : 'runner';
    editingCard = {
      id: '',
      name: '',
      cost: 1,
      description: '',
      color: 'cyan',
      quantity: 1,
      boss: availability === 'boss',
      availability,
      multiplayerOnly: false,
      effects: [{
        ...emptyEffect(),
        target: availability === 'boss' ? 'players' : 'enemy'
      }]
    };
  }

  function editCard(card: Record<string, any>): void {
    editingCard = structuredClone(card);
    editingCard.availability = librarySide;
    editingCard.boss = librarySide === 'boss';
    editingCard.effects = editingCard.effects.map((effect: Record<string, any>) => {
      if (librarySide === 'boss') {
        return {
          ...effect,
          target: ['self', 'players'].includes(effect.target)
            ? effect.target
            : 'players'
        };
      }

      return {
        ...effect,
        type: effect.type === 'blind' ? 'damage' : effect.type,
        target: ['self', 'ally', 'both-allies', 'enemy'].includes(effect.target)
          ? effect.target
          : 'enemy'
      };
    });
  }

  function addEffect(): void {
    if (editingCard && editingCard.effects.length < 3) {
      editingCard.effects = [...editingCard.effects, {
        ...emptyEffect(),
        target: librarySide === 'boss' ? 'players' : 'enemy'
      }];
    }
  }

  function removeEffect(index: number): void {
    if (editingCard) {
      editingCard.effects = editingCard.effects.filter((_: unknown, effectIndex: number) => effectIndex !== index);
    }
  }

  function saveCard(): void {
    if (!editingCard) {
      return;
    }

    socket.emit('packet-war:save-card', editingCard, (result: { ok: boolean; error?: string }) => {
      handleActionResult(result);

      if (result.ok) {
        editingCard = null;
      }
    });
  }

  function deleteCard(card: Record<string, any>): void {
    socket.emit('packet-war:delete-card', {
      cardId: card.id,
      librarySide
    }, handleActionResult);
  }

  function visibleLibraryCards(
    side: 'runner' | 'boss',
    currentState: PacketWarState | null
  ): Record<string, any>[] {
    const library = side === 'boss'
      ? currentState?.bossLibrary
      : currentState?.cardLibrary;

    return Object.values(library ?? {});
  }

  function effectSymbol(effect: Record<string, any>): string {
    const symbols: Record<string, string> = {
      damage: '♦', shield: '◈', heal: '+', malware: '✹', income: '⇧',
      bandwidth: '⚡', purge: '✕', blind: '◉'
    };

    return symbols[effect.type] ?? '•';
  }

  function effectLabel(effect: Record<string, any>): string {
    const amount = ['purge', 'blind'].includes(effect.type) ? '' : String(effect.amount);
    return `${amount}${effectSymbol(effect)} ${String(effect.target).replaceAll('-', ' ')}`;
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      closeInstructions();
    }
  }
</script>

<svelte:window on:keydown={handleWindowKeydown} />

<section class="packet-war" class:hide={$location !== 'packet-war'} aria-labelledby="packet-war-title">
  <header>
    <span>DEJAVU://PACKETTACK</span>
    <div>
      <button type="button" on:click={() => showInstructions = true}>HOW TO PLAY</button>
      <button type="button" on:click={() => launchedFromStory ? cancelStoryGame() : leaveGame()}>
        {launchedFromStory ? 'EXIT TO STORY' : 'EXIT'}
      </button>
    </div>
  </header>

  {#if showInstructions}
    <div class="instructions-backdrop">
      <section
        class="instructions"
        role="dialog"
        aria-modal="true"
        aria-labelledby="packet-instructions-title"
      >
        <header class="instruction-header">
          <div>
            <p class="eyebrow">PACKETTACK FIELD MANUAL</p>
            <h2 id="packet-instructions-title">Break their integrity</h2>
          </div>
          <button type="button" aria-label="Close instructions" on:click={closeInstructions}>×</button>
        </header>
        <div class="instructions-scroll">
          <p>
            On your turn, play one program from your hand. Programs cost
            <strong>bandwidth</strong>, shown in the card's top-right corner. Each
            turn begins by granting bandwidth equal to your current
            <strong>income</strong>. Income begins at 2. Passing cycles the first
            card out of your hand, so an expensive hand cannot permanently trap you.
          </p>
          <div class="objective-grid">
            <article>
              <strong>DUEL MODE</strong>
              <span>Reduce the rival player's integrity from 30 to 0.</span>
            </article>
            <article>
              <strong>CO-OP BREACH</strong>
              <span>Work together to reduce BLACK ICE from 48 to 0 before either runner flatlines.</span>
            </article>
          </div>
          <dl>
            <div><dt>INTEGRITY</dt><dd>Your health. Reaching 0 ends the connection.</dd></div>
            <div><dt>SHIELD</dt><dd>Absorbs incoming damage before integrity is lost. Unused shield persists between turns until damage consumes it.</dd></div>
            <div><dt>MALWARE</dt><dd>Deals ongoing damage whenever the infected target's turn begins. Reboot removes all of your malware.</dd></div>
            <div><dt>INCOME</dt><dd>Bandwidth gained at the start of each turn. Uplink permanently raises income by 1, with no cap.</dd></div>
            <div><dt>DARK MIRROR</dt><dd>BLACK ICE can temporarily blind both runners to their teammate's telemetry.</dd></div>
          </dl>
          <h3>Program reference</h3>
          <div class="program-reference">
            <span><strong>SPIKE</strong> 6 damage</span>
            <span><strong>FIREWALL</strong> +5 persistent shield</span>
            <span><strong>LEECH</strong> 3 damage and repair 3</span>
            <span><strong>WORM</strong> 2 damage and install 2 malware</span>
            <span><strong>REBOOT</strong> repair 5 and remove malware</span>
            <span><strong>OVERCLOCK</strong> +2 bandwidth; keep your turn</span>
            <span><strong>RAILGUN · 5 BW</strong> 14 damage</span>
            <span><strong>FORTRESS · 4 BW</strong> +12 persistent shield</span>
            <span><strong>BLACK HOLE · 6 BW</strong> 8 damage and 4 malware</span>
            <span><strong>UPLINK · RARE</strong> permanently raise bandwidth income</span>
            <span><strong>GUARDIAN · CO-OP</strong> give your ally 7 shield</span>
            <span><strong>MESH REPAIR · CO-OP</strong> repair both runners by 6</span>
          </div>
          <p class="instruction-tip">
            In Co-op Breach, BLACK ICE draws from its configured deck after Player
            2 acts. Review that deck in the Card Library before opening a breach.
          </p>
        </div>
        <footer class="instruction-footer">
          <button type="button" on:click={openConnection}>
            {pendingMode ? 'OPEN CONNECTION' : 'RETURN TO BATTLE'}
          </button>
        </footer>
      </section>
    </div>
  {/if}

  {#if showWager}
    <div class="instructions-backdrop">
      <WagerPanel
        bind:wager
        balance={$netRunnersGameState.p1.money}
        accent="#5cf6a5"
        title="FUND THE ATTACK"
        actionLabel="LOCK WAGER & CONNECT"
        on:confirm={confirmWager}
        on:cancel={() => { showWager = false; pendingMode = null; }}
      />
    </div>
  {/if}

  {#if libraryOpen}
    <div class="card-library">
      <div class="library-heading">
        <div><p class="eyebrow">DECK CONFIGURATION</p><h1>CARD <span>LIBRARY</span></h1></div>
        <button type="button" on:click={() => { libraryOpen = false; editingCard = null; }}>BACK TO MENU</button>
      </div>
      <div class="library-tabs">
        <button class:active={librarySide === 'runner'} on:click={() => { librarySide = 'runner'; editingCard = null; }}>RUNNER CARDS</button>
        <button class:active={librarySide === 'boss'} on:click={() => { librarySide = 'boss'; editingCard = null; }}>BLACK ICE CARDS</button>
        <button class="create-card" on:click={createCard}>+ NEW CARD</button>
      </div>

      {#if editingCard}
        <section class="card-editor">
          <div class="editor-grid">
            <label>TITLE<input maxlength="28" bind:value={editingCard.name}></label>
            <label>COST<input type="number" min="0" max="20" bind:value={editingCard.cost}></label>
            <label>COLOR<select bind:value={editingCard.color}><option>pink</option><option>cyan</option><option>green</option><option>yellow</option><option>blue</option><option>purple</option></select></label>
            <label>DECK WEIGHT<input type="number" min="0" max="20" bind:value={editingCard.quantity}></label>
            <label>DECK<input value={librarySide === 'boss' ? 'BLACK ICE' : 'RUNNER'} disabled></label>
            <label class="description-field">DESCRIPTION<input maxlength="140" bind:value={editingCard.description}></label>
            {#if editingCard.availability !== 'boss'}<label class="check-field"><input type="checkbox" bind:checked={editingCard.multiplayerOnly}> CO-OP ONLY</label>{/if}
          </div>
          <div class="effect-editor">
            <div class="effect-heading"><strong>EFFECTS · MAX 3</strong><button disabled={editingCard.effects.length >= 3} on:click={addEffect}>+ EFFECT</button></div>
            {#each editingCard.effects as effect, index}
              <div class="effect-row">
                <select bind:value={effect.type}><option value="damage">Damage</option><option value="shield">Shield</option><option value="heal">Heal</option><option value="malware">Malware</option><option value="income">Income</option><option value="bandwidth">Bandwidth</option><option value="purge">Purge malware</option>{#if editingCard.availability === 'boss'}<option value="blind">Blind ally vision (BLACK ICE only)</option>{/if}</select>
                <select bind:value={effect.target}>
                  {#if editingCard.availability !== 'boss'}<option value="self">Self</option><option value="ally">Ally</option><option value="both-allies">Both allies</option><option value="enemy">Enemy</option>{/if}
                  {#if editingCard.availability !== 'runner'}<option value="players">All runners</option>{#if editingCard.availability === 'boss'}<option value="self">BLACK ICE</option>{/if}{/if}
                </select>
                <input type="number" min="0" max="99" bind:value={effect.amount} aria-label="Effect amount">
                <button class="remove-effect" on:click={() => removeEffect(index)} aria-label="Remove effect">×</button>
              </div>
            {/each}
          </div>
          <div class="editor-actions"><button on:click={() => editingCard = null}>CANCEL</button><button class="save-card" on:click={saveCard}>SAVE CARD</button></div>
        </section>
      {/if}

      <div class="library-card-grid">
        {#each visibleLibraryCards(librarySide, $packetWarServerState) as card (card.id)}
          <article class="library-card library-card--{card.color}">
            <span>{card.cost} ⚡ · {librarySide.toUpperCase()}</span><h2>{card.name}</h2><p>{card.description || 'Custom packet program.'}</p>
            <div>{#each card.effects as effect}<small>{effectLabel(effect)}</small>{/each}</div>
            <footer><span>WEIGHT {card.quantity}</span><button on:click={() => editCard(card)}>EDIT</button>{#if !card.builtIn}<button class="delete" on:click={() => deleteCard(card)}>DELETE</button>{/if}</footer>
          </article>
        {/each}
      </div>
      {#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}
    </div>
  {:else if !selectedMode}
    <div class="menu-screen">
      <p class="eyebrow">TACTICAL NETWORK COMBAT</p>
      <h1 id="packet-war-title">PACKET<span>TACK</span></h1>
      <p>
        Spend bandwidth, deploy hostile programs, and protect your deck before
        the connection collapses.
      </p>
      <div class="mode-grid">
        <button type="button" on:click={() => selectMode('duel')} disabled={!$sessionState.bothPlayersConnected}>
          <strong>DUEL MODE</strong>
          <span>Two runners enter. One network remains.</span>
        </button>
        <button type="button" on:click={() => selectMode('coop')} disabled={!$sessionState.bothPlayersConnected}>
          <strong>CO-OP BREACH</strong>
          <span>Join bandwidth against hostile BLACK ICE.</span>
        </button>
        <button type="button" on:click={() => libraryOpen = true}>
          <strong>CARD LIBRARY</strong>
          <span>Create programs, tune deck weights, and configure BLACK ICE.</span>
        </button>
      </div>
      {#if !$sessionState.bothPlayersConnected}
        <p class="connection-note">Both Packettack modes require two connected players.</p>
      {/if}
      {#if errorMessage}
        <p class="error" role="alert">{errorMessage}</p>
      {/if}
    </div>
  {:else if $packetWarServerState?.status === 'waiting'}
    <div class="waiting-screen">
      <div class="packet-loader">
        <i></i><i></i><i></i><i></i>
      </div>
      <p class="eyebrow">{$packetWarServerState.departureNotice ? 'CONNECTION SEVERED' : selectedMode === 'coop' ? 'OPENING SHARED BREACH' : 'AWAITING RIVAL DECK'}</p>
      <h1>{$packetWarServerState.participantCount}/2</h1>
      <p>{$packetWarServerState.departureNotice ?? 'The second player must select the same mode.'}</p>
      {#if $packetWarServerState.departureNotice}
        <button type="button" on:click={() => leaveGame(false)}>RETURN TO MAIN MENU</button>
      {/if}
    </div>
  {:else if $packetWarServerState}
    <div class="battle-screen">
      <div class="battle-header">
        <div>
          <p class="eyebrow">{$packetWarServerState.mode === 'coop' ? 'CO-OP BREACH' : 'DUEL MODE'} · ROUND {$packetWarServerState.round}</p>
          <h1 id="packet-war-title">PACKET<span>TACK</span></h1>
        </div>
        <div class="turn-indicator" class:turn-indicator--active={isMyTurn}>
          {isMyTurn ? 'YOUR TURN' : `${opponent?.name ?? 'RIVAL'} ACTIVE`}
        </div>
      </div>

      {#if $packetWarServerState.status !== 'finished'}
        {#key `${$packetWarServerState.activePlayer}-${$packetWarServerState.round}`}
          <div class="turn-announcement" class:turn-announcement--mine={isMyTurn}>
            <strong>{isMyTurn ? 'EXECUTION WINDOW OPEN' : 'REMOTE PLAYER EXECUTING'}</strong>
            <span>{isMyTurn ? 'Choose a program or pass the turn.' : 'Incoming network activity…'}</span>
          </div>
        {/key}
      {/if}

      <div class="combatants">
        <article class="combatant combatant--player">
          <p>LOCAL DECK</p>
          <h2>{player?.name}</h2>
          <div class="meter-row">
            <span>INTEGRITY</span>
            <strong>{player?.integrity}/30</strong>
          </div>
          <div class="integrity-meter"><i style={`width: ${((player?.integrity ?? 0) / 30) * 100}%`}></i></div>
          <div class="status-chips">
            <span class="status-chip status-chip--shield" title="Shield">◈ <strong>{player?.shield}</strong></span>
            <span class="status-chip status-chip--malware" title="Malware">✹ <strong>{player?.malware}</strong></span>
            <span class="status-chip status-chip--bandwidth" title="Bandwidth">⚡ <strong>{player?.bandwidth}</strong></span>
            <span class="status-chip status-chip--income" title="Bandwidth income">⇧ <strong>+{player?.bandwidthIncome}</strong></span>
          </div>

          {#if $packetWarServerState.mode === 'coop'}
            <div class="teammate-telemetry" class:teammate-telemetry--blinded={$packetWarServerState.breach.teamStatsBlinded}>
              <p>ALLY TELEMETRY · {opponent?.name}</p>
              {#if $packetWarServerState.breach.teamStatsBlinded}
                <strong>DARK MIRROR // SIGNAL BLINDED</strong>
              {:else}
                <div>
                  <span>♥ <strong>{opponent?.integrity}/30</strong></span>
                  <span>◈ <strong>{opponent?.shield}</strong></span>
                  <span>✹ <strong>{opponent?.malware}</strong></span>
                  <span>⚡ <strong>{opponent?.bandwidth}</strong></span>
                  <span>⇧ <strong>+{opponent?.bandwidthIncome}</strong></span>
                </div>
              {/if}
            </div>
          {/if}
        </article>

        <div class="route-visual" aria-hidden="true">
          <i></i><i></i><i></i>
          <span>PACKET ROUTE</span>
        </div>

        <article class="combatant combatant--target">
          {#if $packetWarServerState.mode === 'coop'}
            <p>HOSTILE SYSTEM</p>
            <h2>{$packetWarServerState.breach.name}</h2>
            <div class="meter-row">
              <span>INTEGRITY</span>
              <strong>{$packetWarServerState.breach.integrity}/48</strong>
            </div>
            <div class="integrity-meter integrity-meter--enemy"><i style={`width: ${($packetWarServerState.breach.integrity / 48) * 100}%`}></i></div>
            <div class="status-chips">
              <span class="status-chip status-chip--shield" title="Shield">◈ <strong>{$packetWarServerState.breach.shield}</strong></span>
              <span class="status-chip status-chip--malware" title="Malware">✹ <strong>{$packetWarServerState.breach.malware}</strong></span>
            </div>
          {:else}
            <p>RIVAL DECK</p>
            <h2>{opponent?.name}</h2>
            <div class="meter-row">
              <span>INTEGRITY</span>
              <strong>{opponent?.integrity}/30</strong>
            </div>
            <div class="integrity-meter integrity-meter--enemy"><i style={`width: ${((opponent?.integrity ?? 0) / 30) * 100}%`}></i></div>
            <div class="status-chips">
              <span class="status-chip status-chip--shield" title="Shield">◈ <strong>{opponent?.shield}</strong></span>
              <span class="status-chip status-chip--malware" title="Malware">✹ <strong>{opponent?.malware}</strong></span>
            </div>
          {/if}
        </article>
      </div>

      {#if $packetWarServerState.lastAllyProgram}
        <div class="last-transmission last-transmission--ally" aria-live="polite">
          <div class="last-transmission__label">
            <span>{$packetWarServerState.mode === 'coop' ? 'LAST ALLY PLAY' : 'LAST TRANSMISSION'}</span>
            <strong>{$packetWarServerState.lastAllyProgram.actor}</strong>
          </div>
          <div class="last-transmission__card last-transmission__card--{cardAccent($packetWarServerState.lastAllyProgram.cardId ?? '')}">
            <strong>{$packetWarServerState.lastAllyProgram.cardName}</strong>
            <span>{$packetWarServerState.programs[$packetWarServerState.lastAllyProgram.cardId ?? '']?.description}</span>
          </div>
        </div>
      {/if}

      {#if $packetWarServerState.mode === 'coop' && $packetWarServerState.lastBreachProgram}
        <div class="last-transmission last-transmission--hostile" aria-live="polite">
          <div class="last-transmission__label">
            <span>LAST BLACK ICE PLAY</span>
            <strong>{$packetWarServerState.lastBreachProgram.actor}</strong>
          </div>
          <div class="last-transmission__card last-transmission__card--{cardAccent($packetWarServerState.lastBreachProgram.cardId ?? '')}">
            <strong>{$packetWarServerState.lastBreachProgram.cardName}</strong>
            <span>{$packetWarServerState.programs[$packetWarServerState.lastBreachProgram.cardId ?? '']?.description}</span>
          </div>
        </div>
      {/if}

      {#if $packetWarServerState.status === 'finished'}
        <div class="result-panel" class:result-panel--victory={localPlayerWon} class:result-panel--defeat={!localPlayerWon}>
          <p class="eyebrow">CONNECTION CLOSED</p>
          <h2>{outcomeTitle()}</h2>

          {#if waitingForStoryPartner}
            <p>Waiting for your partner to close their deck…</p>
          {:else if launchedFromStory}
            <button type="button" on:click={exitGame}>RETURN TO STORY</button>
          {:else if rematchVote}
            <p>Rematch accepted. Waiting for the other player…</p>
          {:else}
            <div>
              <button type="button" on:click={() => requestRematch(true)}>REMATCH</button>
              <button class="secondary" type="button" on:click={() => requestRematch(false)}>LIBRARY</button>
            </div>
          {/if}
        </div>
      {:else}
        <div class="hand-panel">
          <div class="hand-heading">
            <div>
              <p class="eyebrow">PROGRAM HAND</p>
              <p>Select one executable. Your income grants fresh bandwidth at the start of each turn.</p>
            </div>
            <button type="button" disabled={!isMyTurn} on:click={passTurn}>PASS TURN</button>
          </div>

          <div class="program-hand">
            {#each player?.hand ?? [] as cardId, index}
              <button
                class="program-card program-card--{cardAccent(cardId)}"
                type="button"
                disabled={!isMyTurn || ($packetWarServerState.programs[cardId]?.cost ?? 99) > (player?.bandwidth ?? 0)}
                on:click={() => playCard(index)}
              >
                <span class="program-cost">−{$packetWarServerState.programs[cardId]?.cost} ⚡</span>
                <strong>{$packetWarServerState.programs[cardId]?.name}</strong>
                <span class="program-effects">
                  {#each $packetWarServerState.programs[cardId]?.effects ?? [] as effect}
                    <small title={`${effect.type} ${effect.target}`}>{effectLabel(effect)}</small>
                  {/each}
                </span>
                <span class="program-description">{$packetWarServerState.programs[cardId]?.description}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <div class="system-log" aria-live="polite">
        <p class="eyebrow">NETWORK LOG</p>
        <div class="log-entries">
          {#each [...$packetWarServerState.log].reverse() as event (event.id)}
            <div
              class="log-entry"
              class:log-entry--program={event.type === 'program'}
              in:fly={{ y: -14, duration: 280 }}
            >
              {#if event.type === 'program'}
                <span class="log-card log-card--{cardAccent(event.cardId ?? '')}">{event.cardName}</span>
              {:else}
                <span class="log-marker">SYS</span>
              {/if}
              <span>
                {#if event.actor}
                  <strong class:log-actor--hostile={event.actorType === 'black-ice'} class:log-actor--ally={event.actorType === 'ally'}>{event.actor}</strong>{event.message.slice(event.actor.length)}
                {:else}
                  {event.message}
                {/if}
              </span>
            </div>
          {/each}
        </div>
      </div>

      {#if errorMessage}
        <p class="error" role="alert">{errorMessage}</p>
      {/if}
    </div>
  {/if}
</section>

<style lang="scss">
  .packet-war {
    width: 100%;
    height: 100%;
    overflow: hidden;
    color: #ebefff;
    background:
      radial-gradient(circle at 80% 20%, #8a4dff1f, transparent 30%),
      radial-gradient(circle at 10% 80%, #00e5ff18, transparent 34%),
      #060612;
    border: 1px solid #8a4dff;
    border-radius: 8px;
    box-shadow: 0 0 36px #8a4dff33;

    > header {
      min-height: 42px;
      padding: 9px 14px;
      color: #bd9cff;
      background: #100d20;
      border-bottom: 1px solid #5d3c9c;
      font-size: 0.72rem;
      letter-spacing: 2px;

      display: flex;
      justify-content: space-between;
      align-items: center;

      button {
        padding: 6px 12px;
        color: #ff86b8;
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
    background: #04030deb;

    display: grid;
    place-items: center;
  }

  .instructions {
    width: min(720px, 100%);
    max-height: 90vh;
    overflow: hidden;
    color: #ebe6ff;
    background: #0c0b19;
    border: 1px solid #8a4dff;
    box-shadow: 0 0 42px #8a4dff55;

    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;

    h2 {
      margin: 10px 0 14px;
      color: #ffffff;
      font-size: clamp(1.35rem, 4vw, 2rem);
    }

    .instructions-scroll > p:not(.eyebrow) {
      color: #b6b0c9;
      line-height: 1.65;
    }

    .instructions-scroll > p strong,
    dt {
      color: #bd9cff;
    }

    dl {
      margin: 20px 0;

      display: grid;
      gap: 8px;
    }

    dl div {
      padding: 11px;
      background: #151129;
      border-left: 3px solid #8a4dff;

      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 12px;
    }

    dt {
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-weight: 800;
    }

    dd {
      margin: 0;
      color: #b6b0c9;
      line-height: 1.45;
    }

    .instruction-footer button {
      width: 100%;
      min-height: 46px;
      color: #ffffff;
      background: #5c38a6;
      border: 1px solid #bd9cff;
      font-weight: 800;
      cursor: pointer;
    }
  }

  .instruction-header {
    padding: 22px 24px 14px;
    border-bottom: 1px solid #30294b;

    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;

    button {
      width: 34px;
      height: 34px;
      color: #ff9bc5;
      background: #1d1022;
      border: 1px solid #9f395d;
      font-size: 1.25rem;
      cursor: pointer;
    }
  }

  .instructions-scroll {
    min-height: 0;
    padding: 18px 24px;
    overflow-y: auto;
  }

  .instruction-footer {
    padding: 14px 24px 20px;
    background: #0c0b19;
    border-top: 1px solid #30294b;
  }

  .objective-grid {
    margin: 20px 0;

    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;

    article {
      padding: 14px;
      background: #111025;
      border: 1px solid #3c3260;

      display: grid;
      gap: 7px;
    }

    strong {
      color: #7ef9ff;
      font-family: "Orbitron", "Space Mono", sans-serif;
    }

    span {
      color: #aaa4bf;
      font-size: 0.78rem;
      line-height: 1.5;
    }
  }

  .instruction-tip {
    padding: 12px;
    color: #f8e69a !important;
    background: #28220b;
    border: 1px solid #ad781c;
  }

  .instructions h3 {
    margin: 20px 0 10px;
    color: #ffffff;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: 0.9rem;
  }

  .program-reference {
    margin-bottom: 20px;

    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7px;

    span {
      padding: 9px;
      color: #aaa4bf;
      background: #111025;
      border: 1px solid #30294b;
      font-size: 0.7rem;
    }

    strong {
      display: block;
      margin-bottom: 3px;
      color: #bd9cff;
      font-family: "Orbitron", "Space Mono", sans-serif;
    }
  }

  h1,
  h2,
  button,
  .eyebrow,
  .turn-indicator {
    font-family: "Orbitron", "Space Mono", sans-serif;
  }

  .turn-announcement {
    margin-bottom: 14px;
    padding: 10px 14px;
    color: #ffafd0;
    background: #2a0b1b;
    border: 1px solid #ff4e9b;
    box-shadow: 0 0 18px #ff4e9b33;
    animation: turn-flash 0.55s ease-out;

    display: flex;
    justify-content: space-between;
    align-items: center;

    strong {
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.75rem;
      letter-spacing: 1px;
    }

    span {
      color: #c790a7;
      font-size: 0.7rem;
    }

    &--mine {
      color: #061015;
      background: #00d7eb;
      border-color: #c5fbff;
      box-shadow: 0 0 18px #00d7eb66;

      span {
        color: #164851;
      }
    }
  }

  h1 {
    margin: 8px 0 16px;
    font-size: clamp(2.2rem, 6vw, 4.8rem);
    letter-spacing: 3px;

    span {
      color: #ff4e9b;
    }
  }

  .eyebrow {
    margin: 0;
    color: #9b72ff;
    font-size: 0.67rem;
    letter-spacing: 2px;
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

    > p:not(.eyebrow, .error, .connection-note) {
      max-width: 60ch;
      color: #a7acc3;
      line-height: 1.6;
    }
  }

  .mode-grid {
    width: min(980px, 100%);
    margin-top: 34px;

    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;

    button {
      min-height: 130px;
      padding: 22px;
      color: #ebe6ff;
      background: #120e24;
      border: 1px solid #7047c2;
      cursor: pointer;

      display: grid;
      gap: 10px;

      &:hover:not(:disabled),
      &:focus-visible {
        color: #060612;
        background: #a783ff;
        outline: 2px solid #ffffff;
      }

      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      span {
        font-family: "Space Mono", monospace;
        font-size: 0.76rem;
      }
    }
  }

  .connection-note {
    margin-top: 18px;
    color: #f2d40e;
    font-size: 0.75rem;
  }

  .packet-loader {
    margin-bottom: 32px;

    display: flex;
    gap: 14px;

    i {
      width: 18px;
      height: 18px;
      background: #8a4dff;
      box-shadow: 0 0 14px #8a4dff;
      animation: packet-flow 1.2s ease-in-out infinite;

      &:nth-child(2) {
        animation-delay: 0.15s;
      }

      &:nth-child(3) {
        animation-delay: 0.3s;
      }

      &:nth-child(4) {
        animation-delay: 0.45s;
      }
    }
  }

  .battle-screen {
    height: calc(100% - 42px);
    padding: 20px;
    overflow-y: auto;
  }

  .battle-header {
    display: flex;
    justify-content: space-between;
    align-items: center;

    h1 {
      margin: 4px 0 14px;
      font-size: clamp(1.9rem, 4vw, 3rem);
    }
  }

  .turn-indicator {
    padding: 10px 14px;
    color: #a7acc3;
    border: 1px solid #45415d;
    font-size: 0.72rem;
    letter-spacing: 1px;

    &--active {
      color: #060612;
      background: #00d7eb;
      border-color: #8effff;
      box-shadow: 0 0 18px #00d7eb66;
    }
  }

  .combatants {
    display: grid;
    grid-template-columns: minmax(240px, 1fr) 150px minmax(240px, 1fr);
    gap: 16px;
    align-items: stretch;
  }

  .combatant,
  .hand-panel,
  .result-panel,
  .system-log {
    background: #0c0b19de;
    border: 1px solid #3c3260;
  }

  .combatant {
    padding: 18px;

    > p {
      margin: 0 0 5px;
      color: #7c7693;
      font-size: 0.65rem;
      letter-spacing: 2px;
    }

    h2 {
      margin: 0 0 18px;
      color: #7ef9ff;
    }

    &--target h2 {
      color: #ff83b9;
    }
  }

  .meter-row {
    margin-bottom: 6px;
    font-size: 0.72rem;

    display: flex;
    justify-content: space-between;
  }

  .integrity-meter {
    height: 10px;
    overflow: hidden;
    background: #17152a;
    border: 1px solid #27616d;

    i {
      display: block;
      height: 100%;
      background: #00d7eb;
      box-shadow: 0 0 10px #00d7eb;
      transition: width 0.35s ease;
    }

    &--enemy {
      border-color: #77324f;

      i {
        background: #ff4e9b;
        box-shadow: 0 0 10px #ff4e9b;
      }
    }
  }

  .status-chips {
    margin-top: 14px;

    display: flex;
    flex-wrap: wrap;
    gap: 7px;

    .status-chip {
      min-width: 58px;
      padding: 7px 9px;
      color: #b9b2d2;
      background: #16132b;
      border: 1px solid #3c3260;
      font-size: 0.66rem;

      display: grid;
      grid-template-columns: auto auto;
      align-items: center;
      gap: 10px;

      strong {
        color: #ffffff;
        font-family: "Orbitron", "Space Mono", sans-serif;
        font-size: 1rem;
      }
    }

    .status-chip--shield {
      color: #7ef9ff;
      border-color: #167c88;
    }

    .status-chip--malware {
      color: #ff9bc5;
      border-color: #9f395d;
    }

    .status-chip--bandwidth {
      color: #f7dc62;
      border-color: #766719;
    }

    .status-chip--income {
      color: #bd9cff;
      border-color: #7047c2;
    }
  }

  .teammate-telemetry {
    margin-top: 14px;
    padding: 11px;
    background: #071c22;
    border: 1px solid #167c88;

    > p {
      margin: 0 0 8px;
      color: #7ef9ff;
      font-size: 0.6rem;
      letter-spacing: 1.5px;
    }

    > div {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(48px, 1fr));
      gap: 6px;
    }

    span {
      color: #829da4;
      font-size: 0.58rem;

      display: grid;
      gap: 2px;
    }

    strong {
      color: #d8fbff;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.75rem;
    }

    &--blinded {
      background: #1b0d2d;
      border-color: #9b72ff;

      > strong {
        color: #c9b4ff;
        font-size: 0.66rem;
        letter-spacing: 1px;
      }
    }
  }

  .route-visual {
    position: relative;
    min-height: 120px;

    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;

    &::before {
      content: '';
      position: absolute;
      left: 5px;
      right: 5px;
      height: 1px;
      background: #7047c2;
    }

    i {
      z-index: 1;
      width: 12px;
      height: 12px;
      background: #9b72ff;
      box-shadow: 0 0 12px #9b72ff;
    }

    span {
      position: absolute;
      bottom: 17px;
      color: #625b78;
      font-size: 0.58rem;
      letter-spacing: 1px;
    }
  }

  .hand-panel,
  .result-panel {
    margin-top: 16px;
    padding: 18px;
  }

  .last-transmission {
    margin-top: 16px;
    padding: 12px 16px;
    background: #100d20;
    border: 1px solid #4d3d78;

    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 18px;
  }

  .last-transmission__label {
    display: grid;
    gap: 5px;

    span {
      color: #77718c;
      font-size: 0.62rem;
      letter-spacing: 2px;
    }

    strong {
      color: #ffffff;
    }
  }

  .last-transmission__card {
    min-width: min(360px, 60%);
    padding: 10px 14px;
    background: #0b1920;
    border-left: 4px solid #00d7eb;

    display: grid;
    gap: 4px;

    strong {
      color: #7ef9ff;
      font-family: "Orbitron", "Space Mono", sans-serif;
      letter-spacing: 1px;
    }

    span {
      color: #a7acc3;
      font-size: 0.7rem;
    }

    &--pink {
      border-color: #ff4e9b;

      strong {
        color: #ff9bc5;
      }
    }

    &--green {
      border-color: #53e6a1;

      strong {
        color: #8ff0c3;
      }
    }

    &--yellow {
      border-color: #f2d40e;

      strong {
        color: #f8e69a;
      }
    }

    &--blue {
      border-color: #4a98d9;

      strong {
        color: #8fc8f6;
      }
    }

    &--purple {
      border-color: #9b72ff;

      strong {
        color: #c5adff;
      }
    }
  }

  .last-transmission--ally {
    border-color: #53e6a1;
  }

  .last-transmission--hostile {
    border-color: #ff4e69;

    .last-transmission__label strong {
      color: #ff6f82;
    }
  }

  .hand-heading {
    margin-bottom: 16px;

    display: flex;
    justify-content: space-between;
    align-items: center;

    p:not(.eyebrow) {
      margin: 5px 0 0;
      color: #85809a;
      font-size: 0.72rem;
    }

    button {
      padding: 9px 13px;
      color: #bcb5d0;
      background: transparent;
      border: 1px solid #51496b;
      cursor: pointer;

      &:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
    }
  }

  .program-hand {
    display: grid;
    grid-template-columns: repeat(5, minmax(105px, 1fr));
    gap: 8px;
  }

  .program-card {
    position: relative;
    min-height: 118px;
    padding: 11px;
    color: #e7faff;
    background: #0b1920;
    border: 1px solid #00d7eb;
    cursor: pointer;
    text-align: left;

    display: flex;
    flex-direction: column;
    gap: 7px;

    strong {
      margin-top: 15px;
      color: #7ef9ff;
      letter-spacing: 1px;
    }

    .program-description {
      color: #a7acc3;
      font-family: "Space Mono", monospace;
      font-size: 0.72rem;
      line-height: 1.4;
    }

    &:hover:not(:disabled),
    &:focus-visible {
      transform: translateY(-4px);
      box-shadow: 0 0 20px #00d7eb55;
      outline: 2px solid #ffffff;
    }

    &:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    &--pink {
      border-color: #ff4e9b;
    }

    &--green {
      border-color: #53e6a1;
    }

    &--yellow {
      border-color: #f2d40e;
    }

    &--blue {
      border-color: #4a98d9;
    }

    &--purple {
      border-color: #9b72ff;
    }
  }

  .program-cost {
    position: absolute;
    top: 10px;
    right: 10px;
    color: #f7dc62 !important;
    font-size: 0.62rem !important;
  }

  .program-effects {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;

    small {
      padding: 3px 5px;
      color: #ffffff;
      background: #ffffff12;
      border: 1px solid #ffffff22;
      font-size: 0.62rem;
      text-transform: uppercase;
    }
  }

  .card-library {
    height: calc(100% - 42px);
    padding: 22px;
    overflow-y: auto;
  }

  .library-heading,
  .library-tabs,
  .editor-actions,
  .effect-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .library-heading h1 {
    margin: 4px 0 16px;
    font-size: clamp(1.8rem, 5vw, 3.5rem);
  }

  .library-heading button,
  .library-tabs button,
  .card-editor button,
  .library-card button {
    padding: 8px 11px;
    color: #d7ccf7;
    background: #151029;
    border: 1px solid #7047c2;
    cursor: pointer;
  }

  .library-tabs {
    justify-content: flex-start;
    margin-bottom: 16px;

    button.active,
    .create-card {
      color: #090612;
      background: #a783ff;
    }

    .create-card {
      margin-left: auto;
    }
  }

  .card-editor {
    margin-bottom: 20px;
    padding: 18px;
    background: #0c0b19;
    border: 1px solid #7047c2;
  }

  .editor-grid {
    display: grid;
    grid-template-columns: 2fr repeat(3, 1fr);
    gap: 10px;

    label {
      color: #9d91ba;
      font-size: 0.65rem;
      letter-spacing: 1px;

      display: grid;
      gap: 5px;
    }

    input,
    select {
      min-width: 0;
      padding: 9px;
      color: #ffffff;
      background: #15132a;
      border: 1px solid #40375f;
    }

    .description-field {
      grid-column: span 3;
    }

    .check-field {
      display: flex;
      align-items: center;
    }
  }

  .effect-editor {
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid #30294b;
  }

  .effect-row {
    margin-top: 8px;

    display: grid;
    grid-template-columns: 1fr 1fr 90px 38px;
    gap: 7px;

    select,
    input {
      min-width: 0;
      padding: 8px;
      color: #ffffff;
      background: #15132a;
      border: 1px solid #40375f;
    }
  }

  .editor-actions {
    justify-content: flex-end;
    margin-top: 16px;

    .save-card {
      color: #06120b;
      background: #55f09a;
      border-color: #baffd5;
    }
  }

  .library-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 11px;
  }

  .library-card {
    padding: 14px;
    background: #0c0b19;
    border: 1px solid #526071;

    > span {
      float: right;
      color: #f7dc62;
    }

    h2 {
      margin: 0 0 8px;
      color: #ffffff;
      font-size: 1rem;
    }

    p {
      min-height: 38px;
      color: #aaa4bf;
      font-size: 0.72rem;
    }

    > div {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;

      small {
        padding: 4px 6px;
        background: #ffffff10;
        border: 1px solid #ffffff1c;
        text-transform: uppercase;
      }
    }

    footer {
      margin-top: 13px;

      display: flex;
      align-items: center;
      gap: 6px;

      > span {
        margin-right: auto;
        color: #7e768f;
        font-size: 0.63rem;
      }

      .delete {
        color: #ff8da8;
        border-color: #8f2d47;
      }
    }

    &--pink { border-color: #ff4e9b; }
    &--cyan { border-color: #00d7eb; }
    &--green { border-color: #53e6a1; }
    &--yellow { border-color: #f2d40e; }
    &--blue { border-color: #4a98d9; }
    &--purple { border-color: #9b72ff; }
  }

  .result-panel {
    text-align: center;

    h2 {
      margin: 10px 0;
      color: #ff83b9;
    }

    > p:not(.eyebrow) {
      color: #a7acc3;
    }

    button {
      min-width: 160px;
      margin: 10px 5px 0;
      padding: 11px 16px;
      color: #ffffff;
      background: #5c38a6;
      border: 1px solid #a783ff;
      cursor: pointer;
    }

    .secondary {
      color: #aaa4bf;
      background: transparent;
      border-color: #51496b;
    }
  }

  .result-panel--victory {
    background:
      radial-gradient(circle at 50% 0, #53e6a126, transparent 60%),
      #071a14e8;
    border-color: #53e6a1;
    box-shadow: 0 0 28px #53e6a144;

    .eyebrow,
    h2 {
      color: #8ff0c3;
      text-shadow: 0 0 18px #53e6a177;
    }
  }

  .result-panel--defeat {
    border-color: #9f395d;

    h2 {
      color: #ff83b9;
    }
  }

  .system-log {
    margin-top: 16px;
    padding: 0;

    display: grid;
    grid-template-rows: auto minmax(0, 1fr);

    > .eyebrow {
      padding: 14px;
      background: #0c0b19;
      border-bottom: 1px solid #3c3260;
    }
  }

  .log-entries {
    min-height: 180px;
    max-height: 360px;
    padding: 6px 14px 14px;
    overflow-y: auto;
  }

  .log-entry {
    padding: 8px 0;
    border-bottom: 1px solid #242039;

    display: grid;
    grid-template-columns: 76px 1fr;
    align-items: start;
    gap: 10px;

    > span:last-child {
      color: #aaa4bf;
      font-size: 0.7rem;
      line-height: 1.45;
    }
  }

  .log-actor--ally {
    color: #65e9ae;
  }

  .log-actor--hostile {
    color: #ff6479;
  }

  .log-marker,
  .log-card {
    padding: 3px 5px;
    color: #7c7693;
    background: #17142a;
    border: 1px solid #3c3260;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: 0.56rem;
    text-align: center;
  }

  .log-card--cyan {
    color: #7ef9ff;
    border-color: #00d7eb;
  }

  .log-card--pink {
    color: #ff9bc5;
    border-color: #ff4e9b;
  }

  .log-card--green {
    color: #8ff0c3;
    border-color: #53e6a1;
  }

  .log-card--yellow {
    color: #f8e69a;
    border-color: #f2d40e;
  }

  .log-card--blue {
    color: #8fc8f6;
    border-color: #4a98d9;
  }

  .log-card--purple {
    color: #c5adff;
    border-color: #9b72ff;
  }

  .error {
    margin: 12px 0 0;
    padding: 10px;
    color: #ffd0dc;
    background: #3a1020;
    border: 1px solid #ff4e9b;
    font-size: 0.75rem;
  }

  @keyframes packet-flow {
    50% {
      opacity: 0.25;
      transform: translateY(-7px);
    }
  }

  @keyframes turn-flash {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
  }

  @media (max-width: 980px) {
    .combatants {
      grid-template-columns: 1fr 70px 1fr;
    }

    .program-hand {
      grid-template-columns: repeat(3, minmax(120px, 1fr));
    }
  }

  @media (max-width: 680px) {
    .mode-grid,
    .objective-grid,
    .program-reference,
    .combatants {
      grid-template-columns: 1fr;
    }

    .route-visual {
      min-height: 55px;
    }

    .program-hand {
      grid-template-columns: repeat(2, minmax(120px, 1fr));
    }

    .battle-header,
    .hand-heading {
      align-items: flex-start;
      gap: 12px;
      flex-direction: column;
    }

    .turn-announcement,
    .last-transmission {
      align-items: flex-start;
      flex-direction: column;
    }

    .last-transmission__card {
      width: 100%;
      min-width: 0;
    }
  }
</style>
