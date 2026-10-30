import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_STATS = {
  muscles: 10,
  toughness: 10,
  speed: 10,
  stealth: 10,
  smarts: 10,
  ocuware: 10,
  cred: 10,
  luck: 2,
  hacking: 10
};

const DEFAULT_IMAGES = {
  normal: '',
  shocked: '',
  angry: '',
  sad: '',
  happy: ''
};

const DEFAULT_IMAGE_POSITIONS = {
  normal: { x: 50, y: 50 },
  shocked: { x: 50, y: 50 },
  angry: { x: 50, y: 50 },
  sad: { x: 50, y: 50 },
  happy: { x: 50, y: 50 }
};

const CHARACTER_TYPES = new Set(['account', 'playable', 'npc']);

const NPC_STATS = Object.fromEntries(
  Object.keys(DEFAULT_STATS).map((stat) => [stat, 5])
);

const NPC_NAMES = [
  'Ajax',
  'Axel',
  'Benny',
  'Dahlia',
  'David',
  'Desmond',
  'Drift',
  'Gaze',
  'Grade',
  'Gritt',
  'Judik',
  'Kat',
  'Link',
  'Milton',
  'Neuro',
  'RAID Guard',
  'Riot',
  'Strix',
  'Switch',
  'Toad',
  'Trinity',
  'Vex',
  'Vex No Mask',
  'Vex Partial Mask',
  'Watts',
  'Zara',
  'Zee'
];

const SEEDED_CHARACTERS = [
  {
    id: 'kaz-account',
    name: 'Kaz',
    type: 'account',
    wallet: 10_000,
    stats: DEFAULT_STATS,
    notes: 'Starter account for main-menu minigames.'
  },
  {
    id: 'nova',
    name: 'Nova',
    type: 'playable',
    wallet: 10_000,
    stats: {
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
    images: createBuiltInImages('nova')
  },
  {
    id: 'avona',
    name: 'Avona',
    type: 'playable',
    wallet: 10_000,
    stats: {
      muscles: 8,
      toughness: 9,
      speed: 10,
      stealth: 12,
      smarts: 11,
      ocuware: 20,
      cred: 13,
      luck: 4,
      hacking: 6
    },
    images: createBuiltInImages('avona')
  },
  ...NPC_NAMES.map(createNpcSeed)
];

export function createCharacterRepository(databasePath) {
  mkdirSync(dirname(databasePath), {
    recursive: true
  });

  const database = new DatabaseSync(databasePath);

  database.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      wallet INTEGER NOT NULL DEFAULT 0,
      stats_json TEXT NOT NULL,
      images_json TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      character_type TEXT NOT NULL DEFAULT 'playable',
      built_in INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  migrateCharacterTypes(database);
  seedCharacters(database);

  return {
    listCharacters() {
      return database.prepare(`
        SELECT
          id,
          name,
          wallet,
          stats_json AS statsJson,
          images_json AS imagesJson,
          notes,
          character_type AS type,
          built_in AS builtIn,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM characters
        ORDER BY built_in DESC, name COLLATE NOCASE ASC
      `).all().map(normalizeCharacterRow);
    },

    getCharacter(id) {
      const row = database.prepare(`
        SELECT
          id,
          name,
          wallet,
          stats_json AS statsJson,
          images_json AS imagesJson,
          notes,
          character_type AS type,
          built_in AS builtIn,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM characters
        WHERE id = ?
      `).get(id);

      return row ? normalizeCharacterRow(row) : null;
    },

    createCharacter(input) {
      const character = normalizeCharacter({
        ...input,
        id: createCharacterId(input?.name),
        builtIn: false
      });
      const now = new Date().toISOString();

      database.prepare(`
        INSERT INTO characters (
          id,
          name,
          wallet,
          stats_json,
          images_json,
          notes,
          character_type,
          built_in,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        character.id,
        character.name,
        character.wallet,
        JSON.stringify(character.stats),
        serializeCharacterImages(character),
        character.notes,
        character.type,
        0,
        now,
        now
      );

      return this.getCharacter(character.id);
    },

    updateCharacter(id, input) {
      const existing = this.getCharacter(id);

      if (!existing) {
        throw new Error('Character not found.');
      }

      const character = normalizeCharacter({
        ...existing,
        ...input,
        id,
        builtIn: existing.builtIn
      });
      const now = new Date().toISOString();

      database.prepare(`
        UPDATE characters
        SET
          name = ?,
          wallet = ?,
          stats_json = ?,
          images_json = ?,
          notes = ?,
          character_type = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        character.name,
        character.wallet,
        JSON.stringify(character.stats),
        serializeCharacterImages(character),
        character.notes,
        character.type,
        now,
        id
      );

      return this.getCharacter(id);
    },

    adjustWallet(id, amount) {
      const existing = this.getCharacter(id);

      if (!existing) {
        throw new Error('Character not found.');
      }

      const wallet = Math.max(0, existing.wallet + Math.trunc(Number(amount) || 0));

      database.prepare(`
        UPDATE characters
        SET wallet = ?, updated_at = ?
        WHERE id = ?
      `).run(wallet, new Date().toISOString(), id);

      return this.getCharacter(id);
    },

    setWallet(id, amount) {
      const existing = this.getCharacter(id);

      if (!existing) {
        throw new Error('Character not found.');
      }

      const wallet = normalizeWholeNumber(amount, 0, 999_999_999);

      database.prepare(`
        UPDATE characters
        SET wallet = ?, updated_at = ?
        WHERE id = ?
      `).run(wallet, new Date().toISOString(), id);

      return this.getCharacter(id);
    },

    deleteCharacter(id) {
      const existing = this.getCharacter(id);

      if (!existing) {
        throw new Error('Character not found.');
      }

      if (existing.builtIn) {
        throw new Error('Built-in characters cannot be deleted.');
      }

      database.prepare('DELETE FROM characters WHERE id = ?').run(id);
    }
  };
}

function seedCharacters(database) {
  // These templates were replaced by the named Avona and Nova playable characters.
  database.prepare(`
    DELETE FROM characters
    WHERE built_in = 1
      AND id IN ('npc-female-player', 'npc-male-player')
  `).run();

  const insert = database.prepare(`
    INSERT OR IGNORE INTO characters (
      id,
      name,
      wallet,
      stats_json,
      images_json,
      notes,
      character_type,
      built_in,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const character of SEEDED_CHARACTERS) {
    const now = new Date().toISOString();

    // Preserve an existing Kaz profile and promote it instead of replacing its progress.
    if (character.type === 'account') {
      const existingKaz = database.prepare(`
        SELECT id
        FROM characters
        WHERE name = ? COLLATE NOCASE
        LIMIT 1
      `).get(character.name);

      if (existingKaz) {
        database.prepare(`
          UPDATE characters
          SET character_type = 'account'
          WHERE id = ?
        `).run(existingKaz.id);
        continue;
      }
    }

    insert.run(
      character.id,
      character.name,
      character.wallet,
      JSON.stringify(character.stats),
      JSON.stringify(character.images ?? DEFAULT_IMAGES),
      character.notes ?? '',
      character.type,
      1,
      now,
      now
    );

    if (character.images) {
      const storedRow = database.prepare(`
        SELECT images_json AS imagesJson
        FROM characters
        WHERE id = ?
      `).get(character.id);
      const storedImages = storedRow
        ? JSON.parse(storedRow.imagesJson)
        : {};
      const updatedImages = {
        ...character.images,
        _positions: storedImages._positions ?? DEFAULT_IMAGE_POSITIONS
      };

      database.prepare(`
        UPDATE characters
        SET images_json = ?, updated_at = ?
        WHERE id = ? AND built_in = 1
      `).run(JSON.stringify(updatedImages), now, character.id);
    }
  }
}

function normalizeCharacter(input) {
  const name = String(input?.name ?? '').trim().slice(0, 48);

  if (!name) {
    throw new Error('Enter a character name.');
  }

  const stats = {};
  const imagePositions = {};

  for (const [key, defaultValue] of Object.entries(DEFAULT_STATS)) {
    stats[key] = normalizeWholeNumber(input?.stats?.[key] ?? defaultValue, 0, 100);
  }

  for (const [expression, defaultPosition] of Object.entries(DEFAULT_IMAGE_POSITIONS)) {
    imagePositions[expression] = {
      x: normalizeWholeNumber(input?.imagePositions?.[expression]?.x ?? defaultPosition.x, 0, 100),
      y: normalizeWholeNumber(input?.imagePositions?.[expression]?.y ?? defaultPosition.y, 0, 100)
    };
  }

  return {
    id: String(input.id),
    name,
    wallet: normalizeWholeNumber(input.wallet, 0, 999_999_999),
    stats,
    images: {
      ...DEFAULT_IMAGES,
      ...(input.images ?? {})
    },
    imagePositions,
    notes: String(input.notes ?? '').trim().slice(0, 500),
    type: normalizeCharacterType(input.type),
    builtIn: Boolean(input.builtIn)
  };
}

function normalizeCharacterRow(row) {
  const storedImages = JSON.parse(row.imagesJson);
  const images = {};

  // Crop coordinates share the existing JSON column so older databases need no schema migration.
  for (const expression of Object.keys(DEFAULT_IMAGES)) {
    images[expression] = String(storedImages[expression] ?? '');
  }

  return {
    id: row.id,
    name: row.name,
    wallet: Number(row.wallet),
    stats: JSON.parse(row.statsJson),
    images,
    imagePositions: {
      ...DEFAULT_IMAGE_POSITIONS,
      ...(storedImages._positions ?? {})
    },
    notes: row.notes,
    type: normalizeCharacterType(row.type),
    builtIn: Boolean(row.builtIn),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function serializeCharacterImages(character) {
  // The reserved key is ignored by image renderers and restored separately when records load.
  return JSON.stringify({
    ...character.images,
    _positions: character.imagePositions
  });
}

function normalizeWholeNumber(value, minimum, maximum) {
  const number = Math.trunc(Number(value));

  if (!Number.isFinite(number)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, number));
}

function createCharacterId(name) {
  const slug = String(name ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'unnamed-character';

  return `${slug}-${randomUUID().slice(0, 8)}`;
}

function migrateCharacterTypes(database) {
  const columns = database.prepare('PRAGMA table_info(characters)').all();
  const hasCharacterType = columns.some((column) => column.name === 'character_type');

  if (!hasCharacterType) {
    database.exec(`
      ALTER TABLE characters
      ADD COLUMN character_type TEXT NOT NULL DEFAULT 'playable'
    `);
  }

  // Kaz was the original app-wide identity, so retain its wallet and stats as an account.
  database.prepare(`
    UPDATE characters
    SET character_type = 'account'
    WHERE name = 'Kaz' COLLATE NOCASE
  `).run();
}

function normalizeCharacterType(value) {
  const type = String(value ?? 'playable').toLowerCase();

  return CHARACTER_TYPES.has(type) ? type : 'playable';
}

function createNpcSeed(name) {
  const fileStem = name.toLowerCase().replaceAll(' ', '_');
  const images = name === 'RAID Guard'
    ? createSinglePortraitImages(fileStem)
    : createBuiltInImages(fileStem);

  return {
    id: `npc-${fileStem.replaceAll('_', '-')}`,
    name,
    type: 'npc',
    wallet: 0,
    stats: NPC_STATS,
    notes: 'Built-in dialogue NPC.',
    images
  };
}

function createSinglePortraitImages(fileStem) {
  const portrait = `/media/characters/portraits/${fileStem}_neutral.png`;

  return {
    normal: portrait,
    shocked: portrait,
    angry: portrait,
    sad: portrait,
    happy: portrait
  };
}

function createBuiltInImages(fileStem) {
  const basePath = '/media/characters/portraits';

  return {
    normal: `${basePath}/${fileStem}_neutral.png`,
    shocked: `${basePath}/${fileStem}_shocked.png`,
    angry: `${basePath}/${fileStem}_angry.png`,
    sad: `${basePath}/${fileStem}_sad.png`,
    happy: `${basePath}/${fileStem}_happy.png`
  };
}
