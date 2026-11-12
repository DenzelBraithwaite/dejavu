<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { StoryChapter, StoryNode } from '../../stores/library';

  export let chapters: StoryChapter[] = [];
  export let nodes: StoryNode[] = [];
  export let issueCounts: Record<string, number> = {};

  const dispatch = createEventDispatcher<{
    add: void;
    change: { chapterId: string; field: keyof StoryChapter; value: string | boolean };
    move: { chapterId: string; direction: -1 | 1 };
    remove: { chapterId: string };
    toggle: { chapterId: string };
  }>();

  let deleteArmedId = '';

  function assignedNodeCount(chapterId: string): number {
    return nodes.filter((node) => node.chapterId === chapterId).length;
  }

  function updateChapter(
    chapterId: string,
    field: keyof StoryChapter,
    event: Event
  ): void {
    const input = event.currentTarget as HTMLInputElement | HTMLTextAreaElement;

    dispatch('change', {
      chapterId,
      field,
      value: input.value
    });
  }

  function requestRemoval(chapterId: string): void {
    if (deleteArmedId !== chapterId) {
      deleteArmedId = chapterId;
      return;
    }

    deleteArmedId = '';
    dispatch('remove', { chapterId });
  }
</script>

<section class="chapter-manager settings-section">
  <header>
    <div>
      <p class="eyebrow">OPTIONAL ORGANIZATION</p>
      <h3>Chapters</h3>
      <p>
        New nodes inherit the chapter of the node they extend. Companion nodes
        always inherit their host chapter, so chapters rarely need manual upkeep.
      </p>
    </div>
    <button class="chapter-add" type="button" on:click={() => dispatch('add')}>Add chapter</button>
  </header>

  {#if chapters.length === 0}
    <div class="chapter-empty">
      <strong>No chapters configured</strong>
      <span>The editor behaves exactly as it does now until you add one.</span>
    </div>
  {:else}
    <div class="chapter-list">
      {#each chapters as chapter, index (chapter.id)}
        <article style={`--chapter-color: ${chapter.color}`}>
          <div class="chapter-card-heading">
            <span class="chapter-order">{index + 1}</span>
            <div>
              <strong>{chapter.name || `Chapter ${index + 1}`}</strong>
              <small>
                {assignedNodeCount(chapter.id)} nodes
                · {issueCounts[chapter.id] ?? 0} validation issues
                · {chapter.collapsed ? 'collapsed' : 'expanded'}
              </small>
            </div>
          </div>

          <label>
            <span>Name</span>
            <input
              value={chapter.name}
              maxlength="80"
              on:input={(event) => updateChapter(chapter.id, 'name', event)}
            >
          </label>

          <label>
            <span>Color</span>
            <input
              class="chapter-color"
              type="color"
              value={chapter.color}
              on:input={(event) => updateChapter(chapter.id, 'color', event)}
            >
          </label>

          <label class="chapter-description">
            <span>Description</span>
            <textarea
              rows="2"
              maxlength="300"
              value={chapter.description}
              on:input={(event) => updateChapter(chapter.id, 'description', event)}
            ></textarea>
          </label>

          <div class="chapter-actions">
            <button
              type="button"
              disabled={index === 0}
              on:click={() => dispatch('move', { chapterId: chapter.id, direction: -1 })}
            >Move earlier</button>
            <button
              type="button"
              disabled={index === chapters.length - 1}
              on:click={() => dispatch('move', { chapterId: chapter.id, direction: 1 })}
            >Move later</button>
            <button type="button" on:click={() => dispatch('toggle', { chapterId: chapter.id })}>
              {chapter.collapsed ? 'Expand on map' : 'Collapse on map'}
            </button>
            <button
              class:armed={deleteArmedId === chapter.id}
              type="button"
              on:click={() => requestRemoval(chapter.id)}
            >
              {deleteArmedId === chapter.id ? 'Confirm removal' : 'Remove chapter'}
            </button>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</section>

<style lang="scss">
  .chapter-manager {
    display: grid;
    gap: 1rem;

    > header {
      align-items: start;
      display: flex;
      gap: 1rem;
      justify-content: space-between;

      h3,
      p {
        margin: 0;
      }

      p:last-child {
        color: #9eb2c8;
        margin-top: 0.45rem;
        max-width: 62ch;
      }
    }
  }

  .eyebrow {
    color: #02fbfb;
    font-size: 0.7rem;
    letter-spacing: 0.13em;
  }

  .chapter-add {
    background: #02fbfb;
    border: 0;
    color: #031018;
    font-weight: 800;
    padding: 0.72rem 1rem;
  }

  .chapter-empty {
    border: 1px dashed #315069;
    display: grid;
    gap: 0.3rem;
    padding: 1rem;

    span {
      color: #8da4b9;
    }
  }

  .chapter-list {
    display: grid;
    gap: 1rem;

    article {
      border: 1px solid color-mix(in srgb, var(--chapter-color) 65%, #24354a);
      box-shadow: inset 4px 0 0 var(--chapter-color);
      display: grid;
      gap: 0.85rem;
      grid-template-columns: minmax(12rem, 1fr) 5rem minmax(16rem, 1.4fr);
      padding: 1rem;
    }

    label {
      display: grid;
      gap: 0.38rem;

      span {
        color: #a9bdd0;
        font-size: 0.72rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
    }

    input,
    textarea {
      background: #08111f;
      border: 1px solid #30475f;
      color: #ecf7ff;
      padding: 0.65rem;
    }
  }

  .chapter-card-heading {
    align-items: center;
    display: flex;
    gap: 0.75rem;
    grid-column: 1 / -1;

    div {
      display: grid;
      gap: 0.2rem;
    }

    small {
      color: #8ea5ba;
    }
  }

  .chapter-order {
    align-items: center;
    background: var(--chapter-color);
    color: #02070d;
    display: inline-flex;
    font-weight: 900;
    height: 2rem;
    justify-content: center;
    width: 2rem;
  }

  .chapter-color {
    height: 2.65rem;
    padding: 0.2rem !important;
    width: 100%;
  }

  .chapter-actions {
    display: grid;
    gap: 0.55rem;
    grid-column: 1 / -1;
    grid-template-columns: repeat(4, minmax(0, 1fr));

    button {
      background: #101d2c;
      border: 1px solid #36506a;
      color: #dbeeff;
      padding: 0.65rem;

      &.armed {
        background: #53212b;
        border-color: #ff6d7b;
      }
    }
  }

  @media (max-width: 900px) {
    .chapter-manager > header {
      display: grid;
    }

    .chapter-list article {
      grid-template-columns: 1fr;
    }

    .chapter-actions {
      grid-template-columns: 1fr;
    }
  }
</style>
