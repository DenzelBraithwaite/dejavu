<script lang="ts">
  import {
    Billywig,
    Chopsticks,
    CharacterMenu,
    DroneRelay,
    FirewallAuction,
    Journal,
    LoHi,
    Mastermind,
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
  <LoHi />
  <Mastermind />
  <Chopsticks />
  <FirewallAuction />
  <DroneRelay />
  <Pigz />
  <TraceRace />
  <PacketWar />
  <SettingsMenu />
  <StoryLibrary />
</div>

<style lang="scss">
  .page-stack {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    max-width: 1600px;
    margin: 0 auto;
    overflow: hidden;

    flex: 1 1 0;
    display: flex;
    justify-content: center;
    align-items: center;
  }
</style>
