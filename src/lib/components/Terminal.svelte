<script lang="ts">
  // Hooks
  import { onMount } from 'svelte';

  // Transitions
  import { blur } from 'svelte/transition';

  // Modules/Helpers
  import Typed from 'typed.js';

  // stores
  import { getNextDialogue, updateDialogueOptions, chapter, chapterPart } from '../stores/terminalMessages';

  // Components
  import { Button } from '.';

  // Props
  export let terminalColor: 'grey' | 'green' | 'blue' = 'grey';
  export let gameStarted = false;

  let typed: Typed;
  let currentDisplayedMessage = getNextDialogue($chapter, $chapterPart);
  let dialogueOptions = updateDialogueOptions($chapter, $chapterPart);

  $: if (gameStarted && $chapter === 'lobby' && $chapterPart === '1a') {
    chapter.set('1');
    updateTerminal(0, false, true);
  }

  onMount(() => {
    typed = new Typed('#terminal-text', {
      strings: currentDisplayedMessage,
      typeSpeed: 20,
    });
  });

  function updateTerminal(optionSelected: number, destroyLog = false, newGame = false): void {
    dialogueOptions = updateDialogueOptions($chapter, $chapterPart, optionSelected);
    if (newGame) chapterPart.set('1a'); // avoids jumping to part 2a after updateDialogOptions() in terminalMessages.ts

    // cleans last terminal instance, otherwise they stack.
    typed.destroy();
    typed = new Typed('#terminal-text', {
      strings: getNextDialogue($chapter, $chapterPart, optionSelected),
      typeSpeed: 20,
    });
  }
</script>

<div transition:blur={{duration: 1000}} class="terminal terminal__{terminalColor}">
  <div class="terminal-screen">
    <p id="terminal-text"></p>
  </div>
  <div class="terminal-option-flex-group">
    {#if dialogueOptions.option1Visible}
      <Button btnType="terminal-option" on:click={() => updateTerminal(1)}>{dialogueOptions.option1}</Button>
    {/if}

    {#if dialogueOptions.option2Visible}
      <Button btnType="terminal-option" on:click={() => updateTerminal(2)}>{dialogueOptions.option2}</Button>
    {/if}

    {#if dialogueOptions.option3Visible}
      <Button btnType="terminal-option" on:click={() => updateTerminal(3)}>{dialogueOptions.option3}</Button>
    {/if}
  </div>
</div>

<style lang="scss">
  .terminal {
    position: relative;
    background-color: #121212;
    height: 100%;
    width: 100%;
    border: 2px solid var(--white);
    border-top-width: 24px;
    border-radius: var(--border-radius-small);
    padding: 8px;
    overflow-wrap: break-word;
    transition: all 0.5s ease-out;
    margin-bottom: 20px;

    display: flex;
    flex-direction: column;
  }
  
  .terminal-screen {
    height: 90%;
    width: 100%;
    border-radius: 24px;
    padding: 12px;
    overflow-y: scroll;
    box-shadow: inset -4px 0 20px #00000086;
  }

  #terminal-text {
    text-wrap: wrap;
    font-size: 1.25rem;
    width: 100%;
  }

  // v--Terminal colors--v
  .terminal__grey {
    border: 6px solid #ddd;
    border-top: 16px solid #ddd;
    background-color: #111111;
    
    .terminal-screen::-webkit-scrollbar-track {
      background-color: #111111;
    }

    .terminal-screen::-webkit-scrollbar-thumb {
      background: #ddd;
      border-radius: 4px;
    }
  }

  .terminal__green {
    background-color: #05180b;
    border: 6px solid #279821;
    border-top: 16px solid #279821;

    .terminal-screen::-webkit-scrollbar-track {
      background-color: #05180b;
    }

    .terminal-screen::-webkit-scrollbar-thumb {
      background: #279821;
      border-radius: 4px;
    }
  }

  .terminal__blue {
    background-color: #071424;
    border: 6px solid #215798;
    border-top: 16px solid #215798;
    
    .terminal-screen::-webkit-scrollbar-track {
      background-color: #071424;
    }

    .terminal-screen::-webkit-scrollbar-thumb {
      background: #215798;
      border-radius: 4px;
    }
  }

  // ^--Terminal colors--^

  // Utility //
  .terminal-screen::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

</style>