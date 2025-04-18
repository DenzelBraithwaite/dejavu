<script lang="ts">
  // Hooks
  import { onMount } from 'svelte';

  // Transition
  import { blur } from 'svelte/transition';

  // Modules/Helpers
  import { World } from './lib/helpers/index';

  // Components
  import { Client } from './lib/components/index';

  const currentWorld = new World({});

  onMount(() => {
    startGame();
  });

  function startGame(): void {
    currentWorld.startGame();
  }
</script>

<main class="main-content">
  <Client />
</main>

<style lang="scss">
  .main-content {
    height: 100vh; // dynamic viewport units not as supported (not at all in firefox)
    width: 100vw;
    padding: 8px;
    background-color: var(--black);

    display: flex;
    justify-content: center;
    align-items: center;
  }
</style>
