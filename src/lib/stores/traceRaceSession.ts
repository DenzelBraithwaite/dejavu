import { writable } from 'svelte/store';
import type { PlayerId } from './session';

export type TraceRacePlayer = {
  name: string;
  position: number | null;
  exposure: number;
  lastTraceRange: number | null;
  intel: string[];
};

export type TraceRaceState = {
  version: number;
  status: 'menu' | 'waiting' | 'playing' | 'finished';
  participants: Record<PlayerId, boolean>;
  participantCount: number;
  players: Record<PlayerId, TraceRacePlayer>;
  activePlayer: PlayerId;
  winner: PlayerId | null;
  turn: number;
  rematchVotes: Record<PlayerId, boolean | null>;
  networkLinks: [number, number][];
  nodeCount: number;
};

export const traceRaceServerState = writable<TraceRaceState | null>(null);
