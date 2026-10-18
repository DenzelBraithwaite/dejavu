# Déjà Vu

Déjà Vu is a one- or two-player terminal-story runtime and the foundation of a visual game builder. Players experience branching stories from browser terminals on the same LAN. Stories can mix private perspectives, shared decisions, free-form conversation, dice checks, synchronized checkpoints, timers, images, and coded minigames.

The current playable story is based on the RAID, Spoofs, ACPU, Rammers, Zog, Nova, and Avona material in the local `Notes/` directory. The notes are intentionally excluded from Git.

## Current direction

The long-term product has two connected modes:

- Build mode lets creators make stories as flowcharts without writing code.
- Play mode runs those story graphs as synchronized two-player terminal games.

Stories now live in a persistent local story library. Coded minigames live in a separate minigame library and can be launched from story nodes. The installed catalog includes NetRunners, Billywig, Pigz, TracerT, Packettack, Lo-Hi, Cipher, and Overclock.

Read the complete product direction in [Visual Story Builder Product Direction](docs/GAME_BUILDER_DIRECTION.md).

Developers working on the runtime should start with [Déjà Vu Runtime Developer Guide](DEVELOPER_README.md).

## Implemented runtime

### Two-player LAN sessions

- Exactly two gameplay slots.
- Per-tab session tokens for reconnecting to the same player slot while allowing two tabs to test both players.
- A dedicated Game is full screen for additional clients.
- A short reconnect grace period before an abandoned slot becomes available.
- Same-origin Socket.IO in production and a Vite development proxy.
- An optional Neuro-Link Chat mod that can enable long-distance player messaging across story scenes and minigames.

### Story cartridges and local builder

- Story Mode starts without a cartridge selected.
- The Library lists persistent story documents and shows each player's current cartridge.
- Solo cartridges launch for their selecting player. Multiplayer cartridges unlock when both players select the same story and mode.
- Selecting a different matching story starts a fresh shared campaign for that story.
- Stories are stored in `data/dejavu.sqlite`, so created stories survive server restarts.
- Déjà Vu is seeded as the first built-in story and can be edited or duplicated.
- Creators can create, read, edit, duplicate, and delete custom playable stories.
- The Editor is a dedicated sidebar destination, while every Library cartridge still links directly into it.
- The visual editor separates Player 1, shared, and Player 2 nodes and provides branch-aware insertion, previous/next click-to-connect routes, drag-and-drop organization, labels, validation, undo/redo, quick node actions, and a type-specific inspector.
- Inventory/effect and music/atmosphere changes are attached to main-flow nodes as visually offset companions. Image nodes are normal routed steps that display artwork inside the terminal.
- Story images can be uploaded as PNG, JPEG, WebP, GIF, AVIF, or SVG files up to 8 MB and are stored by the LAN host. The editor asset picker also lists compatible files copied directly into `public/uploads/stories/`.
- Stories may expose a solo map, a multiplayer map, or both. Disabling a mode preserves its nodes; the solo map greys out the Player 2 and Shared lanes.

### Server-authoritative campaign

The server owns the canonical campaign state. Browsers submit actions such as choosing an option, reaching a checkpoint, sending a message, or rolling dice. The server validates the action, changes state, and broadcasts the result.

The campaign state includes:

- Current node for each player.
- Player names, stats, status effects, inventory, and known characters.
- Story flags.
- Checkpoint arrivals.
- Conversation messages and active speaker.
- Votes and timed-choice deadlines.
- Transcript and decision history.

### Data-driven scene engine

The current scene contract supports:

- Dialogue.
- Choices.
- Player text input.
- Two-player checkpoints.
- Face-to-face conversations with a server-selected first speaker and per-player message quotas.
- D4, D6, D8, D10, D12, and D20 checks.
- Cooperative votes with random disagreement resolution.
- Server-owned timed choices.
- Story images.
- State effects for inventory, flags, stats, characters, and installed mods.
- Conditional branches based on inventory, flags, stats, and the previous dice result.
- Ending nodes.
- A generic minigame-node contract with completed and cancelled routes.

The Notes prologue has been converted into scene data with separate player perspectives, character naming, a dice check, timed choice, checkpoint, conversation, shared vote, and image scene. Chapter 1 currently ends at a placeholder because the notes contain its outline but not complete scene-level dialogue.

Completed output remains visible as the story advances. Scene authors explicitly choose when a destination clears the terminal by setting `clearTerminal: true`.

### Custom typewriter

The terminal uses a game-specific typewriter rather than `typed.js`. It supports:

- General character speed.
- Separate comma, sentence, and paragraph pauses.
- Per-character delay overrides.
- Instant completion.
- Cleanup when scenes change.
- Reduced-motion preferences.
- A completion callback that controls when interactions become available.

### Audio settings and scene audio

Each browser stores independent music and sound-effect mute and volume settings. Both channels start muted by default. Story scenes can start or stop looping music and trigger a one-shot sound. Audio assets live under `public/audio/music` and `public/audio/sounds`; the folders currently contain no playable assets.

### Character, journal, settings, and saves

- The journal displays decisions and transcript entries.
- The character screen displays stats, inventory, installed mods, and known contacts in one scrollable view.
- Save and load controls live beneath the local audio controls in Settings.
- Versioned JSON saves are stored by the LAN host in `data/saves/`.
- Loading a save restores the shared campaign for both clients.
- Saving is available only while both players have a matching active story.

### Minigame library

The Minigames sidebar destination presents coded modules separately from Story Mode. NetRunners, Billywig, Pigz, TracerT, Packettack, Lo-Hi, Cipher, and Overclock can be launched directly from this catalog or through a story minigame node. TracerT supports a local CPU opponent and a hidden-information LAN duel with persistent map clues and trackers. Packettack supports a two-player duel, a cooperative BLACK ICE breach, and a persistent card library for custom runner and boss programs. Cipher supports solo, competitive, and shared 15-attempt co-op codebreaking. Lo-Hi and Overclock support solo and synchronized LAN play. Story-launched sessions return through their configured finished or exited-early destination.

Every minigame uses the shared wager interface. A 0₭ wager is always valid and awards 100₭ on a win. Leaving a live game through the sidebar keeps its local or connected session mounted; the library changes that game's action to **Resume** until the player explicitly returns to its mode menu or the shared connection is severed.

Story cartridges can enable a solo map, a multiplayer map, or both. The editor only shows tabs for enabled maps and always keeps at least one mode active. Uploaded story images live in the shared image library and may be deleted there; referenced files produce a warning naming the affected stories before deletion is allowed.

Betting games accept a zero-credit wager. Winning a free round awards 100 credits; losing it costs nothing.

### NetRunners

NetRunners retains its neon cyberpunk presentation.

- Single-player races draw automatically every two seconds.
- Multiplayer is available to the two connected game clients.
- The first multiplayer participant sees `1/2 PLAYERS` while waiting.
- Both players select factions and lock bets independently.
- The server starts the race after both bets are ready.
- The server draws cards every two seconds and broadcasts the race state.
- A rematch starts only if both players agree.
- Either player declining returns both clients to the NetRunners menu.

## Visual direction

NetRunners is the primary reference for new interface work.

- Preserve the dark terminal surfaces, technical framing, neon accents, and cyberpunk display type.
- Use glow with restraint so long-form dialogue stays readable.
- Keep story images inside the terminal experience.
- Keep new screens related to the existing terminal, character, dice, and NetRunners interfaces.
- Maintain keyboard access, visible focus states, semantic controls, readable contrast, and reduced-motion behaviour.

## Artwork

Tracked runtime artwork in `public/` includes:

- A medieval audience chamber and animated torches.
- Six polyhedral dice and a dice-pattern background.
- Five neon animal/faction images.
- Five matching hacker avatars and one black SVG avatar.

The ignored `Notes/character_images/` directory contains additional character references for the current story world.

## Technology

- Svelte 4
- TypeScript and checked JavaScript
- Vite
- SCSS
- Express 5
- Socket.IO
- SQLite through Node's built-in `node:sqlite` module
- pnpm

## Project structure

```text
.
├── docs/
│   └── GAME_BUILDER_DIRECTION.md
├── public/                         Built client and tracked artwork
├── server/
│   ├── gameSession.js              Campaign rules and scene execution
│   ├── netRunnersSession.js        Multiplayer NetRunners authority
│   └── storyRepository.js          Persistent SQLite story CRUD
├── src/
│   ├── lib/
│   │   ├── actions/typewriter.ts
│   │   ├── components/             Terminal, menus, and minigame UI
│   │   ├── stores/                 Browser projections of server state
│   │   └── story/
│   │       ├── chapters/           Serializable story data
│   │       ├── dejaVuStory.js       Seeded built-in story document
│   │       ├── sceneTypes.js
│   │       └── storyRegistry.js
│   ├── routes/LogPage.svelte
│   ├── App.svelte
│   └── app.scss
├── DEVELOPER_README.md
├── server.js
└── vite.config.ts
```

## Development

Use Node.js 22.5 or newer. Story persistence uses the built-in `node:sqlite` module, so no external database package or service is required for local/LAN play.

Install dependencies:

```bash
pnpm install
```

Start the game server:

```bash
pnpm server
```

In a second terminal, start Vite:

```bash
pnpm dev
```

Open `http://localhost:5173`. Vite proxies Socket.IO to `http://localhost:6912`.

## LAN production-style run

Build the browser client into `public/`:

```bash
pnpm build
```

Start the server:

```bash
pnpm server
```

Open the host computer's LAN address on two devices:

```text
http://192.168.1.50:6912
```

The browser uses the same origin for Socket.IO, so the host's IP address no longer needs to be hard-coded in source.

## Commands

```bash
pnpm dev      # Vite development server on port 5173
pnpm server   # Express and Socket.IO server on port 6912
pnpm build    # Production client build copied into public/
pnpm preview  # Preview the Vite production build
pnpm check    # Svelte and TypeScript diagnostics
```

## Verification status

The current implementation passes:

- `pnpm check`
- `pnpm build`
- Node syntax checks for the server and session engines.
- A live three-client smoke test covering Player 1, Player 2, the Game is full response, multiplayer bets, and the first timed NetRunners draw.

Sass still prints deprecation notices for legacy APIs and older global colour helpers in existing NetRunners styles. They do not currently fail the build.

## Next product milestone

The local Library, persistent story documents, and interactive lane editor are now in place. The next builder milestone is deeper graph visualization and playtesting.

The first builder milestone should let a non-developer:

1. Draw curved route edges across distant nodes and add canvas zoom controls.
2. Validate missing destinations and unreachable nodes visually.
3. Configure terminal appearance per story and node.
4. Playtest both perspectives beside the graph.
5. Add asset import and selection.
6. Export and import portable story cartridges.
