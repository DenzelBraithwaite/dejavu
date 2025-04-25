import { writable } from 'svelte/store';

// empty string so typedjs doesnt crash.
export const terminalMessages = writable<string[]>(['Click \'Next\' to begin.']);

// For all previously displayed messages.
export const terminalMessagesLog = writable<string[]>([]);

// For the current part in the chapter the players are at
export const chapter = writable('lobby');
export const chapterPart = writable('1a');

export function getNextDialogue(chapter: string, part: string, optionSelected = 0): string[] {
  let dialogueArr = ['Something went wrong... This text should not display.'];

  if (chapter === 'lobby' && part === '1a') dialogueArr = dialogues.lobby.part1a;
  if (chapter === '1') {
    if (part === '1a') dialogueArr = dialogues.chapter1.part1a;
    if (part === '2a') dialogueArr = dialogues.chapter1.part2a;

  }

  return dialogueArr;
}

const dialogues = {
  lobby: {
    part1a: ['Welcome adventurer, this terminal is where the entire game takes place! As you may have gathered, this is the room in which we wait. We like to call it the waiting room, patent pending. Waiting for what you ask? Why, another adventurer! This tale needs 2 heroes of course.'],
  },
  chapter1: {
    part1a: ['Looks like we found 2 trusty adventurers. Click Ready to begin!'],
    part2a: ['This is part 2a but I would like this to be part 1a... hmmm after lobbby.']
  }
}


type DialogueOptions = {
  option1Visible?: boolean;
  option1Disabled?: boolean;
  option1?: string;
  option2Visible?: boolean;
  option2Disabled?: boolean;
  option2?: string;
  option3Visible?: boolean;
  option3Disabled?: boolean;
  option3?: string;
}
export function updateDialogueOptions(chapter: string, part: string, optionSelected = 0): DialogueOptions {
  let objToReturn: DialogueOptions = {};
  if (chapter === 'lobby' && part === '1a') {
    objToReturn = {
      option1Visible: true,
      option1Disabled: true,
      option1: 'Waiting...',
      option2Visible: false,
      option2Disabled: false,
      option2: '',
      option3Visible: false,
      option3Disabled: false,
      option3: ''
    };
    chapterPart.set('1a');
  } else if (chapter === '1') {
    switch (part) {
      case '1a':
        objToReturn = {
          option1Visible: true,
          option1Disabled: false,
          option1: 'Ready',
          option2Visible: false,
          option2Disabled: false,
          option2: '',
          option3Visible: false,
          option3Disabled: false,
          option3: ''
        };
        chapterPart.set('2a');
        break;
      case '2a':
        objToReturn = {
          option1Visible: true,
          option1Disabled: false,
          option1: '',
          option2Visible: false,
          option2Disabled: false,
          option2: '',
          option3Visible: false,
          option3Disabled: false,
          option3: ''
        };
        break;
    }
  }

  return objToReturn;
}