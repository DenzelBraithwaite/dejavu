<script lang="ts">
  // Transitions
  import { blur } from 'svelte/transition';

  // Pages
  import { LogPage, PlayerPage } from '../../routes/index';

  // Components
  import { Sidebar } from './index';

  let sidebarExpanded = true;
  let currentPage = '';

  // SPA so changes focused component really, same page.
  function changePage(event: {detail: string}): void {
    currentPage = event.detail;
  }
</script>
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->

<div in:blur={{duration: 2000}} class:client-collapsed={!sidebarExpanded} class="client">
  <Sidebar {sidebarExpanded} on:select={changePage} on:toggle-sidebar={() => sidebarExpanded = !sidebarExpanded}/>

  <div class="screen">
    {#if currentPage === 'log'}
      <LogPage />
    {:else if currentPage === 'player'}
      <PlayerPage />
    {/if}

  </div>
</div>

<style lang="scss">
  .client {
    position: relative;
    $background: var(--slate-950);
    height: 100vh;
    width: 100vw;
    background-color: $background;
    transition: all 0.5s ease-out; // Match this to sidebar transition speed (or don't 😅)

    display: grid;
    grid-template-columns: 300px minmax(70%, 1fr); // fixed for transition... doesn't react to % units
  }

  .screen {
    position: relative;
    padding: 24px 40px;
    grid-column: 2 / span 1;
    box-shadow: inset 0 0 12px var(--box-shadow-color);

    display: flex;
    justify-content: center;
    align-items: center;
  }
  
  .client-collapsed {
    grid-template-columns: 70px 1fr;
  }
</style>