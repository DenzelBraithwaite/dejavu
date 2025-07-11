<script lang="ts">
  // Hooks
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';

  // Modules/Helpers
  import Typed from 'typed.js';

  // Stores
  import { player1, player2, type Player } from '../stores/players';
  import { dialogueOptions, getNextDiceDialogue } from '../stores/terminalMessages';

  // Types
  import type { PolyhedralDice } from '../stores/dice';

  // Components
  import { Button, Dice } from '../components';

  // Props
  export let dice: PolyhedralDice;
  export let currentGameState: any; // update later
  export let playerStat: keyof Player['stats'];
  export let statThreshold: number;

  let typed: Typed;
  // I need to declare it as empty because otherwise the terminal will start populated with text, then delete, then it will retype.
  let currentDisplayedMessage = [''];

    onMount(() => {
      currentDisplayedMessage = getNextDiceDialogue({player: returnPlayer(), dice, stat: playerStat, threshold: statThreshold})
      typed = new Typed('#dice-terminal-text', {
      strings: currentDisplayedMessage,
      typeSpeed: 30,
      backSpeed: 10,
      // startDelay: 1000,
      backDelay: 2000,
      // loop: false,
      // loopCount: Infinity
    });
  });

  function returnPlayer(): Player {
    return $currentGameState.playingAs === 'male' ? $player1 : $player2;
  }

  function closeDiceTerminal(): void {
    currentGameState.set({...$currentGameState, showDiceTerminal: false});
      dialogueOptions.set({
      option1Visible: true,
      option1Disabled: false,
      option1: 'Next',
      option2Visible: false,
      option2Disabled: true,
      option2: '',
      option3Visible: false,
      option3Disabled: true,
      option3: '',
      inputVisible: false
    });
  }
</script>

<div transition:fade class="dice-terminal">
  <div class="dice-wrapper">
    <Dice {dice}/>
  </div>

  <div class="terminal-text">
    <p id="dice-terminal-text">{@html currentDisplayedMessage}</p>
  </div>

  <div class="terminal-btn">
    <Button btnType="terminal-option" on:click={closeDiceTerminal}>Okay</Button>
  </div>
</div>

<style lang="scss">
  $terminalBg: #121212;

 .dice-terminal {
    font-size: 1.125rem;
    background-color: lighten($terminalBg, 10%);
    height: 80%;
    width: 80%;
    border: 2px solid var(--white);
    border-top-width: 24px;
    border-radius: var(--border-radius-small);
    padding: 12px;
    overflow-wrap: break-word;
    transition: all 0.5s ease-out;
    
    position: absolute;
    top: 10%;
    right: 50%;
    transform: translateX(50%);
    
    &::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      height: 85%;
      width: 100%;
      background-image: url('/dice.png');
      background-repeat: repeat;
      background-position: center;
      background-size: auto;
      opacity: 0.035;
      z-index: -1; // May block interactive UI elements
    }
 }

 .terminal-text {
  height: 50%;
  background-color: #00000038;
  border-radius: 4px;
  box-shadow: inset 0 0px 10px #00000094;
  padding: 8px;
 }

 .dice-wrapper {
  margin-bottom: 20px;
  display: flex;
  justify-content: center;
  align-content: center;
 }

 .terminal-btn {
  position: absolute;
  bottom: 10px;
  right: 50%;
  transform: translateX(50%);
  width: 50%;
 }
</style>