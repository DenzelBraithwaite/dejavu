import { derived, writable } from 'svelte/store';
import type { StoryDocument } from './library';
import { sessionState, type PlayerId } from './session';

export type CampaignPlayer = {
  name: string;
  stats: Record<string, number>;
  inventory: string[];
  knownCharacters: string[];
  statusEffects: string[];
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
  sceneId: string;
  speaker: string;
  text: string;
  createdAt: string;
};

export type CampaignState = {
  version: number;
  campaignId: string;
  story: StoryDocument | null;
  currentScene: Record<PlayerId, string>;
  players: Record<PlayerId, CampaignPlayer>;
  installedMods: string[];
  flags: Record<string, string | number | boolean>;
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
    startedAt: string;
  } | null;
  pendingDice: Partial<Record<PlayerId, DiceRollResult>>;
  appliedCompanions: Record<PlayerId, string[]>;
  terminalOutput: Record<PlayerId, TerminalOutputEntry[]>;
  deadlines: Partial<Record<PlayerId, number>>;
  transcript: Array<Record<string, unknown>>;
  decisions: Array<Record<string, unknown>>;
  updatedAt: string;
};

export const campaignState = writable<CampaignState | null>(null);

export const localPlayer = derived(
  [campaignState, sessionState],
  ([$campaignState, $sessionState]) => {
    if (!$campaignState || !$sessionState.playerId) {
      return null;
    }

    return $campaignState.players[$sessionState.playerId];
  }
);
