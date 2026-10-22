import { netRunnersGameState } from '../stores/netRunnersGameState';
import { socket } from '../socket';

export type WagerOutcome = 'win' | 'loss' | 'draw';

export function settleWager(wager: number, outcome: WagerOutcome): number {
  const balanceChange = outcome === 'win'
    ? wager === 0 ? 100 : wager
    : outcome === 'loss'
      ? -wager
      : 0;

  netRunnersGameState.update((state) => ({
    ...state,
    p1: {
      ...state.p1,
      money: state.p1.money + balanceChange
    }
  }));

  socket.emit('characters:adjust-wallet', balanceChange);

  return balanceChange;
}
