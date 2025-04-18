// This serves as a save file with all of the settings about the current game.
// 1 is required to play, all other models/classes live inside a world.
import { Seed, PlanetSeed } from './index';

interface PlayerOptions {
  id?: number; // ID for save file.
  playerName?: string; // Player's chosen name
  playerLevel?: number; // Player's current level
  playerExp?: number; // Player's current level of exp (max 100)
  playerInventory?: Seed[]; // All inventory will be instances of children of the Seed class.
}

// By using all of these as constructors, I can easily rebuild a save file.
export default class Player {
  public id: number = 0;
  public playerName: string = 'Player';
  public playerLevel: number = 1;
  public playerExp: number = 0;
  public playerInventory: Seed[] = [new PlanetSeed({})];

  // Because 0 is valid, I use ?? instead of ||.
  constructor(options: PlayerOptions) {
    this.id = options.id ?? this.id;
    this.playerName = options.playerName ?? this.playerName;
    this.playerLevel = options.playerLevel ?? this.playerLevel;
    this.playerExp = options.playerExp ?? this.playerExp;
    this.playerInventory = options.playerInventory ?? this.playerInventory;
  }
}