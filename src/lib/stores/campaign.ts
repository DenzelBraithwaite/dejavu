import { derived, writable } from 'svelte/store';
import {
  libraryState,
  type StoryDocument,
  type StoryRelationship
} from './library';
import type { CharacterRecord } from './characters';
import { sessionState, type PlayerId } from './session';

export type CampaignPlayer = {
  characterId: string | null;
  defaultName: string;
  customName: string;
  name: string;
  wallet: number;
  stats: Record<string, number>;
  inventory: string[];
  itemImages: Record<string, string>;
  knownCharacters: string[];
  statusEffects: string[];
  relationships: Record<string, number>;
};

export type DiceRollResult = {
  sceneId: string;
  nextSceneId: string;
  die: 4 | 6 | 8 | 10 | 12 | 20;
  roll: number;
  stat: string;
  base: number;
  luck: number;
  total: number;
  threshold: number;
  successful: boolean;
};

export type TerminalOutputEntry = {
  kind?: 'text' | 'image';
  sceneId: string;
  speaker: string;
  text: string;
  src?: string;
  alt?: string;
  logText?: string;
  imagePositionX?: number;
  imagePositionY?: number;
  imageBorderColor?: string;
  portrait?: string;
  portraitAlt?: string;
  portraitPosition?: {
    x: number;
    y: number;
  };
  createdAt: string;
};

export type CampaignState = {
  version: number;
  serverTime: number;
  campaignId: string;
  story: StoryDocument | null;
  relationshipDefinitions: StoryRelationship[];
  sessionMode: 'singleplayer' | 'multiplayer';
  soloPlayerId: PlayerId | null;
  currentScene: Record<PlayerId, string>;
  lastScene: Record<PlayerId, string>;
  players: Record<PlayerId, CampaignPlayer>;
  defaultCharacterIds: Record<PlayerId, string | null>;
  characters: CharacterRecord[];
  installedMods: string[];
  flags: Record<string, string | number | boolean>;
  inputs: Record<PlayerId, Record<string, string>>;
  checkpoints: Record<string, PlayerId[]>;
  conversations: Record<string, {
    activePlayer: PlayerId;
    messageCounts: Record<PlayerId, number>;
    requiredMessages: Record<PlayerId, number>;
    messages: Array<{
      playerId: PlayerId;
      playerName: string;
      text: string;
      createdAt: string;
    }>;
  }>;
  votes: Record<string, Partial<Record<PlayerId, string>>>;
  minigames: Record<string, {
    readyPlayers: PlayerId[];
  }>;
  activeMinigame: {
    id: string;
    sceneId: string;
    ownerPlayerId?: PlayerId;
    perspectivePlayerId?: PlayerId;
    startedAt: string;
  } | null;
  pendingDice: Partial<Record<PlayerId, DiceRollResult>>;
  appliedCompanions: Record<PlayerId, string[]>;
  terminalOutput: Record<PlayerId, TerminalOutputEntry[]>;
  endedPlayers: PlayerId[];
  deadlines: Partial<Record<PlayerId, number>>;
  transcript: Array<Record<string, unknown>>;
  decisions: Array<Record<string, unknown>>;
  updatedAt: string;
};

export const campaignState = writable<CampaignState | null>(null);

export const localPlayer = derived(
  [campaignState, sessionState, libraryState],
  ([$campaignState, $sessionState, $libraryState]) => {
    if (!$campaignState || !$sessionState.playerId) {
      return null;
    }

    const storyPlayerId = $libraryState.activeStoryMode === 'multiplayer'
      ? (Object.entries($libraryState.seatClaims).find(
          ([, connectionId]) => connectionId === $sessionState.playerId
        )?.[0] as PlayerId | undefined) ?? $sessionState.playerId
      : $sessionState.playerId;

    return $campaignState.players[storyPlayerId];
  }
);
