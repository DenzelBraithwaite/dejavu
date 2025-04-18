import { writable } from 'svelte/store';

// empty string so typedjs doesnt crash.
export const terminalMessages = writable<string[]>(['Click \'Next\' to begin.']);

// For all previously displayed messages.
export const terminalMessagesLog = writable<string[]>([]);

// For the current part in the chapter the players are at
export const chapter = writable('1');
export const chapterPart = writable('1a');

export function getNextDialogue(chapter: string, part: string, optionSelected = 0): string[] {
  let dialogueArr = ['Something went wrong... This text should not display.'];

  if (chapter === '1') {
    if (part === '1a') dialogueArr = dialogues.chapter1.part1a;
    if (part === '2a') dialogueArr = dialogues.chapter1.part2a;

  }

  return dialogueArr;
}

const dialogues = {
  chapter1: {
    part1a: ['Welcome, this terminal is where the entire game takes place. To join the server and start the game, click the button below.'],
    part2a: ['Welcome adventurer, you have joined the waiting room. As you may have gathered, this is the room in which we wait. For what you ask? Why, another adventurer! This tale needs 2 heroes.']
  }
}


type DialogueOptions = {
  option1Visible?: boolean;
  option1?: string;
  option2Visible?: boolean;
  option2?: string;
  option3Visible?: boolean;
  option3?: string;
}
export function updateDialogueOptions(chapter: string, part: string, optionSelected = 0): DialogueOptions {
  let objToReturn: DialogueOptions = {};
  if (chapter === '1') {
    switch (part) {
      case '1a':
        objToReturn = {
          option1Visible: true,
          option1: 'Click to join waiting room',
          option2Visible: false,
          option2: '',
          option3Visible: false,
          option3: ''
        };
        chapterPart.set('2a');
        break;
      case '2a':
        objToReturn = {
          option1Visible: true,
          option1: 'Waiting...',
          option2Visible: false,
          option2: '',
          option3Visible: false,
          option3: ''
        };
        break;
    }
  }

  return objToReturn;
}