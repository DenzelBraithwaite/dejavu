<script lang="ts">
  import BagMenu from '../lib/components/BagMenu.svelte';
  import Billywig from '../lib/components/Billywig.svelte';
  import CharacterMenu from '../lib/components/CharacterMenu.svelte';
  import Chopsticks from '../lib/components/Chopsticks.svelte';
  import DroneRelay from '../lib/components/DroneRelay.svelte';
  import FirewallAuction from '../lib/components/FirewallAuction.svelte';
  import Journal from '../lib/components/Journal.svelte';
  import LoHi from '../lib/components/LoHi.svelte';
  import Mastermind from '../lib/components/Mastermind.svelte';
  import MinigameLibrary from '../lib/components/MinigameLibrary.svelte';
  import NetRunners from '../lib/components/NetRunners.svelte';
  import PacketWar from '../lib/components/PacketWar.svelte';
  import Pigz from '../lib/components/Pigz.svelte';
  import PlayerMenu from '../lib/components/PlayerMenu.svelte';
  import SaveMenu from '../lib/components/SaveMenu.svelte';
  import SettingsMenu from '../lib/components/SettingsMenu.svelte';
  import StoryLibrary from '../lib/components/StoryLibrary.svelte';
  import Terminal from '../lib/components/Terminal.svelte';
  import TraceRace from '../lib/components/TraceRace.svelte';
</script>

<div class="page-stack">
  <Terminal />
  <PlayerMenu />
  <BagMenu />
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
  <SaveMenu />
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
