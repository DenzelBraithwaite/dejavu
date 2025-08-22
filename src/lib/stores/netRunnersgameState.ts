import { writable } from 'svelte/store';

export type CardColor = ('purple' | 'purple' | 'yellow' | 'cyan' | 'blue' | string);
export type NetRunnersGameState = {
  singleplayer: boolean;
  infoVisible: boolean;
  gameInProgress: boolean;
  menuVisible: boolean;
  colorSelectVisible: boolean;
  betSelectVisible: boolean;
  lanesVisible: boolean;
  colorOddsVisible: boolean;
  colorOddsCardsVisible: boolean;
  colorsProgressVisible: boolean;
  gameControlsVisible: boolean;
  drawBtnVisible: boolean;
  gamblingCardsVisible: boolean;
  lastWinningColor: CardColor;
  fullDeck: CardColor[];
  trackCards: CardColor[];
  odds: {
    purple: number,
    pink: number,
    yellow: number,
    cyan: number,
    blue: number
  };
  points: {
    purple: number,
    pink: number,
    yellow: number,
    cyan: number,
    blue: number
  };
  round: number;
  roundStarted: boolean;
  cardsDrawn: CardColor[];
  p1: {
    name: string;
    money: number;
    amountBet: number;
    colorBet: string;
    points: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
    hasLost: boolean;
  },
  p2: {
    name: string;
    money: number;
    amountBet: number;
    colorBet: string;
    points: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
    hasLost: boolean;
  },
  p3: {
    name: string;
    money: number;
    amountBet: number;
    colorBet: string;
    points: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
    hasLost: boolean;
  },
  p4: {
    name: string;
    money: number;
    amountBet: number;
    colorBet: string;
    points: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
    hasLost: boolean;
  }
};

export const netRunnersGameState = writable<NetRunnersGameState>({
  singleplayer: true,
  infoVisible: false,
  gameInProgress: false,
  menuVisible: true,
  colorSelectVisible: false,
  betSelectVisible: false,
  lanesVisible: false,
  colorOddsVisible: true,
  colorOddsCardsVisible: true,
  colorsProgressVisible: false,
  gameControlsVisible: false,
  drawBtnVisible: false,
  gamblingCardsVisible: false,
  lastWinningColor: '',
  fullDeck: [...Array(15).fill('purple'), ...Array(15).fill('purple'), ...Array(15).fill('yellow'), ...Array(15).fill('cyan'), ...Array(15).fill('blue')],
  trackCards: [],
  odds: {purple: 0, pink: 0, yellow: 0, cyan: 0, blue: 0},
  points: {purple: 0, pink: 0, yellow: 0, cyan: 0, blue: 0},
  round: 0,
  roundStarted: false,
  cardsDrawn: [],
  p1: {
    name: 'Kaz',
    money: 1000,
    amountBet: 0,
    colorBet: '',
    points: 0,
    hasLost: false
  },
  p2: {
    name: 'CPhUman',
    money: 500,
    amountBet: 0,
    colorBet: '',
    points: 0,
    hasLost: false
  },
  p3: {
    name: 'Moon',
    money: 3000,
    amountBet: 0,
    colorBet: '',
    points: 0,
    hasLost: false
  },
  p4: {
    name: 'Slides',
    money: 200,
    amountBet: 0,
    colorBet: '',
    points: 0,
    hasLost: false
  } // cpu
});