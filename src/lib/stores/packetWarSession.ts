import { writable } from 'svelte/store';
import type { PlayerId } from './session';

export type PacketProgram = {
  name: string;
  cost: number;
  description: string;
};

export type PacketWarCombatant = {
  name: string;
  integrity: number;
  shield: number;
  malware: number;
};

export type PacketWarPlayer = PacketWarCombatant & {
  bandwidth: number;
  hand: string[];
  deck: string[];
};

export type PacketWarLogEntry = {
  id: number;
  type: 'system' | 'program';
  actor: string;
  cardId: string | null;
  cardName: string | null;
  message: string;
};

export type PacketWarState = {
  version: number;
  mode: 'duel' | 'coop' | null;
  status: 'menu' | 'waiting' | 'playing' | 'finished';
  participants: Record<PlayerId, boolean>;
  participantCount: number;
  players: Record<PlayerId, PacketWarPlayer>;
  breach: PacketWarCombatant;
  activePlayer: PlayerId;
  round: number;
  winner: PlayerId | 'players' | 'breach' | null;
  log: PacketWarLogEntry[];
  eventSequence: number;
  lastProgram: PacketWarLogEntry | null;
  rematchVotes: Record<PlayerId, boolean | null>;
  programs: Record<string, PacketProgram>;
};

export const packetWarServerState = writable<PacketWarState | null>(null);
