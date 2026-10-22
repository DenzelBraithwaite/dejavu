import { derived, writable } from 'svelte/store';
import { sessionState, type PlayerId } from './session';

export type StoryNode = {
  id: string;
  type: string;
  audience?: 'both' | PlayerId;
  speaker?: string;
  characterId?: string;
  expression?: 'normal' | 'shocked' | 'angry' | 'sad' | 'happy';
  portrait?: string;
  portraitAlt?: string;
  text?: string;
  prompt?: string;
  placeholder?: string;
  next?: string;
  choices?: Array<{
    id: string;
    label: string;
    next: string;
    effects?: Array<Record<string, unknown>>;
  }>;
  maxLength?: number;
  checkpointId?: string;
  firstPlayer?: PlayerId | 'random';
  messagesPerPlayer?: Partial<Record<PlayerId, number>>;
  die?: 4 | 6 | 8 | 10 | 12 | 20;
  stat?: string;
  threshold?: number;
  success?: string;
  failure?: string;
  durationMs?: number;
  fallbackChoiceId?: string;
  src?: string;
  alt?: string;
  background?: string;
  music?: string | null;
  sound?: string;
  screenEffect?: 'shake' | 'blink';
  attachedTo?: string;
  clearTerminal?: boolean;
  minigameId?: string;
  resultNext?: Record<string, string>;
  effects?: Array<Record<string, unknown>>;
  condition?: Record<string, unknown>;
  trueNext?: string;
  falseNext?: string;
  [key: string]: unknown;
  map?: 'singleplayer' | 'multiplayer';
};

export type StoryDocument = {
  schemaVersion: number;
  id: string;
  title: string;
  description: string;
  author: string;
  status: 'playable';
  version: number;
  builtIn: boolean;
  playModes: {
    singleplayer: boolean;
    multiplayer: boolean;
  };
  mainCharacterIds: {
    singleplayer: string | null;
    multiplayer: Record<PlayerId, string | null>;
  };
  characterIds: string[];
  singleplayerInitialSceneId: string;
  initialSceneIds: Record<PlayerId, string>;
  nodes: StoryNode[];
  theme: Record<string, unknown>;
  supportedMinigames: string[];
};

export type StorySummary = Pick<
  StoryDocument,
  'id' | 'title' | 'description' | 'author' | 'status' | 'version' | 'builtIn' | 'playModes'
> & {
  createdAt: string;
  updatedAt: string;
};

export type LibraryState = {
  stories: StorySummary[];
  selections: Record<PlayerId, string | null>;
  selectionModes: Record<PlayerId, 'singleplayer' | 'multiplayer' | null>;
  activeStoryId: string | null;
  activeStoryMode: 'singleplayer' | 'multiplayer' | null;
  activeSoloPlayerId: PlayerId | null;
};

export const libraryState = writable<LibraryState>({
  stories: [],
  selections: {
    p1: null,
    p2: null
  },
  selectionModes: {
    p1: null,
    p2: null
  },
  activeStoryId: null,
  activeStoryMode: null,
  activeSoloPlayerId: null
});

export const localStorySelection = derived(
  [libraryState, sessionState],
  ([$libraryState, $sessionState]) => (
    $sessionState.playerId
      ? $libraryState.selections[$sessionState.playerId]
      : null
  )
);
