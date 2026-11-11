<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    companionNodeTypes,
    tutorialNodeSections,
    undocumentedNodeTypes
  } from './catalog';

  const dispatch = createEventDispatcher<{ close: void }>();

  function nodeShapeClass(type: string): string {
    if (type === 'ending') {
      return 'node-shape-ending';
    }

    if (['choice', 'vote', 'dice-check', 'condition'].includes(type)) {
      return 'node-shape-branch';
    }

    if (['dialogue', 'input', 'conversation'].includes(type)) {
      return 'node-shape-dialogue';
    }

    if (['checkpoint', 'clear-terminal', 'stop-audio', 'change-character'].includes(type)) {
      return 'node-shape-special';
    }

    if (['label', 'note'].includes(type)) {
      return 'node-shape-label';
    }

    if (type === 'audio') {
      return 'node-shape-audio';
    }

    if (type === 'image') {
      return 'node-shape-image';
    }

    if (type === 'minigame') {
      return 'node-shape-minigame';
    }

    return 'node-shape-effect';
  }

  function isMultiplayerNodeType(type: string): boolean {
    return ['checkpoint', 'conversation', 'vote'].includes(type);
  }

  function isCompanionNodeType(type: string): boolean {
    return companionNodeTypes.some((nodeType) => {
      return nodeType.type === type;
    });
  }
</script>

<div class="guide-backdrop" role="presentation" on:click|self={() => dispatch('close')}>
  <section class="editor-guide" role="dialog" aria-modal="true" aria-labelledby="editor-guide-title">
    <header>
      <div>
        <p>EDITOR HANDBOOK</p>
        <h2 id="editor-guide-title">Story nodes and workflows</h2>
      </div>
      <button type="button" aria-label="Close editor tutorial" on:click={() => dispatch('close')}>×</button>
    </header>

    <p class="introduction">
      Main-flow nodes create the playable path. Companion nodes sit beside a host and activate with it without adding another step.
    </p>

    <section class="workflow" aria-labelledby="workflow-guide-title">
      <p class="section-label">WORKFLOW</p>
      <h3 id="workflow-guide-title">Build and connect a path</h3>
      <ol>
        <li><strong>Settings</strong> contains cartridge details, protection, maps, cast, starts, relationships, and ten-version history.</li>
        <li><strong>Story start</strong> chooses a solo opening, one Shared opening, or separate Player 1 and Player 2 openings.</li>
        <li><strong>Relationships</strong> are configured separately per player; Shared relationship effects can change both.</li>
        <li><strong>Add to Player</strong> appends a node to that lane and connects it when an unused route is available.</li>
        <li><strong>+ next, + yes, or + no</strong> creates directly on that route. Select node connects an existing destination.</li>
        <li><strong>Select previous node</strong> makes an existing node lead into the selected node.</li>
        <li><strong>Loops are supported.</strong> Backward routes display <strong>↻ LOOP</strong>.</li>
        <li>Use private lanes for separate perspectives and <strong>Shared</strong> for synchronized actions and votes.</li>
        <li>Companions select a host and never receive previous or next routes.</li>
        <li>Stored player input can be referenced later or used as a session-only custom player name.</li>
        <li>Rich text supports selected colors, bold, italic, and colored highlights.</li>
      </ol>
    </section>

    <div class="node-sections">
      {#each tutorialNodeSections as section}
        <section class="node-section">
          <p class="section-label">NODE REFERENCE</p>
          <h3>{section.title}</h3>
          <p class="section-description">{section.description}</p>

          <div class="node-grid">
            {#each section.nodes as node}
              <article class={nodeShapeClass(node.type)}>
                <div class="badge-row">
                  {#if isCompanionNodeType(node.type)}
                    <span class="companion">COMPANION</span>
                  {/if}
                  {#if isMultiplayerNodeType(node.type)}
                    <span class="multiplayer">MULTIPLAYER</span>
                  {/if}
                </div>
                <div class="node-heading">
                  <h4>{node.name}</h4>
                  <code>{node.type}</code>
                </div>
                <p>{node.description}</p>
                <p class="node-usage"><strong>How to use it:</strong> {node.usage}</p>
              </article>
            {/each}
          </div>
        </section>
      {/each}
    </div>

    {#if undocumentedNodeTypes.length > 0}
      <p class="guide-warning" role="alert">
        Handbook entries are still needed for {undocumentedNodeTypes.map((nodeType) => nodeType.label).join(', ')}.
      </p>
    {/if}

    <footer>
      <p>Save after every playable route reaches another node or an Ending.</p>
      <button type="button" on:click={() => dispatch('close')}>Got it</button>
    </footer>
  </section>
</div>

<style lang="scss">
  .guide-backdrop {
    position: absolute;
    z-index: 200;
    inset: 0;
    padding: 24px;
    background: #02050bcc;

    display: grid;
    place-items: center;
  }

  .editor-guide {
    width: min(920px, 100%);
    max-height: 88vh;
    padding: 24px;
    overflow-y: auto;
    color: #d7e3f1;
    background: #09111e;
    border: 1px solid #02fbfb;
    border-radius: 6px;
    box-shadow: 0 0 48px #02fbfb33;

    > header {
      position: sticky;
      z-index: 3;
      top: -24px;
      margin-bottom: 18px;
      padding: 24px 0 16px;
      background: #09111ef5;
      border-bottom: 1px solid #1e3a52;

      display: flex;
      justify-content: space-between;
      align-items: start;

      p,
      h2 {
        margin: 0;
      }

      p {
        color: #4a98d9;
        font-size: 0.65rem;
        letter-spacing: 0.12em;
      }

      h2 {
        margin-top: 5px;
      }
    }

    button {
      min-height: 38px;
      padding: 7px 12px;
      color: #ffffff;
      background: #122033;
      border: 1px solid #4d6d8c;
      border-radius: 4px;
      font: inherit;
      cursor: pointer;
    }

    h2,
    h3,
    h4 {
      color: #eef8ff;
      font-family: "Orbitron", "Space Mono", sans-serif;
    }
  }

  .introduction,
  .section-description {
    color: #aab9ca;
    line-height: 1.6;
  }

  .workflow,
  .node-section {
    padding: 18px;
    background: #07101c;
    border: 1px solid #1f4059;
  }

  .workflow {
    margin-bottom: 18px;

    ol {
      margin: 14px 0 0 20px;
      display: grid;
      gap: 10px;
    }

    li {
      padding-left: 5px;
      color: #b7c2d3;
      line-height: 1.55;
    }

    strong {
      color: #f8e69a;
    }
  }

  .section-label {
    margin: 0;
    color: #4a98d9;
    font-size: 0.62rem;
    letter-spacing: 0.14em;
  }

  .node-sections {
    display: grid;
    gap: 18px;
  }

  .node-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;

    article {
      padding: 14px;
      background: #0c1726;
      border: 1px solid #36516c;
    }

    article > p {
      color: #b7c2d3;
      line-height: 1.5;
    }
  }

  .node-shape-dialogue {
    border-radius: 0;
  }

  .node-shape-branch {
    border-radius: 18px 18px 0 0;
  }

  .node-shape-ending {
    border-color: #e75858 !important;
    clip-path: polygon(12% 0, 88% 0, 100% 24%, 100% 76%, 88% 100%, 12% 100%, 0 76%, 0 24%);
  }

  .node-shape-minigame {
    border-radius: 22px;
  }

  .node-shape-special,
  .node-shape-label {
    border-style: dashed !important;
  }

  .node-shape-audio {
    border-radius: 0 18px 0 18px;
  }

  .node-shape-image {
    border-radius: 18px 0 18px 0;
  }

  .node-shape-effect {
    border-color: #d88afd !important;
  }

  .badge-row {
    min-height: 20px;
    display: flex;
    gap: 6px;

    span {
      padding: 3px 6px;
      border-radius: 99px;
      font-size: 0.55rem;
      font-weight: 800;
    }

    .companion {
      color: #ffd7f2;
      background: #6f2458;
    }

    .multiplayer {
      color: #cceaff;
      background: #174f79;
    }
  }

  .node-heading {
    margin: 8px 0;
    display: flex;
    justify-content: space-between;
    gap: 12px;

    h4 {
      margin: 0;
    }

    code {
      padding: 3px 6px;
      color: #02fbfb;
      background: #020617;
      border: 1px solid #17455a;
      font-size: 0.63rem;
    }
  }

  .node-usage {
    padding-top: 9px;
    border-top: 1px dashed #36516c;

    strong {
      color: #f8e69a;
    }
  }

  .guide-warning {
    padding: 12px;
    color: #ffdbd6;
    background: #2b1115;
    border: 1px solid #cb381f;
  }

  footer {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid #1e3a52;

    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 18px;

    p {
      color: #94a3b8;
    }

    button {
      color: #06161a !important;
      background: #02fbfb !important;
      border-color: #02fbfb !important;
      font-weight: 800 !important;
    }
  }

  @media (max-width: 700px) {
    .guide-backdrop {
      padding: 10px;
    }

    .editor-guide {
      padding: 18px 14px;
    }

    .node-grid {
      grid-template-columns: 1fr;
    }

    footer {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
