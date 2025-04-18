<script lang="ts">
  // Hooks
  import { onMount } from 'svelte';

  // transitions
  import { blur } from 'svelte/transition';

  // Modules / Components
  import { Button, Terminal } from '../lib/components';

  // Stores
  import { player1 } from '../lib/stores/player1';
  import { player2 } from '../lib/stores/player2';

  // Websocket
  import { io } from 'socket.io-client';

  let socket = io('http://192.168.2.10:6912'); // Thanos

  onMount(() => {
    // Handles connects
    socket.on('connect', () => console.log(`User ID: ${socket.id} connected!`));

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

        // TODO: Handle guests.
      }); 
    });

    // Resets game and updates player hands
    socket.on('game-started', data => {
      // Update player hands
      player1.set(data.player1);
      player2.set(data.player2);
    });

    // Lets server know client is ready.
    socket.emit('client-ready');
  });

  // Determine's if the player is p1, p2 or guest
  function playingAs() {
    if ($player1.id === socket.id) return 'p1';
    if ($player2.id === socket.id) return 'p2';
    return 'guest';
  }
</script>

<div in:blur class="main-content">
  <Terminal terminalColor="grey" />
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