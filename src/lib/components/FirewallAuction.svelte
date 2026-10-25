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

  let screen: Screen = 'menu';
  let pendingMode: PlayMode = 'solo';
  let attack = 0;
  let defense = 0;
  let heal = false;
  let error = '';
  let waitingForStoryPartner = false;

  $: state = $arcadeStates['firewall-auction'] ?? null;
  $: playerId = ($sessionState.playerId ?? 'p1') as PlayerId;
  $: opponentId = playerId === 'p1' ? 'p2' : 'p1';
  $: availablePower = state?.power?.[playerId] ?? 0;
  $: actionCost = attack + defense + (heal ? 5 : 0);
  $: reservedPower = Math.max(0, availablePower - actionCost);
  $: submitted = Boolean(state?.submitted?.[playerId]);
  $: launchedFromStory = $campaignState?.activeMinigame?.id === 'firewall-auction';
  $: setMinigameSessionActive('firewall-auction', screen === 'game' && Boolean(state?.participants[playerId]));
  $: if (launchedFromStory && screen === 'menu') {
    pendingMode = $campaignState?.sessionMode === 'singleplayer' ? 'solo' : 'multi';
    screen = 'instructions';
  }
  $: if (state?.round) {
    state.round;
    heal = heal && availablePower >= 5;
    attack = Math.min(attack, availablePower);
    defense = Math.min(defense, Math.max(0, availablePower - attack - (heal ? 5 : 0)));
  }


  // The server owns both solo CPU decisions and multiplayer hidden bids.
  onDestroy(() => {
    if (screen === 'game') {
      socket.emit('arcade:leave', 'firewall-auction');
    }
  });

  function openInstructions(mode: PlayMode): void {
    pendingMode = mode;
    screen = 'instructions';
  }

  function begin(): void {
    attack = 0;
    defense = 0;
    heal = false;
    error = '';
    screen = 'game';
    socket.emit('arcade:join', 'firewall-auction', pendingMode, handleResult);
  }

  function setAttack(value: number): void {
    attack = Math.max(0, Math.min(value, availablePower - defense - (heal ? 5 : 0)));
  }

  function setDefense(value: number): void {
    defense = Math.max(0, Math.min(value, availablePower - attack - (heal ? 5 : 0)));
  }

  function toggleHeal(): void {
    if (heal) {
      heal = false;
      return;
    }

    if (availablePower < 5) {
      return;
    }

    heal = true;

    // Healing reserves five power, so trim defense before attack if the new action exceeds the budget.
    const overspend = Math.max(0, attack + defense + 5 - availablePower);
    const defenseReduction = Math.min(defense, overspend);

    defense -= defenseReduction;
    attack -= Math.max(0, overspend - defenseReduction);
  }

  function submitAllocation(): void {
    socket.emit(
      'arcade:action',
      {
        game: 'firewall-auction',
        action: { type: 'allocate', attack, defense, heal }
      },
      (result: { ok: boolean; error?: string }) => {
        handleResult(result);

        if (result.ok) {
          attack = 0;
          defense = 0;
          heal = false;
        }
      }
    );
  }

  function restart(): void {
    attack = 0;
    defense = 0;
    heal = false;
    waitingForStoryPartner = false;
    socket.emit('arcade:restart', 'firewall-auction');
  }

  function exitGame(): void {
    socket.emit('arcade:leave', 'firewall-auction');
    screen = 'menu';
    location.set('minigames');
  }

  function returnToMenu(): void {
    socket.emit('arcade:leave', 'firewall-auction');
    attack = 0;
    defense = 0;
    heal = false;
    waitingForStoryPartner = false;
    screen = 'menu';
  }

  function returnToStory(): void {
    socket.emit(
      'arcade:story-complete',
      'firewall-auction',
      (result: { ok: boolean; error?: string; waitingForPartner?: boolean }) => {
        error = result.ok ? '' : result.error ?? 'Could not return to the story.';
        waitingForStoryPartner = Boolean(result.waitingForPartner);
      }
    );
  }

  function handleResult(result: { ok: boolean; error?: string }): void {
    error = result.ok ? '' : result.error ?? 'Breach rejected that allocation.';
  }
</script>

<section class="firewall-auction" class:hide={$location !== 'firewall-auction'}>
  <header>
    <span>DEJAVU://BREACH</span>
    <button class="exit" on:click={exitGame}>EXIT</button>
  </header>

  {#if screen === 'menu'}
    <div class="menu">
      <p>SIMULTANEOUS PROCESSING DUEL</p>
      <h1>BREACH</h1>
      <span>Secretly divide power between attack, defense, healing, and your reserve.</span>
      <div>
        <button on:click={() => openInstructions('solo')}>1P VS CPU</button>
        <button on:click={() => openInstructions('multi')}>1P VS 2P</button>
      </div>
    </div>
  {:else if screen === 'instructions'}
    <div class="instructions">
      <p>BREACH PROTOCOL</p>
      <h2>Attack, repair, defend, or bank the advantage.</h2>
      <ul>
        <li>Both players secretly allocate available power to ATTACK, DEFENSE, and HEAL.</li>
        <li>Attack above the opponent's defense damages their ten-point system.</li>
        <li>Healing costs five power and restores three integrity, even above ten.</li>
        <li>Unspent power carries forward, then every player gains three power up to ten.</li>
        <li>After eight rounds, remaining integrity breaks ties; saved power is the final tiebreaker.</li>
        <li>There is no trace action: every decision is attack, defense, healing, or reserve.</li>
      </ul>
      <div>
        <button on:click={() => screen = 'menu'}>BACK</button>
        <button class="primary" on:click={begin}>OPEN BIDDING</button>
      </div>
    </div>
  {:else if state?.status === 'waiting'}
    <div class="waiting">
      <h2>WAITING FOR OPPONENT</h2>
      <p>{state.participantCount}/2 CONNECTED</p>
    </div>
  {:else if state}
    <div class="game">
      <div class="round">ROUND {state.round}/{state.maximumRounds}</div>

      <section class="combatants">
        <article>
          <span>YOUR SYSTEM</span>
          <strong>{state.integrity[playerId]}</strong>
          <div class="integrity"><i style={`width:${Math.min(100, state.integrity[playerId] / 10 * 100)}%`}></i></div>
          <small>{availablePower} POWER AVAILABLE</small>
        </article>
        <b>VS</b>
        <article class="hostile">
          <span>{state.players[opponentId].name}</span>
          <strong>{state.integrity[opponentId]}</strong>
          <div class="integrity"><i style={`width:${Math.min(100, state.integrity[opponentId] / 10 * 100)}%`}></i></div>
          <small>{state.power[opponentId]} POWER AVAILABLE</small>
        </article>
      </section>

      {#if state.status === 'playing'}
        <section class="allocation">
          <h2>{submitted ? 'ALLOCATION LOCKED' : 'ALLOCATE PROCESSING POWER'}</h2>
          {#if submitted}
            <p>Waiting for the opponent's encrypted bid…</p>
          {:else}
            <label>
              <span>ATTACK <strong>{attack}</strong></span>
              <input type="range" min="0" max={availablePower - defense - (heal ? 5 : 0)} value={attack} on:input={(event) => setAttack(Number(event.currentTarget.value))}>
            </label>
            <label>
              <span>DEFENSE <strong>{defense}</strong></span>
              <input type="range" min="0" max={availablePower - attack - (heal ? 5 : 0)} value={defense} on:input={(event) => setDefense(Number(event.currentTarget.value))}>
            </label>
            <button
              class:active={heal}
              class="heal-action"
              disabled={!heal && availablePower < 5}
              on:click={toggleHeal}
            >
              HEAL +3 <small>5 POWER</small>
            </button>
            <div class="reserve"><span>RESERVED</span><strong>{reservedPower}</strong></div>
            <button class="primary" on:click={submitAllocation}>LOCK ALLOCATION</button>
          {/if}
        </section>
      {/if}

      {#if state.lastReveal}
        <section class="reveal">
          <h3>ROUND {state.lastReveal.round} REVEAL</h3>
          <div>
            <p>YOU <strong>A{state.lastReveal[playerId].attack} / D{state.lastReveal[playerId].defense}{state.lastReveal[playerId].heal ? ' / H+3' : ''}</strong></p>
            <p>RIVAL <strong>A{state.lastReveal[opponentId].attack} / D{state.lastReveal[opponentId].defense}{state.lastReveal[opponentId].heal ? ' / H+3' : ''}</strong></p>
          </div>
        </section>
      {/if}

      <section class="log">
        {#each state.log.slice(0, 4) as entry}<p>{entry.message}</p>{/each}
      </section>

      {#if state.status === 'finished'}
        <section class:lost={state.winner !== playerId && state.winner !== 'tie'} class="result">
          <h2>{state.winner === 'tie' ? 'STALEMATE' : state.winner === playerId ? 'BREACH COMPLETE' : 'SYSTEM OFFLINE'}</h2>
          {#if waitingForStoryPartner}
            <p>Waiting for your opponent to return…</p>
          {:else if launchedFromStory}
            <button on:click={returnToStory}>RETURN TO STORY</button>
          {:else}
            <div class="result-actions">
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
  .firewall-auction {
    width: min(1000px, 100%);
    height: 100%;
    overflow: hidden;
    color: #f5eaff;
    background: #090410;
    border: 1px solid #d259ff;

    > header {
      min-height: 44px;
      padding: 9px 14px;
      color: #ec8cff;
      background: #1a0823;
      border-bottom: 1px solid #84329e;

      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  }

  button {
    padding: 9px 13px;
    color: #f5d5ff;
    background: #21082d;
    border: 1px solid #923caf;
    cursor: pointer;
  }

  button:hover,
  .primary {
    color: #17031d;
    background: #e274ff;
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
      max-width: 850px;
      margin: 0;
      color: #e274ff;
      font-size: clamp(2.6rem, 7vw, 5.8rem);
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
    padding: 18px;
    overflow-y: auto;
  }

  .round {
    color: #ffdc73;
    text-align: center;
    letter-spacing: 3px;
  }

  .combatants {
    margin: 18px 0;

    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 16px;

    article {
      padding: 18px;
      background: #10172a;
      border: 1px solid #5c7cc8;

      display: grid;
      gap: 8px;

      strong {
        font-size: 2.2rem;
      }
    }

    article.hostile {
      text-align: right;
      background: #2a0d18;
      border-color: #ba3f60;
    }
  }

  .integrity {
    height: 9px;
    background: #03050a;

    i {
      display: block;
      height: 100%;
      background: #65e2ff;
      transition: width 240ms ease;
    }

    .hostile & i {
      margin-left: auto;
      background: #ff577d;
    }
  }

  .allocation {
    max-width: 620px;
    margin: 0 auto;
    padding: 20px;
    background: #14091c;
    border: 1px solid #632576;

    display: grid;
    gap: 16px;

    label span,
    .reserve {
      display: flex;
      justify-content: space-between;
    }

    input {
      width: 100%;
      accent-color: #e274ff;
    }
  }

  .reserve {
    padding: 10px;
    color: #ffdc73;
    background: #251e08;
    border: 1px solid #8a6b18;
  }

  .heal-action {
    display: flex;
    justify-content: space-between;
    align-items: center;

    small {
      color: #bb91ca;
    }

    &.active {
      color: #07150d;
      background: #62e59b;
      border-color: #9affc4;

      small {
        color: #123c25;
      }
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }

  .reveal {
    max-width: 620px;
    margin: 14px auto;
    padding: 12px 18px;
    border: 1px solid #3d2750;

    h3 {
      margin-top: 0;
    }

    > div {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
  }

  .log {
    max-width: 620px;
    margin: 14px auto;
    color: #ac8db8;
    font-size: 0.8rem;
  }

  .result {
    position: absolute;
    z-index: 4;
    inset: 24% 18%;
    padding: 30px;
    background: #181026ef;
    border: 1px solid #e274ff;

    display: grid;
    place-content: center;
    text-align: center;

    &.lost {
      background: #290812ef;
      border-color: #ff5577;
    }
  }

  .result-actions {
    display: flex;
    justify-content: center;
    gap: 8px;
  }

  .error {
    color: #ff8299;
    text-align: center;
  }

  @media (max-width: 600px) {
    .combatants {
      grid-template-columns: 1fr;

      > b {
        text-align: center;
      }
    }

    .reveal > div {
      display: block;
    }
  }
</style>
