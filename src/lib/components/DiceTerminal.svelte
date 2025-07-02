<script lang="ts">
  // Hooks
  import { onMount } from 'svelte';

  // Modules/Helpers
  import Typed from 'typed.js';

  // Stores
  import { player1, player2, type Player } from '../stores/players';
  import { getNextDiceDialogue } from '../stores/terminalMessages';

  // Types
  import type { PolyhedralDice } from '../stores/dice';

  // Components
  import { Dice } from '../components';

  // Props
  export let dice: PolyhedralDice;
  export let gameData: any; // update later

  let typed: Typed;
  let currentDisplayedMessage = getNextDiceDialogue({player: returnPlayer(), dice, stat: 'health'});

    onMount(() => {
    typed = new Typed('#dice-terminal-text', {
      strings: currentDisplayedMessage,
      typeSpeed: 20,
      backSpeed: 10,
      // startDelay: 1000,
      backDelay: 2000,
      // loop: false,
      // loopCount: Infinity
    });
  });

  function returnPlayer(): Player {
    return gameData.playingAs === 'male' ? $player1 : $player2;
  }
</script>

<div class="dice-screen">
  <div class="dice-wrapper">
    <Dice {dice}/>
  </div>
  <p id="dice-terminal-text">{@html currentDisplayedMessage}</p>
</div>

<style lang="scss">
  $terminalBg: #121212;

 .dice-screen {
    font-size: 1.125rem;
    background-color: lighten($terminalBg, 10%);
    height: 80%;
    width: 80%;
    border: 2px solid var(--white);
    border-top-width: 24px;
    border-radius: var(--border-radius-small);
    padding: 25% 12px 12px 12px;
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
      height: 100%;
      width: 100%;
      background-image: url('/dice.png');
      background-repeat: repeat;
      background-position: center;
      background-size: auto;
      opacity: 0.035;
    }
 }

 .dice-wrapper {
  position: absolute;
  top: 5%;
  right: 50%;
  transform: translateX(50%);
 }
</style>