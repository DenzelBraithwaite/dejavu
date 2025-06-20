<script lang="ts">
  // Hooks

  // Transitions

  // Modules/Helpers

  // stores
  import { d4Dice, d6Dice, d8Dice, d10Dice, d12Dice, d20Dice } from '../stores/dice';

  // Components

  // Props

</script>

<div class="dice-screen">
<img src="{$d4Dice.imgUrl}" alt="4 sided dice.">
</div>

<style lang="scss">
  $terminalBg: #121212;

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
</style>