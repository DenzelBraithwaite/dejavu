import { randomUUID } from 'node:crypto';
import { getScene, initialSceneIds } from '../src/lib/story/storyRegistry.js';

const PLAYER_IDS = ['p1', 'p2'];

const DEFAULT_STATS = {
  p1: {
    muscles: 11,
    toughness: 10,
    speed: 9,
    stealth: 8,
    smarts: 12,
    ocuware: 10,
    cred: 15,
    luck: 2,
    hacking: 17
  },
  p2: {
    muscles: 8,
    toughness: 9,
    speed: 10,
    stealth: 12,
    smarts: 11,
    ocuware: 20,
    cred: 13,
    luck: 4,
    hacking: 6
  }
};

export function createCampaignState() {
  return {
    version: 1,
    campaignId: randomUUID(),
    currentScene: {
      ...initialSceneIds
    },
    players: {
      p1: createPlayerState('Nova', DEFAULT_STATS.p1),
      p2: createPlayerState('Avona', DEFAULT_STATS.p2)
    },
    flags: {},
    checkpoints: {},
    conversations: {},
    votes: {},
    minigames: {},
    activeMinigame: null,
    deadlines: {},
    transcript: [],
    decisions: [],
    updatedAt: new Date().toISOString()
  };
}

function createPlayerState(name, stats) {
  return {
    name,
    stats: {
      ...stats
    },
    inventory: [],
    knownCharacters: [],
    statusEffects: []
  };
}

export function getCampaignSnapshot(state) {
  return structuredClone(state);
}

export function restoreCampaignState(candidate) {
  if (!candidate || candidate.version !== 1) {
    throw new Error('Unsupported or invalid save version.');
  }

  for (const playerId of PLAYER_IDS) {
    if (!getScene(candidate.currentScene?.[playerId])) {
      throw new Error(`Save references an unknown scene for ${playerId}.`);
    }
  }

  return structuredClone({
    ...candidate,
    minigames: candidate.minigames ?? {},
    activeMinigame: candidate.activeMinigame ?? null
  });
}

export function handleCampaignAction(state, playerId, action) {
  if (!PLAYER_IDS.includes(playerId)) {
    return actionError('Only assigned players can interact with the campaign.');
  }

  const sceneId = state.currentScene[playerId];
  const scene = getScene(sceneId);

  if (!scene) {
    return actionError(`Unknown scene: ${sceneId}`);
  }

  if (action.sceneId !== scene.id) {
    return actionError('That scene is no longer active.');
  }

  if (scene.audience && scene.audience !== 'both' && scene.audience !== playerId) {
    return actionError('This scene belongs to the other player.');
  }

  let result;

  switch (scene.type) {
    case 'dialogue':
    case 'image':
      result = handleAdvance(state, playerId, scene, action);
      break;
    case 'choice':
    case 'timed-choice':
      result = handleChoice(state, playerId, scene, action);
      break;
    case 'input':
      result = handleInput(state, playerId, scene, action);
      break;
    case 'checkpoint':
      result = handleCheckpoint(state, playerId, scene, action);
      break;
    case 'conversation':
      result = handleConversation(state, playerId, scene, action);
      break;
    case 'dice-check':
      result = handleDiceCheck(state, playerId, scene, action);
      break;
    case 'vote':
      result = handleVote(state, playerId, scene, action);
      break;
    case 'minigame':
      result = handleMinigameLaunch(state, playerId, scene, action);
      break;
    case 'ending':
      result = actionError('This scene does not accept that action.');
      break;
    default:
      result = actionError(`Unsupported scene type: ${scene.type}`);
  }

  if (result.ok) {
    state.updatedAt = new Date().toISOString();
    initializeDeadlines(state);
  }

  return result;
}

function handleMinigameLaunch(state, playerId, scene, action) {
  if (action.type !== 'launch-minigame') {
    return actionError('This scene requires a minigame launch action.');
  }

  const launchState = state.minigames[scene.id] ?? {
    readyPlayers: []
  };
  const readyPlayers = new Set(launchState.readyPlayers);
  readyPlayers.add(playerId);
  launchState.readyPlayers = [...readyPlayers];
  state.minigames[scene.id] = launchState;

  if (readyPlayers.size === PLAYER_IDS.length) {
    state.activeMinigame = {
      id: scene.minigameId,
      sceneId: scene.id,
      startedAt: new Date().toISOString()
    };
  }

  return actionSuccess();
}

export function completeActiveMinigame(state, resultId) {
  if (!state.activeMinigame) {
    return actionError('No story minigame is active.');
  }

  const scene = getScene(state.activeMinigame.sceneId);
  const nextSceneId = scene?.resultNext?.[resultId];

  if (!nextSceneId) {
    return actionError(`The minigame result is not connected: ${resultId}`);
  }

  state.decisions.push({
    type: 'minigame',
    sceneId: scene.id,
    minigameId: state.activeMinigame.id,
    resultId,
    createdAt: new Date().toISOString()
  });
  state.activeMinigame = null;
  setSharedScene(state, nextSceneId);
  state.updatedAt = new Date().toISOString();

  return actionSuccess();
}

function handleAdvance(state, playerId, scene, action) {
  if (action.type !== 'advance' || !scene.next) {
    return actionError('This scene requires an advance action.');
  }

  recordTranscript(state, playerId, scene.text ?? '', scene.speaker ?? 'Narrator');
  applyEffects(state, playerId, scene.effects ?? []);
  setPlayerScene(state, playerId, scene.next);

  return actionSuccess();
}

function handleChoice(state, playerId, scene, action) {
  if (action.type !== 'choose') {
    return actionError('This scene requires a choice.');
  }

  const choice = scene.choices?.find((candidate) => candidate.id === action.choiceId);

  if (!choice) {
    return actionError('That choice is not available.');
  }

  applyEffects(state, playerId, choice.effects ?? []);
  recordDecision(state, playerId, scene.id, choice.id, choice.label);
  setPlayerScene(state, playerId, choice.next);

  return actionSuccess();
}

function handleInput(state, playerId, scene, action) {
  if (action.type !== 'submit-input') {
    return actionError('This scene requires text input.');
  }

  const value = String(action.value ?? '').trim().slice(0, scene.maxLength ?? 200);

  if (!value) {
    return actionError('Enter a value before continuing.');
  }

  state.players[playerId].name = value;
  recordDecision(state, playerId, scene.id, 'input', value);
  setPlayerScene(state, playerId, scene.next);

  return actionSuccess();
}

function handleCheckpoint(state, playerId, scene, action) {
  if (action.type !== 'arrive-checkpoint') {
    return actionError('This scene requires a checkpoint arrival.');
  }

  const checkpointId = scene.checkpointId ?? scene.id;
  const arrivals = new Set(state.checkpoints[checkpointId] ?? []);
  arrivals.add(playerId);
  state.checkpoints[checkpointId] = [...arrivals];

  if (arrivals.size === PLAYER_IDS.length) {
    setSharedScene(state, scene.next);
  }

  return actionSuccess();
}

function handleConversation(state, playerId, scene, action) {
  if (action.type !== 'send-message') {
    return actionError('This scene requires a conversation message.');
  }

  const conversation = state.conversations[scene.id] ?? {
    activePlayer: scene.firstPlayer ?? 'p1',
    messages: []
  };

  if (conversation.activePlayer !== playerId) {
    return actionError('Wait for the other player to reply.');
  }

  const message = String(action.value ?? '').trim().slice(0, 300);

  if (!message) {
    return actionError('Enter a message before sending.');
  }

  conversation.messages.push({
    playerId,
    playerName: state.players[playerId].name,
    text: message,
    createdAt: new Date().toISOString()
  });

  recordTranscript(state, playerId, message, state.players[playerId].name);
  conversation.activePlayer = playerId === 'p1' ? 'p2' : 'p1';
  state.conversations[scene.id] = conversation;

  if (conversation.messages.length >= (scene.messageCount ?? 2)) {
    setSharedScene(state, scene.next);
  }

  return actionSuccess();
}

function handleDiceCheck(state, playerId, scene, action) {
  if (action.type !== 'roll-dice') {
    return actionError('This scene requires a dice roll.');
  }

  const die = scene.die ?? 20;
  const roll = Math.floor(Math.random() * die) + 1;
  const base = Number(state.players[playerId].stats[scene.stat] ?? 0);
  const luck = Number(state.players[playerId].stats.luck ?? 0);
  const total = roll + base + luck;
  const successful = total >= (scene.threshold ?? 0);

  state.decisions.push({
    type: 'dice-check',
    sceneId: scene.id,
    playerId,
    die,
    roll,
    stat: scene.stat,
    base,
    luck,
    total,
    threshold: scene.threshold,
    successful,
    createdAt: new Date().toISOString()
  });

  setPlayerScene(state, playerId, successful ? scene.success : scene.failure);

  return {
    ok: true,
    result: {
      die,
      roll,
      base,
      luck,
      total,
      threshold: scene.threshold,
      successful
    }
  };
}

function handleVote(state, playerId, scene, action) {
  if (action.type !== 'vote') {
    return actionError('This scene requires a vote.');
  }

  const choice = scene.choices?.find((candidate) => candidate.id === action.choiceId);

  if (!choice) {
    return actionError('That vote is not available.');
  }

  const votes = state.votes[scene.id] ?? {};
  votes[playerId] = choice.id;
  state.votes[scene.id] = votes;

  if (!votes.p1 || !votes.p2) {
    return actionSuccess();
  }

  const selectedId = votes.p1 === votes.p2
    ? votes.p1
    : [votes.p1, votes.p2][Math.floor(Math.random() * 2)];
  const selectedChoice = scene.choices.find((candidate) => candidate.id === selectedId);

  applyEffects(state, 'p1', selectedChoice.effects ?? []);
  recordDecision(
    state,
    'both',
    scene.id,
    selectedChoice.id,
    selectedChoice.label,
    votes.p1 !== votes.p2
  );
  setSharedScene(state, selectedChoice.next);

  return actionSuccess();
}

export function resolveExpiredTimedChoices(state, now = Date.now()) {
  let changed = false;

  for (const playerId of PLAYER_IDS) {
    const scene = getScene(state.currentScene[playerId]);
    const deadline = state.deadlines[playerId];

    if (!scene || scene.type !== 'timed-choice' || !deadline || deadline > now) {
      continue;
    }

    const fallback = scene.choices?.find(
      (choice) => choice.id === scene.fallbackChoiceId
    ) ?? scene.choices?.[Math.floor(Math.random() * scene.choices.length)];

    if (!fallback) {
      continue;
    }

    applyEffects(state, playerId, fallback.effects ?? []);
    recordDecision(state, playerId, scene.id, fallback.id, fallback.label, true);
    setPlayerScene(state, playerId, fallback.next);
    changed = true;
  }

  if (changed) {
    state.updatedAt = new Date().toISOString();
    initializeDeadlines(state);
  }

  return changed;
}

export function initializeDeadlines(state) {
  for (const playerId of PLAYER_IDS) {
    const scene = getScene(state.currentScene[playerId]);

    if (scene?.type === 'timed-choice' && !state.deadlines[playerId]) {
      state.deadlines[playerId] = Date.now() + scene.durationMs;
    }

    if (scene?.type !== 'timed-choice') {
      delete state.deadlines[playerId];
    }
  }
}

function setPlayerScene(state, playerId, nextSceneId) {
  if (!getScene(nextSceneId)) {
    throw new Error(`Cannot advance to unknown scene: ${nextSceneId}`);
  }

  state.currentScene[playerId] = nextSceneId;
  delete state.deadlines[playerId];
}

function setSharedScene(state, nextSceneId) {
  for (const playerId of PLAYER_IDS) {
    setPlayerScene(state, playerId, nextSceneId);
  }
}

function applyEffects(state, playerId, effects) {
  for (const effect of effects) {
    switch (effect.type) {
      case 'set-flag':
        state.flags[effect.key] = effect.value;
        break;
      case 'add-item':
        addUnique(state.players[playerId].inventory, effect.key);
        break;
      case 'remove-item':
        state.players[playerId].inventory = state.players[playerId].inventory.filter(
          (item) => item !== effect.key
        );
        break;
      case 'discover-character':
        addUnique(state.players[playerId].knownCharacters, effect.key);
        break;
      case 'adjust-stat':
        state.players[playerId].stats[effect.key] = Number(
          state.players[playerId].stats[effect.key] ?? 0
        ) + Number(effect.value ?? 0);
        break;
      default:
        throw new Error(`Unsupported scene effect: ${effect.type}`);
    }
  }
}

function addUnique(items, value) {
  if (!items.includes(value)) {
    items.push(value);
  }
}

function recordTranscript(state, playerId, text, speaker) {
  if (!text) {
    return;
  }

  state.transcript.push({
    playerId,
    speaker,
    text,
    createdAt: new Date().toISOString()
  });
}

function recordDecision(state, playerId, sceneId, choiceId, label, randomized = false) {
  state.decisions.push({
    type: 'choice',
    playerId,
    sceneId,
    choiceId,
    label,
    randomized,
    createdAt: new Date().toISOString()
  });
}

function actionSuccess() {
  return {
    ok: true
  };
}

function actionError(message) {
  return {
    ok: false,
    error: message
  };
}
