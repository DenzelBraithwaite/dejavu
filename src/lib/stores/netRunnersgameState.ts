import { writable } from 'svelte/store';

export type NetRunnersGameState = {
  singleplayer: boolean;
  gameInProgress: boolean;
  menuVisible: boolean;
  colorSelectVisible: boolean;
  lanesVisible: boolean;
  round: number;
  roundStarted: boolean;
  p1: {
    name: string;
    wallet: number;
    amountBet: number;
    colorBet: string;
  },
  p2: {
    name: string;
    wallet: number;
    amountBet: number;
    colorBet: string;
  },
  p3: {
    name: string;
    wallet: number;
    amountBet: number;
    colorBet: string;
  },
  p4: {
    name: string;
    wallet: number;
    amountBet: number;
    colorBet: string;
  }
};

export const netRunnersgameState = writable<NetRunnersGameState>({
  singleplayer: true,
  gameInProgress: false,
  menuVisible: true,
  colorSelectVisible: false,
  lanesVisible: false,
  round: 0,
  roundStarted: false,
  p1: {
    name: 'should be players actual name from game',
    wallet: 0,
    amountBet: 0,
    colorBet: 'purple'
  },
  p2: {
    name: 'CPU if singleplayer, hooman if multiplayer',
    wallet: 0,
    amountBet: 0,
    colorBet: 'pink'
  },
  p3: {
    name: 'CPU Bob',
    wallet: 0,
    amountBet: 0,
    colorBet: 'yellow'
  },
  p4: {
    name: 'CPU Quinn',
    wallet: 0,
    amountBet: 0,
    colorBet: 'cyan'
  } // cpu
});