import { writable } from 'svelte/store';
import type { CampaignState } from './campaign';
import type { PlayerId } from './session';

export type MinigameId =
  | 'netrunners'
  | 'billywig'
  | 'pigz'
  | 'trace-race'
  | 'packet-war'
  | 'lo-hi'
  | 'mastermind'
  | 'chopsticks'
  | 'firewall-auction'
  | 'drone-relay';

export type MinigameSession = {
  active: boolean;
};

const gameIds: MinigameId[] = [
  'netrunners',
  'billywig',
  'pigz',
  'trace-race',
  'packet-war',
  'lo-hi',
  'mastermind',
  'chopsticks',
  'firewall-auction',
  'drone-relay'
];

const initialSessions = Object.fromEntries(
  gameIds.map((id) => [id, { active: false }])
) as Record<MinigameId, MinigameSession>;

export const minigameSessions = writable(initialSessions);
export const storyMinigameView = writable(false);

export function playerOwnsStoryMinigame(
  state: CampaignState | null,
  playerId: PlayerId | null
): boolean {
  if (!state?.activeMinigame || !playerId) {
    return false;
  }

  if (state.sessionMode === 'multiplayer') {
    return true;
  }

  return state.activeMinigame.ownerPlayerId === playerId
    || state.activeMinigame.perspectivePlayerId === playerId;
}

export function setMinigameSessionActive(id: MinigameId, active: boolean): void {
  minigameSessions.update((sessions) => {
    if (sessions[id].active === active) {
      return sessions;
    }

    return {
      ...sessions,
      [id]: {
        active
      }
    };
  });
}
