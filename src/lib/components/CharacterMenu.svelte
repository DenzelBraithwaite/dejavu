<script lang="ts">
  import { tick } from 'svelte';
  import { blur } from 'svelte/transition';
  import { socket } from '../socket';
  import {
    characterLibraryState,
    type CharacterExpression,
    type CharacterRecord,
    type CharacterType
  } from '../stores/characters';
  import location from '../stores/location';
  import { sessionState } from '../stores/session';

  const expressions: Array<{ id: CharacterExpression; label: string }> = [
    { id: 'normal', label: 'Normal' },
    { id: 'shocked', label: 'Shocked' },
    { id: 'angry', label: 'Angry' },
    { id: 'sad', label: 'Sad' },
    { id: 'happy', label: 'Happy' }
  ];

  let editingCharacter: CharacterRecord | null = null;
  let errorMessage = '';
  let statusMessage = '';
  let uploadingExpression: CharacterExpression | null = null;
  let deleteArmed = false;
  let screenElement: HTMLElement;
  let playableCharacters: CharacterRecord[] = [];
  let npcCharacters: CharacterRecord[] = [];

  $: playableCharacters = $characterLibraryState.characters.filter(
    (character) => character.type === 'playable'
  );
  $: npcCharacters = $characterLibraryState.characters.filter(
    (character) => character.type === 'npc'
  );

  // New records begin with the same complete stat shape used by the runtime.
  function createDraft(type: CharacterType): CharacterRecord {
    const now = new Date().toISOString();
    const defaultStat = type === 'npc' ? 5 : 10;

    return {
      id: '',
      name: '',
      wallet: type === 'npc' ? 0 : 1_000,
      stats: {
        muscles: defaultStat,
        toughness: defaultStat,
        speed: defaultStat,
        stealth: defaultStat,
        smarts: defaultStat,
        ocuware: defaultStat,
        cred: defaultStat,
        luck: type === 'npc' ? 5 : 2,
        hacking: defaultStat
      },
      images: {
        normal: '',
        shocked: '',
        angry: '',
        sad: '',
        happy: ''
      },
      imagePositions: {
        normal: { x: 50, y: 50 },
        shocked: { x: 50, y: 50 },
        angry: { x: 50, y: 50 },
        sad: { x: 50, y: 50 },
        happy: { x: 50, y: 50 }
      },
      notes: '',
      type,
      builtIn: false,
      createdAt: now,
      updatedAt: now
    };
  }

  function openCharacter(character: CharacterRecord): void {
    editingCharacter = structuredClone(character);
    deleteArmed = false;
    clearMessages();
  }

  function startCharacter(type: CharacterType): void {
    editingCharacter = createDraft(type);
    deleteArmed = false;
    clearMessages();
  }

  function closeEditor(): void {
    editingCharacter = null;
    deleteArmed = false;
    clearMessages();
  }

  function clearMessages(): void {
    errorMessage = '';
    statusMessage = '';
  }

  function removeExpression(expression: CharacterExpression): void {
    if (!editingCharacter) {
      return;
    }

    editingCharacter.images[expression] = '';
    editingCharacter = editingCharacter;
  }

  function saveCharacter(): void {
    if (!editingCharacter) {
      return;
    }

    clearMessages();

    const eventName = editingCharacter.id
      ? 'characters:update'
      : 'characters:create';
    const payload = editingCharacter.id
      ? {
          characterId: editingCharacter.id,
          character: editingCharacter
        }
      : editingCharacter;

    socket.emit(eventName, payload, (result: {
      ok: boolean;
      character?: CharacterRecord;
      error?: string;
    }) => {
      if (!result.ok || !result.character) {
        errorMessage = result.error ?? 'The character could not be saved.';
        return;
      }

      editingCharacter = structuredClone(result.character);
      statusMessage = 'Character saved to the shared library.';
    });
  }

  function deleteCharacter(): void {
    if (!editingCharacter?.id) {
      return;
    }

    if (!deleteArmed) {
      deleteArmed = true;
      return;
    }

    socket.emit('characters:delete', editingCharacter.id, (result: {
      ok: boolean;
      error?: string;
    }) => {
      if (!result.ok) {
        errorMessage = result.error ?? 'The character could not be deleted.';
        deleteArmed = false;
        return;
      }

      closeEditor();
      statusMessage = 'Character deleted.';
    });
  }

  async function uploadExpression(
    event: Event,
    expression: CharacterExpression
  ): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];

    // Image decoding can reflow the grid, so restore the editor's exact scroll position afterward.
    const previousScrollTop = screenElement?.scrollTop ?? 0;

    if (!file || !editingCharacter) {
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      errorMessage = 'Character images must be 8 MB or smaller.';
      input.value = '';
      return;
    }

    uploadingExpression = expression;
    clearMessages();

    try {
      const response = await fetch('/api/character-assets/images', {
        method: 'POST',
        headers: {
          'Content-Type': file.type
        },
        body: file
      });
      const result = await response.json();

      if (!response.ok || !result.path) {
        throw new Error(result.error ?? 'The image upload failed.');
      }

      editingCharacter.images[expression] = result.path;
      editingCharacter = editingCharacter;
      await tick();

      if (screenElement) {
        screenElement.scrollTop = previousScrollTop;
      }

      statusMessage = `${expressions.find((item) => item.id === expression)?.label} expression uploaded.`;
    } catch (error) {
      errorMessage = error instanceof Error
        ? error.message
        : 'The image upload failed.';
    } finally {
      uploadingExpression = null;
      input.value = '';
    }
  }
</script>

<section
  class="character-library"
  class:hide={$location !== 'character'}
  transition:blur={{ duration: 300 }}
  aria-labelledby="character-title"
>
  <header>
    <span>DEJAVU://CHARACTER_LIBRARY</span>
    <span>{$sessionState.playerId?.toUpperCase()}</span>
  </header>

  <div class="screen" bind:this={screenElement}>
    <div class="title-row">
      <div>
        <p class="eyebrow">CENTRAL CAST DATABASE</p>
        <h1 id="character-title">Characters</h1>
        <p>Manage playable story characters and NPCs in one cast database.</p>
      </div>
      <div class="create-actions">
        <button class="primary-button" type="button" on:click={() => startCharacter('playable')}>New playable</button>
        <button type="button" on:click={() => startCharacter('npc')}>New NPC</button>
      </div>
    </div>

    {#if statusMessage}
      <p class="status-message" role="status">{statusMessage}</p>
    {/if}

    {#if errorMessage}
      <p class="error-message" role="alert">{errorMessage}</p>
    {/if}

    {#if editingCharacter}
      <form class="character-form" on:submit|preventDefault={saveCharacter}>
        <div class="form-heading">
          <div>
            <p class="eyebrow">{editingCharacter.id ? 'EDIT CHARACTER' : 'NEW CHARACTER'}</p>
            <h2>{editingCharacter.name || 'Unnamed character'}</h2>
          </div>
          <button type="button" on:click={closeEditor}>Close</button>
        </div>

        <div class="field-grid">
          <label>
            <span>Character type</span>
            <select bind:value={editingCharacter.type} disabled={editingCharacter.builtIn}>
              <option value="playable">Story playable</option>
              <option value="npc">NPC</option>
            </select>
          </label>

          <label>
            <span>Name</span>
            <input bind:value={editingCharacter.name} maxlength="48">
          </label>

          <label>
            <span>Wallet</span>
            <input type="number" min="0" max="999999999" bind:value={editingCharacter.wallet}>
          </label>
        </div>

        <label>
          <span>Notes and role</span>
          <textarea bind:value={editingCharacter.notes} maxlength="500" rows="4"></textarea>
        </label>

        <fieldset>
          <legend>Stats</legend>
          <div class="stats-grid">
            {#each Object.keys(editingCharacter.stats) as stat}
              <label>
                <span>{stat}</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  bind:value={editingCharacter.stats[stat]}
                >
              </label>
            {/each}
          </div>
        </fieldset>

        <fieldset>
          <legend>Dialogue expressions</legend>
          <p class="fieldset-help">Upload a head-and-shoulders portrait for each emotional state.</p>
          <div class="expression-grid">
            {#each expressions as expression}
              <article>
                {#if editingCharacter.images[expression.id]}
                  <div class="expression-frame">
                    <img
                      src={editingCharacter.images[expression.id]}
                      alt={`${editingCharacter.name} ${expression.label.toLowerCase()} expression`}
                      style:object-position={`${editingCharacter.imagePositions[expression.id].x}% ${editingCharacter.imagePositions[expression.id].y}%`}
                    >
                  </div>
                {:else}
                  <div class="image-placeholder">NO IMAGE</div>
                {/if}
                <strong>{expression.label}</strong>
                {#if editingCharacter.images[expression.id]}
                  <div class="crop-controls">
                    <label>
                      <span>Move left/right</span>
                      <input type="range" min="0" max="100" bind:value={editingCharacter.imagePositions[expression.id].x}>
                    </label>
                    <label>
                      <span>Move up/down</span>
                      <input type="range" min="0" max="100" bind:value={editingCharacter.imagePositions[expression.id].y}>
                    </label>
                  </div>
                {/if}
                <label class="upload-button">
                  {uploadingExpression === expression.id ? 'Uploading…' : 'Upload image'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml"
                    disabled={uploadingExpression !== null}
                    on:change={(event) => {
                      uploadExpression(event, expression.id);
                    }}
                  >
                </label>
                {#if editingCharacter.images[expression.id]}
                  <button type="button" on:click={() => {
                    removeExpression(expression.id);
                  }}>Remove</button>
                {/if}
              </article>
            {/each}
          </div>
        </fieldset>

        <div class="form-actions">
          {#if editingCharacter.id && !editingCharacter.builtIn}
            <button class="danger-button" type="button" on:click={deleteCharacter}>
              {deleteArmed ? 'Confirm delete' : 'Delete'}
            </button>
          {/if}
          <button class="primary-button" type="submit" disabled={!editingCharacter.name.trim()}>
            Save character
          </button>
        </div>
      </form>
    {:else}
      {#each [
        {
          id: 'playable',
          title: 'Story playable characters',
          description: 'Available as Player 1, Player 2, and Change Character identities.',
          characters: playableCharacters
        },
        {
          id: 'npc',
          title: 'NPCs',
          description: 'Supporting cast available to nodes with speaker controls.',
          characters: npcCharacters
        }
      ] as section}
        <section class={`character-section character-section--${section.id}`}>
          <header>
            <div>
              <p class="eyebrow">{section.id.toUpperCase()}</p>
              <h2>{section.title}</h2>
              <p>{section.description}</p>
            </div>
            <span>{section.characters.length}</span>
          </header>

          {#if section.characters.length === 0}
            <p class="empty-section">No {section.title.toLowerCase()} have been created yet.</p>
          {:else}
            <div class="character-grid">
              {#each section.characters as character}
                <article>
                  {#if character.images.normal}
                    <img
                      src={character.images.normal}
                      alt=""
                      style:object-position={`${character.imagePositions.normal.x}% ${character.imagePositions.normal.y}%`}
                    >
                  {:else}
                    <div class="portrait-placeholder">{character.name.slice(0, 1).toUpperCase()}</div>
                  {/if}
                  <div>
                    <span>{character.builtIn ? 'BUILT-IN' : 'CUSTOM'}</span>
                    <h2>{character.name}</h2>
                    <p>{character.notes || 'No character notes yet.'}</p>
                    <strong>{character.wallet.toLocaleString()}₭</strong>
                  </div>
                  <div class="card-actions">
                    <button type="button" on:click={() => {
                      openCharacter(character);
                    }}>Edit</button>
                  </div>
                </article>
              {/each}
            </div>
          {/if}
        </section>
      {/each}
    {/if}
  </div>
</section>

<style lang="scss">
  .character-library {
    width: 100%;
    height: 100%;
    overflow: hidden;
    color: #e8edf6;
    background: #150510;
    border: 1px solid #ff3dbb;
    border-radius: 8px;
    box-shadow: 0 0 34px #ff3dbb55;

    > header {
      min-height: 38px;
      padding: 8px 14px;
      color: #ff9ada;
      background: #24091c;
      border-bottom: 1px solid #ff3dbb;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.75rem;
      letter-spacing: 2px;

      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  }

  .screen {
    height: calc(100% - 38px);
    padding: clamp(22px, 4vw, 52px);
    overflow-y: auto;
  }

  .title-row,
  .form-heading,
  .form-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
  }

  .title-row {
    margin-bottom: 30px;

    h1 {
      margin-bottom: 10px;
      color: #ffffff;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: clamp(2rem, 5vw, 4rem);
    }

    p:last-child {
      max-width: 720px;
      color: #9ca8bb;
      line-height: 1.6;
    }
  }

  .create-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }

  .eyebrow {
    margin-bottom: 7px;
    color: #ff75c8;
    font-size: 0.7rem;
    letter-spacing: 2px;
  }

  button,
  .upload-button {
    min-height: 40px;
    padding: 9px 13px;
    color: #e8edf6;
    background: #24162c;
    border: 1px solid #76537f;
    cursor: pointer;
    font-weight: 700;
  }

  .primary-button {
    color: #170612;
    background: #ff75c8;
    border-color: #ffc3e7;
  }

  .danger-button {
    color: #ffc5d5;
    background: #451225;
    border-color: #d34270;
  }

  .status-message,
  .error-message {
    margin-bottom: 18px;
    padding: 12px 14px;
  }

  .status-message {
    color: #bfffd9;
    background: #0d3423;
    border: 1px solid #36b873;
  }

  .error-message {
    color: #ffc5d5;
    background: #3d0e20;
    border: 1px solid #e94c7d;
  }

  .character-section {
    margin-top: 26px;
    padding: 18px;
    background: #150d19;
    border: 1px solid #54314d;

    > header {
      margin-bottom: 16px;

      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 18px;

      h2 {
        color: #ffffff;
        font-family: "Orbitron", "Space Mono", sans-serif;
      }

      p:last-child {
        margin-top: 5px;
        color: #9ba7b9;
      }

      > span {
        min-width: 38px;
        padding: 8px;
        color: #ffffff;
        border: 1px solid currentColor;
        text-align: center;
      }
    }
  }

  .character-section--playable {
    border-color: #a855f7;

    > header > span {
      color: #d8b4fe;
    }
  }

  .character-section--npc {
    border-color: #d97706;

    > header > span {
      color: #fbbf24;
    }
  }

  .empty-section {
    padding: 18px;
    color: #9ba7b9;
    border: 1px dashed #4b3047;
  }

  .character-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
    gap: 16px;

    > article {
      padding: 16px;
      background: #210a19;
      border: 1px solid #6b1f50;

      display: grid;
      grid-template-columns: 82px 1fr;
      gap: 14px;

      > img,
      > .portrait-placeholder {
        width: 82px;
        height: 82px;
        object-fit: cover;
        border: 1px solid #ff3dbb;
      }

      h2 {
        margin: 5px 0 8px;
        color: #ffffff;
      }

      p {
        min-height: 2.8em;
        color: #9ba7b9;
        line-height: 1.4;
      }

      span {
        color: #ff75c8;
        font-size: 0.65rem;
        letter-spacing: 1px;
      }

      strong {
        color: #55f09a;
      }
    }
  }

  .portrait-placeholder {
    color: #ff75c8;
    background: #190711;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: 1.5rem;

    display: grid;
    place-items: center;
  }

  .card-actions {
    grid-column: 1 / -1;

    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .character-form {
    padding: clamp(18px, 3vw, 32px);
    background: #170b19;
    border: 1px solid #67365e;

    h2 {
      color: #ffffff;
      font-family: "Orbitron", "Space Mono", sans-serif;
    }

    > label,
    .field-grid label,
    .stats-grid label {
      margin-top: 18px;

      display: grid;
      gap: 7px;
    }

    label > span,
    legend {
      color: #f1b5dc;
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    input,
    select,
    textarea {
      width: 100%;
      padding: 10px 12px;
      color: #ffffff;
      background: #080710;
      border: 1px solid #65485f;
    }

    fieldset {
      margin-top: 26px;
      padding: 18px;
      border: 1px solid #5e2c55;
    }
  }

  .field-grid,
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
  }

  .fieldset-help {
    margin: 7px 0 16px;
    color: #97a3b5;
  }

  .expression-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;

    article {
      padding: 12px;
      background: #0b0910;
      border: 1px solid #4b3047;

      display: grid;
      gap: 9px;
    }

    .expression-frame,
    .image-placeholder {
      width: 100%;
      aspect-ratio: 1;
      overflow: hidden;
      background: #17121a;
      border: 1px solid #4b3047;
    }

    .expression-frame img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .image-placeholder {
      color: #715f70;
      font-size: 0.66rem;
      letter-spacing: 1px;

      display: grid;
      place-items: center;
    }

    strong {
      color: #ffffff;
    }
  }

  .crop-controls {
    display: grid;
    gap: 8px;

    label {
      display: grid;
      gap: 4px;
    }

    span {
      color: #9ca8bb;
      font-size: 0.62rem;
      letter-spacing: 0;
      text-transform: none;
    }

    input[type='range'] {
      min-width: 0;
      padding: 0;
    }
  }

  .upload-button {
    text-align: center;

    input {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }
  }

  .form-actions {
    margin-top: 24px;
  }

  @media (max-width: 700px) {
    .screen {
      padding: 20px 16px;
    }

    .title-row,
    .form-heading {
      align-items: flex-start;
      flex-direction: column;
    }

    .create-actions {
      width: 100%;
      justify-content: stretch;

      button {
        flex: 1 1 130px;
      }
    }

    .character-section {
      padding: 13px;
    }

    .character-grid {
      grid-template-columns: 1fr;
    }

    .character-form fieldset {
      padding: 14px;
    }

    .form-actions {
      align-items: stretch;
      flex-direction: column-reverse;

      button {
        width: 100%;
      }
    }
  }
</style>
