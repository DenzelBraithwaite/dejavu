<script lang="ts">
  // Props
  export let color: 'pink' | 'purple' | 'yellow' | 'cyan' | 'blue' | string | undefined = undefined;
  export let placeholder = false;

  // Based on color, determines what letter the card should display in corners.
  function setCardLetter(color: 'pink' | 'purple' | 'yellow' | 'cyan' | 'blue' | string = ''): 'PC' | 'PM' | 'YM' | 'CS' | 'BE' | '**' {
    if (color === 'purple') return 'PC';
    if (color === 'pink') return 'PM';
    if (color === 'yellow') return 'YM';
    if (color === 'cyan') return 'CS';
    if (color === 'blue') return 'BE';

    return '**'
  }
</script>

{#if placeholder}
  <div class="card card__placeholder">
      <p class="card-letter-top color-{color}">{setCardLetter(color)[0]}</p>
      <p class="card-letter-bot color-{color}">{setCardLetter(color)[1]}</p>
    </div>
{:else}
  <div class="card card__{color}">
    <p class="card-letter-top color-{color}">{setCardLetter(color)[0]}</p>
    <p class="card-letter-bot color-{color}">{setCardLetter(color)[1]}</p>
  </div>
{/if}

<style lang="scss">
  @use 'sass:color';
  $purple: #9962ff;
  $pink: #F837CD;
  $yellow: #F2D40E;
  $cyan: #02FBFB;
  $blue: #0779FC;

  .card {
    position: relative;
    font-family: "Orbitron", "Space Mono", sans-serif;
    letter-spacing: 2px;
    height: 150px;
    width: 100px;
    padding: 4px;
    border-radius: 4px 20px;

    background-position: center;
    background-size: contain;
    // background-repeat: no-repeat;
  }

  .card__purple {
    border: 4px double $purple;
    background-color: darken($purple, 55%);
    background-image: url('/purple_cougar.png');
    box-shadow: 0 2px 6px $purple;
  }
  
  .card__pink {
    border: 4px double $pink;
    background-color: darken($pink, 45%);
    background-image: url('/pink_mouse.png');
    box-shadow: 0 2px 6px $pink;
  }
  
  .card__yellow {
    border: 4px double $yellow;
    background-color: darken($yellow, 35%);
    background-image: url('/yellow_monkey.png');
    box-shadow: 0 2px 6px $yellow;
  }
  
  .card__cyan {
    border: 4px double $cyan;
    background-color: darken($cyan, 35%);
    background-image: url('/cyan_shark.png');
    box-shadow: 0 2px 6px $cyan;
  }
  
  .card__blue {
    border: 4px double $blue;
    background-color: darken($blue, 35%);
    background-image: url('/blue_eagle.png');
    box-shadow: 0 2px 6px $blue;
  }

  .card__placeholder {
    border: 4px double #888;
    background-color: #333;
  }

  .card-letter-top {
    font-size: 1.25rem;
    font-weight: bold;
    position: absolute;
    top: 4px;
    left: 4px;
  }
  
  .card-letter-bot {
    font-size: 1.25rem;
    font-weight: bold;
    position: absolute;
    bottom: 4px;
    right: 4px;
  }

  // Some overwrite app.scss
  .color-purple {
    color: $purple;
    text-shadow: 0 0 4px $purple;
  }
  
  .color-pink {
    color: $pink;
    text-shadow: 0 0 4px $pink;
  }

  .color-yellow {
    color: $yellow;
    text-shadow: 0 0 4px $yellow;
  }
  
  .color-cyan {
    color: $cyan;
    text-shadow: 0 0 4px $cyan;
  }

  .color-blue {
    color: $blue;
    text-shadow: 0 0 4px $blue;
  }
</style>