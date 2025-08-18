<script lang="ts">
  // Transitions
  import { blur } from 'svelte/transition';

  // Pages
  import { LogPage } from '../../routes/index';

  // Stores
  import location from '../stores/location';
  import { chapter, chapterPart } from '../stores/terminalMessages';

  // Components
  import { Sidebar } from './index';

  let sidebarExpanded = false;
  let background = '';

  // The delay because the female player initially has a bag over her head and the male is trying to focus his vision.
  $: if ($chapter === '1') setTimeout(() => background = 'audience-chamber', 10_000);

  function changePage(event: CustomEvent) {
    const newLocation: string = event.detail;
    location.set(newLocation);
  }

</script>
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->

<div in:blur={{duration: 2000}} class:client-collapsed={!sidebarExpanded} class="client bg-{background}">
  <Sidebar {sidebarExpanded} on:select={changePage} on:toggle-sidebar={() => sidebarExpanded = !sidebarExpanded}/>

  <div class="main-content">
    <LogPage />
  </div>
</div>

<style lang="scss">
  .client {
    position: relative;
    height: 100vh;
    width: 100vw;
    background-color: var(--slate-950);
    transition: all 0.5s ease-out; // Match this to sidebar transition speed (or don't 😅)

    display: grid;
    grid-template-columns: 300px minmax(70%, 1fr); // fixed for transition... doesn't react to % units
  }

  .main-content {
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

  .bg-audience-chamber {
    transition: all 1s ease-in-out;
    background: url('/audience-chamber.png');
    background-position: center;
    background-repeat: no-repeat;
    background-size: cover;
  }
</style>