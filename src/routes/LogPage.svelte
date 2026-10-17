<script lang="ts">
  import {
    CharacterMenu,
    Journal,
    NetRunners,
    SettingsMenu,
    Terminal
  } from '../lib/components';
</script>

<div class="page-stack">
  <Terminal />
  <CharacterMenu />
  <Journal />
  <NetRunners />
  <SettingsMenu />
</div>

<style lang="scss">
  .page-stack {
    width: 100%;
    height: 100%;
    max-width: 1100px;
    margin: 0 auto;
  }
</style>
