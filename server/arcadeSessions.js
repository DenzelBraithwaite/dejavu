const SUITS = ['purple', 'pink', 'yellow', 'cyan', 'blue'];
const SUIT_NAMES = {
  purple: 'Purple Cougar',
  pink: 'Pink Mouse',
  yellow: 'Yellow Monkey',
  cyan: 'Cyan Shark',
  blue: 'Blue Eagle'
};

const GHOST_PACKET_LINKS = {
  A: ['B', 'C'],
  B: ['A', 'D', 'E'],
  C: ['A', 'E', 'F'],
  D: ['B', 'G'],
  E: ['B', 'C', 'G', 'H'],
  F: ['C', 'H'],
  G: ['D', 'E', 'I'],
  H: ['E', 'F', 'I'],
  I: ['G', 'H', 'J'],
  J: ['I']
};

const DRONE_WALLS = ['0-2', '1-2', '3-1', '3-2', '3-4', '3-5', '5-4', '6-4'];
const DRONE_CORES = ['1-3', '5-3'];
const DRONE_EXITS = ['2-0', '4-0'];
const DRONE_DIRECTIONS = ['N', 'E', 'S', 'W'];


// Arcade sessions share transport and lifecycle behavior, while each module owns its rules.
export function createArcadeSessions() {
  return {
    'lo-hi': createLoHiState(),
    mastermind: createMastermindState(),
    chopsticks: createChopsticksState(),
    'ghost-packet': createGhostPacketState(),
    'firewall-auction': createFirewallAuctionState(),
    'drone-relay': createDroneRelayState()
  };
}

export function joinArcadeGame(sessions, gameId, playerId, playerName, requestedMode = 'versus') {
  const state = sessions[gameId];

  if (!state) {
    return errorResult('Unknown arcade module.');
  }

  const nextMode = resolveMode(gameId, requestedMode);

  if (state.mode && state.mode !== nextMode && participantCount(state) > 0) {
    return errorResult(`The active table is configured for ${state.mode.toUpperCase()}.`);
  }

  state.mode = nextMode;
  state.soloPlayerId = nextMode === 'solo' ? playerId : null;
  state.participants[playerId] = true;
  state.players[playerId].name = playerName;
  state.departureNotice = null;

  if (nextMode === 'solo') {
    const cpuId = playerId === 'p1' ? 'p2' : 'p1';
    state.players[cpuId].name = 'ICE CPU';
  }

  if (participantCount(state) === requiredParticipantCount(state)) {
    resetGame(state);
    state.status = 'playing';
  } else {
    state.status = 'waiting';
  }

  return successResult();
}

export function leaveArcadeGame(sessions, gameId, playerId) {
  const state = sessions[gameId];

  if (!state) {
    return;
  }

  if (!state.participants[playerId]) {
    return;
  }

  const departingName = state.players[playerId].name;
  const sharedGameWasActive = participantCount(state) === requiredParticipantCount(state);
  state.participants[playerId] = false;
  resetGame(state);
  state.status = participantCount(state) ? 'waiting' : 'menu';
  state.departureNotice = sharedGameWasActive
    ? `${departingName} left the game. The shared session was closed.`
    : null;

  if (participantCount(state) === 0) {
    state.mode = null;
  }
}

export function performArcadeAction(sessions, gameId, playerId, action) {
  const state = sessions[gameId];

  if (!state || state.status !== 'playing' || !state.participants[playerId]) {
    return errorResult('This game is not accepting moves.');
  }

  if (gameId === 'lo-hi') {
    return playLoHi(state, playerId, action);
  }

  if (gameId === 'mastermind') {
    return playMastermind(state, playerId, action);
  }

  if (gameId === 'chopsticks') {
    return playChopsticks(state, playerId, action);
  }

  if (gameId === 'ghost-packet') {
    return playGhostPacket(state, playerId, action);
  }

  if (gameId === 'firewall-auction') {
    return playFirewallAuction(state, playerId, action);
  }

  return playDroneRelay(state, playerId, action);
}

export function restartArcadeGame(sessions, gameId) {
  const state = sessions[gameId];

  if (!state) {
    return;
  }

  resetGame(state);
  state.status = participantCount(state) === requiredParticipantCount(state) ? 'playing' : 'waiting';
}

export function voteArcadeRematch(sessions, gameId, playerId, wantsRematch) {
  const state = sessions[gameId];

  if (!state || state.status !== 'finished' || !state.participants[playerId]) {
    return errorResult('There is no finished match available to replay.');
  }

  state.rematchVotes[playerId] = Boolean(wantsRematch);

  const allPlayersWantRematch = state.mode === 'solo'
    ? state.rematchVotes[playerId]
    : state.rematchVotes.p1 && state.rematchVotes.p2;

  if (allPlayersWantRematch) {
    resetGame(state);
    state.status = 'playing';
  }

  return successResult();
}

export function getArcadeSnapshot(sessions, gameId, playerId = null) {
  const state = sessions[gameId];

  if (!state) {
    return null;
  }

  const snapshot = structuredClone(state);
  snapshot.participantCount = participantCount(state);

  if (gameId === 'mastermind') {
    delete snapshot.secret;
  }

  if (gameId === 'ghost-packet') {
    delete snapshot.compromisedNodes;

    if (state.mode !== 'solo' && playerId === 'p1') {
      snapshot.scanResults = {};
    }
  }

  if (gameId === 'firewall-auction') {
    snapshot.submitted = {
      p1: Boolean(state.pendingAllocations.p1),
      p2: Boolean(state.pendingAllocations.p2)
    };
    delete snapshot.pendingAllocations;
  }

  if (gameId === 'drone-relay') {
    snapshot.submitted = {
      p1: Boolean(state.pendingQueues.p1),
      p2: Boolean(state.pendingQueues.p2)
    };
    delete snapshot.pendingQueues;
  }

  return snapshot;
}

function createBaseState(game) {
  return {
    game,
    status: 'menu',
    participants: {
      p1: false,
      p2: false
    },
    players: {
      p1: { name: 'Player 1' },
      p2: { name: 'Player 2' }
    },
    winner: null,
    log: [],
    mode: null,
    departureNotice: null,
    rematchVotes: {
      p1: false,
      p2: false
    }
  };
}

function createLoHiState() {
  return {
    ...createBaseState('lo-hi'),
    currentCard: randomCard(),
    activePlayer: 'p1',
    turn: 1
  };
}

function createMastermindState() {
  return {
    ...createBaseState('mastermind'),
    secret: createSecret(),
    round: 1,
    pendingGuesses: {
      p1: null,
      p2: null
    },
    activePlayer: 'p1',
    totalAttempts: 0,
    maximumAttempts: 15
  };
}

function createChopsticksState() {
  return {
    ...createBaseState('chopsticks'),
    hands: {
      p1: [1, 1, 0, 0],
      p2: [1, 1, 0, 0]
    },
    redistributionsRemaining: {
      p1: 3,
      p2: 3
    },
    activePlayer: 'p1',
    turn: 1
  };
}

function createGhostPacketState() {
  return {
    ...createBaseState('ghost-packet'),
    packetNode: 'A',
    destination: 'J',
    phase: 'scan',
    round: 1,
    maximumRounds: 7,
    trace: 0,
    maximumTrace: 4,
    scansRemaining: 4,
    scanResults: {},
    compromisedNodes: createCompromisedNodes()
  };
}

function createFirewallAuctionState() {
  return {
    ...createBaseState('firewall-auction'),
    round: 1,
    maximumRounds: 8,
    integrity: { p1: 8, p2: 8 },
    power: { p1: 5, p2: 5 },
    pendingAllocations: { p1: null, p2: null },
    lastReveal: null
  };
}

function createDroneRelayState() {
  return {
    ...createBaseState('drone-relay'),
    cycle: 1,
    maximumCycles: 6,
    drones: {
      p1: { row: 6, column: 1, direction: 'N', damage: 0 },
      p2: { row: 6, column: 5, direction: 'N', damage: 0 }
    },
    collectedCores: [],
    pendingQueues: { p1: null, p2: null },
    lastExecution: []
  };
}

function resetGame(state) {
  state.winner = null;
  state.log = [];
  state.departureNotice = null;
  state.rematchVotes = {
    p1: false,
    p2: false
  };

  if (state.game === 'lo-hi') {
    state.currentCard = randomCard();
    state.activePlayer = 'p1';
    state.turn = 1;

    for (const player of Object.values(state.players)) {
      player.score = 0;
      player.state = 'active';
    }
  }

  if (state.game === 'mastermind') {
    state.secret = createSecret();
    state.round = 1;
    state.pendingGuesses = { p1: null, p2: null };
    state.activePlayer = 'p1';
    state.totalAttempts = 0;

    for (const player of Object.values(state.players)) {
      player.attempts = [];
    }
  }

  if (state.game === 'chopsticks') {
    state.hands = { p1: [1, 1, 0, 0], p2: [1, 1, 0, 0] };
    state.redistributionsRemaining = { p1: 3, p2: 3 };
    state.activePlayer = 'p1';
    state.turn = 1;
  }

  if (state.game === 'ghost-packet') {
    state.packetNode = 'A';
    state.destination = 'J';
    state.phase = 'scan';
    state.round = 1;
    state.trace = 0;
    state.scansRemaining = 4;
    state.scanResults = {};
    state.compromisedNodes = createCompromisedNodes();
  }

  if (state.game === 'firewall-auction') {
    state.round = 1;
    state.integrity = { p1: 8, p2: 8 };
    state.power = { p1: 5, p2: 5 };
    state.pendingAllocations = { p1: null, p2: null };
    state.lastReveal = null;
  }

  if (state.game === 'drone-relay') {
    state.cycle = 1;
    state.drones = {
      p1: { row: 6, column: 1, direction: 'N', damage: 0 },
      p2: { row: 6, column: 5, direction: 'N', damage: 0 }
    };
    state.collectedCores = [];
    state.pendingQueues = { p1: null, p2: null };
    state.lastExecution = [];
  }
}

function playLoHi(state, playerId, action) {
  if (state.activePlayer !== playerId || state.players[playerId].state !== 'active') {
    return errorResult('Wait for your turn.');
  }

  if (action.type === 'hold') {
    state.players[playerId].state = 'held';
    addLog(state, `${state.players[playerId].name} holds at ${state.players[playerId].score} points.`);
    settleOrAdvanceLoHi(state, playerId);
    return successResult();
  }

  const nextCard = randomCard();
  const result = evaluateLoHiBet(state.currentCard, nextCard, action);
  state.currentCard = nextCard;

  if (!result.won) {
    state.players[playerId].state = 'lost';
    addLog(state, `${state.players[playerId].name} missed ${result.label}. ${formatCard(nextCard)} was transmitted.`);
    settleOrAdvanceLoHi(state, playerId);
    return successResult();
  }

  if (result.instant) {
    state.players[playerId].score += 100;
    state.winner = playerId;
    state.status = 'finished';
    addLog(state, `${state.players[playerId].name} cracked the exact card for an instant win.`);
    return successResult();
  }

  state.players[playerId].score += result.points;
  addLog(state, `${state.players[playerId].name} won ${result.label} for +${result.points}. ${formatCard(nextCard)} is now live.`);
  advanceLoHi(state, playerId);
  return successResult();
}

function evaluateLoHiBet(currentCard, nextCard, action) {
  if (action.type === 'direction') {
    const won = action.value === 'higher'
      ? nextCard.number > currentCard.number
      : nextCard.number < currentCard.number;
    return { won, points: 1, label: action.value.toUpperCase() };
  }

  if (action.type === 'suits') {
    const values = Array.isArray(action.values) ? action.values.slice(0, 2) : [];
    return { won: values.includes(nextCard.suit), points: 3, label: 'FACTION WINDOW' };
  }

  if (action.type === 'numbers') {
    const values = Array.isArray(action.values) ? action.values.map(Number).slice(0, 3) : [];
    return { won: values.includes(nextCard.number), points: 10, label: 'NUMBER WINDOW' };
  }

  if (action.type === 'exact') {
    const won = Number(action.number) === nextCard.number && action.suit === nextCard.suit;
    return { won, points: 0, label: 'EXACT CARD', instant: won };
  }

  return { won: false, points: 0, label: 'INVALID BET' };
}

function settleOrAdvanceLoHi(state, playerId) {
  const activePlayers = Object.entries(state.players)
    .filter(([, player]) => player.state === 'active');

  if (activePlayers.length === 0) {
    const eligibleScores = Object.entries(state.players)
      .sort((a, b) => b[1].score - a[1].score);

    state.winner = eligibleScores[0][1].score === eligibleScores[1][1].score
      ? 'tie'
      : eligibleScores[0][0];
    state.status = 'finished';
    return;
  }

  advanceLoHi(state, playerId);
}

function advanceLoHi(state, playerId) {
  const otherPlayer = playerId === 'p1' ? 'p2' : 'p1';
  state.activePlayer = state.players[otherPlayer].state === 'active' ? otherPlayer : playerId;
  state.turn += 1;
}

function playMastermind(state, playerId, action) {
  if (state.mode === 'coop') {
    return playCoopMastermind(state, playerId, action);
  }

  if (action.type !== 'guess' || state.pendingGuesses[playerId]) {
    return errorResult('Submit one four-digit guess for this round.');
  }

  const guess = String(action.guess ?? '');

  if (!/^[1-6]{4}$/.test(guess)) {
    return errorResult('The code must contain four digits from 1 to 6.');
  }

  state.pendingGuesses[playerId] = guess;

  if (!state.pendingGuesses.p1 || !state.pendingGuesses.p2) {
    return successResult();
  }

  const results = {};

  for (const id of ['p1', 'p2']) {
    const value = state.pendingGuesses[id];
    const feedback = scoreMastermind(state.secret, value);
    results[id] = feedback;
    state.players[id].attempts.unshift({ guess: value, ...feedback, round: state.round });
    addLog(state, `${state.players[id].name}: ${value} · ${feedback.exact} exact · ${feedback.misplaced} displaced.`);
  }

  const solved = ['p1', 'p2'].filter((id) => results[id].exact === 4);

  if (solved.length) {
    state.winner = solved.length === 2 ? 'tie' : solved[0];
    state.status = 'finished';
    state.revealedSecret = state.secret;
  } else {
    state.round += 1;
    state.pendingGuesses = { p1: null, p2: null };
  }

  return successResult();
}

function playCoopMastermind(state, playerId, action) {
  if (state.activePlayer !== playerId) {
    return errorResult('Wait for your teammate to transmit a guess.');
  }

  const guess = String(action.guess ?? '');

  if (action.type !== 'guess' || !/^[1-6]{4}$/.test(guess)) {
    return errorResult('The code must contain four digits from 1 to 6.');
  }

  const feedback = scoreMastermind(state.secret, guess);
  state.totalAttempts += 1;
  state.players[playerId].attempts.unshift({
    guess,
    ...feedback,
    round: state.totalAttempts,
    playerId,
    playerName: state.players[playerId].name
  });
  addLog(state, `${state.players[playerId].name}: ${guess} · ${feedback.exact} exact · ${feedback.misplaced} displaced.`);

  if (feedback.exact === 4) {
    state.winner = 'players';
    state.status = 'finished';
    state.revealedSecret = state.secret;
    return successResult();
  }

  if (state.totalAttempts >= state.maximumAttempts) {
    state.winner = 'code';
    state.status = 'finished';
    state.revealedSecret = state.secret;
    return successResult();
  }

  state.activePlayer = playerId === 'p1' ? 'p2' : 'p1';
  state.round = state.totalAttempts + 1;
  return successResult();
}

function scoreMastermind(secret, guess) {
  let exact = 0;
  const remainingSecret = [];
  const remainingGuess = [];

  for (let index = 0; index < 4; index += 1) {
    if (secret[index] === guess[index]) {
      exact += 1;
    } else {
      remainingSecret.push(secret[index]);
      remainingGuess.push(guess[index]);
    }
  }

  let misplaced = 0;

  for (const digit of remainingGuess) {
    const matchIndex = remainingSecret.indexOf(digit);

    if (matchIndex >= 0) {
      misplaced += 1;
      remainingSecret.splice(matchIndex, 1);
    }
  }

  return { exact, misplaced };
}

function playChopsticks(state, playerId, action) {
  if (state.activePlayer !== playerId) {
    return errorResult('Wait for your turn.');
  }

  const otherPlayer = playerId === 'p1' ? 'p2' : 'p1';

  if (action.type === 'redistribute') {
    const hands = state.hands[playerId];
    const redistributionsRemaining = state.redistributionsRemaining ?? { p1: 3, p2: 3 };
    const source = Number(action.source);
    const target = Number(action.target);
    const sourceValue = hands[source];
    const emptySlots = hands
      .map((value, index) => value === 0 ? index : -1)
      .filter((index) => index >= 0);

    state.redistributionsRemaining = redistributionsRemaining;

    if (redistributionsRemaining[playerId] <= 0) {
      return errorResult('No redistributions remain. Use your RAM sticks to attack.');
    }

    if (![0, 1, 2, 3].includes(source)
      || ![2, 4].includes(sourceValue)
      || !emptySlots.includes(target)) {
      return errorResult('Redistribution requires a 2GB or 4GB live stick and an empty RAM slot.');
    }

    if (sourceValue === 4 && action.pattern === 'four-ones') {
      const liveSticks = hands.filter((value) => value > 0);

      if (liveSticks.length !== 1 || emptySlots.length !== 3) {
        return errorResult('A 4×1GB redistribution requires one live 4GB stick and three empty slots.');
      }

      state.hands[playerId] = [1, 1, 1, 1];
      addLog(state, `${state.players[playerId].name} redistributed one 4GB stick into four 1GB sticks.`);
    } else {
      const nextValue = sourceValue / 2;
      hands[source] = nextValue;
      hands[target] = nextValue;
      addLog(state, `${state.players[playerId].name} redistributed ${sourceValue}GB into two ${nextValue}GB sticks.`);
    }

    redistributionsRemaining[playerId] -= 1;
    addLog(
      state,
      `${state.players[playerId].name} has ${redistributionsRemaining[playerId]}/3 redistributions remaining.`
    );
  } else {
    const source = Number(action.source);
    const target = Number(action.target);
    const attackValue = state.hands[playerId][source];
    const targetValue = state.hands[otherPlayer][target];

    if (![0, 1, 2, 3].includes(source) || ![0, 1, 2, 3].includes(target) || attackValue === 0 || targetValue === 0) {
      return errorResult('Select one live RAM stick on each side.');
    }

    state.hands[otherPlayer][target] = targetValue + attackValue >= 5
      ? 0
      : targetValue + attackValue;
    addLog(state, `${state.players[playerId].name} pushed ${attackValue}GB into ${state.players[otherPlayer].name}'s RAM-${target + 1}.`);
  }

  if (state.hands[otherPlayer].every((value) => value === 0)) {
    state.winner = playerId;
    state.status = 'finished';
  } else {
    state.activePlayer = otherPlayer;
    state.turn += 1;
  }

  return successResult();
}


// Ghost Packet alternates between information gathering and movement.
function playGhostPacket(state, playerId, action) {
  const canScan = state.mode === 'solo' || playerId === 'p2';
  const canRoute = state.mode === 'solo' || playerId === 'p1';

  if (action.type === 'scan') {
    const node = String(action.node ?? '');

    if (!canScan || state.phase !== 'scan') {
      return errorResult('The scanner acts before the router each round.');
    }

    if (!GHOST_PACKET_LINKS[node] || node === state.packetNode || node === state.destination) {
      return errorResult('Choose an unreached relay to scan.');
    }

    if (state.scansRemaining <= 0) {
      return errorResult('The scanner has no probes remaining.');
    }

    state.scanResults[node] = state.compromisedNodes.includes(node) ? 'compromised' : 'safe';
    state.scansRemaining -= 1;
    state.phase = 'route';
    addLog(state, `Scanner classified relay ${node}. Router may now move the packet.`);
    return successResult();
  }

  if (action.type === 'skip-scan') {
    if (!canScan || state.phase !== 'scan') {
      return errorResult('The scanner cannot pass right now.');
    }

    state.phase = 'route';
    addLog(state, 'Scanner conserved a probe. Router may move the packet.');
    return successResult();
  }

  if (action.type !== 'route' || !canRoute || state.phase !== 'route') {
    return errorResult('Wait for the route phase before moving the packet.');
  }

  const destination = String(action.node ?? '');

  if (!GHOST_PACKET_LINKS[state.packetNode].includes(destination)) {
    return errorResult('The packet can only move across a connected link.');
  }

  state.packetNode = destination;


  // Compromised relays are intentionally absent from router snapshots.
  if (state.compromisedNodes.includes(destination)) {
    state.trace += 2;
    addLog(state, `Relay ${destination} was compromised. TRACE increased by 2.`);
  } else {
    addLog(state, `Packet crossed relay ${destination} without exposing its signature.`);
  }

  if (destination === state.destination) {
    state.winner = 'players';
    state.status = 'finished';
    addLog(state, 'The ghost packet reached the dead drop. Route complete.');
    return successResult();
  }

  if (state.trace >= state.maximumTrace || state.round >= state.maximumRounds) {
    state.winner = 'network';
    state.status = 'finished';
    addLog(state, 'BLACK ICE isolated the packet before it reached the dead drop.');
    return successResult();
  }

  state.round += 1;
  state.phase = 'scan';
  return successResult();
}


// Firewall bids remain hidden until both players have committed their allocation.
function playFirewallAuction(state, playerId, action) {
  if (action.type !== 'allocate' || state.pendingAllocations[playerId]) {
    return errorResult('Submit one allocation for this round.');
  }

  const attack = Math.max(0, Math.floor(Number(action.attack)));
  const defense = Math.max(0, Math.floor(Number(action.defense)));

  if (!Number.isFinite(attack) || !Number.isFinite(defense) || attack + defense > state.power[playerId]) {
    return errorResult('Attack and defense cannot exceed your available processing power.');
  }

  state.pendingAllocations[playerId] = { attack, defense };

  if (state.mode === 'solo') {
    const cpuId = playerId === 'p1' ? 'p2' : 'p1';
    state.pendingAllocations[cpuId] = createCpuFirewallAllocation(state, cpuId);
  }

  if (!state.pendingAllocations.p1 || !state.pendingAllocations.p2) {
    return successResult();
  }

  resolveFirewallRound(state);
  return successResult();
}

function resolveFirewallRound(state) {
  const first = state.pendingAllocations.p1;
  const second = state.pendingAllocations.p2;
  const damageToFirst = Math.max(0, second.attack - first.defense);
  const damageToSecond = Math.max(0, first.attack - second.defense);

  state.integrity.p1 = Math.max(0, state.integrity.p1 - damageToFirst);
  state.integrity.p2 = Math.max(0, state.integrity.p2 - damageToSecond);
  state.lastReveal = {
    round: state.round,
    p1: first,
    p2: second,
    damage: { p1: damageToFirst, p2: damageToSecond }
  };

  addLog(
    state,
    `Round ${state.round}: ${state.players.p1.name} dealt ${damageToSecond}; ${state.players.p2.name} dealt ${damageToFirst}.`
  );

  for (const id of ['p1', 'p2']) {
    const allocation = state.pendingAllocations[id];
    const unspent = state.power[id] - allocation.attack - allocation.defense;

    // Saving power is the central bluff: reserves carry over before the fixed recharge.
    state.power[id] = Math.min(10, unspent + 2);
  }

  const firstOffline = state.integrity.p1 <= 0;
  const secondOffline = state.integrity.p2 <= 0;

  if (firstOffline || secondOffline) {
    state.winner = firstOffline && secondOffline ? 'tie' : firstOffline ? 'p2' : 'p1';
    state.status = 'finished';
    return;
  }

  if (state.round >= state.maximumRounds) {
    if (state.integrity.p1 === state.integrity.p2) {
      state.winner = state.power.p1 === state.power.p2
        ? 'tie'
        : state.power.p1 > state.power.p2 ? 'p1' : 'p2';
    } else {
      state.winner = state.integrity.p1 > state.integrity.p2 ? 'p1' : 'p2';
    }

    state.status = 'finished';
    return;
  }

  state.round += 1;
  state.pendingAllocations = { p1: null, p2: null };
}

function createCpuFirewallAllocation(state, cpuId) {
  const power = state.power[cpuId];
  const pressure = state.integrity[cpuId] <= 3 ? 0.45 : Math.random();
  const defense = Math.min(power, Math.floor(power * pressure));
  const maximumAttack = power - defense;
  const attack = Math.floor(Math.random() * (maximumAttack + 1));

  return { attack, defense };
}


// Drone queues are collected independently so neither pilot can react to the other queue.
function playDroneRelay(state, playerId, action) {
  if (action.type !== 'program') {
    return errorResult('Build and submit a command queue.');
  }

  const droneId = state.mode === 'solo' ? action.droneId : playerId;
  const queue = Array.isArray(action.queue) ? action.queue.slice(0, 5) : [];
  const validCommands = ['forward', 'left', 'right', 'wait'];

  if (!['p1', 'p2'].includes(droneId) || (state.mode !== 'solo' && droneId !== playerId)) {
    return errorResult('You cannot program that drone.');
  }

  if (state.pendingQueues[droneId]) {
    return errorResult('That drone already has a queue for this cycle.');
  }

  if (queue.length === 0 || queue.some((command) => !validCommands.includes(command))) {
    return errorResult('Queue one to five valid drone commands.');
  }

  state.pendingQueues[droneId] = queue;

  if (!state.pendingQueues.p1 || !state.pendingQueues.p2) {
    return successResult();
  }

  resolveDroneCycle(state);
  return successResult();
}

function resolveDroneCycle(state) {
  const frames = [];


  // Every command slot resolves simultaneously, including movement collisions and swaps.
  for (let step = 0; step < 5; step += 1) {
    const intents = {};

    for (const id of ['p1', 'p2']) {
      const command = state.pendingQueues[id][step] ?? 'wait';
      const drone = state.drones[id];

      if (command === 'left' || command === 'right') {
        drone.direction = rotateDrone(drone.direction, command);
      }

      intents[id] = command === 'forward'
        ? nextDronePosition(drone)
        : { row: drone.row, column: drone.column };
    }

    const collision = sameCell(intents.p1, intents.p2)
      || (sameCell(intents.p1, state.drones.p2) && sameCell(intents.p2, state.drones.p1));

    for (const id of ['p1', 'p2']) {
      const command = state.pendingQueues[id][step] ?? 'wait';
      const target = intents[id];
      const blocked = command === 'forward' && isDroneCellBlocked(target);

      if (collision && command === 'forward') {
        state.drones[id].damage += 1;
      } else if (blocked) {
        state.drones[id].damage += 1;
      } else {
        state.drones[id].row = target.row;
        state.drones[id].column = target.column;
      }

      const cell = `${state.drones[id].row}-${state.drones[id].column}`;

      if (DRONE_CORES.includes(cell) && !state.collectedCores.includes(cell)) {
        state.collectedCores.push(cell);
      }
    }

    frames.push({
      step: step + 1,
      drones: structuredClone(state.drones),
      collision
    });
  }

  state.lastExecution = frames;
  addLog(
    state,
    `Cycle ${state.cycle} executed. ${state.collectedCores.length}/2 data cores recovered.`
  );

  const destroyed = Object.values(state.drones).some((drone) => drone.damage >= 3);
  const bothAtExit = Object.values(state.drones)
    .every((drone) => DRONE_EXITS.includes(`${drone.row}-${drone.column}`));

  if (state.collectedCores.length === DRONE_CORES.length && bothAtExit) {
    state.winner = 'players';
    state.status = 'finished';
    addLog(state, 'Both drones reached extraction with the recovered data.');
    return;
  }

  if (destroyed || state.cycle >= state.maximumCycles) {
    state.winner = 'facility';
    state.status = 'finished';
    addLog(state, destroyed ? 'A drone was disabled by accumulated damage.' : 'The facility sealed before extraction.');
    return;
  }

  state.cycle += 1;
  state.pendingQueues = { p1: null, p2: null };
}

function rotateDrone(direction, command) {
  const currentIndex = DRONE_DIRECTIONS.indexOf(direction);
  const delta = command === 'left' ? -1 : 1;

  return DRONE_DIRECTIONS[(currentIndex + delta + DRONE_DIRECTIONS.length) % DRONE_DIRECTIONS.length];
}

function nextDronePosition(drone) {
  const offsets = {
    N: { row: -1, column: 0 },
    E: { row: 0, column: 1 },
    S: { row: 1, column: 0 },
    W: { row: 0, column: -1 }
  };
  const offset = offsets[drone.direction];

  return {
    row: drone.row + offset.row,
    column: drone.column + offset.column
  };
}

function isDroneCellBlocked(cell) {
  return cell.row < 0
    || cell.row > 6
    || cell.column < 0
    || cell.column > 6
    || DRONE_WALLS.includes(`${cell.row}-${cell.column}`);
}

function sameCell(first, second) {
  return first.row === second.row && first.column === second.column;
}

function createCompromisedNodes() {
  const networkBands = [
    ['B', 'C'],
    ['D', 'E', 'F'],
    ['G', 'H']
  ];

  // One threat per band keeps every generated map dangerous but still solvable.
  return networkBands.map((band) => band[Math.floor(Math.random() * band.length)]);
}

function resolveMode(gameId, requestedMode) {
  if (['ghost-packet', 'firewall-auction', 'drone-relay'].includes(gameId)) {
    return requestedMode === 'solo'
      ? 'solo'
      : gameId === 'firewall-auction' ? 'versus' : 'coop';
  }

  return gameId === 'mastermind' && requestedMode === 'coop' ? 'coop' : 'versus';
}

function requiredParticipantCount(state) {
  return state.mode === 'solo' ? 1 : 2;
}

function randomCard() {
  return {
    number: Math.floor(Math.random() * 11),
    suit: SUITS[Math.floor(Math.random() * SUITS.length)]
  };
}

function formatCard(card) {
  return `${SUIT_NAMES[card.suit] ?? card.suit} ${card.number}`;
}

function createSecret() {
  return Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1).join('');
}

function addLog(state, message) {
  state.log.unshift({ id: `${Date.now()}-${Math.random()}`, message });
  state.log = state.log.slice(0, 60);
}

function participantCount(state) {
  return Object.values(state.participants).filter(Boolean).length;
}

function successResult() {
  return { ok: true };
}

function errorResult(error) {
  return { ok: false, error };
}
