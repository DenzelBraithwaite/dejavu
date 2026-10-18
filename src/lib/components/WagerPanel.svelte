<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let wager = 0;
  export let balance = 0;
  export let accent = '#55f09a';
  export let title = 'LOCK YOUR WAGER';
  export let actionLabel = 'LOCK WAGER';

  const dispatch = createEventDispatcher<{ confirm: number; cancel: void }>();

  function adjust(amount: number): void {
    wager = Math.min(balance, Math.max(0, wager + amount));
  }
</script>

<section class="wager-panel" style={`--wager-accent: ${accent}`}>
  <p class="eyebrow">CREDIT LINK</p>
  <h2>{title}</h2>
  <p class="explanation">
    A 0₭ wager is always available and awards 100₭ on a win. Paid wagers pay
    even money unless the game states otherwise.
  </p>

  <div class="readout" aria-live="polite">
    <span>WAGER</span>
    <strong>{wager}₭</strong>
    <small>AVAILABLE {balance}₭</small>
  </div>

  <div class="controls" aria-label="Adjust wager">
    {#each [-1000, -100, -10, -1, 1, 10, 100, 1000] as amount}
      <button type="button" on:click={() => adjust(amount)}>
        {amount > 0 ? `+${amount}` : amount}
      </button>
    {/each}
  </div>

  <div class="actions">
    <button type="button" on:click={() => dispatch('cancel')}>CANCEL</button>
    <button class="confirm" type="button" on:click={() => dispatch('confirm', wager)}>
      {actionLabel}
    </button>
  </div>
</section>

<style lang="scss">
  .wager-panel {
    width: min(620px, 92vw);
    padding: clamp(22px, 4vw, 38px);
    color: #e9fff2;
    background: #060c0f;
    border: 1px solid var(--wager-accent);
    box-shadow: 0 0 28px color-mix(in srgb, var(--wager-accent) 24%, transparent);
    text-align: center;
  }

  .eyebrow {
    margin: 0;
    color: var(--wager-accent);
    font-size: 0.72rem;
    letter-spacing: 3px;
  }

  h2 {
    margin: 8px 0;
    color: var(--wager-accent);
    font-family: "Orbitron", "Space Mono", sans-serif;
  }

  .explanation {
    margin: 0 auto 20px;
    max-width: 54ch;
    color: #9eb1b9;
    line-height: 1.55;
  }

  .readout {
    padding: 15px;
    background: #020608;
    border: 1px solid color-mix(in srgb, var(--wager-accent) 48%, transparent);

    display: grid;
    gap: 4px;

    span,
    small {
      color: #8fa5ae;
      letter-spacing: 1.5px;
    }

    strong {
      color: var(--wager-accent);
      font-size: 2.4rem;
    }
  }

  .controls {
    margin: 14px 0;

    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 7px;
  }

  button {
    min-height: 38px;
    color: var(--wager-accent);
    background: #0b1417;
    border: 1px solid color-mix(in srgb, var(--wager-accent) 58%, transparent);
    cursor: pointer;
  }

  button:hover,
  button:focus-visible,
  .confirm {
    color: #020607;
    background: var(--wager-accent);
    border-color: #ffffff;
  }

  .actions {
    display: grid;
    grid-template-columns: auto minmax(180px, 1fr);
    gap: 8px;
  }

  .confirm {
    font-weight: bold;
    letter-spacing: 1px;
  }

  @media (max-width: 560px) {
    .controls {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
