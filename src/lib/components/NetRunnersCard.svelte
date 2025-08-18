<script lang="ts">
  // Hooks
  import { createEventDispatcher } from "svelte";

  // Stores
  import { netRunnersGameState, type NetRunnersGameState } from '../stores/netRunnersGameState';

  // Props
  export let color: 'pink' | 'purple' | 'yellow' | 'cyan' | 'blue' | string | undefined = undefined;
  export let placeholder = false;
  export let compactVersion = false;
  export let largeVersion = false;
  export let canHover = false;
  export let bettingCard = false;
  export let backgroundRepeat = true;
  
  const createEvent = createEventDispatcher();
  $: cardSelected = $netRunnersGameState.p1.colorBet === color;

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

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
{#if placeholder}
  <div class="card card__placeholder" class:no-repeat={!backgroundRepeat}>
      <p class="card-letter-top color-{color}">{setCardLetter(color)[0]}</p>
      <p class="card-letter-bot color-{color}">{setCardLetter(color)[1]}</p>
    </div>
{:else if bettingCard}
  <div class="card card__{color} large-version" class:card__hovered={canHover} class:card__selected={cardSelected} class:no-repeat={!backgroundRepeat}>
    <p class="card-letter-top color-{color}">{setCardLetter(color)[0]}</p>
    <p class="card-letter-bot color-{color}">{setCardLetter(color)[1]}</p>
  </div>
{:else}
  <div class="card card__{color}" class:large-version={largeVersion} class:compact-version={compactVersion} class:card__hovered={canHover} class:no-repeat={!backgroundRepeat}>
    {#if !compactVersion}
      <p class="card-letter-top color-{color}">{setCardLetter(color)[0]}</p>
      <p class="card-letter-bot color-{color}">{setCardLetter(color)[1]}</p>
    {/if}
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
    cursor: default;
    position: relative;
    font-family: "Orbitron", "Space Mono", sans-serif;
    letter-spacing: 2px;
    height: 100px;
    width: 75px;
    padding: 4px;
    border-radius: 4px 20px;
    transition: all 0.2s ease-in-out;
    
    background-position: center;
    background-size: contain;
  }
  
  .card__hovered:hover {
    cursor: pointer;
    scale: 1.1;
  }

  .card__purple {
    border: 4px double $purple;
    background-color: darken($purple, 55%);
    background-image: url('/purple_cougar.png');
    box-shadow: 0 2px 6px $purple;
  }
  
  .card__hovered.card__purple:hover,
  .card__purple.card__selected {
    box-shadow: 0 0 400px 60px $purple;
  }
  
  .card__pink {
    border: 4px double $pink;
    background-color: darken($pink, 45%);
    background-image: url('/pink_mouse.png');
    box-shadow: 0 2px 6px $pink;
  }

  .card__hovered.card__pink:hover,
  .card__pink.card__selected {
    box-shadow: 0 0 400px 60px $pink;
  }
  
  .card__yellow {
    border: 4px double $yellow;
    background-color: darken($yellow, 35%);
    background-image: url('/yellow_monkey.png');
    box-shadow: 0 2px 6px $yellow;
  }

  .card__hovered.card__yellow:hover,
  .card__yellow.card__selected {
    box-shadow: 0 0 400px 60px $yellow;
  }
  
  .card__cyan {
    border: 4px double $cyan;
    background-color: darken($cyan, 35%);
    background-image: url('/cyan_shark.png');
    box-shadow: 0 2px 6px $cyan;
  }

  .card__hovered.card__cyan:hover,
  .card__cyan.card__selected {
    box-shadow: 0 0 400px 60px $cyan;
  }
  
  .card__blue {
    border: 4px double $blue;
    background-color: darken($blue, 35%);
    background-image: url('/blue_eagle.png');
    box-shadow: 0 2px 6px $blue;
  }

  .card__hovered.card__blue:hover,
  .card__blue.card__selected {
    box-shadow: 0 0 400px 60px $blue;
  }

  .card__selected {
    scale: 1.1;
  }

  .card__placeholder {
    border: 4px double #888;
    background-color: #333;
  }

  .compact-version {
    background-image: none;
    height: 50px;
    width: 40px;
    box-shadow: none;
    border-style: solid;
    border-width: 1px;
    border-radius: 8px 24px 4px 6px;
  }

  .large-version {
    height: 125px;
    width: 100px;
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

  .no-repeat {
    background-repeat: no-repeat;
  }
</style>