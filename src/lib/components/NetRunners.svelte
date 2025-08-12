<script lang="ts">
  // Hooks
  import { createEventDispatcher } from 'svelte';

  // Transitions
  import { blur } from 'svelte/transition';

  // stores
  import { type Writable } from 'svelte/store';
  import { socket } from '../socket';
  import { player1, player2, type Player } from '../stores/players';
  import { type GameState, currentGameState } from '../stores/gameState';

  // Props
  export let location: Writable<string>;

  const createEvent = createEventDispatcher();
  const player: Player = returnPlayer();

  function returnPlayer(): Player {
    return $currentGameState.playingAs === 'male' ? $player1 : $player2;
  }
</script>

<div transition:blur={{duration: 1000}} class="terminal" class:hide={$location !== 'netrunners'}>
  <div class="terminal-screen">
    <h1>NetRunners</h1>
    <br>
    <p><span class="color-cornflower-blue">Association:</span> Solid States</p>
    <p><span class="color-cornflower-blue">Name:</span> {player.name}</p>
    <p><span class="color-cornflower-blue">Muscles:</span> {player.stats.muscles}</p>
    <p><span class="color-cornflower-blue">Toughness:</span> {player.stats.toughness}</p>
    <p><span class="color-cornflower-blue">Speed:</span> {player.stats.speed}</p>
    <p><span class="color-cornflower-blue">Stealth:</span> {player.stats.stealth}</p>
    <p><span class="color-cornflower-blue">Smarts:</span> {player.stats.smarts}</p>
    <p><span class="color-cornflower-blue">Ocuware:</span> {player.stats.ocuware}</p>
    <p><span class="color-cornflower-blue">Cred:</span> {player.stats.cred}</p>
    <p><span class="color-cornflower-blue">Luck:</span> {player.stats.luck}</p>
    <p><span class="color-cornflower-blue">Hacking:</span> {player.stats.hacking}</p>
  </div>
</div>

<style lang="scss">
  $terminalBg: #453b82;

  .terminal {
    position: relative;
    background-color: $terminalBg;
    height: 100%;
    max-height: 95vh;
    width: 100%;
    max-width: 1100px; // 
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
    height: 100%;
    width: 100%;
    min-width: 400px;
    border-radius: 24px;
    padding: 12px;
    overflow-y: scroll;
    box-shadow: inset -4px 0 20px #00000086;

    ::-webkit-scrollbar-track {
      background-color: #111111;
    }
  
    ::-webkit-scrollbar-thumb {
      background: #ddd;
      border-radius: 4px;
    }

    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
  }

  #terminal-text {
    text-wrap: wrap;
    font-size: 1.25rem;
    width: 100%;
  }
</style>