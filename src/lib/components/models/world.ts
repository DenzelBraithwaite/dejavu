// This serves as a save file with all of the settings about the current game.
// 1 is required to play, all other models/classes live inside a world.

// Models
import { Player, Seed } from './index';

// stores
import { terminalMessages } from '../../stores/terminalMessages';

type WorldDay = 'Unoni'; 'Twodi'; 'Tredi'; 'Quadi'; 'penti'; 'hexi';
type WorldMonth = 'New' | 'Waning Crescent' | 'Tredi Quarter' | 'Waning Gibbous' | 'Full' | 'Waxing Gibbous' | 'Uno Quarter' | 'Waxing Crescent';
interface WorldOptions {
  id?: number; // ID for save file.
  worldName?: string; // Name of world / save file / planet
  maxActions?: number; // Max actions player has each day.
  remainingActions?: number; // Remaining daily actions, refreshes daily.
  dayCount?: number; // num of days since game started, 1 indexed.
  currentDay?: WorldDay; // Hexi the 6th day is the weekend
  currentDayIndex?: number; // e.g. Unoni = 1, not 0 indexed
  currentWeek?: number; // e.g. 2 for second week of year
  currentMonth?: WorldMonth; // append 'moon' to all month names
  currentMonthIndex?: number; // e.g. 3 for third month of year
  currentYear?: string; // e.g. year of the farmer, something where each year something changes e.g. farming is enhanced.
  currentYearIndex?: number; // e.g. year 1 or year 2024
  currentSeason?: string; // e.g. winter
  plantedSeeds?: Seed[] // List of curently planted seeds on planet.
  unlockedSeeds?: Seed[] // List of all unlocked / available seeds.
  player?: Player; // Instance of player class, has props and methods related to player.
}

// By using all of these as constructors, I can easily rebuild a save file.
export default class World {
  public id: number = 0;
  public worldName: string = 'World';
  public maxActions: number = 1;
  public remainingActions: number = 1;
  public dayCount: number = 1;
  public currentDay: WorldDay = 'Unoni';
  public currentDayIndex: number = 1;
  public currentWeek: number = 1;
  public currentMonth: WorldMonth = 'New';
  public currentMonthIndex: number = 1;
  public currentYear: string = 'Year of the Farmer';
  public currentYearIndex: number = 1;
  public currentSeason: string = 'Spring';
  public plantedSeeds: Seed[] = [];
  public unlockedSeeds: Seed[] = [];
  public player: Player = new Player({ playerName: 'Guest' });

  // Because 0 is valid, I use ?? instead of ||.
  constructor(options: WorldOptions) {
    this.id = options.id ?? this.id;
    this.worldName = options.worldName ?? this.worldName;
    this.maxActions = options.maxActions ?? this.maxActions;
    this.remainingActions = options.remainingActions ?? this.remainingActions;
    this.dayCount = options.dayCount ?? this.dayCount;
    this.currentDay = options.currentDay ?? this.currentDay;
    this.currentDayIndex = options.currentDayIndex ?? this.currentDayIndex;
    this.currentWeek = options.currentWeek ?? this.currentWeek;
    this.currentMonth = options.currentMonth ?? this.currentMonth;
    this.currentMonthIndex = options.currentMonthIndex ?? this.currentMonthIndex;
    this.currentYear = options.currentYear ?? this.currentYear;
    this.currentYearIndex = options.currentYearIndex ?? this.currentYearIndex;
    this.currentSeason = options.currentSeason ?? this.currentSeason;
    this.plantedSeeds = options.plantedSeeds ?? this.plantedSeeds;
    this.unlockedSeeds = options.unlockedSeeds ?? this.unlockedSeeds;
    this.player = options.player ?? this.player;

    // Set some default values if there are none, which there shouldn't be.
    localStorage.getItem('worldCount') ?? localStorage.setItem('worldCount', '1')
    localStorage.getItem('seedCount') ?? localStorage.setItem('seedCount', '1')
  }

  startGame(): void {
    this.newDay();
  }

  isFirstDay(): boolean {
    return this.dayCount === 1;
  }

  firstDay(): void {
    this.displayWorldStats();
    // TODO: rest of first day stuff.
  }

  newDay(): void {
    if (this.isFirstDay()) {
      this.firstDay();
      return;
    }

    this.remainingActions = this.maxActions;
    this.plantedSeeds.forEach(seed => seed.numOfDaysRemaining -= 1);
    this.harvestSeeds();

    // TODO: Begin flow of "what would you like to do" as long as points remaining.
    // TODO: 
    // TODO: 
    // TODO: 

  }

  displayWorldStats(): void {
    let textArray: string[] = [
      `
      Remaining Actions: ${this.remainingActions}<br>
      Days Passed: ${this.dayCount}<br>
      Current Day: ${this.currentDay}<br>
      Day of the year: ${this.currentDayIndex}<br>
      Current Week: ${this.currentWeek}<br>
      Current Month: ${this.currentMonth} Moon<br>
      Month of the Year: ${this.currentMonthIndex}<br>
      Current Year: ${this.currentYearIndex} - ${this.currentYear}<br>
      Current Season: ${this.currentSeason}<br>
      dumy text to fill screen<br>
      for<br>
      scrollbar<br>
      .<br>
      .<br>
      .<br>
      .<br>
      .<br>
      .<br>
      .<br>
      .<br>
      .<br>
      .<br>
      .<br>
      .<br>
      .<br>
      .<br>
      .
      `,
    ];
    
    terminalMessages.set(textArray);
  }
  
  // TODO: Displays info about harvested seeds
  displayHarvestYield(): string[] {
    let textArray: string[] = [];

    return textArray;
  }

  plantSeed(seed: Seed): void {
    this.remainingActions -= 1;

    // TODO: plant seed logic
  }

  harvestSeeds(): void {
    if (this.plantedSeeds.length === 0) return;
    this.plantedSeeds.forEach(seed => {
      if (seed.numOfDaysRemaining === 0) {
        seed.isGrown = true;
        this.player.playerInventory = [...this.player.playerInventory, {...seed}];
        const index = this.plantedSeeds.indexOf(seed);
        this.plantedSeeds.splice(index, 1);
      }
    })
    // TODO: adds all harvested seeds to inventory

    // TODO: Makes toast (in future will be long vertical scrollable list, toast closed with x only) of all seeds grown.
  }

  hasActionsRemaining(): boolean {
    return this.remainingActions > 0;
  }
}