import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const retiredBuiltInStoryIds = ['deja-vu'];
const playableStartNodeTypes = new Set([
  'choice',
  'condition',
  'conversation',
  'dialogue',
  'dice-check',
  'image',
  'input',
  'minigame',
  'vote'
]);

export function createStoryRepository(databasePath) {
  mkdirSync(dirname(databasePath), {
    recursive: true
  });

  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      version INTEGER NOT NULL DEFAULT 1,
      built_in INTEGER NOT NULL DEFAULT 0,
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  removeRetiredBuiltInStories(database);
  migrateLegacyStoryNodes(database);

  return {
    listStories() {
      return database.prepare(`
        SELECT
          id,
          title,
          description,
          author,
          status,
          version,
          built_in AS builtIn,
          document_json AS documentJson,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM stories
        ORDER BY built_in DESC, updated_at DESC
      `).all().map(normalizeStorySummary);
    },

    getStory(id) {
      const row = database.prepare(`
        SELECT document_json AS documentJson
        FROM stories
        WHERE id = ?
      `).get(id);

      return row ? JSON.parse(row.documentJson) : null;
    },

    createStory(input) {
      const now = new Date().toISOString();
      const document = createStoryDocument(input);

      database.prepare(`
        INSERT INTO stories (
          id,
          title,
          description,
          author,
          status,
          version,
          built_in,
          document_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        document.id,
        document.title,
        document.description,
        document.author,
        document.status,
        document.version,
        0,
        JSON.stringify(document),
        now,
        now
      );

      return document;
    },

    updateStory(id, document) {
      const existing = this.getStory(id);

      if (!existing) {
        throw new Error('Story not found.');
      }

      const normalized = normalizeStoryDocument({
        ...document,
        id,
        builtIn: Boolean(existing.builtIn),
        version: Number(existing.version ?? 1) + 1
      });
      const now = new Date().toISOString();

      database.prepare(`
        UPDATE stories
        SET
          title = ?,
          description = ?,
          author = ?,
          status = ?,
          version = ?,
          document_json = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        normalized.title,
        normalized.description,
        normalized.author,
        normalized.status,
        normalized.version,
        JSON.stringify(normalized),
        now,
        id
      );

      return normalized;
    },

    duplicateStory(id) {
      const existing = this.getStory(id);

      if (!existing) {
        throw new Error('Story not found.');
      }

      return this.createStory({
        title: `${existing.title} Copy`,
        description: existing.description,
        author: existing.author,
        nodes: existing.nodes,
        initialSceneIds: existing.initialSceneIds,
        singleplayerInitialSceneId: existing.singleplayerInitialSceneId,
        playModes: existing.playModes,
        mainCharacterIds: existing.mainCharacterIds,
        characterIds: existing.characterIds,
        relationships: existing.relationships,
        multiplayerStartMode: existing.multiplayerStartMode,
        theme: existing.theme,
        supportedMinigames: existing.supportedMinigames
      });
    },

    deleteStory(id) {
      const existing = this.getStory(id);

      if (!existing) {
        throw new Error('Story not found.');
      }

      if (existing.builtIn) {
        throw new Error('Built-in stories cannot be deleted.');
      }

      if (existing.protected) {
        throw new Error('Unprotect this story in Story settings before deleting it.');
      }

      database.prepare('DELETE FROM stories WHERE id = ?').run(id);
    }
  };
}

function removeRetiredBuiltInStories(database) {
  const deleteStory = database.prepare(`
    DELETE FROM stories
    WHERE id = ? AND built_in = 1
  `);

  for (const storyId of retiredBuiltInStoryIds) {
    deleteStory.run(storyId);
  }
}

function createStoryDocument(input) {
  const id = createStoryId(input.title);
  const startNodes = input.nodes ?? createStarterNodes(id);
  const playModes = normalizePlayModes(input.playModes);

  return normalizeStoryDocument({
    schemaVersion: 1,
    id,
    title: input.title,
    description: input.description,
    author: input.author,
    protected: Boolean(input.protected),
    version: 1,
    builtIn: false,
    initialSceneIds: input.initialSceneIds ?? {
      p1: `${id}.p1.start`,
      p2: `${id}.p2.start`
    },
    singleplayerInitialSceneId: input.singleplayerInitialSceneId ?? `${id}.solo.start`,
    multiplayerStartMode: input.multiplayerStartMode ?? 'separate',
    playModes,
    mainCharacterIds: normalizeMainCharacterIds(input.mainCharacterIds),
    characterIds: normalizeCharacterIds(input.characterIds, input.mainCharacterIds),
    relationships: normalizeRelationships(input.relationships),
    nodes: startNodes,
    theme: input.theme ?? {
      id: 'default-terminal',
      name: 'Default Terminal'
    },
    supportedMinigames: input.supportedMinigames ?? []
  });
}

function normalizeStoryDocument(document) {
  const title = String(document.title ?? '').trim().slice(0, 80);
  const nodes = normalizeLegacyStoryNodes(document.nodes);

  if (!title) {
    throw new Error('Enter a story title.');
  }

  if (!Array.isArray(document.nodes)) {
    throw new Error('A story document requires a nodes array.');
  }

  const initialSceneIds = {
    p1: String(document.initialSceneIds?.p1 ?? ''),
    p2: String(document.initialSceneIds?.p2 ?? '')
  };
  const multiplayerStartMode = document.multiplayerStartMode === 'shared'
    || (initialSceneIds.p1 && initialSceneIds.p1 === initialSceneIds.p2)
    ? 'shared'
    : 'separate';
  const normalized = {
    ...document,
    nodes,
    schemaVersion: 1,
    title,
    description: String(document.description ?? '').trim().slice(0, 500),
    author: String(document.author ?? '').trim().slice(0, 80),
    version: Math.max(1, Number(document.version ?? 1)),
    builtIn: Boolean(document.builtIn),
    protected: Boolean(document.protected),
    playModes: normalizePlayModes(document.playModes),
    mainCharacterIds: normalizeMainCharacterIds(document.mainCharacterIds),
    characterIds: normalizeCharacterIds(document.characterIds, document.mainCharacterIds),
    relationships: normalizeRelationships(document.relationships),
    singleplayerInitialSceneId: String(
      document.singleplayerInitialSceneId
        ?? document.initialSceneIds?.p1
        ?? ''
    ),
    initialSceneIds,
    multiplayerStartMode,
    supportedMinigames: Array.isArray(document.supportedMinigames)
      ? document.supportedMinigames
      : []
  };

  validateStoryStructure(normalized);

  const unavailableReason = getUnavailableReason(normalized);

  return {
    ...normalized,
    status: unavailableReason ? 'draft' : 'playable',
    unavailableReason
  };
}

function normalizeLegacyStoryNodes(nodes) {
  if (!Array.isArray(nodes)) {
    return nodes;
  }

  const migratedNodes = nodes.map((node) => {
    const migratedNode = structuredClone(node);

    if (migratedNode?.type === 'background') {
      migratedNode.type = 'screen-effect';
      migratedNode.screenEffect = 'color';
      migratedNode.backgroundTheme = migratedNode.backgroundTheme
        ?? migratedNode.background
        ?? 'blue';
      migratedNode.effectLoop = false;
      delete migratedNode.background;
    }

    if (migratedNode?.type === 'music') {
      migratedNode.type = 'audio';
      migratedNode.audioKind = 'music';
    }

    if (migratedNode?.type === 'sound-effect') {
      migratedNode.type = 'audio';
      migratedNode.audioKind = 'sound';
    }

    if (migratedNode?.type === 'stop-music') {
      migratedNode.type = 'stop-audio';
      migratedNode.stopMusic = true;
    }

    if (migratedNode?.type === 'effect') {
      const effectType = String(migratedNode.effects?.[0]?.type ?? 'add-item');

      if (['add-item', 'remove-item'].includes(effectType)) {
        const legacyText = String(migratedNode.text ?? '').trim();
        migratedNode.type = 'item-effect';
        migratedNode.announcementTemplate = legacyText && legacyText !== 'You acquired a new item.'
          ? legacyText
          : effectType === 'remove-item'
            ? 'Removed item: <ITEM>.'
            : 'Acquired item: <ITEM>.';
        delete migratedNode.text;
      } else if (effectType === 'set-flag') {
        migratedNode.type = 'story-flag';
      } else {
        migratedNode.type = 'player-state';
      }
    }

    for (const choice of migratedNode?.choices ?? []) {
      delete choice.playerMode;
    }

    return migratedNode;
  });

  // Labels used to sit in the playable route. Preserve that route while
  // converting each legacy label into an editor-only companion annotation.
  for (const label of migratedNodes.filter(
    (node) => node.type === 'label' && node.attachedTo === undefined
  )) {
    let incomingNode = null;

    for (const candidate of migratedNodes) {
      const routeWasReplaced = replaceNodeDestination(
        candidate,
        label.id,
        String(label.next ?? '')
      );

      if (routeWasReplaced && !incomingNode) {
        incomingNode = candidate;
      }
    }

    label.attachedTo = incomingNode?.id ?? '';
    delete label.next;
  }

  return migratedNodes;
}

function replaceNodeDestination(node, destinationId, replacementId) {
  let replaced = false;
  const directRouteFields = ['next', 'success', 'failure', 'trueNext', 'falseNext'];

  for (const field of directRouteFields) {
    if (node[field] === destinationId) {
      node[field] = replacementId;
      replaced = true;
    }
  }

  for (const choice of node.choices ?? []) {
    if (choice.next === destinationId) {
      choice.next = replacementId;
      replaced = true;
    }
  }

  for (const [result, resultDestination] of Object.entries(node.resultNext ?? {})) {
    if (resultDestination === destinationId) {
      node.resultNext[result] = replacementId;
      replaced = true;
    }
  }

  return replaced;
}

function migrateLegacyStoryNodes(database) {
  const stories = database.prepare(`
    SELECT
      id,
      version,
      document_json AS documentJson
    FROM stories
  `).all();

  for (const storedStory of stories) {
    const document = JSON.parse(storedStory.documentJson);
    const hasLegacyNode = document.nodes?.some((node) => (
      ['background', 'music', 'sound-effect', 'stop-music', 'effect'].includes(node.type)
      || (node.type === 'label' && node.attachedTo === undefined)
      || node.choices?.some((choice) => choice.playerMode)
    ));

    if (!hasLegacyNode) {
      continue;
    }

    const version = Number(storedStory.version) + 1;
    const migratedDocument = {
      ...document,
      version,
      nodes: normalizeLegacyStoryNodes(document.nodes)
    };

    database.prepare(`
      UPDATE stories
      SET
        version = ?,
        document_json = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      version,
      JSON.stringify(migratedDocument),
      new Date().toISOString(),
      storedStory.id
    );
  }
}

function normalizeMainCharacterIds(value) {
  return {
    singleplayer: normalizeOptionalId(value?.singleplayer),
    multiplayer: {
      p1: normalizeOptionalId(value?.multiplayer?.p1),
      p2: normalizeOptionalId(value?.multiplayer?.p2)
    }
  };
}

function normalizeCharacterIds(value, mainCharacterIds) {
  const normalizedMainCharacters = normalizeMainCharacterIds(mainCharacterIds);
  const characterIds = [
    ...(Array.isArray(value) ? value : []),
    normalizedMainCharacters.singleplayer,
    normalizedMainCharacters.multiplayer.p1,
    normalizedMainCharacters.multiplayer.p2
  ]
    .map(normalizeOptionalId)
    .filter(Boolean);

  return [...new Set(characterIds)];
}

function normalizeRelationships(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = [];
  const relationshipIds = new Set();

  for (const relationship of value) {
    const characterId = String(relationship?.characterId ?? '').trim();
    const id = characterId === 'other-player'
      ? 'other-player'
      : characterId;

    if (!id || relationshipIds.has(id)) {
      continue;
    }

    const requestedMinimum = Number(relationship?.minimum ?? -5);
    const requestedMaximum = Number(relationship?.maximum ?? 5);
    const safeMinimum = Number.isFinite(requestedMinimum) ? requestedMinimum : -5;
    const safeMaximum = Number.isFinite(requestedMaximum) ? requestedMaximum : 5;
    const requestedInitialValue = Number(relationship?.initialValue ?? 0);
    const minimum = Math.min(safeMinimum, safeMaximum);
    const maximum = Math.max(safeMinimum, safeMaximum);
    const initialValue = Math.min(
      maximum,
      Math.max(
        minimum,
        Number.isFinite(requestedInitialValue) ? requestedInitialValue : 0
      )
    );

    normalized.push({
      id,
      characterId,
      initialValue,
      minimum,
      maximum,
      visible: relationship?.visible !== false
    });
    relationshipIds.add(id);
  }

  return normalized;
}

function normalizeOptionalId(value) {
  const id = String(value ?? '').trim();
  return id || null;
}

function validateStoryStructure(document) {
  const nodeIds = new Set();

  for (const node of document.nodes) {
    const nodeId = String(node?.id ?? '').trim();

    if (!nodeId || !String(node?.type ?? '').trim()) {
      throw new Error('Every story node requires an ID and type.');
    }

    if (nodeIds.has(nodeId)) {
      throw new Error(`Duplicate story node ID: ${nodeId}`);
    }

    nodeIds.add(nodeId);

    if (['choice', 'vote', 'timed-choice'].includes(node.type)) {
      const choiceCount = Array.isArray(node.choices) ? node.choices.length : 0;
      const enabledChoices = node.choices?.filter((choice) => !choice.disabled) ?? [];

      if (choiceCount < 2 || choiceCount > 5) {
        throw new Error(`${nodeId} must contain between two and five choices.`);
      }

      if (enabledChoices.length === 0) {
        throw new Error(`${nodeId} must keep at least one choice enabled.`);
      }

      if ((node.type === 'timed-choice' || node.timed)
        && !enabledChoices.some((choice) => choice.id === node.fallbackChoiceId)) {
        throw new Error(`${nodeId} requires an enabled fallback choice.`);
      }
    }
  }

  const playModes = normalizePlayModes(document.playModes);
  const mainCharacterIds = normalizeMainCharacterIds(document.mainCharacterIds);

  if (playModes.singleplayer && !mainCharacterIds.singleplayer) {
    throw new Error('Choose a main character for the single-player story.');
  }

  if (playModes.multiplayer) {
    const playerOneCharacterId = mainCharacterIds.multiplayer.p1;
    const playerTwoCharacterId = mainCharacterIds.multiplayer.p2;

    if (!playerOneCharacterId || !playerTwoCharacterId) {
      throw new Error('Choose both main characters for the multiplayer story.');
    }

    if (playerOneCharacterId === playerTwoCharacterId) {
      throw new Error('Player 1 and Player 2 must use different characters.');
    }
  }

}

function getUnavailableReason(document) {
  const playModes = normalizePlayModes(document.playModes);
  const nodesById = new Map(document.nodes.map((node) => [node.id, node]));

  if (playModes.singleplayer) {
    const soloIssue = getStartNodeIssue(
      nodesById.get(document.singleplayerInitialSceneId),
      'singleplayer',
      'p1',
      'Single-player'
    );

    if (soloIssue) {
      return soloIssue;
    }
  }

  if (!playModes.multiplayer) {
    return '';
  }

  if (document.multiplayerStartMode === 'shared') {
    const sharedStartId = document.initialSceneIds?.p1;

    if (!sharedStartId || sharedStartId !== document.initialSceneIds?.p2) {
      return 'Shared start is missing.';
    }

    return getStartNodeIssue(
      nodesById.get(sharedStartId),
      'multiplayer',
      'both',
      'Shared'
    );
  }

  const playerOneIssue = getStartNodeIssue(
    nodesById.get(document.initialSceneIds?.p1),
    'multiplayer',
    'p1',
    'Player 1'
  );

  if (playerOneIssue) {
    return playerOneIssue;
  }

  return getStartNodeIssue(
    nodesById.get(document.initialSceneIds?.p2),
    'multiplayer',
    'p2',
    'Player 2'
  );
}

function getStartNodeIssue(node, map, audience, label) {
  if (!node) {
    return `${label} start is missing.`;
  }

  if (!playableStartNodeTypes.has(node.type)) {
    return `${label} start must use a player-facing scene or Condition node.`;
  }

  if (node.map !== map) {
    return `${label} start is on the wrong map.`;
  }

  if (node.audience !== audience) {
    const target = audience === 'both' ? 'both players' : audience.toUpperCase();

    return `${label} start must target ${target}.`;
  }

  return '';
}

function normalizePlayModes(value) {
  const singleplayer = Boolean(value?.singleplayer);
  const multiplayer = value?.multiplayer === undefined
    ? !singleplayer
    : Boolean(value.multiplayer);

  if (!singleplayer && !multiplayer) {
    return {
      singleplayer: false,
      multiplayer: true
    };
  }

  return {
    singleplayer,
    multiplayer
  };
}

function createStarterNodes(storyId) {
  return [
    {
      id: `${storyId}.solo.start`,
      type: 'dialogue',
      audience: 'p1',
      map: 'singleplayer',
      speaker: 'SYSTEM',
      text: 'Your story begins here.',
      next: `${storyId}.solo.ending`
    },
    {
      id: `${storyId}.solo.ending`,
      type: 'ending',
      audience: 'p1',
      map: 'singleplayer',
      text: 'End of story.'
    },
    {
      id: `${storyId}.p1.start`,
      type: 'dialogue',
      audience: 'p1',
      map: 'multiplayer',
      speaker: 'SYSTEM',
      text: 'Player 1 story begins here.',
      next: `${storyId}.ending`
    },
    {
      id: `${storyId}.p2.start`,
      type: 'dialogue',
      audience: 'p2',
      map: 'multiplayer',
      speaker: 'SYSTEM',
      text: 'Player 2 story begins here.',
      next: `${storyId}.ending`
    },
    {
      id: `${storyId}.ending`,
      type: 'ending',
      audience: 'both',
      map: 'multiplayer',
      text: 'End of story.'
    }
  ];
}

function createStoryId(title) {
  const slug = String(title ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'untitled-story';
  const suffix = randomUUID().slice(0, 8);

  return `${slug}-${suffix}`;
}

function normalizeStorySummary(row) {
  const document = JSON.parse(row.documentJson);
  const { documentJson, ...summary } = row;

  return {
    ...summary,
    builtIn: Boolean(row.builtIn),
    playModes: normalizePlayModes(document.playModes),
    protected: Boolean(document.protected),
    multiplayerStartMode: document.multiplayerStartMode ?? 'separate',
    unavailableReason: String(document.unavailableReason ?? '')
  };
}
