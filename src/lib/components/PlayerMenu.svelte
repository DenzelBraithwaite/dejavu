<script lang="ts">
  import { clamp } from '../helpers';
  import { campaignState, localPlayer } from '../stores/campaign';
  import { characterLibraryState } from '../stores/characters';
  import { libraryState, type StoryRelationship } from '../stores/library';
  import location from '../stores/location';
  import { sessionState, type PlayerId } from '../stores/session';

  let relationshipDefinitions: StoryRelationship[] = [];
  let storyPlayerId: PlayerId | null = null;

  $: storyPlayerId = $libraryState.activeStoryMode === 'multiplayer'
    ? (Object.entries($libraryState.seatClaims).find(
        ([, connectionId]) => connectionId === $sessionState.playerId
      )?.[0] as PlayerId | undefined) ?? $sessionState.playerId
    : $sessionState.playerId;
  $: relationshipDefinitions = $campaignState?.story?.relationships?.filter(
    (relationship) => relationship.visible
      && (
        !relationship.playerId
        || relationship.playerId === (
          $libraryState.activeStoryMode === 'singleplayer' ? 'p1' : storyPlayerId
        )
      )
  ) ?? [];

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

    return clamp(((value - relationship.minimum) / range) * 100, 0, 100);
  }
</script>

<section class="player-menu" class:hide={$location !== 'player'} aria-labelledby="player-menu-title">
  <header>DEJAVU://CARTRIDGE_PLAYER</header>

  <div class="player-content">
    <p class="eyebrow">ACTIVE STORY IDENTITY</p>
    <h1 id="player-menu-title">
      {$libraryState.activeStoryId && $campaignState?.story && $localPlayer
        ? $localPlayer.name
        : 'No player loaded'}
    </h1>

    {#if $libraryState.activeStoryId && $campaignState?.story && $localPlayer}
      <div class="player-grid">
        <article class="identity-card">
          <span>{$localPlayer.customName ? 'CUSTOM NAME' : 'DEFAULT NAME'}</span>
          <strong>{$localPlayer.name}</strong>
          {#if $localPlayer.customName}
            <small>Default character name: {$localPlayer.defaultName}</small>
          {/if}
          <p>
            A custom name belongs only to this cartridge session and disappears when the
            cartridge is restarted or changed.
          </p>
        </article>

        <article>
          <h2>Player state</h2>
          <dl>
            <div>
              <dt>Wallet</dt>
              <dd>{$localPlayer.wallet.toLocaleString()}₭</dd>
            </div>
            {#each Object.entries($localPlayer.stats) as [stat, value]}
              <div>
                <dt>{stat}</dt>
                <dd>{value}</dd>
              </div>
            {/each}
          </dl>
        </article>

        <article class="relationships-card">
          <h2>Relationships</h2>
          {#if relationshipDefinitions.length}
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
            <p class="empty-state">No visible relationships are configured for this player.</p>
          {/if}
        </article>
      </div>
    {:else}
      <div class="empty-state">
        Insert and start a cartridge to view its active player.
      </div>
    {/if}
  </div>
</section>

<style lang="scss">
  .player-menu {
    width: 100%;
    height: 100%;
    max-width: 1100px;
    overflow: hidden;
    background: #07111c;
    border: 1px solid #6aaee8;
    border-radius: 8px;
    box-shadow: 0 0 30px #6aaee838;

    > header {
      padding: 11px 14px;
      color: #d2eaff;
      background: #122942;
      border-bottom: 1px solid #6aaee8;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.75rem;
      letter-spacing: 2px;
    }
  }

  .player-content {
    height: calc(100% - 38px);
    padding: clamp(22px, 4vw, 48px);
    overflow-y: auto;
  }

  .eyebrow {
    margin-bottom: 7px;
    color: #82bced;
    font-size: 0.68rem;
    letter-spacing: 1.5px;
  }

  h1 {
    margin-bottom: 28px;
    font-family: "Orbitron", "Space Mono", sans-serif;
  }

  .player-grid {
    display: grid;
    grid-template-columns: minmax(220px, 0.65fr) minmax(0, 1.35fr);
    gap: 20px;

    article {
      padding: 22px;
      background: #0b1827;
      border: 1px solid #315f87;
    }
  }

  .identity-card {
    align-content: start;

    display: grid;
    gap: 12px;

    span {
      color: #82bced;
      font-size: 0.65rem;
      letter-spacing: 1.4px;
    }

    strong {
      color: #d2eaff;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 1.25rem;
    }

    p {
      color: #a9bdd1;
      line-height: 1.65;
    }

    small {
      color: #82a1bd;
      line-height: 1.5;
    }
  }

  .relationships-card {
    grid-column: 1 / -1;
  }

  .relationship-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
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

  h2 {
    margin-bottom: 16px;
    color: #b9dcf8;
    font-size: 1rem;
  }

  dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;

    div {
      padding: 11px 13px;
      background: #08131f;
      border: 1px solid #294d6d;
    }
  }

  dt {
    color: #7f9bb5;
    font-size: 0.63rem;
    text-transform: uppercase;
  }

  dd {
    margin-top: 5px;
    color: #9fd0f7;
    font-weight: 800;
  }

  .empty-state {
    padding: 24px;
    color: #a9bdd1;
    background: #0b1827;
    border: 1px solid #315f87;
  }

  @media (max-width: 760px) {
    .player-grid {
      grid-template-columns: 1fr;
    }

    dl {
      grid-template-columns: 1fr;
    }

    .relationship-list {
      grid-template-columns: 1fr;
    }
  }
</style>
