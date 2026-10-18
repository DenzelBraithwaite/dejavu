import { writable } from 'svelte/store';
import type { PlayerId } from './session';

export type PigzPlayer = {
  name: string;
  score: number;
  money: number;
  amountBet: number;
  ready: boolean;
};

export type PigzServerState = {
  version: number;
  status: 'menu' | 'waiting' | 'betting' | 'playing' | 'finished';
  participants: Record<PlayerId, boolean>;
  participantCount: number;
  players: Record<PlayerId, PigzPlayer>;
  currentPoints: number;
  activePlayer: PlayerId;
  lastRoll: number | null;
  rollSequence: number;
  winner: PlayerId | null;
  departureNotice: string | null;
  winningScore: number;
  rematchVotes: Record<PlayerId, boolean | null>;
};

export const pigzServerState = writable<PigzServerState | null>(null);
