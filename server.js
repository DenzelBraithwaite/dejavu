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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const port = Number(process.env.PORT ?? 6912);
const host = process.env.HOST ?? '0.0.0.0';
const savesDirectory = join(__dirname, 'data', 'saves');
const reconnectGraceMs = 60_000;

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

let campaignState = createCampaignState();
let netRunnersState = createNetRunnersState();
const chatMessages = [];

initializeDeadlines(campaignState);

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
  socket.emit('netrunners:state', getNetRunnersSnapshot(netRunnersState));
  if (hasInstalledMod('neuro-link-chat')) {
    socket.emit('chat:history', chatMessages);
  }
  broadcastSessionStatus();

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
      initializeDeadlines(campaignState);
      io.emit('campaign:state', getCampaignSnapshot(campaignState));
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

  socket.on('disconnect', () => {
    const slot = playerSlots[playerId];

    if (slot.socketId === socket.id) {
      slot.socketId = null;
      slot.connected = false;
      scheduleSlotRelease(playerId, slot.sessionToken);
    }

    leaveNetRunners(netRunnersState, playerId);

    if (campaignState.activeMinigame?.id === 'netrunners') {
      const campaignResult = completeActiveMinigame(campaignState, 'cancelled');

      if (campaignResult.ok) {
        io.emit('campaign:state', getCampaignSnapshot(campaignState));
      }
    }
    broadcastSessionStatus();
    io.emit('netrunners:state', getNetRunnersSnapshot(netRunnersState));
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
    broadcastSessionStatus();
  }, reconnectGraceMs);
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
