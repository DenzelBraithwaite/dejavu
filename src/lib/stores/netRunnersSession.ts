import { writable } from 'svelte/store';

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
    colorBet: string;
    ready: boolean;
    points: number;
    hasLost: boolean;
  }>;
  trackCards: string[];
  cardsDrawn: string[];
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
  winner: string;
  nextDrawAt: number | null;
  drawIntervalMs: number;
  rematchVotes: Record<'p1' | 'p2', boolean | null>;
  shuffleVotes: Record<'p1' | 'p2', boolean>;
};

export const netRunnersServerState = writable<NetRunnersServerState | null>(null);
