<script lang="ts">
  // Props
  export let player: {name: string; money: number; amountBet: number; colorBet: string; points: number};

</script>

<div class="player-gambling-card player-gambling-card__{player.colorBet}">
  <div class="avatar-wrapper">
    <img class="avatar" src="/hacker_{player.colorBet}.png" alt="hacker in black sweater">
    <div class="name-money-wrapper">
      <p class="player-name">{player.name}</p>
      <p class="player-money">{player.money}<span class="color-green">₭</span></p>
    </div>
  </div>
  <p class="player-bet">Bet &bull; {player.amountBet}<span class="color-green">₭</span></p>
</div>

<style lang="scss">
  @use 'sass:color';
  $purple: #9962ff;
  $pink: #F837CD;
  $yellow: #F2D40E;
  $cyan: #02FBFB;
  $blue: #0779FC;

  .avatar-wrapper {
    border-bottom: 1px dashed #eee;
    margin-bottom: 4px;
    padding-bottom: 4px;

    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
  }

  .avatar {
    height: 42px;
    width: 42px;
  }

  .player-name {
    margin-bottom: 4px;
  }

  .player-bet {
    text-align: center;
  }

  .player-gambling-card {
    padding: 4px;
    border-radius: 6px;
    flex: 0 1 100%;
  }

  .player-gambling-card__purple {
    border-bottom: 2px double $purple;
    border-left: 2px double $purple;
    box-shadow: 0 2px 6px color.scale($purple, $alpha: -50%);
    background-color: color.scale($purple, $alpha: -70%);
  }

  .player-gambling-card__pink {
    border-bottom: 2px double $pink;
    border-left: 2px double $pink;
    box-shadow: 0 2px 6px color.scale($pink, $alpha: -50%);
    background-color: color.scale($pink, $alpha: -70%);
  }

  .player-gambling-card__yellow {
    border-bottom: 2px double $yellow;
    border-left: 2px double $yellow;
    box-shadow: 0 2px 6px color.scale($yellow, $alpha: -50%);
    background-color: color.scale($yellow, $alpha: -70%);
  }


  .player-gambling-card__cyan {
    border-bottom: 2px double $cyan;
    border-left: 2px double $cyan;
    box-shadow: 0 2px 6px color.scale($cyan, $alpha: -50%);
    background-color: color.scale($cyan, $alpha: -70%);
  }

  .player-gambling-card__blue {
    border-bottom: 2px double $blue;
    border-left: 2px double $blue;
    box-shadow: 0 2px 6px color.scale($blue, $alpha: -50%);
    background-color: color.scale($blue, $alpha: -70%);
  }
</style>