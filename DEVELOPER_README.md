# Déjà Vu Runtime Developer Guide

This guide explains how the current two-player terminal-story runtime is structured and how to extend it. The long-term product direction is a visual story builder, so scene data must remain serializable, explicit, and independent from Svelte components.

See [GAME_BUILDER_DIRECTION.md](docs/GAME_BUILDER_DIRECTION.md) for the broader no-code editor direction.

## Runtime model

The runtime has three layers:

1. Story data defines nodes, choices, branches, and effects.
2. The server owns the current campaign state and validates player actions.
3. The browser renders the active node and sends player intentions to the server.

Do not add chapter-specific socket events or progression switches. If an interaction can be represented by an existing scene type, add data. Add engine code only for a genuinely new type of interaction.

## Important files

```text
src/lib/story/sceneTypes.js          Scene contract and registry helpers
src/lib/story/dejaVuStory.js         Built-in Déjà Vu story document
src/lib/story/storyRegistry.js       Legacy registry compatibility
src/lib/story/chapters/prologue.js   Current playable story data
src/lib/actions/typewriter.ts        Custom punctuation-aware typewriter
src/lib/components/Terminal.svelte   Generic scene renderer
src/lib/components/StoryLibrary.svelte  Story CRUD and node editor
src/lib/components/MinigameLibrary.svelte  Registered minigame catalog
src/lib/stores/library.ts            Browser story metadata and selections
server/gameSession.js                Authoritative scene execution
server/netRunnersSession.js          Authoritative multiplayer minigame
server/storyRepository.js            SQLite story persistence
server.js                            Sessions, sockets, library, saves, and hosting
```

## Story library and cartridge selection

The host stores stories in `data/dejavu.sqlite` using Node's built-in SQLite support. The database is runtime data and is intentionally ignored by Git. On first launch, `dejaVuStoryDocument` is inserted as the built-in Déjà Vu cartridge.

Each connected player has an in-memory cartridge selection. The server broadcasts both selections in `library:state`. A campaign is playable only when `p1` and `p2` select the same story ID. Matching a new story creates a fresh authoritative campaign from that stored story document; loading a campaign save stages its embedded story for both players.

Library socket operations are:

- `library:get-story`
- `library:create-story`
- `library:update-story`
- `library:duplicate-story`
- `library:delete-story`
- `library:select-story`

CRUD operations are server-owned. Do not write stories into browser storage or mutate the campaign directly from the editor.

## Using the visual editor

Open **Editor** from the sidebar, choose **Edit** on a Library cartridge, or create a new story from **Library**. The Editor is its own page, while Library remains the CRUD and cartridge-selection page. A new story begins with separate Player 1 and Player 2 dialogue nodes leading to one shared ending.

The canvas is divided into Player 1, Shared, and Player 2 lanes. Select a node to edit it in the inspector. Route controls enter a temporary selection mode so the creator can click a destination node instead of handling internal IDs. Player routes can target their own lane or Shared; Shared routes stay in Shared.

Use the plus control at the bottom of a lane to append a node. Empty normal and branch routes expose their own plus controls, which insert and connect a new node at that exact route. Appending after a node with an empty normal route connects it automatically. Nodes can be dragged within a lane to reorder them or dropped onto another lane to change their audience. The inspector also provides keyboard-accessible move controls, while each card exposes compact copy, duplicate, and delete actions. Undo and redo retain up to 100 editor snapshots between loads or saves.

The inspector can select routes in either direction. **Select next node** updates the selected node. **Select previous node** asks for an existing source node, finds an unused compatible route on it, and updates that source so it leads into the selected node. Nodes with several incoming routes display every source separately.

Image, item/effect, and music/atmosphere nodes are grouped as companion changes and offset visually from the main flow. A companion stores the main-flow node ID in `attachedTo`; it has no incoming or outgoing route of its own and is rendered or applied when its host becomes active. Images are uploaded to `public/uploads/stories/` through the host's `/api/story-assets/images` endpoint; accepted formats are PNG, JPEG, WebP, GIF, AVIF, and SVG, with an 8 MB limit.

Node cards show their type ordinal, such as `3rd dialogue node`, plus readable route destinations. Missing incoming routes, missing outgoing routes, broken destinations, and illegal cross-player links receive a red invalid border. Start nodes, endings, and visual labels have the expected validation exceptions.

Visual labels are editor-only organizers such as `CHAPTER 2` or `SCENE CHANGE`. They do not execute and cannot be selected as route destinations. A lane containing a condition expands to a two-column branch layout.

Saving validates unique node IDs and verifies that both player start nodes exist, then increments the story version.

Available palette nodes are:

- Dialogue, free-form player input, choice, checkpoint, and open-floor conversation.
- Dice check, shared vote, and timed choice.
- Item/effect and condition.
- Image, NetRunners minigame, and ending.
- Visual labels for chapters, locations, and other editor-only organization.

Incomplete destination fields are allowed while creators build a draft, but the canvas marks missing, broken, self-referencing, and illegal cross-lane routes in red. Start nodes, endings, labels, and companion presentation nodes use their appropriate validation exceptions.

## Story document shape

Every stored cartridge is a serializable object with metadata and its graph:

```js
{
  schemaVersion: 1,
  id: 'my-story-a1b2c3d4',
  title: 'My Story',
  status: 'draft',
  version: 1,
  initialSceneIds: {
    p1: 'my-story.p1.start',
    p2: 'my-story.p2.start'
  },
  nodes: [],
  theme: {
    id: 'default-terminal',
    name: 'Default Terminal'
  },
  supportedMinigames: []
}
```

Active campaigns embed the exact story document they started with. Editing the library copy does not rewrite a campaign already in progress.

## Adding a chapter in code

Create a JavaScript module under `src/lib/story/chapters/`. Scene files use JSDoc types so the same serializable data can run in both Node and the browser.

```js
import { defineScene } from '../sceneTypes.js';

export const chapterOneScenes = [
  defineScene({
    id: 'chapter-01.arrival',
    type: 'dialogue',
    audience: 'both',
    speaker: 'Trinity',
    text: 'You two must be the new arrivals.',
    next: 'chapter-01.first-choice'
  })
];
```

Add the array to `dejaVuStoryDocument` through its imported chapter data. `storyRegistry.js` remains only as a compatibility projection for code that needs the built-in node map.

```js
import { chapterOneScenes } from './chapters/chapterOne.js';

export const dejaVuStoryDocument = {
  // Other story metadata is omitted here.
  nodes: [
    ...prologueScenes,
    ...chapterOneScenes
  ]
};
```

Every scene ID must be globally unique. Use a predictable prefix such as `chapter-01.`.

## Text tokens

The terminal currently replaces these tokens:

- `{PLAYER_1}`
- `{PLAYER_2}`
- `{PLAYER_NAME}` for the local player

Unknown tokens remain visible during testing so authoring mistakes are easy to notice.

## Dialogue

Dialogue shows text and a Continue button after typing completes.

```js
defineScene({
  id: 'chapter-01.trinity-greeting',
  type: 'dialogue',
  audience: 'both',
  speaker: 'Trinity',
  text: 'Welcome to the Shades, {PLAYER_NAME}.',
  next: 'chapter-01.look-around'
})
```

Use `audience: 'p1'` or `audience: 'p2'` for a private perspective. Use `both` when both players can receive the scene.

## Terminal history and clearing

Completed scene output accumulates in each player's terminal by default. This lets dialogue, prompts, and responses remain readable after the next node starts.

Set `clearTerminal: true` on a destination node when entering that node should represent a new terminal context, location, chapter, or deliberate screen clear:

```js
defineScene({
  id: 'chapter-02.safehouse-arrival',
  type: 'dialogue',
  audience: 'both',
  clearTerminal: true,
  text: 'The safehouse terminal flickers online.',
  next: 'chapter-02.briefing'
})
```

The clear belongs to the scene being entered, not the scene being left. The visual builder should expose this as a clear-terminal toggle on every node.

## Choices

Each choice has a stable ID, a player-facing label, and a destination.

```js
defineScene({
  id: 'chapter-01.look-around',
  type: 'choice',
  audience: 'p1',
  text: 'Where do you look first?',
  choices: [
    {
      id: 'workbench',
      label: 'Inspect the workbench',
      next: 'chapter-01.workbench'
    },
    {
      id: 'door',
      label: 'Watch the door',
      next: 'chapter-01.door'
    }
  ]
})
```

The server records choices in the decision log.

## Effects

Effects update campaign state without custom component logic.

Supported effects are:

- `set-flag`
- `add-item`
- `remove-item`
- `discover-character`
- `adjust-stat`
- `install-mod`
- `remove-mod`

```js
effects: [
  {
    type: 'set-flag',
    key: 'chapter01.helpedLink',
    value: true
  },
  {
    type: 'add-item',
    key: 'encrypted-data-shard'
  },
  {
    type: 'discover-character',
    key: 'link'
  }
]
```

Use namespaced flag keys. Flags should describe a fact that occurred, not a temporary UI state.

An `effect` node exposes these operations in the visual inspector and applies them when the player continues. Choice-level effects remain supported for branches that should change state immediately.

## Conditions

Condition nodes route without rendering a terminal prompt. Supported checks are:

- `has-item`
- `flag-equals`
- `stat-at-least`
- `last-dice-success`

```js
defineScene({
  id: 'chapter-01.has-key',
  type: 'condition',
  audience: 'p1',
  condition: {
    type: 'has-item',
    key: 'maintenance-key'
  },
  trueNext: 'chapter-01.unlock-door',
  falseNext: 'chapter-01.find-another-way'
})
```

The server follows condition routes immediately when entering them and guards against runaway chains.

## Player input

The current input node records a player's tag. It can later be generalized with a destination field in campaign state.

```js
defineScene({
  id: 'prologue.name',
  type: 'input',
  audience: 'p1',
  prompt: 'What is your tag?',
  maxLength: 24,
  next: 'prologue.named'
})
```

## Checkpoints

Checkpoints stop the first arriving player until both clients reach matching checkpoint IDs.

Each player normally has their own node because their preceding paths may be different:

```js
defineScene({
  id: 'chapter-01.p1.ready',
  type: 'checkpoint',
  audience: 'p1',
  text: 'Wait for your partner.',
  checkpointId: 'chapter-01.ready',
  next: 'chapter-01.reunited'
}),
defineScene({
  id: 'chapter-01.p2.ready',
  type: 'checkpoint',
  audience: 'p2',
  text: 'Wait for your partner.',
  checkpointId: 'chapter-01.ready',
  next: 'chapter-01.reunited'
})
```

Both nodes must use the same `checkpointId` and destination.

## Fixed-length player conversations

Conversation nodes represent characters speaking while they are physically together. The server selects who has the floor, prevents the waiting player from sending, tracks each player's quota, and advances both players as soon as both quotas are complete. The runtime never displays the remaining message count to players.

```js
defineScene({
  id: 'chapter-01.private-chat',
  type: 'conversation',
  audience: 'both',
  text: 'You have a moment to speak privately.',
  messagesPerPlayer: {
    p1: 3,
    p2: 2
  },
  firstPlayer: 'random',
  next: 'chapter-01.chat-finished'
})
```

Use `firstPlayer: 'p1'`, `firstPlayer: 'p2'`, or `firstPlayer: 'random'`. Omitting `firstPlayer` also lets the server choose randomly. `messagesPerPlayer` supports equal conversations such as three messages each or intentionally uneven conversations such as three from Player 1 and two from Player 2. Quotas may differ by at most one so turns can always alternate. When the quotas differ, the player with the extra message necessarily speaks first.

The older `messageCount` field remains supported. Its total is divided across alternating turns, with the first speaker receiving the extra message when the total is odd.

## Dice checks

Dice are rolled by the server. The total is:

```text
die roll + selected stat + luck
```

```js
defineScene({
  id: 'chapter-01.force-door',
  type: 'dice-check',
  audience: 'p1',
  text: 'The lock is failing. Force the door before it seals.',
  die: 20,
  stat: 'muscles',
  threshold: 25,
  success: 'chapter-01.door-open',
  failure: 'chapter-01.door-sealed'
})
```

Supported dice are D4, D6, D8, D10, D12, and D20. A dice outcome is stored in the decision log.

Opening a roll displays the dedicated dice terminal and types the die, base stat, luck, and threshold briefing. The player must then press **Roll** inside that terminal. The configured die shakes before the server rolls it, then the terminal types the color-coded result, total, and outcome calculation. The campaign remains on the dice node until the player presses **Close terminal**, so a result cannot be skipped accidentally.

## Neuro-Link Chat mod

The sidebar messenger is separate from face-to-face story `conversation` nodes. It represents a fictional neuro mod that lets players transmit messages over distance. It is not installed in a new campaign, so its sidebar control is hidden and the server rejects chat messages by default.

Install it through a story effect when the players acquire the mod:

```js
effects: [
  {
    type: 'install-mod',
    key: 'neuro-link-chat'
  }
]
```

Once installed, it remains available across separate scenes and minigames. The server keeps the most recent 200 messages in memory. Incoming messages show an unread badge and a short toast when the Neuro-Link panel is closed. Use a `remove-mod` effect with the same key to disable it again.

## Shared votes

Both players vote independently. If they agree, that option wins. If they disagree, the server randomly chooses between their two selections and records that the result was randomized.

```js
defineScene({
  id: 'chapter-01.vote',
  type: 'vote',
  audience: 'both',
  text: 'Which route should you take?',
  choices: [
    {
      id: 'tunnel',
      label: 'Use the tunnel',
      next: 'chapter-01.tunnel'
    },
    {
      id: 'street',
      label: 'Use the street',
      next: 'chapter-01.street'
    }
  ]
})
```

## Timed choices

Timed choices store their deadline on the server. The browser signals that the scene has finished typing before the countdown begins, so reading time is never deducted. A fallback is applied even if a browser is slow or stops responding. If `durationMs` is omitted, the countdown defaults to 20 seconds.

```js
defineScene({
  id: 'chapter-01.react',
  type: 'timed-choice',
  audience: 'p2',
  text: 'Something moves in the dark.',
  durationMs: 20000,
  fallbackChoiceId: 'freeze',
  choices: [
    {
      id: 'run',
      label: 'Run',
      next: 'chapter-01.run'
    },
    {
      id: 'freeze',
      label: 'Stay still',
      next: 'chapter-01.freeze'
    }
  ]
})
```

If no valid fallback ID exists, the engine chooses a random available option.

## Images and terminal presentation

An image node displays an asset before allowing progression.

```js
defineScene({
  id: 'chapter-01.safehouse',
  type: 'image',
  audience: 'both',
  text: 'The safehouse rises out of the neon haze.',
  src: '/safehouse.png',
  alt: 'A fortified safehouse in the Shades',
  next: 'chapter-01.enter-safehouse'
})
```

Place tracked runtime artwork in `public/`. The future visual builder will upload assets and store their IDs rather than requiring a developer to manage paths.

Per-node terminal themes are part of the planned builder schema but are not yet rendered by the current runtime.

## Music and sound effects

Put looping background music in `public/audio/music/` and one-shot effects in `public/audio/sounds/`. MP3 and OGG files are both suitable for browser playback.

A scene can change the current music and trigger a sound:

```js
defineScene({
  id: 'chapter-01.alarm',
  type: 'dialogue',
  audience: 'both',
  text: 'The facility alarm tears through the corridor.',
  music: '/audio/music/facility-escape.mp3',
  sound: '/audio/sounds/alarm-start.mp3',
  next: 'chapter-01.run'
})
```

- A `music` path replaces the current track and loops it.
- `music: null` stops the current music.
- Omitting `music` keeps the existing track playing.
- A `sound` path plays once when the scene begins.
- Music and sound volumes are independent, local to each browser, and persisted in `localStorage`.
- Music and sound effects are muted by default until the local player enables them.
- Playback failures caused by browser autoplay rules are ignored safely.

## Minigame nodes

The scene contract reserves `minigame` nodes:

```js
defineScene({
  id: 'chapter-01.netrunners',
  type: 'minigame',
  audience: 'both',
  minigameId: 'netrunners',
  resultNext: {
    completed: 'chapter-01.after-game',
    cancelled: 'chapter-01.after-cancel'
  }
})
```

The runtime waits until both players launch the node, opens NetRunners on both clients, and returns to the connected story destination when the players leave the completed game. New minigames must provide their own result IDs and server-owned completion handling.

## Typewriter configuration

The action is in `src/lib/actions/typewriter.ts`. It supports:

- General character delay.
- Comma, sentence, and paragraph delays.
- Per-character overrides.
- Instant completion.
- Cleanup when the scene changes.
- The operating system's reduced-motion setting.

Default profiles exist for dialogue, narration, and system text.

```ts
const dramaticTiming = {
  characterMs: 26,
  commaMs: 180,
  sentenceMs: 500,
  paragraphMs: 800,
  overrides: {
    '—': 350
  }
};
```

## Character records

Add public journal information to `src/lib/story/characters.ts`. Keep secret information out of the public summary. A character becomes visible after a `discover-character` effect adds its ID to the local player's `knownCharacters` array.

## Saves

The host stores versioned JSON files in `data/saves/`. The directory is created when the first save is written.

Save files contain:

- Current node for each player.
- Player names, stats, inventory, known characters, and effects.
- Story flags.
- Checkpoints, conversations, and votes.
- Transcript and decision history.

When the save schema changes, increment its version and add an explicit migration before accepting older data. Never silently reinterpret an older save.

The Save control is disabled until both players have selected the same cartridge. Loading a save embeds and activates its saved story version for both players.

## NetRunners

Single-player and multiplayer races now draw automatically every three seconds.

Multiplayer flow:

1. A player selects Multiplayer and joins the table.
2. The UI shows `1/2 PLAYERS` until the second client joins.
3. Both players select a faction and place a bet.
4. The server starts the race when both bets are locked.
5. The server draws one card every three seconds and broadcasts canonical state.
6. After the winner is settled, both players must choose Play Again for a rematch.
7. Either player choosing Main Menu returns both clients to the NetRunners menu.

Keep coded minigames behind stable IDs and explicit result contracts so the future story builder can list and launch them safely.

## Local development

Run the Socket.IO server:

```bash
pnpm server
```

Run Vite in another terminal:

```bash
pnpm dev
```

Open `http://localhost:5173`. Vite proxies Socket.IO to the game server on port `6912`.

For a production-style LAN build:

```bash
pnpm build
pnpm server
```

Open the host's LAN IP on two devices at port `6912`.

## Verification

Run the focused project checks after engine or story changes:

```bash
pnpm check
pnpm build
```

For multiplayer changes, verify with two separate browser profiles or devices. A third profile should receive only the Game is full screen.

## Coding standards

- Keep functions and components focused.
- Separate story data, game rules, networking, and rendering.
- Use clear names and explicit contracts.
- Leave space above explanatory comments.
- Keep CSS declarations on separate lines.
- Do not compress code into one-line blocks.
- Prefer reusable data and effects over scene-specific conditions.
- Preserve the NetRunners neon cyberpunk language across new runtime screens.
