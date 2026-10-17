# Déjà Vu Runtime Developer Guide

This guide explains how the current two-player terminal-story runtime is structured and how to extend it. The long-term product direction is a visual story builder, so scene data must remain serializable, explicit, and independent from Svelte components.

See [GAME_BUILDER_DIRECTION.md](docs/GAME_BUILDER_DIRECTION.md) for the planned no-code editor.

## Runtime model

The runtime has three layers:

1. Story data defines nodes, choices, branches, and effects.
2. The server owns the current campaign state and validates player actions.
3. The browser renders the active node and sends player intentions to the server.

Do not add chapter-specific socket events or progression switches. If an interaction can be represented by an existing scene type, add data. Add engine code only for a genuinely new type of interaction.

## Important files

```text
src/lib/story/sceneTypes.js          Scene contract and registry helpers
src/lib/story/storyRegistry.js       All registered story scenes
src/lib/story/chapters/prologue.js   Current playable story data
src/lib/actions/typewriter.ts        Custom punctuation-aware typewriter
src/lib/components/Terminal.svelte   Generic scene renderer
server/gameSession.js                Authoritative scene execution
server/netRunnersSession.js          Authoritative multiplayer minigame
server.js                            Sessions, sockets, saves, and static hosting
```

## Adding a chapter

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

Register the array in `storyRegistry.js`:

```js
import { chapterOneScenes } from './chapters/chapterOne.js';

export const storyRegistry = createSceneRegistry([
  ...prologueScenes,
  ...chapterOneScenes
]);
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

Conversation nodes alternate between players. The server prevents the waiting player from sending and advances both players after the configured number of messages.

```js
defineScene({
  id: 'chapter-01.private-chat',
  type: 'conversation',
  audience: 'both',
  text: 'You have a moment to speak privately.',
  messageCount: 6,
  firstPlayer: 'p2',
  next: 'chapter-01.chat-finished'
})
```

`messageCount` counts individual messages, not pairs of replies.

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

Timed choices store their deadline on the server. A fallback is applied even if a browser is slow or stops responding.

```js
defineScene({
  id: 'chapter-01.react',
  type: 'timed-choice',
  audience: 'p2',
  text: 'Something moves in the dark.',
  durationMs: 8000,
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
