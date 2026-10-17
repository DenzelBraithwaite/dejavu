import { writable } from 'svelte/store';

export type PlayerId = 'p1' | 'p2';

export type SessionState = {
  status: 'connecting' | 'joined' | 'full' | 'error';
  playerId: PlayerId | null;
  playerCount: number;
  bothPlayersConnected: boolean;
  error: string;
};

export const sessionState = writable<SessionState>({
  status: 'connecting',
  playerId: null,
  playerCount: 0,
  bothPlayersConnected: false,
  error: ''
});
