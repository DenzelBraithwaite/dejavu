const NODE_COUNT = 12;

const NETWORK_LINKS = [
  [0, 1], [0, 3], [1, 2], [1, 4], [2, 5],
  [3, 4], [3, 6], [4, 5], [4, 7], [5, 8],
  [6, 7], [6, 9], [7, 8], [7, 10], [8, 11],
  [9, 10], [10, 11]
];

export function createTraceRaceState() {
  return {
    version: 1,
    status: 'menu',
    participants: {
      p1: false,
      p2: false
    },
    players: {
      p1: createPlayer('Player 1'),
      p2: createPlayer('Player 2')
    },
    activePlayer: 'p1',
    winner: null,
    turn: 1,
    rematchVotes: {
      p1: null,
      p2: null
    }
  };
}

function createPlayer(name) {
  return {
    name,
    position: null,
    exposure: 0,
    lastPingDistance: null,
    intel: []
  };
}

export function joinTraceRace(state, playerId, playerName) {
  state.participants[playerId] = true;
  state.players[playerId].name = playerName;

  if (countParticipants(state) === 1) {
    state.status = 'waiting';
  }

  if (countParticipants(state) === 2 && ['menu', 'waiting'].includes(state.status)) {
    startRound(state);
  }
}

export function leaveTraceRace(state, playerId) {
  state.participants[playerId] = false;
  resetRound(state);
  state.status = countParticipants(state) > 0 ? 'waiting' : 'menu';
}

export function performTraceRaceAction(state, playerId, action) {
  if (state.status !== 'playing' || state.activePlayer !== playerId) {
    return errorResult('Wait for your turn in the trace window.');
  }

  const player = state.players[playerId];
  const opponentId = otherPlayer(playerId);
  const opponent = state.players[opponentId];
  const target = Number(action?.target);

  if (action?.type !== 'ping') {
    player.lastPingDistance = null;
  }

  switch (action?.type) {
    case 'move': {
      if (!neighborsOf(player.position).includes(target)) {
        return errorResult('Choose a node directly linked to your current position.');
      }

      player.position = target;
      player.exposure = Math.max(0, player.exposure - 1);
      addIntel(player, `TURN ${state.turn}: Relocated to NODE ${formatNode(target)}.`);
      addIntel(opponent, `TURN ${state.turn}: Rival signal shifted through the grid.`);
      break;
    }
    case 'ping': {
      const distance = shortestDistance(player.position, opponent.position);
      player.exposure = Math.min(9, player.exposure + 2);
      player.lastPingDistance = distance;
      addIntel(player, `TURN ${state.turn}: Pulse mapped every node exactly ${distance} connection${distance === 1 ? '' : 's'} away. Your action window remains open.`);
      addIntel(opponent, `TURN ${state.turn}: Hostile pulse detected. Rival exposure increased, but their turn continues.`);

      if (player.exposure >= 7) {
        addIntel(opponent, `EXPOSURE LOCK: Rival is currently at NODE ${formatNode(player.position)}.`);
      }

      return successResult();
    }
    case 'trace': {
      if (!Number.isInteger(target) || target < 0 || target >= NODE_COUNT) {
        return errorResult('Select a valid node to trace.');
      }

      if (target === opponent.position) {
        state.status = 'finished';
        state.winner = playerId;
        addIntel(player, `TRACE LOCKED: Rival found at NODE ${formatNode(target)}.`);
        addIntel(opponent, `TRACE BREACH: Your position at NODE ${formatNode(target)} was exposed.`);
        return successResult();
      }

      player.exposure = Math.min(9, player.exposure + 3);
      addIntel(player, `TURN ${state.turn}: NODE ${formatNode(target)} was empty.`);
      addIntel(opponent, `TURN ${state.turn}: Rival searched NODE ${formatNode(target)} and missed.`);
      break;
    }
    case 'scramble': {
      player.exposure = Math.max(0, player.exposure - 3);
      addIntel(player, `TURN ${state.turn}: Signal signature scrambled.`);
      addIntel(opponent, `TURN ${state.turn}: Rival signal dissolved into network noise.`);
      break;
    }
    default:
      return errorResult('Choose a valid trace action.');
  }

  if (opponent.exposure >= 7) {
    addIntel(player, `EXPOSURE LOCK: Rival is currently at NODE ${formatNode(opponent.position)}.`);
  }

  state.activePlayer = opponentId;
  state.turn += 1;
  return successResult();
}

export function voteTraceRaceRematch(state, playerId, wantsRematch) {
  if (state.status !== 'finished' || !state.participants[playerId]) {
    return errorResult('There is no completed trace to replay.');
  }

  state.rematchVotes[playerId] = Boolean(wantsRematch);

  if (!wantsRematch) {
    leaveTraceRace(state, playerId);
  } else if (state.rematchVotes.p1 && state.rematchVotes.p2) {
    startRound(state);
  }

  return successResult();
}

export function getTraceRaceSnapshot(state, viewerId) {
  const snapshot = structuredClone(state);
  const opponentId = otherPlayer(viewerId);

  if (snapshot.status === 'playing') {
    snapshot.players[opponentId].position = null;
  }

  return {
    ...snapshot,
    participantCount: countParticipants(state),
    networkLinks: NETWORK_LINKS,
    nodeCount: NODE_COUNT
  };
}

function startRound(state) {
  resetRound(state);
  state.status = 'playing';
  state.players.p1.position = 0;
  state.players.p2.position = 11;
  addIntel(state.players.p1, 'LINK ESTABLISHED: Your signal entered at NODE 01.');
  addIntel(state.players.p2, 'LINK ESTABLISHED: Your signal entered at NODE 12.');
}

function resetRound(state) {
  state.activePlayer = 'p1';
  state.winner = null;
  state.turn = 1;
  state.rematchVotes = {
    p1: null,
    p2: null
  };

  for (const player of Object.values(state.players)) {
    player.position = null;
    player.exposure = 0;
    player.lastPingDistance = null;
    player.intel = [];
  }
}

function neighborsOf(node) {
  return NETWORK_LINKS.flatMap(([left, right]) => {
    if (left === node) {
      return [right];
    }

    if (right === node) {
      return [left];
    }

    return [];
  });
}

function shortestDistance(start, destination) {
  const queue = [[start, 0]];
  const visited = new Set([start]);

  while (queue.length > 0) {
    const [node, distance] = queue.shift();

    if (node === destination) {
      return distance;
    }

    for (const neighbor of neighborsOf(node)) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([neighbor, distance + 1]);
      }
    }
  }

  return NODE_COUNT;
}

function addIntel(player, message) {
  player.intel.push(message);
}

function formatNode(node) {
  return String(node + 1).padStart(2, '0');
}

function otherPlayer(playerId) {
  return playerId === 'p1' ? 'p2' : 'p1';
}

function countParticipants(state) {
  return Object.values(state.participants).filter(Boolean).length;
}

function successResult() {
  return {
    ok: true
  };
}

function errorResult(error) {
  return {
    ok: false,
    error
  };
}
