<script lang="ts">
  import { onDestroy } from 'svelte';
  import location from '../stores/location';
  import { arcadeStates } from '../stores/arcade';
  import { sessionState } from '../stores/session';
  import { campaignState } from '../stores/campaign';
  import { socket } from '../socket';

  type Attempt = {
    guess: string;
    exact: number;
    misplaced: number;
    round: number;
  };

  let mode: 'menu' | 'instructions' | 'solo' | 'multi' = 'menu';
  let pendingMode: 'solo' | 'multi' = 'solo';
  let guess = '';
  let error = '';
  let localSecret = createSecret();
  let localAttempts: Attempt[] = [];
  let localFinished = false;
  let waitingForStoryPartner = false;

  $: state = $arcadeStates.mastermind ?? null;
  $: playerId = $sessionState.playerId ?? 'p1';
  $: attempts = mode === 'solo' ? localAttempts : state?.players[playerId]?.attempts ?? [];
  $: waitingForRival = mode === 'multi' && Boolean(state?.pendingGuesses?.[playerId]);
  $: launchedFromStory = $campaignState?.activeMinigame?.id === 'mastermind';
  $: if (launchedFromStory && mode === 'menu') {
    pendingMode = $campaignState?.sessionMode === 'singleplayer' ? 'solo' : 'multi';
    mode = 'instructions';
  }
  $: if ($location !== 'mastermind' && mode === 'multi') {
    socket.emit('arcade:leave', 'mastermind');
    mode = 'menu';
  }

  onDestroy(() => {
    if (mode === 'multi') {
      socket.emit('arcade:leave', 'mastermind');
    }
  });

  function openInstructions(nextMode: 'solo' | 'multi'): void {
    pendingMode = nextMode;
    mode = 'instructions';
  }

  function begin(): void {
    resetLocal();

    if (pendingMode === 'solo') {
      mode = 'solo';
      return;
    }

    mode = 'multi';
    socket.emit('arcade:join', 'mastermind', handleResult);
  }

  function submitGuess(): void {
    if (!/^[1-6]{4}$/.test(guess)) {
      error = 'Enter exactly four digits from 1 to 6.';
      return;
    }

    error = '';

    if (mode === 'solo') {
      const feedback = scoreGuess(localSecret, guess);
      localAttempts = [
        { guess, ...feedback, round: localAttempts.length + 1 },
        ...localAttempts
      ];
      localFinished = feedback.exact === 4;
      guess = '';
      return;
    }

    socket.emit(
      'arcade:action',
      { game: 'mastermind', action: { type: 'guess', guess } },
      (result: { ok: boolean; error?: string }) => {
        handleResult(result);

        if (result.ok) {
          guess = '';
        }
      }
    );
  }

  function appendDigit(digit: number): void {
    if (guess.length < 4) {
      guess += String(digit);
    }
  }

  function restart(): void {
    if (mode === 'solo') {
      resetLocal();
    } else {
      socket.emit('arcade:restart', 'mastermind');
    }
  }

  function returnToMenu(): void {
    if (mode === 'multi') {
      socket.emit('arcade:leave', 'mastermind');
    }

    mode = 'menu';
  }

  function resetLocal(): void {
    localSecret = createSecret();
    localAttempts = [];
    localFinished = false;
    guess = '';
    error = '';
  }

  function createSecret(): string {
    return Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1).join('');
  }

  function scoreGuess(secret: string, value: string): { exact: number; misplaced: number } {
    let exact = 0;
    const remainingSecret: string[] = [];
    const remainingGuess: string[] = [];

    for (let index = 0; index < 4; index += 1) {
      if (secret[index] === value[index]) {
        exact += 1;
      } else {
        remainingSecret.push(secret[index]);
        remainingGuess.push(value[index]);
      }
    }

    let misplaced = 0;

    for (const digit of remainingGuess) {
      const matchIndex = remainingSecret.indexOf(digit);

      if (matchIndex >= 0) {
        misplaced += 1;
        remainingSecret.splice(matchIndex, 1);
      }
    }

    return { exact, misplaced };
  }

  function handleResult(result: { ok: boolean; error?: string }): void {
    error = result.ok ? '' : result.error ?? 'The action failed.';
  }

  function multiplayerResultTitle(): string {
    if (!state || !state.winner) {
      return 'CODEBREAKER COMPLETE';
    }

    return state.winner === 'tie'
      ? 'DEAD HEAT'
      : `${state.players[state.winner]?.name ?? 'Unknown player'} WINS`;
  }

  function returnToStory(): void {
    socket.emit(
      'arcade:story-complete',
      'mastermind',
      (result: { ok: boolean; error?: string; waitingForPartner?: boolean }) => {
        error = result.ok ? '' : result.error ?? 'Could not return to the story.';
        waitingForStoryPartner = Boolean(result.waitingForPartner);
      }
    );
  }
</script>

<section class="mastermind" class:hide={$location !== 'mastermind'}>
  <header>
    <span>DEJAVU://MASTERMIND</span>
    {#if mode === 'solo' || mode === 'multi'}<button type="button" on:click={restart}>RESET</button>{/if}
  </header>

  {#if mode === 'menu'}
    <div class="menu">
      <p>CODEBREAKER MODULE</p>
      <h1>MASTERMIND</h1>
      <span>Break the four-digit cipher. Every digit is between 1 and 6.</span>
      <div><button on:click={() => openInstructions('solo')}>1P CODEBREAK</button><button on:click={() => openInstructions('multi')}>1P VS 2P</button></div>
      <button class="back" on:click={() => location.set('minigames')}>← MINIGAMES</button>
    </div>
  {:else if mode === 'instructions'}
    <div class="backdrop">
      <section class="instructions">
        <button class="close" on:click={() => mode = 'menu'} aria-label="Close">×</button>
        <div>
          <p>CODEBREAKER BRIEF</p>
          <h2>Crack the sequence</h2>
          <ul>
            <li>The hidden code contains four digits. Each is between 1 and 6, and digits may repeat.</li>
            <li><strong>Exact</strong> means the right digit is in the right position.</li>
            <li><strong>Displaced</strong> means the digit exists but belongs in another position.</li>
            <li>In multiplayer, both runners submit one guess per round. The next round unlocks only after both submit, so neither player can rush ahead.</li>
          </ul>
          <p>Singleplayer has no attempt limit and records how many turns the breach required.</p>
        </div>
        <button class="primary" on:click={begin}>BEGIN CODEBREAK</button>
      </section>
    </div>
  {:else if mode === 'multi' && state?.status === 'waiting'}
    <div class="waiting"><h2>AWAITING SECOND CODEBREAKER</h2><p>{state.participantCount}/2 CONNECTED</p></div>
  {:else}
    <div class="game">
      <div class="code-display" aria-label="Current guess">
        {#each Array(4) as _, index}<span>{guess[index] ?? '·'}</span>{/each}
      </div>

      {#if localFinished || state?.status === 'finished'}
        {@const winner = mode === 'solo' ? playerId : state?.winner}
        <section class:lost={winner !== playerId && winner !== 'tie'} class="result">
          <p>{winner === 'tie' ? 'SIMULTANEOUS BREACH' : winner === playerId ? 'CODE ACCEPTED' : 'BREACH LOST'}</p>
          <h2>{mode === 'solo' ? `CRACKED IN ${localAttempts.length} TURNS` : multiplayerResultTitle()}</h2>
          {#if waitingForStoryPartner}
            <p>Waiting for your partner to close the codebreak…</p>
          {:else if launchedFromStory}
            <button on:click={returnToStory}>RETURN TO STORY</button>
          {:else}
            <button on:click={restart}>NEW CODE</button>
            <button on:click={returnToMenu}>MODE MENU</button>
          {/if}
        </section>
      {:else}
        <div class="keypad">
          {#each [1, 2, 3, 4, 5, 6] as digit}<button on:click={() => appendDigit(digit)}>{digit}</button>{/each}
          <button on:click={() => guess = guess.slice(0, -1)}>⌫</button>
          <button class="submit" disabled={guess.length !== 4 || waitingForRival} on:click={submitGuess}>TRANSMIT</button>
        </div>
        {#if waitingForRival}<p class="waiting-copy">GUESS LOCKED · WAITING FOR RIVAL</p>{/if}
      {/if}

      {#if error}<p class="error">{error}</p>{/if}

      <section class="attempts">
        <h3>ATTEMPT HISTORY</h3>
        {#if attempts.length === 0}<p>No guesses transmitted.</p>{/if}
        {#each attempts as attempt}
          <div><strong>{attempt.guess}</strong><span>{attempt.exact} EXACT</span><span>{attempt.misplaced} DISPLACED</span><small>TURN {attempt.round}</small></div>
        {/each}
      </section>
    </div>
  {/if}
</section>

<style lang="scss">
  .mastermind {
    width: min(1050px, 100%);
    height: 95vh;
    overflow: hidden;
    color: #e9e4ff;
    background: #080713;
    border: 1px solid #9962ff;
    box-shadow: 0 0 34px #9962ff35;

    > header {
      min-height: 42px;
      padding: 9px 14px;
      color: #c9a7ff;
      background: #151027;
      border-bottom: 1px solid #9962ff;

      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  }

  button {
    padding: 9px 13px;
    color: #d9c9ff;
    background: #15102a;
    border: 1px solid #7151b5;
    cursor: pointer;
  }

  button:hover,
  .primary,
  .submit {
    color: #090513;
    background: #c9a7ff;
    border-color: #ffffff;
  }

  button:disabled {
    opacity: 0.4;
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
    color: #c9a7ff;
    font-size: clamp(2.5rem, 8vw, 6rem);
  }

  .menu > div {
    display: flex;
    justify-content: center;
    gap: 8px;
  }

  .back {
    margin: 0 auto;
    background: transparent;
    border-color: transparent;
  }

  .backdrop {
    position: fixed;
    z-index: 30;
    inset: 0;
    background: #03020bdc;

    display: grid;
    place-items: center;
  }

  .instructions {
    position: relative;
    width: min(620px, 90vw);
    max-height: 88vh;
    overflow: hidden;
    background: #100c20;
    border: 1px solid #9962ff;

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
    padding: clamp(18px, 4vw, 42px);
    overflow-y: auto;
  }

  .code-display {
    margin: 0 auto 24px;

    display: flex;
    justify-content: center;
    gap: 10px;

    span {
      width: 64px;
      height: 76px;
      color: #c9a7ff;
      background: #130f24;
      border: 1px solid #9962ff;
      font-size: 2.4rem;

      display: grid;
      place-items: center;
    }
  }

  .keypad {
    max-width: 430px;
    margin: 0 auto;

    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;

    .submit {
      grid-column: span 2;
    }
  }

  .waiting-copy,
  .error {
    text-align: center;
  }

  .error {
    color: #ff6b7a;
  }

  .attempts {
    max-width: 700px;
    margin: 28px auto 0;

    h3 {
      color: #c9a7ff;
    }

    div {
      padding: 10px;
      border-top: 1px solid #30264e;

      display: grid;
      grid-template-columns: 1fr auto auto auto;
      gap: 14px;
    }
  }

  .result {
    max-width: 700px;
    margin: 20px auto;
    padding: 24px;
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
</style>
