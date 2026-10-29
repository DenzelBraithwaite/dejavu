<script lang="ts">
  // Hooks
  import { createEventDispatcher } from 'svelte';

  // Components
  import { Item } from './index';
  import { activeCharacter } from '../stores/characters';

  type NavigationItem = {
    color: string;
    description: string;
    iconType: string;
    location: string;
    title: string;
  };

  // props
  export let sidebarExpanded = true;
  export let chatUnreadCount = 0;
  export let chatAvailable = false;
  export let storyModeActive = false;
  export let storyToolsVisible = false;

  const storyNavigationItems: NavigationItem[] = [
    {
      color: 'blue-spectrum-1',
      description: 'View this player’s story stats',
      iconType: 'player',
      location: 'player',
      title: 'Player'
    },
    {
      color: 'blue-spectrum-2',
      description: 'View story items and effects',
      iconType: 'bag',
      location: 'bag',
      title: 'Bag'
    },
    {
      color: 'blue-spectrum-3',
      description: 'Review this cartridge’s history',
      iconType: 'journal',
      location: 'journal',
      title: 'Logs'
    },
    {
      color: 'blue-spectrum-4',
      description: 'Save or restore this story',
      iconType: 'save',
      location: 'saves',
      title: 'Saves'
    }
  ];
  const primaryNavigationItems: NavigationItem[] = [
    {
      color: 'green',
      description: 'Select and load stories',
      iconType: 'library',
      location: 'library',
      title: 'Library'
    },
    {
      color: 'purple',
      description: 'Browse coded game modules',
      iconType: 'gamepad',
      location: 'minigames',
      title: 'Minigames'
    },
    {
      color: 'pink',
      description: 'Create and manage the cast',
      iconType: 'player',
      location: 'character',
      title: 'Characters'
    },
    {
      color: 'orange',
      description: 'Create and manage stories',
      iconType: 'editor',
      location: 'editor',
      title: 'Editor'
    },
    {
      color: 'grey',
      description: 'Audio and local preferences',
      iconType: 'settings',
      location: 'settings',
      title: 'Settings'
    }
  ];
  const dispatch = createEventDispatcher();

  function selectPage(page: string): void {
    dispatch('select', page);
  }
</script>
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->

<div class="sidebar" class:sidebar-collapsed={!sidebarExpanded} class:sidebar-expanded={sidebarExpanded}>
  <div class="sidebar-scroll">
    <button
      class="collapse-button"
      class:rotate={!sidebarExpanded}
      type="button"
      aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
      on:click={() => {
        dispatch('toggle-sidebar');
      }}
    >
      <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19 15V9"/>
        <path d="M15 15h-3v4l-7-7 7-7v4h3v6z"/>
      </svg>
    </button>

    <div class:story-navigation-group--active={storyModeActive} class="story-navigation-group">
      {#if storyToolsVisible}
        <div class="story-tools" aria-label="Cartridge tools">
          {#each storyNavigationItems as item}
            <Item
              on:click={() => {
                selectPage(item.location);
              }}
              collapsed={!sidebarExpanded}
              color={item.color}
              iconType={item.iconType}
              label={item.title}
            >
              <span slot="title">{item.title}</span>
              <span slot="description">{item.description}</span>
            </Item>
          {/each}

          {#if chatAvailable}
            <Item
              on:click={() => {
                dispatch('toggle-chat');
              }}
              collapsed={!sidebarExpanded}
              color={'blue-spectrum-5'}
              iconType={'chat'}
              badge={chatUnreadCount}
              label="Messages"
            >
              <span slot="title">Messages</span>
              <span slot="description">Open your unlocked Neuro-Link</span>
            </Item>
          {/if}
        </div>
      {/if}

      <Item
        on:click={() => {
          selectPage('terminal');
        }}
        collapsed={!sidebarExpanded}
        color="blue-spectrum-6"
        iconType="terminal"
        label="Cartridge"
      >
        <span slot="title">Cartridge</span>
        <span slot="description">Play the inserted story</span>
      </Item>

      {#if storyToolsVisible}
        <div class="story-tools-divider" aria-hidden="true"></div>
      {/if}
    </div>

    {#each primaryNavigationItems as item}
      <Item
        on:click={() => {
          selectPage(item.location);
        }}
        collapsed={!sidebarExpanded}
        color={item.color}
        iconType={item.iconType}
        label={item.title}
      >
        <span slot="title">{item.title}</span>
        <span slot="description">{item.description}</span>
      </Item>
    {/each}
  </div>

  {#if $activeCharacter}
    <button
      class="account-summary"
      class:account-summary--collapsed={!sidebarExpanded}
      type="button"
      aria-label={`View or change account: ${$activeCharacter.name}`}
      on:click={() => {
        dispatch('show-account-selector');
      }}
    >
      {#if $activeCharacter.images.normal}
        <img
          src={$activeCharacter.images.normal}
          alt=""
          style:object-position={`${$activeCharacter.imagePositions.normal.x}% ${$activeCharacter.imagePositions.normal.y}%`}
        >
      {:else}
        <span class="account-placeholder">{$activeCharacter.name.slice(0, 1).toUpperCase()}</span>
      {/if}
      {#if sidebarExpanded}
        <span>
          <small>ACCOUNT</small>
          <strong>{$activeCharacter.name}</strong>
          <em>View or change</em>
        </span>
      {/if}
    </button>
  {/if}
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
    transition: width 0.5s ease-out;
    border-radius: 8px 0 0 8px;
    overflow: hidden;

    display: flex;
    flex-direction: column;

    .icon {
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.5;
      stroke: var(--white);
      fill: none;
    }
  }

  .sidebar-scroll {
    min-height: 0;
    overflow-y: auto;

    flex: 1 1 auto;
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

  .story-tools {
    display: contents;
  }

  .story-navigation-group {
    width: 100%;
    margin-bottom: 8px;
    padding: 7px;
    background: #0c1b2d;
    border: 1px solid #233f5c;
    border-radius: 7px;
  }

  .story-navigation-group--active {
    background: #10243b;
    border-color: #31577c;
  }

  .account-summary {
    width: 100%;
    min-height: 62px;
    margin-top: 10px;
    padding: 8px;
    color: #e8edf6;
    background: #101827;
    border: 1px solid #475569;
    border-radius: 7px;
    cursor: pointer;
    text-align: left;

    display: flex;
    align-items: center;
    gap: 10px;

    flex: 0 0 auto;

    img,
    .account-placeholder {
      width: 44px;
      height: 44px;
      object-fit: cover;
      border: 1px solid #ff75c8;
      border-radius: 50%;

      flex: 0 0 44px;
    }

    > span:last-child {
      min-width: 0;

      display: grid;
    }

    small,
    em {
      color: #94a3b8;
      font-size: 0.62rem;
      font-style: normal;
      letter-spacing: 1px;
    }

    strong {
      overflow: hidden;
      color: #ffffff;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .account-summary--collapsed {
    justify-content: center;
  }

  .account-placeholder {
    color: #ff75c8;
    background: #2a0c22;

    display: grid;
    place-items: center;
  }

  .story-tools-divider {
    height: 1px;
    margin: 10px 4px;
    background: #475569;
  }

  // Utility
  .sidebar-collapsed {
    width: 70px;
  }

  .sidebar-expanded {
    width: 300px;
  }
  
  .rotate {
    .icon {
      transform: rotate(180deg);
    }
  }

  @media (max-width: 760px) {
    .sidebar,
    .sidebar-collapsed,
    .sidebar-expanded {
      width: 100%;
      height: calc(70px + env(safe-area-inset-bottom));
      padding: 7px 8px calc(7px + env(safe-area-inset-bottom));
      border-radius: 0;
      grid-column: 1;
      grid-row: 2;
      overflow: hidden;

      display: flex;
      gap: 7px;
    }

    .sidebar-scroll {
      min-width: 0;
      overflow-x: auto;
      overflow-y: hidden;

      display: flex;
      gap: 7px;
      flex: 1 1 auto;
    }

    .collapse-button {
      display: none;
    }

    .story-tools {
      display: flex;
      gap: 7px;
    }

    .story-navigation-group {
      width: auto;
      height: 56px;
      margin: 0;
      padding: 0 7px;
      border-radius: 5px;

      display: flex;
      gap: 7px;
    }

    .story-navigation-group--active {
      background: #10243b;
    }

    .story-tools-divider {
      width: 1px;
      height: 48px;
      margin: 4px 2px;

      flex: 0 0 1px;
    }

    .account-summary {
      width: 56px;
      height: 56px;
      min-height: 56px;
      margin: 0;
      padding: 6px;

      flex: 0 0 56px;
      order: -1;

      img,
      .account-placeholder {
        width: 42px;
        height: 42px;

        flex-basis: 42px;
      }
    }

    .sidebar :global(.item) {
      width: 56px;
      height: 56px;
      margin: 0;

      flex: 0 0 56px;
      justify-content: center;
    }

    .sidebar :global(.item-text-wrapper) {
      display: none;
    }
  }
</style>
