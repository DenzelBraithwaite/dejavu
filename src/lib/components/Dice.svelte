<script lang="ts">
  // Types
  import type { PolyhedralDice } from '../stores/dice';
  // Props
  export let dice: PolyhedralDice;
</script>

<div class="dice dice-d{dice.numOfSides}" role ="img" aria-label="One 4-sided dice"></div>
<!-- PROMPT I USE FOR GENERATING DICE WITH COPILOT
 A single orange 20 sided-sided die with the color code #d6a74152, isolated on a plain background. The die should be centered in the image, well-lit, and clearly show its faces with numbers.
 No other objects or background elements should be present. The style should be clean and realistic, suitable for use as artwork in a dice roll app.
-->
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
    background-image: url('/d4-dice.png');
    background-color: #9dffa652;
  }

  .dice-d6 {
    background-image: url('/d6-dice.png');
    background-color: #6dc2fb52;
  }

  .dice-d8 {
    background-image: url('/d8-dice.png');
    background-color: #fb716d52;
  }

  .dice-d10 {
    background-image: url('/d10-dice.png');
    background-color: #ff75fd52;
  }

  .dice-d12 {
    background-image: url('/d12-dice.png');
    background-color: #9962ff52;
  }

  .dice-d20 {
    background-image: url('/d20-dice.png');
    background-color: #d6a74152;
  }
</style>