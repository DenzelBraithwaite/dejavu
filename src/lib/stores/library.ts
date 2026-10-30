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
  portraitPosition?: {
    x: number;
    y: number;
  };
  text?: string;
  continueLabel?: string;
  hoverEffectsEnabled?: boolean;
  hoverBackgroundColor?: string;
  hoverTextColor?: string;
  hoverText?: string;
  prompt?: string;
  placeholder?: string;
  inputKey?: string;
  saveInput?: boolean;
  showPlayerPortrait?: boolean;
  playerExpression?: 'normal' | 'shocked' | 'angry' | 'sad' | 'happy';
  next?: string;
  choices?: Array<{
    id: string;
    label: string;
    hoverText?: string;
    next: string;
    disabled?: boolean;
    condition?: {
      type: 'has-item' | 'flag-equals' | 'stat-at-least' | 'relationship-at-least' | 'relationship-at-most' | 'decision-made';
      key: string;
      value?: string | number | boolean;
    };
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
  timed?: boolean;
  showCountdown?: boolean;
  spectatorRoll?: boolean;
  decisionSeverity?: 'none' | 'minor' | 'major';
  src?: string;
  alt?: string;
  logText?: string;
  imagePositionX?: number;
  imagePositionY?: number;
  imageBorderColor?: string;
  background?: string;
  backgroundTheme?: 'blue' | 'red' | 'purple' | 'green' | 'amber' | 'pink' | 'cyan' | 'white';
  music?: string | null;
  sound?: string;
  audioKind?: 'music' | 'sound';
  stopMusic?: boolean;
  audioId?: string;
  audioLayer?: number;
  audioLoop?: boolean;
  audioVolume?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  audioRangeMode?: 'full' | 'partial';
  audioStartSeconds?: number;
  audioStopSeconds?: number;
  audioDurationSeconds?: number;
  stopMusicIds?: string[];
  stopMusicLayers?: number[];
  stopSounds?: boolean;
  screenEffect?: 'color' | 'shake' | 'blink' | 'mirror' | 'spin' | 'glow' | 'scan';
  effectDurationSeconds?: number;
  effectIterations?: number;
  effectLoop?: boolean;
  mirrorAxis?: 'horizontal' | 'vertical' | 'both';
  spinDirection?: 'clockwise' | 'counterclockwise';
  effectColor?: string;
  scanDirection?: 'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top';
  attachedTo?: string;
  minigameId?: string;
  resultNext?: Record<string, string>;
  effects?: Array<Record<string, unknown>>;
  condition?: Record<string, unknown>;
  trueNext?: string;
  falseNext?: string;
  [key: string]: unknown;
  map?: 'singleplayer' | 'multiplayer';
};

export type AudioAsset = {
  name: string;
  path: string;
  kind: 'music' | 'sound';
};

export type EditorHandoff = {
  storyId: string;
  nodeId: string;
  map: 'singleplayer' | 'multiplayer';
};

export type StoryRelationship = {
  id: string;
  characterId: string;
  playerId: PlayerId;
  initialValue: number;
  minimum: number;
  maximum: number;
  visible: boolean;
};

export type StoryDocument = {
  schemaVersion: number;
  id: string;
  title: string;
  description: string;
  author: string;
  status: 'playable' | 'draft';
  unavailableReason: string;
  protected: boolean;
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
  relationships: StoryRelationship[];
  singleplayerInitialSceneId: string;
  initialSceneIds: Record<PlayerId, string>;
  multiplayerStartMode: 'shared' | 'separate';
  nodes: StoryNode[];
  theme: Record<string, unknown>;
  supportedMinigames: string[];
};

export type StorySummary = Pick<
  StoryDocument,
  'id' | 'title' | 'description' | 'author' | 'status' | 'version' | 'builtIn' | 'protected' | 'playModes' | 'multiplayerStartMode' | 'unavailableReason'
> & {
  createdAt: string;
  updatedAt: string;
};

export type LibraryState = {
  stories: StorySummary[];
  selections: Record<PlayerId, string | null>;
  selectionModes: Record<PlayerId, 'singleplayer' | 'multiplayer' | null>;
  seatClaims: Record<PlayerId, PlayerId | null>;
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
  seatClaims: {
    p1: null,
    p2: null
  },
  activeStoryId: null,
  activeStoryMode: null,
  activeSoloPlayerId: null
});

export const editorHandoff = writable<EditorHandoff | null>(null);

export const localStorySelection = derived(
  [libraryState, sessionState],
  ([$libraryState, $sessionState]) => (
    $sessionState.playerId
      ? $libraryState.selections[$sessionState.playerId]
      : null
  )
);
