// Styles
import '../../app.scss';

// Svelte
import { get, writable } from 'svelte/store';

// Stores
import { player1, player2, type Player } from './players';
import { socket } from './socket';
import { type GameState, currentGameState } from './gameState';

// Types
import type { PolyhedralDice } from './dice';

// empty string so typedjs doesnt crash.
export const terminalMessages = writable<string[]>(['Click \'Next\' to begin.']);

// For all previously displayed messages.
export const terminalMessagesLog = writable<string[]>([]);

// For the current part in the chapter the players are at
export const chapter = writable('lobby');
export const chapterPart = writable('1');
export const dialogueOptions = writable<DialogueOptions>({
    option1Visible: true,
    option1Disabled: true,
    option1: 'Waiting...',
    option2Visible: false,
    option2Disabled: false,
    option2: '',
    option3Visible: false,
    option3Disabled: false,
    option3: '',
    inputVisible: false
    });

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
type StatForDiceRoll = 'maxHealth' | 'health' | 'strength' | 'defense' | 'speed' | 'stealth' | 'intellect' | 'perception' | 'charisma';

export function updateDialogueOptions(chapter: string, part: string, optionSelected = 0): void {
  if (chapter === 'lobby') {
    switch (part) {
      case '1':
        chapterPart.set('2');
        dialogueOptions.set({
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
        });
        break;
      case '2':
        chapterPart.set('3');
        dialogueOptions.set({
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
        });
        break;
      case '3':
      case '3-again':
        chapterPart.set('4');
        dialogueOptions.set({
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
        });
        break;
      case '4':
        if (optionSelected === 1) {
          chapterPart.set('5');
          
          // Lets server know client is ready.
          socket.emit('5-player-ready');
          
          dialogueOptions.set({
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
          });
        } else if (optionSelected === 2) {
          chapterPart.set('3-again');
          dialogueOptions.set({
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
          });
        }
        break;
      case '5':
        chapterPart.set('6');
        dialogueOptions.set({
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
        });
        break;
      case '6':
        chapterPart.set('7');
        dialogueOptions.set({
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
        });
        break;
      case '7':
        chapterPart.set('8');
        dialogueOptions.set({
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
        });
        break;
      case '8':
        chapterPart.set('9');
        dialogueOptions.set({
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
        });
        break;
      case '9':
        chapterPart.set('10');
        dialogueOptions.set({
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
        });
        break;
      case '10':
        chapterPart.set('11');

        // Lets server know client is ready.
        socket.emit('11-player-ready');

        dialogueOptions.set({
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
        });
        break;
      case '11':
        chapterPart.set('12');
        currentGameState.set({...get(currentGameState), showDiceTerminal: true});

        dialogueOptions.set({
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
        });
        break;
      case '12':
        chapterPart.set('13');

        dialogueOptions.set({
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
        });
        break;
      case '13':
        chapterPart.set('14');
        currentGameState.set({...get(currentGameState), showDiceTerminal: true});

        dialogueOptions.set({
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
        });
        break;
      case '14':
        chapterPart.set('15');

        dialogueOptions.set({
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
        });
        break;
      case '15':
        chapterPart.set('16');

        dialogueOptions.set({
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
        });
        break;
      case '16':
        chapterPart.set('17');

        dialogueOptions.set({
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
        });
        break;
      case '17':
        chapterPart.set('18');

        dialogueOptions.set({
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
        });
        break;
      case '18':
        chapterPart.set('19');

        dialogueOptions.set({
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
        });
        break;
    }
  }
}

// I declared player as a non optional argument because if I don't, every reference to player in the funciton code will raise a warning from TS.
export function getNextDialogue(options: {chapter?: string, part?: string, player: Player, optionSelected?: number} = {player: {}}): string[] {
  options.optionSelected = options.optionSelected ?? 0;
  let dialogueArr = ['Something went wrong... This text should not display.'];

  if (options.chapter === 'lobby') {
    switch (options.part) {
      case '1':
        dialogueArr = ['Welcome adventurer, this terminal is where the entire game takes place! As you may have gathered, this is the room in which we wait. We like to call it the waiting room, patent pending. Waiting for what you ask? Why, another adventurer! This tale needs 2 heroes of course.'];
        break;
      case '2':
        dialogueArr = ['Looks like we found 2 trusty adventurers. Click \'Next\' when you\'re ready!'];
        break;
      case '3':
        dialogueArr = ['Excellent, now let us differentiate the two of you. Please enter your name below and click \'Next\' when you\'re ready.'];
        break;
      case '3-again':
        dialogueArr = ['Oh good, I was hoping I didn\'t hear that correctly. What did you say your name actually was?'];
        break;
      case '4':
        dialogueArr = [`You're name is... ${options.player.name}?`];
        break;
      case '5':
        dialogueArr = ['Great! Not the name of course, the fact that you\'re ready. When both of you are ready the button below will say \'Next\', that means you\'re both ready to move forward.'];
        break;
      case '6':
        dialogueArr = [`Good, now let me introduce the two of you to each other. First we have ${get(player1).name}${get(player1).id === options.player.id ? '(you)' : ''} playing as the male character. Next, we have ${get(player2).name}${get(player2).id === options.player.id ? '(you)' : ''} playing as the female role.`];
        break;
      case '7':
        dialogueArr = ['Next, I\'ll explain the mechanics of the game. This game is more like an interactive multiplayer story with some DND elements. The only actions you\'ll be performing are selecting answers below (like \'Next\') and rolling dice to decide outcomes. Select \'Next\' to learn how dice rolling works.'];
        break;
      case '8':
        dialogueArr = [
          `Each player controls a unique character, these characters have different stats.
          For instance these are your character stats:
          <br>
          <br> <span class="color-blue">Name:</span> ${options.player.name}
          <br> <span class="color-blue">Gender:</span> ${options.player.gender}
          <br> <span class="color-blue">Health:</span> ${options.player.stats.maxHealth}
          <br> <span class="color-blue">Strength:</span> ${options.player.stats.strength}
          <br> <span class="color-blue">Defense:</span> ${options.player.stats.defense}
          <br> <span class="color-blue">Speed:</span> ${options.player.stats.speed}
          <br> <span class="color-blue">Intellect:</span> ${options.player.stats.intellect}
          <br> <span class="color-blue">Charisma:</span> ${options.player.stats.charisma}
          `
        ];
        break;
      case '9':
        dialogueArr = ['These stats play a crucial role when it comes to events. Events are things that happen that require dice rolls or decisions to be made. For example, someone blocks your path and you need to roll for charisma. You need to push a heavy box so you roll for strength. Something falls on you so you roll for defense.'];
        break;
      case '10':
        dialogueArr = ['When you roll, your base stat is added to the dice roll and that final number determines the outcome of the situation. If you\'re charisma is too low, you won\'t convince the person. Strength too low means you can\'t push that box. If your defense is too low you your health stat will suffer when something hurts you.'];
        break;
      case '11':
        dialogueArr = ['When you\'re both ready, we\'ll move on and practice some dice rolls so you grasp the core mechanics of the game.'];
        break;
      case '12':
        dialogueArr = ['"Next" available after dice terminal closes.'];
        break;
      case '13':
        dialogueArr = [
          `That was a quick example of a dice roll using a <span class="color-red">D8</span> dice. There are several dice in the game:
          <br> <span class="color-blue">D4:</span> 4 sides from 1-4.
          <br> <span class="color-green">D6:</span> 6 sides from 1-6.
          <br> <span class="color-red">D8:</span> 8 sides from 1-8.
          <br> <span class="color-pink">D10:</span> 10 sides from 1-10.
          <br> <span class="color-purple">D12:</span> 12 sides from 1-12.
          <br> <span class="color-orange">D20:</span> 20 sides from 1-20.
          <br>
          <br>
          Usually, you will be rolling a <span class="color-orange">D20</span> dice but there are occassions where you will use the other dice. For instance, you roll a <span class="color-orange">D20</span> dice to jump over a gap and you are <span class="color-green">successful</span>. Then you roll a <span class="color-blue">D4</span> dice to see how successful you were. If it's a <span class="color-blue">1</span>, maybe you just barely made the jump where as if it was a <span class="color-blue">4</span> then you nailed the jump gracefully.
          <br>
          <br>
          Now, let's imagine a scenario where the building you are in catches 🔥<span class="color-red">fire</span>🔥 and as it's collapsing one of the support beams fall on your ally. You need to roll for strength to see if you can save them.
          `
          ];
        break;
      case '14':
        dialogueArr = ['"Next" available after dice terminal closes.'];
        break;
      case '15':
        dialogueArr = ['In that example, you failed to roll high enough so you failed to save your ally, resulting in their death for the remainder of the story! Of course, it was impossible to roll a high enough number since this is a demo, but if this were the real game your ally would be dead!'];
        break;
      case '16':
        dialogueArr = ['That\'s it for the tutorial, you will be thrusted into the world shortly. Before you leave there\'s one last thing you should be aware of. You and your ally (the other player) will not always see the same messages in the terminal. You each have your strengths and weaknesses and will need to work together in order to beat the game (and enjoy a rad adventure along the way).'];
        break;
      case '17':
        if (options.player.gender === 'male') dialogueArr = ['For example, you are seeing this message because you are playing as the male character. The male role is misunderstood and begins in a position of power, you will notice a peasant girl(other player) who catches your eye, you should seek her out and speak to her as she will be your ally throughout the game and the spark that ignites your journey.'];
        else if (options.player.gender === 'female') dialogueArr = ['For example, you are seeing this message because you are playing as the female character. The female role begins in poverty but is perceived as the true protagonist of the story. Although all hope may feel lost at first, you will soon find an ally(the other player) who will help you achieve your goals. He may seem callous initially, but he will prove to be a loyal and reliable ally. So, you would do good to befriend him.'];
        break;
      case '18':
        dialogueArr = [
          `Alright then, I wish you the best of luck and enjoy the adventure you\'re about to set off on.
          <br>
          <br>
          Oh, you're curious to know who I am? I'm the terminal narrator, I'll be the one typing the messages and creating the game for you as we go, but that doesn't mean I'll help you! You 2 will need to manage on your own but I will be there to witness the triumph 🥳.
          <br> Good luck in there.
          <br>
          <br>
          <br>
          I hope you know what you're getting yourself into...
          `];
        break;
      case '19':
        if (options.player.gender === 'male') {
          dialogueArr = [`
            Fear has you paralyzed as sounds of yelling and griping could be heard from all directions. You gathered that by now you must be in the throne room, in the audience of the baron. In a swift motion you felt the bag removed from your head and your eyes adjusted to the light. Standing in front of you was the throne and sitting on it was the lord of the land, <MALE_PLAYER_NAME>.
            <br><br> You can\'t seem to find a voice as all those around you seem to have no issues using theirs. As you scan the room you notice people of all ages from small infants no older than 4 elders well into their 40s or even some potentially exceeding 50.
            <br><br> But among them there was one thing in common regardless of their age and that was the look of utter despair and contempt. There were people raging, crying, holding their loved ones, and some looked just like you, hollow and defeated.
            <br><br> Everything sounded gargled, faded away as if it was happening in the room beside you and didn\'t concern you at all, except it did. As you look back up at the Baron you wondered if he even noticed you. It was clear they were discussing your fate, but his eyes never seemed to find yours. Yet even as he looked away, there was something about him you could not shake.
            <br><br> Suddenly, your ears are able to decipher the noise as the herald announces your verdict. "She is to be sent to the dungeon to await execution. NEXT!". You hadn\'t even had the chance to speak, it seems they were already dismissing you before you could even plea. The court officials motioned the knights to remove you and as they did, you looked back once more at the Baron and to your surprise, his gaze finally met yours.
            <br><br> The knights escort you down to the dungeons where they throw you into a cell, promptly lock it and walk away. The only light that could be seen was a small candle that came from the hall and a small beam of light that shun through a hole in the wall. The hole was most likely meant to allow light and fresh air you initially though, but as you sat down there for hours you realized this was probably not the case.
            <br><br> The hole was just big enough that you could see through it and hear the outside world, but it was also big enough to see how thick the walls are and how hopless escape would be, while hearing the freedom of those on the other side.
            <br><br> As you sit in the company of yourself, you ponder your life and how you ended up here. It seems nothing but tragedy followed you and yet it always felt as if there was some sort of design, some sort of plan that awaits you. Something about that man, the baron, perhaps.
            <br><br> You wished now more than ever that the voice would speak to you, you begged for it to present itself to no avail. When you were younger, in times of a crisis there was always a voice that would guide you. But this voice was impossible to predict and seldom present. You never understood what the voice was, but always knew it had your best interests at heart.
            <br><br> You had wondered many times if you were crazy, if perhaps you created the voice as a child to protect yourself from loneliness, but no answer could be found. Still, even if there was no evidence, you believed the voice to be real and on your side.
            <br><br> Suddenly a loud noise was heard at the end of the hall. Was someone approaching you wondered. Soon after a rattling of metal could be heard and the prisoners were getting rowdy. Some were yelling, some were praising... It must be someone of nobility for sure you thought.
            <br><br> You feared perhaps they were coming for you to tell you it was time for your execution. You shuttered at the thought and tried to make yourself as small as possible. You planned to avoid all contact and simply bide your time in the prison until your execution. It felt as if the fight in you was all but gone and even death seemed inviting,
            <br><br> But in that moment, suddenly, you hear a voice speaking to you. You can tell it was not coming from outside but from within. It had been so long since you last heard it, but there was no mistaking it, the voice had returned if only to deliver a brief message. The voice was crystal clear, warm and familiar but stern.
            <br><br> "He has arrived." That is all it said. You turn to look at bars of your cell to find the Baron glaring back at you. His posture was firm and his eyes cold but his air was not menacing. He seemed displeased but inquisitive as well, it was very hard to read the face he was wearing.
            <br><br> You wondered if you should speak, perhaps that would make matters worse and it would be better to simply respond if spoken to. You survived by not asking questions and speaking when you were told. Bouncing from home to home until you finally found one willing to welcome you into theirs, you had learnt many lessons from many people but were never sure which to adhere to.
            <br><br> The crawling seconds felt like minutes as he continued to stare at you, but you couldn\'t help but to stare back. You were aware that this could be seen as a sign of aggression, but you found difficulty in looking away. "He\'s here", that\'s what the voice said right? Could it have meant him?
            <br><br> Suddenly, the baron began to speak and asked what your name is. But once again, you struggled to find your voice. This time however, it was due to more than just emotions. You had a name, but it was only given to you recently. You weren\'t sure if you should explain that or just tell him the name and wait for the next question.
            <br><br> You could see his impatience building and although you were already handed the death sentence, you feared making matters worse. You felt frozen in fear until suddenly the voice returned once again, but louder this time. "SPEAK"
            <br><br> You decide to obey the voice and answer the baron
          `];
        } else if (options.player.gender === 'female') {
          dialogueArr = [`
            Sounds of yelling and griping could be heard from all around the audience chamber. Your eyes blur as fatigue settles in from a long day of hearing the pleas of others. The citizens may change but the requests are always the same.
            <br><br> Petitions for justice, for clemency or pardon, requests for tax relief or for better protection. Of course, there\'s always the complaints about corruption and poverty. They are like lobsters in a barrel, too much concern about themselves and the other lobsters but not enough about the barrel.
            <br><br> The beggars look to you for answers while simultaneously pointing their finger at you in contempt. They don\'t understand the struggles of nobility, of vassals. In their eyes you are an all powerful lord, but in the eyes of the king a simple Baron who exchanged loyalty for land.
            <br><br> If you were to pardon them all, you would surely and swiftly be removed from your throne. You are a puppet of the royal family, but nobody dare say it out loud. But, in what little power you do hold, you\'ve managed to find complacency in it.
            <br><br> Still, you are aware that your present day struggles are certainly less than those on the other side of the audience chamber. Unfortunately, the king has delegated the ruling of the northern territories to the Duke and the Duke has given you explicit orders when it comes to delivering the verdicts on those who present themselves in the throne room with a request.
            <br><br> "You may only pardon 1 person a day, accept 1 request a day and must execute all thiefs that are brought for justice." The cruelty is less in the fact that you can only pardon one person a day, although this was not clear at first. The cruelty is deciding who deserves that pardon and most often not pardoning anyone because you weren\'t able to decide who truly deserved it.
            <br><br> There were times in the beginning wher eyou pardoned someone only to have a more tragic plea follow. Moreover, the king must be present for all hangings and various death sentences and must never look away as to set an example to the commoners.
            <br><br> This was deliberate torture and you knew it, but others would kill to sit where you sit and that too you were aware of. To show kindness is a weakness, you were told that often but never believed it. Unfortunately, the human mind and heart can only take so many killings, so many cruel verdicts, so many days as a callous lord.
            <br><br> Present days find you rather detached from it all. You look at the villagers and prisoners who plea but you do not see their face. Just another decision to be made, that\'s all they are to you. You feel as if you\'ve had all the life slowly drained fomr you but are forced to go on living.
            <br><br> But one day a peasant villager entered the audience chamber and something about her caught your attention. It was hard to say what it was, she was not much to look at. Her clothes were ragged, skin coarse and her eyes defeated. She was the very embodiment of this town and yet, something about her stuck with you.
            <br><br> You delivered your sentence as usual, she was a thief so you sentenced her to execution, but even after she left it seems she remained in your mind. After all the villagers had been seen and it was time to retreat to your chambers, you decided to visit the dungeons in search for answers for your curiosity.
            <br><br> You wandered down the stairs as several knights pay their respects to you as you pass. "Slaves" you think to yourself, all puppets just like me, their saluts flies over my head, straight through all vassals and directly to the king for it is his crown that we all truly salute, not each other.
            <br><br> You reach the dungeon to find only 1 guard for all of the prisonners. There\'s never been a case of an escape and there are very few knights in the town so this wasn\'t unusual, yet still the thought that there is only one guard stays in your mind. You continue to walk passed all the sorry faces that glare back at you and those who dare not look your way.
            <br><br> Among them were also those not destined for death who would show you the utmost respect as you pass, as if that would in some way change their fate. As you walk you decide to unsheath the dagger from your belt and run it along the prison bars. This was meant to rattle the prisoners and make those awaiting trial or their public execution riddled with worry.
            <br><br> That was of course one of the many fear tactics you had picked up over the years. You weren\'t sure how effective it was, but you couldn\'t help but admit it was a bit of fun. Mostly, harmless fun, mostly. Finally, you arrive at the cell you were looking for. It\'s belonged to many although today it belongs to the one who caught your eyes.
            <br><br> You stared at her for some bit, she seemed to be looking back at you before you even found her, as if she was waiting for you or even expecting you. But she didn\'t speak a word, she just stared at you. Upon closer look you realized that she is actually much younger than you had first perceived.
            <br><br> She seemed to be about 20 perhaps, although she looked as if she was in her late 30\'s. You yourself are only 26, she might not be much younger. Still, the odds she would live past 30 were extremely low, even for a lord like yourself, living past 40 was extremely rare. You\'ve hung plenty of children half her age so you weren\'t sure why her age felt important to you.
            <br><br> Finally, curiosity got the better of you and you decided to ask her name.',
            <br><br> MALE_PLAYER_NAME: My name is MALE_PLAYER_NAME, I am the baron of this land as you most certainly are aware. Now that I have introduced myself I wish to know your name.',
          `];
        }
    }
  }

  return dialogueArr;
}

// Rolls a dice, checks players relevant stat and does the math then returns the string.
export function getNextDiceDialogue(options: {player: Player, dice: PolyhedralDice, stat: StatForDiceRoll, threshold: number} = {player: {}}): string[] {
  const baseStat = options.player.stats[options.stat];
  const diceRoll: number = options.dice.roll();
  const totalRoll: number = baseStat + diceRoll;
  const successfulRoll = Boolean(totalRoll - options.threshold >= 0);
  const resultMessage = successfulRoll ? 'You were successful' : 'You were unsuccessful';

  let dialogueArr = [`
    You are rolling a <span class="color-${findDiceColor(options.dice.numOfSides)}">D${options.dice.numOfSides}</span> dice for your <span class="color-blue">${options.stat}</span> stat.
    <br> Your <span class="color-blue">${options.stat}</span> base stat is <span class="color-blue">${baseStat}</span>.
    <br> You need a total of at least <span class="color-blue">${options.threshold}</span>.
    <br> You roll the dice and get a <span class="color-blue">${diceRoll}</span>!
    <br> <span class="color-blue">${diceRoll}(roll)</span> + <span class="color-blue">${baseStat}(${options.stat})</span> gives you a total of <span class="color-blue stat-roll-result">${totalRoll}</span>.
    <br> <span class="color-${successfulRoll ? 'green' : 'red'}">${resultMessage}</span>
  `];

  return dialogueArr;
}

// Each dice has their own color, I like to differentiate the text color for them too.
function findDiceColor(numOfSides: number): 'green' | 'blue' | 'red' | 'pink' | 'purple' | 'orange' | void {
  if (numOfSides === 4) return 'green';
  if (numOfSides === 6) return 'blue';
  if (numOfSides === 8) return 'red';
  if (numOfSides === 10) return 'pink';
  if (numOfSides === 12) return 'purple';
  if (numOfSides === 20) return 'orange';
}