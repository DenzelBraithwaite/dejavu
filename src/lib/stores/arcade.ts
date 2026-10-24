import { writable } from 'svelte/store';
import type { PlayerId } from './session';

export type ArcadeGameId =
  | 'lo-hi'
  | 'mastermind'
  | 'chopsticks'
  | 'ghost-packet'
  | 'firewall-auction'
  | 'drone-relay';

export type ArcadeState = {
  game: ArcadeGameId;
  status: 'menu' | 'waiting' | 'playing' | 'finished';
  participants: Record<PlayerId, boolean>;
  participantCount: number;
  players: Record<string, Record<string, any> & { name: string }>;
  winner: string | null;
  log: Array<{ id: string; message: string }>;
  [key: string]: any;
};

export const arcadeStates = writable<Partial<Record<ArcadeGameId, ArcadeState>>>({});
