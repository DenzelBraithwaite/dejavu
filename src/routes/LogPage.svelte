<script lang="ts">
  import {
    BagMenu,
    CharacterMenu,
    Journal,
    NetRunners,
    SaveMenu,
    SettingsMenu,
    Terminal
  } from '../lib/components';
</script>

<div class="page-stack">
  <Terminal />
  <CharacterMenu />
  <Journal />
  <BagMenu />
  <SaveMenu />
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
