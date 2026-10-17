# Déjà Vu

Déjà Vu is a two-player terminal-story runtime and the foundation of a visual game builder. Players experience branching stories from separate browser terminals on the same LAN. Stories can mix private perspectives, shared decisions, free-form conversation, dice checks, synchronized checkpoints, timers, images, and coded minigames.

The current playable story is based on the RAID, Spoofs, ACPU, Rammers, Zog, Nova, and Avona material in the local `Notes/` directory. The notes are intentionally excluded from Git.

## Current direction

The long-term product has two connected modes:

- Build mode lets creators make stories as flowcharts without writing code.
- Play mode runs those story graphs as synchronized two-player terminal games.

Stories will live in a story library. Coded minigames will live in a minigame library and can be launched from story nodes. NetRunners is the first registered minigame concept.

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
- Ending nodes.
- A reserved minigame-node contract.

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

Each browser stores independent music and sound-effect mute and volume settings. Story scenes can start or stop looping music and trigger a one-shot sound. Audio assets live under `public/audio/music` and `public/audio/sounds`; the folders currently contain no playable assets.

### Bag, journal, characters, and saves

- The journal displays decisions and transcript entries.
- The bag displays inventory and known contacts.
- The character screen reads the server-owned local player record.
- Versioned JSON saves are stored by the LAN host in `data/saves/`.
- Loading a save restores the shared campaign for both clients.

### NetRunners

NetRunners retains its neon cyberpunk presentation.

- Single-player races draw automatically every three seconds.
- Multiplayer is available to the two connected game clients.
- The first multiplayer participant sees `1/2 PLAYERS` while waiting.
- Both players select factions and lock bets independently.
- The server starts the race after both bets are ready.
- The server draws cards every three seconds and broadcasts the race state.
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
- pnpm

## Project structure

```text
.
├── docs/
│   └── GAME_BUILDER_DIRECTION.md
├── public/                         Built client and tracked artwork
├── server/
│   ├── gameSession.js              Campaign rules and scene execution
│   └── netRunnersSession.js        Multiplayer NetRunners authority
├── src/
│   ├── lib/
│   │   ├── actions/typewriter.ts
│   │   ├── components/             Terminal, menus, and minigame UI
│   │   ├── stores/                 Browser projections of server state
│   │   └── story/
│   │       ├── chapters/           Serializable story data
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

The next major milestone is not more code-authored story content. It is a local visual editor that can create the same serializable nodes the runtime already executes.

The first builder milestone should let a non-developer:

1. Create a story.
2. Add separate Player 1 and Player 2 dialogue.
3. Connect nodes on a flowchart.
4. Add a checkpoint, choice, and dice check.
5. Configure terminal appearance.
6. Playtest both perspectives.
7. Export and run the story through the authoritative two-player runtime.
