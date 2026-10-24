import { writable } from 'svelte/store';

export type MinigameId =
  | 'netrunners'
  | 'billywig'
  | 'pigz'
  | 'trace-race'
  | 'packet-war'
  | 'lo-hi'
  | 'mastermind'
  | 'chopsticks'
  | 'ghost-packet'
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
  'ghost-packet',
  'firewall-auction',
  'drone-relay'
];

const initialSessions = Object.fromEntries(
  gameIds.map((id) => [id, { active: false }])
) as Record<MinigameId, MinigameSession>;

export const minigameSessions = writable(initialSessions);

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
