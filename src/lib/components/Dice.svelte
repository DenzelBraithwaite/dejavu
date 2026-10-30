<script lang="ts">
  import type { PolyhedralDice } from '../stores/dice';

  export let dice: PolyhedralDice;
</script>

<div
  class="dice dice-d{dice.numOfSides}"
  role="img"
  aria-label="One {dice.numOfSides}-sided die"
></div>

<style lang="scss">
  .dice {
    height: 200px;
    width: 200px;
    border: 4px solid #000;
    border-radius: 50%;
    background-repeat: no-repeat;
    background-position: center;
    background-size: 100%;
  }

  .dice-d4 {
    background-image: url('/media/minigames/dice/d4-dice.png');
    background-color: #9dffa652;
  }

  .dice-d6 {
    background-image: url('/media/minigames/dice/d6-dice.png');
    background-color: #6dc2fb52;
  }

  .dice-d8 {
    background-image: url('/media/minigames/dice/d8-dice.png');
    background-color: #fb716d52;
  }

  .dice-d10 {
    background-image: url('/media/minigames/dice/d10-dice.png');
    background-color: #ff75fd52;
  }

  .dice-d12 {
    background-image: url('/media/minigames/dice/d12-dice.png');
    background-color: #9962ff52;
  }

  .dice-d20 {
    background-image: url('/media/minigames/dice/d20-dice.png');
    background-color: #d6a74152;
  }
</style>
