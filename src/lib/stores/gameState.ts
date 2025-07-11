import { writable } from 'svelte/store';

export type GameState = {
  playingAs: 'male' | 'female' | '';
  bothPlayersJoined: boolean;
  chapter5NumOfReadyPlayers: number;
  chapter11NumOfReadyPlayers: number;
  showDiceTerminal: boolean;
  userDialogue: string;
};

export const currentGameState = writable<GameState>({
  playingAs: '',
  bothPlayersJoined: false,
  chapter5NumOfReadyPlayers: 0,
  chapter11NumOfReadyPlayers: 0,
  showDiceTerminal: false,
  userDialogue: ''
});