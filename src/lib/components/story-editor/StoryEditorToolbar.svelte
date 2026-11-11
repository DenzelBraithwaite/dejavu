<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { StoryDocument } from '../../stores/library';

  export let story: StoryDocument;
  export let mobileCollapsed = false;
  export let undoCount = 0;
  export let redoCount = 0;
  export let saveInFlight = false;
  export let unavailableReason = '';

  const dispatch = createEventDispatcher<{
    back: void;
    guide: void;
    play: void;
    redo: void;
    save: void;
    settings: void;
    toggleMobile: void;
    undo: void;
  }>();
</script>

<div class="editor-toolbar" class:mobile-collapsed={mobileCollapsed}>
  <button
    class="mobile-toolbar-toggle"
    type="button"
    aria-expanded={!mobileCollapsed}
    on:click={() => dispatch('toggleMobile')}
  >
    {mobileCollapsed ? 'Show editor controls' : 'Hide editor controls'}
  </button>
  <button class="back-button" type="button" on:click={() => dispatch('back')}>
    ← Editor
  </button>
  <div class="story-identity">
    <strong>{story.title}</strong>
    <span>
      VERSION {story.version} · {unavailableReason ? 'UNAVAILABLE' : 'PLAYABLE'}
      {story.protected ? ' · PROTECTED' : ''}
    </span>
  </div>
  <div class="toolbar-actions">
    <button type="button" disabled={undoCount === 0} on:click={() => dispatch('undo')} aria-label="Undo last editor change">
      ↶ Undo
    </button>
    <button type="button" disabled={redoCount === 0} on:click={() => dispatch('redo')} aria-label="Redo editor change">
      ↷ Redo
    </button>
    <button type="button" on:click={() => dispatch('guide')} aria-label="Open editor tutorial">
      ⓘ Guide
    </button>
    <button type="button" on:click={() => dispatch('settings')}>
      Settings
    </button>
    <button type="button" disabled={saveInFlight} on:click={() => dispatch('play')}>
      ▶ Play
    </button>
    <button class="save-button" type="button" disabled={saveInFlight} on:click={() => dispatch('save')}>
      {saveInFlight ? 'Saving…' : 'Save'}
    </button>
  </div>
</div>

<style lang="scss">
  .editor-toolbar {
    min-height: 74px;
    padding: 12px 16px;
    background: #160d08;
    border-bottom: 1px solid #673616;

    display: grid;
    grid-template-columns: auto minmax(180px, 1fr) auto;
    align-items: center;
    gap: 14px;
  }

  button {
    min-height: 38px;
    padding: 8px 11px;
    color: #dce6f3;
    background: #101826;
    border: 1px solid #3e4f65;
    border-radius: 5px;
    font: inherit;
    cursor: pointer;

    &:hover:not(:disabled) {
      color: #ffffff;
      border-color: #ff9c51;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }
  }

  .back-button {
    background: transparent;
  }

  .story-identity {
    min-width: 0;
    display: grid;
    gap: 5px;

    strong {
      overflow: hidden;
      color: #ffffff;
      font-family: "Orbitron", "Space Mono", sans-serif;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    span {
      color: #8e9eb3;
      font-size: 0.62rem;
      letter-spacing: 0.08em;
    }
  }

  .toolbar-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 7px;
  }

  .save-button {
    color: #1b0d04;
    background: #ff9c51;
    border-color: #ff9c51;
    font-weight: 800;
  }

  .mobile-toolbar-toggle {
    display: none;
  }

  @media (max-width: 900px) {
    .editor-toolbar {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .toolbar-actions {
      grid-column: 1 / -1;
      justify-content: stretch;

      button {
        flex: 1 1 100px;
      }
    }
  }

  @media (max-width: 760px) {
    .editor-toolbar {
      position: relative;
      grid-template-columns: 1fr;

      &.mobile-collapsed {
        min-height: 48px;
        padding: 6px;

        .back-button,
        .story-identity,
        .toolbar-actions {
          display: none;
        }
      }
    }

    .mobile-toolbar-toggle {
      display: block;
      width: 100%;
    }

    .back-button,
    .story-identity,
    .toolbar-actions {
      grid-column: 1;
    }
  }
</style>
