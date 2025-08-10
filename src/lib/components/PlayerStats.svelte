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

  // Components
  import { Button } from '../components';

  // Props
  export let isVisible = false;

  const createEvent = createEventDispatcher();
  const player: Player = returnPlayer();

  function closeMenu() {
    createEvent('close-menu');
  }

  function returnPlayer(): Player {
    return $currentGameState.playingAs === 'male' ? $player1 : $player2;
  }
</script>

{#if isVisible}
  <div transition:blur={{duration: 1000}} class="player-menu">
    <div class="menu-content">
      <h1>Character Menu</h1>
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
    <Button on:click={closeMenu}>Close</Button>
  </div>
{/if}

<style lang="scss">
  $terminalBg: #041529f8;

  .player-menu {
    position: fixed;
    z-index: 1;
    background-color: $terminalBg;
    height: 75%;
    width: 75%;
    max-width: 500px; // 
    border: 4px solid #215798;
    border-top-width: 18px;
    border-radius: var(--border-radius-small);
    padding: 8px;
    overflow-wrap: break-word;
    transition: all 0.5s ease-out;

    .player-menu-screen::-webkit-scrollbar-track {
      background-color: #071424;
    }

    .player-menu-screen::-webkit-scrollbar-thumb {
      background: #215798;
      border-radius: 4px;
    }
  }
  
  .menu-content {
    position: relative;
    height: 90%;
    width: 100%;
    min-width: 400px;
    border-radius: 24px;
    padding: 12px;
    overflow-y: scroll;
    box-shadow: inset -4px 0 20px #00000086;
    background-color: #0000008e;
  }

  // #terminal-text {
  //   text-wrap: wrap;
  //   font-size: 1.25rem;
  //   width: 100%;
  // }

  // Utility //
  .terminal-screen::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

</style>