const COLORS = ['purple', 'pink', 'yellow', 'cyan', 'blue'];
const DRAW_INTERVAL_MS = 2000;
const STARTING_MONEY = 1000;

export function createNetRunnersState() {
  return {
    version: 1,
    mode: 'multiplayer',
    status: 'menu',
    participants: {
      p1: false,
      p2: false
    },
    players: {
      p1: createPlayer('Player 1', STARTING_MONEY),
      p2: createPlayer('Player 2', STARTING_MONEY),
      p3: createPlayer('Moon', 3000),
      p4: createPlayer('Slides', 200)
    },
    trackCards: [],
    deck: [],
    cardsDrawn: [],
    odds: emptyColorRecord(),
    points: emptyColorRecord(),
    winner: '',
    nextDrawAt: null,
    rematchVotes: {
      p1: null,
      p2: null
    }
  };
}

function createPlayer(name, money) {
  return {
    name,
    money,
    amountBet: 0,
    colorBet: '',
    ready: false,
    points: 0,
    hasLost: false
  };
}

function emptyColorRecord() {
  return {
    purple: 0,
    pink: 0,
    yellow: 0,
    cyan: 0,
    blue: 0
  };
}

export function joinNetRunners(state, playerId, playerName) {
  if (!state.participants[playerId]) {
    state.participants[playerId] = true;
  }

  state.players[playerId].name = playerName;

  const participantCount = countParticipants(state);

  if (participantCount === 1) {
    state.status = 'waiting';
  }

  if (participantCount === 2 && ['menu', 'waiting'].includes(state.status)) {
    prepareBettingRound(state);
  }
}

export function leaveNetRunners(state, playerId) {
  if (!state.participants[playerId]) {
    return;
  }

  state.participants[playerId] = false;
  state.status = 'menu';
  state.nextDrawAt = null;
  state.rematchVotes = {
    p1: null,
    p2: null
  };
}

export function submitNetRunnersBet(state, playerId, bet) {
  if (state.status !== 'betting' || !state.participants[playerId]) {
    return errorResult('The multiplayer table is not accepting bets.');
  }

  if (!COLORS.includes(bet.color)) {
    return errorResult('Choose a valid faction.');
  }

  const amount = Math.floor(Number(bet.amount));
  const player = state.players[playerId];

  if (!Number.isFinite(amount) || amount < 1 || amount > player.money) {
    return errorResult('Choose a bet within your available balance.');
  }

  player.colorBet = bet.color;
  player.amountBet = amount;
  player.ready = true;

  if (state.players.p1.ready && state.players.p2.ready) {
    startRace(state);
  }

  return successResult();
}

export function voteNetRunnersRematch(state, playerId, wantsRematch) {
  if (state.status !== 'finished' || !state.participants[playerId]) {
    return errorResult('There is no finished multiplayer round to replay.');
  }

  state.rematchVotes[playerId] = Boolean(wantsRematch);

  if (state.rematchVotes[playerId] === false) {
    returnToMenu(state);
    return successResult();
  }

  if (state.rematchVotes.p1 === true && state.rematchVotes.p2 === true) {
    prepareBettingRound(state);
  }

  return successResult();
}

export function updateNetRunners(state, now = Date.now()) {
  if (state.status !== 'racing' || !state.nextDrawAt || now < state.nextDrawAt) {
    return false;
  }

  drawCard(state);

  if (state.winner) {
    finishRace(state);
  } else {
    state.nextDrawAt = now + DRAW_INTERVAL_MS;
  }

  return true;
}

export function getNetRunnersSnapshot(state) {
  return structuredClone({
    ...state,
    participantCount: countParticipants(state),
    drawIntervalMs: DRAW_INTERVAL_MS
  });
}

function prepareBettingRound(state) {
  state.status = 'betting';
  state.trackCards = [];
  state.cardsDrawn = [];
  state.points = emptyColorRecord();
  state.winner = '';
  state.nextDrawAt = null;
  state.rematchVotes = {
    p1: null,
    p2: null
  };

  for (const player of Object.values(state.players)) {
    player.amountBet = 0;
    player.colorBet = '';
    player.ready = false;
    player.points = 0;
    player.hasLost = false;

    if (player.money <= 0) {
      player.money = 5;
    }
  }

  const fullDeck = createDeck();
  state.trackCards = drawRandomCards(fullDeck, 7);
  state.deck = fullDeck;
  state.odds = calculateOdds(state.deck);
}

function startRace(state) {
  selectBotBets(state);
  state.status = 'racing';
  state.nextDrawAt = Date.now() + DRAW_INTERVAL_MS;
}

function drawCard(state) {
  if (state.deck.length === 0) {
    state.deck = createDeck();
  }

  const index = Math.floor(Math.random() * state.deck.length);
  const [color] = state.deck.splice(index, 1);
  state.cardsDrawn.push(color);
  state.points[color] += 1;

  for (const player of Object.values(state.players)) {
    if (player.colorBet === color) {
      player.points += 1;
    }
  }

  if (state.points[color] >= 7) {
    state.winner = color;
  }
}

function finishRace(state) {
  state.status = 'finished';
  state.nextDrawAt = null;

  for (const [playerId, player] of Object.entries(state.players)) {
    player.hasLost = player.colorBet !== state.winner;
    settleBet(state, playerId);
  }
}

function settleBet(state, playerId) {
  const player = state.players[playerId];

  if (player.colorBet !== state.winner) {
    player.money -= player.amountBet;
    return;
  }

  const matchingBets = Object.values(state.players).filter(
    (candidate) => candidate.colorBet === player.colorBet
  ).length;
  const laneBonus = state.trackCards.filter(
    (color) => color === player.colorBet
  ).length * 0.25;

  let multiplier = 3;

  if (matchingBets === 1) {
    multiplier = 4;
  } else if (matchingBets === 4) {
    multiplier = 5;
  } else if (matchingBets > 1) {
    multiplier -= (matchingBets - 1) * 0.5;
  }

  player.money += Math.round(player.amountBet * (multiplier + laneBonus));
}

function selectBotBets(state) {
  for (const playerId of ['p3', 'p4']) {
    const player = state.players[playerId];
    player.colorBet = COLORS[Math.floor(Math.random() * COLORS.length)];
    player.amountBet = randomBet(player.money);
    player.ready = true;
  }
}

function randomBet(money) {
  const available = Math.max(5, money);
  return Math.floor(Math.random() * Math.max(1, (available - 5) / 5)) * 5 + 5;
}

function createDeck() {
  return COLORS.flatMap((color) => Array(15).fill(color));
}

function drawRandomCards(deck, count) {
  const cards = [];

  for (let index = 0; index < count; index += 1) {
    const cardIndex = Math.floor(Math.random() * deck.length);
    const [card] = deck.splice(cardIndex, 1);
    cards.push(card);
  }

  return cards;
}

function calculateOdds(deck) {
  const odds = emptyColorRecord();

  for (const color of COLORS) {
    const remaining = deck.filter((card) => card === color).length;
    odds[color] = Math.round((remaining / deck.length) * 100);
  }

  return odds;
}

function returnToMenu(state) {
  state.status = 'menu';
  state.participants = {
    p1: false,
    p2: false
  };
  state.nextDrawAt = null;
  state.rematchVotes = {
    p1: null,
    p2: null
  };
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
