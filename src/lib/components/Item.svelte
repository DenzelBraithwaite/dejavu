<script lang="ts">
  // Transitions
  import { fly, fade, blur } from 'svelte/transition';

  // props
  export let iconType = 'unkown';
  export let color = 'grey';
  export let collapsed = false;
  export let badge = 0;
</script>
<!-- svelte-ignore a11y-no-static-element-interactions -->
<!-- svelte-ignore a11y-click-events-have-key-events -->

<div on:click class="item item-color__{color}">
  {#if iconType === 'terminal'}
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon">
      <polyline points="4 17 10 11 4 5"/>
      <line x1="12" x2="20" y1="19" y2="19"/>
    </svg>
  {:else if iconType === 'player'}
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  {:else if iconType === 'journal'}
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      <path d="M8 7h8"/>
      <path d="M8 11h6"/>
    </svg>
  {:else if iconType === 'bag'}
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon">
      <path d="M6 8h12l2 13H4L6 8z"/>
      <path d="M9 8V6a3 3 0 0 1 6 0v2"/>
      <path d="M9 12h6"/>
    </svg>
  {:else if iconType === 'save'}
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon">
      <path d="M4 3h14l2 2v16H4V3z"/>
      <path d="M8 3v6h8V3"/>
      <path d="M8 21v-7h8v7"/>
    </svg>
  {:else if iconType === 'chat'}
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon">
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8z"/>
      <path d="M8 9h8"/>
      <path d="M8 13h5"/>
    </svg>
  {:else if iconType === 'settings'}
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.96 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.53-1H3v-4h.08A1.7 1.7 0 0 0 4.6 8.96a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8.96 4.6 1.7 1.7 0 0 0 10 3.08V3h4v.08a1.7 1.7 0 0 0 1.04 1.53 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.18.61.74 1.03 1.37 1.03H21v4h-.23c-.63 0-1.19.42-1.37.97z"/>
    </svg>
  {:else if iconType === 'library'}
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon">
      <path d="M4 4h5v16H4z"/>
      <path d="M10 4h5v16h-5z"/>
      <path d="M16 5l4-1 3 15-4 1z"/>
      <path d="M5.5 8h2"/>
      <path d="M11.5 8h2"/>
    </svg>
  {:else if iconType === 'cpu'}
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon">
      <path d="M12 20v2"/>
      <path d="M12 2v2"/>
      <path d="M17 20v2"/>
      <path d="M17 2v2"/>
      <path d="M2 12h2"/>
      <path d="M2 17h2"/>
      <path d="M2 7h2"/>
      <path d="M20 12h2"/>
      <path d="M20 17h2"/>
      <path d="M20 7h2"/>
      <path d="M7 20v2"/>
      <path d="M7 2v2"/>
      <rect x="4" y="4" width="16" height="16" rx="2"/>
      <rect x="8" y="8" width="8" height="8" rx="1"/>
    </svg>
  {:else if iconType === 'gamepad'}
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon">
      <path d="M6 8h12a4 4 0 0 1 3.8 5.3l-1.4 4.2a2.2 2.2 0 0 1-3.6.9L14.5 16h-5l-2.3 2.4a2.2 2.2 0 0 1-3.6-.9l-1.4-4.2A4 4 0 0 1 6 8z"/>
      <path d="M7 11v4"/>
      <path d="M5 13h4"/>
      <circle cx="16" cy="12" r=".7"/>
      <circle cx="18" cy="14" r=".7"/>
    </svg>
  {:else if iconType === 'editor'}
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon">
      <rect x="3" y="3" width="6" height="5" rx="1"/>
      <rect x="15" y="16" width="6" height="5" rx="1"/>
      <rect x="3" y="16" width="6" height="5" rx="1"/>
      <path d="M9 5.5h3a3 3 0 0 1 3 3V16"/>
      <path d="M9 18.5h6"/>
    </svg>

  {:else}
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <path d="M12 17h.01"/>
    </svg>
  {/if}

  {#if badge > 0}
    <span class="item-badge" aria-label="{badge} unread messages">
      {badge > 9 ? '9+' : badge}
    </span>
  {/if}
  
  {#if !collapsed}
    <div class="item-text-wrapper" in:blur={{duration: 500}} out:blur={{duration: 250}}>
      <h2 class="item-title"><slot name="title">Title</slot></h2>
      <p class="item-text"><slot name="description">Brief description</slot></p>
    </div>
  {/if}
 </div>

<style lang="scss">
  .item {
    position: relative;
    cursor: pointer;
    background-color: #5f5a5a;
    border-radius: var(--border-radius-small);
    transition: all 0.2s ease-in-out;
    margin-bottom: 8px;
    padding: 2px;
    width: 100%;
    height: 75px; // For consistency when expanding and collapsing sidebar (grow/shrink looks weird)

    display: flex;
    align-items: center;
    gap: 8px;

    &:hover {
      scale: 1.05;
      margin: 0.5rem 0;
      transform: translateX(12px);
      box-shadow: 0 6px 12px var(--box-shadow-color);
    }

    &:active {
      transition: all 0.1s ease-in-out;
      border: 2px solid var(--yellow);
    }

    .item-text-wrapper {
      background-color: #111111e9;
      border-radius: var(--border-radius-small);
      padding: 8px;
      width: 100%;
      height: 100%;
      
      &:hover {
        background-color: #11111191;
      }

      .item-title {
        font-size: 1.4rem;
        margin-bottom: 4px;
      }

      .item-text {
        font-size: 0.9rem;
      }
    }
  }

  .item-color__green {
    background-color: #279821;
  }

  .item-color__blue {
    background-color: #215798;
  }

  .item-color__purple {
    background-color: #453b82;
  }

  .item-color__brown {
    background-color: #7a4d2b;
  }

  .item-color__grey {
    background-color: #70756f;
  }

  .item-color__white {
    background-color: #ddd;
  }

  .icon {
    width: 32px;
    height: 32px;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 2.75;
    stroke: #111;
    fill: none;
  }

  .item-badge {
    position: absolute;
    z-index: 2;
    top: 5px;
    left: 26px;
    min-width: 21px;
    height: 21px;
    padding: 0 5px;
    color: #070b16;
    background: #ff75fd;
    border: 2px solid #111111;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 800;
    line-height: 17px;
    text-align: center;
  }
</style>
