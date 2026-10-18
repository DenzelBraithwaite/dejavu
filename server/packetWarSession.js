import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const STARTING_INTEGRITY = 30;
const BREACH_INTEGRITY = 48;
const MAX_HAND_SIZE = 5;
const CARD_LIBRARY_PATH = path.join(process.cwd(), 'data', 'packet-war-cards.json');

const PROGRAMS = {
  spike: {
    name: 'SPIKE',
    cost: 2,
    description: 'Deal 6 integrity damage.',
    color: 'pink', quantity: 5, builtIn: true,
    effects: [{ type: 'damage', target: 'enemy', amount: 6 }]
  },
  firewall: {
    name: 'FIREWALL',
    cost: 1,
    description: 'Gain 5 shield.',
    color: 'cyan', quantity: 5, builtIn: true,
    effects: [{ type: 'shield', target: 'self', amount: 5 }]
  },
  leech: {
    name: 'LEECH',
    cost: 2,
    description: 'Deal 3 damage and repair 3 integrity.',
    color: 'green', quantity: 3, builtIn: true,
    effects: [{ type: 'damage', target: 'enemy', amount: 3 }, { type: 'heal', target: 'self', amount: 3 }]
  },
  worm: {
    name: 'WORM',
    cost: 2,
    description: 'Deal 2 damage now and install 2 malware.',
    color: 'yellow', quantity: 4, builtIn: true,
    effects: [{ type: 'damage', target: 'enemy', amount: 2 }, { type: 'malware', target: 'enemy', amount: 2 }]
  },
  reboot: {
    name: 'REBOOT',
    cost: 1,
    description: 'Repair 5 integrity and purge malware.',
    color: 'blue', quantity: 3, builtIn: true,
    effects: [{ type: 'heal', target: 'self', amount: 5 }, { type: 'purge', target: 'self', amount: 1 }]
  },
  overclock: {
    name: 'OVERCLOCK',
    cost: 0,
    description: 'Gain 2 bandwidth this turn.',
    color: 'purple', quantity: 3, builtIn: true, retainTurn: true,
    effects: [{ type: 'bandwidth', target: 'self', amount: 2 }]
  },
  railgun: {
    name: 'RAILGUN',
    cost: 5,
    description: 'Deal 14 integrity damage.',
    color: 'pink', quantity: 2, builtIn: true,
    effects: [{ type: 'damage', target: 'enemy', amount: 14 }]
  },
  fortress: {
    name: 'FORTRESS',
    cost: 4,
    description: 'Gain 12 persistent shield.',
    color: 'cyan', quantity: 2, builtIn: true,
    effects: [{ type: 'shield', target: 'self', amount: 12 }]
  },
  blackhole: {
    name: 'BLACK HOLE',
    cost: 6,
    description: 'Deal 8 damage and install 4 malware.',
    color: 'purple', quantity: 1, builtIn: true,
    effects: [{ type: 'damage', target: 'enemy', amount: 8 }, { type: 'malware', target: 'enemy', amount: 4 }]
  },
  uplink: {
    name: 'UPLINK',
    cost: 2,
    description: 'Permanently increase bandwidth income by 1.',
    color: 'yellow', quantity: 1, builtIn: true,
    effects: [{ type: 'income', target: 'self', amount: 1 }]
  },
  guardian: {
    name: 'GUARDIAN',
    cost: 2,
    description: 'Co-op: Give your ally 7 shield.',
    color: 'cyan', quantity: 2, builtIn: true, multiplayerOnly: true,
    effects: [{ type: 'shield', target: 'ally', amount: 7 }]
  },
  meshRepair: {
    name: 'MESH REPAIR',
    cost: 4,
    description: 'Co-op: Repair 6 integrity for both runners.',
    color: 'green', quantity: 2, builtIn: true, multiplayerOnly: true,
    effects: [{ type: 'heal', target: 'both-allies', amount: 6 }]
  },
  darkMirror: {
    name: 'DARK MIRROR',
    cost: 0,
    description: 'Hide ally telemetry until BLACK ICE acts again.',
    color: 'purple', quantity: 1, builtIn: true, boss: true,
    effects: [{ type: 'blind', target: 'players', amount: 1 }]
  },
  iceStrike: {
    name: 'NULL STRIKE',
    cost: 0,
    description: 'Damage both runners with a scaling hostile pulse.',
    color: 'pink', quantity: 5, builtIn: true, boss: true,
    effects: [{ type: 'damage', target: 'players', amount: 5 }]
  },
  iceInfect: {
    name: 'ROOT INFECTION',
    cost: 0,
    description: 'Install 2 malware on both runners.',
    color: 'yellow', quantity: 3, builtIn: true, boss: true,
    effects: [{ type: 'malware', target: 'players', amount: 2 }]
  },
  iceReboot: {
    name: 'COLD REBOOT',
    cost: 0,
    description: 'Repair 8 integrity and purge hostile malware.',
    color: 'blue', quantity: 2, builtIn: true, boss: true,
    effects: [{ type: 'heal', target: 'self', amount: 8 }, { type: 'purge', target: 'self', amount: 1 }]
  },
  iceFirewall: {
    name: 'ICE WALL',
    cost: 0,
    description: 'Generate 8 persistent shield.',
    color: 'cyan', quantity: 2, builtIn: true, boss: true,
    effects: [{ type: 'shield', target: 'self', amount: 8 }]
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
  const libraries = loadCardLibraries();

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
    lastAllyProgram: null,
    lastBreachProgram: null,
    rematchVotes: {
      p1: null,
      p2: null
    },
    cardLibrary: libraries.cardLibrary,
    bossLibrary: libraries.bossLibrary
  };
}

function loadCardLibraries() {
  const defaults = {
    cardLibrary: createCardLibrary(false),
    bossLibrary: createCardLibrary(true)
  };

  try {
    const stored = JSON.parse(readFileSync(CARD_LIBRARY_PATH, 'utf8'));
    return {
      cardLibrary: { ...defaults.cardLibrary, ...(stored.cardLibrary ?? {}) },
      bossLibrary: { ...defaults.bossLibrary, ...(stored.bossLibrary ?? {}) }
    };
  } catch {
    return defaults;
  }
}

function persistCardLibraries(state) {
  writeFileSync(CARD_LIBRARY_PATH, JSON.stringify({
    cardLibrary: state.cardLibrary,
    bossLibrary: state.bossLibrary
  }, null, 2));
}

function createCardLibrary(boss) {
  return Object.fromEntries(
    Object.entries(PROGRAMS)
      .filter(([, program]) => Boolean(program.boss) === boss)
      .map(([id, program]) => [id, structuredClone({ id, ...program })])
  );
}

function createPlayer(name) {
  return {
    name,
    integrity: STARTING_INTEGRITY,
    shield: 0,
    malware: 0,
    bandwidth: 2,
    bandwidthIncome: 2,
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
  const program = state.cardLibrary[cardId];

  if (!program) {
    return errorResult('That program is no longer in your hand.');
  }

  if (program.cost > player.bandwidth) {
    return errorResult('Insufficient bandwidth for that program.');
  }

  player.bandwidth -= program.cost;
  player.hand.splice(handIndex, 1);
  resolveProgram(state, playerId, cardId);
  drawCard(player, state);

  if (resolveWinner(state)) {
    return successResult();
  }

  if (program.retainTurn) {
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

  drawCard(player, state);
  addLog(
    state,
    cycledCard
      ? `${player.name} passed and cycled ${state.cardLibrary[cycledCard].name} out of their hand.`
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
    programs: {
      ...snapshot.cardLibrary,
      ...snapshot.bossLibrary
    }
  };
}

export function savePacketWarCard(state, payload) {
  const requestedId = String(payload?.id ?? '').trim();
  const id = requestedId || `custom-${Date.now()}`;
  const existing = state.cardLibrary[id] ?? state.bossLibrary[id];
  const boss = existing ? Boolean(existing.boss) : Boolean(payload?.boss);
  const effects = Array.isArray(payload?.effects) ? payload.effects.slice(0, 3) : [];

  if (!String(payload?.name ?? '').trim()) {
    return errorResult('Card title is required.');
  }

  if (effects.length === 0) {
    return errorResult('Add at least one card effect.');
  }

  const card = {
    id,
    name: String(payload.name).trim().slice(0, 28).toUpperCase(),
    cost: clampInteger(payload.cost, 0, 20),
    description: String(payload.description ?? '').trim().slice(0, 140),
    color: ['pink', 'cyan', 'green', 'yellow', 'blue', 'purple'].includes(payload.color)
      ? payload.color
      : 'cyan',
    quantity: clampInteger(payload.quantity, 0, 20),
    builtIn: Boolean(existing?.builtIn),
    boss,
    multiplayerOnly: Boolean(payload.multiplayerOnly),
    retainTurn: Boolean(payload.retainTurn),
    effects: effects.map(normalizeEffect)
  };

  const destination = boss ? state.bossLibrary : state.cardLibrary;
  destination[id] = card;
  persistCardLibraries(state);
  return { ok: true, id };
}

export function deletePacketWarCard(state, cardId) {
  const library = state.cardLibrary[cardId] ? state.cardLibrary : state.bossLibrary;
  const card = library[cardId];

  if (!card) {
    return errorResult('That card no longer exists.');
  }

  if (card.builtIn) {
    return errorResult('Built-in cards can be modified but not deleted.');
  }

  delete library[cardId];
  persistCardLibraries(state);
  return successResult();
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
    player.deck = shuffle(createDeckFromLibrary(state.cardLibrary, selectedMode));

    for (let index = 0; index < MAX_HAND_SIZE; index += 1) {
      drawCard(player, state);
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
  state.lastAllyProgram = null;
  state.lastBreachProgram = null;
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
  const program = state.cardLibrary[cardId];
  const programName = program.name;

  applyEffects(state, playerId, program.effects, false);

  const event = addLog(
    state,
    `${player.name} executed ${programName}. ${program.description}`,
    {
      type: 'program',
      actor: player.name,
      actorType: state.mode === 'coop' ? 'ally' : 'runner',
      cardId,
      cardName: programName
    }
  );
  state.lastProgram = event;
  state.lastAllyProgram = event;
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

  player.bandwidth = player.bandwidthIncome;
}

function runBreachTurn(state) {
  if (state.breach.malware > 0) {
    dealDamage(state.breach, state.breach.malware);
  }

  state.breach.teamStatsBlinded = false;
  const availableCards = Object.values(state.bossLibrary).filter((program) => program.quantity > 0);
  const program = weightedProgram(availableCards);
  const cardId = program.id;
  applyEffects(state, 'breach', program.effects, true);
  const event = addLog(
    state,
    `BLACK ICE executed ${program.name}. ${program.description}`,
    {
      type: 'program',
      actor: 'BLACK ICE',
      actorType: 'black-ice',
      cardId,
      cardName: program.name
    }
  );
  state.lastBreachProgram = event;
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

function applyEffects(state, actorId, effects, bossCard) {
  for (const effect of effects ?? []) {
    for (const target of resolveEffectTargets(state, actorId, effect.target, bossCard)) {
      const amount = clampInteger(effect.amount, 0, 99);

      switch (effect.type) {
        case 'damage':
          dealDamage(target, amount);
          break;
        case 'shield':
          target.shield += amount;
          break;
        case 'heal':
          target.integrity = Math.min(
            target === state.breach ? BREACH_INTEGRITY : STARTING_INTEGRITY,
            target.integrity + amount
          );
          break;
        case 'malware':
          target.malware += amount;
          break;
        case 'income':
          if ('bandwidthIncome' in target) {
            target.bandwidthIncome += amount;
          }
          break;
        case 'bandwidth':
          if ('bandwidth' in target) {
            target.bandwidth += amount;
          }
          break;
        case 'purge':
          target.malware = 0;
          break;
        case 'blind':
          state.breach.teamStatsBlinded = true;
          break;
      }
    }
  }
}

function resolveEffectTargets(state, actorId, targetName, bossCard) {
  if (bossCard) {
    if (targetName === 'self' || targetName === 'enemy') {
      return [state.breach];
    }

    return Object.values(state.players);
  }

  const actor = state.players[actorId];
  const ally = state.players[otherPlayer(actorId)];
  const enemy = state.mode === 'coop' ? state.breach : ally;

  switch (targetName) {
    case 'self':
      return [actor];
    case 'ally':
      return [ally];
    case 'both-allies':
    case 'players':
      return Object.values(state.players);
    case 'enemy':
    default:
      return [enemy];
  }
}

function createDeckFromLibrary(library, mode) {
  const deck = [];

  for (const card of Object.values(library)) {
    if (card.multiplayerOnly && mode !== 'coop') {
      continue;
    }

    for (let count = 0; count < card.quantity; count += 1) {
      deck.push(card.id);
    }
  }

  return deck.length ? deck : ['spike'];
}

function weightedProgram(programs) {
  const pool = programs.flatMap((program) => Array(program.quantity).fill(program));
  return pool[Math.floor(Math.random() * pool.length)] ?? { id: 'iceStrike', ...PROGRAMS.iceStrike };
}

function normalizeEffect(effect) {
  const allowedTypes = ['damage', 'shield', 'heal', 'malware', 'income', 'bandwidth', 'purge', 'blind'];
  const allowedTargets = ['self', 'ally', 'both-allies', 'enemy', 'players'];

  return {
    type: allowedTypes.includes(effect?.type) ? effect.type : 'damage',
    target: allowedTargets.includes(effect?.target) ? effect.target : 'enemy',
    amount: clampInteger(effect?.amount, 0, 99)
  };
}

function clampInteger(value, minimum, maximum) {
  const number = Math.floor(Number(value));

  if (!Number.isFinite(number)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, number));
}

function drawCard(player, state) {
  if (player.deck.length === 0) {
    player.deck = shuffle(createDeckFromLibrary(state.cardLibrary, state.mode));
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
    actorType: 'system',
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
