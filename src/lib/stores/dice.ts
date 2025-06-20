// @ts-ignore
import { writable } from 'svelte/store';

type Dice = {
  name: 'D4' | 'D6' | 'D8' | 'D10' | 'D12' | 'D20'; 
  numOfSides: 4 | 6 | 8 | 10 | 12 | 20;
  imgUrl: string;
}

export const d4Dice = writable<Dice>({
  name: 'D4',
  numOfSides: 4,
  imgUrl: '/d4.png'
});

export const d6Dice = writable<Dice>({
  name: 'D6',
  numOfSides: 6,
  imgUrl: ''
});

export const d8Dice = writable<Dice>({
  name: 'D8',
  numOfSides: 8,
  imgUrl: ''
});

export const d10Dice = writable<Dice>({
  name: 'D10',
  numOfSides: 10,
  imgUrl: ''
});

export const d12Dice = writable<Dice>({
  name: 'D12',
  numOfSides: 12,
  imgUrl: ''
});

export const d20Dice = writable<Dice>({
  name: 'D20',
  numOfSides: 20,
  imgUrl: ''
});