import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import {
  createCampaignState,
  completeActiveMinigame,
  getCampaignSnapshot,
  handleCampaignAction,
  initializeDeadlines,
  resolveExpiredTimedChoices,
  restoreCampaignState
} from './server/gameSession.js';
import {
  createNetRunnersState,
  getNetRunnersSnapshot,
  joinNetRunners,
  leaveNetRunners,
  submitNetRunnersBet,
  updateNetRunners,
  voteNetRunnersRematch,
  voteNetRunnersShuffle
} from './server/netRunnersSession.js';
import {
  createPigzState,
  getPigzSnapshot,
  holdPigz,
  joinPigz,
  leavePigz,
  restartPigz,
  rollPigz,
  submitPigzBet,
  votePigzRematch
} from './server/pigzSession.js';
import {
  createTraceRaceState,
  getTraceRaceSnapshot,
  joinTraceRace,
  leaveTraceRace,
  performTraceRaceAction,
  voteTraceRaceRematch
} from './server/traceRaceSession.js';
import {
  createPacketWarState,
  getPacketWarSnapshot,
  joinPacketWar,
  leavePacketWar,
  passPacketWarTurn,
  playPacketWarCard,
  savePacketWarCard,
  deletePacketWarCard,
  votePacketWarRematch
} from './server/packetWarSession.js';
import {
  createArcadeSessions,
  getArcadeSnapshot,
  joinArcadeGame,
  leaveArcadeGame,
  performArcadeAction,
  restartArcadeGame,
  voteArcadeRematch
} from './server/arcadeSessions.js';
import { createStoryRepository } from './server/storyRepository.js';
import { createCharacterRepository } from './server/characterRepository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const port = Number(process.env.PORT ?? 6912);
const host = process.env.HOST ?? '0.0.0.0';
const savesDirectory = join(__dirname, 'data', 'saves');
const storyDatabasePath = join(__dirname, 'data', 'dejavu.sqlite');
const storyImageDirectory = join(__dirname, 'public', 'uploads', 'stories');
const characterImageDirectory = join(__dirname, 'public', 'uploads', 'characters');
const musicDirectory = join(__dirname, 'public', 'audio', 'music');
const soundDirectory = join(__dirname, 'public', 'audio', 'sounds');
const reconnectGraceMs = 60_000;
const storyImageExtensions = new Map([
  ['image/avif', 'avif'],
  ['image/gif', 'gif'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/svg+xml', 'svg'],
  ['image/webp', 'webp']
]);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const playerSlots = {
  p1: createEmptySlot(),
  p2: createEmptySlot()
};

const storyRepository = createStoryRepository(storyDatabasePath);
const characterRepository = createCharacterRepository(storyDatabasePath);
const characterSelections = {
  p1: null,
  p2: null
};
const storySelections = {
  p1: null,
  p2: null
};
const storySelectionModes = {
  p1: null,
  p2: null
};
const storyEditLocks = new Map();
let activeStoryId = null;
let activeStoryMode = null;
let activeSoloPlayerId = null;
let campaignState = createCampaignState();
let netRunnersState = createNetRunnersState();
let pigzState = createPigzState();
let traceRaceState = createTraceRaceState();
let packetWarState = createPacketWarState();
const arcadeSessions = createArcadeSessions();
let billywigCompletionSceneId = null;
const billywigFinishedPlayers = new Set();
let pigzCompletionSceneId = null;
const pigzFinishedPlayers = new Set();
const storyMinigameFinishedPlayers = {
  'trace-race': new Set(),
  'packet-war': new Set(),
  'lo-hi': new Set(),
  mastermind: new Set(),
  chopsticks: new Set(),
  'firewall-auction': new Set(),
  'drone-relay': new Set()
};
const storyMinigameCompletionScenes = {
  'trace-race': null,
  'packet-war': null,
  'lo-hi': null,
  mastermind: null,
  chopsticks: null,
  'firewall-auction': null,
  'drone-relay': null
};
const chatMessages = [];

initializeDeadlines(campaignState);

app.post(
  '/api/story-assets/images',
  express.raw({
    type: [...storyImageExtensions.keys()],
    limit: '8mb'
  }),
  async (request, response) => {
    const extension = storyImageExtensions.get(request.headers['content-type']);

    if (!extension || !Buffer.isBuffer(request.body) || request.body.length === 0) {
      response.status(415).json({
        error: 'Choose a PNG, JPEG, WebP, GIF, AVIF, or SVG image.'
      });
      return;
    }

    try {
      await mkdir(storyImageDirectory, { recursive: true });
      const fileName = `${randomUUID()}.${extension}`;
      await writeFile(join(storyImageDirectory, fileName), request.body);
      response.status(201).json({
        path: `/uploads/stories/${fileName}`
      });
    } catch (error) {
      console.error('Could not store a story image.', error);
      response.status(500).json({
        error: 'The image could not be stored on the host.'
      });
    }
  }
);

app.get('/api/story-assets/images', async (_request, response) => {
  try {
    await mkdir(storyImageDirectory, { recursive: true });
    const entries = await readdir(storyImageDirectory, {
      withFileTypes: true
    });
    const images = entries
      .filter((entry) => entry.isFile())
      .filter((entry) => /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(entry.name))
      .map((entry) => `/uploads/stories/${entry.name}`)
      .sort((left, right) => left.localeCompare(right));

    response.json({
      images
    });
  } catch (error) {
    console.error('Could not list story images.', error);
    response.status(500).json({
      error: 'The story image library could not be loaded.'
    });
  }
});

app.delete('/api/story-assets/images/:fileName', async (request, response) => {
  const fileName = String(request.params.fileName ?? '');

  if (basename(fileName) !== fileName
    || !/\.(avif|gif|jpe?g|png|svg|webp)$/i.test(fileName)) {
    response.status(400).json({
      error: 'Choose a valid image from the story asset library.'
    });
    return;
  }

  const assetPath = `/uploads/stories/${fileName}`;
  const references = storyRepository.listStories()
    .filter((story) => {
      const document = storyRepository.getStory(story.id);
      return document && JSON.stringify(document).includes(assetPath);
    })
    .map((story) => ({
      id: story.id,
      title: story.title
    }));

  if (references.length > 0 && request.query.confirm !== 'true') {
    response.status(409).json({
      error: 'This image is still referenced by one or more stories.',
      requiresConfirmation: true,
      references
    });
    return;
  }

  try {
    await unlink(join(storyImageDirectory, fileName));
    response.json({
      ok: true,
      path: assetPath,
      references
    });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      response.status(404).json({ error: 'That image no longer exists.' });
      return;
    }

    console.error('Could not delete a story image.', error);
    response.status(500).json({
      error: 'The image could not be deleted from the host.'
    });
  }
});

app.get('/api/story-assets/audio', async (_request, response) => {
  try {
    const audioGroups = [
      {
        directory: musicDirectory,
        kind: 'music',
        publicDirectory: '/audio/music'
      },
      {
        directory: soundDirectory,
        kind: 'sound',
        publicDirectory: '/audio/sounds'
      }
    ];
    const assets = [];

    for (const group of audioGroups) {
      await mkdir(group.directory, { recursive: true });
      const entries = await readdir(group.directory, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile() || !/\.(aac|flac|m4a|mp3|ogg|opus|wav|webm)$/i.test(entry.name)) {
          continue;
        }

        assets.push({
          name: entry.name,
          path: `${group.publicDirectory}/${entry.name}`,
          kind: group.kind
        });
      }
    }

    response.json({
      assets: assets.sort((left, right) => left.name.localeCompare(right.name))
    });
  } catch (error) {
    console.error('Could not list story audio.', error);
    response.status(500).json({
      error: 'The story audio library could not be loaded.'
    });
  }
});

app.post(
  '/api/character-assets/images',
  express.raw({
    type: [...storyImageExtensions.keys()],
    limit: '8mb'
  }),
  async (request, response) => {
    const extension = storyImageExtensions.get(request.headers['content-type']);

    if (!extension || !Buffer.isBuffer(request.body) || request.body.length === 0) {
      response.status(415).json({
        error: 'Choose a PNG, JPEG, WebP, GIF, AVIF, or SVG image.'
      });
      return;
    }

    try {
      await mkdir(characterImageDirectory, { recursive: true });
      const fileName = `${randomUUID()}.${extension}`;
      await writeFile(join(characterImageDirectory, fileName), request.body);
      response.status(201).json({
        path: `/uploads/characters/${fileName}`
      });
    } catch (error) {
      console.error('Could not store a character image.', error);
      response.status(500).json({
        error: 'The character image could not be stored on the host.'
      });
    }
  }
);

app.use(express.static(join(__dirname, 'public')));

app.get('/', (_request, response) => {
  response.sendFile('index.html', {
    root: join(__dirname, 'public')
  });
});

io.on('connection', (socket) => {
  const requestedToken = normalizeSessionToken(socket.handshake.auth?.sessionToken);
  const sessionToken = ensureAvailableSessionToken(requestedToken);
  const playerId = assignPlayerSlot(sessionToken, socket.id);

  if (!playerId) {
    socket.emit('session:status', {
      status: 'full'
    });
    return;
  }

  socket.data.playerId = playerId;
  socket.data.sessionToken = sessionToken;

  socket.emit('session:status', createSessionStatus(playerId));
  socket.emit('campaign:state', getCampaignSnapshot(campaignState));
  socket.emit('characters:state', createCharacterLibraryState());
  socket.emit('library:state', createLibraryState());
  socket.emit('netrunners:state', getNetRunnersSnapshot(netRunnersState));
  socket.emit('pigz:state', getPigzSnapshot(pigzState));
  socket.emit('trace-race:state', getTraceRaceSnapshot(traceRaceState, playerId));
  socket.emit('packet-war:state', getPacketWarSnapshot(packetWarState, playerId));
  emitAllArcadeStates(socket);
  if (hasInstalledMod('neuro-link-chat')) {
    socket.emit('chat:history', chatMessages);
  }
  broadcastSessionStatus();

  socket.on('characters:create', (input, acknowledge = () => {}) => {
    try {
      const character = characterRepository.createCharacter(input ?? {});
      acknowledge({
        ok: true,
        character
      });
      broadcastCharacterLibraryState();
    } catch (error) {
      acknowledge({
        ok: false,
        error: error instanceof Error ? error.message : 'Could not create the character.'
      });
    }
  });

  socket.on('characters:update', (request, acknowledge = () => {}) => {
    try {
      const character = characterRepository.updateCharacter(
        String(request?.characterId ?? ''),
        request?.character ?? {}
      );
      acknowledge({
        ok: true,
        character
      });
      broadcastCharacterLibraryState();
    } catch (error) {
      acknowledge({
        ok: false,
        error: error instanceof Error ? error.message : 'Could not update the character.'
      });
    }
  });

  socket.on('characters:delete', (characterId, acknowledge = () => {}) => {
    const normalizedCharacterId = String(characterId ?? '');
    const referencedStories = storyRepository.listStories().filter((story) => {
      const document = storyRepository.getStory(story.id);
      return document?.characterIds?.includes(normalizedCharacterId);
    });

    if (referencedStories.length > 0) {
      acknowledge({
        ok: false,
        error: `This character is used by ${referencedStories.map((story) => story.title).join(', ')}.`
      });
      return;
    }

    try {
      characterRepository.deleteCharacter(normalizedCharacterId);

      for (const participantId of ['p1', 'p2']) {
        if (characterSelections[participantId] === normalizedCharacterId) {
          characterSelections[participantId] = null;
        }
      }

      acknowledge({ ok: true });
      broadcastCharacterLibraryState();
    } catch (error) {
      acknowledge({
        ok: false,
        error: error instanceof Error ? error.message : 'Could not delete the character.'
      });
    }
  });

  socket.on('characters:select', (characterId, acknowledge = () => {}) => {
    const character = characterRepository.getCharacter(String(characterId ?? ''));

    if (!character) {
      acknowledge({
        ok: false,
        error: 'Character not found.'
      });
      return;
    }

    characterSelections[playerId] = character.id;
    acknowledge({
      ok: true,
      character
    });
    broadcastCharacterLibraryState();
  });

  socket.on('characters:adjust-wallet', (amount, acknowledge = () => {}) => {
    const characterId = characterSelections[playerId];

    if (!characterId) {
      acknowledge({
        ok: false,
        error: 'Select a character before placing a wager.'
      });
      return;
    }

    try {
      const character = characterRepository.adjustWallet(characterId, amount);
      acknowledge({
        ok: true,
        character
      });
      broadcastCharacterLibraryState();
    } catch (error) {
      acknowledge({
        ok: false,
        error: error instanceof Error ? error.message : 'Could not update the wallet.'
      });
    }
  });

  socket.on('library:get-story', (storyId, acknowledge = () => {}) => {
    const normalizedStoryId = String(storyId ?? '');
    const story = storyRepository.getStory(normalizedStoryId);
    const lock = storyEditLocks.get(normalizedStoryId);

    if (story && lock && lock.socketId !== socket.id) {
      acknowledge({
        ok: false,
        error: `${lock.playerName} is already editing this story.`
      });
      return;
    }

    if (story) {
      releaseEditorLocks(socket.id);
      storyEditLocks.set(normalizedStoryId, {
        socketId: socket.id,
        playerName: campaignState.players[playerId].name
      });
    }

    acknowledge(story
      ? {
          ok: true,
          story
        }
      : {
          ok: false,
          error: 'Story not found.'
        });
  });

  socket.on('library:create-story', (input, acknowledge = () => {}) => {
    try {
      validateStoryCharacterReferences(input ?? {});
      const story = storyRepository.createStory(input ?? {});
      releaseEditorLocks(socket.id);
      storyEditLocks.set(story.id, {
        socketId: socket.id,
        playerName: campaignState.players[playerId].name
      });
      acknowledge({
        ok: true,
        story
      });
      broadcastLibraryState();
    } catch (error) {
      acknowledge({
        ok: false,
        error: error instanceof Error ? error.message : 'Could not create the story.'
      });
    }
  });

  socket.on('library:update-story', (request, acknowledge = () => {}) => {
    try {
      const storyId = String(request?.storyId ?? '');
      const lock = storyEditLocks.get(storyId);

      if (!lock || lock.socketId !== socket.id) {
        throw new Error('This editor lock expired. Reopen the story before saving.');
      }

      validateStoryCharacterReferences(request?.story ?? {});
      const story = storyRepository.updateStory(
        storyId,
        request?.story
      );
      acknowledge({
        ok: true,
        story
      });
      broadcastLibraryState();
    } catch (error) {
      acknowledge({
        ok: false,
        error: error instanceof Error ? error.message : 'Could not update the story.'
      });
    }
  });

  socket.on('library:duplicate-story', (storyId, acknowledge = () => {}) => {
    try {
      const story = storyRepository.duplicateStory(String(storyId ?? ''));
      acknowledge({
        ok: true,
        story
      });
      broadcastLibraryState();
    } catch (error) {
      acknowledge({
        ok: false,
        error: error instanceof Error ? error.message : 'Could not duplicate the story.'
      });
    }
  });

  socket.on('library:delete-story', (storyId, acknowledge = () => {}) => {
    try {
      const normalizedStoryId = String(storyId ?? '');
      const lock = storyEditLocks.get(normalizedStoryId);

      if (lock && lock.socketId !== socket.id) {
        throw new Error(`${lock.playerName} is editing this story, so it cannot be deleted.`);
      }

      storyRepository.deleteStory(normalizedStoryId);
      storyEditLocks.delete(normalizedStoryId);

      for (const participantId of ['p1', 'p2']) {
        if (storySelections[participantId] === normalizedStoryId) {
          storySelections[participantId] = null;
          storySelectionModes[participantId] = null;
        }
      }

      synchronizeActiveStory();
      acknowledge({
        ok: true
      });
      broadcastLibraryState();
      io.emit('campaign:state', getCampaignSnapshot(campaignState));
    } catch (error) {
      acknowledge({
        ok: false,
        error: error instanceof Error ? error.message : 'Could not delete the story.'
      });
    }
  });

  socket.on('library:select-story', (selection, acknowledge = () => {}) => {
    const requestedStoryId = typeof selection === 'object'
      ? selection?.storyId
      : selection;
    const normalizedStoryId = requestedStoryId === null
      ? null
      : String(requestedStoryId ?? '');

    const story = normalizedStoryId
      ? storyRepository.getStory(normalizedStoryId)
      : null;

    if (normalizedStoryId && !story) {
      acknowledge({
        ok: false,
        error: 'Story not found.'
      });
      return;
    }

    const supportedModes = story?.playModes ?? {
      singleplayer: false,
      multiplayer: true
    };
    const requestedMode = typeof selection === 'object'
      ? selection?.mode
      : null;
    const normalizedMode = requestedMode === 'singleplayer' || requestedMode === 'multiplayer'
      ? requestedMode
      : supportedModes.singleplayer
        ? 'singleplayer'
        : 'multiplayer';

    if (story && !supportedModes[normalizedMode]) {
      acknowledge({
        ok: false,
        error: `This cartridge does not include a ${normalizedMode} map.`
      });
      return;
    }

    storySelections[playerId] = normalizedStoryId;
    storySelectionModes[playerId] = normalizedStoryId ? normalizedMode : null;
    synchronizeActiveStory(playerId);
    acknowledge({
      ok: true
    });
    broadcastLibraryState();
    io.emit('campaign:state', getCampaignSnapshot(campaignState));
  });

  socket.on('library:release-story', () => {
    releaseEditorLocks(socket.id);
  });

  socket.on('chat:send', (value, acknowledge = () => {}) => {
    if (!hasInstalledMod('neuro-link-chat')) {
      acknowledge({
        ok: false,
        error: 'The Neuro-Link Chat mod is not installed.'
      });
      return;
    }

    const text = String(value ?? '').trim().slice(0, 500);

    if (!text) {
      acknowledge({
        ok: false,
        error: 'Enter a message before sending.'
      });
      return;
    }

    const message = {
      id: randomUUID(),
      playerId,
      playerName: campaignState.players[playerId].name,
      text,
      createdAt: new Date().toISOString()
    };

    chatMessages.push(message);

    if (chatMessages.length > 200) {
      chatMessages.shift();
    }

    io.emit('chat:message', message);
    acknowledge({
      ok: true
    });
  });

  socket.on('campaign:action', (action, acknowledge = () => {}) => {
    try {
      if (!activeStoryId || campaignState.story?.id !== activeStoryId) {
        acknowledge({
          ok: false,
          error: 'Both players must insert the same story cartridge first.'
        });
        return;
      }

      if (campaignState.sessionMode === 'singleplayer'
        && campaignState.soloPlayerId !== playerId) {
        acknowledge({
          ok: false,
          error: 'The other player owns this single-player Story Mode session.'
        });
        return;
      }

      const result = handleCampaignAction(campaignState, playerId, action);
      acknowledge(result);

      if (result.ok) {
        if (result.sessionMode) {
          activeStoryMode = result.sessionMode;
          activeSoloPlayerId = result.sessionMode === 'singleplayer' ? playerId : null;

          if (result.sessionMode === 'multiplayer') {
            storySelections.p1 = activeStoryId;
            storySelections.p2 = activeStoryId;
            storySelectionModes.p1 = 'multiplayer';
            storySelectionModes.p2 = 'multiplayer';
          } else {
            storySelections[playerId] = activeStoryId;
            storySelectionModes[playerId] = 'singleplayer';
          }

          broadcastLibraryState();
        }

        io.emit('campaign:state', getCampaignSnapshot(campaignState));
      }
    } catch (error) {
      acknowledge({
        ok: false,
        error: error instanceof Error ? error.message : 'Campaign action failed.'
      });
    }
  });

  socket.on('campaign:reset', (acknowledge = () => {}) => {
    if (!activeStoryId) {
      acknowledge({
        ok: false,
        error: 'Select a story cartridge before resetting Story Mode.'
      });
      return;
    }

    const story = storyRepository.getStory(activeStoryId);

    if (!story) {
      acknowledge({
        ok: false,
        error: 'The active story cartridge could not be found.'
      });
      return;
    }

    campaignState = createCampaignState(story, {
      mode: activeStoryMode,
      soloPlayerId: activeSoloPlayerId,
      characters: getStoryCharacters(story)
    });
    initializeDeadlines(campaignState);
    resetBillywigCompletion();
    resetPigzCompletion();

    for (const minigameId of Object.keys(storyMinigameFinishedPlayers)) {
      storyMinigameFinishedPlayers[minigameId].clear();
      storyMinigameCompletionScenes[minigameId] = null;
    }

    io.emit('campaign:state', getCampaignSnapshot(campaignState));
    acknowledge({
      ok: true
    });
  });

  socket.on('campaign:save', async (saveName, acknowledge = () => {}) => {
    try {
      if (!activeStoryId || campaignState.story?.id !== activeStoryId) {
        throw new Error('Both players must stage the same story before saving.');
      }

      const fileName = createSaveFileName(saveName);
      await mkdir(savesDirectory, {
        recursive: true
      });
      await writeFile(
        join(savesDirectory, fileName),
        JSON.stringify(campaignState, null, 2),
        'utf8'
      );
      acknowledge({
        ok: true,
        fileName
      });
    } catch (error) {
      acknowledge({
        ok: false,
        error: error instanceof Error ? error.message : 'Could not save the campaign.'
      });
    }
  });

  socket.on('campaign:list-saves', async (acknowledge = () => {}) => {
    try {
      await mkdir(savesDirectory, {
        recursive: true
      });
      const files = (await readdir(savesDirectory))
        .filter((fileName) => fileName.endsWith('.json'))
        .sort();
      acknowledge({
        ok: true,
        files
      });
    } catch (error) {
      acknowledge({
        ok: false,
        error: error instanceof Error ? error.message : 'Could not list campaign saves.'
      });
    }
  });

  socket.on('campaign:load', async (fileName, acknowledge = () => {}) => {
    try {
      const safeFileName = createSaveFileName(fileName);
      const contents = await readFile(join(savesDirectory, safeFileName), 'utf8');
      campaignState = restoreCampaignState(JSON.parse(contents));
      activeStoryId = campaignState.story.id;
      activeStoryMode = campaignState.sessionMode ?? 'multiplayer';
      activeSoloPlayerId = campaignState.soloPlayerId ?? null;

      if (activeStoryMode === 'singleplayer' && activeSoloPlayerId) {
        storySelections[activeSoloPlayerId] = activeStoryId;
        storySelectionModes[activeSoloPlayerId] = 'singleplayer';
      } else {
        storySelections.p1 = activeStoryId;
        storySelections.p2 = activeStoryId;
        storySelectionModes.p1 = 'multiplayer';
        storySelectionModes.p2 = 'multiplayer';
      }
      initializeDeadlines(campaignState);
      io.emit('campaign:state', getCampaignSnapshot(campaignState));
      broadcastLibraryState();
      acknowledge({
        ok: true
      });
    } catch (error) {
      acknowledge({
        ok: false,
        error: error instanceof Error ? error.message : 'Could not load the campaign.'
      });
    }
  });

  socket.on('netrunners:join', () => {
    const character = selectedCharacter(playerId);

    joinNetRunners(
      netRunnersState,
      playerId,
      character?.name ?? campaignState.players[playerId].name,
      character?.wallet ?? 0
    );
    io.emit('netrunners:state', getNetRunnersSnapshot(netRunnersState));
  });

  socket.on('netrunners:leave', () => {
    leaveNetRunners(netRunnersState, playerId);
    io.emit('netrunners:state', getNetRunnersSnapshot(netRunnersState));

    if (campaignState.activeMinigame?.id === 'netrunners') {
      const campaignResult = completeActiveMinigame(campaignState, 'cancelled');

      if (campaignResult.ok) {
        io.emit('campaign:state', getCampaignSnapshot(campaignState));
      }
    }
  });

  socket.on('netrunners:bet', (bet, acknowledge = () => {}) => {
    const result = submitNetRunnersBet(netRunnersState, playerId, bet);
    acknowledge(result);

    if (result.ok) {
      io.emit('netrunners:state', getNetRunnersSnapshot(netRunnersState));
    }
  });

  socket.on('netrunners:shuffle', (acknowledge = () => {}) => {
    const result = voteNetRunnersShuffle(netRunnersState, playerId);
    acknowledge(result);

    if (result.ok) {
      io.emit('netrunners:state', getNetRunnersSnapshot(netRunnersState));
    }
  });

  socket.on('netrunners:rematch', (wantsRematch, acknowledge = () => {}) => {
    const result = voteNetRunnersRematch(netRunnersState, playerId, wantsRematch);
    acknowledge(result);

    if (result.ok) {
      io.emit('netrunners:state', getNetRunnersSnapshot(netRunnersState));

      if (!wantsRematch && campaignState.activeMinigame?.id === 'netrunners') {
        const campaignResult = completeActiveMinigame(campaignState, 'completed');

        if (campaignResult.ok) {
          io.emit('campaign:state', getCampaignSnapshot(campaignState));
        }
      }
    }
  });

  socket.on('billywig:complete', (acknowledge = () => {}) => {
    if (campaignState.activeMinigame?.id !== 'billywig') {
      acknowledge({
        ok: false,
        error: 'No story-launched Billywig round is active.'
      });
      return;
    }

    synchronizeBillywigCompletionScene();
    billywigFinishedPlayers.add(playerId);

    const requiredPlayers = campaignState.sessionMode === 'singleplayer' ? 1 : 2;

    if (billywigFinishedPlayers.size < requiredPlayers) {
      acknowledge({
        ok: true,
        waitingForPartner: true
      });
      return;
    }

    const result = completeActiveMinigame(campaignState, 'completed');
    acknowledge(result);

    if (result.ok) {
      resetBillywigCompletion();
      io.emit('campaign:state', getCampaignSnapshot(campaignState));
    }
  });

  socket.on('billywig:cancel', (acknowledge = () => {}) => {
    if (campaignState.activeMinigame?.id !== 'billywig') {
      acknowledge({
        ok: false,
        error: 'No story-launched Billywig round is active.'
      });
      return;
    }

    const result = completeActiveMinigame(campaignState, 'cancelled');
    acknowledge(result);

    if (result.ok) {
      resetBillywigCompletion();
      io.emit('campaign:state', getCampaignSnapshot(campaignState));
    }
  });

  socket.on('pigz:join', () => {
    const character = selectedCharacter(playerId);

    joinPigz(
      pigzState,
      playerId,
      character?.name ?? campaignState.players[playerId].name,
      character?.wallet ?? 0
    );
    io.emit('pigz:state', getPigzSnapshot(pigzState));
  });

  socket.on('pigz:leave', () => {
    leavePigz(pigzState, playerId);
    io.emit('pigz:state', getPigzSnapshot(pigzState));
  });

  socket.on('pigz:bet', (amount, acknowledge = () => {}) => {
    const result = submitPigzBet(pigzState, playerId, amount);
    acknowledge(result);

    if (result.ok) {
      io.emit('pigz:state', getPigzSnapshot(pigzState));
    }
  });

  socket.on('pigz:roll', (acknowledge = () => {}) => {
    const result = rollPigz(pigzState, playerId);
    acknowledge(result);

    if (result.ok) {
      io.emit('pigz:state', getPigzSnapshot(pigzState));
    }
  });

  socket.on('pigz:hold', (acknowledge = () => {}) => {
    const result = holdPigz(pigzState, playerId);
    acknowledge(result);

    if (result.ok) {
      synchronizeCharacterWallet(playerId, pigzState.players[playerId].money);
      io.emit('pigz:state', getPigzSnapshot(pigzState));
    }
  });

  socket.on('pigz:restart', () => {
    restartPigz(pigzState);
    io.emit('pigz:state', getPigzSnapshot(pigzState));
  });

  socket.on('pigz:rematch', (wantsRematch, acknowledge = () => {}) => {
    const result = votePigzRematch(pigzState, playerId, wantsRematch);
    acknowledge(result);

    if (result.ok) {
      io.emit('pigz:state', getPigzSnapshot(pigzState));
    }
  });

  socket.on('pigz:story-complete', (acknowledge = () => {}) => {
    if (campaignState.activeMinigame?.id !== 'pigz') {
      acknowledge({
        ok: false,
        error: 'No story-launched Pigz round is active.'
      });
      return;
    }

    synchronizePigzCompletionScene();
    pigzFinishedPlayers.add(playerId);

    const requiredPlayers = campaignState.sessionMode === 'singleplayer' ? 1 : 2;

    if (pigzFinishedPlayers.size < requiredPlayers) {
      acknowledge({
        ok: true,
        waitingForPartner: true
      });
      return;
    }

    const result = completeActiveMinigame(campaignState, 'completed');
    acknowledge(result);

    if (result.ok) {
      resetPigzCompletion();
      io.emit('campaign:state', getCampaignSnapshot(campaignState));
    }
  });

  socket.on('pigz:story-cancel', (acknowledge = () => {}) => {
    if (campaignState.activeMinigame?.id !== 'pigz') {
      acknowledge({
        ok: false,
        error: 'No story-launched Pigz round is active.'
      });
      return;
    }

    const result = completeActiveMinigame(campaignState, 'cancelled');
    acknowledge(result);

    if (result.ok) {
      resetPigzCompletion();
      io.emit('campaign:state', getCampaignSnapshot(campaignState));
    }
  });

  socket.on('trace-race:join', () => {
    joinTraceRace(traceRaceState, playerId, campaignState.players[playerId].name);
    broadcastTraceRaceState();
  });

  socket.on('trace-race:leave', () => {
    leaveTraceRace(traceRaceState, playerId);
    broadcastTraceRaceState();
  });

  socket.on('trace-race:action', (action, acknowledge = () => {}) => {
    const result = performTraceRaceAction(traceRaceState, playerId, action);
    acknowledge(result);

    if (result.ok) {
      broadcastTraceRaceState();
    }
  });

  socket.on('trace-race:rematch', (wantsRematch, acknowledge = () => {}) => {
    const result = voteTraceRaceRematch(traceRaceState, playerId, wantsRematch);
    acknowledge(result);

    if (result.ok) {
      broadcastTraceRaceState();
    }
  });

  socket.on('trace-race:story-complete', (acknowledge = () => {}) => {
    completeStoryMinigame('trace-race', playerId, acknowledge);
  });

  socket.on('trace-race:story-cancel', (acknowledge = () => {}) => {
    cancelStoryMinigame('trace-race', acknowledge);
  });

  socket.on('packet-war:join', (mode, acknowledge = () => {}) => {
    const result = joinPacketWar(
      packetWarState,
      playerId,
      campaignState.players[playerId].name,
      mode
    );
    acknowledge(result);

    if (result.ok) {
      broadcastPacketWarState();
    }
  });

  socket.on('packet-war:leave', () => {
    leavePacketWar(packetWarState, playerId);
    broadcastPacketWarState();
  });

  socket.on('packet-war:play', (handIndex, acknowledge = () => {}) => {
    const result = playPacketWarCard(packetWarState, playerId, handIndex);
    acknowledge(result);

    if (result.ok) {
      broadcastPacketWarState();
    }
  });

  socket.on('packet-war:pass', (acknowledge = () => {}) => {
    const result = passPacketWarTurn(packetWarState, playerId);
    acknowledge(result);

    if (result.ok) {
      broadcastPacketWarState();
    }
  });

  socket.on('packet-war:save-card', (card, acknowledge = () => {}) => {
    const result = savePacketWarCard(packetWarState, card);
    acknowledge(result);

    if (result.ok) {
      broadcastPacketWarState();
    }
  });

  socket.on('packet-war:delete-card', (request, acknowledge = () => {}) => {
    const result = deletePacketWarCard(packetWarState, request);
    acknowledge(result);

    if (result.ok) {
      broadcastPacketWarState();
    }
  });

  socket.on('packet-war:rematch', (wantsRematch, acknowledge = () => {}) => {
    const result = votePacketWarRematch(packetWarState, playerId, wantsRematch);
    acknowledge(result);

    if (result.ok) {
      broadcastPacketWarState();
    }
  });

  socket.on('packet-war:story-complete', (acknowledge = () => {}) => {
    completeStoryMinigame('packet-war', playerId, acknowledge);
  });

  socket.on('packet-war:story-cancel', (acknowledge = () => {}) => {
    cancelStoryMinigame('packet-war', acknowledge);
  });

  socket.on('arcade:join', (gameId, mode, acknowledge = () => {}) => {
    const result = joinArcadeGame(
      arcadeSessions,
      gameId,
      playerId,
      campaignState.players[playerId].name,
      mode
    );
    acknowledge(result);

    if (result.ok) {
      broadcastArcadeState(gameId);
    }
  });

  socket.on('arcade:leave', (gameId) => {
    leaveArcadeGame(arcadeSessions, gameId, playerId);
    broadcastArcadeState(gameId);
  });

  socket.on('arcade:action', (request, acknowledge = () => {}) => {
    const result = performArcadeAction(
      arcadeSessions,
      request?.game,
      playerId,
      request?.action ?? {}
    );
    acknowledge(result);

    if (result.ok) {
      broadcastArcadeState(request.game);
    }
  });

  socket.on('arcade:restart', (gameId) => {
    restartArcadeGame(arcadeSessions, gameId);
    broadcastArcadeState(gameId);
  });

  socket.on('arcade:rematch', (gameId, wantsRematch, acknowledge = () => {}) => {
    const result = voteArcadeRematch(
      arcadeSessions,
      gameId,
      playerId,
      wantsRematch
    );
    acknowledge(result);

    if (result.ok) {
      broadcastArcadeState(gameId);
    }
  });

  socket.on('arcade:story-complete', (gameId, acknowledge = () => {}) => {
    completeStoryMinigame(gameId, playerId, acknowledge);
  });

  socket.on('arcade:story-cancel', (gameId, acknowledge = () => {}) => {
    cancelStoryMinigame(gameId, acknowledge);
  });

  socket.on('disconnect', () => {
    releaseEditorLocks(socket.id);
    const slot = playerSlots[playerId];

    if (slot.socketId === socket.id) {
      slot.socketId = null;
      slot.connected = false;
      scheduleSlotRelease(playerId, slot.sessionToken);
    }

    leaveNetRunners(netRunnersState, playerId);
    leavePigz(pigzState, playerId);
    leaveTraceRace(traceRaceState, playerId);
    leavePacketWar(packetWarState, playerId);

    for (const gameId of Object.keys(arcadeSessions)) {
      leaveArcadeGame(arcadeSessions, gameId, playerId);
      broadcastArcadeState(gameId);
    }

    if (campaignState.activeMinigame?.id === 'netrunners') {
      const campaignResult = completeActiveMinigame(campaignState, 'cancelled');

      if (campaignResult.ok) {
        io.emit('campaign:state', getCampaignSnapshot(campaignState));
      }
    }
    broadcastSessionStatus();
    io.emit('netrunners:state', getNetRunnersSnapshot(netRunnersState));
    io.emit('pigz:state', getPigzSnapshot(pigzState));
    broadcastTraceRaceState();
    broadcastPacketWarState();
  });
});

setInterval(() => {
  const campaignChanged = resolveExpiredTimedChoices(campaignState);
  const netRunnersChanged = updateNetRunners(netRunnersState);

  if (campaignChanged) {
    io.emit('campaign:state', getCampaignSnapshot(campaignState));
  }

  if (netRunnersChanged) {
    if (netRunnersState.status === 'finished') {
      for (const playerId of ['p1', 'p2']) {
        synchronizeCharacterWallet(
          playerId,
          netRunnersState.players[playerId].money
        );
      }
    }

    io.emit('netrunners:state', getNetRunnersSnapshot(netRunnersState));
  }
}, 250);

server.listen(port, host, () => {
  console.log(`Déjà Vu server listening on http://${host}:${port}`);
});

function createEmptySlot() {
  return {
    sessionToken: null,
    socketId: null,
    connected: false,
    releaseTimer: null
  };
}

function normalizeSessionToken(value) {
  const token = String(value ?? '').trim();
  return token || randomUUID();
}

function ensureAvailableSessionToken(sessionToken) {
  const activeSlot = Object.values(playerSlots).find(
    (slot) => slot.sessionToken === sessionToken && slot.connected
  );
  const hasUnassignedSlot = Object.values(playerSlots).some(
    (slot) => slot.sessionToken === null
  );

  return activeSlot && hasUnassignedSlot ? randomUUID() : sessionToken;
}

function assignPlayerSlot(sessionToken, socketId) {
  const returningPlayer = Object.entries(playerSlots).find(
    ([, slot]) => slot.sessionToken === sessionToken
  );

  if (returningPlayer) {
    const [playerId, slot] = returningPlayer;
    const previousSocketId = slot.socketId;
    clearTimeout(slot.releaseTimer);
    slot.releaseTimer = null;
    slot.socketId = socketId;
    slot.connected = true;

    if (previousSocketId && previousSocketId !== socketId) {
      io.sockets.sockets.get(previousSocketId)?.disconnect(true);
    }

    return playerId;
  }

  const availablePlayer = Object.entries(playerSlots).find(
    ([, slot]) => slot.sessionToken === null || !slot.connected
  );

  if (!availablePlayer) {
    return null;
  }

  const [playerId, slot] = availablePlayer;
  clearTimeout(slot.releaseTimer);
  slot.sessionToken = sessionToken;
  slot.socketId = socketId;
  slot.connected = true;
  slot.releaseTimer = null;
  return playerId;
}

function createSessionStatus(playerId) {
  return {
    status: 'joined',
    playerId,
    playerCount: countConnectedPlayers(),
    bothPlayersConnected: countConnectedPlayers() === 2,
    sessionToken: playerSlots[playerId].sessionToken,
    players: {
      p1: {
        connected: playerSlots.p1.connected
      },
      p2: {
        connected: playerSlots.p2.connected
      }
    }
  };
}

function broadcastSessionStatus() {
  for (const playerId of ['p1', 'p2']) {
    const slot = playerSlots[playerId];

    if (!slot.socketId) {
      continue;
    }

    io.to(slot.socketId).emit('session:status', createSessionStatus(playerId));
  }
}

function broadcastTraceRaceState() {
  for (const playerId of ['p1', 'p2']) {
    const socketId = playerSlots[playerId].socketId;

    if (socketId) {
      io.to(socketId).emit(
        'trace-race:state',
        getTraceRaceSnapshot(traceRaceState, playerId)
      );
    }
  }
}

function broadcastPacketWarState() {
  for (const playerId of ['p1', 'p2']) {
    const socketId = playerSlots[playerId].socketId;

    if (socketId) {
      io.to(socketId).emit(
        'packet-war:state',
        getPacketWarSnapshot(packetWarState, playerId)
      );
    }
  }
}

function emitAllArcadeStates(socket) {
  const playerId = socket.data.playerId;

  for (const gameId of Object.keys(arcadeSessions)) {
    socket.emit('arcade:state', {
      game: gameId,
      state: getArcadeSnapshot(arcadeSessions, gameId, playerId)
    });
  }
}

function broadcastArcadeState(gameId) {
  for (const playerId of ['p1', 'p2']) {
    const socketId = playerSlots[playerId].socketId;
    const state = getArcadeSnapshot(arcadeSessions, gameId, playerId);

    if (socketId && state) {
      io.to(socketId).emit('arcade:state', { game: gameId, state });
    }
  }
}

function countConnectedPlayers() {
  return Object.values(playerSlots).filter((slot) => slot.connected).length;
}

function hasInstalledMod(modId) {
  return campaignState.installedMods.includes(modId);
}

function scheduleSlotRelease(playerId, expectedToken) {
  const slot = playerSlots[playerId];

  clearTimeout(slot.releaseTimer);
  slot.releaseTimer = setTimeout(() => {
    if (slot.connected || slot.sessionToken !== expectedToken) {
      return;
    }

    playerSlots[playerId] = createEmptySlot();
    storySelections[playerId] = null;
    storySelectionModes[playerId] = null;
    characterSelections[playerId] = null;
    synchronizeActiveStory();
    broadcastSessionStatus();
    broadcastLibraryState();
    broadcastCharacterLibraryState();
  }, reconnectGraceMs);
}

function createLibraryState() {
  return {
    stories: storyRepository.listStories(),
    selections: {
      ...storySelections
    },
    selectionModes: {
      ...storySelectionModes
    },
    activeStoryId,
    activeStoryMode,
    activeSoloPlayerId
  };
}

function createCharacterLibraryState() {
  return {
    characters: characterRepository.listCharacters(),
    selections: {
      ...characterSelections
    }
  };
}

function broadcastCharacterLibraryState() {
  io.emit('characters:state', createCharacterLibraryState());
}

function selectedCharacter(playerId) {
  const characterId = characterSelections[playerId];
  return characterId ? characterRepository.getCharacter(characterId) : null;
}

function synchronizeCharacterWallet(playerId, wallet) {
  const character = selectedCharacter(playerId);

  if (!character || character.wallet === wallet) {
    return;
  }

  characterRepository.setWallet(character.id, wallet);
  broadcastCharacterLibraryState();
}

function validateStoryCharacterReferences(story) {
  const playModes = story.playModes ?? {
    singleplayer: false,
    multiplayer: true
  };
  const mainCharacterIds = story.mainCharacterIds ?? {};
  const requiredIds = [];

  if (playModes.singleplayer) {
    requiredIds.push(mainCharacterIds.singleplayer);
  }

  if (playModes.multiplayer) {
    requiredIds.push(
      mainCharacterIds.multiplayer?.p1,
      mainCharacterIds.multiplayer?.p2
    );
  }

  for (const characterId of requiredIds) {
    if (!characterId || !characterRepository.getCharacter(characterId)) {
      throw new Error('Every playable role must reference an existing character.');
    }
  }
}

function getStoryCharacters(story) {
  return (story.characterIds ?? [])
    .map((characterId) => characterRepository.getCharacter(characterId))
    .filter(Boolean);
}

function broadcastLibraryState() {
  io.emit('library:state', createLibraryState());
}

function releaseEditorLocks(socketId) {
  for (const [storyId, lock] of storyEditLocks.entries()) {
    if (lock.socketId === socketId) {
      storyEditLocks.delete(storyId);
    }
  }
}

function synchronizeActiveStory(preferredPlayerId = null) {
  const soloPlayerId = preferredPlayerId
    && storySelections[preferredPlayerId]
    && storySelectionModes[preferredPlayerId] === 'singleplayer'
    ? preferredPlayerId
    : ['p1', 'p2'].find(
        (playerId) => storySelections[playerId]
          && storySelectionModes[playerId] === 'singleplayer'
      );
  const soloStoryId = soloPlayerId ? storySelections[soloPlayerId] : null;
  const matchingStoryId = storySelections.p1
    && storySelections.p1 === storySelections.p2
    && storySelectionModes.p1 === 'multiplayer'
    && storySelectionModes.p2 === 'multiplayer'
    ? storySelections.p1
    : null;
  const nextStoryId = soloStoryId ?? matchingStoryId;
  const nextMode = soloStoryId ? 'singleplayer' : matchingStoryId ? 'multiplayer' : null;

  activeStoryId = nextStoryId;
  activeStoryMode = nextMode;
  activeSoloPlayerId = nextMode === 'singleplayer' ? soloPlayerId : null;

  if (!nextStoryId
    || (campaignState.story?.id === nextStoryId
      && campaignState.sessionMode === nextMode
      && campaignState.soloPlayerId === activeSoloPlayerId)) {
    return;
  }

  const story = storyRepository.getStory(nextStoryId);

  if (story) {
    campaignState = createCampaignState(story, {
      mode: nextMode,
      soloPlayerId: activeSoloPlayerId,
      characters: getStoryCharacters(story)
    });
    initializeDeadlines(campaignState);
  }
}

function createSaveFileName(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.json$/i, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

  if (!normalized) {
    throw new Error('Enter a save name.');
  }

  return `${normalized}.json`;
}

function synchronizeBillywigCompletionScene() {
  const activeSceneId = campaignState.activeMinigame?.sceneId ?? null;

  if (billywigCompletionSceneId !== activeSceneId) {
    billywigCompletionSceneId = activeSceneId;
    billywigFinishedPlayers.clear();
  }
}

function resetBillywigCompletion() {
  billywigCompletionSceneId = null;
  billywigFinishedPlayers.clear();
}

function synchronizePigzCompletionScene() {
  const activeSceneId = campaignState.activeMinigame?.sceneId ?? null;

  if (pigzCompletionSceneId !== activeSceneId) {
    pigzCompletionSceneId = activeSceneId;
    pigzFinishedPlayers.clear();
  }
}

function resetPigzCompletion() {
  pigzCompletionSceneId = null;
  pigzFinishedPlayers.clear();
}

function completeStoryMinigame(minigameId, playerId, acknowledge) {
  if (campaignState.activeMinigame?.id !== minigameId) {
    acknowledge({
      ok: false,
      error: `No story-launched ${minigameId} round is active.`
    });
    return;
  }

  const activeSceneId = campaignState.activeMinigame.sceneId;

  if (storyMinigameCompletionScenes[minigameId] !== activeSceneId) {
    storyMinigameCompletionScenes[minigameId] = activeSceneId;
    storyMinigameFinishedPlayers[minigameId].clear();
  }

  const finishedPlayers = storyMinigameFinishedPlayers[minigameId];
  finishedPlayers.add(playerId);

  const requiredPlayers = campaignState.sessionMode === 'singleplayer' ? 1 : 2;

  if (finishedPlayers.size < requiredPlayers) {
    acknowledge({
      ok: true,
      waitingForPartner: true
    });
    return;
  }

  const result = completeActiveMinigame(campaignState, 'completed');
  acknowledge(result);

  if (result.ok) {
    finishedPlayers.clear();
    storyMinigameCompletionScenes[minigameId] = null;
    io.emit('campaign:state', getCampaignSnapshot(campaignState));
  }
}

function cancelStoryMinigame(minigameId, acknowledge) {
  if (campaignState.activeMinigame?.id !== minigameId) {
    acknowledge({
      ok: false,
      error: `No story-launched ${minigameId} round is active.`
    });
    return;
  }

  const result = completeActiveMinigame(campaignState, 'cancelled');
  acknowledge(result);

  if (result.ok) {
    storyMinigameFinishedPlayers[minigameId].clear();
    storyMinigameCompletionScenes[minigameId] = null;
    io.emit('campaign:state', getCampaignSnapshot(campaignState));
  }
}
