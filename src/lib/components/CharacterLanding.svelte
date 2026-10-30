<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { socket } from '../socket';
  import {
    characterLibraryState,
    type CharacterRecord
  } from '../stores/characters';
  import { sessionState } from '../stores/session';

  export let allowClose = false;

  const dispatch = createEventDispatcher();

  let creatingCharacter = false;
  let newCharacterName = '';
  let errorMessage = '';
  let accountCharacters: CharacterRecord[] = [];

  $: accountCharacters = $characterLibraryState.characters.filter(
    (character) => character.type === 'account'
  );

  function openCreator(): void {
    creatingCharacter = true;
  }

  function closeCreator(): void {
    creatingCharacter = false;
  }

  function accountIsUsedByOtherPlayer(characterId: string): boolean {
    const otherPlayerId = $sessionState.playerId === 'p1' ? 'p2' : 'p1';

    return $characterLibraryState.selections[otherPlayerId] === characterId;
  }

  // A selected character becomes this browser slot's persistent minigame identity.
  function selectCharacter(character: CharacterRecord): void {
    errorMessage = '';

    socket.emit('characters:select', character.id, (result: {
      ok: boolean;
      error?: string;
    }) => {
      if (!result.ok) {
        errorMessage = result.error ?? 'The character could not be selected.';
        return;
      }

      dispatch('selected');
    });
  }

  function createCharacter(): void {
    errorMessage = '';

    socket.emit('characters:create', {
      name: newCharacterName,
      wallet: 1_000,
      type: 'account'
    }, (result: {
      ok: boolean;
      character?: CharacterRecord;
      error?: string;
    }) => {
      if (!result.ok || !result.character) {
        errorMessage = result.error ?? 'The character could not be created.';
        return;
      }

      newCharacterName = '';
      creatingCharacter = false;
      selectCharacter(result.character);
    });
  }
</script>

<main class="landing" aria-labelledby="landing-title">
  <section class="landing-panel">
    <header>
      <span>DEJAVU://IDENTITY_LINK</span>
      <span>{$sessionState.playerId?.toUpperCase()}</span>
    </header>

    <div class="landing-content">
      {#if allowClose}
        <button class="close-selector" type="button" on:click={() => dispatch('close')}>
          × Close account selector
        </button>
      {/if}
      <p class="eyebrow">CHOOSE YOUR ACCOUNT</p>
      <h1 id="landing-title">Who is playing?</h1>
      <p class="introduction">
        Choose the account whose name, stats, and ₭rypto wallet follow you through main-menu minigames. Story characters stay inside their own cartridges.
      </p>

      {#if errorMessage}
        <p class="error-message" role="alert">{errorMessage}</p>
      {/if}

      <div class="character-grid">
        {#each accountCharacters as character}
          <button
            type="button"
            class="character-card"
            disabled={accountIsUsedByOtherPlayer(character.id)}
            on:click={() => {
            selectCharacter(character);
            }}
          >
            {#if character.images.normal}
              <img
                src={character.images.normal}
                alt=""
                style:object-position={`${character.imagePositions.normal.x}% ${character.imagePositions.normal.y}%`}
              >
            {:else}
              <span class="portrait-placeholder" aria-hidden="true">
                {character.name.slice(0, 1).toUpperCase()}
              </span>
            {/if}

            <span class="character-copy">
              <strong>{character.name}</strong>
              <small>{character.wallet.toLocaleString()}₭ · {Object.keys(character.stats).length} STATS</small>
            </span>

            <span class="select-label">
              {accountIsUsedByOtherPlayer(character.id) ? 'IN USE' : 'SELECT'}
            </span>
          </button>
        {/each}
      </div>

      {#if creatingCharacter}
        <form class="quick-create" on:submit|preventDefault={createCharacter}>
          <label for="new-character-name">New account name</label>
          <div>
            <input
              id="new-character-name"
              bind:value={newCharacterName}
              maxlength="48"
            >
            <button type="submit" disabled={!newCharacterName.trim()}>Create and select</button>
            <button type="button" on:click={closeCreator}>Cancel</button>
          </div>
          <p>You can set stats, wallet, notes, and all seven expressions in the Characters screen.</p>
        </form>
      {:else}
        <button class="create-button" type="button" on:click={openCreator}>
          ＋ Create a new account
        </button>
      {/if}
    </div>
  </section>
</main>

<style lang="scss">
  .landing {
    width: 100%;
    height: 100%;
    padding: clamp(18px, 4vw, 56px);
    overflow-y: auto;
    color: #e8edf6;
    background:
      radial-gradient(circle at 20% 10%, #d2259426, transparent 30%),
      radial-gradient(circle at 80% 90%, #078a9e24, transparent 34%),
      #020617;

    display: grid;
    place-items: center;
  }

  .landing-panel {
    width: min(1040px, 100%);
    background: #090b18ed;
    border: 1px solid #ff3dbb;
    box-shadow: 0 0 48px #ff3dbb33;

    > header {
      min-height: 42px;
      padding: 10px 16px;
      color: #ff9ada;
      background: #24091c;
      border-bottom: 1px solid #ff3dbb;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.72rem;
      letter-spacing: 2px;

      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  }

  .landing-content {
    position: relative;
    padding: clamp(26px, 5vw, 64px);
  }

  .close-selector {
    position: sticky;
    z-index: 2;
    top: 0;
    float: right;
    min-height: 38px;
    padding: 8px 12px;
    color: #ffd2ed;
    background: #2a0c22;
    border: 1px solid #ff75c8;
    cursor: pointer;
  }

  .eyebrow {
    margin-bottom: 8px;
    color: #ff75c8;
    font-size: 0.72rem;
    letter-spacing: 2px;
  }

  h1 {
    color: #ffffff;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: clamp(2.2rem, 6vw, 5rem);
  }

  .introduction {
    max-width: 700px;
    margin: 14px 0 34px;
    color: #9eabc0;
    line-height: 1.7;
  }

  .error-message {
    margin-bottom: 18px;
    padding: 12px;
    color: #ffc5d5;
    background: #3d0e20;
    border: 1px solid #e94c7d;
  }

  .character-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 14px;
  }

  .character-card {
    min-height: 104px;
    padding: 14px;
    color: #e8edf6;
    background: #121529;
    border: 1px solid #3c4664;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;

    display: grid;
    grid-template-columns: 68px 1fr auto;
    align-items: center;
    gap: 14px;

    &:hover,
    &:focus-visible {
      border-color: #02fbfb;
      box-shadow: 0 0 22px #02fbfb2b;
      transform: translateY(-2px);
    }

    &:disabled {
      cursor: not-allowed;
      filter: grayscale(0.75);
      opacity: 0.5;
      transform: none;
    }

    img,
    .portrait-placeholder {
      width: 68px;
      height: 68px;
      object-fit: cover;
      border: 1px solid #ff3dbb;
    }
  }

  .portrait-placeholder {
    color: #ff75c8;
    background: #2a0c22;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: 1.6rem;

    display: grid;
    place-items: center;
  }

  .character-copy {
    min-width: 0;

    display: grid;
    gap: 7px;

    strong {
      color: #ffffff;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 1rem;
    }

    small {
      color: #8ea0b9;
    }
  }

  .select-label {
    color: #02fbfb;
    font-size: 0.65rem;
    font-weight: 800;
    letter-spacing: 1px;
  }

  .create-button {
    width: 100%;
    margin-top: 18px;
    padding: 16px;
    color: #ff9ada;
    background: transparent;
    border: 1px dashed #944072;
    cursor: pointer;
  }

  .quick-create {
    margin-top: 18px;
    padding: 20px;
    background: #130d21;
    border: 1px solid #674b82;

    label {
      display: block;
      margin-bottom: 9px;
      color: #d9c4ff;
      font-weight: 700;
    }

    div {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    input {
      min-width: 220px;
      min-height: 42px;
      padding: 9px 12px;
      color: #ffffff;
      background: #070a14;
      border: 1px solid #59657d;

      flex: 1;
    }

    button {
      min-height: 42px;
      padding: 9px 14px;
      color: #f0e8ff;
      background: #31204c;
      border: 1px solid #8765ba;
      cursor: pointer;
    }

    p {
      margin-top: 10px;
      color: #8e9bb0;
      font-size: 0.78rem;
    }
  }

  @media (max-width: 620px) {
    .landing {
      padding: 10px;
      place-items: start center;
    }

    .landing-content {
      padding: 24px 16px;
    }

    .character-grid {
      grid-template-columns: 1fr;
    }

    .character-card {
      grid-template-columns: 56px 1fr;

      img,
      .portrait-placeholder {
        width: 56px;
        height: 56px;
      }
    }

    .select-label {
      display: none;
    }

    .quick-create input {
      width: 100%;
      min-width: 0;
    }
  }
</style>
