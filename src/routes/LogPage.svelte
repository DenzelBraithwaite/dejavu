<script lang="ts">
  // Hooks
  import { onMount } from 'svelte';

  // transitions
  import { blur } from 'svelte/transition';

  // Modules / Components
  import { Terminal } from '../lib/components';

  // Stores
  import { socket } from '../lib/stores/socket';
  import { player1, player2 } from '../lib/stores/players';
  import { type GameState, currentGameState } from '../lib/stores/gameState';
  import { dialogueOptions, type DialogueOptions } from '../lib/stores/terminalMessages'
  import { chapter, chapterPart, getNextDialogue } from '../lib/stores/terminalMessages';

  let updateTerminalReqFromParent = false;

  onMount(() => {
    // Handles connects
    socket.on('connect', () => {
      socket.emit('frontend-mounted');
      console.log(`User ID: ${socket.id} connected!`);
    });

    // TODO: FIXME: Works but only if first person joins and then second player joins. If 2 players join then one leaves and rejoins, both will be female since this is never re-evaluated. Need a better solution.
    // Sets user's player
    socket.on('playing-as', data => {
      if (socket.id === data.socketID && data.playerCount === 1) currentGameState.set({...$currentGameState, playingAs: 'male'});
      if (socket.id === data.socketID && data.playerCount === 2) currentGameState.set({...$currentGameState, playingAs: 'female'});
      console.log('Playing as ' + $currentGameState.playingAs);
      console.log('Socket.id = ' + socket.id);
      console.log('data.socketID = ' + data.socketID);
    });

    // Handles connection errors
    socket.on('connect_error', error => console.error('Connection error:', error));

    // Starts game
    socket.on('p2-joined', () => currentGameState.set({...$currentGameState, bothPlayersJoined: true}));

    // Sets users (Beware that p1 might be titled player 2 and vice versa due to server.js)
    socket.on('set-users', users => {
      Object.entries(users).forEach(([username, userId]) => {
        player1.update($player1 => {
          $player1.id = users['p1'];
          return $player1;
        });

        player2.update($player2 => {
          $player2.id = users['p2'];
          return $player2;
        });
      }); 
    });

    // Go to chapter 6 if both players ready.
    socket.on('5-player-ready', () => {
      currentGameState.set({...$currentGameState, chapter5NumOfReadyPlayers: $currentGameState.chapter5NumOfReadyPlayers += 1});
      if ($currentGameState.chapter5NumOfReadyPlayers === 2) {
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
      }
    })

    // Go to chapter 12a if both players ready.
    socket.on('11-player-ready', () => {
      currentGameState.set({...$currentGameState, chapter11NumOfReadyPlayers: $currentGameState.chapter11NumOfReadyPlayers += 1});
      if ($currentGameState.chapter11NumOfReadyPlayers === 2) {
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
      }
    })

    // Only male should receive this
    socket.on('set-chapter-1-part-3', userInput => {
      chapter.set('1');
      chapterPart.set('3');
      currentGameState.set({...$currentGameState, userDialogue: userInput});
        dialogueOptions.set({
          option1Visible: true,
          option1Disabled: false,
          option1: 'Send Dialogue',
          option2Visible: false,
          option2Disabled: true,
          option2: '',
          option3Visible: false,
          option3Disabled: true,
          option3: '',
          inputVisible: true
        });

        updateTerminalReqFromParent = true;
    });

    // Only female should receive this
    socket.on('set-chapter-1-part-4', userInput => {
      chapter.set('1');
      chapterPart.set('4');
      currentGameState.set({...$currentGameState, userDialogue: userInput});
        dialogueOptions.set({
          option1Visible: true,
          option1Disabled: false,
          option1: 'Send Dialogue',
          option2Visible: false,
          option2Disabled: true,
          option2: '',
          option3Visible: false,
          option3Disabled: true,
          option3: '',
          inputVisible: true
        });
        
        updateTerminalReqFromParent = true;
    });

    // Set player names
    socket.on('set-male-player-name', data => player1.set({...$player1, name: data ? data : 'Peasant Boy'}));
    socket.on('set-female-player-name', data => player2.set({...$player2, name: data ? data : 'Peasant Girl'}));

    // Lets server know client is ready.
    socket.emit('client-ready');
  });
</script>

<div in:blur class="main-content">
  <Terminal {currentGameState} {dialogueOptions} {updateTerminalReqFromParent} terminalColor="grey" />
</div>

<style lang="scss">
  .main-content {
    width: 100%;
    height: 100%;
    max-width: 1100px;
    margin-left: auto;
    margin-right: auto;
  }
</style>