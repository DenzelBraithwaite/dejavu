import { writable } from 'svelte/store';
import type { CardColor } from './netRunnersGameState';

export type NetRunnersServerState = {
  version: number;
  mode: 'multiplayer';
  status: 'menu' | 'waiting' | 'betting' | 'racing' | 'finished';
  participants: Record<'p1' | 'p2', boolean>;
  participantCount: number;
  players: Record<string, {
    name: string;
    money: number;
    amountBet: number;
    colorBet: CardColor;
    ready: boolean;
    points: number;
    hasLost: boolean;
  }>;
  trackCards: CardColor[];
  cardsDrawn: CardColor[];
  odds: {
    purple: number;
    pink: number;
    yellow: number;
    cyan: number;
    blue: number;
  };
  points: {
    purple: number;
    pink: number;
    yellow: number;
    cyan: number;
    blue: number;
  };
  winner: CardColor;
  nextDrawAt: number | null;
  drawIntervalMs: number;
  rematchVotes: Record<'p1' | 'p2', boolean | null>;
  shuffleVotes: Record<'p1' | 'p2', boolean>;
};

export const netRunnersServerState = writable<NetRunnersServerState | null>(null);
