<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import {
    richTypewriter,
    typewriterProfiles,
    type TypewriterSegment
  } from '../actions/typewriter';
  import type { DiceRollResult } from '../stores/campaign';
  import { PolyhedralDice } from '../stores/dice';
  import Dice from './Dice.svelte';

  export let die: 4 | 6 | 8 | 10 | 12 | 20;
  export let stat: string;
  export let base: number;
  export let luck: number;
  export let threshold: number;
  export let result: DiceRollResult | undefined = undefined;
  export let spectator = false;
  export let rollerName = 'Player';

  const dispatch = createEventDispatcher<{
    roll: void;
    close: void;
  }>();

  let briefingComplete = false;
  let resultTypingComplete = false;
  let rolling = false;
  let rollTimer: number;
  let lastResultKey = '';

  $: dice = new PolyhedralDice(die, `/media/minigames/dice/d${die}-dice.png`);
  $: briefingSegments = createBriefingSegments();
  $: resultSegments = result ? createResultSegments(result) : [];
  $: resultKey = result
    ? `${result.sceneId}:${result.roll}:${result.total}:${result.successful}`
    : '';
  $: if (result && resultKey !== lastResultKey) {
    lastResultKey = resultKey;
    rolling = false;
    resultTypingComplete = false;
  }

  onDestroy(() => {
    window.clearTimeout(rollTimer);
  });

  function beginRoll(): void {
    if (spectator || !briefingComplete || rolling || result) {
      return;
    }

    rolling = true;
    rollTimer = window.setTimeout(() => {
      dispatch('roll');
    }, 750);
  }

  function createBriefingSegments(): TypewriterSegment[] {
    const segments: TypewriterSegment[] = [
      { text: spectator ? `${rollerName} is rolling a ` : 'You are rolling a ' },
      { text: `D${die}`, className: 'dice-value' },
      { text: spectator ? ' die for their ' : ' die for your ' },
      { text: stat, className: 'stat-value' },
      { text: spectator ? ` stat.\n\n${rollerName}’s ` : ' stat.\n\nYour ' },
      { text: stat, className: 'stat-value' },
      { text: ' base stat is ' },
      { text: String(base), className: 'stat-value' },
      { text: '.\n\n' }
    ];

    if (stat !== 'luck') {
      segments.push(
        { text: spectator ? `${rollerName}’s ` : 'Your ' },
        { text: 'luck', className: 'luck-value' },
        { text: ' stat is ' },
        { text: String(luck), className: 'luck-value' },
        { text: ' and will be added to your total roll.\n\n' }
      );
    }

    segments.push(
      { text: 'You need a total of at least ' },
      { text: String(threshold), className: 'threshold-value' },
      { text: '.' }
    );

    return segments;
  }

  function createResultSegments(rollResult: DiceRollResult): TypewriterSegment[] {
    const segments: TypewriterSegment[] = [
      { text: spectator ? `${rollerName} rolls the die and gets a ` : 'You roll the die and get a ' },
      { text: String(rollResult.roll), className: 'roll-value' },
      { text: '!\n\n' },
      { text: String(rollResult.roll), className: 'roll-value' },
      { text: ' (roll) + ' },
      { text: String(rollResult.base), className: 'stat-value' },
      { text: ` (${rollResult.stat})` }
    ];

    if (rollResult.luck > 0) {
      segments.push(
        { text: ' + ' },
        { text: String(rollResult.luck), className: 'luck-value' },
        { text: ' (luck)' }
      );
    }

    segments.push(
      { text: ' gives you a total of ' },
      { text: String(rollResult.total), className: 'total-value' },
      { text: '.\n\n' },
      {
        text: spectator
          ? rollResult.successful
            ? `${rollerName} was successful.`
            : `${rollerName} was unsuccessful.`
          : rollResult.successful
            ? 'You were successful.'
            : 'You were unsuccessful.',
        className: rollResult.successful ? 'outcome-success' : 'outcome-failure'
      }
    );

    return segments;
  }
</script>

<div class="dice-terminal-backdrop" transition:fade={{ duration: 180 }}>
  <section
    class="dice-terminal"
    transition:scale={{ duration: 220, start: 0.94 }}
    role="dialog"
    aria-modal="true"
    aria-labelledby="dice-terminal-title"
  >
    <header class="dice-terminal-header">
      <span id="dice-terminal-title">DEJAVU://DICE_PROTOCOL</span>
      <strong class="dice-value">D{die}</strong>
    </header>

    <div class="dice-terminal-body">
      <div
        class="dice-wrapper"
        class:rolling
        class:rolled={Boolean(result)}
        aria-hidden="true"
      >
        <Dice {dice} />
      </div>

      <div class="terminal-text">
        {#if result}
          <p
            use:richTypewriter={{
              segments: resultSegments,
              timing: typewriterProfiles.system,
              onComplete: () => resultTypingComplete = true
            }}
            aria-live="polite"
          ></p>
        {:else}
          <p
            use:richTypewriter={{
              segments: briefingSegments,
              timing: typewriterProfiles.system,
              onComplete: () => briefingComplete = true
            }}
            aria-live="polite"
          ></p>
        {/if}
      </div>

    </div>

    <footer class="dice-terminal-controls">
      {#if spectator}
        <button type="button" disabled>
          {result ? `Waiting for ${rollerName} to continue` : `Watching ${rollerName} roll`}
        </button>
      {:else if result}
        <button
          type="button"
          disabled={!resultTypingComplete}
          on:click={() => dispatch('close')}
        >
          Close terminal
        </button>
      {:else}
        <button
          type="button"
          disabled={!briefingComplete || rolling}
          on:click={beginRoll}
        >
          {rolling ? 'Rolling...' : `Roll D${die}`}
        </button>
      {/if}

    </footer>
  </section>
</div>

<style lang="scss">
  .dice-terminal-backdrop {
    position: absolute;
    z-index: 20;
    inset: 0;
    padding: clamp(18px, 5vw, 70px);
    background: #020617d9;
    backdrop-filter: blur(4px);

    display: grid;
    place-items: center;
  }

  .dice-terminal {
    position: relative;
    width: min(820px, 100%);
    max-height: 100%;
    overflow: hidden;
    color: #e8edf6;
    background: #121826;
    border: 2px solid #e8edf6;
    border-radius: 6px;
    box-shadow:
      0 0 45px #4a98d966,
      inset 0 0 32px #00000099;

    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;

    &::after {
      content: '';
      position: absolute;
      z-index: -1;
      inset: 38px 0 0;
      background-image: url('/media/minigames/dice/dice.png');
      background-position: center;
      background-repeat: repeat;
      opacity: 0.035;
    }
  }

  .dice-terminal-header {
    min-height: 40px;
    padding: 9px 14px;
    color: #02fbfb;
    background: #202b40;
    border-bottom: 1px solid #4a98d9;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: 0.75rem;
    letter-spacing: 2px;

    display: flex;
    justify-content: space-between;
  }

  .dice-terminal-body {
    padding: 22px;
    overflow-y: auto;
  }

  .dice-wrapper {
    margin-bottom: 20px;

    display: flex;
    justify-content: center;
  }

  .dice-wrapper.rolling {
    animation: dice-shake 180ms ease-in-out infinite;
  }

  .dice-wrapper.rolled {
    animation: dice-settle 700ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .terminal-text {
    min-height: 220px;
    padding: 18px;
    overflow-wrap: break-word;
    background: #0000004f;
    border: 1px solid #334155;
    border-radius: 4px;
    box-shadow: inset 0 0 10px #00000094;

    p {
      line-height: 1.6;
      white-space: pre-wrap;
    }

    :global(.dice-value) {
      color: #02fbfb;
      font-weight: 800;
    }

    :global(.stat-value) {
      color: #9dffa6;
      font-weight: 800;
    }

    :global(.luck-value) {
      color: #ff75fd;
      font-weight: 800;
    }

    :global(.threshold-value) {
      color: #f8e69a;
      font-weight: 800;
    }

    :global(.roll-value) {
      color: #fb716d;
      font-weight: 800;
    }

    :global(.total-value) {
      color: #6dc2fb;
      font-weight: 800;
    }

    :global(.outcome-success) {
      color: #9dffa6;
      font-weight: 800;
    }

    :global(.outcome-failure) {
      color: #e58271;
      font-weight: 800;
    }
  }

  .dice-terminal-controls {
    padding: 14px;
    background: #0c1322;
    border-top: 1px solid #334155;

    display: grid;
    gap: 6px;

    button {
      width: 100%;
      min-height: 48px;
      color: #e8edf6;
      background: #101a2d;
      border: 1px solid #4a98d9;
      border-radius: 4px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;

      &:hover:not(:disabled),
      &:focus-visible {
        color: #07111d;
        background: #02fbfb;
        outline: 2px solid #ffffff;
        outline-offset: 2px;
      }

      &:disabled {
        cursor: not-allowed;
        opacity: 0.48;
      }
    }

  }

  @keyframes dice-shake {
    0%,
    100% {
      transform: translateX(-5px) rotate(-4deg);
    }

    50% {
      transform: translateX(5px) rotate(4deg);
    }
  }

  @keyframes dice-settle {
    0% {
      transform: rotate(-18deg) scale(0.84);
    }

    45% {
      transform: rotate(16deg) scale(1.08);
    }

    70% {
      transform: rotate(-8deg) scale(0.96);
    }

    100% {
      opacity: 1;
      transform: rotate(0) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dice-wrapper.rolling,
    .dice-wrapper.rolled {
      animation: none;
    }
  }
</style>
