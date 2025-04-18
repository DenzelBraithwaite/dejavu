<script lang="ts">
  // transitions
  import { blur } from 'svelte/transition';

  // Modules / Components
  import { Terminal } from '../lib/components';
</script>

<div in:blur class="main-content">
  <Terminal title="Player Page" terminalColor="blue" />
</div>

<style lang="scss">
  .main-content {
    width: 100%;
    height: 100%;
  }
</style>