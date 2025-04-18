// The parent class of all seeds.
interface SeedOptions {
  family?: string; // What seed family is it from? e.g. plant or animal
  title?: string; // Name of this particular seed
  possibleOffspring?: string[]; // What this seed can grow into.
  possibleSeedDrop?: string[]; // What seeds can this seed drop during production e.g. a plant seed grows a plant and drops a car seed.
  numOfDays?: number; // How many days it takes to grow.
  numOfDaysRemaining?: number; // How many days left for it to grow.
  chanceToDropSeed?: number; // Chance for seed to drop during production.
  minSeedDrop?: number; // Minimum amount of seeds dropped if any are dropped.
  maxSeedDrop?: number; // Maximum amount of seeds dropped if any are dropped.
  minExpGain?: number; // Minimum amount of possible exp gain from harvest.
  maxExpGain?: number; // Maximum amount of possible exp gain from harvest.
  description?: string; // Describes the overall seed e.g. used for growing 'this', rare, found by growing 'that'.
  successRate?: number; // Num in % that the seed will grow and not fail (harvesting nothing, gain half xp).
  isGrown?: boolean; // Checks if plant is fully grown, e.g. numOfDaysRemaining = 0
}

// By using all of these as constructors, I can easily rebuild a save file.
export default class Seed {
  public id: number = 0; // ID for seed instance, not an option.
  public family: string = '';
  public title: string = '';
  public possibleOffspring: string[] = [];
  public possibleSeedDrop: string[] = [];
  public numOfDays: number = 0;
  public numOfDaysRemaining: number = 0;
  public chanceToDropSeed: number = 100;
  public minSeedDrop: number = 1;
  public maxSeedDrop: number = 1;
  public minExpGain: number = 0;
  public maxExpGain: number = 0;
  public description: string = '';
  public successRate: number = 100;
  public isGrown: boolean = false;

  // Because 0 is valid, I use ?? instead of ||.
  constructor(options: SeedOptions) {
    this.family = options.family ?? this.family;
    this.title = options.title ?? this.title;
    this.possibleOffspring = options.possibleOffspring ?? this.possibleOffspring;
    this.possibleSeedDrop = options.possibleSeedDrop ?? this.possibleSeedDrop;
    this.numOfDays = options.numOfDays ?? this.numOfDays;
    this.numOfDaysRemaining = options.numOfDaysRemaining ?? this.numOfDaysRemaining;
    this.chanceToDropSeed = options.chanceToDropSeed ?? this.chanceToDropSeed;
    this.minSeedDrop = options.minSeedDrop ?? this.minSeedDrop;
    this.maxSeedDrop = options.maxSeedDrop ?? this.maxSeedDrop;
    this.maxExpGain = options.maxExpGain ?? this.maxExpGain;
    this.minExpGain = options.minExpGain ?? this.minExpGain;
    this.description = options.description ?? this.description;
    this.successRate = options.successRate ?? this.successRate;
    this.isGrown = options.isGrown ?? this.isGrown;

    // TODO: Add to seed count for id
    // let seedCount = localStorage.getItem('seedCount');
    // const seedCountAsNum = +seedCount;
  }

  // FIXME: but then every seed needs this, how can i make this "optional"
  // FIXME: or at least where should these seed methods go? perhaps I define new seed type without methods?
  // FIXME: e.g. SeedInstance and SeedItem types?
  // Returns unique id for new seed instance.
  private setId(): number {
    // TODO: check global log of all seed ids, create one with +1 higher id
    const id = 0;
    return id;
  }
}