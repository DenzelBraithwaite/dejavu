<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { typewriter, typewriterProfiles } from '../actions/typewriter';
  import { applySceneAudio } from '../audio/audioManager';
  import { socket } from '../socket';
  import { campaignState } from '../stores/campaign';
  import location from '../stores/location';
  import { sessionState } from '../stores/session';
  import { getScene } from '../story/storyRegistry.js';
  import { interpolateSceneText } from '../story/sceneTypes.js';
  import DiceTerminal from './DiceTerminal.svelte';

  let typedTextElement: HTMLElement;
  let terminalScreenElement: HTMLElement;
  let inputValue = '';
  let errorMessage = '';
  let typingComplete = false;
  let submittedSceneId = '';
  let now = Date.now();
  let clock: number;
  let textValues: Record<string, string | number> = {};
  let lastScrollKey = '';
  let lastAudioSceneId = '';

  $: playerId = $sessionState.playerId;
  $: sceneId = playerId && $campaignState
    ? $campaignState.currentScene[playerId]
    : '';
  $: scene = sceneId ? getScene(sceneId) : undefined;
  $: player = playerId && $campaignState
    ? $campaignState.players[playerId]
    : null;
  $: terminalEntries = playerId && $campaignState
    ? $campaignState.terminalOutput[playerId]
    : [];
  $: pendingDice = playerId && $campaignState
    ? $campaignState.pendingDice[playerId]
    : undefined;
  $: {
    textValues = {};

    if ($campaignState) {
      textValues = {
        PLAYER_1: $campaignState.players.p1.name,
        PLAYER_2: $campaignState.players.p2.name,
        PLAYER_NAME: player?.name ?? ''
      };
    }
  }
  $: sceneText = scene?.text
    ? interpolateSceneText(scene.text, textValues)
    : scene?.prompt
      ? interpolateSceneText(scene.prompt, textValues)
      : '';
  $: conversation = scene?.type === 'conversation' && $campaignState
    ? $campaignState.conversations[scene.id]
    : null;
  $: vote = scene?.type === 'vote' && $campaignState
    ? $campaignState.votes[scene.id]
    : null;
  $: remainingMs = playerId && $campaignState?.deadlines[playerId]
    ? Math.max(0, $campaignState.deadlines[playerId] - now)
    : 0;
  $: remainingSeconds = Math.ceil(remainingMs / 1000);
  $: scrollKey = `${sceneId}:${terminalEntries.length}:${conversation?.messages.length ?? 0}`;

  $: if (terminalScreenElement && scrollKey !== lastScrollKey) {
    lastScrollKey = scrollKey;
    void scrollTerminalToBottom();
  }

  $: if (scene && sceneId !== lastAudioSceneId) {
    lastAudioSceneId = sceneId;
    applySceneAudio(scene);
  }

  $: if (sceneId) {
    typingComplete = false;
    inputValue = '';
    errorMessage = '';
  }

  $: if (
    scene?.type === 'checkpoint'
    && scene.id !== submittedSceneId
  ) {
    submittedSceneId = scene.id;
    sendAction({
      type: 'arrive-checkpoint',
      sceneId: scene.id
    });
  }

  onMount(() => {
    clock = window.setInterval(() => {
      now = Date.now();
    }, 100);
  });

  onDestroy(() => {
    window.clearInterval(clock);
  });

  function sendAction(action: Record<string, unknown>): void {
    errorMessage = '';

    socket.emit('campaign:action', action, (result: {
      ok: boolean;
      error?: string;
    }) => {
      if (!result.ok) {
        errorMessage = result.error ?? 'The action could not be completed.';
      }
    });
  }

  function advance(): void {
    if (!scene) {
      return;
    }

    sendAction({
      type: 'advance',
      sceneId: scene.id
    });
  }

  function choose(choiceId: string): void {
    if (!scene) {
      return;
    }

    sendAction({
      type: scene.type === 'vote' ? 'vote' : 'choose',
      sceneId: scene.id,
      choiceId
    });
  }

  function submitInput(): void {
    if (!scene) {
      return;
    }

    sendAction({
      type: 'submit-input',
      sceneId: scene.id,
      value: inputValue
    });
  }

  function sendMessage(): void {
    if (!scene) {
      return;
    }

    sendAction({
      type: 'send-message',
      sceneId: scene.id,
      value: inputValue
    });
    inputValue = '';
  }

  function rollDice(): void {
    if (!scene) {
      return;
    }

    sendAction({
      type: 'roll-dice',
      sceneId: scene.id
    });
  }

  function closeDiceTerminal(): void {
    if (!scene) {
      return;
    }

    sendAction({
      type: 'close-dice',
      sceneId: scene.id
    });
  }

  function launchMinigame(): void {
    if (!scene) {
      return;
    }

    sendAction({
      type: 'launch-minigame',
      sceneId: scene.id
    });
  }

  function skipTyping(): void {
    typedTextElement?.dispatchEvent(new CustomEvent('typewriterskip'));
  }

  function handleInputKeydown(event: KeyboardEvent, submit: () => void): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  }

  async function scrollTerminalToBottom(): Promise<void> {
    await tick();
    terminalScreenElement.scrollTo({
      top: terminalScreenElement.scrollHeight,
      behavior: 'smooth'
    });
  }
</script>

<section
  class="terminal"
  class:hide={$location !== 'terminal'}
  transition:fade={{ duration: 300 }}
  aria-label="Story terminal"
>
  <header class="terminal-header">
    <span>DEJAVU://CAMPAIGN</span>
    <span>{playerId?.toUpperCase() ?? 'CONNECTING'}</span>
  </header>

  <div class="terminal-screen" bind:this={terminalScreenElement}>
    {#if !$campaignState || !scene}
      <p class="system-message">Synchronizing campaign state...</p>
    {:else}
      <div class="terminal-history" aria-label="Previous terminal output">
        {#each terminalEntries as entry}
          <article class="terminal-history-entry">
            <p class="history-scene-id">{entry.sceneId}</p>
            <p class="history-speaker">{interpolateSceneText(entry.speaker, textValues)}</p>
            <p class="history-text">{interpolateSceneText(entry.text, textValues)}</p>
          </article>
        {/each}
      </div>

      <p class="scene-id">{scene.id}</p>

      {#if scene.speaker}
        <p class="speaker">{interpolateSceneText(scene.speaker, textValues)}</p>
      {/if}

      {#if scene.type === 'image' && scene.src}
        <figure class="scene-image-wrapper">
          <img class="scene-image" src={scene.src} alt={scene.alt ?? ''}>
        </figure>
      {/if}

      <p
        class="scene-text"
        class:scene-text-complete={typingComplete}
        bind:this={typedTextElement}
        use:typewriter={{
          text: sceneText,
          timing: scene.speaker
            ? typewriterProfiles.dialogue
            : typewriterProfiles.narration,
          onComplete: () => typingComplete = true
        }}
        aria-live="polite"
      ></p>

      {#if scene.type === 'conversation' && conversation}
        <div class="conversation-status" aria-live="polite">
          <p>
            <strong>{$campaignState.players[conversation.activePlayer].name}</strong>
            has the floor
          </p>
          <p>
            {$campaignState.players.p1.name}
            {conversation.messageCounts.p1}/{conversation.requiredMessages.p1}
            ·
            {$campaignState.players.p2.name}
            {conversation.messageCounts.p2}/{conversation.requiredMessages.p2}
          </p>
        </div>

        <div class="conversation-log" aria-label="Current conversation">
          {#each conversation.messages as message}
            <p>
              <strong>{message.playerName}:</strong>
              {message.text}
            </p>
          {/each}
        </div>
      {/if}

      {#if errorMessage}
        <p class="error-message" role="alert">{errorMessage}</p>
      {/if}
    {/if}
  </div>

  {#if $campaignState && scene}
    <div class="terminal-controls">
      {#if scene.type === 'dialogue' || scene.type === 'image'}
        <button type="button" disabled={!typingComplete} on:click={advance}>
          Continue
        </button>
      {:else if scene.type === 'choice' || scene.type === 'timed-choice'}
        {#if scene.type === 'timed-choice'}
          <p class="timer" aria-live="polite">
            AUTO-SELECT IN {remainingSeconds}s
          </p>
        {/if}

        {#each scene.choices ?? [] as choice}
          <button
            type="button"
            disabled={!typingComplete}
            on:click={() => choose(choice.id)}
          >
            {choice.label}
          </button>
        {/each}
      {:else if scene.type === 'input'}
        <label class="input-label" for="scene-input">Terminal input</label>
        <div class="input-row">
          <input
            id="scene-input"
            bind:value={inputValue}
            maxlength={scene.maxLength ?? 200}
            disabled={!typingComplete}
            on:keydown={(event) => handleInputKeydown(event, submitInput)}
          >
          <button
            type="button"
            disabled={!typingComplete || !inputValue.trim()}
            on:click={submitInput}
          >
            Submit
          </button>
        </div>
      {:else if scene.type === 'checkpoint'}
        <button type="button" disabled>
          Waiting for partner
        </button>
      {:else if scene.type === 'conversation'}
        {#if conversation?.activePlayer === playerId}
          <label class="input-label" for="conversation-input">Your reply</label>
          <div class="input-row">
            <input
              id="conversation-input"
              bind:value={inputValue}
              maxlength="300"
              disabled={!typingComplete}
              on:keydown={(event) => handleInputKeydown(event, sendMessage)}
            >
            <button
              type="button"
              disabled={!typingComplete || !inputValue.trim()}
              on:click={sendMessage}
            >
              Send
            </button>
          </div>
        {:else}
          <button type="button" disabled>
            Waiting for response
          </button>
        {/if}
      {:else if scene.type === 'dice-check'}
        <div class="dice-summary">
          <span>D{scene.die}</span>
          <span>{scene.stat?.toUpperCase()}</span>
          <span>TARGET {scene.threshold}</span>
        </div>
        <button type="button" disabled={!typingComplete} on:click={rollDice}>
          Roll D{scene.die}
        </button>
      {:else if scene.type === 'vote'}
        {#if playerId && vote?.[playerId]}
          <button type="button" disabled>
            Vote submitted — waiting for partner
          </button>
        {:else}
          {#each scene.choices ?? [] as choice}
            <button
              type="button"
              disabled={!typingComplete}
              on:click={() => choose(choice.id)}
            >
              Vote: {choice.label}
            </button>
          {/each}
        {/if}
      {:else if scene.type === 'minigame'}
        {#if playerId && $campaignState.minigames[scene.id]?.readyPlayers.includes(playerId)}
          <button type="button" disabled>
            Waiting for partner to launch {scene.minigameId}
          </button>
        {:else}
          <button type="button" disabled={!typingComplete} on:click={launchMinigame}>
            Launch {scene.minigameId}
          </button>
        {/if}
      {:else if scene.type === 'ending'}
        <p class="system-message">END OF AVAILABLE STORY DATA</p>
      {/if}

      {#if !typingComplete}
        <button class="typing-skip" type="button" on:click={skipTyping}>
          Skip typing
        </button>
      {/if}
    </div>
  {/if}

  {#if pendingDice}
    <DiceTerminal result={pendingDice} on:close={closeDiceTerminal} />
  {/if}
</section>

<style lang="scss">
  .terminal {
    --terminal-accent: #02fbfb;

    position: relative;
    width: 100%;
    height: 95vh;
    max-width: 1100px;
    padding: 0;
    overflow: hidden;
    background: #070b16;
    border: 1px solid #2c3b54;
    border-radius: 8px;
    box-shadow:
      0 0 35px #02fbfb1f,
      inset 0 0 60px #000000;

    display: grid;
    grid-template-rows: auto 1fr auto;
  }

  .terminal-header {
    min-height: 38px;
    padding: 8px 14px;
    color: var(--terminal-accent);
    background: #111a2c;
    border-bottom: 1px solid #2c3b54;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: 0.75rem;
    letter-spacing: 2px;

    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .terminal-screen {
    padding: clamp(20px, 4vw, 52px);
    overflow-y: auto;
  }

  .scene-id {
    margin-bottom: 28px;
    color: #64748b;
    font-size: 0.75rem;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .terminal-history-entry {
    max-width: 78ch;
    margin-bottom: 32px;
    padding-bottom: 24px;
    border-bottom: 1px dashed #1e293b;
  }

  .history-scene-id {
    margin-bottom: 8px;
    color: #475569;
    font-size: 0.68rem;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .history-speaker {
    margin-bottom: 8px;
    color: #02bcbc;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
  }

  .history-text {
    color: #aeb9c9;
    line-height: 1.65;
    white-space: pre-wrap;
  }

  .speaker {
    margin-bottom: 12px;
    color: var(--terminal-accent);
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 1px;
  }

  .scene-text {
    max-width: 78ch;
    min-height: 4rem;
    color: #e8edf6;
    font-size: clamp(1rem, 2vw, 1.28rem);
    line-height: 1.75;
    white-space: pre-wrap;

    &::after {
      content: '▋';
      color: var(--terminal-accent);
      animation: blink 800ms steps(1) infinite;
    }
  }

  .scene-text-complete::after {
    display: none;
  }

  .scene-image-wrapper {
    max-width: 560px;
    margin-bottom: 28px;
    overflow: hidden;
    border: 1px solid #4a98d9;
    border-radius: 6px;
    box-shadow: 0 0 24px #4a98d944;
  }

  .scene-image {
    display: block;
    width: 100%;
    height: auto;
    opacity: 0.82;
  }

  .conversation-log {
    max-width: 78ch;
    margin-top: 28px;
    padding-top: 18px;
    border-top: 1px dashed #334155;

    p {
      margin-bottom: 10px;
      line-height: 1.5;
    }

    strong {
      color: #ff75fd;
    }
  }

  .conversation-status {
    max-width: 78ch;
    margin-top: 24px;
    padding: 10px 12px;
    color: #94a3b8;
    background: #0c1322;
    border-left: 3px solid #ff75fd;
    font-size: 0.76rem;

    display: flex;
    justify-content: space-between;
    gap: 16px;

    strong {
      color: #ff75fd;
    }
  }

  .error-message {
    margin-top: 18px;
    color: #fb716d;
  }

  .terminal-controls {
    padding: 16px;
    background: #0c1322;
    border-top: 1px solid #2c3b54;

    display: grid;
    gap: 10px;

    button,
    input {
      min-height: 48px;
      padding: 10px 16px;
      color: #e8edf6;
      background: #101a2d;
      border: 1px solid #4a98d9;
      border-radius: 4px;
      font: inherit;
    }

    button {
      cursor: pointer;
      font-weight: 700;
      transition:
        color 160ms ease,
        background-color 160ms ease,
        box-shadow 160ms ease;

      &:hover:not(:disabled),
      &:focus-visible {
        color: #07111d;
        background: var(--terminal-accent);
        box-shadow: 0 0 18px #02fbfb55;
        outline: 2px solid #ffffff;
        outline-offset: 2px;
      }

      &:disabled {
        cursor: not-allowed;
        opacity: 0.48;
      }
    }

    input:focus-visible {
      border-color: var(--terminal-accent);
      outline: 2px solid var(--terminal-accent);
      outline-offset: 2px;
    }

    button.typing-skip {
      justify-self: center;
      width: auto;
      min-height: auto;
      padding: 3px 8px;
      color: #8893a2;
      background: transparent;
      border: 0;
      font-size: 0.72rem;
      font-weight: 400;
      text-decoration: underline;
    }
  }

  .input-label {
    color: #94a3b8;
    font-size: 0.75rem;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .input-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
  }

  .timer {
    color: #f2d40e;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: 0.8rem;
    text-align: center;
  }

  .dice-summary {
    padding: 10px;
    color: #d6a741;
    border: 1px dashed #d6a741;

    display: flex;
    justify-content: space-around;
    gap: 14px;
  }

  .system-message {
    color: #94a3b8;
    letter-spacing: 1px;
    text-align: center;
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .scene-text::after {
      animation: none;
    }
  }
</style>
