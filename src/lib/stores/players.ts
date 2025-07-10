// @ts-ignore
import { writable } from 'svelte/store';

export type Player = {
  id?: string;
  name: string; // Player will choose this.
  gender: 'male' | 'female'; // This is mainly to know who is playing who since 1 char is a girl and the other is male.
  isTurn?: boolean; // Turn to roll dice maybe, not sure, can be useful.
  // Most are base stats that add to dice rolls.
  stats: {
    maxHealth: number; // Health value when full. TODO: I might remove health entirely from the game.
    health: number; // Current health value.
    strength: number; // Determines ability to move heavy objects and fight.
    defense: number; // Determines how resistant they are to damage of any kind.
    speed: number; // Determines how quickly they can move. Useful for chasing and running away.
    stealth: number; // Determines your ability to sneak past others.
    intellect: number; // Determines how knowledgeable you are about the world.
    perception: number; // Determines if you notice things that others might miss like a light switch in a dark rom.
    charisma: number; // Determines your ability to convince others.
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
    maxHealth: 17,
    health: 17,
    strength: 11,
    defense: 10,
    speed: 9,
    stealth: 8,
    intellect: 12,
    perception: 10,
    charisma: 15,
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
    maxHealth: 16,
    health: 16,
    strength: 8,
    defense: 9,
    speed: 10,
    stealth: 12,
    intellect: 11,
    perception: 20,
    charisma: 8,
  },
  statusEffects: [],
  inventory: []
});