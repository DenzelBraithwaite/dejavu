import { writable } from 'svelte/store';

export type GameState = {
  playingAs: 'male' | 'female' | ''; // Useful to know who the player is playing as
  bothPlayersJoined: boolean; // For starting the game
  numOfReadyPlayers: number; // When 1 player arrives at a dialogue checkpoint first they must wait for the other.
  showDiceTerminal: boolean; // Displays dice terminal and rolls for a stat.
  userDialogue: string; // Dialogue a player types into the terminal.

  // Updates terminal (for reactivity), the prompt1-2-3 are arguments to pass for the updateTerminal fn in Terminal.svelte
  updateTerminal: {
    prompt1: boolean;
    prompt2: boolean;
    prompt3: boolean;
  }
};

export const currentGameState = writable<GameState>({
  playingAs: '',
  bothPlayersJoined: false,
  numOfReadyPlayers: 0,
  showDiceTerminal: false,
  userDialogue: '',
  updateTerminal: {
    prompt1: false,
    prompt2: false,
    prompt3: false
  }
});