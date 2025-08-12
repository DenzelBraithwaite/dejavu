<script lang="ts">
  // Hooks
  import { createEventDispatcher } from 'svelte';

  // Components
  import { Item } from './index';

  // props
  export let sidebarExpanded = true;

  const createEvent = createEventDispatcher();
</script>
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->

<div class="sidebar" class:sidebar-collapsed={!sidebarExpanded} class:sidebar-expanded={sidebarExpanded}>
  <svg on:click={() => createEvent('toggle-sidebar')} class:rotate={!sidebarExpanded} class="icon collapse-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path d="M19 15V9"/>
    <path d="M15 15h-3v4l-7-7 7-7v4h3v6z"/>
  </svg>
  
  <Item on:click={() => createEvent('select', 'terminal')} collapsed={!sidebarExpanded} color={'white'} iconType={'terminal'}>
    <span slot="title">Terminal</span>
    <span slot="description">Main Game</span>
  </Item>

  <Item on:click={() => createEvent('select', 'character')} collapsed={!sidebarExpanded} color={'blue'} iconType={'player'}>
    <span slot="title">Character</span>
    <span slot="description">Check your stats</span>
  </Item>

  <Item on:click={() => createEvent('select', 'netrunners')} collapsed={!sidebarExpanded} color={'purple'} iconType={'cpu'}>
    <span slot="title">NetRunners</span>
    <span slot="description">Card game, bet on the fastest hacker to win.</span>
  </Item>
</div>

<style lang="scss">
  $backgroundColor: var(--slate-800);

  .sidebar {
    position: relative;
    z-index: 1;
    grid-column: 1 / span 1;
    background-color: $backgroundColor;
    padding: 12px;
    box-shadow: 4px 0 16px var(--box-shadow-color);
    transition: all 0.5s ease-out; // Match this to .client transition speed (or don't 😅)
    border-radius: 8px 0 0 8px; // left side only, matches .screen right side border-radius

    .icon {
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.5;
      stroke: var(--white);
      fill: none;
    }
  }

  .collapse-icon {
    background-color: $backgroundColor;
    cursor: pointer;
    height: 42px;
    width: 42px;
    border-radius: 50%;
    position: absolute;
    right: 0px;
    bottom: 40%;
    transform: translateX(80%);
    transition: all 0.3s ease-in-out;
    
    &:hover {
      // Can't use variables here, this is $backgroundColor
      background-color: lighten(#1e293b, 10%);
      scale: 1.05;
    }

    &:active {
      transition: all 0.1s ease-in-out;
      border: 2px solid var(--yellow);
    }
  }

  // Utility
  .sidebar-collapsed {
    width: 70px;
  }

  .sidebar-expanded {
    width: 300px; // fixed for transition... doesn't react to % units
  }
  
  .rotate {
    transform: rotate(180deg);
  }
</style>