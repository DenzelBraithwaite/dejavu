# Visual Story Builder Product Direction

## Product goal

Déjà Vu will become a visual engine for building and playing two-player terminal stories. A creator should be able to make a complete branching story without editing code, then playtest it with two terminals and publish it to a story library.

The existing campaign becomes one story built with the same tools available to other creators.

## Main product areas

### Story library

The story library lists drafts, published stories, shared projects, and recent playtests. A story owns its graph, terminal themes, assets, variables, character records, and supported minigames.

Creators can:

- Create, duplicate, rename, archive, import, and export a story.
- Open a draft in the visual editor.
- Validate and playtest a draft.
- Publish an immutable version.
- Continue editing a new draft without changing active play sessions.

Players can:

- Browse published stories.
- Host or join a two-player session.
- Resume compatible saves.
- See required minigames before starting.

### Minigame library

Minigames remain coded modules for the foreseeable future. The library exposes registered modules such as NetRunners with metadata, screenshots, configuration fields, supported player counts, and possible outcomes.

A story creator selects a minigame and configures a node rather than writing integration code. Every minigame must implement a stable contract:

```ts
type MinigameDefinition = {
  id: string;
  name: string;
  description: string;
  playerCount: 2;
  configurationSchema: object;
  resultIds: string[];
};
```

NetRunners could expose results such as `won`, `lost`, `cancelled`, and faction-specific outcomes.

## Visual editor

The editor is a directed graph.

- The canvas displays nodes and their connections.
- A palette creates dialogue, choice, checkpoint, conversation, dice, vote, timer, image, and minigame nodes.
- An inspector edits the selected node.
- Player 1 and Player 2 lanes make private scenes easy to distinguish.
- Shared nodes occupy the centre lane.
- Connection handles represent normal, choice, success, failure, timeout, vote, and minigame-result paths.
- A minimap and search help navigate large chapters.
- Chapters can be collapsed into subgraphs without changing runtime semantics.

The editor should not allow arbitrary executable code. Conditions and effects must come from validated schemas.

## Node editing

### Dialogue node

The inspector controls:

- Audience.
- Speaker.
- Text.
- Typewriter profile or custom timing.
- Continue label.
- Optional image, sound, and terminal theme.
- Next node.

### Choice node

The inspector adds and reorders options. Each option has a label, destination, conditions, and effects.

### Checkpoint node

The creator pairs Player 1 and Player 2 checkpoint nodes with one checkpoint key. The editor should visualize the pairing and warn when only one side exists.

### Conversation node

The creator sets the first speaker, message count, maximum message length, prompt text, and destination.

### Dice node

The creator selects a die, player stat, threshold, modifiers, success destination, and failure destination. A preview explains the calculation in plain language.

### Vote node

The creator adds options and chooses a disagreement policy:

- Random between player votes.
- Random among all options.
- Host breaks the tie.
- Route to a disagreement scene.

### Timer node

The creator selects duration, visible or hidden countdown, available choices, and timeout behaviour.

### Image node

The creator uploads or selects an asset, writes alternative text, selects its placement, and optionally changes the terminal background.

### Minigame node

The creator selects a registered minigame, completes its configuration form, and connects each possible result to a story node.

## Terminal designer

Stories have a default theme. Any node may override all or part of it for one or both players.

Configurable properties should include:

- Background and panel colours.
- Text, speaker, link, and status colours.
- Border style and glow strength.
- Font families from an approved list.
- Background image and overlay opacity.
- Typewriter profile.
- Prompt and cursor style.
- Optional character portrait placement.

The editor should show Player 1 and Player 2 previews side by side. Theme controls need accessible contrast warnings and a reduced-motion preview.

## Playtest mode

Playtest mode executes the saved draft through the same server runtime used by published stories.

Creators need:

- Two side-by-side local terminal previews.
- The ability to control either player.
- Current node IDs and state inspection.
- Pause and step controls.
- Jump-to-node for isolated testing.
- Simulated dice results and timeouts.
- A transcript and decision log.
- A clear return path to the selected node in the editor.

Developer shortcuts must be isolated from normal player sessions and never included in published state.

## Validation

Validation runs before playtest and publication.

Errors block publication:

- Duplicate node IDs.
- Missing start nodes.
- Connections to missing nodes.
- Choices without destinations.
- Dice nodes without success or failure paths.
- Checkpoints missing a player side.
- Minigame results without destinations.
- Invalid asset or character references.
- Cycles that cannot be exited when they were not explicitly marked as loops.

Warnings allow playtesting:

- Unreachable nodes.
- Endings without labels.
- Very long text.
- Missing alternative text.
- Low-contrast terminal themes.
- A player path that can advance far beyond its partner without a checkpoint.
- Saved variables that are never read.

## Storage model

Stories should be stored as versioned graph documents in a database. PostgreSQL with JSONB is a strong initial fit because core searchable metadata can remain relational while node graphs and theme configuration evolve as JSON.

Suggested entities:

- User.
- Story.
- Story draft.
- Published story version.
- Asset.
- Character definition.
- Minigame registration.
- Play session.
- Player session.
- Campaign save.
- Transcript entry.

Published versions should be immutable. A play session references the exact version it started with so later edits cannot corrupt an active campaign or save.

## Runtime boundary

The builder produces a serializable story document. The runtime consumes it. Neither layer should depend on the editor's component state.

```text
Visual editor
    ↓ validates and saves
Versioned story graph
    ↓ loaded by
Authoritative session runtime
    ↓ broadcasts
Player 1 terminal + Player 2 terminal
```

This boundary allows the current scene engine to become the execution layer for user-created stories.

## Security and trust

- Do not execute creator-provided JavaScript.
- Validate every node and effect on save and again when starting a session.
- Sanitize rich text and uploaded assets.
- Enforce asset type and size limits.
- Authorize draft editing separately from story play.
- Keep private drafts out of public search.
- Rate-limit public publishing, chat, and asset upload operations.
- Store moderation and ownership metadata for shared stories.

## Suggested delivery sequence

### Phase 1 Runtime contract

- Finalize serializable node schemas.
- Finish the minigame launch/result bridge.
- Add story-document loading instead of a compiled registry.
- Add full graph validation.

### Phase 2 Local visual editor

- Story library backed by local storage or local files.
- Flowchart canvas and node inspector.
- Dialogue, choice, checkpoint, conversation, dice, vote, timer, and image nodes.
- Side-by-side playtest mode.
- JSON import and export.

### Phase 3 Themes and assets

- Terminal theme designer.
- Asset library and image-node tooling.
- Character records and portraits.
- Accessibility validation.

### Phase 4 Database and accounts

- PostgreSQL story storage.
- Draft autosave and version history.
- Published immutable versions.
- Story discovery and ownership.
- Cloud campaign saves.

### Phase 5 Minigame ecosystem

- Formal minigame registry.
- NetRunners configuration and result routing.
- Screenshots and preview metadata.
- Additional coded minigames.

The first visual-builder milestone is successful when a non-developer can create a two-player branching terminal story, add a checkpoint and dice roll, playtest both perspectives, export it, and run it through the same authoritative LAN runtime.
