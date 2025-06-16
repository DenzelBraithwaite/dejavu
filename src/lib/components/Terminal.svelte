<script lang="ts">
  // Hooks
  import { onMount } from 'svelte';

  // Transitions
  import { blur } from 'svelte/transition';

  // Modules/Helpers
  import Typed from 'typed.js';

  // stores
  import { getNextDialogue, updateDialogueOptions, type DialogueOptions, chapter, chapterPart } from '../stores/terminalMessages';
  import { player1, player2, type Player } from '../stores/players';

  // Components
  import { Button } from '.';

  // Props
  export let terminalColor: 'grey' | 'green' | 'blue' = 'grey';
  export let bothPlayersJoined = false;
  export let playingAs: 'male' | 'female' | '' = '';

  let typed: Typed;
  let userInput = '';
  let currentDisplayedMessage = getNextDialogue({chapter: $chapter, part: $chapterPart, player: returnPlayer()});
  let dialogueOptions: DialogueOptions = {
      option1Visible: true,
      option1Disabled: true,
      option1: 'Waiting...',
      option2Visible: false,
      option2Disabled: false,
      option2: '',
      option3Visible: false,
      option3Disabled: false,
      option3: '',
      inputVisible: false
    };

  // Exception that only occurs once, dialogueOptions usually updated by upadteDialogueOptions()
  $: if (bothPlayersJoined && $chapter === 'lobby' && $chapterPart === '1a') {
    dialogueOptions.option1Disabled = false;
    dialogueOptions.option1 = 'Ready';
  }

  onMount(() => {
    typed = new Typed('#terminal-text', {
      strings: currentDisplayedMessage,
      typeSpeed: 20,
    });
  });

  function updateTerminal(optionSelected: number, destroyLog = false): void {
    dialogueOptions = updateDialogueOptions($chapter, $chapterPart, optionSelected);

    // cleans last terminal instance, otherwise they stack.
    typed.destroy();
    typed = new Typed('#terminal-text', {
      strings: getNextDialogue({chapter: $chapter, part: $chapterPart, player: returnPlayer(), optionSelected}),
      typeSpeed: 20,
    });
  }

  function returnPlayer(): Player {
    return playingAs === 'male' ? $player1 : $player2;
  }
  
  function handleUserInput(): void {
    if ($chapter === 'lobby' && $chapterPart === '3a') {
     playingAs === 'male' ? player1.set({...$player1, name: userInput}) : player2.set({...$player2, name: userInput});
    }
  }
</script>

<div transition:blur={{duration: 1000}} class="terminal terminal__{terminalColor}">
  <div class="terminal-screen">
    <p id="terminal-text"></p>
  </div>
  <div class="terminal-option-flex-group">
    {#if dialogueOptions.option1Visible}
      <Button btnType="terminal-option" disabled={dialogueOptions.option1Disabled} on:click={() => updateTerminal(1)}>{dialogueOptions.option1}</Button>
    {/if}

    {#if dialogueOptions.option2Visible}
      <Button btnType="terminal-option" disabled={dialogueOptions.option2Disabled} on:click={() => updateTerminal(2)}>{dialogueOptions.option2}</Button>
    {/if}

    {#if dialogueOptions.option3Visible}
      <Button btnType="terminal-option" disabled={dialogueOptions.option3Disabled} on:click={() => updateTerminal(3)}>{dialogueOptions.option3}</Button>
    {/if}

    {#if dialogueOptions.inputVisible}
      <input bind:value={userInput} on:input={handleUserInput} type="text" maxlength="20" class="terminal-input">
    {/if}
  </div>
</div>

<style lang="scss">
  $terminalBg: #121212;

  .terminal {
    position: relative;
    background-color: $terminalBg;
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

  .terminal-input {
    width: 100%;
    padding: 0.5rem 1rem;
    border: 2px solid var(--white);
    color: var(--white);
    text-align: center;
    border-radius: var(--border-radius-small);
    background-color: $terminalBg;
    transition: all 0.3s ease-out;
    font-weight: bold;

    &:hover {
      border: 2px solid var(--slate-900);
      color: var(--slate-900);
      background-color: var(--white);
      border-style: double;
      border-width: 4px;
    }
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