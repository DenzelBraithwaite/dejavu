<script lang="ts">
  // Props
  export let player: {name: string; money: number; amountBet: number; colorBet: string; points: number};

</script>

<div class="player-gambling-card">
  <p>Name: {player.name}</p>
  <p>Krypto: {player.money}<span class="color-green">₭</span></p>
  <p>Bet: {player.colorBet}</p>
</div>

<style lang="scss">
  @use 'sass:color';
  $purple: #9962ff;
  $pink: #F837CD;
  $yellow: #F2D40E;
  $cyan: #02FBFB;
  $blue: #0779FC;


.player-gambling-card {
  border: 1px solid $yellow;
  background-color: $purple;
}
</style>