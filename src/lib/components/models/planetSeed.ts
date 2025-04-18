// Only 1 of these per save, first type of seed grown.
// This is to create the planet which all other seeds will be grown.
import Seed from './seed';

interface PlanetSeedOptions {
  family?: string;
  title?: string;
  possibleOffspring?: string[];
  possibleSeedDrop?: string[];
  numOfDays?: number;
  numOfDaysRemaining?: number;
  chanceToDropSeed?: number;
  minSeedDrop?: number;
  maxSeedDrop?: number;
  minExpGain?: number;
  maxExpGain?: number;
  description?: string;
  successRate?: number;
  isGrown?: boolean;
}

// By using all of these as constructors, I can easily rebuild a save file.
export default class PlanetSeed extends Seed {
  public id: number = 0;
  public family: string = 'planet';
  public title: string = 'Planet Seed';
  public possibleOffspring: string[] = ['planet'];
  public possibleSeedDrop: string[] = ['Water Seed'];
  public numOfDays: number = 1;
  public numOfDaysRemaining: number = 1;
  public chanceToDropSeed: number = 100;
  public minSeedDrop: number = 1;
  public maxSeedDrop: number = 1;
  public minExpGain: number = 50;
  public maxExpGain: number = 50;
  public description: string = 'Grows a planet which more seeds can be grown from.';
  public successRate: number = 100;
  public isGrown: boolean = false;

  constructor(options: PlanetSeedOptions) {
    super(options);

    // TODO: set id based on global seed count

  }
}