<script lang="ts">
  import {
    Billywig,
    CharacterMenu,
    Journal,
    MinigameLibrary,
    NetRunners,
    PacketWar,
    Pigz,
    SettingsMenu,
    StoryLibrary,
    Terminal,
    TraceRace
  } from '../lib/components';
</script>

<div class="page-stack">
  <Terminal />
  <CharacterMenu />
  <Journal />
  <MinigameLibrary />
  <NetRunners />
  <Billywig />
  <Pigz />
  <TraceRace />
  <PacketWar />
  <SettingsMenu />
  <StoryLibrary />
</div>

<style lang="scss">
  .page-stack {
    width: auto;
    height: 100%;
    min-width: 0;
    max-width: 1600px;
    margin: 0 auto;

    flex: 1 1 0;
  }
</style>
