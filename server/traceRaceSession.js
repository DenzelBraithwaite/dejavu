const NODE_COUNT = 18;

const NETWORK_LINKS = [
  [0, 1], [0, 5], [1, 2], [1, 5], [1, 6],
  [2, 3], [2, 6], [2, 7], [3, 4], [3, 7], [3, 8],
  [4, 8], [4, 9], [5, 6], [5, 10], [6, 7], [6, 11],
  [7, 8], [7, 12], [8, 9], [8, 13], [9, 14],
  [10, 11], [10, 15], [11, 12], [11, 15], [12, 13],
  [12, 16], [13, 14], [13, 16], [14, 17], [15, 16], [16, 17]
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
    lastTraceRange: null,
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

  if (action?.type !== 'trace') {
    player.lastTraceRange = null;
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
    case 'trace': {
      const distance = shortestDistance(player.position, opponent.position);
      const range = distance + randomInteger(1, 2);
      player.exposure = Math.min(9, player.exposure + 2);
      player.lastTraceRange = range;
      addIntel(player, `TURN ${state.turn}: TRACE reports the rival is fewer than ${range} hops away. Candidate nodes highlighted; your action window remains open.`);
      addIntel(opponent, `TURN ${state.turn}: Hostile TRACE detected. Rival exposure increased, but their turn continues.`);

      if (player.exposure >= 7) {
        addIntel(opponent, `EXPOSURE LOCK: Rival is currently at NODE ${formatNode(player.position)}.`);
      }

      return successResult();
    }
    case 'ping': {
      if (!Number.isInteger(target) || target < 0 || target >= NODE_COUNT) {
        return errorResult('Select a valid node to ping.');
      }

      if (target === opponent.position) {
        state.status = 'finished';
        state.winner = playerId;
        addIntel(player, `PING LOCKED: Rival found at NODE ${formatNode(target)}.`);
        addIntel(opponent, `PING BREACH: Your position at NODE ${formatNode(target)} was exposed.`);
        return successResult();
      }

      player.exposure = Math.min(9, player.exposure + 3);
      addIntel(player, `TURN ${state.turn}: NODE ${formatNode(target)} was empty.`);
      addIntel(opponent, `TURN ${state.turn}: Rival searched NODE ${formatNode(target)} and missed.`);
      break;
    }
    case 'scan': {
      const nearby = shortestDistance(player.position, opponent.position) <= 2;
      player.exposure = Math.min(9, player.exposure + 1);
      addIntel(player, nearby
        ? `TURN ${state.turn}: SCAN POSITIVE. Rival signal detected within 2 hops.`
        : `TURN ${state.turn}: SCAN CLEAR. No rival signal within 2 hops.`);
      addIntel(opponent, `TURN ${state.turn}: Proximity scan swept the network. Rival exposure increased.`);
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
  const firstPosition = randomInteger(0, NODE_COUNT - 1);
  let secondPosition = randomInteger(0, NODE_COUNT - 1);

  while (secondPosition === firstPosition) {
    secondPosition = randomInteger(0, NODE_COUNT - 1);
  }

  state.players.p1.position = firstPosition;
  state.players.p2.position = secondPosition;
  addIntel(state.players.p1, `LINK ESTABLISHED: Your signal entered at NODE ${formatNode(firstPosition)}.`);
  addIntel(state.players.p2, `LINK ESTABLISHED: Your signal entered at NODE ${formatNode(secondPosition)}.`);
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
    player.lastTraceRange = null;
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

function randomInteger(minimum, maximum) {
  return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
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
