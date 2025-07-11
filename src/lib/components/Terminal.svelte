<script lang="ts">
  // Hooks
  import { onMount } from 'svelte';

  // Transitions
  import { blur } from 'svelte/transition';

  // Modules/Helpers
  import Typed from 'typed.js';

  // stores
  import { type Writable } from 'svelte/store';
  import { socket } from '../stores/socket';
  import { getNextDialogue, updateDialogueOptions, type DialogueOptions, chapter, chapterPart } from '../stores/terminalMessages';
  import { player1, player2, type Player } from '../stores/players';
  import { PolyhedralDice, d4Dice, d6Dice, d8Dice, d10Dice, d12Dice, d20Dice } from '../stores/dice';

  // Components
  import { Button, DiceTerminal } from '.';

  // Props
  export let terminalColor: 'grey' | 'green' | 'blue' = 'grey';
  export let currentGameState: any; // update later
  export let dialogueOptions: Writable<DialogueOptions>;
  export let updateTerminalReqFromParent = false;

  let typed: Typed;
  let userInput = '';
  let currentDisplayedMessage = getNextDialogue({chapter: $chapter, part: $chapterPart, player: returnPlayer()});
  let dice: PolyhedralDice = d8Dice;
  let playerStat: keyof Player['stats'];
  let statThreshold = 0;
  $: userInputMaxLength = $chapter === 'lobby' ? 20 : 200;

  // Exception that only occurs once, dialogueOptions usually updated by upadteDialogueOptions()
  $: if ($currentGameState.bothPlayersJoined && $chapter === 'lobby' && $chapterPart === '1') {
    dialogueOptions.set({...$dialogueOptions, 
      option1Disabled: false,
      option1: 'Ready'
    })
  }

  $: if ($currentGameState.goToChapter6 && $chapter === 'lobby' && $chapterPart === '5') {
    updateTerminal(0);
  }

  $: if ($chapter === 'lobby' && $chapterPart === '12') {
    playerStat = 'defense';
    statThreshold = 7;
  }

  $: if ($chapter === 'lobby' && $chapterPart === '14') {
    playerStat = 'strength';
    statThreshold = 40;
    dice = d20Dice;
  }

  $: if (updateTerminalReqFromParent && $chapter === '1' && ['3', '4'].includes($chapterPart)) {
    updateTerminal(1);
    updateTerminalReqFromParent = false;
  }

  onMount(() => {
    typed = new Typed('#terminal-text', {
      strings: currentDisplayedMessage,
      typeSpeed: 20,
      // backSpeed: 20,
      // startDelay: 1000,
      // backDelay: 3000,
      // loop: false,
      // loopCount: Infinity
    });
  });

  function updateTerminal(optionSelected: number, destroyLog = false): void {
    updateDialogueOptions({player: returnPlayer(), chapter: $chapter, part: $chapterPart, optionSelected});
    // cleans last terminal instance, otherwise they stack.
    typed.destroy();
    typed = new Typed('#terminal-text', {
      strings: getNextDialogue({chapter: $chapter, part: $chapterPart, player: returnPlayer(), optionSelected}),
      typeSpeed: 20,
      backSpeed: 10,
      // startDelay: 1000,
      backDelay: 2000,
      // loop: false,
      // loopCount: Infinity
    });
  }

  function returnPlayer(): Player {
    return $currentGameState.playingAs === 'male' ? $player1 : $player2;
  }
  
  function handleUserInput(): void {
    if ($chapter === 'lobby' && $chapterPart === '3' || $chapterPart === '3-again') {
     $currentGameState.playingAs === 'male' ? socket.emit('set-male-player-name', userInput.trim()) : socket.emit('set-female-player-name', userInput.trim());
    }

    currentGameState.set({...$currentGameState, userDialogue: userInput.trim()});
  }
</script>

<div transition:blur={{duration: 1000}} class="terminal terminal__{terminalColor}">
  <div class="terminal-screen">
    <p>Chapter {$chapter}: part {$chapterPart}</p>
    <p id="terminal-text"></p>
    {#if $currentGameState.showDiceTerminal}
      <DiceTerminal {currentGameState} {dice} {playerStat} {statThreshold}/>
    {/if}
  </div>
  <div class="terminal-option-flex-group">
    {#if $dialogueOptions.option1Visible}
      <Button btnType="terminal-option" disabled={$dialogueOptions.option1Disabled} on:click={() => updateTerminal(1)}>{$dialogueOptions.option1}</Button>
    {/if}

    {#if $dialogueOptions.option2Visible}
      <Button btnType="terminal-option" disabled={$dialogueOptions.option2Disabled} on:click={() => updateTerminal(2)}>{$dialogueOptions.option2}</Button>
    {/if}

    {#if $dialogueOptions.option3Visible}
      <Button btnType="terminal-option" disabled={$dialogueOptions.option3Disabled} on:click={() => updateTerminal(3)}>{$dialogueOptions.option3}</Button>
    {/if}

    {#if $dialogueOptions.inputVisible}
      <input bind:value={userInput} on:input={handleUserInput} type="text" maxlength={userInputMaxLength} class="terminal-input">
    {/if}
  </div>
</div>

<style lang="scss">
  $terminalBg: #121212;

  .terminal {
    position: relative;
    background-color: $terminalBg;
    height: 100%;
    max-height: 95vh;
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
    position: relative;
    height: 90%;
    width: 100%;
    min-width: 400px;
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

 .dice-screen {
    background-color: lighten($terminalBg, 10%);
    height: 80%;
    width: 80%;
    border: 2px solid var(--white);
    border-top-width: 24px;
    border-radius: var(--border-radius-small);
    padding: 8px;
    overflow-wrap: break-word;
    transition: all 0.5s ease-out;
    margin-bottom: 20px;
    
    position: absolute;
    top: 10%;
    right: 50%;
    transform: translateX(50%);
    
    &::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: 100%;
      background-image: url('/dice.png');
      background-repeat: no-repeat;
      background-position: center;
      background-size: auto;
      opacity: 0.15;
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