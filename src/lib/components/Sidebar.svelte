<script lang="ts">
  // Hooks
  import { createEventDispatcher } from 'svelte';

  // Components
  import { Item } from './index';

  // props
  export let sidebarExpanded = true;
  export let chatUnreadCount = 0;
  export let chatAvailable = false;

  const createEvent = createEventDispatcher();
</script>
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->

<div class="sidebar" class:sidebar-collapsed={!sidebarExpanded} class:sidebar-expanded={sidebarExpanded}>
  <button
    class="collapse-button"
    class:rotate={!sidebarExpanded}
    type="button"
    aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
    on:click={() => createEvent('toggle-sidebar')}
  >
    <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 15V9"/>
      <path d="M15 15h-3v4l-7-7 7-7v4h3v6z"/>
    </svg>
  </button>
  
  <Item on:click={() => createEvent('select', 'terminal')} collapsed={!sidebarExpanded} color={'blue'} iconType={'terminal'}>
    <span slot="title">Story Mode</span>
    <span slot="description">Play the inserted story</span>
  </Item>

  <Item on:click={() => createEvent('select', 'library')} collapsed={!sidebarExpanded} color={'green'} iconType={'library'}>
    <span slot="title">Library</span>
    <span slot="description">Select or create stories</span>
  </Item>

  <Item on:click={() => createEvent('select', 'minigames')} collapsed={!sidebarExpanded} color={'purple'} iconType={'gamepad'}>
    <span slot="title">Minigames</span>
    <span slot="description">Browse coded game modules</span>
  </Item>

  <Item on:click={() => createEvent('select', 'character')} collapsed={!sidebarExpanded} color={'pink'} iconType={'player'}>
    <span slot="title">Characters</span>
    <span slot="description">Create and manage the cast</span>
  </Item>

  <Item on:click={() => createEvent('select', 'journal')} collapsed={!sidebarExpanded} color={'brown'} iconType={'journal'}>
    <span slot="title">Journal</span>
    <span slot="description">Transcript and decisions</span>
  </Item>

  {#if chatAvailable}
    <Item
      on:click={() => createEvent('toggle-chat')}
      collapsed={!sidebarExpanded}
      color={'blue'}
      iconType={'chat'}
      badge={chatUnreadCount}
    >
      <span slot="title">Neuro-Link</span>
      <span slot="description">Transmit thoughts to your partner</span>
    </Item>
  {/if}

  <Item on:click={() => createEvent('select', 'editor')} collapsed={!sidebarExpanded} color={'orange'} iconType={'editor'}>
    <span slot="title">Editor</span>
    <span slot="description">Build story flow charts</span>
  </Item>

  <Item on:click={() => createEvent('select', 'settings')} collapsed={!sidebarExpanded} color={'grey'} iconType={'settings'}>
    <span slot="title">Settings</span>
    <span slot="description">Audio, saves, and preferences</span>
  </Item>
</div>

<style lang="scss">
  $backgroundColor: var(--slate-800);

  .sidebar {
    position: relative;
    z-index: 200;
    grid-column: 1 / span 1;
    background-color: $backgroundColor;
    padding: 12px;
    box-shadow: 4px 0 16px var(--box-shadow-color);
    transition: all 0.5s ease-out; // Match this to .client transition speed (or don't 😅)
    border-radius: 8px 0 0 8px; // left side only, matches .screen right side border-radius
    overflow-y: auto;

    .icon {
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.5;
      stroke: var(--white);
      fill: none;
    }
  }

  .collapse-button {
    position: sticky;
    z-index: 1000;
    top: 0;
    width: 100%;
    height: 42px;
    margin-bottom: 10px;
    color: var(--white);
    background: #0f172a;
    border: 1px solid #64748b;
    border-radius: 6px;
    box-shadow: 0 5px 16px #020617aa;
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease;

    display: grid;
    place-items: center;

    .icon {
      width: 28px;
      height: 28px;
      stroke: #ffffff;
      transition: transform 0.25s ease;
    }
    
    &:hover {
      background: #334155;
      border-color: #94a3b8;
    }

    &:active {
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
    .icon {
      transform: rotate(180deg);
    }
  }
</style>
