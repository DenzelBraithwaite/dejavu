import { derived, writable } from 'svelte/store';
import { sessionState, type PlayerId } from './session';

export type StoryNode = {
  id: string;
  type: string;
  audience?: 'both' | PlayerId;
  speaker?: string;
  text?: string;
  prompt?: string;
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
  attachedTo?: string;
  clearTerminal?: boolean;
  minigameId?: string;
  resultNext?: Record<string, string>;
  effects?: Array<Record<string, unknown>>;
  condition?: Record<string, unknown>;
  trueNext?: string;
  falseNext?: string;
  [key: string]: unknown;
};

export type StoryDocument = {
  schemaVersion: number;
  id: string;
  title: string;
  description: string;
  author: string;
  status: 'draft' | 'published';
  version: number;
  builtIn: boolean;
  initialSceneIds: Record<PlayerId, string>;
  nodes: StoryNode[];
  theme: Record<string, unknown>;
  supportedMinigames: string[];
};

export type StorySummary = Pick<
  StoryDocument,
  'id' | 'title' | 'description' | 'author' | 'status' | 'version' | 'builtIn'
> & {
  createdAt: string;
  updatedAt: string;
};

export type LibraryState = {
  stories: StorySummary[];
  selections: Record<PlayerId, string | null>;
  activeStoryId: string | null;
};

export const libraryState = writable<LibraryState>({
  stories: [],
  selections: {
    p1: null,
    p2: null
  },
  activeStoryId: null
});

export const localStorySelection = derived(
  [libraryState, sessionState],
  ([$libraryState, $sessionState]) => (
    $sessionState.playerId
      ? $libraryState.selections[$sessionState.playerId]
      : null
  )
);
