const SUITS = ['purple', 'pink', 'yellow', 'cyan', 'blue'];
const SUIT_NAMES = {
  purple: 'Purple Cougar',
  pink: 'Pink Mouse',
  yellow: 'Yellow Monkey',
  cyan: 'Cyan Shark',
  blue: 'Blue Eagle'
};

export function createArcadeSessions() {
  return {
    'lo-hi': createLoHiState(),
    mastermind: createMastermindState(),
    chopsticks: createChopsticksState()
  };
}

export function joinArcadeGame(sessions, gameId, playerId, playerName) {
  const state = sessions[gameId];

  if (!state) {
    return errorResult('Unknown arcade module.');
  }

  state.participants[playerId] = true;
  state.players[playerId].name = playerName;

  if (participantCount(state) === 2) {
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

  state.participants[playerId] = false;
  resetGame(state);
  state.status = participantCount(state) ? 'waiting' : 'menu';
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

  return playChopsticks(state, playerId, action);
}

export function restartArcadeGame(sessions, gameId) {
  const state = sessions[gameId];

  if (!state) {
    return;
  }

  resetGame(state);
  state.status = participantCount(state) === 2 ? 'playing' : 'waiting';
}

export function getArcadeSnapshot(sessions, gameId) {
  const state = sessions[gameId];

  if (!state) {
    return null;
  }

  const snapshot = structuredClone(state);
  snapshot.participantCount = participantCount(state);

  if (gameId === 'mastermind') {
    delete snapshot.secret;
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
    log: []
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
    }
  };
}

function createChopsticksState() {
  return {
    ...createBaseState('chopsticks'),
    hands: {
      p1: [1, 1],
      p2: [1, 1]
    },
    activePlayer: 'p1',
    turn: 1
  };
}

function resetGame(state) {
  state.winner = null;
  state.log = [];

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

    for (const player of Object.values(state.players)) {
      player.attempts = [];
    }
  }

  if (state.game === 'chopsticks') {
    state.hands = { p1: [1, 1], p2: [1, 1] };
    state.activePlayer = 'p1';
    state.turn = 1;
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
    return { won: values.includes(nextCard.suit), points: 3, label: 'SUIT WINDOW' };
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
    const scores = Object.entries(state.players).sort((a, b) => b[1].score - a[1].score);
    state.winner = scores[0][1].score === scores[1][1].score ? 'tie' : scores[0][0];
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
    state.players[id].attempts.push({ guess: value, ...feedback, round: state.round });
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

  if (action.type === 'split') {
    const hands = state.hands[playerId];
    const liveValue = hands.find((value) => value > 0);

    if (!hands.includes(0) || !liveValue || liveValue % 2 !== 0) {
      return errorResult('Split requires one empty hand and an even live hand.');
    }

    state.hands[playerId] = [liveValue / 2, liveValue / 2];
    addLog(state, `${state.players[playerId].name} split ${liveValue} into two hands.`);
  } else {
    const source = Number(action.source);
    const target = Number(action.target);
    const attackValue = state.hands[playerId][source];
    const targetValue = state.hands[otherPlayer][target];

    if (![0, 1].includes(source) || ![0, 1].includes(target) || attackValue === 0 || targetValue === 0) {
      return errorResult('Select one live hand on each side.');
    }

    state.hands[otherPlayer][target] = (targetValue + attackValue) % 5;
    addLog(state, `${state.players[playerId].name} sent ${attackValue} into ${state.players[otherPlayer].name}'s ${target === 0 ? 'left' : 'right'} hand.`);
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
