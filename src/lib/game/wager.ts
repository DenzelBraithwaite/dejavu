import { netRunnersGameState } from '../stores/netRunnersGameState';

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
      money: Math.max(0, state.p1.money + balanceChange)
    }
  }));

  return balanceChange;
}
