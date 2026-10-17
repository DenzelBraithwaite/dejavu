import { writable } from 'svelte/store';
import type { PlayerId } from './session';

export type ChatMessage = {
  id: string;
  playerId: PlayerId;
  playerName: string;
  text: string;
  createdAt: string;
};

export const chatMessages = writable<ChatMessage[]>([]);
