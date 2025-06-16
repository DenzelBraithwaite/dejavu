import { writable } from 'svelte/store';
import { player1, player2, type Player } from './players';

// empty string so typedjs doesnt crash.
export const terminalMessages = writable<string[]>(['Click \'Next\' to begin.']);

// For all previously displayed messages.
export const terminalMessagesLog = writable<string[]>([]);

// For the current part in the chapter the players are at
export const chapter = writable('lobby');
export const chapterPart = writable('1a');

export type DialogueOptions = {
  option1Visible?: boolean;
  option1Disabled?: boolean;
  option1?: string;
  option2Visible?: boolean;
  option2Disabled?: boolean;
  option2?: string;
  option3Visible?: boolean;
  option3Disabled?: boolean;
  option3?: string;
  inputVisible?: boolean;
}

export function updateDialogueOptions(chapter: string, part: string, optionSelected = 0): DialogueOptions {
  let objToReturn: DialogueOptions = {};
  if (chapter === 'lobby') {
    switch (part) {
      case '1a':
        chapterPart.set('2a');
        objToReturn = {
          option1Visible: true,
          option1Disabled: false,
          option1: 'Next',
          option2Visible: false,
          option2Disabled: true,
          option2: '',
          option3Visible: false,
          option3Disabled: true,
          option3: '',
          inputVisible: false

        };
        break;
      case '2a':
        chapterPart.set('3a');
        objToReturn = {
          option1Visible: true,
          option1Disabled: false,
          option1: 'Next',
          option2Visible: false,
          option2Disabled: true,
          option2: '',
          option3Visible: false,
          option3Disabled: true,
          option3: '',
          inputVisible: true
        };
        break;
      case '3a':
        chapterPart.set('4a');
        objToReturn = {
          option1Visible: true,
          option1Disabled: false,
          option1: 'Next',
          option2Visible: false,
          option2Disabled: true,
          option2: '',
          option3Visible: false,
          option3Disabled: true,
          option3: '',
          inputVisible: false
        };
        break;
    }
  }

  return objToReturn;
}

// I declared player as a non optional argument because if I don't, every reference to player in the funciton code will raise a warning from TS.
export function getNextDialogue(options: {chapter?: string, part?: string, player: Player, optionSelected?: number} = {player: {}}): string[] {
  options.optionSelected = options.optionSelected ?? 0;
  let dialogueArr = ['Something went wrong... This text should not display.'];

  if (options.chapter === 'lobby') {
    switch (options.part) {
      case '1a':
        dialogueArr = ['Welcome adventurer, this terminal is where the entire game takes place! As you may have gathered, this is the room in which we wait. We like to call it the waiting room, patent pending. Waiting for what you ask? Why, another adventurer! This tale needs 2 heroes of course.']
        break;
      case '2a':
        dialogueArr = ['Looks like we found 2 trusty adventurers. Click \'Next\' when you\'re ready!']
        break;
      case '3a':
        dialogueArr = ['Excellent, now let us differentiate the two of you. Please enter your name below and click \'Next\' when you\'re ready.']
        break;
      case '4a':
        dialogueArr = [`You're name is... ${options.player.name}?`]
        break;
    }
  }

  return dialogueArr;
}