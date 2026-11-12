<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { socket } from '../socket';
  import {
    developerSessionState,
    type CampaignPlayer
  } from '../stores/campaign';
  import type { StoryNode } from '../stores/library';
  import type { PlayerId } from '../stores/session';

  export let storyId = '';

  type JumpRequirement = {
    kind: string;
    playerId: PlayerId;
    sceneId: string;
    key: string;
    value?: unknown;
    expected?: unknown;
    missing: boolean;
    description: string;
  };

  type JumpPlan = {
    ok: boolean;
    requirements: JumpRequirement[];
    blockingIssues: string[];
  };

  const dispatch = createEventDispatcher<{ close: void }>();
  const playerIds: PlayerId[] = ['p1', 'p2'];

  let errorMessage = '';
  let actionPending = false;
  let inputValues: Record<PlayerId, string> = {
    p1: '',
    p2: ''
  };
  let forcedRolls: Record<PlayerId, number> = {
    p1: 1,
    p2: 1
  };
  let jumpOpen = false;
  let jumpTargets: Record<PlayerId, string> = {
    p1: '',
    p2: ''
  };
  let jumpPlan: JumpPlan | null = null;
  let applyJumpRequirements = true;
  let stateScope = 'flag';
  let statePlayerId: PlayerId = 'p1';
  let stateKey = '';
  let stateValue = '';

  $: campaign = $developerSessionState?.campaign ?? null;
  $: story = campaign?.story ?? null;
  $: events = $developerSessionState?.events ?? [];

  onMount(() => {
    // A developer session belongs to the current socket and cartridge. Starting
    // afresh prevents a reconnect or cartridge change from reusing stale state.
    developerSessionState.set(null);
    socket.emit('campaign:dev-start', { storyId }, handleResult);
  });

  function sceneFor(playerId: PlayerId): StoryNode | null {
    const sceneId = campaign?.currentScene[playerId];

    return story?.nodes.find((node) => node.id === sceneId) ?? null;
  }

  function playerFor(playerId: PlayerId): CampaignPlayer | null {
    return campaign?.players[playerId] ?? null;
  }

  function eligibleJumpNodes(playerId: PlayerId): StoryNode[] {
    return story?.nodes.filter((node) => (
      node.map === 'multiplayer'
      && !node.attachedTo
      && node.type !== 'label'
      && (node.audience === playerId || node.audience === 'both')
    )) ?? [];
  }

  function sendAction(playerId: PlayerId, action: Record<string, unknown>): void {
    actionPending = true;
    errorMessage = '';
    socket.emit('campaign:dev-action', { playerId, action }, (result: {
      ok: boolean;
      error?: string;
    }) => {
      actionPending = false;

      if (!result.ok) {
        errorMessage = result.error ?? 'The test action failed.';
      }
    });
  }

  function submitInput(playerId: PlayerId, scene: StoryNode): void {
    const value = inputValues[playerId].trim();

    if (!value) {
      errorMessage = 'Enter a test response first.';
      return;
    }

    const actionType = scene.type === 'conversation'
      ? 'send-message'
      : 'submit-input';

    sendAction(playerId, {
      type: actionType,
      sceneId: scene.id,
      value
    });
    inputValues[playerId] = '';
  }

  function rollDice(playerId: PlayerId, scene: StoryNode): void {
    sendAction(playerId, {
      type: 'roll-dice',
      sceneId: scene.id,
      forcedRoll: forcedRolls[playerId]
    });
  }

  function openJump(): void {
    if (!campaign) {
      return;
    }

    jumpTargets = {
      p1: campaign.currentScene.p1,
      p2: campaign.currentScene.p2
    };
    jumpPlan = null;
    jumpOpen = true;
  }

  function previewJump(): void {
    errorMessage = '';
    socket.emit('campaign:dev-jump-preview', jumpTargets, (result: {
      ok: boolean;
      error?: string;
      plan?: JumpPlan;
    }) => {
      if (!result.ok || !result.plan) {
        errorMessage = result.error ?? 'Could not inspect that jump.';
        return;
      }

      jumpPlan = result.plan;
    });
  }

  function performJump(): void {
    socket.emit('campaign:dev-jump', {
      targets: jumpTargets,
      applyRequirements: applyJumpRequirements
    }, (result: { ok: boolean; error?: string; plan?: JumpPlan }) => {
      jumpPlan = result.plan ?? jumpPlan;

      if (!result.ok) {
        errorMessage = result.error ?? 'Could not jump to those nodes.';
        return;
      }

      jumpOpen = false;
      errorMessage = '';
    });
  }

  function updateTestState(): void {
    let value: unknown = stateValue;

    if (['stat', 'relationship'].includes(stateScope)) {
      value = Number(stateValue);
    } else if (stateScope === 'flag') {
      value = normalizeStateValue(stateValue);
    }

    socket.emit('campaign:dev-update-state', {
      scope: stateScope,
      playerId: statePlayerId,
      key: stateKey,
      value
    }, handleResult);
  }

  function normalizeStateValue(value: string): string | number | boolean {
    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }

    const number = Number(value);

    return value.trim() !== '' && Number.isFinite(number)
      ? number
      : value;
  }

  function closeDeveloperMode(): void {
    socket.emit('campaign:dev-stop', () => {
      dispatch('close');
    });
  }

  function handleResult(result: { ok: boolean; error?: string }): void {
    if (!result.ok) {
      errorMessage = result.error ?? 'The developer action failed.';
    }
  }

  function formatState(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }
</script>

<section class="developer-shell" aria-label="Multiplayer developer playtest">
  <header class="developer-toolbar">
    <div>
      <p>DEVELOPER PLAYTEST</p>
      <h1>{story?.title ?? 'Starting isolated test session…'}</h1>
    </div>
    <div class="developer-actions">
      <button type="button" disabled={!campaign} on:click={openJump}>Jump to nodes</button>
      <button type="button" on:click={closeDeveloperMode}>Exit developer mode</button>
    </div>
  </header>

  {#if errorMessage}
    <p class="developer-error" role="alert">{errorMessage}</p>
  {/if}

  {#if campaign && story}
    <div class="developer-terminals">
      {#each playerIds as playerId}
        {@const scene = sceneFor(playerId)}
        {@const player = playerFor(playerId)}
        <article class="developer-terminal">
          <header>
            <span>{playerId === 'p1' ? 'PLAYER 1' : 'PLAYER 2'}</span>
            <strong>{player?.name}</strong>
            <code>{scene?.id ?? 'ENDED'}</code>
          </header>

          {#if scene}
            <div class="developer-scene">
              <small>{scene.type.toUpperCase()}</small>
              {#if scene.speaker}
                <h2>{scene.speaker}</h2>
              {/if}
              <p>{scene.text ?? scene.prompt ?? scene.alt ?? 'This node has no visible text.'}</p>
            </div>

            <div class="developer-node-controls">
              {#if ['dialogue', 'image', 'ambience', 'effect'].includes(scene.type)}
                <button
                  type="button"
                  disabled={actionPending || scene.timed}
                  on:click={() => sendAction(playerId, { type: 'advance', sceneId: scene.id })}
                >Continue</button>
              {:else if ['choice', 'vote'].includes(scene.type)}
                {#each scene.choices ?? [] as choice}
                  <button
                    type="button"
                    disabled={actionPending || choice.disabled}
                    on:click={() => sendAction(playerId, {
                      type: scene.type === 'vote' ? 'vote' : 'choose',
                      sceneId: scene.id,
                      choiceId: choice.id
                    })}
                  >{choice.label}</button>
                {/each}
              {:else if ['input', 'conversation'].includes(scene.type)}
                <textarea rows="2" bind:value={inputValues[playerId]}></textarea>
                <button type="button" disabled={actionPending} on:click={() => submitInput(playerId, scene)}>
                  Submit as {player?.name}
                </button>
              {:else if scene.type === 'checkpoint'}
                <button
                  type="button"
                  disabled={actionPending}
                  on:click={() => sendAction(playerId, { type: 'arrive-checkpoint', sceneId: scene.id })}
                >Arrive at checkpoint</button>
              {:else if scene.type === 'dice-check'}
                <label>
                  <span>Forced d{scene.die ?? 20} result</span>
                  <input
                    type="number"
                    min="1"
                    max={scene.die ?? 20}
                    bind:value={forcedRolls[playerId]}
                  >
                </label>
                {#if campaign.pendingDice[playerId]}
                  <p class="dice-result">
                    Roll {campaign.pendingDice[playerId]?.roll} · total {campaign.pendingDice[playerId]?.total}
                    · {campaign.pendingDice[playerId]?.successful ? 'SUCCESS' : 'FAILURE'}
                  </p>
                  <button
                    type="button"
                    on:click={() => sendAction(playerId, { type: 'close-dice', sceneId: scene.id })}
                  >Close dice</button>
                {:else}
                  <button type="button" disabled={actionPending} on:click={() => rollDice(playerId, scene)}>
                    Roll controlled die
                  </button>
                {/if}
              {:else if scene.type === 'clear-terminal'}
                <button
                  type="button"
                  on:click={() => sendAction(playerId, {
                    type: 'continue-clear-terminal',
                    sceneId: scene.id
                  })}
                >Clear and continue</button>
              {:else}
                <p class="unsupported-control">Use Jump to nodes to move beyond this node in the current tester.</p>
              {/if}
            </div>
          {:else}
            <p class="ended-message">This player’s branch has ended.</p>
          {/if}
        </article>
      {/each}
    </div>

    <div class="developer-inspection-grid">
      <section class="state-inspector">
        <header>
          <h2>Current state</h2>
          <span>Isolated from the real cartridge session</span>
        </header>

        <div class="state-columns">
          {#each playerIds as playerId}
            <article>
              <h3>{playerId.toUpperCase()} · {campaign.players[playerId].name}</h3>
              <details open>
                <summary>Stats</summary>
                <pre>{formatState(campaign.players[playerId].stats)}</pre>
              </details>
              <details>
                <summary>Inventory</summary>
                <pre>{formatState(campaign.players[playerId].inventory)}</pre>
              </details>
              <details>
                <summary>Relationships</summary>
                <pre>{formatState(campaign.players[playerId].relationships)}</pre>
              </details>
              <details>
                <summary>Inputs</summary>
                <pre>{formatState(campaign.inputs[playerId])}</pre>
              </details>
            </article>
          {/each}
        </div>

        <details class="shared-state" open>
          <summary>Shared flags, checkpoints and decisions</summary>
          <pre>{formatState({
            flags: campaign.flags,
            checkpoints: campaign.checkpoints,
            decisions: campaign.decisions,
            audioAndEffects: {
              appliedCompanions: campaign.appliedCompanions,
              activeMinigame: campaign.activeMinigame
            }
          })}</pre>
        </details>

        <div class="state-editor">
          <h3>Edit temporary state</h3>
          <label>
            <span>Field</span>
            <select bind:value={stateScope}>
              <option value="flag">Story flag</option>
              <option value="stat">Player stat</option>
              <option value="relationship">Relationship</option>
              <option value="inventory">Inventory, comma separated</option>
              <option value="input">Saved input</option>
              <option value="name">Player name</option>
            </select>
          </label>
          {#if stateScope !== 'flag'}
            <label>
              <span>Player</span>
              <select bind:value={statePlayerId}>
                <option value="p1">Player 1</option>
                <option value="p2">Player 2</option>
              </select>
            </label>
          {/if}
          {#if stateScope !== 'inventory' && stateScope !== 'name'}
            <label>
              <span>ID / key</span>
              <input bind:value={stateKey}>
            </label>
          {/if}
          <label>
            <span>Value</span>
            <input bind:value={stateValue}>
          </label>
          <button type="button" on:click={updateTestState}>Apply test value</button>
        </div>
      </section>

      <section class="event-log">
        <header>
          <h2>Event log</h2>
          <span>{events.length} events</span>
        </header>
        <div>
          {#each [...events].reverse() as event (event.id)}
            <article>
              <time>{new Date(event.createdAt).toLocaleTimeString()}</time>
              <strong>{event.type}</strong>
              <p>{event.message}</p>
              <small>P1 {event.scenes.p1} · P2 {event.scenes.p2}</small>
            </article>
          {/each}
        </div>
      </section>
    </div>
  {:else}
    <div class="developer-loading">Creating isolated multiplayer terminals…</div>
  {/if}
</section>

{#if jumpOpen && campaign && story}
  <div class="developer-modal-backdrop" role="presentation" on:click|self={() => jumpOpen = false}>
    <section class="jump-modal" role="dialog" aria-modal="true" aria-labelledby="jump-title">
      <header>
        <div>
          <p>PREREQUISITE-AWARE NAVIGATION</p>
          <h2 id="jump-title">Jump both test players</h2>
        </div>
        <button type="button" aria-label="Close jump dialog" on:click={() => jumpOpen = false}>×</button>
      </header>

      <div class="jump-targets">
        {#each playerIds as playerId}
          <label>
            <span>{playerId === 'p1' ? 'Player 1 destination' : 'Player 2 destination'}</span>
            <select bind:value={jumpTargets[playerId]} on:change={() => jumpPlan = null}>
              {#each eligibleJumpNodes(playerId) as node}
                <option value={node.id}>{node.id} · {node.type}</option>
              {/each}
            </select>
          </label>
        {/each}
      </div>

      <button class="preview-jump" type="button" on:click={previewJump}>Check prerequisites</button>

      {#if jumpPlan}
        {#if jumpPlan.blockingIssues.length > 0}
          <div class="jump-blockers">
            <strong>This jump would break synchronization</strong>
            {#each jumpPlan.blockingIssues as issue}
              <p>{issue}</p>
            {/each}
          </div>
        {/if}

        <div class="jump-requirements">
          <h3>Path setup</h3>
          {#if jumpPlan.requirements.length === 0}
            <p>No earlier decisions or state changes are required.</p>
          {:else}
            {#each jumpPlan.requirements as requirement}
              <article class:missing={requirement.missing}>
                <span>{requirement.kind}</span>
                <p>{requirement.description}</p>
                <strong>{requirement.missing ? 'MISSING' : 'READY'}</strong>
              </article>
            {/each}
          {/if}
        </div>

        <label class="apply-requirements">
          <input type="checkbox" bind:checked={applyJumpRequirements}>
          <span>Apply missing decisions, flags, stats, relationships, dice outcomes and checkpoints to the test state</span>
        </label>

        <button
          class="perform-jump"
          type="button"
          disabled={!jumpPlan.ok}
          on:click={performJump}
        >Jump to selected nodes</button>
      {/if}
    </section>
  </div>
{/if}

<style lang="scss">
  .developer-shell {
    background: #050912;
    border: 1px solid #7f5cff;
    color: #e9f1ff;
    display: grid;
    gap: 1rem;
    min-height: 100%;
    padding: 1rem;
  }

  .developer-toolbar,
  .developer-actions,
  .developer-terminal > header,
  .state-inspector > header,
  .event-log > header,
  .jump-modal > header {
    align-items: center;
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
  }

  .developer-toolbar {
    border-bottom: 1px solid #493b79;
    padding-bottom: 0.85rem;

    h1,
    p {
      margin: 0;
    }

    p {
      color: #bba8ff;
      font-size: 0.72rem;
      letter-spacing: 0.14em;
    }
  }

  button,
  input,
  select,
  textarea {
    font: inherit;
  }

  button {
    background: #151c31;
    border: 1px solid #6755a9;
    color: #f1edff;
    padding: 0.62rem 0.8rem;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .developer-error {
    background: #411922;
    border: 1px solid #ff6878;
    margin: 0;
    padding: 0.75rem;
  }

  .developer-terminals,
  .developer-inspection-grid,
  .state-columns,
  .jump-targets {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .developer-terminal {
    background: #071523;
    border: 2px solid #236da3;
    box-shadow: inset 0 0 2rem #06345266;
    min-height: 22rem;

    > header {
      background: #0b2237;
      border-bottom: 1px solid #236da3;
      padding: 0.7rem;

      span {
        color: #51c8ff;
        font-weight: 900;
      }

      code {
        color: #839db4;
        font-size: 0.67rem;
      }
    }
  }

  .developer-scene,
  .developer-node-controls,
  .ended-message {
    padding: 1rem;
  }

  .developer-scene {
    min-height: 8rem;

    small {
      color: #52d2ff;
    }

    h2 {
      color: #77dcff;
      margin-bottom: 0.35rem;
    }

    p {
      line-height: 1.6;
      white-space: pre-wrap;
    }
  }

  .developer-node-controls {
    display: grid;
    gap: 0.65rem;

    input,
    textarea {
      background: #030b13;
      border: 1px solid #28678f;
      color: #eefaff;
      padding: 0.65rem;
      width: 100%;
    }
  }

  .developer-inspection-grid {
    grid-template-columns: minmax(0, 1.7fr) minmax(17rem, 0.7fr);
  }

  .state-inspector,
  .event-log {
    background: #090f1d;
    border: 1px solid #3a4160;
    padding: 1rem;
  }

  .state-columns article,
  .shared-state,
  .state-editor {
    background: #050a13;
    border: 1px solid #26344b;
    padding: 0.75rem;
  }

  details {
    margin-top: 0.55rem;
  }

  summary {
    color: #a99bff;
    cursor: pointer;
  }

  pre {
    color: #86dcff;
    font-size: 0.72rem;
    max-height: 14rem;
    overflow: auto;
    white-space: pre-wrap;
  }

  .shared-state,
  .state-editor {
    margin-top: 1rem;
  }

  .state-editor {
    display: grid;
    gap: 0.7rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));

    h3 {
      grid-column: 1 / -1;
      margin: 0;
    }

    label {
      display: grid;
      gap: 0.35rem;
    }

    input,
    select {
      background: #080f1d;
      border: 1px solid #3d4e68;
      color: #edf6ff;
      padding: 0.6rem;
    }
  }

  .event-log > div {
    display: grid;
    gap: 0.55rem;
    max-height: 42rem;
    overflow-y: auto;
  }

  .event-log article {
    border-left: 3px solid #725eff;
    padding: 0.6rem 0.7rem;

    p {
      margin: 0.25rem 0;
    }

    time,
    small {
      color: #8193aa;
      font-size: 0.68rem;
    }
  }

  .developer-modal-backdrop {
    align-items: center;
    background: #02040bd9;
    display: flex;
    inset: 0;
    justify-content: center;
    padding: 1rem;
    position: fixed;
    z-index: 140;
  }

  .jump-modal {
    background: #080f1d;
    border: 1px solid #8b70ff;
    box-shadow: 0 0 3rem #3d24a966;
    color: #edf2ff;
    display: grid;
    gap: 1rem;
    max-height: min(90vh, 60rem);
    max-width: 62rem;
    overflow-y: auto;
    padding: 1rem;
    width: 100%;

    h2,
    p {
      margin: 0;
    }

    label {
      display: grid;
      gap: 0.4rem;
    }

    select {
      background: #050a13;
      border: 1px solid #455577;
      color: #eff6ff;
      padding: 0.7rem;
    }
  }

  .jump-blockers {
    background: #3c1721;
    border: 1px solid #ff6878;
    padding: 0.8rem;
  }

  .jump-requirements {
    display: grid;
    gap: 0.55rem;

    article {
      align-items: center;
      border: 1px solid #314059;
      display: grid;
      gap: 0.7rem;
      grid-template-columns: 6rem 1fr auto;
      padding: 0.65rem;

      &.missing {
        border-color: #d99b3d;
      }

      span,
      strong {
        color: #c0adff;
        font-size: 0.7rem;
        text-transform: uppercase;
      }
    }
  }

  .perform-jump,
  .preview-jump {
    background: #765cff;
    border-color: #b6a8ff;
    font-weight: 800;
  }

  .apply-requirements {
    align-items: start;
    display: flex !important;
    gap: 0.55rem;
  }

  @media (max-width: 900px) {
    .developer-terminals,
    .developer-inspection-grid,
    .state-columns,
    .jump-targets,
    .state-editor {
      grid-template-columns: 1fr;
    }

    .developer-toolbar {
      align-items: stretch;
      display: grid;
    }
  }
</style>
