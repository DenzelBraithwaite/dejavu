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
  const relationshipDefinitions = Array.isArray(story?.relationships)
    ? structuredClone(story.relationships)
    : [];
  const state = {
    version: 1,
    campaignId: randomUUID(),
    story: story ? structuredClone(story) : null,
    relationshipDefinitions,
    sessionMode,
    soloPlayerId,
    currentScene: {
      p1: '',
      p2: ''
    },
    lastScene: {
      p1: '',
      p2: ''
    },
    players: {
      p1: createPlayerState(
        playerCharacters.p1,
        'Nova',
        DEFAULT_STATS.p1,
        relationshipDefinitions
      ),
      p2: createPlayerState(
        playerCharacters.p2,
        'Avona',
        DEFAULT_STATS.p2,
        relationshipDefinitions
      )
    },
    defaultCharacterIds: {
      p1: playerCharacters.p1?.id ?? null,
      p2: playerCharacters.p2?.id ?? null
    },
    characters,
    installedMods: [],
    flags: {},
    inputs: {
      p1: {},
      p2: {}
    },
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
    endedPlayers: [],
    deadlines: {},
    transcript: [],
    decisions: [],
    updatedAt: new Date().toISOString()
  };

  if (story) {
    if (sessionMode === 'singleplayer') {
      const singleplayerIds = soloPlayerId ? [soloPlayerId] : PLAYER_IDS;

      for (const playerId of singleplayerIds) {
        setPlayerScene(
          state,
          playerId,
          story.singleplayerInitialSceneId ?? story.initialSceneIds.p1
        );
      }
    } else {
      for (const playerId of PLAYER_IDS) {
        setPlayerScene(state, playerId, story.initialSceneIds[playerId]);
      }
    }
  }

  return state;
}

function createPlayerState(character, fallbackName, fallbackStats, relationshipDefinitions) {
  const defaultName = character?.name ?? fallbackName;

  return {
    characterId: character?.id ?? null,
    defaultName,
    customName: '',
    name: defaultName,
    wallet: Number(character?.wallet ?? 0),
    stats: {
      ...(character?.stats ?? fallbackStats)
    },
    inventory: [],
    itemImages: {},
    knownCharacters: [],
    statusEffects: [],
    relationships: Object.fromEntries(
      relationshipDefinitions.map((relationship) => [
        relationship.id,
        Number(relationship.initialValue ?? 0)
      ])
    )
  };
}

function resolvePlayerCharacters(story, sessionMode, soloPlayerId, characters) {
  const byId = new Map(characters.map((character) => [character.id, character]));
  const mainCharacterIds = story?.mainCharacterIds ?? {};
  const multiplayer = mainCharacterIds.multiplayer ?? {};
  const soloCharacter = byId.get(mainCharacterIds.singleplayer);

  if (sessionMode === 'singleplayer') {
    return {
      p1: !soloPlayerId || soloPlayerId === 'p1' ? soloCharacter : null,
      p2: !soloPlayerId || soloPlayerId === 'p2' ? soloCharacter : null
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
    if (!candidate.endedPlayers?.includes(playerId)
      && !getScene(candidate, candidate.currentScene?.[playerId])) {
      throw new Error(`Save references an unknown scene for ${playerId}.`);
    }
  }

  const restored = structuredClone({
    ...candidate,
    sessionMode: candidate.sessionMode ?? 'multiplayer',
    soloPlayerId: candidate.soloPlayerId ?? null,
    relationshipDefinitions: candidate.relationshipDefinitions
      ?? candidate.story.relationships
      ?? [],
    installedMods: candidate.installedMods ?? [],
    characters: candidate.characters ?? [],
    minigames: candidate.minigames ?? {},
    activeMinigame: candidate.activeMinigame ?? null,
    defaultCharacterIds: candidate.defaultCharacterIds ?? {
      p1: candidate.sessionMode === 'singleplayer'
        ? candidate.story.mainCharacterIds?.singleplayer ?? null
        : candidate.story.mainCharacterIds?.multiplayer?.p1 ?? null,
      p2: candidate.sessionMode === 'singleplayer'
        ? candidate.story.mainCharacterIds?.singleplayer ?? null
        : candidate.story.mainCharacterIds?.multiplayer?.p2 ?? null
    },
    inputs: candidate.inputs ?? {
      p1: {},
      p2: {}
    },
    lastScene: candidate.lastScene ?? {
      p1: candidate.currentScene?.p1 ?? '',
      p2: candidate.currentScene?.p2 ?? ''
    },
    pendingDice: candidate.pendingDice ?? {},
    appliedCompanions: candidate.appliedCompanions ?? {
      p1: [],
      p2: []
    },
    terminalOutput: candidate.terminalOutput ?? {
      p1: [],
      p2: []
    },
    endedPlayers: candidate.endedPlayers ?? []
  });

  for (const playerId of PLAYER_IDS) {
    restored.players[playerId].relationships ??= {};
    restored.players[playerId].itemImages ??= {};
    restored.players[playerId].defaultName ??= restored.players[playerId].name;
    restored.players[playerId].customName ??= '';
    restored.players[playerId].name = restored.players[playerId].customName
      || restored.players[playerId].defaultName;

    for (const relationship of restored.relationshipDefinitions) {
      restored.players[playerId].relationships[relationship.id]
        ??= Number(relationship.initialValue ?? 0);
    }
  }

  // Migrate the short-lived persistent image format into the chronological
  // terminal feed. Images now behave exactly like text output and never move.
  for (const playerId of restoredPlayerIds) {
    for (const image of candidate.terminalImages?.[playerId] ?? []) {
      appendTerminalEntry(restored, playerId, {
        kind: 'image',
        sceneId: restored.currentScene[playerId] || 'restored-image',
        speaker: '',
        text: '',
        ...image
      });
    }
  }

  return restored;
}

export function handleCampaignAction(state, playerId, action) {
  if (!PLAYER_IDS.includes(playerId)) {
    return actionError('Only assigned players can interact with the campaign.');
  }

  if (state.sessionMode === 'singleplayer'
    && state.soloPlayerId
    && state.soloPlayerId !== playerId) {
    return actionError('The other player owns this single-player campaign.');
  }

  if (state.endedPlayers?.includes(playerId)) {
    return actionError('This story path has ended.');
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

  const requiredPlayerCount = state.sessionMode === 'singleplayer'
    ? 1
    : activePlayerIds(state).length;

  if (readyPlayers.size === requiredPlayerCount) {
    state.activeMinigame = {
      id: scene.minigameId,
      sceneId: scene.id,
      ownerPlayerId: playerId,
      perspectivePlayerId: playerId,
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
  const perspectivePlayerId = state.activeMinigame.perspectivePlayerId;
  const nextSceneId = scene?.resultNext?.[resultId]
    ?? (resultId !== 'cancelled' ? scene?.resultNext?.completed : undefined);

  state.decisions.push({
    type: 'minigame',
    sceneId: scene.id,
    minigameId: state.activeMinigame.id,
    resultId,
    createdAt: new Date().toISOString()
  });
  delete state.minigames[scene.id];
  state.activeMinigame = null;
  if (state.sessionMode === 'singleplayer'
    && !state.soloPlayerId
    && perspectivePlayerId) {
    setPlayerScene(state, perspectivePlayerId, nextSceneId);
  } else {
    setSharedScene(state, nextSceneId);
  }
  state.updatedAt = new Date().toISOString();

  return actionSuccess();
}

function handleAdvance(state, playerId, scene, action) {
  if (scene.type === 'dialogue' && scene.timed && action.type === 'start-timer') {
    if (!state.deadlines[playerId]) {
      state.deadlines[playerId] = Date.now()
        + (scene.durationMs ?? DEFAULT_TIMED_CHOICE_DURATION_MS);
    }

    return actionSuccess();
  }

  if (scene.type === 'dialogue' && scene.timed) {
    return actionError('This dialogue advances automatically when its timer ends.');
  }

  if (action.type !== 'advance') {
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
  if (scene.type !== 'image') {
    archiveSceneForPlayer(state, playerId, scene);
  }

  setPlayerScene(state, playerId, scene.next);

  return actionSuccess();
}

function handleChoice(state, playerId, scene, action) {
  if ((scene.type === 'timed-choice' || scene.timed) && action.type === 'start-timer') {
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

  if (!choice || !choiceIsAvailable(state, playerId, choice)) {
    return actionError('That choice is not available.');
  }

  applyEffects(state, playerId, choice.effects ?? []);
  const decisionSeverity = ['minor', 'major'].includes(scene.decisionSeverity)
    ? scene.decisionSeverity
    : 'none';

  if (decisionSeverity !== 'none') {
    recordDecision(
      state,
      playerId,
      scene.id,
      choice.id,
      choice.label,
      false,
      decisionSeverity
    );
  }

  const decisionNotice = decisionSeverity === 'none'
    ? ''
    : ` · ${decisionSeverity.toUpperCase()} DECISION REMEMBERED`;
  archiveSceneForPlayer(state, playerId, scene, `> ${choice.label}${decisionNotice}`);

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

  if (scene.saveInput !== false) {
    const inputKey = normalizeInputKey(scene.inputKey || scene.id);

    state.inputs ??= { p1: {}, p2: {} };
    state.inputs[playerId] ??= {};
    state.inputs[playerId][inputKey] = value;
  }
  archiveSceneForPlayer(state, playerId, scene, `> ${value}`);
  setPlayerScene(state, playerId, scene.next);

  return actionSuccess();
}

function normalizeInputKey(value) {
  return String(value ?? 'input')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'INPUT';
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
  // A luck check already uses luck as its base stat, so it must not receive
  // the same modifier a second time.
  const luck = scene.stat === 'luck'
    ? 0
    : Number(state.players[playerId].stats.luck ?? 0);
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

  if (!choice || !choiceIsAvailable(state, playerId, choice)) {
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
      `> ${selectedChoice.label}${votes.p1 !== votes.p2 ? ' (randomly selected)' : ''}`
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

    if (!scene
      || (scene.type !== 'timed-choice' && !scene.timed)
      || !deadline
      || deadline > now) {
      continue;
    }

    if (scene.type === 'dialogue' && scene.timed) {
      recordTranscript(state, playerId, scene.text ?? '', scene.speaker ?? 'Narrator', scene.id);
      applyEffects(state, playerId, scene.effects ?? []);
      archiveSceneForPlayer(state, playerId, scene);
      setPlayerScene(state, playerId, scene.next);
      changed = true;
      continue;
    }

    const enabledChoices = scene.choices?.filter(
      (choice) => choiceIsAvailable(state, playerId, choice)
    ) ?? [];
    const fallback = enabledChoices.find(
      (choice) => choice.id === scene.fallbackChoiceId
    ) ?? enabledChoices[Math.floor(Math.random() * enabledChoices.length)];

    if (!fallback) {
      archiveSceneForPlayer(state, playerId, scene);
      markPlayerEnded(state, playerId);
      changed = true;
      continue;
    }

    const decisionSeverity = ['minor', 'major'].includes(scene.decisionSeverity)
      ? scene.decisionSeverity
      : 'none';
    const decisionNotice = decisionSeverity === 'none'
      ? ''
      : ` · ${decisionSeverity.toUpperCase()} DECISION REMEMBERED`;

    applyEffects(state, playerId, fallback.effects ?? []);

    if (decisionSeverity !== 'none') {
      recordDecision(
        state,
        playerId,
        scene.id,
        fallback.id,
        fallback.label,
        true,
        decisionSeverity
      );
    }

    archiveSceneForPlayer(
      state,
      playerId,
      scene,
      `> ${fallback.label} (auto-selected)${decisionNotice}`
    );
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

    if (scene?.type !== 'timed-choice' && !scene?.timed) {
      delete state.deadlines[playerId];
    }
  }
}

function setPlayerScene(state, playerId, nextSceneId) {
  if (!nextSceneId) {
    markPlayerEnded(state, playerId);
    return;
  }

  const nextScene = resolveAutomaticNodes(state, playerId, nextSceneId);

  if (!nextScene) {
    markPlayerEnded(state, playerId);
    return;
  }

  state.endedPlayers = (state.endedPlayers ?? []).filter(
    (candidate) => candidate !== playerId
  );
  state.currentScene[playerId] = nextScene.id;
  state.lastScene ??= {
    p1: '',
    p2: ''
  };
  state.lastScene[playerId] = nextScene.id;
  applyAttachedCompanions(state, playerId, nextScene);
  appendSceneImages(state, playerId, nextScene);
  delete state.deadlines[playerId];

  if (nextScene.type === 'conversation') {
    initializeConversation(state, nextScene);
  }
}

function appendSceneImages(state, playerId, scene) {
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

  for (const image of imageNodes) {
    const character = state.characters.find(
      (candidate) => candidate.id === image.characterId
    );
    const expression = image.expression ?? 'normal';

    appendTerminalEntry(state, playerId, {
      kind: 'image',
      sceneId: image.id,
      speaker: character?.name ?? image.speaker ?? '',
      text: image.text ?? '',
      portrait: character?.images?.[expression] ?? image.portrait ?? '',
      portraitPosition: character?.imagePositions?.[expression]
        ?? image.portraitPosition
        ?? { x: 50, y: 50 },
      portraitAlt: character
        ? `${character.name}, ${expression} expression`
        : image.portraitAlt ?? '',
      src: image.src,
      alt: image.alt ?? '',
      logText: image.logText ?? image.alt ?? '',
      imagePositionX: Number(image.imagePositionX ?? 50),
      imagePositionY: Number(image.imagePositionY ?? 50),
      imageBorderColor: image.imageBorderColor ?? '#1472bf'
    });
  }
}

function applyAttachedCompanions(state, playerId, scene) {
  const applied = new Set(state.appliedCompanions?.[playerId] ?? []);
  const companions = state.story?.nodes.filter(
    (node) => node.attachedTo === scene.id
      && (node.audience === 'both' || node.audience === playerId)
  ) ?? [];

  for (const companion of companions) {
    if (!['effect', 'item-effect', 'story-flag', 'player-state'].includes(companion.type)
      || applied.has(companion.id)) {
      continue;
    }

    const allowedEffects = (companion.effects ?? []).filter((effect) => {
      return state.sessionMode !== 'singleplayer'
        || !['install-mod', 'remove-mod'].includes(effect.type);
    });

    applyEffects(state, playerId, allowedEffects);

    for (const effect of allowedEffects) {
      const announcement = effectAnnouncement(
        effect,
        companion.announcementTemplate,
        companion.playerMessage,
        companion.text
      );

      if (announcement) {
        appendTerminalEntry(state, playerId, {
          sceneId: companion.id,
          speaker: 'SYSTEM',
          text: announcement
        });
      }
    }

    applied.add(companion.id);
  }

  state.appliedCompanions ??= {
    p1: [],
    p2: []
  };
  state.appliedCompanions[playerId] = [...applied];
}

function effectAnnouncement(effect, announcementTemplate, playerMessage, legacyText) {
  const customTemplate = String(announcementTemplate ?? '').trim();
  const customPlayerMessage = String(playerMessage ?? '').trim();
  const customText = String(legacyText ?? '').trim();

  if (customTemplate) {
    return customTemplate.includes('<ITEM>')
      ? customTemplate.replaceAll('<ITEM>', effect.key)
      : `${customTemplate}${effect.key}`;
  }

  if (customPlayerMessage) {
    return customPlayerMessage;
  }

  if (customText && customText !== 'You acquired a new item.') {
    return customText;
  }

  switch (effect.type) {
    case 'add-item':
      return `Acquired item: ${effect.key}.`;
    case 'discover-character':
      return `Character added to your records: ${effect.key}.`;
    case 'install-mod':
      return `Installed mod: ${effect.key}.`;
    default:
      return '';
  }
}

function resolveAutomaticNodes(state, playerId, startingSceneId) {
  let scene = getScene(state, startingSceneId);
  let traversedNodes = 0;

  // Automatic nodes alter state or routing without ever becoming an interactive terminal scene.
  while (
    scene?.type === 'condition'
    || scene?.type === 'clear-terminal'
    || scene?.type === 'change-character'
    || scene?.type === 'label'
  ) {
    traversedNodes += 1;

    if (traversedNodes > 50) {
      throw new Error('Automatic node chain exceeded 50 nodes. Check the story for a loop.');
    }

    if (scene.type === 'clear-terminal') {
      state.terminalOutput[playerId] = [];
      scene = getScene(state, scene.next);
      continue;
    }

    if (scene.type === 'change-character') {
      applyCharacterChange(state, playerId, scene);
      scene = getScene(state, scene.next);
      continue;
    }

    // Labels are editor-only annotations. Older cartridges may still route
    // through one, so skip it without rendering anything in the terminal.
    if (scene.type === 'label') {
      scene = getScene(state, scene.next);
      continue;
    }

    const destination = evaluateCondition(state, playerId, scene.condition)
      ? scene.trueNext
      : scene.falseNext;

    scene = getScene(state, destination);
  }

  return scene;
}

function applyCharacterChange(state, playerId, scene) {
  const characterId = scene.resetToDefault
    ? state.defaultCharacterIds?.[playerId]
    : scene.characterId;
  const character = state.characters.find((candidate) => candidate.id === characterId);

  if (!character) {
    return;
  }

  state.players[playerId] = {
    ...state.players[playerId],
    characterId: character.id,
    defaultName: character.name,
    name: state.players[playerId].customName || character.name,
    wallet: Number(character.wallet ?? 0),
    stats: {
      ...character.stats
    }
  };
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
    case 'relationship-at-least':
      return Number(state.players[playerId].relationships?.[condition.key] ?? 0)
        >= Number(condition.value ?? 0);
    case 'relationship-at-most':
      return Number(state.players[playerId].relationships?.[condition.key] ?? 0)
        <= Number(condition.value ?? 0);
    case 'last-dice-success': {
      const lastDiceDecision = [...state.decisions].reverse().find(
        (decision) => decision.type === 'dice-check' && decision.playerId === playerId
      );

      return Boolean(lastDiceDecision?.successful);
    }
    case 'decision-made':
      return state.decisions.some(
        (decision) => decision.playerId === playerId
          && `${decision.sceneId}:${decision.choiceId}` === condition.key
      );
    case 'playing-as':
      return playerId === condition.key;
    default:
      return false;
  }
}

function choiceIsAvailable(state, playerId, choice) {
  return !choice.disabled
    && (!choice.condition || evaluateCondition(state, playerId, choice.condition));
}

function markPlayerEnded(state, playerId) {
  state.lastScene ??= {
    p1: '',
    p2: ''
  };
  state.lastScene[playerId] = state.currentScene[playerId]
    || state.lastScene[playerId]
    || '';
  state.endedPlayers ??= [];
  addUnique(state.endedPlayers, playerId);
  state.currentScene[playerId] = '';
  delete state.deadlines[playerId];
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
  const luckSummary = result.luck > 0
    ? ` + ${result.luck} luck`
    : '';

  return `> D${result.die}: ${result.roll} + ${result.base} ${result.stat}${luckSummary} = ${result.total} / ${result.threshold} — ${outcome}`;
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
    const value = resolveEffectValue(state, playerId, effect.value);

    switch (effect.type) {
      case 'set-flag':
        state.flags[effect.key] = value;
        break;
      case 'set-player-name':
        state.players[playerId].customName = String(value ?? '').trim();
        state.players[playerId].name = state.players[playerId].customName
          || state.players[playerId].defaultName;
        break;
      case 'add-item':
        addUnique(state.players[playerId].inventory, effect.key);

        if (effect.image) {
          state.players[playerId].itemImages ??= {};
          state.players[playerId].itemImages[effect.key] = effect.image;
        }
        break;
      case 'remove-item':
        state.players[playerId].inventory = state.players[playerId].inventory.filter(
          (item) => item !== effect.key
        );
        delete state.players[playerId].itemImages?.[effect.key];
        break;
      case 'discover-character':
        addUnique(state.players[playerId].knownCharacters, effect.key);
        break;
      case 'adjust-stat':
        state.players[playerId].stats[effect.key] = Number(
          state.players[playerId].stats[effect.key] ?? 0
        ) + Number(value ?? 0);
        break;
      case 'adjust-relationship': {
        state.players[playerId].relationships ??= {};
        const relationship = state.relationshipDefinitions?.find(
          (definition) => definition.id === effect.key
        );
        const nextRelationshipValue = Number(
          state.players[playerId].relationships[effect.key] ?? 0
        ) + Number(value ?? 0);
        state.players[playerId].relationships[effect.key] = relationship
          ? Math.min(
            Number(relationship.maximum ?? 5),
            Math.max(Number(relationship.minimum ?? -5), nextRelationshipValue)
          )
          : nextRelationshipValue;
        break;
      }
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

function resolveEffectValue(state, playerId, value) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.replace(/\{([A-Z0-9_]+)\}/g, (token, key) => {
    const inputKey = key.startsWith('INPUT_') ? key.slice(6) : key;
    const savedValue = state.inputs?.[playerId]?.[key]
      ?? state.inputs?.[playerId]?.[inputKey];

    return savedValue === undefined ? token : savedValue;
  });
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

function recordDecision(
  state,
  playerId,
  sceneId,
  choiceId,
  label,
  randomized = false,
  severity = undefined
) {
  state.decisions.push({
    type: 'choice',
    playerId,
    sceneId,
    choiceId,
    label,
    randomized,
    severity,
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
