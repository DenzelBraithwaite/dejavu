<script lang="ts">
  // Hooks
  import { onMount } from 'svelte';

  // transitions
  import { blur } from 'svelte/transition';

  // Modules / Components
  import { Terminal, NetRunners, CharacterMenu  } from '../lib/components';

  // Stores
  import location from '../lib/stores/location';
  import { socket } from '../lib/socket';
  import { player1, player2 } from '../lib/stores/players';
  import { currentGameState } from '../lib/stores/gameState';
  import { dialogueOptions } from '../lib/stores/terminalMessages'
  import { chapter, chapterPart } from '../lib/stores/terminalMessages';

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

    // Receives dialogue when other player/client types in terminal input field.
    socket.on('share-user-dialogue', userInput => currentGameState.set({...$currentGameState, userDialogue: userInput.trim()}));

    // If both players are ready, go to next chapter.
    socket.on('lobby-part5-player-ready', checkIfBothPlayersReady);
    socket.on('lobby-part11-player-ready', checkIfBothPlayersReady);
    socket.on('lobby-part18-player-ready', checkIfBothPlayersReady);

    // Dialogue - Only male should receive this
    socket.on('set-chapter-1-part-3', () => {
      chapter.set('1');
      chapterPart.set('2'); // because it calls functions in Terminal.svelte that will up the chapter part +1
      currentGameState.update(store => ({...store,
        updateTerminal: {...store.updateTerminal, prompt1: true}
      }));
    });

    // Dialogue - Only female should receive this
    socket.on('set-chapter-1-part-4', () => {
      chapterPart.set('3'); // because it calls functions in Terminal.svelte that will up the chapter part +1
      currentGameState.update(store => ({...store,
        updateTerminal: {...store.updateTerminal, prompt1: true}
      }));
    });

    // Dialogue - Only male should receive this
      socket.on('set-chapter-1-part-5', () => {
      chapterPart.set('4'); // because it calls functions in Terminal.svelte that will up the chapter part +1
      currentGameState.update(store => ({...store,
        updateTerminal: {...store.updateTerminal, prompt1: true}
      }));
    });

    // Dialogue - Only female should receive this
    socket.on('set-chapter-1-part-6', () => {
      chapterPart.set('5'); // because it calls functions in Terminal.svelte that will up the chapter part +1
      currentGameState.update(store => ({...store,
        updateTerminal: {...store.updateTerminal, prompt1: true}
      }));
    });

    // Dialogue - Only male should receive this
    socket.on('set-chapter-1-part-7', () => {
      chapterPart.set('6'); // because it calls functions in Terminal.svelte that will up the chapter part +1
      currentGameState.update(store => ({...store,
        updateTerminal: {...store.updateTerminal, prompt1: true}
      }));
    });

    // Set player names
    socket.on('set-male-player-name', data => player1.set({...$player1, name: data ? data : 'Peasant Boy'}));
    socket.on('set-female-player-name', data => player2.set({...$player2, name: data ? data : 'Peasant Girl'}));

    // Lets server know client is ready.
    socket.emit('client-ready');
  });

  // When a player arrives at a dialogue checkpoint this fn is called to check if they need to wait for the other player or if both are ready and can continue.
  function checkIfBothPlayersReady(): void {
    currentGameState.set({...$currentGameState, numOfReadyPlayers: $currentGameState.numOfReadyPlayers += 1});
      if ($currentGameState.numOfReadyPlayers === 2) {
        currentGameState.set({...$currentGameState, numOfReadyPlayers: 0});
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
  }

</script>

<div in:blur class="main-content">
  <Terminal {location} {dialogueOptions} />
  <CharacterMenu {location} />
  <NetRunners {location}  />
</div>

<style lang="scss">
  .main-content {
    width: 100%;
    height: 100%;
    max-width: 1100px;
    margin-left: auto;
    margin-right: auto;
    min-width: 600px;
  }
</style>