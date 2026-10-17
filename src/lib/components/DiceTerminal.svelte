<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { typewriter, typewriterProfiles } from '../actions/typewriter';
  import type { DiceRollResult } from '../stores/campaign';
  import { PolyhedralDice } from '../stores/dice';
  import Dice from './Dice.svelte';

  export let result: DiceRollResult;

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  let resultTextElement: HTMLElement;
  let typingComplete = false;

  $: dice = new PolyhedralDice(result.die, `/d${result.die}-dice.png`);
  $: outcome = result.successful ? 'You were successful.' : 'You were unsuccessful.';
  $: resultText = [
    `You are rolling a D${result.die} die for your ${result.stat} stat.`,
    `Your ${result.stat} base stat is ${result.base}.`,
    `Your luck stat is ${result.luck} and will be added to your total roll.`,
    `You need a total of at least ${result.threshold}.`,
    `You roll the die and get a ${result.roll}!`,
    `${result.roll} (roll) + ${result.base} (${result.stat}) + ${result.luck} (luck) gives you a total of ${result.total}.`,
    outcome
  ].join('\n\n');

  function skipTyping(): void {
    resultTextElement?.dispatchEvent(new CustomEvent('typewriterskip'));
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
      <span>D{result.die}</span>
    </header>

    <div class="dice-terminal-body">
      <div class="dice-wrapper" aria-hidden="true">
        <Dice {dice} />
      </div>

      <div class="terminal-text">
        <p
          class:successful={result.successful}
          class:unsuccessful={!result.successful}
          bind:this={resultTextElement}
          use:typewriter={{
            text: resultText,
            timing: typewriterProfiles.system,
            onComplete: () => typingComplete = true
          }}
          aria-live="polite"
        ></p>
      </div>

    </div>

    <footer class="dice-terminal-controls">
      <button
        type="button"
        disabled={!typingComplete}
        on:click={() => dispatch('close')}
      >
        Close terminal
      </button>

      {#if !typingComplete}
        <button class="skip-button" type="button" on:click={skipTyping}>
          Skip typing
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
      background-image: url('/dice.png');
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
    animation: dice-roll 900ms cubic-bezier(0.2, 0.8, 0.2, 1);

    display: flex;
    justify-content: center;
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

    .successful::first-line {
      color: #e8edf6;
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

    button.skip-button {
      justify-self: center;
      width: auto;
      min-height: auto;
      padding: 3px 8px;
      color: #94a3b8;
      background: transparent;
      border: 0;
      font-size: 0.72rem;
      font-weight: 400;
      text-decoration: underline;
    }
  }

  @keyframes dice-roll {
    0% {
      opacity: 0;
      transform: rotate(-18deg) scale(0.5);
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
    .dice-wrapper {
      animation: none;
    }
  }
</style>
