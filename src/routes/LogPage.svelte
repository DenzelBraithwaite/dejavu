<script lang="ts">
  // transitions
  import { blur } from 'svelte/transition';

  // Modules / Components
  import { Button, Terminal } from '../lib/components';
</script>

<div in:blur class="main-content">
  <Terminal title="Log Page" terminalColor="grey" />
  <div class="page-menu">
    <Button btnType="terminal-btn">Display Day</Button>
  </div>
</div>

<style lang="scss">
  .main-content {
    width: 100%;
    height: 100%;
    max-width: 1100px;
    margin-left: auto;
    margin-right: auto;
  }
</style>