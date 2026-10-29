<script lang="ts">
  import { campaignState, localPlayer } from '../stores/campaign';
  import { characterLibraryState } from '../stores/characters';
  import { libraryState, type StoryRelationship } from '../stores/library';
  import location from '../stores/location';
  import { sessionState, type PlayerId } from '../stores/session';
  import { characterRegistry } from '../story/characters';

  let expandedItem: {
    name: string;
    image: string;
  } | null = null;
  let storyPlayerId: PlayerId | null = null;
  let relationshipDefinitions: StoryRelationship[] = [];

  $: storyPlayerId = $libraryState.activeStoryMode === 'multiplayer'
    ? (Object.entries($libraryState.seatClaims).find(
        ([, connectionId]) => connectionId === $sessionState.playerId
      )?.[0] as PlayerId | undefined) ?? $sessionState.playerId
    : $sessionState.playerId;
  $: relationshipDefinitions = $campaignState?.story?.relationships?.filter(
    (relationship) => relationship.visible
  ) ?? [];

  function openItem(name: string, image: string): void {
    expandedItem = {
      name,
      image
    };
  }

  function closeItem(): void {
    expandedItem = null;
  }

  function relationshipCharacter(relationship: StoryRelationship) {
    if (relationship.characterId === 'other-player' && storyPlayerId && $campaignState) {
      const otherPlayerId = storyPlayerId === 'p1' ? 'p2' : 'p1';
      const otherCharacterId = $campaignState.players[otherPlayerId].characterId;

      return $characterLibraryState.characters.find(
        (character) => character.id === otherCharacterId
      );
    }

    return $characterLibraryState.characters.find(
      (character) => character.id === relationship.characterId
    );
  }

  function relationshipName(relationship: StoryRelationship): string {
    if (relationship.characterId === 'other-player' && storyPlayerId && $campaignState) {
      const otherPlayerId = storyPlayerId === 'p1' ? 'p2' : 'p1';

      return $campaignState.players[otherPlayerId].name || 'Other player';
    }

    return relationshipCharacter(relationship)?.name ?? relationship.id;
  }

  function relationshipLabel(value: number): string {
    if (value <= -5) {
      return 'Hostile';
    }

    if (value < 0) {
      return 'Wary';
    }

    if (value >= 5) {
      return 'Loyal';
    }

    if (value >= 3) {
      return 'Friendly';
    }

    return 'Neutral';
  }

  function relationshipPercent(relationship: StoryRelationship, value: number): number {
    const range = relationship.maximum - relationship.minimum;

    if (range <= 0) {
      return 50;
    }

    return Math.min(100, Math.max(
      0,
      ((value - relationship.minimum) / range) * 100
    ));
  }
</script>

<section class="bag" class:hide={$location !== 'bag'} aria-labelledby="bag-title">
  <header>DEJAVU://BAG</header>

  <div class="bag-content">
    <h1 id="bag-title">Bag and known contacts</h1>

    <div class="bag-grid">
      <article>
        <h2>Inventory</h2>
        {#if $localPlayer?.inventory.length}
          <ul class="inventory-list">
            {#each $localPlayer.inventory as item}
              <li>
                {#if $localPlayer.itemImages?.[item]}
                  <button type="button" on:click={() => openItem(item, $localPlayer.itemImages[item])}>
                    <img src={$localPlayer.itemImages[item]} alt="">
                    <span>{item}</span>
                    <small>VIEW</small>
                  </button>
                {:else}
                  <span>{item}</span>
                {/if}
              </li>
            {/each}
          </ul>
        {:else}
          <p class="empty-state">Your bag is empty.</p>
        {/if}

        <h2 class="mods-heading">Installed neuro mods</h2>
        {#if $campaignState?.installedMods.length}
          <ul class="inventory-list">
            {#each $campaignState.installedMods as modId}
              <li>{modId === 'neuro-link-chat' ? 'Neuro-Link Chat' : modId}</li>
            {/each}
          </ul>
        {:else}
          <p class="empty-state">No neuro mods installed.</p>
        {/if}
      </article>

      <article>
        <h2>Known contacts</h2>
        {#if $localPlayer?.knownCharacters.length}
          <div class="contact-list">
            {#each $localPlayer.knownCharacters as characterId}
              {@const character = characterRegistry[characterId]}
              {#if character}
                <div class="contact-card">
                  {#if character.image}
                    <img src={character.image} alt="">
                  {/if}
                  <div>
                    <h3>{character.name}</h3>
                    <p class="contact-role">
                      {character.association} · {character.role}
                    </p>
                    <p>{character.summary}</p>
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        {:else}
          <p class="empty-state">No contacts have been identified.</p>
        {/if}
      </article>

      <article>
        <h2>Relationships</h2>
        {#if relationshipDefinitions.length && $localPlayer}
          <div class="relationship-list">
            {#each relationshipDefinitions as relationship}
              {@const value = Number($localPlayer.relationships?.[relationship.id] ?? relationship.initialValue)}
              {@const character = relationshipCharacter(relationship)}
              <div class="relationship-card">
                {#if character?.images.normal}
                  <img
                    src={character.images.normal}
                    alt=""
                    style:object-position={`${character.imagePositions.normal.x}% ${character.imagePositions.normal.y}%`}
                  >
                {:else}
                  <span class="relationship-placeholder">
                    {relationshipName(relationship).slice(0, 1).toUpperCase()}
                  </span>
                {/if}
                <div>
                  <strong>{relationshipName(relationship)}</strong>
                  <span>{relationshipLabel(value)} · {value > 0 ? '+' : ''}{value}</span>
                  <div class="relationship-meter" aria-label={`${relationshipName(relationship)} relationship ${value}`}>
                    <i style={`width: ${relationshipPercent(relationship, value)}%`}></i>
                  </div>
                  <small>{relationship.minimum} to {relationship.maximum}</small>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="empty-state">No visible relationships are configured for this cartridge.</p>
        {/if}
      </article>
    </div>
  </div>

  {#if expandedItem}
    <button class="item-image-backdrop" type="button" aria-label="Close item image" on:click={closeItem}>
      <span class="item-image-modal" role="dialog" aria-modal="true" aria-label={expandedItem.name}>
        <strong>{expandedItem.name}</strong>
        <img src={expandedItem.image} alt={expandedItem.name}>
        <small>Click anywhere to close</small>
      </span>
    </button>
  {/if}
</section>

<style lang="scss">
  .bag {
    width: 100%;
    height: 100%;
    max-width: 1100px;
    overflow: hidden;
    background: #07101b;
    border: 1px solid #5798dc;
    border-radius: 8px;
    box-shadow: 0 0 30px #5798dc2f;

    > header {
      padding: 11px 14px;
      color: #c5e2fa;
      background: #10233a;
      border-bottom: 1px solid #5798dc;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.75rem;
      letter-spacing: 2px;
    }
  }

  .bag-content {
    height: calc(100% - 38px);
    padding: clamp(22px, 4vw, 48px);
    overflow-y: auto;
  }

  h1 {
    margin-bottom: 28px;
    font-family: "Orbitron", "Space Mono", sans-serif;
  }

  .bag-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 20px;

    article {
      padding: 20px;
      background: #0d1826;
      border: 1px solid #294a6b;
    }

    h2 {
      margin-bottom: 18px;
      color: #8fc3ed;
      font-size: 1rem;
    }
  }

  .relationship-list {
    display: grid;
    gap: 10px;
  }

  .relationship-card {
    padding: 10px;
    background: #08131f;
    border: 1px solid #294a6b;

    display: grid;
    grid-template-columns: 52px minmax(0, 1fr);
    align-items: center;
    gap: 12px;

    > img,
    > .relationship-placeholder {
      width: 52px;
      height: 52px;
      background: #122942;
      border: 1px solid #5798dc;
      object-fit: cover;
    }

    > .relationship-placeholder {
      color: #b9dcf8;
      font-size: 1.2rem;

      display: grid;
      place-items: center;
    }

    > div {
      min-width: 0;

      display: grid;
      gap: 5px;
    }

    strong {
      overflow: hidden;
      color: #d2eaff;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    span {
      color: #82bced;
      font-size: 0.7rem;
    }

    small {
      color: #6f879f;
      font-size: 0.58rem;
    }
  }

  .relationship-meter {
    height: 7px;
    overflow: hidden;
    background: #020817;
    border: 1px solid #294a6b;

    i {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, #c45d72, #e0ad03 50%, #55c985);
      box-shadow: 0 0 8px #5798dc66;
    }
  }

  .inventory-list {
    list-style: square inside;

    li {
      padding: 8px 0;
      color: #e8edf6;
      border-bottom: 1px dashed #294a6b;

      > button {
        width: 100%;
        min-height: 48px;
        padding: 5px;
        color: #e8edf6;
        background: #0a1523;
        border: 1px solid #294a6b;
        cursor: pointer;
        text-align: left;

        display: grid;
        grid-template-columns: 38px 1fr auto;
        align-items: center;
        gap: 10px;

        &:hover,
        &:focus-visible {
          border-color: #5798dc;
          box-shadow: 0 0 14px #5798dc33;
        }

        img {
          width: 38px;
          height: 38px;
          object-fit: cover;
        }

        small {
          color: #8fc3ed;
          font-size: 0.62rem;
          letter-spacing: 1px;
        }
      }
    }
  }

  .item-image-backdrop {
    position: fixed;
    z-index: 1000;
    inset: 0;
    padding: 24px;
    color: #e8edf6;
    background: #020617df;
    border: 0;
    cursor: zoom-out;

    display: grid;
    place-items: center;
  }

  .item-image-modal {
    width: min(720px, 100%);
    max-height: calc(100vh - 48px);
    padding: 18px;
    overflow-y: auto;
    background: #08121e;
    border: 1px solid #5798dc;
    box-shadow: 0 0 36px #5798dc55;

    display: grid;
    gap: 14px;

    strong {
      color: #c5e2fa;
      font-family: "Orbitron", "Space Mono", sans-serif;
      text-align: left;
    }

    img {
      width: 100%;
      max-height: 70vh;
      object-fit: contain;
    }

    small {
      color: #79aeda;
    }
  }

  .mods-heading {
    margin-top: 30px;
  }

  .contact-list {
    display: grid;
    gap: 12px;
  }

  .contact-card {
    padding: 14px;
    background: #08121e;
    border-left: 3px solid #5798dc;

    display: grid;
    grid-template-columns: auto 1fr;
    gap: 14px;

    img {
      width: 72px;
      height: 72px;
      object-fit: cover;
      border: 1px solid #5798dc;
    }

    h3 {
      color: #c5e2fa;
    }

    p {
      margin-top: 5px;
      line-height: 1.4;
    }
  }

  .contact-role {
    color: #79aeda;
    font-size: 0.75rem;
  }

  .empty-state {
    color: #8893a2;
  }

  @media (max-width: 850px) {
    .bag-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
