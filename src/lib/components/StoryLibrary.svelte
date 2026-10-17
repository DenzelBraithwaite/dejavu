<script lang="ts">
  import { socket } from '../socket';
  import {
    libraryState,
    type StoryDocument,
    type StoryNode
  } from '../stores/library';
  import location from '../stores/location';
  import { sessionState, type PlayerId } from '../stores/session';

  type EditorMode = 'library' | 'create' | 'editor';

  const nodeTypes = [
    { type: 'dialogue', label: 'Dialogue' },
    { type: 'input', label: 'Player input' },
    { type: 'choice', label: 'Choice' },
    { type: 'checkpoint', label: 'Checkpoint' },
    { type: 'conversation', label: 'Open floor' },
    { type: 'dice-check', label: 'Dice check' },
    { type: 'vote', label: 'Shared vote' },
    { type: 'timed-choice', label: 'Timed choice' },
    { type: 'effect', label: 'Item / effect' },
    { type: 'condition', label: 'Condition' },
    { type: 'image', label: 'Image' },
    { type: 'minigame', label: 'Minigame' },
    { type: 'ending', label: 'Ending' }
  ];

  let mode: EditorMode = 'library';
  let newTitle = '';
  let newDescription = '';
  let newAuthor = '';
  let editingStory: StoryDocument | null = null;
  let selectedNodeId = '';
  let selectedNode: any = null;
  let statusMessage = '';
  let errorMessage = '';
  let deleteArmedId = '';

  $: playerId = $sessionState.playerId;
  $: partnerId = (playerId === 'p1' ? 'p2' : 'p1') as PlayerId;
  $: localSelection = playerId
    ? $libraryState.selections[playerId]
    : null;
  $: partnerSelection = partnerId
    ? $libraryState.selections[partnerId]
    : null;
  $: selectedNode = editingStory?.nodes.find(
    (node) => node.id === selectedNodeId
  ) ?? null;

  function storyTitle(storyId: string | null): string {
    if (!storyId) {
      return 'No cartridge selected';
    }

    return $libraryState.stories.find((story) => story.id === storyId)?.title
      ?? storyId;
  }

  function clearMessages(): void {
    statusMessage = '';
    errorMessage = '';
  }

  function selectStory(storyId: string): void {
    clearMessages();
    socket.emit('library:select-story', storyId, handleSimpleResult(
      'Cartridge staged. Story Mode will unlock when both players match.'
    ));
  }

  function createStory(): void {
    clearMessages();
    socket.emit('library:create-story', {
      title: newTitle,
      description: newDescription,
      author: newAuthor
    }, (result: {
      ok: boolean;
      story?: StoryDocument;
      error?: string;
    }) => {
      if (!result.ok || !result.story) {
        errorMessage = result.error ?? 'Could not create the story.';
        return;
      }

      newTitle = '';
      newDescription = '';
      newAuthor = '';
      editingStory = result.story;
      selectedNodeId = result.story.initialSceneIds.p1;
      mode = 'editor';
      statusMessage = 'Story created in the host library.';
    });
  }

  function openEditor(storyId: string): void {
    clearMessages();
    socket.emit('library:get-story', storyId, (result: {
      ok: boolean;
      story?: StoryDocument;
      error?: string;
    }) => {
      if (!result.ok || !result.story) {
        errorMessage = result.error ?? 'Could not load the story editor.';
        return;
      }

      editingStory = result.story;
      selectedNodeId = result.story.initialSceneIds.p1;
      mode = 'editor';
    });
  }

  function saveStory(): void {
    if (!editingStory) {
      return;
    }

    clearMessages();
    socket.emit('library:update-story', {
      storyId: editingStory.id,
      story: editingStory
    }, (result: {
      ok: boolean;
      story?: StoryDocument;
      error?: string;
    }) => {
      if (!result.ok || !result.story) {
        errorMessage = result.error ?? 'Could not save the story.';
        return;
      }

      editingStory = result.story;
      statusMessage = `Saved version ${result.story.version}.`;
    });
  }

  function duplicateStory(storyId: string): void {
    clearMessages();
    socket.emit('library:duplicate-story', storyId, handleSimpleResult(
      'Story duplicated as a new draft.'
    ));
  }

  function deleteStory(storyId: string): void {
    if (deleteArmedId !== storyId) {
      deleteArmedId = storyId;
      return;
    }

    clearMessages();
    socket.emit('library:delete-story', storyId, (result: {
      ok: boolean;
      error?: string;
    }) => {
      deleteArmedId = '';

      if (result.ok) {
        statusMessage = 'Story deleted from the host library.';
      } else {
        errorMessage = result.error ?? 'Could not delete the story.';
      }
    });
  }

  function addNode(type: string): void {
    if (!editingStory) {
      return;
    }

    const nodeNumber = editingStory.nodes.length + 1;
    const nodeId = `${editingStory.id}.${type}.${nodeNumber}`;
    const node = createNode(type, nodeId);

    editingStory.nodes = [...editingStory.nodes, node];
    selectedNodeId = nodeId;
    editingStory = {
      ...editingStory
    };
  }

  function deleteSelectedNode(): void {
    if (!editingStory || !selectedNode) {
      return;
    }

    if (Object.values(editingStory.initialSceneIds).includes(selectedNode.id)) {
      errorMessage = 'Choose a different start node before deleting this one.';
      return;
    }

    editingStory.nodes = editingStory.nodes.filter(
      (node) => node.id !== selectedNode.id
    );
    selectedNodeId = editingStory.nodes[0]?.id ?? '';
    editingStory = {
      ...editingStory
    };
  }

  function addChoice(): void {
    if (!selectedNode) {
      return;
    }

    selectedNode.choices ??= [];
    selectedNode.choices = [
      ...selectedNode.choices,
      {
        id: `option-${selectedNode.choices.length + 1}`,
        label: 'New option',
        next: ''
      }
    ];
  }

  function removeChoice(index: number): void {
    selectedNode.choices = selectedNode.choices.filter(
      (_choice: unknown, choiceIndex: number) => choiceIndex !== index
    );
  }

  function handleSimpleResult(successMessage: string) {
    return (result: { ok: boolean; error?: string }): void => {
      if (result.ok) {
        statusMessage = successMessage;
      } else {
        errorMessage = result.error ?? 'The library operation failed.';
      }
    };
  }

  function createNode(type: string, id: string): StoryNode {
    const baseNode: StoryNode = {
      id,
      type,
      audience: 'both',
      text: '',
      next: ''
    };

    switch (type) {
      case 'choice':
      case 'vote':
      case 'timed-choice':
        return {
          ...baseNode,
          choices: [
            {
              id: 'option-1',
              label: 'New option',
              next: ''
            }
          ],
          ...(type === 'timed-choice'
            ? {
                durationMs: 20_000,
                fallbackChoiceId: 'option-1'
              }
            : {})
        };
      case 'checkpoint':
        return {
          ...baseNode,
          checkpointId: `${id}.sync`
        };
      case 'input':
        return {
          ...baseNode,
          prompt: 'Enter your response.',
          maxLength: 200
        };
      case 'conversation':
        return {
          ...baseNode,
          firstPlayer: 'random',
          messagesPerPlayer: {
            p1: 2,
            p2: 2
          }
        };
      case 'dice-check':
        return {
          ...baseNode,
          die: 6,
          stat: 'luck',
          threshold: 10,
          success: '',
          failure: ''
        };
      case 'effect':
        return {
          ...baseNode,
          text: 'You acquired a new item.',
          effects: [
            {
              type: 'add-item',
              key: 'new-item'
            }
          ]
        };
      case 'condition':
        return {
          id,
          type,
          audience: 'both',
          condition: {
            type: 'has-item',
            key: 'new-item'
          },
          trueNext: '',
          falseNext: ''
        };
      case 'image':
        return {
          ...baseNode,
          src: '',
          alt: ''
        };
      case 'minigame':
        return {
          ...baseNode,
          minigameId: 'netrunners',
          resultNext: {
            completed: '',
            cancelled: ''
          }
        };
      case 'ending':
        return {
          id,
          type,
          audience: 'both',
          text: 'End of story.'
        };
      default:
        return baseNode;
    }
  }
</script>

<section
  class="story-library"
  class:hide={$location !== 'library'}
  aria-labelledby="library-title"
>
  <header>
    <span>DEJAVU://STORY_LIBRARY</span>
    <span>{mode.toUpperCase()}</span>
  </header>

  {#if mode === 'library'}
    <div class="library-content">
      <div class="library-heading">
        <div>
          <p class="eyebrow">STORY CARTRIDGES</p>
          <h1 id="library-title">Library</h1>
          <p class="introduction">
            Both players must stage the same cartridge before Story Mode can run.
          </p>
        </div>
        <button class="primary-button" type="button" on:click={() => mode = 'create'}>
          Make new story
        </button>
      </div>

      <div class="selection-panel" class:matched={Boolean($libraryState.activeStoryId)}>
        <div>
          <span>YOUR CARTRIDGE</span>
          <strong>{storyTitle(localSelection)}</strong>
        </div>
        <div>
          <span>PARTNER CARTRIDGE</span>
          <strong>{storyTitle(partnerSelection)}</strong>
        </div>
        <p>
          {$libraryState.activeStoryId
            ? 'LINK ESTABLISHED — STORY MODE READY'
            : 'WAITING FOR MATCHING CARTRIDGES'}
        </p>
      </div>

      <div class="story-grid">
        {#each $libraryState.stories as story}
          <article class:selected={localSelection === story.id}>
            <div class="story-card-header">
              <span>{story.status.toUpperCase()}</span>
              <span>V{story.version}</span>
            </div>
            <h2>{story.title}</h2>
            <p>{story.description || 'No description yet.'}</p>
            <dl>
              <div>
                <dt>AUTHOR</dt>
                <dd>{story.author || 'Unknown'}</dd>
              </div>
              <div>
                <dt>TYPE</dt>
                <dd>{story.builtIn ? 'BUILT-IN' : 'CUSTOM'}</dd>
              </div>
            </dl>
            <div class="card-actions">
              <button type="button" on:click={() => selectStory(story.id)}>
                {localSelection === story.id ? 'Selected' : 'Select story'}
              </button>
              <button type="button" on:click={() => openEditor(story.id)}>
                Edit
              </button>
              <button type="button" on:click={() => duplicateStory(story.id)}>
                Duplicate
              </button>
              {#if !story.builtIn}
                <button
                  class="danger-button"
                  type="button"
                  on:click={() => deleteStory(story.id)}
                >
                  {deleteArmedId === story.id ? 'Confirm delete' : 'Delete'}
                </button>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    </div>
  {:else if mode === 'create'}
    <div class="form-screen">
      <button class="back-button" type="button" on:click={() => mode = 'library'}>
        ← Back to library
      </button>
      <p class="eyebrow">NEW CARTRIDGE</p>
      <h1>Create a story</h1>
      <p class="introduction">
        A starter graph with separate Player 1 and Player 2 openings will be created automatically.
      </p>

      <div class="story-form">
        <label for="story-title">Story title</label>
        <input id="story-title" bind:value={newTitle} maxlength="80">

        <label for="story-author">Author</label>
        <input id="story-author" bind:value={newAuthor} maxlength="80">

        <label for="story-description">Description</label>
        <textarea
          id="story-description"
          bind:value={newDescription}
          maxlength="500"
          rows="5"
        ></textarea>

        <button
          class="primary-button"
          type="button"
          disabled={!newTitle.trim()}
          on:click={createStory}
        >
          Create story graph
        </button>
      </div>
    </div>
  {:else if editingStory}
    <div class="editor-shell">
      <div class="editor-toolbar">
        <button class="back-button" type="button" on:click={() => mode = 'library'}>
          ← Library
        </button>
        <div>
          <input aria-label="Story title" bind:value={editingStory.title} maxlength="80">
          <span>VERSION {editingStory.version} · {editingStory.status.toUpperCase()}</span>
        </div>
        <button class="primary-button" type="button" on:click={saveStory}>
          Save story
        </button>
      </div>

      <div class="editor-workspace">
        <aside class="node-palette" aria-label="Node palette">
          <h2>Add node</h2>
          {#each nodeTypes as nodeType}
            <button type="button" on:click={() => addNode(nodeType.type)}>
              + {nodeType.label}
            </button>
          {/each}
        </aside>

        <div class="flow-canvas" aria-label="Story flow">
          {#each ['p1', 'both', 'p2'] as lane}
            <section class="flow-lane">
              <h2>{lane === 'both' ? 'SHARED' : `PLAYER ${lane === 'p1' ? '1' : '2'}`}</h2>
              {#each editingStory.nodes.filter((node) => (node.audience ?? 'both') === lane) as node}
                <button
                  class="flow-node"
                  class:selected={selectedNodeId === node.id}
                  type="button"
                  on:click={() => selectedNodeId = node.id}
                >
                  <span>{node.type}</span>
                  <strong>{node.id}</strong>
                  <small>{node.text || node.prompt || 'No display text'}</small>
                </button>
              {/each}
            </section>
          {/each}
        </div>

        <aside class="node-inspector" aria-label="Node inspector">
          {#if selectedNode}
            <div class="inspector-heading">
              <div>
                <p>NODE INSPECTOR</p>
                <h2>{selectedNode.type}</h2>
              </div>
              <button class="danger-button" type="button" on:click={deleteSelectedNode}>
                Delete
              </button>
            </div>

            <label for="node-id">Node ID</label>
            <input id="node-id" value={selectedNode.id} disabled>

            <label for="node-audience">Audience</label>
            <select id="node-audience" bind:value={selectedNode.audience}>
              <option value="p1">Player 1</option>
              <option value="both">Both players</option>
              <option value="p2">Player 2</option>
            </select>

            {#if selectedNode.type !== 'condition' && selectedNode.type !== 'input'}
              <label for="node-text">Terminal text</label>
              <textarea id="node-text" bind:value={selectedNode.text} rows="5"></textarea>
            {/if}

            {#if selectedNode.type === 'input'}
              <label for="input-prompt">Player prompt</label>
              <textarea id="input-prompt" bind:value={selectedNode.prompt} rows="5"></textarea>
              <label for="input-max-length">Maximum response length</label>
              <input
                id="input-max-length"
                type="number"
                min="1"
                max="2000"
                bind:value={selectedNode.maxLength}
              >
            {/if}

            {#if selectedNode.type === 'dialogue' || selectedNode.type === 'effect'}
              <label for="node-speaker">Speaker</label>
              <input id="node-speaker" bind:value={selectedNode.speaker}>
            {/if}

            {#if ['dialogue', 'input', 'checkpoint', 'conversation', 'image', 'effect'].includes(selectedNode.type)}
              <label for="node-next">Next node ID</label>
              <input id="node-next" bind:value={selectedNode.next} list="story-node-ids">
            {/if}

            {#if selectedNode.type === 'dice-check'}
              <div class="field-grid">
                <div>
                  <label for="dice-type">Die</label>
                  <select id="dice-type" bind:value={selectedNode.die}>
                    {#each [4, 6, 8, 10, 12, 20] as die}
                      <option value={die}>D{die}</option>
                    {/each}
                  </select>
                </div>
                <div>
                  <label for="dice-stat">Stat</label>
                  <input id="dice-stat" bind:value={selectedNode.stat}>
                </div>
                <div>
                  <label for="dice-target">Target</label>
                  <input id="dice-target" type="number" bind:value={selectedNode.threshold}>
                </div>
              </div>
              <label for="dice-success">Success node</label>
              <input id="dice-success" bind:value={selectedNode.success} list="story-node-ids">
              <label for="dice-failure">Failure node</label>
              <input id="dice-failure" bind:value={selectedNode.failure} list="story-node-ids">
            {/if}

            {#if selectedNode.type === 'checkpoint'}
              <label for="checkpoint-id">Checkpoint key</label>
              <input id="checkpoint-id" bind:value={selectedNode.checkpointId}>
            {/if}

            {#if selectedNode.type === 'conversation'}
              <label for="first-speaker">First speaker</label>
              <select id="first-speaker" bind:value={selectedNode.firstPlayer}>
                <option value="random">Random</option>
                <option value="p1">Player 1</option>
                <option value="p2">Player 2</option>
              </select>
              <div class="field-grid">
                <div>
                  <label for="p1-messages">Player 1 turns</label>
                  <input id="p1-messages" type="number" min="0" bind:value={selectedNode.messagesPerPlayer.p1}>
                </div>
                <div>
                  <label for="p2-messages">Player 2 turns</label>
                  <input id="p2-messages" type="number" min="0" bind:value={selectedNode.messagesPerPlayer.p2}>
                </div>
              </div>
            {/if}

            {#if ['choice', 'vote', 'timed-choice'].includes(selectedNode.type)}
              {#if selectedNode.type === 'timed-choice'}
                <label for="choice-duration">Timer in milliseconds</label>
                <input id="choice-duration" type="number" min="1000" bind:value={selectedNode.durationMs}>
              {/if}
              <div class="choice-editor">
                <div class="choice-heading">
                  <h3>Options</h3>
                  <button type="button" on:click={addChoice}>+ Option</button>
                </div>
                {#each selectedNode.choices ?? [] as choice, index}
                  <div class="choice-row">
                    <input aria-label="Option ID" bind:value={choice.id} placeholder="option-id">
                    <input aria-label="Option label" bind:value={choice.label} placeholder="Player-facing label">
                    <input aria-label="Option destination" bind:value={choice.next} list="story-node-ids" placeholder="destination node">
                    <button type="button" on:click={() => removeChoice(index)}>×</button>
                  </div>
                {/each}
              </div>
            {/if}

            {#if selectedNode.type === 'effect'}
              <label for="effect-type">Effect</label>
              <select id="effect-type" bind:value={selectedNode.effects[0].type}>
                <option value="add-item">Give item</option>
                <option value="remove-item">Remove item</option>
                <option value="set-flag">Set story flag</option>
                <option value="adjust-stat">Adjust stat</option>
                <option value="discover-character">Discover character</option>
                <option value="install-mod">Install neuro mod</option>
                <option value="remove-mod">Remove neuro mod</option>
              </select>
              <label for="effect-key">Item, flag, stat, character, or mod ID</label>
              <input id="effect-key" bind:value={selectedNode.effects[0].key}>
              <label for="effect-value">Optional value</label>
              <input id="effect-value" bind:value={selectedNode.effects[0].value}>
            {/if}

            {#if selectedNode.type === 'condition'}
              <label for="condition-type">Condition</label>
              <select id="condition-type" bind:value={selectedNode.condition.type}>
                <option value="has-item">Player has item</option>
                <option value="flag-equals">Story flag equals value</option>
                <option value="stat-at-least">Player stat is at least value</option>
                <option value="last-dice-success">Previous dice check succeeded</option>
              </select>
              {#if selectedNode.condition.type !== 'last-dice-success'}
                <label for="condition-key">Item, flag, or stat ID</label>
                <input id="condition-key" bind:value={selectedNode.condition.key}>
              {/if}
              {#if ['flag-equals', 'stat-at-least'].includes(selectedNode.condition.type)}
                <label for="condition-value">Comparison value</label>
                <input id="condition-value" bind:value={selectedNode.condition.value}>
              {/if}
              <label for="condition-true">When true</label>
              <input id="condition-true" bind:value={selectedNode.trueNext} list="story-node-ids">
              <label for="condition-false">When false</label>
              <input id="condition-false" bind:value={selectedNode.falseNext} list="story-node-ids">
            {/if}

            {#if selectedNode.type === 'image'}
              <label for="image-source">Image path</label>
              <input id="image-source" bind:value={selectedNode.src} placeholder="/scene-image.png">
              <label for="image-alt">Alternative text</label>
              <input id="image-alt" bind:value={selectedNode.alt}>
            {/if}

            {#if selectedNode.type === 'minigame'}
              <label for="minigame-id">Minigame</label>
              <select id="minigame-id" bind:value={selectedNode.minigameId}>
                <option value="netrunners">NetRunners</option>
              </select>
              <label for="minigame-complete">Completed destination</label>
              <input id="minigame-complete" bind:value={selectedNode.resultNext.completed} list="story-node-ids">
              <label for="minigame-cancel">Cancelled destination</label>
              <input id="minigame-cancel" bind:value={selectedNode.resultNext.cancelled} list="story-node-ids">
            {/if}

            <label class="checkbox-row">
              <input type="checkbox" bind:checked={selectedNode.clearTerminal}>
              Clear terminal when this node begins
            </label>
          {:else}
            <p class="empty-inspector">Select a node from the flow canvas.</p>
          {/if}
        </aside>
      </div>

      <datalist id="story-node-ids">
        {#each editingStory.nodes as node}
          <option value={node.id}></option>
        {/each}
      </datalist>
    </div>
  {/if}

  {#if statusMessage}
    <p class="toast-message success-message" role="status">{statusMessage}</p>
  {/if}
  {#if errorMessage}
    <p class="toast-message error-message" role="alert">{errorMessage}</p>
  {/if}
</section>

<style lang="scss">
  .story-library {
    position: relative;
    width: 100%;
    height: 95vh;
    min-width: 0;
    max-width: 1320px;
    overflow: hidden;
    background: #060b14;
    border: 1px solid #4a98d9;
    border-radius: 8px;
    box-shadow: 0 0 34px #4a98d935;

    > header {
      min-height: 38px;
      padding: 9px 14px;
      color: #02fbfb;
      background: #111a2c;
      border-bottom: 1px solid #4a98d9;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.72rem;
      letter-spacing: 2px;

      display: flex;
      justify-content: space-between;
    }
  }

  .library-content,
  .form-screen {
    height: calc(100% - 38px);
    padding: clamp(22px, 4vw, 52px);
    overflow-y: auto;
  }

  .library-heading {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 24px;

    > div {
      min-width: 0;
    }

    .primary-button {
      flex: 0 0 auto;
      white-space: nowrap;
    }
  }

  .eyebrow {
    color: #4a98d9;
    font-size: 0.7rem;
    letter-spacing: 2px;
  }

  h1 {
    margin: 8px 0 10px;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: clamp(2rem, 5vw, 3.6rem);
  }

  .introduction {
    max-width: 72ch;
    color: #aeb9c9;
    line-height: 1.6;
  }

  button,
  input,
  textarea,
  select {
    min-height: 40px;
    padding: 8px 11px;
    color: #e8edf6;
    background: #0b1423;
    border: 1px solid #334155;
    border-radius: 4px;
    font: inherit;
  }

  button {
    cursor: pointer;

    &:hover,
    &:focus-visible {
      border-color: #02fbfb;
      outline: 2px solid #ffffff;
      outline-offset: 2px;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }

  .primary-button {
    color: #07111d;
    background: #02fbfb;
    border-color: #02fbfb;
    font-weight: 800;
  }

  .danger-button {
    color: #ffd9d3;
    border-color: #cb381f;
  }

  .selection-panel {
    margin-top: 30px;
    padding: 16px;
    background: #111827;
    border: 1px solid #ad781c;

    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;

    div {
      padding: 12px;
      background: #070b16;
      border: 1px solid #2c3b54;
    }

    span {
      display: block;
      margin-bottom: 6px;
      color: #8893a2;
      font-size: 0.68rem;
    }

    strong {
      color: #f8e69a;
    }

    > p {
      grid-column: 1 / -1;
      color: #f8e69a;
      font-size: 0.72rem;
      text-align: center;
    }
  }

  .selection-panel.matched {
    border-color: #4f813d;

    strong,
    > p {
      color: #9dffa6;
    }
  }

  .story-grid {
    margin-top: 22px;

    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 16px;

    article {
      padding: 20px;
      background: #0c1322;
      border: 1px solid #2c3b54;

      h2 {
        margin: 14px 0 10px;
        color: #e8edf6;
        font-family: "Orbitron", "Space Mono", sans-serif;
      }

      > p {
        min-height: 4.8em;
        color: #aeb9c9;
        line-height: 1.55;
      }

      dl {
        margin-top: 18px;

        display: flex;
        gap: 26px;
      }

      dt {
        color: #64748b;
        font-size: 0.65rem;
      }

      dd {
        margin-top: 4px;
        color: #6dc2fb;
      }
    }

    article.selected {
      border-color: #02fbfb;
      box-shadow: 0 0 20px #02fbfb22;
    }
  }

  .story-card-header {
    color: #4a98d9;
    font-size: 0.68rem;

    display: flex;
    justify-content: space-between;
  }

  .card-actions {
    margin-top: 20px;

    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .form-screen {
    max-width: 760px;
    margin: 0 auto;
  }

  .back-button {
    margin-bottom: 28px;
    background: transparent;
    border: 0;
  }

  .story-form {
    margin-top: 28px;

    display: grid;
    gap: 10px;

    label {
      margin-top: 10px;
      color: #4a98d9;
      font-size: 0.72rem;
      text-transform: uppercase;
    }
  }

  .editor-shell {
    height: calc(100% - 38px);

    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .editor-toolbar {
    padding: 10px 14px;
    background: #0c1322;
    border-bottom: 1px solid #2c3b54;

    display: grid;
    grid-template-columns: auto minmax(220px, 1fr) auto;
    align-items: center;
    gap: 14px;

    .back-button {
      margin: 0;
    }

    div {
      display: grid;
      gap: 4px;
    }

    span {
      color: #64748b;
      font-size: 0.65rem;
    }
  }

  .editor-workspace {
    min-height: 0;

    display: grid;
    grid-template-columns: 170px minmax(420px, 1fr) 330px;
  }

  .node-palette,
  .node-inspector {
    padding: 14px;
    overflow-y: auto;
    background: #09111e;

    h2 {
      margin-bottom: 14px;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.9rem;
    }
  }

  .node-palette {
    border-right: 1px solid #2c3b54;

    button {
      width: 100%;
      margin-bottom: 7px;
      text-align: left;
    }
  }

  .flow-canvas {
    padding: 18px;
    overflow: auto;
    background-color: #050912;
    background-image:
      linear-gradient(#1472bf18 1px, transparent 1px),
      linear-gradient(90deg, #1472bf18 1px, transparent 1px);
    background-size: 24px 24px;

    display: grid;
    grid-template-columns: repeat(3, minmax(210px, 1fr));
    gap: 14px;
    align-items: start;
  }

  .flow-lane {
    min-height: 100%;
    padding: 10px;
    border: 1px dashed #2c3b54;

    > h2 {
      margin-bottom: 12px;
      color: #4a98d9;
      font-size: 0.68rem;
      letter-spacing: 1px;
      text-align: center;
    }
  }

  .flow-node {
    width: 100%;
    height: auto;
    min-height: 94px;
    margin-bottom: 10px;
    text-align: left;

    display: grid;
    gap: 6px;

    span {
      color: #ff75fd;
      font-size: 0.62rem;
      text-transform: uppercase;
    }

    strong {
      overflow: hidden;
      color: #02fbfb;
      font-size: 0.74rem;
      text-overflow: ellipsis;
    }

    small {
      overflow: hidden;
      color: #94a3b8;
      font-size: 0.66rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .flow-node.selected {
    background: #10263c;
    border-color: #02fbfb;
    box-shadow: 0 0 15px #02fbfb24;
  }

  .node-inspector {
    border-left: 1px solid #2c3b54;

    > label,
    .field-grid label {
      display: block;
      margin: 13px 0 6px;
      color: #6dc2fb;
      font-size: 0.68rem;
      text-transform: uppercase;
    }

    > input,
    > textarea,
    > select {
      width: 100%;
    }
  }

  .inspector-heading,
  .choice-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .inspector-heading p {
    color: #4a98d9;
    font-size: 0.62rem;
  }

  .inspector-heading h2,
  .choice-heading h3 {
    margin: 4px 0 0;
    text-transform: uppercase;
  }

  .field-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 9px;

    input,
    select {
      width: 100%;
    }
  }

  .choice-editor {
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px dashed #334155;
  }

  .choice-row {
    margin-top: 8px;

    display: grid;
    grid-template-columns: 0.8fr 1fr 1fr auto;
    gap: 5px;

    input {
      min-width: 0;
    }
  }

  .checkbox-row {
    margin-top: 20px;

    display: flex !important;
    align-items: center;
    gap: 8px;

    input {
      min-height: auto;
    }
  }

  .empty-inspector {
    color: #8893a2;
    line-height: 1.5;
  }

  .toast-message {
    position: absolute;
    z-index: 5;
    right: 20px;
    bottom: 20px;
    max-width: 460px;
    padding: 12px 16px;
    background: #111827;
    border: 1px solid;
    box-shadow: 0 8px 30px #00000099;
  }

  .success-message {
    color: #d7f0bb;
    border-color: #4f813d;
  }

  .error-message {
    color: #ffdbd6;
    border-color: #cb381f;
  }

  @media (max-width: 1050px) {
    .editor-workspace {
      grid-template-columns: 145px minmax(330px, 1fr) 270px;
    }
  }

  @media (max-width: 800px) {
    .library-heading {
      align-items: stretch;
      flex-direction: column;
    }

    .selection-panel {
      grid-template-columns: 1fr;

      > p {
        grid-column: 1;
      }
    }

    .editor-workspace {
      overflow-x: auto;
      grid-template-columns: 140px 640px 270px;
    }
  }
</style>
