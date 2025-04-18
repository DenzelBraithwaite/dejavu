<script lang="ts">
  // transitions
  import { blur } from 'svelte/transition';

  // Modules / Components
  import { Button, Terminal } from '../lib/components';
</script>

<div in:blur class="main-content">
  <Terminal title="Plant Page" terminalColor="green" />
  <div class="page-menu">
    <Button btnType="page-menu-btn__green">Plant</Button>
    <Button btnType="page-menu-btn__green">Harvest</Button>
    <Button btnType="page-menu-btn__green">Display Day</Button>
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