const STARTING_INTEGRITY = 30;
const BREACH_INTEGRITY = 48;
const MAX_HAND_SIZE = 5;

const PROGRAMS = {
  spike: {
    name: 'SPIKE',
    cost: 2,
    description: 'Deal 6 integrity damage.'
  },
  firewall: {
    name: 'FIREWALL',
    cost: 1,
    description: 'Gain 5 shield.'
  },
  leech: {
    name: 'LEECH',
    cost: 2,
    description: 'Deal 3 damage and repair 3 integrity.'
  },
  worm: {
    name: 'WORM',
    cost: 2,
    description: 'Deal 2 damage now and install 2 malware.'
  },
  reboot: {
    name: 'REBOOT',
    cost: 1,
    description: 'Repair 5 integrity and purge malware.'
  },
  overclock: {
    name: 'OVERCLOCK',
    cost: 0,
    description: 'Gain 2 bandwidth this turn.'
  },
  railgun: {
    name: 'RAILGUN',
    cost: 5,
    description: 'Deal 14 integrity damage.'
  },
  fortress: {
    name: 'FORTRESS',
    cost: 4,
    description: 'Gain 12 persistent shield.'
  },
  blackhole: {
    name: 'BLACK HOLE',
    cost: 6,
    description: 'Deal 8 damage and install 4 malware.'
  },
  uplink: {
    name: 'UPLINK',
    cost: 2,
    description: 'Permanently increase maximum bandwidth by 1.'
  },
  guardian: {
    name: 'GUARDIAN',
    cost: 2,
    description: 'Co-op: Give your ally 7 shield.'
  },
  meshRepair: {
    name: 'MESH REPAIR',
    cost: 4,
    description: 'Co-op: Repair 6 integrity for both runners.'
  },
  darkMirror: {
    name: 'DARK MIRROR',
    cost: 0,
    description: 'Hide ally telemetry until BLACK ICE acts again.'
  }
};

const BASE_DECK = [
  'spike', 'firewall', 'leech', 'worm', 'reboot', 'overclock',
  'spike', 'firewall', 'spike', 'worm', 'firewall', 'leech',
  'reboot', 'overclock', 'spike', 'firewall', 'worm', 'leech',
  'railgun', 'fortress', 'blackhole', 'railgun', 'fortress', 'uplink'
];

const COOP_PROGRAMS = ['guardian', 'guardian', 'meshRepair', 'meshRepair'];

export function createPacketWarState() {
  return {
    version: 1,
    mode: null,
    status: 'menu',
    participants: {
      p1: false,
      p2: false
    },
    players: {
      p1: createPlayer('Player 1'),
      p2: createPlayer('Player 2')
    },
    breach: createBreach(),
    activePlayer: 'p1',
    round: 1,
    winner: null,
    log: [],
    eventSequence: 0,
    lastProgram: null,
    rematchVotes: {
      p1: null,
      p2: null
    }
  };
}

function createPlayer(name) {
  return {
    name,
    integrity: STARTING_INTEGRITY,
    shield: 0,
    malware: 0,
    bandwidth: 3,
    maxBandwidth: 3,
    hand: [],
    deck: []
  };
}

function createBreach() {
  return {
    name: 'BLACK ICE',
    integrity: BREACH_INTEGRITY,
    shield: 0,
    malware: 0,
    teamStatsBlinded: false
  };
}

export function joinPacketWar(state, playerId, playerName, modeValue) {
  const mode = modeValue === 'coop' ? 'coop' : 'duel';

  if (state.mode && state.mode !== mode && countParticipants(state) > 0) {
    return errorResult(`The active table is configured for ${state.mode.toUpperCase()}.`);
  }

  state.mode = mode;
  state.participants[playerId] = true;
  state.players[playerId].name = playerName;

  if (countParticipants(state) === 1) {
    state.status = 'waiting';
  }

  if (countParticipants(state) === 2) {
    startRound(state);
  }

  return successResult();
}

export function leavePacketWar(state, playerId) {
  state.participants[playerId] = false;
  resetRound(state);
  state.status = countParticipants(state) > 0 ? 'waiting' : 'menu';

  if (countParticipants(state) === 0) {
    state.mode = null;
  }
}

export function playPacketWarCard(state, playerId, handIndexValue) {
  const turnError = validateTurn(state, playerId);

  if (turnError) {
    return turnError;
  }

  const player = state.players[playerId];
  const handIndex = Number(handIndexValue);
  const cardId = player.hand[handIndex];
  const program = PROGRAMS[cardId];

  if (!program) {
    return errorResult('That program is no longer in your hand.');
  }

  if (program.cost > player.bandwidth) {
    return errorResult('Insufficient bandwidth for that program.');
  }

  player.bandwidth -= program.cost;
  player.hand.splice(handIndex, 1);
  resolveProgram(state, playerId, cardId);
  drawCard(player, state.mode);

  if (resolveWinner(state)) {
    return successResult();
  }

  if (cardId === 'overclock') {
    addLog(state, `${player.name} retained the execution window.`);
    return successResult();
  }

  finishTurn(state, playerId);
  return successResult();
}

export function passPacketWarTurn(state, playerId) {
  const turnError = validateTurn(state, playerId);

  if (turnError) {
    return turnError;
  }

  const player = state.players[playerId];
  const cycledCard = player.hand.shift();

  drawCard(player, state.mode);
  addLog(
    state,
    cycledCard
      ? `${player.name} passed and cycled ${PROGRAMS[cycledCard].name} out of their hand.`
      : `${player.name} held bandwidth and passed.`
  );
  finishTurn(state, playerId);
  return successResult();
}

export function votePacketWarRematch(state, playerId, wantsRematch) {
  if (state.status !== 'finished' || !state.participants[playerId]) {
    return errorResult('There is no completed packet war to replay.');
  }

  state.rematchVotes[playerId] = Boolean(wantsRematch);

  if (!wantsRematch) {
    leavePacketWar(state, playerId);
  } else if (state.rematchVotes.p1 && state.rematchVotes.p2) {
    startRound(state);
  }

  return successResult();
}

export function getPacketWarSnapshot(state, viewerId) {
  const snapshot = structuredClone(state);

  for (const player of Object.values(snapshot.players)) {
    player.deck = [];
  }

  if (viewerId) {
    snapshot.players[otherPlayer(viewerId)].hand = [];
  }

  return {
    ...snapshot,
    participantCount: countParticipants(state),
    programs: PROGRAMS
  };
}

function startRound(state) {
  const selectedMode = state.mode;
  resetRound(state);
  state.mode = selectedMode;
  state.status = 'playing';
  addLog(state, selectedMode === 'coop'
    ? 'CO-OP BREACH OPEN: Destroy BLACK ICE before it flatlines both runners.'
    : 'DUEL LINK OPEN: Reduce the rival deck to zero integrity.');

  for (const player of Object.values(state.players)) {
    player.deck = shuffle([
      ...BASE_DECK,
      ...(selectedMode === 'coop' ? COOP_PROGRAMS : [])
    ]);

    for (let index = 0; index < MAX_HAND_SIZE; index += 1) {
      drawCard(player, selectedMode);
    }
  }
}

function resetRound(state) {
  state.status = 'menu';
  state.activePlayer = 'p1';
  state.round = 1;
  state.winner = null;
  state.log = [];
  state.eventSequence = 0;
  state.lastProgram = null;
  state.breach = createBreach();
  state.rematchVotes = {
    p1: null,
    p2: null
  };

  for (const [playerId, existing] of Object.entries(state.players)) {
    state.players[playerId] = createPlayer(existing.name);
  }
}

function resolveProgram(state, playerId, cardId) {
  const player = state.players[playerId];
  const target = state.mode === 'coop'
    ? state.breach
    : state.players[otherPlayer(playerId)];
  const programName = PROGRAMS[cardId].name;

  switch (cardId) {
    case 'spike':
      dealDamage(target, 6);
      break;
    case 'firewall':
      player.shield += 5;
      break;
    case 'leech':
      dealDamage(target, 3);
      player.integrity = Math.min(STARTING_INTEGRITY, player.integrity + 3);
      break;
    case 'worm':
      dealDamage(target, 2);
      target.malware += 2;
      break;
    case 'reboot':
      player.integrity = Math.min(STARTING_INTEGRITY, player.integrity + 5);
      player.malware = 0;
      break;
    case 'overclock':
      player.bandwidth += 2;
      break;
    case 'railgun':
      dealDamage(target, 14);
      break;
    case 'fortress':
      player.shield += 12;
      break;
    case 'blackhole':
      dealDamage(target, 8);
      target.malware += 4;
      break;
    case 'uplink':
      player.maxBandwidth += 1;
      break;
    case 'guardian':
      state.players[otherPlayer(playerId)].shield += 7;
      break;
    case 'meshRepair':
      for (const runner of Object.values(state.players)) {
        runner.integrity = Math.min(STARTING_INTEGRITY, runner.integrity + 6);
      }
      break;
  }

  const event = addLog(
    state,
    `${player.name} executed ${programName}. ${PROGRAMS[cardId].description}`,
    {
      type: 'program',
      actor: player.name,
      cardId,
      cardName: programName
    }
  );
  state.lastProgram = event;
}

function finishTurn(state, playerId) {
  const nextPlayerId = otherPlayer(playerId);

  if (state.mode === 'coop' && playerId === 'p2') {
    runBreachTurn(state);

    if (resolveWinner(state)) {
      return;
    }

    state.round += 1;
  } else if (state.mode === 'duel' && playerId === 'p2') {
    state.round += 1;
  }

  state.activePlayer = nextPlayerId;
  preparePlayerTurn(state.players[nextPlayerId]);

  if (resolveWinner(state)) {
    return;
  }
}

function preparePlayerTurn(player) {
  if (player.malware > 0) {
    dealDamage(player, player.malware);
  }

  player.bandwidth = player.maxBandwidth;
}

function runBreachTurn(state) {
  const attack = 3 + Math.min(3, Math.floor(state.round / 3));

  for (const player of Object.values(state.players)) {
    dealDamage(player, attack);
  }

  if (state.breach.malware > 0) {
    dealDamage(state.breach, state.breach.malware);
  }

  addLog(state, `BLACK ICE retaliated for ${attack} damage against both runners.`);

  state.breach.teamStatsBlinded = Math.random() < 0.28;

  if (state.breach.teamStatsBlinded) {
    addLog(state, 'BLACK ICE executed DARK MIRROR. Ally telemetry is hidden until its next action.', {
      type: 'program',
      actor: 'BLACK ICE',
      cardId: 'darkMirror',
      cardName: 'DARK MIRROR'
    });
  }
}

function resolveWinner(state) {
  if (state.mode === 'coop') {
    if (state.breach.integrity <= 0) {
      state.status = 'finished';
      state.winner = 'players';
      addLog(state, 'BREACH COMPLETE: BLACK ICE collapsed.');
      return true;
    }

    if (state.players.p1.integrity <= 0 || state.players.p2.integrity <= 0) {
      state.status = 'finished';
      state.winner = 'breach';
      addLog(state, 'FLATLINE: BLACK ICE severed the intrusion link.');
      return true;
    }

    return false;
  }

  for (const playerId of ['p1', 'p2']) {
    if (state.players[playerId].integrity <= 0) {
      state.status = 'finished';
      state.winner = otherPlayer(playerId);
      addLog(state, `${state.players[otherPlayer(playerId)].name} seized the network.`);
      return true;
    }
  }

  return false;
}

function dealDamage(target, amount) {
  const absorbed = Math.min(target.shield, amount);
  target.shield -= absorbed;
  target.integrity = Math.max(0, target.integrity - (amount - absorbed));
}

function drawCard(player, mode) {
  if (player.deck.length === 0) {
    player.deck = shuffle([
      ...BASE_DECK,
      ...(mode === 'coop' ? COOP_PROGRAMS : [])
    ]);
  }

  const card = player.deck.pop();

  if (card) {
    player.hand.push(card);
  }
}

function validateTurn(state, playerId) {
  if (state.status !== 'playing') {
    return errorResult('Packet War is not accepting programs.');
  }

  if (state.activePlayer !== playerId) {
    return errorResult('Wait for your partner or rival to finish their turn.');
  }

  return null;
}

function shuffle(cards) {
  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function addLog(state, message, details = {}) {
  state.eventSequence += 1;
  const event = {
    id: state.eventSequence,
    type: 'system',
    actor: '',
    cardId: null,
    cardName: null,
    message,
    ...details
  };

  state.log.push(event);
  return event;
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
