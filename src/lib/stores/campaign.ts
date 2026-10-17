import { derived, writable } from 'svelte/store';
import { sessionState, type PlayerId } from './session';

export type CampaignPlayer = {
  name: string;
  stats: Record<string, number>;
  inventory: string[];
  knownCharacters: string[];
  statusEffects: string[];
};

export type CampaignState = {
  version: number;
  campaignId: string;
  currentScene: Record<PlayerId, string>;
  players: Record<PlayerId, CampaignPlayer>;
  flags: Record<string, string | number | boolean>;
  checkpoints: Record<string, PlayerId[]>;
  conversations: Record<string, {
    activePlayer: PlayerId;
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
