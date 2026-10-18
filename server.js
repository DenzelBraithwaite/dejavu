import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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
  voteNetRunnersRematch
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
import { createStoryRepository } from './server/storyRepository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const port = Number(process.env.PORT ?? 6912);
const host = process.env.HOST ?? '0.0.0.0';
const savesDirectory = join(__dirname, 'data', 'saves');
const storyDatabasePath = join(__dirname, 'data', 'dejavu.sqlite');
const storyImageDirectory = join(__dirname, 'public', 'uploads', 'stories');
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
const storySelections = {
  p1: null,
  p2: null
};
let activeStoryId = null;
let campaignState = createCampaignState();
let netRunnersState = createNetRunnersState();
let pigzState = createPigzState();
let billywigCompletionSceneId = null;
const billywigFinishedPlayers = new Set();
let pigzCompletionSceneId = null;
const pigzFinishedPlayers = new Set();
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
  socket.emit('library:state', createLibraryState());
  socket.emit('netrunners:state', getNetRunnersSnapshot(netRunnersState));
  socket.emit('pigz:state', getPigzSnapshot(pigzState));
  if (hasInstalledMod('neuro-link-chat')) {
    socket.emit('chat:history', chatMessages);
  }
  broadcastSessionStatus();

  socket.on('library:get-story', (storyId, acknowledge = () => {}) => {
    const story = storyRepository.getStory(String(storyId ?? ''));

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
      const story = storyRepository.createStory(input ?? {});
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
      const story = storyRepository.updateStory(
        String(request?.storyId ?? ''),
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
      storyRepository.deleteStory(normalizedStoryId);

      for (const participantId of ['p1', 'p2']) {
        if (storySelections[participantId] === normalizedStoryId) {
          storySelections[participantId] = null;
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

  socket.on('library:select-story', (storyId, acknowledge = () => {}) => {
    const normalizedStoryId = storyId === null ? null : String(storyId ?? '');

    if (normalizedStoryId && !storyRepository.getStory(normalizedStoryId)) {
      acknowledge({
        ok: false,
        error: 'Story not found.'
      });
      return;
    }

    storySelections[playerId] = normalizedStoryId;
    synchronizeActiveStory();
    acknowledge({
      ok: true
    });
    broadcastLibraryState();
    io.emit('campaign:state', getCampaignSnapshot(campaignState));
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

      const result = handleCampaignAction(campaignState, playerId, action);
      acknowledge(result);

      if (result.ok) {
        io.emit('campaign:state', getCampaignSnapshot(campaignState));
      }
    } catch (error) {
      acknowledge({
        ok: false,
        error: error instanceof Error ? error.message : 'Campaign action failed.'
      });
    }
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
      storySelections.p1 = activeStoryId;
      storySelections.p2 = activeStoryId;
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
    joinNetRunners(netRunnersState, playerId, campaignState.players[playerId].name);
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

    if (billywigFinishedPlayers.size < 2) {
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
    joinPigz(pigzState, playerId, campaignState.players[playerId].name);
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

    if (pigzFinishedPlayers.size < 2) {
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

  socket.on('disconnect', () => {
    const slot = playerSlots[playerId];

    if (slot.socketId === socket.id) {
      slot.socketId = null;
      slot.connected = false;
      scheduleSlotRelease(playerId, slot.sessionToken);
    }

    leaveNetRunners(netRunnersState, playerId);
    leavePigz(pigzState, playerId);

    if (campaignState.activeMinigame?.id === 'netrunners') {
      const campaignResult = completeActiveMinigame(campaignState, 'cancelled');

      if (campaignResult.ok) {
        io.emit('campaign:state', getCampaignSnapshot(campaignState));
      }
    }
    broadcastSessionStatus();
    io.emit('netrunners:state', getNetRunnersSnapshot(netRunnersState));
    io.emit('pigz:state', getPigzSnapshot(pigzState));
  });
});

setInterval(() => {
  const campaignChanged = resolveExpiredTimedChoices(campaignState);
  const netRunnersChanged = updateNetRunners(netRunnersState);

  if (campaignChanged) {
    io.emit('campaign:state', getCampaignSnapshot(campaignState));
  }

  if (netRunnersChanged) {
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
    synchronizeActiveStory();
    broadcastSessionStatus();
    broadcastLibraryState();
  }, reconnectGraceMs);
}

function createLibraryState() {
  return {
    stories: storyRepository.listStories(),
    selections: {
      ...storySelections
    },
    activeStoryId
  };
}

function broadcastLibraryState() {
  io.emit('library:state', createLibraryState());
}

function synchronizeActiveStory() {
  const matchingStoryId = storySelections.p1
    && storySelections.p1 === storySelections.p2
    ? storySelections.p1
    : null;

  activeStoryId = matchingStoryId;

  if (!matchingStoryId || campaignState.story?.id === matchingStoryId) {
    return;
  }

  const story = storyRepository.getStory(matchingStoryId);

  if (story) {
    campaignState = createCampaignState(story);
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
