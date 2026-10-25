const SUITS = ['purple', 'pink', 'yellow', 'cyan', 'blue'];
const SUIT_NAMES = {
  purple: 'Purple Cougar',
  pink: 'Pink Mouse',
  yellow: 'Yellow Monkey',
  cyan: 'Cyan Shark',
  blue: 'Blue Eagle'
};

const DRONE_WALLS = ['0-2', '1-2', '3-1', '3-2', '3-4', '3-5', '5-4', '6-4'];
const DRONE_EXIT = '0-3';
const DRONE_DIRECTIONS = ['N', 'E', 'S', 'W'];
const DRONE_COMMANDS = ['forward', 'left', 'right', 'wait', 'shoot', 'long-shot', 'pulse', 'jump', 'shield'];
const DRONE_LIMITED_ABILITIES = ['long-shot', 'pulse', 'jump', 'shield'];


// Arcade sessions share transport and lifecycle behavior, while each module owns its rules.
export function createArcadeSessions() {
  return {
    'lo-hi': createLoHiState(),
    mastermind: createMastermindState(),
    chopsticks: createChopsticksState(),
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

function createFirewallAuctionState() {
  return {
    ...createBaseState('firewall-auction'),
    round: 1,
    maximumRounds: 8,
    integrity: { p1: 10, p2: 10 },
    power: { p1: 5, p2: 5 },
    pendingAllocations: { p1: null, p2: null },
    lastReveal: null
  };
}

function createDroneRelayState() {
  return {
    ...createBaseState('drone-relay'),
    round: 1,
    maximumRounds: 10,
    drones: {
      p1: { row: 6, column: 1, direction: 'N', health: 3, shieldTicks: 0 },
      p2: { row: 6, column: 5, direction: 'N', health: 3, shieldTicks: 0 }
    },
    abilities: createDroneAbilities(),
    healthPack: createDroneHealthPack(),
    pendingQueues: { p1: null, p2: null },
    lastExecution: [],
    executionId: 0
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

  if (state.game === 'firewall-auction') {
    state.round = 1;
    state.integrity = { p1: 10, p2: 10 };
    state.power = { p1: 5, p2: 5 };
    state.pendingAllocations = { p1: null, p2: null };
    state.lastReveal = null;
  }

  if (state.game === 'drone-relay') {
    state.round = 1;
    state.drones = {
      p1: { row: 6, column: 1, direction: 'N', health: 3, shieldTicks: 0 },
      p2: { row: 6, column: 5, direction: 'N', health: 3, shieldTicks: 0 }
    };
    state.abilities = createDroneAbilities();
    state.healthPack = createDroneHealthPack();
    state.pendingQueues = { p1: null, p2: null };
    state.lastExecution = [];
    state.executionId = 0;
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


// Firewall bids remain hidden until both players have committed their allocation.
function playFirewallAuction(state, playerId, action) {
  if (action.type !== 'allocate' || state.pendingAllocations[playerId]) {
    return errorResult('Submit one allocation for this round.');
  }

  const attack = Math.max(0, Math.floor(Number(action.attack)));
  const defense = Math.max(0, Math.floor(Number(action.defense)));
  const heal = action.heal === true;
  const totalCost = attack + defense + (heal ? 5 : 0);

  if (!Number.isFinite(attack) || !Number.isFinite(defense) || totalCost > state.power[playerId]) {
    return errorResult('Your actions cannot exceed your available processing power.');
  }

  state.pendingAllocations[playerId] = { attack, defense, heal };

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

  state.integrity.p1 = Math.max(0, state.integrity.p1 + (first.heal ? 3 : 0) - damageToFirst);
  state.integrity.p2 = Math.max(0, state.integrity.p2 + (second.heal ? 3 : 0) - damageToSecond);
  state.lastReveal = {
    round: state.round,
    p1: first,
    p2: second,
    damage: { p1: damageToFirst, p2: damageToSecond }
  };

  addLog(
    state,
    `Round ${state.round}: ${state.players.p1.name} dealt ${damageToSecond}${first.heal ? ' and healed 3' : ''}; ${state.players.p2.name} dealt ${damageToFirst}${second.heal ? ' and healed 3' : ''}.`
  );

  for (const id of ['p1', 'p2']) {
    const allocation = state.pendingAllocations[id];
    const unspent = state.power[id] - allocation.attack - allocation.defense - (allocation.heal ? 5 : 0);

    // Saving power is the central bluff: reserves carry over before the fixed recharge.
    state.power[id] = Math.min(10, unspent + 3);
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
  const heal = power >= 5 && (state.integrity[cpuId] <= 5 || Math.random() < 0.12);
  const usablePower = power - (heal ? 5 : 0);
  const pressure = state.integrity[cpuId] <= 3 ? 0.45 : Math.random();
  const defense = Math.min(usablePower, Math.floor(usablePower * pressure));
  const maximumAttack = usablePower - defense;
  const attack = Math.floor(Math.random() * (maximumAttack + 1));

  return { attack, defense, heal };
}


// Drone queues stay hidden until both pilots lock their plans for the round.
function playDroneRelay(state, playerId, action) {
  if (action.type !== 'program') {
    return errorResult('Build and submit a command queue.');
  }

  const queue = Array.isArray(action.queue) ? action.queue.slice(0, 5) : [];

  if (state.pendingQueues[playerId]) {
    return errorResult('Your drone already has a queue for this round.');
  }

  if (queue.length === 0 || queue.some((command) => !DRONE_COMMANDS.includes(command))) {
    return errorResult('Queue one to five valid drone commands.');
  }

  for (const ability of DRONE_LIMITED_ABILITIES) {
    const requestedUses = queue.filter((command) => command === ability).length;

    if (requestedUses > state.abilities[playerId][ability]) {
      return errorResult(`${formatDroneCommand(ability)} is available once per match.`);
    }
  }

  state.pendingQueues[playerId] = queue;

  if (state.mode === 'solo') {
    const cpuId = playerId === 'p1' ? 'p2' : 'p1';
    state.pendingQueues[cpuId] = createCpuDroneQueue(state, cpuId);
  }

  if (!state.pendingQueues.p1 || !state.pendingQueues.p2) {
    return successResult();
  }

  resolveDroneRound(state);
  return successResult();
}

function resolveDroneRound(state) {
  const frames = [];

  // Each slot resolves as a simultaneous action tick and is sent to clients for playback.
  for (let step = 0; step < 5 && state.status === 'playing'; step += 1) {
    const commands = {
      p1: state.pendingQueues.p1[step] ?? 'wait',
      p2: state.pendingQueues.p2[step] ?? 'wait'
    };
    const events = [];
    const intents = {};
    const movingPlayers = new Set();

    for (const id of ['p1', 'p2']) {
      const command = commands[id];
      const drone = state.drones[id];

      if (command === 'left' || command === 'right') {
        drone.direction = rotateDrone(drone.direction, command);
      }

      if (command === 'shield') {
        state.abilities[id].shield -= 1;
        drone.shieldTicks = 3;
        events.push(`${state.players[id].name} activated a three-tick shield.`);
      }

      if (command === 'forward' || command === 'jump') {
        movingPlayers.add(id);
        intents[id] = nextDronePosition(drone, command === 'jump' ? 2 : 1);

        if (command === 'jump') {
          state.abilities[id].jump -= 1;
        }
      } else {
        intents[id] = { row: drone.row, column: drone.column };
      }
    }

    resolveDroneMovement(state, intents, movingPlayers, events);
    resolveDroneHealthPack(state, events);
    resolveDroneAttacks(state, commands, events);

    for (const id of ['p1', 'p2']) {
      state.drones[id].shieldTicks = Math.max(0, state.drones[id].shieldTicks - 1);
    }

    settleDroneWinner(state, events);
    frames.push({
      round: state.round,
      step: step + 1,
      commands,
      drones: structuredClone(state.drones),
      healthPack: structuredClone(state.healthPack),
      events
    });
  }

  state.lastExecution = frames;
  state.executionId += 1;
  addLog(state, `Round ${state.round} executed across ${frames.length} action ticks.`);

  if (state.status === 'finished') {
    return;
  }

  if (state.round >= state.maximumRounds) {
    state.winner = 'tie';
    state.status = 'finished';
    addLog(state, 'Round ten ended without a knockout or extraction. The battle is a draw.');
    return;
  }

  state.round += 1;
  state.pendingQueues = { p1: null, p2: null };
}

function resolveDroneMovement(state, intents, movingPlayers, events) {
  const collision = sameCell(intents.p1, intents.p2)
    || (sameCell(intents.p1, state.drones.p2) && sameCell(intents.p2, state.drones.p1));

  for (const id of ['p1', 'p2']) {
    if (!movingPlayers.has(id)) {
      continue;
    }

    if (collision) {
      applyDroneDamage(state, id, events, 'collision');
      continue;
    }

    if (isDroneCellBlocked(intents[id])) {
      applyDroneDamage(state, id, events, 'wall impact');
      continue;
    }

    state.drones[id].row = intents[id].row;
    state.drones[id].column = intents[id].column;
  }
}

function resolveDroneAttacks(state, commands, events) {
  const hits = [];

  for (const id of ['p1', 'p2']) {
    const command = commands[id];
    const opponentId = id === 'p1' ? 'p2' : 'p1';

    if (command === 'shoot' && droneHasLineOfFire(state, id, opponentId, 1)) {
      hits.push({ targetId: opponentId, source: `${state.players[id].name}'s shot` });
    }

    if (command === 'long-shot') {
      state.abilities[id]['long-shot'] -= 1;

      if (droneHasLineOfFire(state, id, opponentId, 3)) {
        hits.push({ targetId: opponentId, source: `${state.players[id].name}'s long shot` });
      }
    }

    if (command === 'pulse') {
      state.abilities[id].pulse -= 1;

      if (dronesAreAdjacent(state.drones[id], state.drones[opponentId])) {
        hits.push({ targetId: opponentId, source: `${state.players[id].name}'s pulse` });
      }
    }
  }

  for (const hit of hits) {
    applyDroneDamage(state, hit.targetId, events, hit.source);
  }
}

function resolveDroneHealthPack(state, events) {
  for (const id of ['p1', 'p2']) {
    const drone = state.drones[id];

    if (drone.row !== state.healthPack.row || drone.column !== state.healthPack.column) {
      continue;
    }

    drone.health = Math.min(3, drone.health + 1);
    events.push(`${state.players[id].name} collected the health pack.`);
    state.healthPack = createDroneHealthPack(state.drones);
    return;
  }
}

function settleDroneWinner(state, events) {
  const defeated = ['p1', 'p2'].filter((id) => state.drones[id].health <= 0);

  if (defeated.length > 0) {
    state.winner = defeated.length === 2 ? 'tie' : defeated[0] === 'p1' ? 'p2' : 'p1';
    state.status = 'finished';
    events.push(defeated.length === 2 ? 'Both drones were destroyed.' : `${state.players[defeated[0]].name} was destroyed.`);
    return;
  }

  const extracted = ['p1', 'p2'].find((id) => `${state.drones[id].row}-${state.drones[id].column}` === DRONE_EXIT);

  if (extracted) {
    state.winner = extracted;
    state.status = 'finished';
    events.push(`${state.players[extracted].name} reached the extraction point.`);
  }
}

function applyDroneDamage(state, playerId, events, source) {
  const drone = state.drones[playerId];

  if (drone.shieldTicks > 0) {
    drone.shieldTicks = 0;
    events.push(`${state.players[playerId].name}'s shield absorbed ${source}.`);
    return;
  }

  drone.health = Math.max(0, drone.health - 1);
  events.push(`${state.players[playerId].name} lost one health to ${source}.`);
}

function droneHasLineOfFire(state, attackerId, targetId, range) {
  const attacker = state.drones[attackerId];
  const target = state.drones[targetId];

  for (let distance = 1; distance <= range; distance += 1) {
    const cell = nextDronePosition(attacker, distance);

    if (isDroneCellBlocked(cell)) {
      return false;
    }

    if (sameCell(cell, target)) {
      return true;
    }
  }

  return false;
}

function dronesAreAdjacent(first, second) {
  return Math.abs(first.row - second.row) <= 1
    && Math.abs(first.column - second.column) <= 1;
}

function createCpuDroneQueue(state, cpuId) {
  const available = ['forward', 'left', 'right', 'wait', 'shoot'];
  const queue = [];

  for (const ability of DRONE_LIMITED_ABILITIES) {
    if (state.abilities[cpuId][ability] > 0) {
      available.push(ability);
    }
  }

  while (queue.length < 5) {
    const command = available[Math.floor(Math.random() * available.length)];
    queue.push(command);

    if (DRONE_LIMITED_ABILITIES.includes(command)) {
      available.splice(available.indexOf(command), 1);
    }
  }

  return queue;
}

function createDroneAbilities() {
  return {
    p1: { 'long-shot': 1, pulse: 1, jump: 1, shield: 1 },
    p2: { 'long-shot': 1, pulse: 1, jump: 1, shield: 1 }
  };
}

function createDroneHealthPack(drones = null) {
  const occupiedCells = drones
    ? Object.values(drones).map((drone) => `${drone.row}-${drone.column}`)
    : ['6-1', '6-5'];
  const availableCells = [];

  for (let row = 0; row < 7; row += 1) {
    for (let column = 0; column < 7; column += 1) {
      const cell = `${row}-${column}`;

      if (!DRONE_WALLS.includes(cell) && cell !== DRONE_EXIT && !occupiedCells.includes(cell)) {
        availableCells.push({ row, column });
      }
    }
  }

  return availableCells[Math.floor(Math.random() * availableCells.length)];
}

function rotateDrone(direction, command) {
  const currentIndex = DRONE_DIRECTIONS.indexOf(direction);
  const delta = command === 'left' ? -1 : 1;

  return DRONE_DIRECTIONS[(currentIndex + delta + DRONE_DIRECTIONS.length) % DRONE_DIRECTIONS.length];
}

function nextDronePosition(drone, distance = 1) {
  const offsets = {
    N: { row: -1, column: 0 },
    E: { row: 0, column: 1 },
    S: { row: 1, column: 0 },
    W: { row: 0, column: -1 }
  };
  const offset = offsets[drone.direction];

  return {
    row: drone.row + offset.row * distance,
    column: drone.column + offset.column * distance
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

function formatDroneCommand(command) {
  return command.replace('-', ' ').toUpperCase();
}

function resolveMode(gameId, requestedMode) {
  if (['firewall-auction', 'drone-relay'].includes(gameId)) {
    return requestedMode === 'solo'
      ? 'solo'
      : 'versus';
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
