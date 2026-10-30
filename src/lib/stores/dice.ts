export class PolyhedralDice {
  numOfSides: number;
  imgUrl: string;

  constructor(numOfSides: number, imgUrl:  string) {
    this.numOfSides = numOfSides;
    this.imgUrl = imgUrl;
  }

  roll() {
    return Math.ceil(Math.random() * this.numOfSides);
  }
}

export let d4Dice = new PolyhedralDice(4, 'media/minigames/dice/d4-dice.png');
export let d6Dice = new PolyhedralDice(6, 'media/minigames/dice/d6-dice.png');
export let d8Dice = new PolyhedralDice(8, 'media/minigames/dice/d8-dice.png');
export let d10Dice = new PolyhedralDice(10, 'media/minigames/dice/d10-dice.png');
export let d12Dice = new PolyhedralDice(12, 'media/minigames/dice/d12-dice.png');
export let d20Dice = new PolyhedralDice(20, 'media/minigames/dice/d20-dice.png');
