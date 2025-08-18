import { writable } from 'svelte/store';

type CardColor = ('purple' | 'pink' | 'yellow' | 'cyan' | 'blue' | string);
export type NetRunnersGameState = {
  singleplayer: boolean;
  gameInProgress: boolean;
  menuVisible: boolean;
  colorSelectVisible: boolean;
  lanesVisible: boolean;
  gameControlsVisible: boolean;
  fullDeck: CardColor[];
  trackCards: CardColor[];
  odds: {
    pink: number,
    purple: number,
    yellow: number,
    cyan: number,
    blue: number
  };
  round: number;
  roundStarted: boolean;
  cardsDrawn: CardColor[];
  p1: {
    name: string;
    wallet: number;
    amountBet: number;
    colorBet: string;
    points: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  },
  p2: {
    name: string;
    wallet: number;
    amountBet: number;
    colorBet: string;
    points: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  },
  p3: {
    name: string;
    wallet: number;
    amountBet: number;
    colorBet: string;
    points: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  },
  p4: {
    name: string;
    wallet: number;
    amountBet: number;
    colorBet: string;
    points: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  }
};

export const netRunnersGameState = writable<NetRunnersGameState>({
  singleplayer: true,
  gameInProgress: false,
  menuVisible: true,
  colorSelectVisible: false,
  lanesVisible: false,
  gameControlsVisible: false,
  fullDeck: [...Array(15).fill('purple'), ...Array(15).fill('pink'), ...Array(15).fill('yellow'), ...Array(15).fill('cyan'), ...Array(15).fill('blue')],
  trackCards: [],
  odds: {pink: 0, purple: 0, yellow: 0, cyan: 0, blue: 0},
  round: 0,
  roundStarted: false,
  cardsDrawn: [],
  p1: {
    name: 'should be players actual name from game',
    wallet: 0,
    amountBet: 0,
    colorBet: '',
    points: 0
  },
  p2: {
    name: 'CPU if singleplayer, hooman if multiplayer',
    wallet: 0,
    amountBet: 0,
    colorBet: '',
    points: 0
  },
  p3: {
    name: 'CPU Bob',
    wallet: 0,
    amountBet: 0,
    colorBet: '',
    points: 0
  },
  p4: {
    name: 'CPU Quinn',
    wallet: 0,
    amountBet: 0,
    colorBet: '',
    points: 0
  } // cpu
});