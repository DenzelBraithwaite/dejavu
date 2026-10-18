const STARTING_MONEY = 10000;
const WINNING_SCORE = 100;

export function createPigzState() {
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
    currentPoints: 0,
    activePlayer: 'p1',
    lastRoll: null,
    rollSequence: 0,
    winner: null,
    departureNotice: null,
    rematchVotes: {
      p1: null,
      p2: null
    }
  };
}

function createPlayer(name) {
  return {
    name,
    score: 0,
    money: STARTING_MONEY,
    amountBet: 0,
    ready: false
  };
}

export function joinPigz(state, playerId, playerName) {
  state.participants[playerId] = true;
  state.players[playerId].name = playerName;
  state.departureNotice = null;

  if (countParticipants(state) === 1) {
    state.status = 'waiting';
  }

  if (countParticipants(state) === 2 && ['menu', 'waiting'].includes(state.status)) {
    prepareBetting(state);
  }
}

export function leavePigz(state, playerId) {
  const departingName = state.players[playerId].name;
  const sharedGameWasActive = countParticipants(state) === 2;
  state.participants[playerId] = false;
  state.status = countParticipants(state) > 0 ? 'waiting' : 'menu';
  resetRound(state);
  state.departureNotice = sharedGameWasActive
    ? `${departingName} left the game. The shared round was closed.`
    : null;
}

export function submitPigzBet(state, playerId, amountValue) {
  if (state.status !== 'betting' || !state.participants[playerId]) {
    return errorResult('The Pigz table is not accepting wagers.');
  }

  const amount = Math.floor(Number(amountValue));
  const player = state.players[playerId];

  const availableBalance = Math.max(0, player.money);

  if (!Number.isFinite(amount) || amount < 0 || amount > availableBalance) {
    return errorResult('Choose a wager within your available balance.');
  }

  player.amountBet = amount;
  player.ready = true;

  if (state.players.p1.ready && state.players.p2.ready) {
    state.status = 'playing';
  }

  return successResult();
}

export function rollPigz(state, playerId) {
  const turnError = validateTurn(state, playerId);

  if (turnError) {
    return turnError;
  }

  const roll = Math.floor(Math.random() * 6) + 1;
  state.lastRoll = roll;
  state.rollSequence += 1;

  if (roll === 1) {
    state.currentPoints = 0;
    switchTurn(state);
  } else {
    state.currentPoints += roll;
  }

  return successResult();
}

export function holdPigz(state, playerId) {
  const turnError = validateTurn(state, playerId);

  if (turnError) {
    return turnError;
  }

  const player = state.players[playerId];
  player.score += state.currentPoints;
  state.currentPoints = 0;

  if (player.score >= WINNING_SCORE) {
    finishRound(state, playerId);
  } else {
    switchTurn(state);
  }

  return successResult();
}

export function votePigzRematch(state, playerId, wantsRematch) {
  if (state.status !== 'finished' || !state.participants[playerId]) {
    return errorResult('There is no completed Pigz round to replay.');
  }

  state.rematchVotes[playerId] = Boolean(wantsRematch);

  if (!wantsRematch) {
    leavePigz(state, playerId);
    return successResult();
  }

  if (state.rematchVotes.p1 && state.rematchVotes.p2) {
    prepareBetting(state);
  }

  return successResult();
}

export function restartPigz(state) {
  if (countParticipants(state) === 2) {
    prepareBetting(state);
  }
}

export function getPigzSnapshot(state) {
  return structuredClone({
    ...state,
    participantCount: countParticipants(state),
    winningScore: WINNING_SCORE
  });
}

function prepareBetting(state) {
  resetRound(state);
  state.status = 'betting';
}

function resetRound(state) {
  state.currentPoints = 0;
  state.activePlayer = 'p1';
  state.lastRoll = null;
  state.winner = null;
  state.rematchVotes = {
    p1: null,
    p2: null
  };

  for (const player of Object.values(state.players)) {
    player.score = 0;
    player.amountBet = 0;
    player.ready = false;
  }
}

function validateTurn(state, playerId) {
  if (state.status !== 'playing') {
    return errorResult('Pigz is not currently accepting turns.');
  }

  if (state.activePlayer !== playerId) {
    return errorResult('Wait for your turn.');
  }

  return null;
}

function switchTurn(state) {
  state.activePlayer = state.activePlayer === 'p1' ? 'p2' : 'p1';
}

function finishRound(state, winnerId) {
  state.status = 'finished';
  state.winner = winnerId;

  for (const [playerId, player] of Object.entries(state.players)) {
    const balanceChange = playerId === winnerId
      ? (player.amountBet === 0 ? 100 : player.amountBet)
      : -player.amountBet;
    player.money += balanceChange;
  }
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
