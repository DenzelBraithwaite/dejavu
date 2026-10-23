import { randomUUID } from 'node:crypto';

const PLAYER_IDS = ['p1', 'p2'];
const DEFAULT_TIMED_CHOICE_DURATION_MS = 20_000;

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

export function createCampaignState(story = null, options = {}) {
  const sessionMode = options.mode === 'singleplayer'
    ? 'singleplayer'
    : 'multiplayer';
  const soloPlayerId = sessionMode === 'singleplayer'
    && PLAYER_IDS.includes(options.soloPlayerId)
    ? options.soloPlayerId
    : null;
  const characters = Array.isArray(options.characters)
    ? structuredClone(options.characters)
    : [];
  const playerCharacters = resolvePlayerCharacters(
    story,
    sessionMode,
    soloPlayerId,
    characters
  );
  const state = {
    version: 1,
    campaignId: randomUUID(),
    story: story ? structuredClone(story) : null,
    sessionMode,
    soloPlayerId,
    currentScene: {
      p1: '',
      p2: ''
    },
    players: {
      p1: createPlayerState(playerCharacters.p1, 'Nova', DEFAULT_STATS.p1),
      p2: createPlayerState(playerCharacters.p2, 'Avona', DEFAULT_STATS.p2)
    },
    characters,
    installedMods: [],
    flags: {},
    checkpoints: {},
    conversations: {},
    votes: {},
    minigames: {},
    activeMinigame: null,
    pendingDice: {},
    appliedCompanions: {
      p1: [],
      p2: []
    },
    terminalOutput: {
      p1: [],
      p2: []
    },
    terminalImages: {
      p1: [],
      p2: []
    },
    deadlines: {},
    transcript: [],
    decisions: [],
    updatedAt: new Date().toISOString()
  };

  if (story) {
    if (sessionMode === 'singleplayer' && soloPlayerId) {
      setPlayerScene(
        state,
        soloPlayerId,
        story.singleplayerInitialSceneId ?? story.initialSceneIds.p1
      );
    } else {
      for (const playerId of PLAYER_IDS) {
        setPlayerScene(state, playerId, story.initialSceneIds[playerId]);
      }
    }
  }

  return state;
}

function createPlayerState(character, fallbackName, fallbackStats) {
  return {
    characterId: character?.id ?? null,
    name: character?.name ?? fallbackName,
    wallet: Number(character?.wallet ?? 0),
    stats: {
      ...(character?.stats ?? fallbackStats)
    },
    inventory: [],
    knownCharacters: [],
    statusEffects: []
  };
}

function resolvePlayerCharacters(story, sessionMode, soloPlayerId, characters) {
  const byId = new Map(characters.map((character) => [character.id, character]));
  const mainCharacterIds = story?.mainCharacterIds ?? {};
  const multiplayer = mainCharacterIds.multiplayer ?? {};
  const soloCharacter = byId.get(mainCharacterIds.singleplayer);

  if (sessionMode === 'singleplayer' && soloPlayerId) {
    return {
      p1: soloPlayerId === 'p1' ? soloCharacter : null,
      p2: soloPlayerId === 'p2' ? soloCharacter : null
    };
  }

  return {
    p1: byId.get(multiplayer.p1),
    p2: byId.get(multiplayer.p2)
  };
}

export function getCampaignSnapshot(state) {
  return structuredClone(state);
}

export function restoreCampaignState(candidate) {
  if (!candidate || candidate.version !== 1) {
    throw new Error('Unsupported or invalid save version.');
  }

  if (!candidate.story) {
    throw new Error('Save does not contain a story cartridge.');
  }

  const restoredPlayerIds = candidate.sessionMode === 'singleplayer'
    && PLAYER_IDS.includes(candidate.soloPlayerId)
    ? [candidate.soloPlayerId]
    : PLAYER_IDS;

  for (const playerId of restoredPlayerIds) {
    if (!getScene(candidate, candidate.currentScene?.[playerId])) {
      throw new Error(`Save references an unknown scene for ${playerId}.`);
    }
  }

  const restored = structuredClone({
    ...candidate,
    sessionMode: candidate.sessionMode ?? 'multiplayer',
    soloPlayerId: candidate.soloPlayerId ?? null,
    installedMods: candidate.installedMods ?? [],
    characters: candidate.characters ?? [],
    minigames: candidate.minigames ?? {},
    activeMinigame: candidate.activeMinigame ?? null,
    pendingDice: candidate.pendingDice ?? {},
    appliedCompanions: candidate.appliedCompanions ?? {
      p1: [],
      p2: []
    },
    terminalOutput: candidate.terminalOutput ?? {
      p1: [],
      p2: []
    },
    terminalImages: candidate.terminalImages ?? {
      p1: [],
      p2: []
    }
  });

  // Older saves did not store persistent terminal images. Rebuild the visible
  // image from the restored scene so loading an image node never appears blank.
  if (!candidate.terminalImages) {
    for (const playerId of restoredPlayerIds) {
      const scene = getScene(restored, restored.currentScene[playerId]);

      if (scene) {
        applySceneImages(restored, playerId, scene);
      }
    }
  }

  return restored;
}

export function handleCampaignAction(state, playerId, action) {
  if (!PLAYER_IDS.includes(playerId)) {
    return actionError('Only assigned players can interact with the campaign.');
  }

  if (state.sessionMode === 'singleplayer' && state.soloPlayerId !== playerId) {
    return actionError('The other player owns this single-player campaign.');
  }

  const sceneId = state.currentScene[playerId];
  const scene = getScene(state, sceneId);

  if (!scene) {
    return actionError(`Unknown scene: ${sceneId}`);
  }

  if (action.sceneId !== scene.id) {
    return actionError('That scene is no longer active.');
  }

  if (state.sessionMode !== 'singleplayer'
    && scene.audience
    && scene.audience !== 'both'
    && scene.audience !== playerId) {
    return actionError('This scene belongs to the other player.');
  }

  let result;

  switch (scene.type) {
    case 'dialogue':
    case 'image':
    case 'effect':
    case 'ambience':
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
    case 'condition':
    case 'clear-terminal':
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

  if (readyPlayers.size === activePlayerIds(state).length) {
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

  const scene = getScene(state, state.activeMinigame.sceneId);
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
  delete state.minigames[scene.id];
  state.activeMinigame = null;
  setSharedScene(state, nextSceneId);
  state.updatedAt = new Date().toISOString();

  return actionSuccess();
}

function handleAdvance(state, playerId, scene, action) {
  if (action.type !== 'advance' || !scene.next) {
    return actionError('This scene requires an advance action.');
  }

  const transcriptText = scene.type === 'image'
    ? scene.logText ?? scene.alt ?? scene.text ?? ''
    : scene.text ?? '';
  const transcriptSpeaker = scene.type === 'image'
    ? 'Image log'
    : scene.speaker ?? 'Narrator';

  recordTranscript(state, playerId, transcriptText, transcriptSpeaker, scene.id);
  applyEffects(state, playerId, scene.effects ?? []);
  archiveSceneForPlayer(state, playerId, scene);
  setPlayerScene(state, playerId, scene.next);

  return actionSuccess();
}

function handleChoice(state, playerId, scene, action) {
  if (scene.type === 'timed-choice' && action.type === 'start-timer') {
    if (!state.deadlines[playerId]) {
      state.deadlines[playerId] = Date.now()
        + (scene.durationMs ?? DEFAULT_TIMED_CHOICE_DURATION_MS);
    }

    return actionSuccess();
  }

  if (action.type !== 'choose') {
    return actionError('This scene requires a choice.');
  }

  const choice = scene.choices?.find((candidate) => candidate.id === action.choiceId);

  if (!choice || choice.disabled) {
    return actionError('That choice is not available.');
  }

  applyEffects(state, playerId, choice.effects ?? []);
  recordDecision(state, playerId, scene.id, choice.id, choice.label);
  archiveSceneForPlayer(state, playerId, scene, `> ${choice.label}`);
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
  archiveSceneForPlayer(state, playerId, scene, `> ${value}`);
  setPlayerScene(state, playerId, scene.next);

  return actionSuccess();
}

function handleCheckpoint(state, playerId, scene, action) {
  if (action.type !== 'arrive-checkpoint') {
    return actionError('This scene requires a checkpoint arrival.');
  }

  const checkpointId = scene.checkpointId ?? scene.id;
  const arrivals = new Set(state.checkpoints[checkpointId] ?? []);

  if (!arrivals.has(playerId)) {
    archiveSceneForPlayer(state, playerId, scene);
  }

  arrivals.add(playerId);
  state.checkpoints[checkpointId] = [...arrivals];

  if (arrivals.size === activePlayerIds(state).length) {
    setSharedScene(state, scene.next);
  }

  return actionSuccess();
}

function handleConversation(state, playerId, scene, action) {
  if (action.type !== 'send-message') {
    return actionError('This scene requires a conversation message.');
  }

  const conversation = initializeConversation(state, scene);

  if (conversation.activePlayer !== playerId) {
    return actionError('Wait for the other player to speak.');
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
  conversation.messageCounts[playerId] += 1;

  recordTranscript(state, playerId, message, state.players[playerId].name, scene.id);
  state.conversations[scene.id] = conversation;

  if (hasConversationFinished(conversation)) {
    for (const participantId of PLAYER_IDS) {
      archiveSceneForPlayer(state, participantId, scene);

      for (const conversationMessage of conversation.messages) {
        appendTerminalEntry(state, participantId, {
          sceneId: scene.id,
          speaker: conversationMessage.playerName,
          text: conversationMessage.text
        });
      }
    }

    setSharedScene(state, scene.next);
  } else {
    conversation.activePlayer = getNextConversationSpeaker(
      playerId,
      conversation
    );
  }

  return actionSuccess();
}

function handleDiceCheck(state, playerId, scene, action) {
  const pendingRoll = state.pendingDice[playerId];

  if (action.type === 'close-dice') {
    if (!pendingRoll || pendingRoll.sceneId !== scene.id) {
      return actionError('Roll the dice before closing the dice terminal.');
    }

    archiveSceneForPlayer(
      state,
      playerId,
      scene,
      formatDiceResult(pendingRoll)
    );
    setPlayerScene(state, playerId, pendingRoll.nextSceneId);
    delete state.pendingDice[playerId];

    return actionSuccess();
  }

  if (action.type !== 'roll-dice') {
    return actionError('This scene requires a dice roll.');
  }

  if (pendingRoll) {
    return {
      ok: true,
      result: pendingRoll
    };
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

  const result = {
    sceneId: scene.id,
    nextSceneId: successful ? scene.success : scene.failure,
    die,
    roll,
    stat: scene.stat,
    base,
    luck,
    total,
    threshold: scene.threshold,
    successful
  };

  state.pendingDice[playerId] = result;

  return {
    ok: true,
    result
  };
}

function handleVote(state, playerId, scene, action) {
  if (action.type !== 'vote') {
    return actionError('This scene requires a vote.');
  }

  const choice = scene.choices?.find((candidate) => candidate.id === action.choiceId);

  if (!choice || choice.disabled) {
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

  for (const participantId of PLAYER_IDS) {
    archiveSceneForPlayer(
      state,
      participantId,
      scene,
      `> ${selectedChoice.label}${votes.p1 !== votes.p2 ? ' (randomly resolved)' : ''}`
    );
  }

  setSharedScene(state, selectedChoice.next);

  return actionSuccess();
}

export function resolveExpiredTimedChoices(state, now = Date.now()) {
  let changed = false;

  for (const playerId of PLAYER_IDS) {
    const scene = getScene(state, state.currentScene[playerId]);
    const deadline = state.deadlines[playerId];

    if (!scene || scene.type !== 'timed-choice' || !deadline || deadline > now) {
      continue;
    }

    const enabledChoices = scene.choices?.filter((choice) => !choice.disabled) ?? [];
    const fallback = enabledChoices.find(
      (choice) => choice.id === scene.fallbackChoiceId
    ) ?? enabledChoices[Math.floor(Math.random() * enabledChoices.length)];

    if (!fallback) {
      continue;
    }

    applyEffects(state, playerId, fallback.effects ?? []);
    recordDecision(state, playerId, scene.id, fallback.id, fallback.label, true);
    archiveSceneForPlayer(state, playerId, scene, `> ${fallback.label} (auto-selected)`);
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
    const scene = getScene(state, state.currentScene[playerId]);

    if (scene?.type !== 'timed-choice') {
      delete state.deadlines[playerId];
    }
  }
}

function setPlayerScene(state, playerId, nextSceneId) {
  const nextScene = resolveAutomaticNodes(state, playerId, nextSceneId);

  if (!nextScene) {
    throw new Error(`Cannot advance to unknown scene: ${nextSceneId}`);
  }

  state.currentScene[playerId] = nextScene.id;
  applyAttachedCompanions(state, playerId, nextScene);
  applySceneImages(state, playerId, nextScene);
  delete state.deadlines[playerId];

  if (nextScene.type === 'conversation') {
    initializeConversation(state, nextScene);
  }
}

function applySceneImages(state, playerId, scene) {
  const attachedImages = state.story?.nodes.filter(
    (node) => node.type === 'image'
      && node.attachedTo === scene.id
      && node.src
      && (node.audience === 'both' || node.audience === playerId)
  ) ?? [];
  const imageNodes = scene.type === 'image' && scene.src
    ? [scene]
    : attachedImages;

  if (imageNodes.length === 0) {
    return;
  }

  state.terminalImages ??= {
    p1: [],
    p2: []
  };
  state.terminalImages[playerId] = imageNodes.map((image) => ({
    src: image.src,
    alt: image.alt ?? '',
    logText: image.logText ?? image.alt ?? '',
    imagePositionX: Number(image.imagePositionX ?? 50),
    imagePositionY: Number(image.imagePositionY ?? 50),
    imageBorderColor: image.imageBorderColor ?? '#1472bf'
  }));
}

function applyAttachedCompanions(state, playerId, scene) {
  const applied = new Set(state.appliedCompanions?.[playerId] ?? []);
  const companions = state.story?.nodes.filter(
    (node) => node.attachedTo === scene.id
      && (node.audience === 'both' || node.audience === playerId)
  ) ?? [];

  for (const companion of companions) {
    if (companion.type !== 'effect' || applied.has(companion.id)) {
      continue;
    }

    applyEffects(state, playerId, companion.effects ?? []);
    applied.add(companion.id);
  }

  state.appliedCompanions ??= {
    p1: [],
    p2: []
  };
  state.appliedCompanions[playerId] = [...applied];
}

function resolveAutomaticNodes(state, playerId, startingSceneId) {
  let scene = getScene(state, startingSceneId);
  let traversedNodes = 0;

  // Automatic nodes alter state or routing without ever becoming an interactive terminal scene.
  while (scene?.type === 'condition' || scene?.type === 'clear-terminal') {
    traversedNodes += 1;

    if (traversedNodes > 50) {
      throw new Error('Automatic node chain exceeded 50 nodes. Check the story for a loop.');
    }

    if (scene.type === 'clear-terminal') {
      state.terminalOutput[playerId] = [];
      state.terminalImages ??= {
        p1: [],
        p2: []
      };
      state.terminalImages[playerId] = [];
      scene = getScene(state, scene.next);
      continue;
    }

    const destination = evaluateCondition(state, playerId, scene.condition)
      ? scene.trueNext
      : scene.falseNext;

    if (!destination) {
      throw new Error(`Condition node ${scene.id} has an unconnected branch.`);
    }

    scene = getScene(state, destination);
  }

  return scene;
}

function evaluateCondition(state, playerId, condition = {}) {
  switch (condition.type) {
    case 'has-item':
      return state.players[playerId].inventory.includes(condition.key);
    case 'flag-equals':
      return state.flags[condition.key] === condition.value;
    case 'stat-at-least':
      return Number(state.players[playerId].stats[condition.key] ?? 0)
        >= Number(condition.value ?? 0);
    case 'last-dice-success': {
      const lastDiceDecision = [...state.decisions].reverse().find(
        (decision) => decision.type === 'dice-check' && decision.playerId === playerId
      );

      return Boolean(lastDiceDecision?.successful);
    }
    default:
      return false;
  }
}

function archiveSceneForPlayer(state, playerId, scene, response = '') {
  const text = scene.text ?? scene.prompt ?? '';
  const character = state.characters.find(
    (candidate) => candidate.id === scene.characterId
  );
  const expression = scene.expression ?? 'normal';

  if (text) {
    appendTerminalEntry(state, playerId, {
      sceneId: scene.id,
      speaker: character?.name ?? scene.speaker ?? 'SYSTEM',
      text,
      portrait: character?.images?.[expression] ?? scene.portrait ?? '',
      portraitPosition: character?.imagePositions?.[expression]
        ?? scene.portraitPosition
        ?? { x: 50, y: 50 },
      portraitAlt: character
        ? `${character.name}, ${expression} expression`
        : scene.portraitAlt ?? ''
    });
  }

  if (response) {
    appendTerminalEntry(state, playerId, {
      sceneId: scene.id,
      speaker: state.players[playerId].name,
      text: response
    });
  }
}

function appendTerminalEntry(state, playerId, entry) {
  state.terminalOutput[playerId].push({
    ...entry,
    createdAt: new Date().toISOString()
  });
}

function formatDiceResult(result) {
  const outcome = result.successful ? 'SUCCESS' : 'FAILURE';

  return `> D${result.die}: ${result.roll} + ${result.base} ${result.stat} + ${result.luck} luck = ${result.total} / ${result.threshold} — ${outcome}`;
}

function setSharedScene(state, nextSceneId) {
  for (const playerId of activePlayerIds(state)) {
    setPlayerScene(state, playerId, nextSceneId);
  }
}

function activePlayerIds(state) {
  return state.sessionMode === 'singleplayer' && state.soloPlayerId
    ? [state.soloPlayerId]
    : PLAYER_IDS;
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
      case 'install-mod':
        addUnique(state.installedMods, effect.key);
        break;
      case 'remove-mod':
        state.installedMods = state.installedMods.filter(
          (modId) => modId !== effect.key
        );
        break;
      default:
        throw new Error(`Unsupported scene effect: ${effect.type}`);
    }
  }
}

function initializeConversation(state, scene) {
  if (state.conversations[scene.id]) {
    const conversation = state.conversations[scene.id];

    conversation.requiredMessages ??= getRequiredMessageCounts(
      scene,
      conversation.activePlayer
    );
    conversation.messageCounts ??= countConversationMessages(conversation.messages);

    return conversation;
  }

  const preferredFirstPlayer = scene.firstPlayer === 'p1' || scene.firstPlayer === 'p2'
    ? scene.firstPlayer
    : PLAYER_IDS[Math.floor(Math.random() * PLAYER_IDS.length)];
  const requiredMessages = getRequiredMessageCounts(scene, preferredFirstPlayer);
  const activePlayer = getValidFirstSpeaker(
    preferredFirstPlayer,
    requiredMessages
  );

  const conversation = {
    activePlayer,
    messages: [],
    messageCounts: {
      p1: 0,
      p2: 0
    },
    requiredMessages
  };

  state.conversations[scene.id] = conversation;
  return conversation;
}

function getRequiredMessageCounts(scene, firstPlayer) {
  if (scene.messagesPerPlayer) {
    return {
      p1: normalizeMessageCount(scene.messagesPerPlayer.p1),
      p2: normalizeMessageCount(scene.messagesPerPlayer.p2)
    };
  }

  const totalMessages = Math.max(1, Math.floor(scene.messageCount ?? 2));
  const otherPlayer = firstPlayer === 'p1' ? 'p2' : 'p1';
  const requiredMessages = {
    p1: 0,
    p2: 0
  };

  requiredMessages[firstPlayer] = Math.ceil(totalMessages / 2);
  requiredMessages[otherPlayer] = Math.floor(totalMessages / 2);
  return requiredMessages;
}

function normalizeMessageCount(value) {
  return Math.max(0, Math.floor(Number(value ?? 0)));
}

function countConversationMessages(messages) {
  return messages.reduce(
    (counts, message) => {
      counts[message.playerId] += 1;
      return counts;
    },
    {
      p1: 0,
      p2: 0
    }
  );
}

function hasConversationFinished(conversation) {
  return PLAYER_IDS.every(
    (playerId) => conversation.messageCounts[playerId]
      >= conversation.requiredMessages[playerId]
  );
}

function getValidFirstSpeaker(preferredPlayer, requiredMessages) {
  const difference = requiredMessages.p1 - requiredMessages.p2;

  if (Math.abs(difference) > 1) {
    throw new Error(
      'Conversation message quotas must differ by no more than one to alternate turns.'
    );
  }

  if (difference === 1) {
    return 'p1';
  }

  if (difference === -1) {
    return 'p2';
  }

  return preferredPlayer;
}

function getNextConversationSpeaker(currentPlayer, conversation) {
  return currentPlayer === 'p1' ? 'p2' : 'p1';
}

function addUnique(items, value) {
  if (!items.includes(value)) {
    items.push(value);
  }
}

function getScene(state, sceneId) {
  return state.story?.nodes.find((scene) => scene.id === sceneId);
}

function recordTranscript(state, playerId, text, speaker, sceneId = '') {
  if (!text) {
    return;
  }

  state.transcript.push({
    playerId,
    sceneId,
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
