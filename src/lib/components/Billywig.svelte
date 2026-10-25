<script lang="ts">
  import { fly } from 'svelte/transition';
  import { socket } from '../socket';
  import { campaignState, localPlayer } from '../stores/campaign';
  import location from '../stores/location';
  import { netRunnersGameState } from '../stores/netRunnersGameState';
  import { setMinigameSessionActive } from '../stores/minigameSessions';
  import WagerPanel from './WagerPanel.svelte';

  type Phase = 'menu' | 'tutorial' | 'betting' | 'playing' | 'result';
  type Outcome = 'bust' | 'perfect' | 'six-card' | 'win' | 'loss' | 'tie';

  type Result = {
    outcome: Outcome;
    title: string;
    dialogue: string;
    balanceChange: number;
  };

  const playerDeck = [
    0,
    ...Array(5).fill(1),
    ...Array(5).fill(2),
    ...Array(5).fill(3),
    ...Array(5).fill(4),
    ...Array(5).fill(5),
    ...Array(4).fill(6),
    ...Array(4).fill(7),
    ...Array(4).fill(8),
    ...Array(4).fill(9),
    ...Array(10).fill(10),
    26
  ];

  const bankDeck = [
    ...Array(6).fill(3),
    ...Array(6).fill(4),
    ...Array(4).fill(5),
    ...Array(4).fill(6),
    ...Array(4).fill(7),
    ...Array(5).fill(8),
    ...Array(5).fill(9),
    ...Array(4).fill(10),
    ...Array(4).fill(11),
    16
  ];

  const tips = [
    'Six cards without breaching 26 pays better than a standard win.',
    'A perfect 26 triggers Billywig protocol and the largest payout.',
    'Holding reveals the card you would have drawn next.',
    'Tilda draws after every card, but refuses any draw that would make her bust.'
  ];

  let phase: Phase = 'menu';
  let bet = 0;
  let playerScore = 0;
  let bankScore = 0;
  let playerCards: number[] = [];
  let bankCards: number[] = [];
  let lastPlayerCard: number | null = null;
  let nextCard: number | null = null;
  let statusLine = '';
  let tip = tips[0];
  let result: Result | null = null;
  let waitingForPartner = false;
  let completionError = '';

  $: balance = $netRunnersGameState.p1.money;
  $: launchedFromStory = $campaignState?.activeMinigame?.id === 'billywig';
  $: playerName = $localPlayer?.name ?? 'PLAYER';
  $: setMinigameSessionActive('billywig', phase !== 'menu');

  function openBetting(): void {
    resetRound();
    phase = 'betting';
  }

  function resetRound(): void {
    bet = 0;
    playerScore = 0;
    bankScore = randomInteger(6, 9);
    playerCards = [];
    bankCards = [];
    lastPlayerCard = null;
    nextCard = null;
    statusLine = '';
    result = null;
    waitingForPartner = false;
    completionError = '';
    tip = tips[Math.floor(Math.random() * tips.length)];
  }

  function updateBet(amount: number): void {
    bet = Math.min(balance, Math.max(0, bet + amount));
  }

  function confirmBet(): void {
    if (bet < 0 || bet > balance) {
      return;
    }

    phase = 'playing';
    statusLine = 'Tilda locks your wager into the table. Draw when ready.';
  }

  function handleBetConfirm(event: CustomEvent<number>): void {
    bet = event.detail;
    confirmBet();
  }

  function drawCard(): void {
    if (phase !== 'playing') {
      return;
    }

    const card = drawFrom(playerDeck);
    lastPlayerCard = card;
    playerCards = [...playerCards, card];
    playerScore += card;

    const bankCard = drawFrom(bankDeck);

    if (bankScore + bankCard <= 26) {
      bankScore += bankCard;
      bankCards = [...bankCards, bankCard];
      statusLine = `You drew ${card}. Tilda answered with ${bankCard}.`;
    } else {
      statusLine = `You drew ${card}. Tilda diverted an unstable ${bankCard} rather than bust.`;
    }

    if (playerScore >= 26 || playerCards.length >= 6) {
      finishRound();
    }
  }

  function hold(): void {
    if (phase !== 'playing') {
      return;
    }

    nextCard = drawFrom(playerDeck);
    finishRound();
  }

  function finishRound(): void {
    result = calculateResult();
    updateBalance(result.balanceChange);
    phase = 'result';
  }

  function calculateResult(): Result {
    if (playerScore > 26) {
      const difference = playerScore - 26;

      return {
        outcome: 'bust',
        title: 'SIGNAL OVERLOAD',
        dialogue: `Hot ghoul, looks like ya lost! ${playerScore} points is ${difference} too many.`,
        balanceChange: -(bet * 2)
      };
    }

    if (playerScore === 26) {
      return {
        outcome: 'perfect',
        title: 'BILLYWIG',
        dialogue: 'I cannot believe you landed a perfect score!',
        balanceChange: bet === 0 ? 100 : bet * 5
      };
    }

    if (playerCards.length >= 6) {
      return {
        outcome: 'six-card',
        title: 'SIX UNDER 26',
        dialogue: 'Six cards under 26? You must be cheating...',
        balanceChange: bet === 0 ? 100 : bet * 3
      };
    }

    if (playerScore > bankScore) {
      return {
        outcome: 'win',
        title: `${playerName.toUpperCase()} WINS`,
        dialogue: `Meh. I guess you win with a score of ${playerScore}.`,
        balanceChange: bet === 0 ? 100 : bet * 2
      };
    }

    if (playerScore < bankScore) {
      return {
        outcome: 'loss',
        title: 'TILDA WINS',
        dialogue: `Sweet mortis bats! I win with ${bankScore} points.`,
        balanceChange: -bet
      };
    }

    return {
      outcome: 'tie',
      title: 'DEADLOCK',
      dialogue: 'As even as a porlock\'s toe nails. Nobody wins this round.',
      balanceChange: 0
    };
  }

  function updateBalance(amount: number): void {
    netRunnersGameState.update((state) => ({
      ...state,
      p1: {
        ...state.p1,
        money: state.p1.money + amount
      }
    }));

    socket.emit('characters:adjust-wallet', amount);
  }

  function returnToMinigames(): void {
    if (launchedFromStory) {
      socket.emit('billywig:cancel', (response: { ok: boolean; error?: string }) => {
        completionError = response.error ?? '';
      });
      return;
    }

    phase = 'menu';
    location.set('minigames');
  }

  function returnToStory(): void {
    socket.emit(
      'billywig:complete',
      result?.outcome ?? 'loss',
      (response: { ok: boolean; waitingForPartner?: boolean; error?: string }) => {
        if (!response.ok) {
          completionError = response.error ?? 'Could not return to the story.';
          return;
        }

        waitingForPartner = Boolean(response.waitingForPartner);

        if (!waitingForPartner) {
          resetRound();
          phase = 'menu';
        }
      }
    );
  }

  function drawFrom(deck: number[]): number {
    return deck[Math.floor(Math.random() * deck.length)];
  }

  function randomInteger(minimum: number, maximum: number): number {
    return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
  }
</script>

<section class="billywig" class:hide={$location !== 'billywig'} aria-labelledby="billywig-title">
  <header>
    <div>
      <span class="status-light"></span>
      DEJAVU://ARCADE/BILLYWIG
    </div>
    <span>BALANCE {$netRunnersGameState.p1.money}₭</span>
  </header>

  <div class="terminal-screen">
    <div class="scanlines" aria-hidden="true"></div>

    <div class="title-row">
      <div>
        <p class="eyebrow">TILDA'S NEON TABLE</p>
        <h1 id="billywig-title">BILLY<span>WIG</span></h1>
      </div>
      <p class="target">TARGET <strong>26</strong></p>
    </div>

    {#if phase === 'menu'}
      <div class="menu-panel panel">
        <div class="dealer-mark" aria-hidden="true">
          <span>T</span>
        </div>
        <div class="menu-copy">
          <p class="speaker">TILDA&gt;</p>
          <p>Pull up a chair, hot ghoul. Get closer to 26 than I do—but cross it and your wager burns.</p>
          <div class="button-row">
            <button class="primary-button" type="button" on:click={openBetting}>PLAY BILLYWIG</button>
            <button type="button" on:click={() => phase = 'tutorial'}>HOW TO PLAY</button>
            <button type="button" on:click={returnToMinigames}>{launchedFromStory ? 'EXIT TO STORY' : 'EXIT TABLE'}</button>
          </div>
        </div>
      </div>
    {:else if phase === 'tutorial'}
      <div class="tutorial panel">
        <p class="speaker">TILDA&gt; HOW TO PLAY</p>
        <h2>Chase 26. Know when to disconnect.</h2>
        <ul>
          <li>Place a ₭rypto wager, then use <strong>DRAW CARD</strong> or <strong>HOLD</strong>.</li>
          <li>Beat Tilda without going over 26 to win twice your bet.</li>
          <li>Hit exactly 26 to win five times your bet.</li>
          <li>Collect six cards while staying under 26 to win three times your bet.</li>
          <li>A tie returns your wager. Going over 26 costs twice your bet.</li>
        </ul>
        <button type="button" on:click={() => phase = 'menu'}>BACK</button>
      </div>
    {:else if phase === 'betting'}
      <div class="betting">
        <p class="tip"><strong>TIP:</strong> {tip}</p>
        <WagerPanel
          bind:wager={bet}
          balance={balance}
          accent="#2ce4ff"
          title="TILDA // PLACE YOUR BET"
          actionLabel="LOCK BET"
          on:confirm={handleBetConfirm}
          on:cancel={() => phase = 'menu'}
        />
      </div>
    {:else if phase === 'result' && result}
      <div class="result-stage result-stage--{result.outcome}" aria-live="polite">
        <div class="neon-lights" aria-hidden="true">
          {#each Array(9) as _}
            <span></span>
          {/each}
        </div>

        <p class="result-kicker">
          {result.balanceChange > 0 ? 'TABLE OVERRIDE ACCEPTED' : result.balanceChange < 0 ? 'ROUND TERMINATED' : 'SIGNALS MATCHED'}
        </p>
        <h2>{result.title}</h2>

        <div class="result-scores" aria-label="Final scores">
          <div>
            <span>PLAYER</span>
            <strong>{playerScore}</strong>
          </div>
          <span class="score-divider">//</span>
          <div>
            <span>TILDA</span>
            <strong>{bankScore}</strong>
          </div>
        </div>

        <p class="result-dialogue"><span>TILDA&gt;</span> {result.dialogue}</p>

        {#if nextCard !== null}
          <p class="result-detail">Your next card would have been <strong>{nextCard}</strong>.</p>
        {/if}

        <div class="result-payout" class:gain={result.balanceChange > 0} class:loss={result.balanceChange < 0}>
          <small>WAGER RESULT</small>
          <strong>{result.balanceChange > 0 ? '+' : ''}{result.balanceChange}₭</strong>
        </div>

        {#if waitingForPartner}
          <p class="waiting-message">Waiting for your partner to finish Billywig.</p>
        {/if}

        {#if completionError}
          <p class="error-message">{completionError}</p>
        {/if}
      </div>

      <div class="game-footer game-footer--result">
        <p>WAGER <strong>{bet}₭</strong></p>
        <div class="button-row">
          <button class="primary-button" type="button" on:click={openBetting}>PLAY AGAIN</button>
          {#if launchedFromStory}
            <button type="button" disabled={waitingForPartner} on:click={returnToStory}>
              {waitingForPartner ? 'WAITING FOR PARTNER' : 'RETURN TO STORY'}
            </button>
          {:else}
            <button type="button" on:click={() => phase = 'menu'}>MAIN MENU</button>
          {/if}
        </div>
      </div>
    {:else}
      <div class="table-layout">
        <div class="score-panel score-panel--tilda">
          <span>TILDA</span>
          <strong>{bankScore}</strong>
          <small>{bankCards.length} DRAW{bankCards.length === 1 ? '' : 'S'}</small>
        </div>

        <div class="card-table" aria-label="Your drawn cards">
          {#if playerCards.length === 0}
            <div class="empty-slot">AWAITING DRAW</div>
          {:else}
            {#each playerCards as card, index}
              <div
                class="number-card"
                class:number-card--perfect={card === 26}
                in:fly={{ y: -35, duration: 260, delay: index === playerCards.length - 1 ? 0 : 0 }}
              >
                <span>{String(card).padStart(2, '0')}</span>
                <strong>{card}</strong>
                <span>{String(card).padStart(2, '0')}</span>
              </div>
            {/each}
          {/if}
        </div>

        <div class="score-panel score-panel--player">
          <span>PLAYER</span>
          <strong>{playerScore}</strong>
          <small>{playerCards.length}/6 CARDS</small>
        </div>
      </div>

      <div class="console-log" aria-live="polite">
        <span class="prompt">TILDA&gt;</span>
        <p>{statusLine}</p>
      </div>

      <div class="game-footer">
        <p>WAGER <strong>{bet}₭</strong></p>

        <div class="button-row">
          <button class="primary-button" type="button" on:click={drawCard}>DRAW CARD</button>
          <button type="button" on:click={hold}>HOLD</button>
        </div>
      </div>
    {/if}
  </div>
</section>

<style lang="scss">
  $background: #080610;
  $panel: #100b1c;
  $purple: #9962ff;
  $pink: #ff75fd;
  $cyan: #6dc2fb;
  $yellow: #f2d40e;
  $green: #9dffa7;
  $red: #fb716d;

  .billywig {
    width: 100%;
    height: 100%;
    max-width: 1280px;
    overflow: hidden;
    background: $background;
    border: 1px solid $purple;
    border-radius: 8px;
    box-shadow: 0 0 42px #9962ff35;

    > header {
      min-height: 42px;
      padding: 10px 14px;
      color: $pink;
      background: #171126;
      border-bottom: 1px solid $purple;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.72rem;
      letter-spacing: 1.6px;

      display: flex;
      justify-content: space-between;
      align-items: center;

      div {
        display: flex;
        align-items: center;
        gap: 8px;
      }
    }
  }

  .status-light {
    width: 8px;
    height: 8px;
    background: $green;
    border-radius: 50%;
    box-shadow: 0 0 10px $green;
  }

  .terminal-screen {
    position: relative;
    height: calc(100% - 42px);
    padding: clamp(18px, 4vw, 42px);
    overflow-y: auto;
    background:
      linear-gradient(90deg, #6dc2fb08 1px, transparent 1px),
      linear-gradient(#6dc2fb08 1px, transparent 1px),
      radial-gradient(circle at 52% 38%, #28194b 0, #080610 58%);
    background-size: 32px 32px, 32px 32px, auto;
  }

  .scanlines {
    position: absolute;
    z-index: 0;
    inset: 0;
    background: repeating-linear-gradient(
      transparent 0,
      transparent 5px,
      #ffffff05 6px
    );
    pointer-events: none;
  }

  .title-row,
  .panel,
  .table-layout,
  .result-stage,
  .console-log,
  .game-footer {
    position: relative;
    z-index: 1;
  }

  .title-row {
    margin-bottom: clamp(20px, 4vh, 42px);

    display: flex;
    justify-content: space-between;
    align-items: end;

    h1 {
      color: #ffffff;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: clamp(2rem, 6vw, 4.6rem);
      letter-spacing: 4px;
      line-height: 0.9;

      span {
        color: $pink;
        text-shadow: 0 0 18px #ff75fd88;
      }
    }
  }

  .eyebrow,
  .speaker {
    margin-bottom: 9px;
    color: $cyan;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 2px;
  }

  .target {
    color: #aeb9c9;
    font-size: 0.72rem;
    letter-spacing: 2px;

    strong {
      margin-left: 8px;
      color: $yellow;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 1.7rem;
      text-shadow: 0 0 12px #f2d40e66;
    }
  }

  .panel {
    max-width: 820px;
    margin: 0 auto;
    padding: clamp(22px, 4vw, 42px);
    background: #100b1ce8;
    border: 1px solid #453b82;
    box-shadow: 12px 12px 0 #05030a99;
  }

  .menu-panel {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: clamp(20px, 4vw, 42px);
    align-items: center;
  }

  .dealer-mark {
    width: 128px;
    height: 154px;
    color: $pink;
    background:
      radial-gradient(circle, #ff75fd2c, transparent 64%),
      #080610;
    border: 2px solid $pink;
    border-radius: 8px 34px;
    box-shadow: 0 0 28px #ff75fd4d;
    clip-path: polygon(0 0, 88% 0, 100% 12%, 100% 100%, 12% 100%, 0 88%);

    display: grid;
    place-items: center;

    span {
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 5rem;
      font-weight: 900;
      text-shadow: 4px 4px 0 $purple;
    }
  }

  .menu-copy > p:not(.speaker),
  .tutorial li {
    color: #cbd5e1;
    line-height: 1.7;
  }

  .button-row {
    margin-top: 24px;

    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  button {
    min-height: 44px;
    padding: 10px 18px;
    color: #ffffff;
    background: #171126;
    border: 1px solid $purple;
    border-radius: 3px;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.7px;
    cursor: pointer;

    &:hover,
    &:focus-visible {
      color: $background;
      background: $cyan;
      border-color: $cyan;
      outline: 2px solid #ffffff;
      outline-offset: 2px;
    }

    &:disabled {
      color: #64748b;
      background: #11101a;
      border-color: #334155;
      cursor: not-allowed;
    }
  }

  .primary-button {
    color: $background;
    background: $pink;
    border-color: $pink;
    box-shadow: 0 0 18px #ff75fd44;
  }

  .tutorial {
    h2 {
      margin-bottom: 20px;
      color: #ffffff;
      font-family: "Orbitron", "Space Mono", sans-serif;
    }

    ul {
      margin: 0 0 24px 20px;

      display: grid;
      gap: 10px;
    }

    strong {
      color: $yellow;
    }
  }

  .tip {
    color: #aeb9c9;
    line-height: 1.5;

    strong {
      color: $cyan;
    }
  }

  .bet-display {
    margin: 28px 0 18px;
    padding: 22px;
    background: #080610;
    border: 1px solid #453b82;
    text-align: center;

    display: grid;
    gap: 8px;

    span,
    small {
      color: #94a3b8;
      font-size: 0.68rem;
      letter-spacing: 2px;
    }

    strong {
      color: $green;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: clamp(2rem, 5vw, 3.5rem);
      text-shadow: 0 0 14px #9dffa755;
    }
  }

  .bet-controls {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
  }

  .table-layout {
    min-height: 230px;

    display: grid;
    grid-template-columns: 130px minmax(0, 1fr) 130px;
    gap: 20px;
    align-items: center;
  }

  .score-panel {
    min-height: 150px;
    padding: 18px;
    background: #0d0a17e8;
    border: 1px solid #453b82;

    display: grid;
    place-items: center;
    align-content: center;
    gap: 8px;

    span,
    small {
      color: #94a3b8;
      font-size: 0.67rem;
      letter-spacing: 1.5px;
    }

    strong {
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 3rem;
    }
  }

  .score-panel--tilda {
    border-color: $pink;

    strong {
      color: $pink;
    }
  }

  .score-panel--player {
    border-color: $cyan;

    strong {
      color: $cyan;
    }
  }

  .card-table {
    min-height: 190px;

    display: flex;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
  }

  .empty-slot {
    width: 100%;
    padding: 60px 20px;
    color: #64748b;
    border: 1px dashed #453b82;
    font-size: 0.72rem;
    letter-spacing: 2px;
    text-align: center;
  }

  .number-card {
    width: clamp(62px, 8vw, 88px);
    height: clamp(100px, 14vw, 132px);
    padding: 8px;
    color: $cyan;
    background:
      linear-gradient(135deg, #6dc2fb12, transparent 55%),
      #07101c;
    border: 2px solid $cyan;
    border-radius: 5px 22px;
    box-shadow: 0 0 18px #6dc2fb40;

    display: flex;
    flex-direction: column;
    justify-content: space-between;

    span {
      font-size: 0.7rem;
      font-weight: 800;

      &:last-child {
        align-self: end;
        transform: rotate(180deg);
      }
    }

    strong {
      align-self: center;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 1.8rem;
    }
  }

  .number-card--perfect {
    color: $yellow;
    border-color: $yellow;
    box-shadow: 0 0 24px #f2d40e77;
  }

  .result-stage {
    position: relative;
    max-width: 780px;
    margin: 0 auto;
    padding: clamp(30px, 5vw, 56px);
    overflow: hidden;
    background:
      linear-gradient(135deg, #ff75fd12, transparent 42%),
      radial-gradient(circle at 50% 0, #6dc2fb24, transparent 52%),
      #0d0918ed;
    border: 1px solid $cyan;
    box-shadow:
      0 0 24px #6dc2fb35,
      inset 0 0 42px #9962ff17;
    text-align: center;
    clip-path: polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 22px 100%, 0 calc(100% - 22px));
    animation: result-arrival 420ms ease-out both;

    &::before,
    &::after {
      position: absolute;
      top: 22px;
      bottom: 22px;
      width: 2px;
      background: linear-gradient(transparent, $cyan, transparent);
      box-shadow: 0 0 13px $cyan;
      content: "";
    }

    &::before {
      left: 12px;
    }

    &::after {
      right: 12px;
    }

    h2 {
      margin: 8px 0 26px;
      color: #ffffff;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: clamp(2rem, 6vw, 4.2rem);
      letter-spacing: clamp(2px, 0.8vw, 7px);
      line-height: 1;
      text-shadow:
        0 0 8px #ffffff99,
        0 0 22px $cyan,
        4px 4px 0 $purple;
    }
  }

  .result-stage--perfect,
  .result-stage--six-card,
  .result-stage--win {
    .neon-lights span {
      animation: victory-light 900ms ease-in-out infinite alternate;
    }
  }

  .result-stage--perfect {
    border-color: $cyan;
    background:
      linear-gradient(135deg, #6dc2fb24, transparent 48%),
      radial-gradient(circle at 50% 0, #6dc2fb33, transparent 58%),
      #071221ed;
    box-shadow:
      0 0 38px #6dc2fb66,
      inset 0 0 58px #6dc2fb1f;

    h2 {
      color: $cyan;
      text-shadow:
        0 0 8px #ffffff99,
        0 0 26px #6dc2fbee,
        4px 4px 0 #225e91;
    }
  }

  .result-stage--six-card {
    border-color: $purple;
    box-shadow:
      0 0 34px #9962ff66,
      inset 0 0 52px #9962ff1f;

    h2 {
      color: #b98cff;
      text-shadow:
        0 0 8px #ffffff88,
        0 0 26px #9962ffdd,
        4px 4px 0 #4c2789;
    }
  }

  .result-stage--win {
    border-color: $yellow;
    box-shadow:
      0 0 32px #f2d40e4d,
      inset 0 0 48px #ff75fd17;

    h2 {
      color: $yellow;
      text-shadow:
        0 0 8px #ffffff99,
        0 0 24px #f2d40ecc,
        4px 4px 0 #b330ae;
    }
  }

  .result-stage--bust,
  .result-stage--loss {
    border-color: $red;

    h2 {
      color: $red;
      text-shadow: 0 0 20px #fb716d99;
    }
  }

  .result-stage--tie {
    border-color: $pink;
    box-shadow:
      0 0 28px #ff75fd44,
      inset 0 0 42px #ff75fd14;

    h2 {
      color: $pink;
      text-shadow: 0 0 22px #ff75fdaa;
    }
  }

  .neon-lights {
    position: absolute;
    top: 0;
    right: 34px;
    left: 34px;
    height: 9px;

    display: flex;
    justify-content: space-between;

    span {
      width: 7px;
      height: 7px;
      background: $cyan;
      border-radius: 50%;
      box-shadow: 0 0 10px $cyan;

      &:nth-child(3n + 2) {
        background: $pink;
        box-shadow: 0 0 10px $pink;
        animation-delay: 180ms;
      }

      &:nth-child(3n) {
        background: $yellow;
        box-shadow: 0 0 10px $yellow;
        animation-delay: 360ms;
      }
    }
  }

  .result-kicker {
    color: $cyan;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 3px;
  }

  .result-scores {
    margin: 0 auto 24px;

    display: flex;
    justify-content: center;
    align-items: center;
    gap: clamp(20px, 6vw, 64px);

    div {
      display: grid;
      gap: 4px;
    }

    span {
      color: #94a3b8;
      font-size: 0.65rem;
      letter-spacing: 2px;
    }

    strong {
      color: #ffffff;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: clamp(1.8rem, 4vw, 3rem);
    }
  }

  .score-divider {
    color: $purple !important;
    font-size: 1.2rem !important;
  }

  .result-dialogue,
  .result-detail {
    color: #cbd5e1;
    line-height: 1.6;
  }

  .result-dialogue span {
    color: $pink;
    font-weight: 800;
  }

  .result-detail {
    margin-top: 10px;

    strong {
      color: $yellow;
    }
  }

  .result-payout {
    width: min(260px, 100%);
    margin: 24px auto 0;
    padding: 14px 20px;
    background: #05030acc;
    border: 1px solid $purple;

    display: grid;
    gap: 4px;

    small {
      color: #94a3b8;
      font-size: 0.62rem;
      letter-spacing: 2px;
    }

    strong {
      color: $cyan;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 1.8rem;
      text-shadow: 0 0 13px #6dc2fb77;
    }

    &.gain strong {
      color: $yellow;
      text-shadow: 0 0 13px #f2d40e77;
    }

    &.loss strong {
      color: $red;
      text-shadow: 0 0 13px #fb716d77;
    }
  }

  .game-footer--result {
    max-width: 780px;
    margin: 0 auto;
  }

  @keyframes result-arrival {
    from {
      opacity: 0;
      transform: scale(0.96) translateY(12px);
    }

    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  @keyframes victory-light {
    from {
      opacity: 0.45;
      transform: scale(0.8);
    }

    to {
      opacity: 1;
      transform: scale(1.35);
    }
  }

  .console-log {
    min-height: 94px;
    margin-top: 22px;
    padding: 16px 18px;
    background: #03050b;
    border-left: 3px solid $pink;

    display: grid;
    grid-template-columns: auto 1fr;
    gap: 7px 12px;
    align-items: baseline;

    p {
      grid-column: 2;
      color: #cbd5e1;
      line-height: 1.5;
    }
  }

  .prompt {
    color: $pink;
    font-weight: 800;
  }

  .result-title {
    color: $cyan;
    letter-spacing: 1.5px;
  }

  .result-title--bust,
  .result-title--loss,
  .loss {
    color: $red;
  }

  .result-title--perfect,
  .result-title--six-card,
  .gain,
  .next-card {
    color: $yellow;
  }

  .waiting-message {
    color: $cyan !important;
  }

  .error-message {
    color: $red !important;
  }

  .game-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;

    > p {
      color: #94a3b8;
      font-size: 0.72rem;
      letter-spacing: 1.5px;

      strong {
        color: $green;
      }
    }

    .button-row {
      margin-top: 16px;
    }
  }

  @media (max-width: 760px) {
    .menu-panel {
      grid-template-columns: 1fr;
    }

    .dealer-mark {
      display: none;
    }

    .bet-controls {
      grid-template-columns: repeat(3, 1fr);
    }

    .table-layout {
      grid-template-columns: 1fr 1fr;
    }

    .card-table {
      grid-column: 1 / -1;
      grid-row: 2;
    }

    .score-panel {
      min-height: 104px;
    }

    .game-footer {
      align-items: start;
      flex-direction: column;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .result-stage,
    .neon-lights span {
      animation: none;
    }
  }
</style>
