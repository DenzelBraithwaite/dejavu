import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dejaVuStoryDocument } from '../src/lib/story/dejaVuStory.js';

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

  seedBuiltInStory(database, dejaVuStoryDocument);

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
        throw new Error('The built-in Déjà Vu story cannot be deleted. Duplicate it before experimenting.');
      }

      database.prepare('DELETE FROM stories WHERE id = ?').run(id);
    }
  };
}

function seedBuiltInStory(database, document) {
  const existing = database.prepare(
    `
      SELECT
        id,
        version,
        document_json AS documentJson
      FROM stories
      WHERE id = ?
    `
  ).get(document.id);

  const now = new Date().toISOString();

  if (existing) {
    const storedDocument = JSON.parse(existing.documentJson);
    const supportedMinigames = [
      ...new Set([
        ...(storedDocument.supportedMinigames ?? []),
        ...document.supportedMinigames
      ])
    ];

    if (supportedMinigames.length === storedDocument.supportedMinigames?.length) {
      return;
    }

    const nextVersion = Number(existing.version) + 1;
    const migratedDocument = {
      ...storedDocument,
      version: nextVersion,
      supportedMinigames
    };

    database.prepare(`
      UPDATE stories
      SET
        version = ?,
        document_json = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      nextVersion,
      JSON.stringify(migratedDocument),
      now,
      document.id
    );
    return;
  }

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
    1,
    JSON.stringify(document),
    now,
    now
  );
}

function createStoryDocument(input) {
  const id = createStoryId(input.title);
  const startNodes = input.nodes ?? createStarterNodes(id);

  return normalizeStoryDocument({
    schemaVersion: 1,
    id,
    title: input.title,
    description: input.description,
    author: input.author,
    status: 'draft',
    version: 1,
    builtIn: false,
    initialSceneIds: input.initialSceneIds ?? {
      p1: `${id}.p1.start`,
      p2: `${id}.p2.start`
    },
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

  if (!title) {
    throw new Error('Enter a story title.');
  }

  if (!Array.isArray(document.nodes)) {
    throw new Error('A story document requires a nodes array.');
  }

  validateStoryStructure(document);

  return {
    ...document,
    schemaVersion: 1,
    title,
    description: String(document.description ?? '').trim().slice(0, 500),
    author: String(document.author ?? '').trim().slice(0, 80),
    status: document.status === 'published' ? 'published' : 'draft',
    version: Math.max(1, Number(document.version ?? 1)),
    builtIn: Boolean(document.builtIn),
    supportedMinigames: Array.isArray(document.supportedMinigames)
      ? document.supportedMinigames
      : []
  };
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
  }

  for (const playerId of ['p1', 'p2']) {
    const startNodeId = document.initialSceneIds?.[playerId];

    if (!startNodeId || !nodeIds.has(startNodeId)) {
      throw new Error(`The ${playerId.toUpperCase()} start node does not exist.`);
    }
  }
}

function createStarterNodes(storyId) {
  return [
    {
      id: `${storyId}.p1.start`,
      type: 'dialogue',
      audience: 'p1',
      speaker: 'SYSTEM',
      text: 'Player 1 story begins here.',
      next: `${storyId}.ending`
    },
    {
      id: `${storyId}.p2.start`,
      type: 'dialogue',
      audience: 'p2',
      speaker: 'SYSTEM',
      text: 'Player 2 story begins here.',
      next: `${storyId}.ending`
    },
    {
      id: `${storyId}.ending`,
      type: 'ending',
      audience: 'both',
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
  return {
    ...row,
    builtIn: Boolean(row.builtIn)
  };
}
