// @ts-ignore
import { writable } from 'svelte/store';

export type Player = {
  id?: string;
  name: string; // Player will choose this.
  gender: 'male' | 'female'; // This is mainly to know who is playing who since 1 char is a girl and the other is male.
  isTurn?: boolean; // Turn to roll dice maybe, not sure, can be useful.
  // Most are base stats that add to dice rolls.
  stats: {
    muscles: number; // Determines ability to move heavy objects.
    toughness: number; // Determines how resistant they are to damage of any kind.
    speed: number; // Determines how quickly they can move. Useful for chasing and running away.
    stealth: number; // Determines your ability to sneak past others.
    smarts: number; // Determines how knowledgeable you are about the world.
    ocuware: number; // Determines if you notice things that others might miss like a light switch in a dark rom.
    cred: number; // Determines your ability to convince others.
    luck: number; // Can be helpful in any situation. Is added to all stats during rolls.
    hacking: number; // Determines hacking ability.
  };
  statusEffects?: ('dead' | 'asleep' | 'sick')[],
  inventory?: any[];
}
export type PlayerStats = keyof Player['stats'];

export const player1 = writable<Player>({
  id: 'p1',
  name: 'Byte',
  gender: 'male',
  isTurn: false,
  stats: {
    muscles: 11,
    toughness: 10,
    speed: 9,
    stealth: 8,
    smarts: 12,
    ocuware: 10,
    cred: 15,
    luck: 2,
    hacking: 17
  },
  statusEffects: [],
  inventory: []
});

export const player2 = writable<Player>({
  id: 'p2',
  name: 'Bit',
  gender: 'female',
  isTurn: false,
  stats: {
    muscles: 8,
    toughness: 9,
    speed: 10,
    stealth: 12,
    smarts: 11,
    ocuware: 20,
    cred: 13,
    luck: 4,
    hacking: 6,
  },
  statusEffects: [],
  inventory: []
});