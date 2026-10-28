import { derived, writable } from 'svelte/store';
import { sessionState, type PlayerId } from './session';

export type CharacterExpression = 'normal' | 'shocked' | 'angry' | 'sad' | 'happy';
export type CharacterType = 'account' | 'playable' | 'npc';

export type CharacterRecord = {
  id: string;
  name: string;
  wallet: number;
  stats: Record<string, number>;
  images: Record<CharacterExpression, string>;
  imagePositions: Record<CharacterExpression, {
    x: number;
    y: number;
  }>;
  notes: string;
  type: CharacterType;
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CharacterLibraryState = {
  characters: CharacterRecord[];
  selections: Record<PlayerId, string | null>;
};

export const characterLibraryState = writable<CharacterLibraryState>({
  characters: [],
  selections: {
    p1: null,
    p2: null
  }
});

export const activeCharacter = derived(
  [characterLibraryState, sessionState],
  ([$characterLibraryState, $sessionState]) => {
    const playerId = $sessionState.playerId;
    const characterId = playerId
      ? $characterLibraryState.selections[playerId]
      : null;

    return $characterLibraryState.characters.find(
      (character) => character.id === characterId
    ) ?? null;
  }
);
