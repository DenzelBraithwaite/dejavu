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

export let d4Dice = new PolyhedralDice(4, 'd4-dice.png');
export let d6Dice = new PolyhedralDice(6, 'd6-dice.png');
export let d8Dice = new PolyhedralDice(8, 'd8-dice.png');
export let d10Dice = new PolyhedralDice(10, 'd10-dice.png');
export let d12Dice = new PolyhedralDice(12, 'd12-dice.png');
export let d20Dice = new PolyhedralDice(20, 'd20-dice.png');