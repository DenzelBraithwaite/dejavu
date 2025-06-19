// Svelte
import { get, writable } from 'svelte/store';

// Stores
import { player1, player2, type Player } from './players';
import { socket } from './socket';

// empty string so typedjs doesnt crash.
export const terminalMessages = writable<string[]>(['Click \'Next\' to begin.']);

// For all previously displayed messages.
export const terminalMessagesLog = writable<string[]>([]);

// For the current part in the chapter the players are at
export const chapter = writable('lobby');
export const chapterPart = writable('1');

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
      case '1':
        chapterPart.set('2');
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
      case '2':
        chapterPart.set('3');
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
      case '3':
      case '3-again':
        chapterPart.set('4');
        objToReturn = {
          option1Visible: true,
          option1Disabled: false,
          option1: 'Yes',
          option2Visible: true,
          option2Disabled: false,
          option2: 'No',
          option3Visible: false,
          option3Disabled: true,
          option3: '',
          inputVisible: false
        };
        break;
      case '4':
        if (optionSelected === 1) {
          chapterPart.set('5');
          
          // Lets server know client is ready.
          socket.emit('5-player-ready');
          
          objToReturn = {
            option1Visible: true,
            option1Disabled: true,
            option1: 'Waiting',
            option2Visible: false,
            option2Disabled: true,
            option2: '',
            option3Visible: false,
            option3Disabled: true,
            option3: '',
            inputVisible: false
          };
        } else if (optionSelected === 2) {
          chapterPart.set('3-again');
          objToReturn = {
            option1Visible: true,
            option1Disabled: false,
            option1: 'Next But For Real This Time',
            option2Visible: false,
            option2Disabled: true,
            option2: '',
            option3Visible: false,
            option3Disabled: true,
            option3: '',
            inputVisible: true
          };
        }
        break;
      case '5':
        chapterPart.set('6');
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
      case '6':
        chapterPart.set('7');
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
      case '7':
        chapterPart.set('8');
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
      case '8':
        chapterPart.set('9');
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
      case '9':
        chapterPart.set('10');
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
      case '10':
        chapterPart.set('11');

        // Lets server know client is ready.
        socket.emit('11-player-ready');

        objToReturn = {
          option1Visible: true,
          option1Disabled: true,
          option1: 'Waiting for your dead weight teammate',
          option2Visible: false,
          option2Disabled: true,
          option2: '',
          option3Visible: false,
          option3Disabled: true,
          option3: '',
          inputVisible: false
        };
        break;
      case '11':
        chapterPart.set('12');

        objToReturn = {
          option1Visible: true,
          option1Disabled: true,
          option1: 'Disabled During Demo',
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
      case '1':
        dialogueArr = ['Welcome adventurer, this terminal is where the entire game takes place! As you may have gathered, this is the room in which we wait. We like to call it the waiting room, patent pending. Waiting for what you ask? Why, another adventurer! This tale needs 2 heroes of course.']
        break;
      case '2':
        dialogueArr = ['Looks like we found 2 trusty adventurers. Click \'Next\' when you\'re ready!']
        break;
      case '3':
        dialogueArr = ['Excellent, now let us differentiate the two of you. Please enter your name below and click \'Next\' when you\'re ready.']
        break;
      case '3-again':
        dialogueArr = ['Oh good, I was hoping I didn\'t hear that correctly. What did you say your name actually was?']
        break;
      case '4':
        dialogueArr = [`You're name is... ${options.player.name}?`]
        break;
      case '5':
        dialogueArr = ['Great! Not the name of course, the fact that you\'re ready. When both of you are ready the button below will say \'Next\', that means you\'re both ready to move forward.']
        break;
      case '6':
        dialogueArr = [`Good, now let me introduce the two of you to each other. First we have ${get(player1).name}${get(player1).id === options.player.id ? '(you)' : ''} playing as the male character. Next, we have ${get(player2).name}${get(player2).id === options.player.id ? '(you)' : ''} playing as the female role.`]
        break;
      case '7':
        dialogueArr = ['Next, I\'ll explain the mechanics of the game. This game is more like an interactive multiplayer story with some DND elements. The only actions you\'ll be performing are selecting answers below (like \'Next\') and rolling dice to decide outcomes. Select \'Next\' to learn how dice rolling works.']
        break;
      case '8':
        dialogueArr = [
          'Each player controls a unique character, these characters have different stats.',
          `For instance these are your character stats:
          <br> Name: ${options.player.name}
          <br> Gender: ${options.player.gender}
          <br> Health: ${options.player.stats.maxHealth}
          <br> Strength: ${options.player.stats.strength}
          <br> Defense: ${options.player.stats.defense}
          <br> Speed: ${options.player.stats.speed}
          <br> Intellect: ${options.player.stats.intellect}
          <br> Charisma: ${options.player.stats.charisma}
          `
        ]
        break;
      case '9':
        dialogueArr = ['These stats play a crucial role when it comes to events. Events are things that happen that require dice rolls or decisions to be made. For example, someone blocks your path and you need to roll for charisma. You need to push a heavy box so you roll for strength. Something falls on you so you roll for defense.']
        break;
      case '10':
        dialogueArr = ['When you roll, your base stat is added to the dice roll and that final number determines the outcome of the situation. If you\'re charisma is too low, you won\'t convince the person. Strength too low means you can\'t push that box. If your defense is too low you your health stat will suffer when something hurts you.']
        break;
      case '11':
        dialogueArr = ['When you\'re both ready, we\'ll move on and practice some dice rolls so you grasp the core mechanics of the game.']
        break;
      case '12':
        dialogueArr = ['']
        break;
    }
  }

  return dialogueArr;
}