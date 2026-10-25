<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { typewriter, typewriterProfiles } from '../actions/typewriter';
  import { applySceneAudio, stopMusic, stopSounds } from '../audio/audioManager';
  import { socket } from '../socket';
  import { campaignState } from '../stores/campaign';
  import { editorHandoff, libraryState } from '../stores/library';
  import type { StoryNode } from '../stores/library';
  import location from '../stores/location';
  import { sessionState } from '../stores/session';
  import { interpolateSceneText } from '../story/sceneTypes.js';
  import DiceTerminal from './DiceTerminal.svelte';

  let terminalScreenElement: HTMLElement;
  let inputValue = '';
  let errorMessage = '';
  let typingComplete = false;
  let submittedSceneId = '';
  let now = Date.now();
  let clock: number;
  let textValues: Record<string, string | number> = {};
  let lastScrollKey = '';
  let lastAudioSceneKey = '';
  let lastAudioCampaignId = '';
  let diceTerminalOpen = false;
  let scenePresentation: Pick<StoryNode, 'background' | 'backgroundTheme'> = {};
  let sceneAudioCues: StoryNode[] = [];
  let shakeEffect: StoryNode | undefined;
  let blinkEffect: StoryNode | undefined;
  let mirrorEffect: StoryNode | undefined;
  let spinEffect: StoryNode | undefined;
  let glowEffect: StoryNode | undefined;
  let scanEffect: StoryNode | undefined;
  let sceneSpeaker = '';
  let scenePortrait = '';
  let scenePortraitAlt = '';
  let scenePortraitPosition = { x: 50, y: 50 };

  $: playerId = $sessionState.playerId;
  $: sceneId = playerId && $campaignState
    ? $campaignState.currentScene[playerId]
    : '';
  $: scene = sceneId
    ? $campaignState?.story?.nodes.find((candidate) => candidate.id === sceneId)
    : undefined;
  $: editableNodeId = scene?.id
    ?? (playerId ? $campaignState?.lastScene?.[playerId] : '')
    ?? '';
  $: sceneCharacter = scene?.characterId
    ? $campaignState?.characters.find(
        (character) => character.id === scene?.characterId
      )
    : undefined;
  $: sceneSpeaker = sceneCharacter?.name ?? scene?.speaker ?? '';
  $: scenePortrait = sceneCharacter?.images?.[scene?.expression ?? 'normal']
    ?? scene?.portrait
    ?? '';
  $: scenePortraitAlt = sceneCharacter
    ? `${sceneCharacter.name}, ${scene?.expression ?? 'normal'} expression`
    : scene?.portraitAlt ?? '';
  $: scenePortraitPosition = sceneCharacter?.imagePositions?.[scene?.expression ?? 'normal']
    ?? scene?.portraitPosition
    ?? { x: 50, y: 50 };
  $: companionNodes = sceneId
    ? $campaignState?.story?.nodes.filter((candidate) => candidate.attachedTo === sceneId) ?? []
    : [];
  // Presentation companions remain client-only because they never alter story state.
  $: shakeEffect = companionNodes.find(
    (candidate) => candidate.type === 'screen-effect'
      && candidate.screenEffect === 'shake'
  );
  $: blinkEffect = companionNodes.find(
    (candidate) => candidate.type === 'screen-effect'
      && candidate.screenEffect === 'blink'
  );
  $: mirrorEffect = companionNodes.find(
    (candidate) => candidate.type === 'screen-effect'
      && candidate.screenEffect === 'mirror'
  );
  $: spinEffect = companionNodes.find(
    (candidate) => candidate.type === 'screen-effect'
      && candidate.screenEffect === 'spin'
  );
  $: glowEffect = companionNodes.find(
    (candidate) => candidate.type === 'screen-effect'
      && candidate.screenEffect === 'glow'
  );
  $: scanEffect = companionNodes.find(
    (candidate) => candidate.type === 'screen-effect'
      && candidate.screenEffect === 'scan'
  );
  $: screenShakeActive = Boolean(shakeEffect);
  $: terminalBlinkActive = Boolean(blinkEffect);
  $: terminalAnimations = createTerminalAnimations(
    shakeEffect,
    blinkEffect,
    spinEffect,
    glowEffect
  );
  $: terminalTheme = scenePresentation.backgroundTheme ?? 'blue';
  $: {
    scenePresentation = {
      background: scene?.background,
      backgroundTheme: scene?.backgroundTheme
    };

    for (const companion of companionNodes) {
      if (companion.background !== undefined) {
        scenePresentation.background = companion.background;
      }

      if (companion.backgroundTheme !== undefined) {
        scenePresentation.backgroundTheme = companion.backgroundTheme;
      }
    }
  }
  $: sceneAudioCues = [scene, ...companionNodes]
    .filter((candidate): candidate is StoryNode => Boolean(candidate));

  $: player = playerId && $campaignState
    ? $campaignState.players[playerId]
    : null;
  $: terminalEntries = playerId && $campaignState
    ? $campaignState.terminalOutput[playerId]
    : [];
  $: pendingDice = playerId && $campaignState
    ? $campaignState.pendingDice[playerId]
    : undefined;
  $: storyEnded = Boolean(
    playerId && $campaignState?.endedPlayers?.includes(playerId)
  );
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
  $: localStoryId = playerId
    ? $libraryState.selections[playerId]
    : null;
  $: partnerStoryId = playerId
    ? $libraryState.selections[playerId === 'p1' ? 'p2' : 'p1']
    : null;
  $: localStoryTitle = getStoryTitle(localStoryId);
  $: partnerStoryTitle = getStoryTitle(partnerStoryId);
  $: soloSpectator = $libraryState.activeStoryMode === 'singleplayer'
    && Boolean(playerId)
    && Boolean($libraryState.activeSoloPlayerId)
    && $libraryState.activeSoloPlayerId !== playerId;
  $: scrollKey = `${sceneId}:${terminalEntries.length}:${conversation?.messages.length ?? 0}`;
  $: audioCampaignId = $campaignState?.campaignId ?? '';

  $: if (terminalScreenElement && scrollKey !== lastScrollKey) {
    lastScrollKey = scrollKey;
    void scrollTerminalToBottom();
  }

  $: if (audioCampaignId && audioCampaignId !== lastAudioCampaignId) {
    lastAudioCampaignId = audioCampaignId;
    stopMusic();
    stopSounds();
  }

  $: audioSceneKey = scene
    ? `${audioCampaignId}:${sceneId}:${sceneAudioCues.map(audioCueSignature).join('|')}`
    : '';

  $: if (scene && audioSceneKey !== lastAudioSceneKey) {
    lastAudioSceneKey = audioSceneKey;
    applySceneAudio(sceneAudioCues);
  }

  $: if (sceneId) {
    typingComplete = false;
    inputValue = '';
    errorMessage = '';
    diceTerminalOpen = false;
  }

  $: if (pendingDice) {
    diceTerminalOpen = true;
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

  function audioCueSignature(cue: StoryNode): string {
    return [
      cue.id,
      cue.type,
      cue.music ?? '',
      cue.sound ?? '',
      cue.audioId ?? '',
      cue.audioLayer ?? '',
      cue.audioVolume ?? '',
      cue.audioLoop ?? '',
      cue.fadeInSeconds ?? '',
      cue.fadeOutSeconds ?? '',
      cue.stopMusic ?? '',
      (cue.stopMusicIds ?? []).join(','),
      (cue.stopMusicLayers ?? []).join(','),
      cue.stopSounds ?? ''
    ].join(':');
  }

  function createTerminalAnimations(
    activeShake: StoryNode | undefined,
    activeBlink: StoryNode | undefined,
    activeSpin: StoryNode | undefined,
    activeGlow: StoryNode | undefined
  ): string {
    const animations: string[] = [];

    if (activeShake) {
      animations.push(
        `terminal-shake ${effectDuration(activeShake, 0.6)}s cubic-bezier(0.36, 0.07, 0.19, 0.97) ${effectIterations(activeShake)} both`
      );
    }

    if (activeBlink) {
      animations.push(
        `terminal-blink ${effectDuration(activeBlink, 0.75)}s steps(2, end) ${effectIterations(activeBlink)} both`
      );
    }

    if (activeSpin) {
      animations.push(
        `terminal-spin ${effectDuration(activeSpin, 1.5)}s linear ${effectIterations(activeSpin)} both`
      );
    }

    if (activeGlow) {
      animations.push(
        `terminal-glow ${effectDuration(activeGlow, 1.4)}s ease-in-out ${effectIterations(activeGlow)} alternate`
      );
    }

    return animations.join(', ');
  }

  function effectDuration(effect: Partial<StoryNode>, fallback: number): number {
    return Math.max(0.1, Number(effect.effectDurationSeconds ?? fallback));
  }

  function effectIterations(effect: Partial<StoryNode>): string {
    return effect.effectLoop
      ? 'infinite'
      : String(Math.max(1, Math.trunc(Number(effect.effectIterations ?? 1))));
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

  function choiceIsAvailable(choice: NonNullable<StoryNode['choices']>[number]): boolean {
    if (choice.disabled || !choice.condition || !player || !$campaignState) {
      return !choice.disabled && !choice.condition;
    }

    const condition = choice.condition;

    switch (condition.type) {
      case 'has-item':
        return player.inventory.includes(condition.key);
      case 'flag-equals':
        return $campaignState.flags[condition.key] === condition.value;
      case 'stat-at-least':
        return Number(player.stats[condition.key] ?? 0) >= Number(condition.value ?? 0);
      case 'relationship-at-least':
        return Number(player.relationships?.[condition.key] ?? 0) >= Number(condition.value ?? 0);
      default:
        return false;
    }
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

  function openDiceTerminal(): void {
    diceTerminalOpen = true;
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

  function completeTyping(): void {
    typingComplete = true;

    if (scene?.type === 'timed-choice' && !remainingMs) {
      sendAction({
        type: 'start-timer',
        sceneId: scene.id
      });
    }
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

  function resetStory(): void {
    errorMessage = '';
    socket.emit('campaign:reset', (result: { ok: boolean; error?: string }) => {
      if (!result.ok) {
        errorMessage = result.error ?? 'Story Mode could not be reset.';
      }
    });
  }

  function handleInputKeydown(event: KeyboardEvent, submit: () => void): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  }

  async function scrollTerminalToBottom(): Promise<void> {
    await tick();

    if (!terminalScreenElement) {
      return;
    }

    terminalScreenElement.scrollTo({
      top: terminalScreenElement.scrollHeight,
      behavior: 'smooth'
    });
  }

  function getStoryTitle(storyId: string | null): string {
    if (!storyId) {
      return 'NONE';
    }

    return $libraryState.stories.find((story) => story.id === storyId)?.title
      ?? storyId;
  }

  function editCurrentNode(): void {
    if (!$libraryState.activeStoryId || !editableNodeId) {
      return;
    }

    editorHandoff.set({
      storyId: $libraryState.activeStoryId,
      nodeId: editableNodeId,
      map: $libraryState.activeStoryMode ?? 'multiplayer'
    });
    location.set('editor');
  }

  function openLogs(): void {
    location.set('journal');
  }
</script>

<section
  class="terminal terminal-theme-{terminalTheme}"
  class:hide={$location !== 'terminal'}
  transition:fade={{ duration: 300 }}
  aria-label="Story terminal"
>
  <header class="terminal-header">
    <span>DEJAVU://CAMPAIGN</span>
    <div>
      <span>{playerId?.toUpperCase() ?? 'CONNECTING'}</span>
      <button type="button" disabled={!$libraryState.activeStoryId} on:click={openLogs}>LOGS</button>
      <button type="button" disabled={!$libraryState.activeStoryId || !editableNodeId} on:click={editCurrentNode}>EDIT NODE</button>
      <button type="button" disabled={!$libraryState.activeStoryId} on:click={resetStory}>RESET STORY</button>
    </div>
  </header>

  <div
    class="terminal-screen"
    class:has-scene-background={Boolean(scenePresentation.background)}
    class:terminal-screen--shake={screenShakeActive}
    class:terminal-screen--blink={terminalBlinkActive}
    class:terminal-screen--mirror={Boolean(mirrorEffect)}
    class:terminal-screen--spin={Boolean(spinEffect)}
    class:terminal-screen--glow={Boolean(glowEffect)}
    class:terminal-screen--scan={Boolean(scanEffect)}
    data-scan-direction={scanEffect?.scanDirection ?? 'left-to-right'}
    style:animation={terminalAnimations || undefined}
    style:scale={mirrorEffect
      ? mirrorEffect.mirrorAxis === 'vertical'
        ? '1 -1'
        : mirrorEffect.mirrorAxis === 'both'
          ? '-1 -1'
          : '-1 1'
      : undefined}
    style:--spin-turn={spinEffect?.spinDirection === 'counterclockwise' ? '-1turn' : '1turn'}
    style:--glow-color={glowEffect?.effectColor ?? '#39ff88'}
    style:--scan-color={scanEffect?.effectColor ?? '#39ff88'}
    style:--scan-duration={`${effectDuration(scanEffect ?? {}, 1.5)}s`}
    style:--scan-iterations={scanEffect ? effectIterations(scanEffect) : '1'}
    style:background-image={scenePresentation.background
      ? `linear-gradient(#070b16dd, #070b16ee), url(${scenePresentation.background})`
      : undefined}
    bind:this={terminalScreenElement}
  >
    {#if !$libraryState.activeStoryId}
      <div class="cartridge-status" role="status">
        <p class="scene-id">STORY CARTRIDGE REQUIRED</p>
        <h1>Story Mode is offline</h1>

        {#if !localStoryId}
          <p>Open Library and select a story cartridge to stage it.</p>
        {:else if !partnerStoryId}
          <p>
            You selected <strong>{localStoryTitle}</strong>. Waiting for the
            other player to select a story.
          </p>
        {:else}
          <p>The inserted cartridges do not match.</p>
          <dl>
            <div>
              <dt>YOUR CARTRIDGE</dt>
              <dd>{localStoryTitle}</dd>
            </div>
            <div>
              <dt>PARTNER CARTRIDGE</dt>
              <dd>{partnerStoryTitle}</dd>
            </div>
          </dl>
        {/if}

        <button type="button" on:click={() => location.set('library')}>
          Open Library
        </button>
      </div>
    {:else if soloSpectator}
      <div class="cartridge-status" role="status">
        <p class="scene-id">SOLO SESSION ACTIVE</p>
        <h1>Your partner is playing this cartridge solo</h1>
        <p>Select a solo cartridge from Library to take control, or choose the same multiplayer cartridge together.</p>
        <button type="button" on:click={() => location.set('library')}>Open Library</button>
      </div>
    {:else if storyEnded}
      <div class="cartridge-status" role="status">
        <p class="scene-id">END OF PATH</p>
        <h1>This story branch has ended</h1>
        <p>The cartridge had no next connection, so the terminal closed this path cleanly.</p>
      </div>
    {:else if !$campaignState || !scene}
      <p class="system-message">Synchronizing campaign state...</p>
    {:else}
      <div class="terminal-history" aria-label="Previous terminal output">
        {#each terminalEntries as entry}
          {#if entry.kind === 'image' && entry.src}
            <article class="terminal-history-entry terminal-history-entry--image">
              <figure
                class="scene-image-wrapper terminal-image-entry"
                style:border-color={entry.imageBorderColor ?? '#1472bf'}
              >
                <img
                  class="scene-image"
                  src={entry.src}
                  alt={entry.logText ?? entry.alt ?? ''}
                  style:object-position={`${entry.imagePositionX ?? 50}% ${entry.imagePositionY ?? 50}%`}
                >
              </figure>
              {#if entry.text}
                <div>
                  <p class="history-scene-id">{entry.sceneId}</p>
                  {#if entry.speaker}
                    <p class="history-speaker">{interpolateSceneText(entry.speaker, textValues)}</p>
                  {/if}
                  <p class="history-text">{interpolateSceneText(entry.text, textValues)}</p>
                </div>
              {/if}
            </article>
          {:else}
            <article class="terminal-history-entry" class:terminal-history-entry--portrait={Boolean(entry.portrait)}>
              {#if entry.portrait}
                <img
                  class="history-portrait"
                  src={entry.portrait}
                  alt={entry.portraitAlt ?? ''}
                  style:object-position={`${entry.portraitPosition?.x ?? 50}% ${entry.portraitPosition?.y ?? 50}%`}
                >
              {/if}
              <div>
                <p class="history-scene-id">{entry.sceneId}</p>
                <p class="history-speaker">{interpolateSceneText(entry.speaker, textValues)}</p>
                <p class="history-text">{interpolateSceneText(entry.text, textValues)}</p>
              </div>
            </article>
          {/if}
        {/each}
      </div>

      {#if scene.type !== 'image'}
        <p class="scene-id">{scene.id}</p>

        <div class="scene-copy" class:scene-copy--portrait={scene.type === 'dialogue' && Boolean(scenePortrait)}>
          {#if scene.type === 'dialogue' && scenePortrait}
            <figure class="dialogue-portrait">
              <img
                src={scenePortrait}
                alt={scenePortraitAlt}
                style:object-position={`${scenePortraitPosition.x}% ${scenePortraitPosition.y}%`}
              >
            </figure>
          {/if}

          <div class="scene-copy__text">
            {#if sceneSpeaker}
              <p class="speaker">{interpolateSceneText(sceneSpeaker, textValues)}</p>
            {/if}

            <p
              class="scene-text"
              class:scene-text-complete={typingComplete}
              use:typewriter={{
                text: sceneText,
                timing: sceneSpeaker
                  ? typewriterProfiles.dialogue
                  : typewriterProfiles.narration,
                onUpdate: scrollTerminalToBottom,
                onComplete: completeTyping
              }}
              aria-live="polite"
            ></p>
          </div>
        </div>
      {/if}

      {#if scene.type === 'conversation' && conversation}
        <div class="conversation-status" aria-live="polite">
          <p>
            <strong>{$campaignState.players[conversation.activePlayer].name}</strong>
            has the floor
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
      {#if ['dialogue', 'image', 'effect', 'ambience'].includes(scene.type)}
        <button type="button" on:click={advance}>
          {scene.continueLabel?.trim() || 'Continue'}
        </button>
      {:else if scene.type === 'choice' || scene.type === 'timed-choice'}
        {#if scene.type === 'timed-choice' && typingComplete && remainingMs}
          <p class="timer" aria-live="polite">
            AUTO-SELECT IN {remainingSeconds}s
          </p>
        {/if}

        {#each scene.choices ?? [] as choice}
          <button
            type="button"
            disabled={!choiceIsAvailable(choice)}
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
            placeholder={scene.placeholder ?? ''}
            maxlength={scene.maxLength ?? 200}
            on:keydown={(event) => handleInputKeydown(event, submitInput)}
          >
          <button
            type="button"
            disabled={!inputValue.trim()}
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
          <label class="input-label" for="conversation-input">Say something</label>
          <div class="input-row">
            <input
              id="conversation-input"
              bind:value={inputValue}
              maxlength="300"
              on:keydown={(event) => handleInputKeydown(event, sendMessage)}
            >
            <button
              type="button"
              disabled={!inputValue.trim()}
              on:click={sendMessage}
            >
              Send
            </button>
          </div>
        {:else}
          <button type="button" disabled>
            Waiting for the other player to speak
          </button>
        {/if}
      {:else if scene.type === 'dice-check'}
        <div class="dice-summary">
          <span>D{scene.die}</span>
          <span>{scene.stat?.toUpperCase()}</span>
          <span>TARGET {scene.threshold}</span>
        </div>
        <button type="button" on:click={openDiceTerminal}>
          Prepare D{scene.die} roll
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
              disabled={!choiceIsAvailable(choice)}
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
          <button type="button" on:click={launchMinigame}>
            Launch {scene.minigameId}
          </button>
        {/if}
      {:else if scene.type === 'ending'}
        <p class="system-message">END OF AVAILABLE STORY DATA</p>
      {/if}

    </div>
  {/if}

  {#if diceTerminalOpen && scene?.type === 'dice-check' && player}
    <DiceTerminal
      die={scene.die ?? 20}
      stat={scene.stat ?? 'unknown'}
      base={Number(player.stats[scene.stat ?? ''] ?? 0)}
      luck={Number(player.stats.luck ?? 0)}
      threshold={scene.threshold ?? 0}
      result={pendingDice}
      on:roll={rollDice}
      on:close={closeDiceTerminal}
    />
  {/if}
</section>

<style lang="scss">
  .terminal {
    --terminal-accent: #4a98d9;

    position: relative;
    width: 100%;
    height: 100%;
    max-width: 1100px;
    padding: 0;
    overflow: hidden;
    background: #070b16;
    border: 1px solid var(--terminal-accent);
    border-radius: 8px;
    box-shadow:
      0 0 35px color-mix(in srgb, var(--terminal-accent) 30%, transparent),
      inset 0 0 60px #000000;

    display: grid;
    grid-template-rows: auto 1fr auto;
  }

  .terminal-theme-red {
    --terminal-accent: #ef5b67;
  }

  .terminal-theme-purple {
    --terminal-accent: #b77aff;
  }

  .terminal-theme-green {
    --terminal-accent: #55f09a;
  }

  .terminal-theme-amber {
    --terminal-accent: #f0b94f;
  }

  .terminal-theme-pink {
    --terminal-accent: #ff75c8;
  }

  .terminal-theme-cyan {
    --terminal-accent: #02fbfb;
  }

  .terminal-theme-white {
    --terminal-accent: #e8edf6;
  }

  .terminal-header {
    min-height: 38px;
    padding: 8px 14px;
    color: var(--terminal-accent);
    background: #111a2c;
    border-bottom: 1px solid var(--terminal-accent);
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: 0.75rem;
    letter-spacing: 2px;

    display: flex;
    justify-content: space-between;
    align-items: center;

    div {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    button {
      min-height: 28px;
      padding: 4px 9px;
      color: #f8e69a;
      background: #28220b;
      border: 1px solid #ad781c;
      font: inherit;
      font-size: 0.62rem;
      cursor: pointer;

      &:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
    }
  }

  .terminal-screen {
    position: relative;
    min-height: 0;
    padding: clamp(20px, 4vw, 52px);
    overflow-y: auto;

    &.has-scene-background {
      background-position: center;
      background-size: cover;
    }

    &.terminal-screen--scan::after {
      content: '';
      position: absolute;
      z-index: 8;
      top: 0;
      left: 0;
      width: 4px;
      height: 100%;
      background: var(--scan-color);
      box-shadow: 0 0 18px 5px var(--scan-color);
      opacity: 0.72;
      pointer-events: none;
      animation: terminal-scan-horizontal var(--scan-duration) linear var(--scan-iterations) both;
    }

    &.terminal-screen--scan[data-scan-direction='right-to-left']::after {
      animation-direction: reverse;
    }

    &.terminal-screen--scan[data-scan-direction='top-to-bottom']::after,
    &.terminal-screen--scan[data-scan-direction='bottom-to-top']::after {
      width: 100%;
      height: 4px;
      animation-name: terminal-scan-vertical;
    }

    &.terminal-screen--scan[data-scan-direction='bottom-to-top']::after {
      animation-direction: reverse;
    }
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

  .terminal-history-entry--portrait {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr);
    gap: 13px;
    align-items: start;
  }

  .terminal-history-entry--image {
    width: min(100%, 560px);

    .scene-image-wrapper {
      margin-bottom: 18px;
    }
  }

  .history-portrait {
    width: 56px;
    height: 68px;
    object-fit: cover;
    background: #07111d;
    border: 1px solid #1472bf;
    border-radius: 3px 10px;
    opacity: 0.72;
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
    color: var(--terminal-accent);
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

  .scene-copy {
    max-width: 78ch;
  }

  .scene-copy--portrait {
    max-width: 92ch;

    display: grid;
    grid-template-columns: 96px minmax(0, 1fr);
    gap: 18px;
    align-items: start;
  }

  .scene-copy__text {
    min-width: 0;
  }

  .dialogue-portrait {
    width: 96px;
    height: 112px;
    margin: 0;
    overflow: hidden;
    background: #07111d;
    border: 1px solid var(--terminal-accent);
    border-radius: 4px 16px;
    box-shadow: 0 0 18px #02fbfb2e;

    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0.88;
    }
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

  @media (max-width: 560px) {
    .scene-copy--portrait {
      grid-template-columns: 70px minmax(0, 1fr);
      gap: 12px;
    }

    .dialogue-portrait {
      width: 70px;
      height: 84px;
    }
  }

  .scene-text-complete::after {
    display: none;
  }

  .scene-image-wrapper {
    aspect-ratio: 16 / 9;
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
    height: 100%;
    object-fit: cover;
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

  .cartridge-status {
    max-width: 680px;
    margin: 80px auto;
    padding: 28px;
    background: #0c1322;
    border: 1px solid #4a98d9;
    box-shadow: 0 0 28px #4a98d924;

    h1 {
      margin: 10px 0 16px;
      font-family: "Orbitron", "Space Mono", sans-serif;
    }

    p {
      color: #aeb9c9;
      line-height: 1.6;
    }

    strong,
    dd {
      color: #02fbfb;
    }

    dl {
      margin-top: 22px;

      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    dl div {
      padding: 14px;
      background: #070b16;
      border: 1px solid #2c3b54;
    }

    dt {
      margin-bottom: 8px;
      color: #8893a2;
      font-size: 0.7rem;
    }

    button {
      width: 100%;
      min-height: 46px;
      margin-top: 24px;
      color: #07111d;
      background: #02fbfb;
      border: 1px solid #02fbfb;
      border-radius: 4px;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  @keyframes -global-terminal-shake {
    0%,
    100% {
      translate: 0 0;
    }

    15%,
    45%,
    75% {
      translate: -8px 2px;
    }

    30%,
    60%,
    90% {
      translate: 8px -2px;
    }
  }

  @keyframes -global-terminal-blink {
    0%,
    100% {
      filter: brightness(1);
      opacity: 1;
    }

    25%,
    65% {
      filter: brightness(2.1);
      opacity: 0.2;
    }

    45%,
    85% {
      filter: brightness(0.5);
      opacity: 0.72;
    }
  }

  @keyframes -global-terminal-spin {
    to {
      rotate: var(--spin-turn);
    }
  }

  @keyframes -global-terminal-glow {
    from {
      box-shadow: 0 0 0 transparent;
    }

    to {
      box-shadow: 0 0 48px 16px var(--glow-color);
    }
  }

  @keyframes terminal-scan-horizontal {
    from {
      left: 0;
    }

    to {
      left: calc(100% - 4px);
    }
  }

  @keyframes terminal-scan-vertical {
    from {
      top: 0;
    }

    to {
      top: calc(100% - 4px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .scene-text::after,
    .terminal-screen--shake,
    .terminal-screen--blink,
    .terminal-screen--spin,
    .terminal-screen--glow,
    .terminal-screen--scan {
      animation: none !important;
    }

    .terminal-screen--scan::after {
      animation: none;
      display: none;
    }
  }
</style>
