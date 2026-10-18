import { writable } from 'svelte/store';
import type { PlayerId } from './session';

export type PacketProgram = {
  id: string;
  name: string;
  cost: number;
  description: string;
  color: string;
  quantity: number;
  builtIn: boolean;
  boss?: boolean;
  multiplayerOnly?: boolean;
  retainTurn?: boolean;
  effects: Array<{
    type: string;
    target: string;
    amount: number;
  }>;
};

export type PacketWarCombatant = {
  name: string;
  integrity: number;
  shield: number;
  malware: number;
  teamStatsBlinded?: boolean;
};

export type PacketWarPlayer = PacketWarCombatant & {
  bandwidth: number;
  bandwidthIncome: number;
  hand: string[];
  deck: string[];
};

export type PacketWarLogEntry = {
  id: number;
  type: 'system' | 'program';
  actor: string;
  actorType: 'system' | 'ally' | 'runner' | 'black-ice';
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
  lastAllyProgram: PacketWarLogEntry | null;
  lastBreachProgram: PacketWarLogEntry | null;
  rematchVotes: Record<PlayerId, boolean | null>;
  programs: Record<string, PacketProgram>;
  cardLibrary: Record<string, PacketProgram>;
  bossLibrary: Record<string, PacketProgram>;
};

export const packetWarServerState = writable<PacketWarState | null>(null);
