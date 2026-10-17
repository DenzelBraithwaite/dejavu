# Déjà Vu

Déjà Vu is a story-first, two-player LAN game presented through a fake terminal in the browser. Both players experience the same cooperative campaign from their own terminals, sometimes acting independently and sometimes synchronizing for conversations, decisions, votes, dice rolls, and minigames.

The current project is a working prototype. It establishes the terminal aesthetic, a two-client Socket.IO connection, the beginning of the campaign, polyhedral dice checks, a character screen, and the NetRunners betting minigame. The next major goal is to turn the chapter-specific prototype logic into reusable, data-driven story building blocks.

## Game direction

The finished game is intended to support exactly two human players on the same local network.

The campaign will be assembled from reusable scene types:

- Narrated or character dialogue shown with an artificial typing effect.
- Independent choices, where each player progresses through their own scene.
- Synchronized checkpoints, where an early player waits for their partner.
- Cooperative choices and votes, with a random fallback if the players disagree.
- Timed choices and actions.
- Turn-based player-to-player conversations with a fixed number of messages.
- Dice checks using D4, D6, D8, D10, D12, or D20 dice and player stats.
- Images and scene backgrounds displayed at story-controlled moments.
- Minigames that can be entered from the campaign and return a result to it.
- A bag/menu containing inventory, known characters, past decisions, and conversation history.
- Lightweight saves keyed to a player or campaign identity.

Story content should eventually be authored as data rather than implemented as a new component or `switch` branch for every scene. Adding a chapter should primarily mean writing dialogue and configuring existing scene types.

## Visual direction

NetRunners is the main visual reference for future components. New work should remain consistent with its neon cyberpunk atmosphere and with the project's other fake-terminal screens.

- Preserve the terminal-first interface, dark surfaces, technical framing, and monospace presentation.
- Reuse the established neon faction colours, glows, borders, cards, avatars, and cyberpunk display type where appropriate.
- Keep story text readable; decorative effects should support the terminal fantasy rather than compete with long dialogue.
- Treat images as moments inside the terminal experience, not as a separate visual language.
- Keep new screens visually related to the existing terminal, character, dice, and NetRunners interfaces.
- Maintain keyboard access, clear focus states, semantic controls, and readable contrast.

## Current features

### Main terminal campaign

- A lobby/tutorial sequence with player naming and synchronization points.
- The beginning of Chapter 1.
- Typed terminal dialogue using `typed.js`.
- Up to three dialogue buttons and an optional text input.
- Alternating player-to-player dialogue over Socket.IO.
- Character-specific dialogue and player names.
- A story-controlled background image during Chapter 1.

### Lightweight RPG systems

- Two predefined player characters.
- Stats for muscles, toughness, speed, stealth, smarts, ocuware, cred, luck, and hacking.
- D4, D6, D8, D10, D12, and D20 models.
- Dice checks calculated from a die roll, a relevant stat, luck, and a target threshold.
- A character screen that displays the local character's stats.
- Initial inventory and status-effect fields in the player model.

### NetRunners minigame

NetRunners is a neon betting/racing card game. Players bet on a faction colour, then draw cards until one colour reaches seven points. Lane cards alter the odds and potential payout.

The current implementation includes:

- Five factions/colours.
- Random lane cards and displayed odds.
- Betting, computer opponents, race progress, payouts, and round reset logic.
- Single-player gameplay.
- A multiplayer selector, although multiplayer minigame logic is not yet complete.

### LAN networking

- An Express and Socket.IO server listening on all network interfaces.
- A maximum of two accepted gameplay connections.
- Assignment of the two connected sockets to player slots.
- Events for lobby readiness, names, terminal input, and the current Chapter 1 conversation.

The current protocol is a proof of concept. Several socket events are named after exact chapter parts, so the server and client must be generalized before many more chapters are added.

## Technology

- Svelte 4
- TypeScript
- Vite
- SCSS
- Express 5
- Socket.IO
- `typed.js`
- pnpm

This is a Vite single-page application rather than a SvelteKit application. The production build is copied into `public/`, which is served by `server.js`.

## Project structure

```text
.
├── public/                         # Built client and game artwork
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   ├── Terminal.svelte    # Main campaign terminal and controls
│   │   │   ├── DiceTerminal.svelte
│   │   │   ├── CharacterMenu.svelte
│   │   │   ├── NetRunners.svelte
│   │   │   └── Sidebar.svelte
│   │   ├── stores/
│   │   │   ├── terminalMessages.ts # Current story text and transitions
│   │   │   ├── gameState.ts
│   │   │   ├── players.ts
│   │   │   ├── dice.ts
│   │   │   └── netRunnersGameState.ts
│   │   └── socket.ts               # Socket.IO client connection
│   ├── routes/LogPage.svelte       # Main screen composition
│   ├── App.svelte
│   └── app.scss
├── server.js                       # LAN web and Socket.IO server
├── package.json
└── vite.config.ts
```

## Artwork

The repository includes artwork for:

- A medieval audience chamber and animated torches.
- Six polyhedral dice plus a dice-pattern background.
- Five neon animal/faction images.
- Five matching hacker avatars and one black SVG avatar.

Most images are in `public/` and are referenced directly by Svelte component styles. New story images can follow this same approach, although a scene definition should eventually declare which image or background to show so image changes do not require new component logic.

## Running the current prototype

Install dependencies:

```bash
pnpm install
```

Build the browser client into `public/`:

```bash
pnpm build
```

Start the LAN server:

```bash
node server.js
```

The server listens on port `6912`. Open the host computer's LAN address on two devices, for example:

```text
http://192.168.1.50:6912
```

Before using another host or network, update the hard-coded Socket.IO address in `src/lib/socket.ts`, rebuild, and restart the server. This should be replaced with a same-origin connection so the game works without editing source code when the LAN address changes.

Vite's development server is also configured for port `6912`, so it cannot run beside the Socket.IO server on the same machine without changing one of the ports. The build-and-serve flow above most closely matches the current setup.

## Available commands

```bash
pnpm dev      # Start the Vite development server
pnpm build    # Build and copy the client into public/
pnpm preview  # Preview the Vite build
pnpm check    # Run Svelte and TypeScript diagnostics
```

## Current technical state

The visual prototype and game flow are useful foundations, but the project is not yet ready for large-scale chapter authoring.

- `terminalMessages.ts` contains both long-form story content and progression logic.
- Chapter transitions and several network events are hard-coded to exact chapter/part names.
- Important game state is client-owned, while a cooperative game needs a server-authoritative shared session.
- The ready-player count is tracked in each browser and inferred from broadcasts rather than stored as a room/checkpoint state on the server.
- Text input is broadcast on every input event instead of being submitted as a completed message.
- A third connection is not explicitly rejected with a useful status screen.
- Reconnection can assign the wrong character, as noted by an existing source comment.
- The dialogue log store exists but is not populated or displayed as a history screen.
- Save/load, inventory UI, known-character records, votes, timers, and reusable image scenes are not implemented yet.
- NetRunners is a large self-contained component and its multiplayer mode remains unfinished.

At the time of this README update, `pnpm check` reports five existing TypeScript errors and three warnings. The errors concern invalid default `Player` values, a dice-stat type mismatch, and a possibly missing NetRunners winner. The warnings concern unused CSS. Sass also reports deprecations for its legacy API and global colour helpers.

## Planned architecture

Development should proceed in small vertical slices while preserving the existing terminal presentation.

### 1. Stabilize the two-player session

Create a server-owned game room with exactly two player slots. Give each player a stable session token so reconnecting restores the same role. Explicitly represent lobby states such as waiting, ready, active, disconnected, and resumable.

The browser should send player intents—such as selecting an option or submitting a message—and the server should validate the intent, update canonical state, and broadcast the result.

### 2. Introduce a data-driven scene model

Define a discriminated TypeScript union for reusable nodes such as:

```ts
type SceneNode =
  | DialogueNode
  | ChoiceNode
  | CheckpointNode
  | ConversationNode
  | VoteNode
  | DiceCheckNode
  | TimedActionNode
  | ImageNode
  | MinigameNode;
```

Each node should have a stable ID, presentation data, available actions, and explicit next-node IDs. Conditions and effects should be data—such as setting a flag, adding an item, or recording a choice—rather than custom component code.

Chapters can then be separate content modules:

```text
src/lib/story/
├── chapters/
│   ├── prologue.ts
│   └── chapter-01.ts
├── sceneTypes.ts
└── storyRegistry.ts
```

### 3. Build one reusable scene runner

A scene runner should:

- Read the current node.
- Render the matching terminal interaction.
- Enforce which player may act.
- Send actions to the server.
- Apply synchronized results from the server.
- Record transcript and decision-log entries.
- Advance only when the node's completion rule is satisfied.

This removes the need for chapter-specific socket listeners and large progression switches.

### 4. Replace `typed.js` with a game-specific typewriter

The typewriter should be a small reusable service or Svelte action with configurable timing:

```ts
type TypewriterTiming = {
  characterMs: number;
  commaMs: number;
  sentenceMs: number;
  paragraphMs: number;
  overrides?: Record<string, number>;
};
```

It should support pause, resume, instant completion, cleanup when scenes change, accessible reduced-motion behaviour, and a completion event that enables controls. It should render structured dialogue safely rather than depending on large HTML strings.

### 5. Add scene types incrementally

A practical order is:

1. Standard dialogue and independent choices.
2. Server-owned checkpoints.
3. Fixed-turn player conversations.
4. Dice checks with success and failure branches.
5. Shared votes and disagreement fallback.
6. Timed actions.
7. Image and background scenes.
8. Minigame entry/exit contracts.

Each slice should be demonstrated by converting a small part of the existing lobby or Chapter 1 before converting the rest.

### 6. Add journal, bag, and saves

Keep separate records for:

- The full terminal transcript.
- Important decisions and vote outcomes.
- Known characters and unlocked notes.
- Inventory and currencies.
- Chapter position, flags, and player stats.

A versioned JSON save file is a better initial fit than CSV because the state is nested and will evolve. A save can still be lightweight and portable. Save migration can be added when the schema changes.

## Development standards

New code should be easy for a person to read and maintain.

- Make the smallest clean change that delivers the current behaviour.
- Prefer small, focused components and functions with descriptive names.
- Keep story data separate from rendering, networking, and game-engine logic.
- Use explicit TypeScript types for scene contracts and network messages.
- Put visual rules on separate lines; do not compress CSS into one-line rulesets.
- Use whitespace to separate logical sections, including space above explanatory comments.
- Comment intent and non-obvious rules rather than narrating self-explanatory syntax.
- Match existing project patterns unless a deliberate architectural improvement is part of the task.
- Use focused checks appropriate to the risk of the change.

## Definition of a reusable chapter

The architecture is succeeding when a new chapter can be added without editing the scene runner, socket event list, or terminal component. A chapter author should only need to:

1. Add dialogue and scene-node data.
2. Reference existing assets or add new ones.
3. Select reusable interactions and configure their arguments.
4. Connect success, failure, choice, and synchronization branches by node ID.

New engine code should only be necessary when the game introduces a genuinely new kind of interaction.
