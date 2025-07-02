// @ts-ignore
import { writable } from 'svelte/store';

export type Player = {
  id?: string;
  name: string; // Player will choose this.
  gender: 'male' | 'female'; // This is mainly to know who is playing who since 1 char is a girl and the other is male.
  isTurn?: boolean; // Turn to roll dice maybe, not sure, can be useful.
  // Most are base stats that add to dice rolls.
  stats: {
    maxHealth: number;
    health: number; // Current health
    strength: number; // Can you lift it or can you knock them out in one punch.
    defense: number; // Can you protect from something like a piano falling on head.
    speed: number; // Can you outrun a boulder rolling after you.
    intellect: number; // Can you sweet talk ur way outta trouble.
    charisma: number; // Can you sweet talk ur way outta trouble.
  };
  statusEffects?: ('dead' | 'asleep' | 'sick')[],
  inventory?: any[];
}
export type PlayerStats = keyof Player['stats'];

export const player1 = writable<Player>({
  id: 'p1',
  name: 'Peasant Boy',
  gender: 'male',
  isTurn: false,
  stats: {
    maxHealth: 20,
    health: 20,
    strength: 10,
    defense: 12,
    speed: 6,
    intellect: 7,
    charisma: 6,
  },
  statusEffects: [],
  inventory: []
});

export const player2 = writable<Player>({
  id: 'p2',
  name: 'Peasant Girl',
  gender: 'female',
  isTurn: false,
  stats: {
    maxHealth: 18,
    health: 18,
    strength: 7,
    defense: 6,
    speed: 9,
    intellect: 12,
    charisma: 10,
  },
  statusEffects: [],
  inventory: []
});