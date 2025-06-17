<script lang="ts">
  // Hooks
  import { onMount } from 'svelte';

  // transitions
  import { blur } from 'svelte/transition';

  // Modules / Components
  import { Button, Terminal } from '../lib/components';

  // Stores
  import { socket } from '../lib/stores/socket';
  import { player1, player2 } from '../lib/stores/players';
  
  // Types
  import type { DialogueOptions } from '../lib/stores/terminalMessages';

  let gameData = {
    playingAs: '', // male or female
    bothPlayersJoined: false,
    chapter5aNumOfReadyPlayers: 0
  }
  let dialogueOptions: DialogueOptions = {
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
    };

  onMount(() => {
    // Handles connects
    socket.on('connect', () => {
      socket.emit('frontend-mounted');
      console.log(`User ID: ${socket.id} connected!`);
    });

    // TODO: FIXME: Works but only if first person joins and then second player joins. If 2 players join then one leaves and rejoins, both will be female since this is never re-evaluated. Need a better solution.
    // Sets user's player
    socket.on('playing-as', data => {
      if (socket.id === data.socketID && data.playerCount === 1) gameData.playingAs = 'male';
      if (socket.id === data.socketID && data.playerCount === 2) gameData.playingAs = 'female';
      console.log('Playing as ' + gameData.playingAs);
      console.log('Socket.id = ' + socket.id);
      console.log('data.socketID = ' + data.socketID);
    });

    // Handles connection errors
    socket.on('connect_error', error => console.error('Connection error:', error));

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

    // Starts game
    socket.on('p2-joined', data => {
      gameData.bothPlayersJoined = true;
    });

    // Go to chapter 6a if both players ready.
    socket.on('chapter-5a-players-ready', () => {
      gameData.chapter5aNumOfReadyPlayers += 1;
      if (gameData.chapter5aNumOfReadyPlayers === 2) {
        dialogueOptions = {
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
      }
    })

    // Lets server know client is ready.
    socket.emit('client-ready');
  });
</script>

<div in:blur class="main-content">
  <Terminal {gameData} {dialogueOptions} terminalColor="grey" />
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