<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { applySceneAudio, unlockAudioPlayback } from '../audio/audioManager';
  import { clamp } from '../helpers';
  import { socket } from '../socket';
  import {
    characterLibraryState,
    type CharacterExpression,
    type CharacterRecord
  } from '../stores/characters';
  import {
    editorHandoff,
    libraryState,
    type AudioAsset,
    type StoryDocument,
    type StoryNode
  } from '../stores/library';
  import location from '../stores/location';
  import { campaignState } from '../stores/campaign';
  import { sessionState, type PlayerId } from '../stores/session';

  type EditorMode = 'library' | 'create' | 'editor';
  type LaneId = 'p1' | 'both' | 'p2';
  type StoryPlayMode = 'singleplayer' | 'multiplayer';
  type LinkSelection = {
    sourceId: string;
    field?: string;
    label: string;
    direction: 'attachment' | 'incoming' | 'outgoing';
  };
  type InsertionTarget = {
    lane: LaneId;
    sourceId?: string;
    field?: string;
    insertAfterId?: string;
    companionOnly?: boolean;
  };
  type LaneGraphLevel = {
    depth: number;
    nodes: StoryNode[];
  };
  type LaneGraph = {
    levels: LaneGraphLevel[];
    maxColumns: number;
    columnWidth: number;
  };

  type EditorSnapshot = {
    story: StoryDocument;
    selectedNodeId: string;
    activeLane: LaneId;
  };

  type TutorialNode = {
    name: string;
    type: string;
    description: string;
    usage: string;
  };

  type TutorialSection = {
    title: string;
    description: string;
    nodes: TutorialNode[];
  };

  const flowNodeTypes = [
    { type: 'dialogue', label: 'Dialogue' },
    { type: 'input', label: 'Player input' },
    { type: 'choice', label: 'Choice' },
    { type: 'checkpoint', label: 'Checkpoint' },
    { type: 'conversation', label: 'Open floor' },
    { type: 'dice-check', label: 'Dice' },
    { type: 'vote', label: 'Shared vote' },
    { type: 'condition', label: 'Condition' },
    { type: 'clear-terminal', label: 'Clear terminal' },
    { type: 'change-character', label: 'Change character' },
    { type: 'image', label: 'Image' },
    { type: 'minigame', label: 'Minigame' },
    { type: 'ending', label: 'Ending' }
  ];

  const companionNodeTypes = [
    { type: 'item-effect', label: 'Item' },
    { type: 'story-flag', label: 'Story flag' },
    { type: 'player-state', label: 'Player state' },
    { type: 'label', label: 'Visual label' },
    { type: 'note', label: 'Note' },
    { type: 'audio', label: 'Audio' },
    { type: 'stop-audio', label: 'Stop audio' },
    { type: 'screen-effect', label: 'Terminal effect' }
  ];

  const nodeTypes = [...flowNodeTypes, ...companionNodeTypes];

  // Keep the guide catalog beside the palette so every added node has a matching explanation.
  const tutorialNodeSections: TutorialSection[] = [
    {
      title: 'Dialogue and player input',
      description: 'Present story text, collect a written response, or open a direct player conversation.',
      nodes: [
        {
          name: 'Dialogue',
          type: 'dialogue',
          description: 'Displays typed story text with an optional character, expression, or custom speaker.',
          usage: 'Write the dialogue, select its speaker and expression, then connect Next. Enable Timed to force a scene-length wait; its visible countdown can be hidden for a natural pause.'
        },
        {
          name: 'Player input',
          type: 'input',
          description: 'Collects a free-form response without changing the player character.',
          usage: 'Enable Store response when the answer matters later. Give it a key, then insert that value in future text or use Player state → Set player name to create a session-only custom name.'
        },
        {
          name: 'Open floor',
          type: 'conversation',
          description: 'Runs a turn-based, face-to-face text conversation between the two players.',
          usage: 'Choose the first speaker and each player’s turn count, then connect the shared Next route.'
        }
      ]
    },
    {
      title: 'Branches and rules',
      description: 'Split the story through buttons, timers, dice, votes, or stored campaign state.',
      nodes: [
        {
          name: 'Choice',
          type: 'choice',
          description: 'Shows two to five labelled buttons with optional timing, locks, and remembered decisions.',
          usage: 'Set labels and destinations, optionally enable a visible or hidden timer, and mark the decision Minor or Major when future conditions should remember it.'
        },
        {
          name: 'Dice',
          type: 'dice-check',
          description: 'Rolls a selected die against a character stat and target value.',
          usage: 'Choose the die, stat, and target, then connect both Success and Failure. In multiplayer, a private-lane Dice node can let the other player spectate when reached from a Shared Vote.'
        },
        {
          name: 'Condition',
          type: 'condition',
          description: 'Immediately routes by campaign state, a remembered decision, or which multiplayer role is playing.',
          usage: 'Select the rule and connect both True and False. A Playing as condition can split a Shared route back into Player 1 and Player 2 lanes.'
        },
        {
          name: 'Shared vote',
          type: 'vote',
          description: 'Collects a button choice from both players and resolves the shared result.',
          usage: 'Create two to five options and connect every enabled result. Use it only on the Shared lane.'
        }
      ]
    },
    {
      title: 'Media',
      description: 'Change the atmosphere, show visual content, or launch a coded game.',
      nodes: [
        {
          name: 'Audio',
          type: 'audio',
          description: 'Plays layered music or a sound effect without stopping existing audio.',
          usage: 'Choose Music or Sound, select a library file, then configure volume, looping, fades, and an optional playback segment.'
        },
        {
          name: 'Image',
          type: 'image',
          description: 'Displays uploaded artwork as a routed step inside the terminal.',
          usage: 'Select and position an image, write its Log text for the cartridge log, and connect Next.'
        },
        {
          name: 'Minigame',
          type: 'minigame',
          description: 'Launches a registered coded minigame from the story.',
          usage: 'Choose the game and connect both Finished Game and Exited Early destinations.'
        }
      ]
    },
    {
      title: 'Effects',
      description: 'Attach state changes or terminal presentation effects to another story node.',
      nodes: [
        {
          name: 'Item',
          type: 'item-effect',
          description: 'Gives a named item to the player or removes one from their Bag.',
          usage: 'Choose Give or Remove, enter the player-facing item name, optionally add artwork, and customize the terminal announcement.'
        },
        {
          name: 'Story flag',
          type: 'story-flag',
          description: 'Stores a named value that conditions can check later in the cartridge.',
          usage: 'Use a stable Flag ID such as has_gone_to_shop and set its value. A later Condition can compare that flag.'
        },
        {
          name: 'Player state',
          type: 'player-state',
          description: 'Changes the active player’s name, stats, relationships, known characters, or multiplayer mods.',
          usage: 'Choose one focused operation. Stat changes use a positive amount to add or a negative amount to subtract.'
        },
        {
          name: 'Terminal effect',
          type: 'screen-effect',
          description: 'Changes terminal color or applies animated presentation effects when its host becomes active.',
          usage: 'Choose a color, shake, blink, mirror, spin, glow, or scan effect, configure it, then attach it.'
        }
      ]
    },
    {
      title: 'Special nodes',
      description: 'Use compact utility markers to synchronize, clear, organize, or end a path.',
      nodes: [
        {
          name: 'Checkpoint',
          type: 'checkpoint',
          description: 'Stops one player until both players reach the same checkpoint key.',
          usage: 'Place matching checkpoint nodes on both player lanes, give them the same key, and connect Next.'
        },
        {
          name: 'Clear terminal',
          type: 'clear-terminal',
          description: 'Clears all terminal text and images before immediately continuing.',
          usage: 'Place it in the route exactly where the old terminal history should disappear, then connect Next.'
        },
        {
          name: 'Stop audio',
          type: 'stop-audio',
          description: 'Stops music, sound effects, or both without adding another story step.',
          usage: 'Choose the audio categories, optional music IDs/layers, and fade-out time, then attach it.'
        },
        {
          name: 'Change character',
          type: 'change-character',
          description: 'Changes the character identity and stats used by the current player for the rest of the session.',
          usage: 'Choose another story character or reset to the player’s default main character, then connect Next.'
        },
        {
          name: 'Visual label',
          type: 'label',
          description: 'Adds a heading or note to organize the editor canvas without affecting play.',
          usage: 'Attach it to a nearby host node and write a useful chapter or section title. Labels never receive story routes or appear during play.'
        },
        {
          name: 'Note',
          type: 'note',
          description: 'Stores longer author notes beside a story node without appearing during play.',
          usage: 'Attach it to a host node and record context, reminders, or implementation details for other authors.'
        },
        {
          name: 'Ending',
          type: 'ending',
          description: 'Marks the final destination of a playable route.',
          usage: 'Write the closing terminal text. Ending nodes intentionally have no outgoing route.'
        }
      ]
    }
  ];

  // Surface missing handbook entries immediately when the palette gains another node.
  const documentedNodeTypes = new Set(
    tutorialNodeSections.flatMap((section) => {
      return section.nodes.map((node) => {
        return node.type;
      });
    })
  );
  const undocumentedNodeTypes = nodeTypes.filter((nodeType) => {
    return !documentedNodeTypes.has(nodeType.type);
  });

  const lanes: Array<{ id: LaneId; label: string }> = [
    { id: 'p1', label: 'PLAYER 1' },
    { id: 'both', label: 'SHARED' },
    { id: 'p2', label: 'PLAYER 2' }
  ];
  const minimumMapZoom = 0.5;
  const maximumMapZoom = 1.5;
  const mapZoomStep = 0.1;
  const minimumInspectorWidth = 280;
  const maximumInspectorWidth = 720;
  const terminalThemes = ['blue', 'red', 'purple', 'green', 'amber', 'pink', 'cyan', 'white'];
  const characterStats = [
    'muscles',
    'toughness',
    'speed',
    'stealth',
    'smarts',
    'ocuware',
    'cred',
    'luck',
    'hacking'
  ];
  const minigamesWithDraws = new Set([
    'billywig',
    'lo-hi',
    'firewall-auction',
    'drone-relay'
  ]);
  const relationshipLevelOptions = [
    { value: -5, label: 'Hostile' },
    { value: -3, label: 'Wary' },
    { value: 0, label: 'Neutral' },
    { value: 3, label: 'Friendly' },
    { value: 5, label: 'Loyal' }
  ];
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

  let mode: EditorMode = 'library';
  let newTitle = '';
  let newDescription = '';
  let newAuthor = '';
  let newProtected = false;
  let newPlayModes = {
    singleplayer: true,
    multiplayer: false
  };
  let newMainCharacterIds = {
    singleplayer: '',
    multiplayer: {
      p1: '',
      p2: ''
    }
  };
  let activeStoryMap: StoryPlayMode = 'multiplayer';
  let editingStory: StoryDocument | null = null;
  let selectedNodeId = '';
  let selectedNode: any = null;
  let statusMessage = '';
  let errorMessage = '';
  let deleteArmedId = '';
  let activeLane: LaneId = 'p1';
  let insertionTarget: InsertionTarget | null = null;
  let linkSelection: LinkSelection | null = null;
  let copiedNode: StoryNode | null = null;
  let storyRevision = 0;
  let undoStack: EditorSnapshot[] = [];
  let redoStack: EditorSnapshot[] = [];
  let tutorialOpen = false;
  let imageUploading = false;
  let imageLibraryOpen = false;
  let imageLibraryTarget: 'portrait' | 'image' | 'item' = 'image';
  let storyImages: string[] = [];
  let audioLibraryOpen = false;
  let audioLibraryTarget: 'music' | 'sound' = 'music';
  let audioAssets: AudioAsset[] = [];
  let pendingAssetDeletion: {
    path: string;
    references: Array<{ id: string; title: string }>;
  } | null = null;
  let toastTimer: number | undefined;
  let lastToastKey = '';
  let lastLocation = '';
  let nodeSearch = '';
  let recentNodeTypes: string[] = [];
  let playtestWarningOpen = false;
  let saveInFlight = false;
  let savePulse = false;
  let lastSavedStoryKey = '';
  let autosaveTimer: number | undefined;
  let savePulseTimer: number | undefined;
  let inspectorElement: HTMLElement;
  let flowCanvasElement: HTMLElement;
  let editorLockStoryId = '';
  let inspectorExpanded = false;
  let inspectorWidth = 340;
  let inspectorResizeStartX = 0;
  let inspectorResizeStartWidth = 340;
  let isResizingInspector = false;
  let mapZoom = 1;
  let mobileToolbarCollapsed = false;
  let playableCharacters: CharacterRecord[] = [];
  let speakerCharacters: CharacterRecord[] = [];
  let seatPickerStoryId = '';
  let partnerSeatPickerOpen = false;
  let storedInputNodes: StoryNode[] = [];
  let rememberedChoiceOptions: Array<{
    key: string;
    label: string;
  }> = [];
  let knownStoryItems: string[] = [];
  let knownStoryFlags: string[] = [];
  let storySettingsOpen = false;
  let unprotectConfirmationOpen = false;
  let relationshipSettingsPlayer: PlayerId = 'p1';

  function openTutorial(): void {
    tutorialOpen = true;
  }

  function closeTutorial(): void {
    tutorialOpen = false;
  }

  function openStorySettings(): void {
    if (!editingStory?.playModes.multiplayer) {
      relationshipSettingsPlayer = 'p1';
    }

    storySettingsOpen = true;
    unprotectConfirmationOpen = false;
  }

  function closeStorySettings(): void {
    storySettingsOpen = false;
    unprotectConfirmationOpen = false;
  }

  function requestProtectionChange(checked: boolean): void {
    if (!editingStory) {
      return;
    }

    if (editingStory.protected && !checked) {
      unprotectConfirmationOpen = true;
      return;
    }

    editingStory.protected = checked;
    refreshStory();
  }

  function confirmUnprotectStory(): void {
    if (!editingStory) {
      return;
    }

    editingStory.protected = false;
    unprotectConfirmationOpen = false;
    refreshStory();
  }

  function openExpandedInspector(node: StoryNode): void {
    linkSelection = null;
    selectedNodeId = node.id;
    activeLane = (node.audience ?? 'both') as LaneId;
    errorMessage = '';
    inspectorExpanded = true;

    tick().then(() => {
      inspectorElement
        ?.querySelector<HTMLElement>('.inspector-scroll-content')
        ?.scrollTo({ top: 0 });
    });
  }

  function closeExpandedInspector(): void {
    inspectorExpanded = false;
  }

  function adjustMapZoom(delta: number): void {
    const nextZoom = clamp(mapZoom + delta, minimumMapZoom, maximumMapZoom);
    mapZoom = Number(nextZoom.toFixed(1));
  }

  function resetMapZoom(): void {
    mapZoom = 1;
  }

  function beginInspectorResize(event: PointerEvent): void {
    if (inspectorExpanded || window.innerWidth <= 800) {
      return;
    }

    event.preventDefault();
    inspectorResizeStartX = event.clientX;
    inspectorResizeStartWidth = inspectorWidth;
    isResizingInspector = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', resizeInspector);
    window.addEventListener('pointerup', finishInspectorResize);
  }

  function resizeInspector(event: PointerEvent): void {
    if (!isResizingInspector) {
      return;
    }

    const requestedWidth = inspectorResizeStartWidth + inspectorResizeStartX - event.clientX;
    const viewportMaximum = Math.max(minimumInspectorWidth, window.innerWidth * 0.65);
    inspectorWidth = Math.round(Math.min(
      maximumInspectorWidth,
      viewportMaximum,
      Math.max(minimumInspectorWidth, requestedWidth)
    ));
  }

  function finishInspectorResize(): void {
    isResizingInspector = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('pointermove', resizeInspector);
    window.removeEventListener('pointerup', finishInspectorResize);
  }

  function handleInspectorResizeKey(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const delta = event.key === 'ArrowLeft' ? 20 : -20;
    inspectorWidth = clamp(
      inspectorWidth + delta,
      minimumInspectorWidth,
      maximumInspectorWidth
    );
  }

  onMount(() => {

    // Autosave only emits when the editable document has diverged from the last server response.
    autosaveTimer = window.setInterval(() => {
      if ($location === 'editor' && editingStory && storyContentKey(editingStory) !== lastSavedStoryKey) {
        saveStory('auto');
      }
    }, 120_000);
  });

  $: playerId = $sessionState.playerId;
  $: playableCharacters = $characterLibraryState.characters.filter(
    (character) => character.type === 'playable'
  );
  $: speakerCharacters = $characterLibraryState.characters.filter(
    (character) => character.type !== 'account'
  );
  $: storedInputNodes = editingStory?.nodes.filter(
    (node) => node.type === 'input' && node.saveInput !== false && node.inputKey
  ) ?? [];
  $: rememberedChoiceOptions = editingStory?.nodes.flatMap((node) => (
    node.type === 'choice' && ['minor', 'major'].includes(node.decisionSeverity ?? 'none')
      ? (node.choices ?? []).map((choice) => ({
          key: `${node.id}:${choice.id}`,
          label: `${displayNodeName(node)} → ${choice.label}`
        }))
      : []
  )) ?? [];
  $: knownStoryItems = [...new Set(
    editingStory?.nodes
      .filter((node) => node.type === 'item-effect')
      .map((node) => String(node.effects?.[0]?.key ?? '').trim())
      .filter(Boolean) ?? []
  )].sort((left, right) => left.localeCompare(right));
  $: knownStoryFlags = [...new Set(
    editingStory?.nodes
      .filter((node) => node.type === 'story-flag')
      .map((node) => String(node.effects?.[0]?.key ?? '').trim())
      .filter(Boolean) ?? []
  )].sort((left, right) => left.localeCompare(right));
  $: partnerId = (playerId === 'p1' ? 'p2' : 'p1') as PlayerId;
  $: localSelection = playerId
    ? $libraryState.selections[playerId]
    : null;
  $: localSelectionMode = playerId
    ? $libraryState.selectionModes[playerId]
    : null;
  $: partnerSelection = partnerId
    ? $libraryState.selections[partnerId]
    : null;
  $: localStorySeat = playerId
    ? (Object.entries($libraryState.seatClaims).find(
        ([, ownerId]) => ownerId === playerId
      )?.[0] as PlayerId | undefined) ?? null
    : null;
  $: selectedNode = editingStory?.nodes.find(
    (node) => node.id === selectedNodeId
  ) ?? null;
  $: newStoryHasCharacters = (
    !newPlayModes.singleplayer
      || Boolean(newMainCharacterIds.singleplayer)
  ) && (
    !newPlayModes.multiplayer
      || (
        Boolean(newMainCharacterIds.multiplayer.p1)
        && Boolean(newMainCharacterIds.multiplayer.p2)
        && newMainCharacterIds.multiplayer.p1 !== newMainCharacterIds.multiplayer.p2
      )
  );
  $: if ($location !== lastLocation) {
    lastLocation = $location;

    if ($location === 'library') {
      mode = 'library';
    } else if ($location === 'editor' && mode === 'library') {
      mode = 'editor';
    }
  }
  $: if ($location !== 'editor' && editorLockStoryId) {
    socket.emit('library:release-story');
    editorLockStoryId = '';
    editingStory = null;
  }
  $: if ($location === 'editor' && $editorHandoff) {
    const handoff = $editorHandoff;
    editorHandoff.set(null);
    openEditor(handoff.storyId, handoff.nodeId, handoff.map);
  }
  $: {
    const toastKey = `${statusMessage}|${errorMessage}`;

    if (toastKey !== lastToastKey) {
      lastToastKey = toastKey;
      window.clearTimeout(toastTimer);

      if (statusMessage || errorMessage) {
        toastTimer = window.setTimeout(clearMessages, 4200);
      }
    }
  }

  onDestroy(() => {
    window.clearTimeout(toastTimer);
    window.clearTimeout(savePulseTimer);
    window.clearInterval(autosaveTimer);
    finishInspectorResize();
    socket.emit('library:release-story');
    editorLockStoryId = '';
  });

  function storyTitle(storyId: string | null): string {
    if (!storyId) {
      return 'No cartridge selected';
    }

    return $libraryState.stories.find((story) => story.id === storyId)?.title
      ?? storyId;
  }

  function setNewStoryMode(map: StoryPlayMode, enabled: boolean): void {
    newPlayModes = {
      ...newPlayModes,
      [map]: enabled
    };

    if (!newPlayModes.singleplayer && !newPlayModes.multiplayer) {
      newPlayModes = {
        ...newPlayModes,
        [map === 'singleplayer' ? 'multiplayer' : 'singleplayer']: true
      };
    }
  }

  function newStoryStarterDescription(): string {
    if (newPlayModes.singleplayer && newPlayModes.multiplayer) {
      return 'A singleplayer opening and separate Player 1 and Player 2 multiplayer openings will be created automatically.';
    }

    if (newPlayModes.singleplayer) {
      return 'A singleplayer opening and starter graph will be created automatically.';
    }

    return 'Separate Player 1 and Player 2 multiplayer openings will be created automatically.';
  }

  function clearMessages(): void {
    statusMessage = '';
    errorMessage = '';
  }

  function characterExpressionImage(
    character: CharacterRecord,
    expression: unknown
  ): string {
    const normalizedExpression = String(expression ?? 'normal') as CharacterExpression;
    return character.images[normalizedExpression] ?? '';
  }

  function characterExpressionPosition(
    character: CharacterRecord,
    expression: unknown
  ): { x: number; y: number } {
    const normalizedExpression = String(expression ?? 'normal') as CharacterExpression;
    return character.imagePositions[normalizedExpression] ?? { x: 50, y: 50 };
  }

  function openCreateStory(): void {
    mode = 'create';
    location.set('editor');
  }

  function showEditorHome(): void {
    if (editingStory) {
      socket.emit('library:release-story');
    }

    editorLockStoryId = '';
    editingStory = null;
    selectedNodeId = '';
    inspectorExpanded = false;
    mode = 'editor';
    location.set('editor');
  }

  function showEditor(): void {
    mode = 'editor';
    location.set('editor');
  }

  async function scrollSelectedNodeIntoView(): Promise<void> {
    await tick();

    if (!flowCanvasElement || !selectedNodeId) {
      return;
    }

    const escapedNodeId = window.CSS?.escape
      ? window.CSS.escape(selectedNodeId)
      : selectedNodeId.replace(/["\\]/g, '\\$&');
    const selectedElement = flowCanvasElement.querySelector<HTMLElement>(
      `[data-node-id="${escapedNodeId}"]`
    );

    selectedElement?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'center'
    });
  }

  function closeStoryEditor(): void {
    showEditorHome();
  }

  function selectStory(
    storyId: string | null,
    mode: StoryPlayMode,
    seat?: PlayerId
  ): void {
    clearMessages();
    unlockAudioPlayback();
    socket.emit('library:select-story', {
      storyId,
      mode,
      seat
    }, (result: { ok: boolean; error?: string }) => {
      if (result.ok) {
        statusMessage = storyId
          ? 'Cartridge inserted and ready to play.'
          : 'Cartridge and multiplayer seat deselected.';
        seatPickerStoryId = '';
        partnerSeatPickerOpen = false;
      } else {
        errorMessage = result.error ?? 'The cartridge could not be selected.';
      }
    });
  }

  function storySeatClaimedByOther(seat: PlayerId): boolean {
    const ownerId = $libraryState.seatClaims[seat];

    return Boolean(ownerId && ownerId !== playerId);
  }

  function openSeatPicker(storyId: string): void {
    seatPickerStoryId = seatPickerStoryId === storyId ? '' : storyId;
  }

  function matchPartnerCartridge(): void {
    if (!partnerSelection) {
      return;
    }

    const partnerMode = partnerId
      ? $libraryState.selectionModes[partnerId]
      : null;

    if (partnerMode) {
      if (partnerMode === 'multiplayer') {
        partnerSeatPickerOpen = !partnerSeatPickerOpen;
        seatPickerStoryId = '';
      } else {
        selectStory(partnerSelection, partnerMode);
      }
    }
  }

  function createStory(): void {
    clearMessages();
    socket.emit('library:create-story', {
      title: newTitle,
      description: newDescription,
      author: newAuthor,
      protected: newProtected,
      playModes: newPlayModes,
      mainCharacterIds: newMainCharacterIds,
      characterIds: [
        newMainCharacterIds.singleplayer,
        newMainCharacterIds.multiplayer.p1,
        newMainCharacterIds.multiplayer.p2
      ].filter(Boolean)
    }, (result: {
      ok: boolean;
      story?: StoryDocument;
      error?: string;
    }) => {
      if (!result.ok || !result.story) {
        errorMessage = result.error ?? 'Could not create the story.';
        return;
      }

      newTitle = '';
      newDescription = '';
      newAuthor = '';
      newProtected = false;
      newPlayModes = {
        singleplayer: true,
        multiplayer: false
      };
      newMainCharacterIds = {
        singleplayer: '',
        multiplayer: {
          p1: '',
          p2: ''
        }
      };
      editingStory = prepareStoryForEditor(result.story);
      inspectorExpanded = false;
      editorLockStoryId = result.story.id;
      activeStoryMap = editingStory.playModes.singleplayer
        ? 'singleplayer'
        : 'multiplayer';
      selectedNodeId = activeStoryMap === 'singleplayer'
        ? result.story.singleplayerInitialSceneId
        : result.story.initialSceneIds.p1;
      activeLane = 'p1';
      lastSavedStoryKey = storyContentKey(editingStory);
      resetHistory();
      showEditor();
      statusMessage = 'Story created in the host library.';
    });
  }

  function openEditor(
    storyId: string,
    preferredNodeId = '',
    preferredMap?: StoryPlayMode
  ): void {
    clearMessages();
    socket.emit('library:get-story', storyId, (result: {
      ok: boolean;
      story?: StoryDocument;
      error?: string;
    }) => {
      if (!result.ok || !result.story) {
        errorMessage = result.error ?? 'Could not load the story editor.';
        return;
      }

      editingStory = prepareStoryForEditor(result.story);
      inspectorExpanded = false;
      editorLockStoryId = result.story.id;
      activeStoryMap = preferredMap && editingStory.playModes[preferredMap]
        ? preferredMap
        : editingStory.playModes.multiplayer === false
          ? 'singleplayer'
          : 'multiplayer';
      const fallbackNodeId = activeStoryMap === 'singleplayer'
        ? editingStory.singleplayerInitialSceneId
        : editingStory.initialSceneIds.p1;
      selectedNodeId = editingStory.nodes.some((node) => node.id === preferredNodeId)
        ? preferredNodeId
        : editingStory.nodes.some((node) => node.id === fallbackNodeId)
          ? fallbackNodeId
          : editingStory.nodes.find((node) => nodeMap(node) === activeStoryMap)?.id ?? '';
      const preferredNode = editingStory.nodes.find((node) => node.id === selectedNodeId);
      activeLane = (preferredNode?.audience ?? 'p1') as LaneId;
      lastSavedStoryKey = storyContentKey(editingStory);
      resetHistory();
      showEditor();
      void scrollSelectedNodeIntoView();
    });
  }

  function storyContentKey(story: StoryDocument): string {

    // Server-managed version increments should never make a freshly saved story look dirty.
    return JSON.stringify({
      ...story,
      version: 0
    });
  }

  function saveStory(source: 'manual' | 'auto' = 'manual', afterSave?: () => void): void {
    if (!editingStory || saveInFlight) {
      return;
    }

    clearMessages();
    synchronizeStoryCharacterIds();
    const submittedStory = structuredClone(editingStory);
    const submittedKey = storyContentKey(submittedStory);
    const selectedBeforeSave = selectedNodeId;
    saveInFlight = true;
    socket.emit('library:update-story', {
      storyId: submittedStory.id,
      story: submittedStory
    }, (result: {
      ok: boolean;
      story?: StoryDocument;
      error?: string;
    }) => {
      if (!result.ok || !result.story) {
        errorMessage = result.error ?? 'Could not save the story.';
        saveInFlight = false;
        return;
      }

      const changedDuringSave = Boolean(
        editingStory && storyContentKey(editingStory) !== submittedKey
      );
      lastSavedStoryKey = submittedKey;

      if (editingStory && !changedDuringSave) {
        editingStory = prepareStoryForEditor(result.story);
        selectedNodeId = editingStory.nodes.some((node) => node.id === selectedBeforeSave)
          ? selectedBeforeSave
          : selectedNodeId;

        if (source === 'manual') {
          resetHistory();
        }
      } else if (editingStory) {

        // Preserve edits made while the save request was in flight; the next interval will save them.
        editingStory.version = result.story.version;
      }

      saveInFlight = false;
      pulseSavedTerminal();
      statusMessage = source === 'auto'
        ? `Autosaved version ${result.story.version}.`
        : `Saved version ${result.story.version}.`;

      if (afterSave && changedDuringSave) {
        saveStory(source, afterSave);
        return;
      }

      afterSave?.();
    });
  }

  function pulseSavedTerminal(): void {
    savePulse = false;
    window.clearTimeout(savePulseTimer);
    requestAnimationFrame(() => {
      savePulse = true;
      savePulseTimer = window.setTimeout(() => {
        savePulse = false;
      }, 900);
    });
  }

  function requestPlaytest(): void {
    if (!editingStory) {
      return;
    }

    const startIssue = storyStartIssue(editingStory);

    if (startIssue) {
      errorMessage = `Unavailable: ${startIssue}`;
      return;
    }

    if (activeStoryMap === 'multiplayer' && !localStorySeat) {
      errorMessage = 'Choose Player 1 or Player 2 from the Library before playtesting a multiplayer map.';
      return;
    }

    if ($libraryState.activeStoryId && $libraryState.activeStoryId !== editingStory.id) {
      playtestWarningOpen = true;
      return;
    }

    startPlaytest();
  }

  function startPlaytest(): void {
    if (!editingStory) {
      return;
    }

    unlockAudioPlayback();
    primePlaytestAudio();

    const launch = (): void => {
      if ($libraryState.activeStoryId === editingStory?.id
        && $libraryState.activeStoryMode === activeStoryMap) {
        playtestWarningOpen = false;
        location.set('terminal');
        return;
      }

      socket.emit('library:select-story', {
        storyId: editingStory?.id,
        mode: activeStoryMap,
        seat: activeStoryMap === 'multiplayer' ? localStorySeat : undefined
      }, (result: { ok: boolean; error?: string }) => {
        if (!result.ok) {
          errorMessage = result.error ?? 'Could not stage the playtest.';
          return;
        }

        playtestWarningOpen = false;
        location.set('terminal');
      });
    };

    // Playtesting always waits for a confirmed server save, even when the local
    // document appears unchanged, so the cartridge can never launch stale data.
    saveStory('manual', launch);
  }

  function primePlaytestAudio(): void {
    if (!editingStory) {
      return;
    }

    const playerId = $sessionState.playerId ?? 'p1';
    const resumeSceneId = $campaignState?.story?.id === editingStory.id
      && $campaignState.sessionMode === activeStoryMap
      ? $campaignState.currentScene[playerId]
      : activeStoryMap === 'singleplayer'
        ? editingStory.singleplayerInitialSceneId
        : editingStory.initialSceneIds[playerId];
    const scene = editingStory.nodes.find((candidate) => candidate.id === resumeSceneId);

    if (!scene) {
      return;
    }

    const audioCues = [
      scene,
      ...editingStory.nodes.filter((candidate) => candidate.attachedTo === scene.id)
    ].filter((candidate) => (
      Boolean(candidate.music)
      || Boolean(candidate.sound)
      || Boolean(candidate.stopMusic)
      || Boolean(candidate.stopSounds)
      || ['stop-music', 'stop-audio'].includes(candidate.type)
    ));

    // Start the real scene track inside the Play-button gesture. The terminal
    // recognizes the same track ID and lets it continue after the save finishes.
    applySceneAudio(audioCues);
  }

  function synchronizeStoryCharacterIds(): void {
    if (!editingStory) {
      return;
    }

    const characterIds = [
      editingStory.mainCharacterIds.singleplayer,
      editingStory.mainCharacterIds.multiplayer.p1,
      editingStory.mainCharacterIds.multiplayer.p2,
      ...editingStory.relationships.map((relationship) => (
        relationship.characterId === 'other-player'
          ? null
          : relationship.characterId
      )),
      ...editingStory.nodes.map((node) => node.characterId)
    ].filter((characterId): characterId is string => Boolean(characterId));

    editingStory.characterIds = [...new Set(characterIds)];
  }

  function prepareStoryForEditor(story: StoryDocument): StoryDocument {
    const prepared = structuredClone(story);
    prepared.playModes ??= {
      singleplayer: false,
      multiplayer: true
    };
    prepared.mainCharacterIds ??= {
      singleplayer: null,
      multiplayer: {
        p1: null,
        p2: null
      }
    };
    prepared.characterIds ??= [];
    prepared.relationships = (prepared.relationships ?? []).flatMap((relationship) => {
      if (relationship.playerId) {
        return [relationship];
      }

      return [
        {
          ...relationship,
          playerId: 'p1' as PlayerId
        },
        {
          ...relationship,
          playerId: 'p2' as PlayerId
        }
      ];
    });
    prepared.protected ??= false;
    prepared.unavailableReason ??= '';
    prepared.singleplayerInitialSceneId ??= '';
    prepared.initialSceneIds ??= {
      p1: '',
      p2: ''
    };
    prepared.multiplayerStartMode ??= prepared.initialSceneIds.p1
      && prepared.initialSceneIds.p1 === prepared.initialSceneIds.p2
      ? 'shared'
      : 'separate';

    for (const imageNode of prepared.nodes.filter(
      (node) => node.type === 'image' && node.attachedTo
    )) {
      const host = prepared.nodes.find((node) => node.id === imageNode.attachedTo);

      if (host && supportsSimpleNext(host)) {
        imageNode.map = host.map;
        imageNode.audience = host.audience;
        imageNode.next = host.next ?? '';
        host.next = imageNode.id;
      }

      delete imageNode.attachedTo;
    }

    for (const node of prepared.nodes) {
      delete node.clearTerminal;

      if (node.map === 'singleplayer') {
        node.audience = 'p1';
      }

      if (node.type === 'label') {
        node.attachedTo ??= '';
      }

      if (node.type === 'background') {
        node.type = 'screen-effect';
        node.screenEffect = 'color';
        node.backgroundTheme ??= terminalThemes.includes(String(node.background))
          ? node.background as StoryNode['backgroundTheme']
          : 'blue';
      }

      if (node.type === 'music') {
        node.type = 'audio';
        node.audioKind = 'music';
      }

      if (node.type === 'sound-effect') {
        node.type = 'audio';
        node.audioKind = 'sound';
      }

      if (node.type === 'stop-music') {
        node.type = 'stop-audio';
        node.stopMusic = true;
      }

      // Older cartridges stored every state mutation in one generic effect node.
      // Keep their data intact while presenting each responsibility separately.
      if (node.type === 'effect') {
        const legacyEffectType = String(node.effects?.[0]?.type ?? 'add-item');

        if (['add-item', 'remove-item'].includes(legacyEffectType)) {
          node.type = 'item-effect';
        } else if (legacyEffectType === 'set-flag') {
          node.type = 'story-flag';
        } else {
          node.type = 'player-state';
        }
      }

      if (node.type === 'item-effect') {
        const itemOperation = String(node.effects?.[0]?.type ?? 'add-item');
        const legacyText = String(node.text ?? '').trim();

        node.announcementTemplate ??= legacyText && legacyText !== 'You acquired a new item.'
          ? legacyText
          : itemOperation === 'remove-item'
            ? 'Removed item: <ITEM>.'
            : 'Acquired item: <ITEM>.';
        node.text = undefined;
      }

      if (node.type === 'image') {
        node.text ??= '';
        node.imagePositionX ??= 50;
        node.imagePositionY ??= 50;
        node.logText ??= node.alt ?? '';
        node.imageBorderColor ??= '#1472bf';
      }

      if (node.type === 'dialogue') {
        node.continueLabel ??= 'Continue';
        node.showCountdown ??= true;
      }

      if (['choice', 'vote', 'timed-choice'].includes(node.type)) {
        if (node.type === 'timed-choice') {
          node.type = 'choice';
          node.timed = true;
        }

        node.showCountdown ??= true;
        node.choices ??= [];

        while (node.choices.length < 2) {
          const optionNumber = node.choices.length + 1;

          node.choices.push({
            id: `option-${optionNumber}`,
            label: `Option ${optionNumber}`,
            next: ''
          });
        }

        for (const choice of node.choices) {
          delete (choice as typeof choice & { playerMode?: string }).playerMode;
        }

        const enabledFallback = node.choices.find((choice) => !choice.disabled);

        if (node.type === 'choice' && node.timed
          && !node.choices.some(
            (choice) => choice.id === node.fallbackChoiceId && !choice.disabled
          )) {
          node.fallbackChoiceId = enabledFallback?.id ?? node.choices[0].id;
        }
      }

      if (node.type === 'dice-check') {
        node.spectatorRoll ??= false;
      }

      if (node.type === 'screen-effect') {
        node.effectDurationSeconds ??= node.screenEffect === 'blink' ? 0.75 : 0.6;
        node.effectIterations ??= 1;
        node.effectLoop ??= false;
        node.mirrorAxis ??= 'horizontal';
        node.spinDirection ??= 'clockwise';
        node.effectColor ??= '#39ff88';
        node.scanDirection ??= 'left-to-right';
      }

      if (node.type === 'input') {
        node.saveInput ??= true;
      }

      if (node.type === 'choice') {
        node.decisionSeverity ??= 'none';
      }

      if (node.type === 'label') {
        node.text = String(node.text ?? '').slice(0, 60);
      }

      if (node.type === 'note') {
        node.text = String(node.text ?? '').slice(0, 5000);
      }

      if (nodeHasButtons(node)) {
        node.hoverEffectsEnabled ??= false;
        node.hoverBackgroundColor ??= '#02fbfb';
        node.hoverTextColor ??= '#07111d';
        node.hoverText ??= '';
      }

      if (node.type === 'minigame') {
        const legacyDestination = node.resultNext?.completed ?? '';
        node.resultNext ??= {};
        node.resultNext.won ??= legacyDestination;
        node.resultNext.lost ??= legacyDestination;
        node.resultNext.cancelled ??= '';

        if (minigamesWithDraws.has(String(node.minigameId))) {
          node.resultNext.draw ??= legacyDestination;
        }

        delete node.resultNext.completed;
      }

      if (node.type === 'audio') {
        node.audioKind ??= node.sound ? 'sound' : 'music';
        node.audioId ??= `${node.id}.audio`;
        node.audioLayer ??= 1;
        node.audioLoop ??= node.audioKind === 'music';
        node.audioVolume ??= 1;
        node.fadeInSeconds ??= 0;
        node.fadeOutSeconds ??= 0;
        node.audioRangeMode ??= 'full';
        node.audioStartSeconds ??= 0;
        node.audioStopSeconds ??= 0;
      }

      if (node.type === 'stop-audio') {
        node.stopMusic ??= true;
        node.stopMusicIds ??= [];
        node.stopMusicLayers ??= [];
        node.stopSounds ??= false;
        node.fadeOutSeconds ??= 0;
      }
    }

    // Labels became companion annotations. Attach legacy labels to the nearest
    // preceding playable node when possible, while leaving isolated labels visibly invalid.
    for (const [index, label] of prepared.nodes.entries()) {
      if (label.type !== 'label' || label.attachedTo) {
        continue;
      }

      const nearbyHost = prepared.nodes.slice(0, index).reverse().find((candidate) => (
        nodeMap(candidate) === nodeMap(label)
        && candidate.audience === label.audience
        && !isCompanionNodeType(candidate.type)
      ));

      label.attachedTo = nearbyHost?.id ?? '';
    }

    return prepared;
  }

  function duplicateStory(storyId: string): void {
    clearMessages();
    socket.emit('library:duplicate-story', storyId, handleSimpleResult(
      'Story duplicated as a new draft.'
    ));
  }

  function deleteStory(storyId: string): void {
    if (deleteArmedId !== storyId) {
      deleteArmedId = storyId;
      return;
    }

    clearMessages();
    socket.emit('library:delete-story', storyId, (result: {
      ok: boolean;
      error?: string;
    }) => {
      deleteArmedId = '';

      if (result.ok) {
        statusMessage = 'Story deleted from the host library.';
      } else {
        errorMessage = result.error ?? 'Could not delete the story.';
      }
    });
  }

  function openNodePicker(target: InsertionTarget): void {
    activeLane = target.lane;
    insertionTarget = target;
    linkSelection = null;
    nodeSearch = '';
  }

  function openCompanionPicker(host: StoryNode): void {
    openNodePicker({
      lane: (host.audience ?? 'both') as LaneId,
      sourceId: host.id,
      insertAfterId: host.id,
      companionOnly: true
    });
  }

  function setScreenEffectType(event: Event): void {
    if (!editingStory || !selectedNode || selectedNode.type !== 'screen-effect') {
      return;
    }

    const select = event.currentTarget as HTMLSelectElement;
    const requestedEffect = select.value as StoryNode['screenEffect'];
    const duplicate = editingStory.nodes.some((candidate) => (
      candidate.id !== selectedNode.id
      && candidate.type === 'screen-effect'
      && candidate.attachedTo === selectedNode.attachedTo
      && candidate.screenEffect === requestedEffect
    ));

    if (duplicate) {
      select.value = String(selectedNode.screenEffect ?? 'shake');
      errorMessage = 'That host already has this terminal effect. Choose a different effect to stack.';
      return;
    }

    selectedNode.screenEffect = requestedEffect;

    if (requestedEffect === 'glow') {
      selectedNode.effectLoop = true;
    } else if (requestedEffect === 'color') {
      selectedNode.effectLoop = false;
      selectedNode.backgroundTheme ??= 'blue';
    }

    refreshStory();
  }

  function nodeAvailableForMap(type: string): boolean {
    const modeAllowsNode = activeStoryMap !== 'singleplayer'
      || !['checkpoint', 'conversation', 'vote'].includes(type);
    const targetAllowsNode = !insertionTarget?.companionOnly
      || isCompanionNodeType(type);

    return modeAllowsNode && targetAllowsNode;
  }

  function nodeMatchesSearch(node: TutorialNode, searchValue: string): boolean {
    const query = searchValue.trim().toLowerCase();

    return !query || [node.name, node.type, node.description, node.usage]
      .some((value) => value.toLowerCase().includes(query));
  }

  function nodeDefinition(type: string): TutorialNode | undefined {
    return tutorialNodeSections
      .flatMap((section) => section.nodes)
      .find((node) => node.type === type);
  }

  function recentNodeDefinitions(): TutorialNode[] {
    return recentNodeTypes
      .map(nodeDefinition)
      .filter((node): node is TutorialNode => Boolean(node))
      .filter((node) => nodeAvailableForMap(node.type));
  }

  function nodeShapeClass(type: string, isStart = false): string {
    let shapeClass = 'node-shape-process';

    if (type === 'ending') {
      shapeClass = 'node-shape-ending';
    } else if (['choice', 'timed-choice', 'vote', 'dice-check', 'condition'].includes(type)) {
      shapeClass = 'node-shape-branch';
    } else if (['dialogue', 'input', 'conversation'].includes(type)) {
      shapeClass = 'node-shape-dialogue';
    } else if (type === 'checkpoint') {
      shapeClass = 'node-shape-checkpoint';
    } else if (['clear-terminal', 'stop-audio', 'change-character'].includes(type)) {
      shapeClass = 'node-shape-clear';
    } else if (['label', 'note'].includes(type)) {
      shapeClass = 'node-shape-label';
    } else if (['ambience', 'audio'].includes(type)) {
      shapeClass = 'node-shape-audio';
    } else if (type === 'image') {
      shapeClass = 'node-shape-image';
    } else if (type === 'minigame') {
      shapeClass = 'node-shape-minigame';
    } else if (['item-effect', 'story-flag', 'player-state', 'screen-effect'].includes(type)) {
      shapeClass = 'node-shape-effect';
    }

    return isStart
      ? `${shapeClass} node-is-start`
      : shapeClass;
  }

  function isMultiplayerNodeType(type: string): boolean {
    return ['checkpoint', 'conversation', 'vote'].includes(type);
  }

  function isCompanionNodeType(type: string): boolean {
    return type === 'ambience'
      || companionNodeTypes.some((nodeType) => nodeType.type === type);
  }

  function isCompactSpecialNode(node: StoryNode): boolean {
    return ['checkpoint', 'clear-terminal', 'stop-audio', 'change-character', 'label', 'note', 'ending'].includes(node.type);
  }

  function compactNodeTitle(node: StoryNode): string {
    const titles: Record<string, string> = {
      checkpoint: 'CHECKPOINT',
      'clear-terminal': 'CLEAR',
      'stop-audio': 'STOP AUDIO',
      'change-character': 'CHANGE CHARACTER',
      ending: 'END'
    };

    if (node.type === 'label') {
      return String(node.text || 'UNTITLED LABEL').slice(0, 28).toUpperCase();
    }

    if (node.type === 'note') {
      return 'NOTE';
    }

    return titles[node.type] ?? nodeTypeName(node.type).toUpperCase();
  }

  function nodeIsStart(node: StoryNode): boolean {
    if (!editingStory) {
      return false;
    }

    return editingStory.singleplayerInitialSceneId === node.id
      || Object.values(editingStory.initialSceneIds).includes(node.id);
  }

  function startNodeLabel(node: StoryNode): string {
    if (!editingStory) {
      return '';
    }

    if (editingStory.singleplayerInitialSceneId === node.id) {
      return 'SOLO START';
    }

    const isPlayerOneStart = editingStory.initialSceneIds.p1 === node.id;
    const isPlayerTwoStart = editingStory.initialSceneIds.p2 === node.id;

    if (isPlayerOneStart && isPlayerTwoStart) {
      return 'SHARED START';
    }

    if (isPlayerOneStart) {
      return 'PLAYER 1 START';
    }

    return isPlayerTwoStart ? 'PLAYER 2 START' : '';
  }

  function eligibleStartNodes(audience: LaneId): StoryNode[] {
    return editingStory?.nodes.filter((node) => (
      nodeMap(node) === activeStoryMap
      && node.audience === audience
      && playableStartNodeTypes.has(node.type)
      && !isCompanionNodeType(node.type)
    )) ?? [];
  }

  function setMultiplayerStartMode(mode: 'shared' | 'separate'): void {
    if (!editingStory) {
      return;
    }

    rememberForUndo();
    editingStory.multiplayerStartMode = mode;

    if (mode === 'shared') {
      const sharedNode = eligibleStartNodes('both')[0];
      editingStory.initialSceneIds.p1 = sharedNode?.id ?? '';
      editingStory.initialSceneIds.p2 = sharedNode?.id ?? '';
    } else if (editingStory.initialSceneIds.p1 === editingStory.initialSceneIds.p2) {
      editingStory.initialSceneIds.p1 = eligibleStartNodes('p1')[0]?.id ?? '';
      editingStory.initialSceneIds.p2 = eligibleStartNodes('p2')[0]?.id ?? '';
    }

    refreshStory();
  }

  function setSharedStart(nodeId: string): void {
    if (!editingStory) {
      return;
    }

    editingStory.initialSceneIds.p1 = nodeId;
    editingStory.initialSceneIds.p2 = nodeId;
    refreshStory();
  }

  function storyStartIssue(story: StoryDocument): string {
    const nodesById = new Map(story.nodes.map((node) => [node.id, node]));

    if (story.playModes.singleplayer
      && !startNodeIsValid(nodesById.get(story.singleplayerInitialSceneId), 'singleplayer', 'p1')) {
      return 'Single-player start is missing or invalid.';
    }

    if (!story.playModes.multiplayer) {
      return '';
    }

    if (story.multiplayerStartMode === 'shared') {
      const sharedStart = story.initialSceneIds.p1 === story.initialSceneIds.p2
        ? nodesById.get(story.initialSceneIds.p1)
        : undefined;

      return startNodeIsValid(sharedStart, 'multiplayer', 'both')
        ? ''
        : 'Shared start is missing or invalid.';
    }

    if (!startNodeIsValid(nodesById.get(story.initialSceneIds.p1), 'multiplayer', 'p1')) {
      return 'Player 1 start is missing or invalid.';
    }

    return startNodeIsValid(nodesById.get(story.initialSceneIds.p2), 'multiplayer', 'p2')
      ? ''
      : 'Player 2 start is missing or invalid.';
  }

  function startNodeIsValid(
    node: StoryNode | undefined,
    map: StoryPlayMode,
    audience: LaneId
  ): boolean {
    return Boolean(
      node
      && nodeMap(node) === map
      && node.audience === audience
      && playableStartNodeTypes.has(node.type)
      && !isCompanionNodeType(node.type)
    );
  }

  function createSnapshot(): EditorSnapshot | null {
    if (!editingStory) {
      return null;
    }

    return {
      story: structuredClone(editingStory),
      selectedNodeId,
      activeLane
    };
  }

  function snapshotKey(snapshot: EditorSnapshot): string {
    return JSON.stringify(snapshot.story);
  }

  function rememberForUndo(): void {
    const snapshot = createSnapshot();

    if (!snapshot) {
      return;
    }

    const previous = undoStack.at(-1);

    if (!previous || snapshotKey(previous) !== snapshotKey(snapshot)) {
      undoStack = [...undoStack.slice(-99), snapshot];
    }

    redoStack = [];
  }

  function resetHistory(): void {
    undoStack = [];
    redoStack = [];
  }

  function applySnapshot(snapshot: EditorSnapshot): void {
    editingStory = structuredClone(snapshot.story);
    selectedNodeId = snapshot.selectedNodeId;
    activeLane = snapshot.activeLane;
    linkSelection = null;
    insertionTarget = null;
    storyRevision += 1;
  }

  function undo(): void {
    const previous = undoStack.at(-1);
    const current = createSnapshot();

    if (!previous || !current) {
      return;
    }

    redoStack = [...redoStack, current];
    undoStack = undoStack.slice(0, -1);
    applySnapshot(previous);
    statusMessage = 'Last editor change undone.';
  }

  function redo(): void {
    const next = redoStack.at(-1);
    const current = createSnapshot();

    if (!next || !current) {
      return;
    }

    undoStack = [...undoStack, current];
    redoStack = redoStack.slice(0, -1);
    applySnapshot(next);
    statusMessage = 'Editor change restored.';
  }

  function rememberFieldEdit(event: FocusEvent): void {
    const target = event.target;

    if (
      target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement
    ) {
      if (!target.disabled) {
        rememberForUndo();
      }
    }
  }

  function handleEditorShortcut(event: KeyboardEvent): void {
    if ($location === 'editor' && event.key === 'Escape' && inspectorExpanded) {
      event.preventDefault();
      closeExpandedInspector();
      return;
    }

    if (
      $location !== 'editor'
      || !(event.metaKey || event.ctrlKey)
      || event.key.toLowerCase() !== 'z'
    ) {
      return;
    }

    event.preventDefault();

    if (event.shiftKey) {
      redo();
    } else {
      undo();
    }
  }

  function closeNodePicker(): void {
    insertionTarget = null;
  }

  function addNode(type: string): void {
    if (!editingStory || !insertionTarget) {
      return;
    }

    const nodeId = createUniqueNodeId(type);
    const node = createNode(type, nodeId);

    if (insertionTarget.companionOnly && type === 'screen-effect') {
      const effectTypes: NonNullable<StoryNode['screenEffect']>[] = [
        'color',
        'shake',
        'blink',
        'mirror',
        'spin',
        'glow',
        'scan'
      ];
      const usedEffects = new Set(editingStory.nodes.filter((candidate) => (
        candidate.type === 'screen-effect'
        && candidate.attachedTo === insertionTarget?.sourceId
      )).map((candidate) => candidate.screenEffect));
      const availableEffect = effectTypes.find((effect) => !usedEffects.has(effect));

      if (!availableEffect) {
        errorMessage = 'That node already has every available terminal effect.';
        return;
      }

      node.screenEffect = availableEffect;
    }

    rememberForUndo();
    node.audience = insertionTarget.lane;
    node.map = activeStoryMap;

    insertNode(node, insertionTarget);
    connectInsertionTarget(node.id, insertionTarget);
    selectedNodeId = nodeId;
    recentNodeTypes = [type, ...recentNodeTypes.filter((item) => item !== type)].slice(0, 5);
    insertionTarget = null;
    refreshStory();
  }

  function pasteNode(): void {
    if (!copiedNode || !editingStory || !insertionTarget) {
      return;
    }

    if (insertionTarget.companionOnly && !isCompanionNode(copiedNode)) {
      errorMessage = 'Only companion nodes can be added from this shortcut.';
      return;
    }

    rememberForUndo();
    const node = structuredClone(copiedNode);
    node.id = createUniqueNodeId(node.type);
    node.audience = insertionTarget.lane;
    node.map = activeStoryMap;
    clearNodeRoutes(node);
    insertNode(node, insertionTarget);
    connectInsertionTarget(node.id, insertionTarget);
    selectedNodeId = node.id;
    insertionTarget = null;
    refreshStory();
  }

  function duplicateNode(node: StoryNode): void {
    copiedNode = structuredClone(node);
    openNodePicker({
      lane: (node.audience ?? 'both') as LaneId,
      insertAfterId: node.id
    });
    pasteNode();
  }

  function copyNode(node: StoryNode): void {
    copiedNode = structuredClone(node);
    selectedNodeId = node.id;
    statusMessage = `${displayNodeName(node)} copied.`;
  }

  function insertNode(node: StoryNode, target: InsertionTarget): void {
    if (!editingStory) {
      return;
    }

    const insertAfterIndex = target.insertAfterId
      ? editingStory.nodes.findIndex((candidate) => candidate.id === target.insertAfterId)
      : findLastLaneNodeIndex(target.lane);
    const insertionIndex = insertAfterIndex >= 0
      ? insertAfterIndex + 1
      : editingStory.nodes.length;

    editingStory.nodes.splice(insertionIndex, 0, node);
  }

  function connectInsertionTarget(nodeId: string, target: InsertionTarget): void {
    if (!editingStory) {
      return;
    }

    const insertedNode = editingStory.nodes.find((node) => node.id === nodeId);

    if (insertedNode && isCompanionNode(insertedNode)) {
      const requestedHost = editingStory.nodes.find(
        (node) => node.id === (target.sourceId ?? target.insertAfterId)
      );
      const host = requestedHost && isCompanionNode(requestedHost)
        ? editingStory.nodes.find((node) => node.id === requestedHost.attachedTo)
        : requestedHost;

      if (host && !isCompanionNode(host) && host.type !== 'label') {
        insertedNode.attachedTo = host.id;
      }

      return;
    }

    if (target.sourceId && target.field) {
      const source = editingStory.nodes.find((node) => node.id === target.sourceId);

      if (source) {
        setRouteValue(source, target.field, nodeId);
      }

      return;
    }

    const precedingNode = target.insertAfterId
      ? editingStory.nodes.find((node) => node.id === target.insertAfterId)
      : getLaneNodes(target.lane).filter((node) => node.id !== nodeId).at(-1);

    if (precedingNode && supportsSimpleNext(precedingNode) && !precedingNode.next) {
      precedingNode.next = nodeId;
    }
  }

  function createUniqueNodeId(type: string): string {
    if (!editingStory) {
      return type;
    }

    let nodeNumber = editingStory.nodes.length + 1;
    let nodeId = `${editingStory.id}.${type}.${nodeNumber}`;

    while (editingStory.nodes.some((node) => node.id === nodeId)) {
      nodeNumber += 1;
      nodeId = `${editingStory.id}.${type}.${nodeNumber}`;
    }

    return nodeId;
  }

  function findLastLaneNodeIndex(lane: LaneId): number {
    if (!editingStory) {
      return -1;
    }

    return editingStory.nodes.reduce(
      (lastIndex, node, index) => (node.audience ?? 'both') === lane ? index : lastIndex,
      -1
    );
  }

  function refreshStory(): void {
    if (editingStory) {
      editingStory = {
        ...editingStory,
        nodes: structuredClone(editingStory.nodes)
      };
      storyRevision += 1;
    }
  }

  function deleteSelectedNode(): void {
    if (!editingStory || !selectedNode) {
      return;
    }

    deleteNode(selectedNode);
  }

  function deleteNode(node: StoryNode): void {
    if (!editingStory) {
      return;
    }

    rememberForUndo();
    const replacementId = supportsSimpleNext(node) ? node.next ?? '' : '';

    for (const candidate of editingStory.nodes) {
      for (const field of allRouteFields(candidate)) {
        if (getRouteValue(candidate, field) === node.id) {
          // Branch slots belong to their specific option. Clearing the slot
          // restores its add button; reconnecting it silently changes meaning.
          const replacementForRoute = nodeHasBranches(candidate)
            ? ''
            : replacementId;
          setRouteValue(candidate, field, replacementForRoute);
        }
      }
    }

    for (const companion of editingStory.nodes.filter((candidate) => candidate.attachedTo === node.id)) {
      companion.attachedTo = '';
    }

    editingStory.nodes = editingStory.nodes.filter(
      (candidate) => candidate.id !== node.id
    );

    if (editingStory.singleplayerInitialSceneId === node.id) {
      editingStory.singleplayerInitialSceneId = '';
    }

    for (const playerId of ['p1', 'p2'] as PlayerId[]) {
      if (editingStory.initialSceneIds[playerId] === node.id) {
        editingStory.initialSceneIds[playerId] = '';
      }
    }
    selectedNodeId = selectedNodeId === node.id
      ? replacementId || editingStory.nodes[0]?.id || ''
      : selectedNodeId;
    refreshStory();
    statusMessage = `${displayNodeName(node)} deleted. Branch routes were cleared and linear routes were ${replacementId ? 'reconnected' : 'cleared'}.`;
  }

  function addChoice(): void {
    if (!selectedNode) {
      return;
    }

    if ((selectedNode.choices?.length ?? 0) >= 5) {
      return;
    }

    rememberForUndo();
    selectedNode.choices ??= [];
    selectedNode.choices = [
      ...selectedNode.choices,
      {
        id: `option-${selectedNode.choices.length + 1}`,
        label: 'New option',
        next: '',
        disabled: false
      }
    ];
  }

  function nextChoiceLabel(): string {
    const optionNumber = (selectedNode?.choices?.length ?? 0) + 1;

    return `Add option ${optionNumber}`;
  }

  function enabledNodeChoices(node: StoryNode): NonNullable<StoryNode['choices']> {
    return (node.choices ?? []).filter((choice) => {
      return !choice.disabled;
    });
  }

  function removeChoice(index: number): void {
    if ((selectedNode?.choices?.length ?? 0) <= 2) {
      return;
    }

    rememberForUndo();
    selectedNode.choices = selectedNode.choices.filter(
      (_choice: unknown, choiceIndex: number) => choiceIndex !== index
    );

    ensureTimedChoiceFallback();
  }

  function setChoiceDisabled(index: number, disabled: boolean): void {
    if (!selectedNode?.choices?.[index]) {
      return;
    }

    const enabledChoiceCount = selectedNode.choices.filter(
      (choice: { disabled?: boolean }) => !choice.disabled
    ).length;

    if (disabled && enabledChoiceCount <= 1) {
      errorMessage = 'At least one choice must remain available to the player.';
      refreshStory();
      return;
    }

    rememberForUndo();
    selectedNode.choices[index].disabled = disabled;
    ensureTimedChoiceFallback();
    refreshStory();
  }

  function setHoverEffectsEnabled(enabled: boolean): void {
    if (!selectedNode) {
      return;
    }

    rememberForUndo();
    selectedNode.hoverEffectsEnabled = enabled;
    selectedNode.hoverBackgroundColor ??= '#02fbfb';
    selectedNode.hoverTextColor ??= '#07111d';
    selectedNode.hoverText ??= '';
    refreshStory();
  }

  function toggleHoverEffects(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;

    setHoverEffectsEnabled(input.checked);
  }

  function ensureTimedChoiceFallback(): void {
    if (!selectedNode || selectedNode.type !== 'choice' || !selectedNode.timed) {
      return;
    }

    const fallbackIsEnabled = selectedNode.choices?.some(
      (choice: { id: string; disabled?: boolean }) => (
        choice.id === selectedNode.fallbackChoiceId && !choice.disabled
      )
    );

    if (!fallbackIsEnabled) {
      selectedNode.fallbackChoiceId = selectedNode.choices?.find(
        (choice: { disabled?: boolean }) => !choice.disabled
      )?.id ?? '';
    }
  }

  function setChoiceCount(event: Event): void {
    if (!selectedNode) {
      return;
    }

    const input = event.currentTarget as HTMLInputElement;
    const requestedCount = Math.trunc(Number(input.value));
    const choiceCount = clamp(requestedCount || 2, 2, 5);
    const choices = [...(selectedNode.choices ?? [])];

    // Preserve existing routes while adding or trimming only the requested rows.
    rememberForUndo();

    while (choices.length < choiceCount) {
      const optionNumber = choices.length + 1;

      choices.push({
        id: `option-${optionNumber}`,
        label: `Option ${optionNumber}`,
        next: '',
        disabled: false
      });
    }

    selectedNode.choices = choices.slice(0, choiceCount);

    ensureTimedChoiceFallback();

    refreshStory();
  }

  function getLaneNodes(lane: LaneId): StoryNode[] {
    return editingStory?.nodes.filter(
      (node) => (node.audience ?? 'both') === lane
        && nodeMap(node) === activeStoryMap
    ) ?? [];
  }

  function getLaneGraph(lane: LaneId): LaneGraph {
    const laneNodes = getLaneNodes(lane);
    const flowNodes = laneNodes.filter(
      (node) => !isCompanionNode(node) && node.type !== 'label'
    );
    const flowNodeById = new Map(flowNodes.map((node) => [node.id, node]));
    const nodeDepth = new Map<string, number>();
    const nodeOrder = new Map<string, number>();
    let order = 0;

    const visitRoutes = (root: StoryNode, rootDepth: number): void => {
      const queue: Array<{ node: StoryNode; depth: number }> = [
        { node: root, depth: rootDepth }
      ];

      while (queue.length > 0) {
        const queued = queue.shift();

        if (!queued || nodeDepth.has(queued.node.id)) {
          continue;
        }

        nodeDepth.set(queued.node.id, queued.depth);
        nodeOrder.set(queued.node.id, order);
        order += 1;

        // Route fields preserve author order. Choice destinations therefore
        // occupy one row from the first/top option through the last/bottom one.
        for (const field of routeFields(queued.node)) {
          const destination = flowNodeById.get(getRouteValue(queued.node, field));

          if (destination && !nodeDepth.has(destination.id)) {
            queue.push({
              node: destination,
              depth: queued.depth + 1
            });
          }
        }
      }
    };

    const configuredStartId = activeStoryMap === 'singleplayer'
      ? editingStory?.singleplayerInitialSceneId
      : editingStory?.initialSceneIds[lane === 'p2' ? 'p2' : 'p1'];
    const configuredStart = configuredStartId
      ? flowNodeById.get(configuredStartId)
      : undefined;

    if (configuredStart) {
      visitRoutes(configuredStart, 0);
    }

    // Shared-lane roots and alternate connected components follow the primary
    // route. Truly detached nodes are deliberately placed at the bottom.
    for (const node of flowNodes) {
      if (nodeDepth.has(node.id)) {
        continue;
      }

      const hasIncoming = flowNodes.some((candidate) => routeFields(candidate).some(
        (field) => getRouteValue(candidate, field) === node.id
      ));

      if (!hasIncoming && routeFields(node).some((field) => getRouteValue(node, field))) {
        const nextDepth = Math.max(-1, ...nodeDepth.values()) + 1;
        visitRoutes(node, nextDepth);
      }
    }

    for (const node of flowNodes) {
      if (!nodeDepth.has(node.id)) {
        const nextDepth = Math.max(-1, ...nodeDepth.values()) + 1;
        visitRoutes(node, nextDepth);
      }
    }

    const levels = new Map<number, StoryNode[]>();

    for (const node of laneNodes) {
      const hostDepth = isCompanionNode(node)
        ? nodeDepth.get(String(node.attachedTo ?? ''))
        : undefined;
      const nodeIndex = laneNodes.findIndex((candidate) => candidate.id === node.id);
      const adjacentFlowNode = node.type === 'label'
        ? [...laneNodes.slice(nodeIndex + 1), ...laneNodes.slice(0, nodeIndex).reverse()]
          .find((candidate) => !isCompanionNode(candidate) && candidate.type !== 'label')
        : undefined;
      const depth = hostDepth
        ?? nodeDepth.get(adjacentFlowNode?.id ?? node.id)
        ?? Math.max(0, ...nodeDepth.values());
      const levelNodes = levels.get(depth) ?? [];
      levelNodes.push(node);
      levels.set(depth, levelNodes);
    }

    const orderedLevels = [...levels.entries()]
      .sort(([leftDepth], [rightDepth]) => leftDepth - rightDepth)
      .map(([depth, nodes]) => ({
        depth,
        nodes: nodes.sort((left, right) => {
          const leftHostId = isCompanionNode(left) ? String(left.attachedTo ?? '') : left.id;
          const rightHostId = isCompanionNode(right) ? String(right.attachedTo ?? '') : right.id;

          return (nodeOrder.get(leftHostId) ?? Number.MAX_SAFE_INTEGER)
            - (nodeOrder.get(rightHostId) ?? Number.MAX_SAFE_INTEGER);
        })
      }));

    return {
      levels: orderedLevels,
      maxColumns: Math.max(1, ...orderedLevels.map((level) => compactLevelColumnCount(level.nodes))),
      columnWidth: 258 + Math.max(
        0,
        ...orderedLevels.flatMap((level) => level.nodes.map(
          (node) => companionStackIndex(level.nodes, node) * 12
        ))
      )
    };
  }

  function compactLevelColumnCount(nodes: StoryNode[]): number {
    const regularNodeCount = nodes.filter((node) => !isCompanionNode(node)).length;
    const companionStacks = new Set(
      nodes.filter(isCompanionNode).map(
        (node) => `${node.attachedTo ?? 'detached'}:${node.type}`
      )
    );

    return regularNodeCount + companionStacks.size;
  }

  function visualLevelColumn(nodes: StoryNode[], node: StoryNode): number {
    const visualKeys: string[] = [];

    for (const candidate of nodes) {
      const key = isCompanionNode(candidate)
        ? `companion:${candidate.attachedTo ?? 'detached'}:${candidate.type}`
        : `node:${candidate.id}`;

      if (!visualKeys.includes(key)) {
        visualKeys.push(key);
      }

      if (candidate.id === node.id) {
        return visualKeys.indexOf(key) + 1;
      }
    }

    return 1;
  }

  function centeredVisualLevelColumn(
    laneColumns: number,
    nodes: StoryNode[],
    node: StoryNode
  ): number {
    const levelColumns = compactLevelColumnCount(nodes);
    const leadingColumns = Math.max(0, Math.floor((laneColumns - levelColumns) / 2));

    return leadingColumns + visualLevelColumn(nodes, node);
  }

  function companionStackIndex(nodes: StoryNode[], node: StoryNode): number {
    if (!isCompanionNode(node)) {
      return 0;
    }

    return nodes
      .filter((candidate) => isCompanionNode(candidate)
        && candidate.type === node.type
        && candidate.attachedTo === node.attachedTo)
      .findIndex((candidate) => candidate.id === node.id);
  }

  function branchPathLabel(node: StoryNode): string {
    const branchRoutes = incomingConnections(node).filter(({ node: source }) => (
      nodeHasBranches(source)
      && (source.audience ?? 'both') === (node.audience ?? 'both')
      && nodeMap(source) === activeStoryMap
    ));

    if (branchRoutes.length === 1) {
      return `${routeFieldLabel(branchRoutes[0].node, branchRoutes[0].field)} PATH`;
    }

    return branchRoutes.length > 1 ? 'MERGED BRANCHES' : '';
  }

  function nodeMergesRoutes(node: StoryNode): boolean {
    return incomingConnections(node).filter(({ node: source }) => (
      (source.audience ?? 'both') === (node.audience ?? 'both')
      && nodeMap(source) === activeStoryMap
    )).length > 1;
  }

  function nodeMap(node: StoryNode): StoryPlayMode {
    return node.map === 'singleplayer' ? 'singleplayer' : 'multiplayer';
  }

  function selectStoryMap(map: StoryPlayMode): void {
    if (!editingStory) {
      return;
    }

    activeStoryMap = map;
    const preferredNodeId = map === 'singleplayer'
      ? editingStory.singleplayerInitialSceneId
      : editingStory.initialSceneIds.p1;
    selectedNodeId = editingStory.nodes.some((node) => node.id === preferredNodeId)
      ? preferredNodeId
      : editingStory.nodes.find((node) => nodeMap(node) === map)?.id ?? '';
    activeLane = 'p1';
    linkSelection = null;
    insertionTarget = null;
  }

  function setStoryModeEnabled(map: StoryPlayMode, enabled: boolean): void {
    if (!editingStory) {
      return;
    }

    const otherMap = map === 'singleplayer' ? 'multiplayer' : 'singleplayer';
    editingStory.playModes[map] = enabled;

    if (!editingStory.playModes.singleplayer && !editingStory.playModes.multiplayer) {
      editingStory.playModes[otherMap] = true;
    }

    if (!editingStory.playModes[activeStoryMap]) {
      selectStoryMap(otherMap);
    }

    if (!editingStory.playModes.multiplayer) {
      relationshipSettingsPlayer = 'p1';
    }

    refreshStory();
  }

  function relationshipTargets(currentIndex = -1): Array<{ id: string; name: string }> {
    if (!editingStory) {
      return [];
    }

    const selectedIds = new Set(editingStory.relationships
      .filter((relationship, index) => (
        index !== currentIndex
        && relationship.playerId === relationshipSettingsPlayer
      ))
      .map((relationship) => relationship.characterId));
    const targets = speakerCharacters
      .filter((character) => !selectedIds.has(character.id))
      .map((character) => ({
        id: character.id,
        name: character.name
      }));

    if (editingStory.playModes.multiplayer && !selectedIds.has('other-player')) {
      targets.push({
        id: 'other-player',
        name: 'Other player'
      });
    }

    return targets;
  }

  function addRelationship(): void {
    if (!editingStory) {
      return;
    }

    const target = relationshipTargets()[0];

    if (!target) {
      errorMessage = 'Every available relationship target is already configured.';
      return;
    }

    rememberForUndo();
    editingStory.relationships = [
      ...editingStory.relationships,
      {
        id: target.id,
        characterId: target.id,
        playerId: relationshipSettingsPlayer,
        initialValue: 0,
        minimum: -5,
        maximum: 5,
        visible: true
      }
    ];
    refreshStory();
  }

  function setRelationshipTarget(index: number, event: Event): void {
    const relationship = editingStory?.relationships[index];

    if (!relationship) {
      return;
    }

    const characterId = (event.currentTarget as HTMLSelectElement).value;
    relationship.characterId = characterId;
    relationship.id = characterId;
    refreshStory();
  }

  function normalizeRelationship(index: number): void {
    const relationship = editingStory?.relationships[index];

    if (!relationship) {
      return;
    }

    const minimum = Math.min(
      Number(relationship.minimum ?? -5),
      Number(relationship.maximum ?? 5)
    );
    const maximum = Math.max(
      Number(relationship.minimum ?? -5),
      Number(relationship.maximum ?? 5)
    );

    relationship.minimum = minimum;
    relationship.maximum = maximum;
    relationship.initialValue = Math.min(
      maximum,
      Math.max(minimum, Number(relationship.initialValue ?? 0))
    );
    refreshStory();
  }

  function removeRelationship(index: number): void {
    if (!editingStory?.relationships[index]) {
      return;
    }

    rememberForUndo();
    editingStory.relationships = editingStory.relationships.filter(
      (_relationship, relationshipIndex) => relationshipIndex !== index
    );
    refreshStory();
  }

  function relationshipTargetName(relationshipId: string): string {
    if (relationshipId === 'other-player') {
      return 'Other player';
    }

    return speakerCharacters.find((character) => character.id === relationshipId)?.name
      ?? relationshipId;
  }

  function configuredRelationshipsForPlayer(playerId: PlayerId): Array<{
    relationship: StoryDocument['relationships'][number];
    index: number;
  }> {
    return editingStory?.relationships.flatMap((relationship, index) => (
      relationship.playerId === playerId
        ? [{ relationship, index }]
        : []
    )) ?? [];
  }

  function relationshipsForNode(node: StoryNode | null): StoryDocument['relationships'] {
    if (!editingStory || !node) {
      return [];
    }

    const audience = node.map === 'singleplayer'
      ? 'p1'
      : node.audience ?? 'both';

    if (audience === 'p1' || audience === 'p2') {
      return editingStory.relationships.filter(
        (relationship) => relationship.playerId === audience
      );
    }

    const playerOneIds = new Set(editingStory.relationships
      .filter((relationship) => relationship.playerId === 'p1')
      .map((relationship) => relationship.id));

    return editingStory.relationships.filter((relationship) => (
      relationship.playerId === 'p2'
      && playerOneIds.has(relationship.id)
    ));
  }

  function nodeOrdinal(node: StoryNode): string {
    const nodesOfType = getLaneNodes((node.audience ?? 'both') as LaneId)
      .filter((candidate) => candidate.type === node.type);
    const ordinal = nodesOfType.findIndex((candidate) => candidate.id === node.id) + 1;

    return `${ordinal}${ordinalSuffix(ordinal)} ${nodeTypeName(node.type)} node`;
  }

  function ordinalSuffix(value: number): string {
    const tens = value % 100;

    if (tens >= 11 && tens <= 13) {
      return 'th';
    }

    if (value % 10 === 1) {
      return 'st';
    }

    if (value % 10 === 2) {
      return 'nd';
    }

    if (value % 10 === 3) {
      return 'rd';
    }

    return 'th';
  }

  function nodeTypeName(type: string): string {
    if (type === 'condition') {
      return 'if';
    }

    return nodeTypes.find((nodeType) => nodeType.type === type)?.label.toLowerCase()
      ?? type;
  }

  function displayNodeName(node: StoryNode): string {
    if (['label', 'note'].includes(node.type)) {
      return String(node.text || 'Untitled label');
    }

    if (node.type === 'item-effect') {
      const verb = node.effects?.[0]?.type === 'remove-item' ? 'Remove' : 'Give';

      return `${verb} ${String(node.effects?.[0]?.key || 'item')}`.slice(0, 52);
    }

    if (node.type === 'story-flag') {
      return `${String(node.effects?.[0]?.key || 'flag')} → ${String(node.effects?.[0]?.value ?? 'value')}`.slice(0, 52);
    }

    if (node.type === 'player-state') {
      const labels: Record<string, string> = {
        'adjust-stat': 'Adjust stat',
        'set-player-name': 'Set player name',
        'discover-character': 'Discover character',
        'adjust-relationship': 'Adjust relationship',
        'install-mod': 'Install mod',
        'remove-mod': 'Remove mod'
      };
      const operation = String(node.effects?.[0]?.type ?? 'adjust-stat');

      return `${labels[operation] ?? 'Player state'} · ${String(node.effects?.[0]?.key || '')}`.slice(0, 52);
    }

    return String(
      node.text
      || node.prompt
      || node.speaker
      || nodeTypeName(node.type)
    ).slice(0, 52);
  }

  function selectNode(node: StoryNode): void {
    if (linkSelection) {
      const currentNode = editingStory?.nodes.find(
        (candidate) => candidate.id === linkSelection?.sourceId
      );

      if (!currentNode) {
        cancelLinkSelection();
        return;
      }

      if (linkSelection.direction === 'attachment') {
        if (!canAttachToNode(currentNode, node)) {
          errorMessage = 'Choose a main-flow node in the same lane.';
          return;
        }

        rememberForUndo();
        currentNode.attachedTo = node.id;
        statusMessage = `${displayNodeName(currentNode)} is now attached to ${displayNodeName(node)}.`;
        linkSelection = null;
        selectedNodeId = currentNode.id;
        refreshStory();
        return;
      }

      if (linkSelection.direction === 'incoming') {
        const availableField = findAvailableRouteField(node, currentNode);

        if (!availableField) {
          errorMessage = 'That node has no available route that can lead here.';
          return;
        }

        rememberForUndo();
        setRouteValue(node, availableField, currentNode.id);
        statusMessage = `${displayNodeName(node)} now leads to ${displayNodeName(currentNode)}.`;
        linkSelection = null;
        selectedNodeId = currentNode.id;
        refreshStory();
        return;
      }

      if (!canLinkToNode(linkSelection.sourceId, node) || !linkSelection.field) {
        errorMessage = 'Choose a node in the same player lane or the Shared lane.';
        return;
      }

      rememberForUndo();
      setRouteValue(currentNode, linkSelection.field, node.id);
      statusMessage = `${linkSelection.label} now leads to ${displayNodeName(node)}.`;
      linkSelection = null;
      selectedNodeId = currentNode.id;
      refreshStory();

      return;
    }

    selectedNodeId = node.id;
    activeLane = (node.audience ?? 'both') as LaneId;
    errorMessage = '';
  }

  function selectConnectedNode(nodeId: string): void {
    const node = editingStory?.nodes.find((candidate) => candidate.id === nodeId);

    if (node) {
      selectedNodeId = node.id;
      activeLane = (node.audience ?? 'both') as LaneId;
      errorMessage = '';
    }
  }

  function nodeIsIncomingConnection(
    node: StoryNode,
    currentNode: StoryNode | null
  ): boolean {
    if (!currentNode) {
      return false;
    }

    return routeFields(node).some(
      (field) => getRouteValue(node, field) === currentNode.id
    );
  }

  function nodeIsOutgoingConnection(
    node: StoryNode,
    currentNode: StoryNode | null
  ): boolean {
    if (!currentNode) {
      return false;
    }

    return routeFields(currentNode).some(
      (field) => getRouteValue(currentNode, field) === node.id
    );
  }

  function nodeIsCompanionConnection(
    node: StoryNode,
    currentNode: StoryNode | null
  ): boolean {
    if (!currentNode) {
      return false;
    }

    return (isCompanionNode(node) && node.attachedTo === currentNode.id)
      || (isCompanionNode(currentNode) && currentNode.attachedTo === node.id);
  }

  function startLinkSelection(field: string, label: string): void {
    if (!selectedNode) {
      return;
    }

    linkSelection = {
      sourceId: selectedNode.id,
      field,
      label,
      direction: 'outgoing'
    };
    inspectorExpanded = false;
    statusMessage = `Select a destination node for ${label.toLowerCase()}.`;
  }

  function startPreviousSelection(): void {
    if (!selectedNode) {
      return;
    }

    linkSelection = {
      sourceId: selectedNode.id,
      label: 'Previous node',
      direction: 'incoming'
    };
    inspectorExpanded = false;
    statusMessage = 'Select the node that should lead into this one.';
  }

  function startAttachmentSelection(): void {
    if (!selectedNode || !isCompanionNode(selectedNode)) {
      return;
    }

    linkSelection = {
      sourceId: selectedNode.id,
      label: 'Companion host',
      direction: 'attachment'
    };
    inspectorExpanded = false;
    statusMessage = 'Select the main-flow node that this companion should modify.';
  }

  function incomingConnections(node: StoryNode): Array<{ node: StoryNode; field: string }> {
    return editingStory?.nodes.flatMap((candidate) => (
      routeFields(candidate)
        .filter((field) => getRouteValue(candidate, field) === node.id)
        .map((field) => ({ node: candidate, field }))
    )) ?? [];
  }

  function findAvailableRouteField(source: StoryNode, destination: StoryNode): string {
    if (!canLinkToNode(source.id, destination)) {
      return '';
    }

    const fields = routeFields(source);
    return fields.find((field) => getRouteValue(source, field) === destination.id)
      ?? fields.find((field) => !getRouteValue(source, field))
      ?? (fields.length === 1 ? fields[0] : '')
      ?? '';
  }

  function clearIncomingRoute(source: StoryNode, field: string): void {
    clearRoute(source, field);
  }

  function cancelLinkSelection(): void {
    linkSelection = null;
    statusMessage = '';
  }

  function clearRoute(node: StoryNode, field: string): void {
    rememberForUndo();
    setRouteValue(node, field, '');
    refreshStory();
  }

  function routeLabel(node: StoryNode, field: string): string {
    const destinationId = getRouteValue(node, field);
    const destination = editingStory?.nodes.find((candidate) => candidate.id === destinationId);

    return destination ? displayNodeName(destination) : 'Not connected';
  }

  function attachedHostLabel(node: StoryNode): string {
    const host = editingStory?.nodes.find((candidate) => candidate.id === node.attachedTo);

    return host ? displayNodeName(host) : 'Not attached';
  }

  function routeFieldLabel(node: StoryNode, field: string): string {
    if (field === 'success' || field === 'trueNext') {
      return 'YES';
    }

    if (field === 'failure' || field === 'falseNext') {
      return 'NO';
    }

    if (field.startsWith('choices.')) {
      const choiceIndex = Number(field.split('.')[1]);

      return String(node.choices?.[choiceIndex]?.label ?? `OPTION ${choiceIndex + 1}`)
        .toUpperCase()
        .slice(0, 18);
    }

    if (field === 'resultNext.won') {
      return 'WON';
    }

    if (field === 'resultNext.lost') {
      return 'LOST';
    }

    if (field === 'resultNext.draw') {
      return 'DRAW';
    }

    if (field === 'resultNext.cancelled') {
      return 'EARLY EXIT';
    }

    return isCompanionNode(node) ? 'RETURNS' : 'NEXT';
  }

  function routeIsLoop(node: StoryNode, field: string): boolean {
    if (!editingStory) {
      return false;
    }

    const destination = editingStory.nodes.find(
      (candidate) => candidate.id === getRouteValue(node, field)
    );

    if (!destination || destination.audience !== node.audience) {
      return false;
    }

    const laneNodes = getLaneNodes((node.audience ?? 'both') as LaneId);
    const sourceIndex = laneNodes.findIndex(
      (candidate) => candidate.id === node.id
    );
    const destinationIndex = laneNodes.findIndex(
      (candidate) => candidate.id === destination.id
    );

    return destinationIndex >= 0 && destinationIndex <= sourceIndex;
  }

  function getRouteValue(node: StoryNode, field: string): string {
    const parts = field.split('.');
    let value: any = node;

    for (const part of parts) {
      value = value?.[Number.isNaN(Number(part)) ? part : Number(part)];
    }

    return typeof value === 'string' ? value : '';
  }

  function setRouteValue(node: StoryNode, field: string, value: string): void {
    const parts = field.split('.');
    let target: any = node;

    for (const part of parts.slice(0, -1)) {
      target = target[Number.isNaN(Number(part)) ? part : Number(part)];
    }

    const finalPart = parts.at(-1) ?? '';
    target[Number.isNaN(Number(finalPart)) ? finalPart : Number(finalPart)] = value;
  }

  function canLinkToNode(sourceId: string, destination: StoryNode): boolean {
    if (
      destination.type === 'label'
      || destination.id === sourceId
      || (isCompanionNode(destination) && destination.attachedTo !== undefined)
    ) {
      return false;
    }

    const source = editingStory?.nodes.find((node) => node.id === sourceId);

    if (!source || nodeMap(source) !== nodeMap(destination)) {
      return false;
    }

    const sourceLane = source?.audience ?? 'both';
    const destinationLane = destination.audience ?? 'both';

    // Conditions are the intentional bridge between player-specific and shared lanes.
    if (source.type === 'condition') {
      return true;
    }

    const routesSharedVoteToSpectatorRoll = source.type === 'vote'
      && destination.type === 'dice-check'
      && destination.spectatorRoll === true
      && ['p1', 'p2'].includes(destinationLane);

    return sourceLane === 'both'
      ? destinationLane === 'both' || routesSharedVoteToSpectatorRoll
      : destinationLane === sourceLane || destinationLane === 'both';
  }

  function isValidLinkTarget(node: StoryNode): boolean {
    if (!linkSelection || !editingStory) {
      return false;
    }

    if (linkSelection.direction === 'incoming') {
      const destination = editingStory.nodes.find(
        (candidate) => candidate.id === linkSelection?.sourceId
      );

      return destination ? Boolean(findAvailableRouteField(node, destination)) : false;
    }

    if (linkSelection.direction === 'attachment') {
      const companion = editingStory.nodes.find(
        (candidate) => candidate.id === linkSelection?.sourceId
      );

      return companion ? canAttachToNode(companion, node) : false;
    }

    return canLinkToNode(linkSelection.sourceId, node);
  }

  function routeFields(node: StoryNode): string[] {
    if (isCompanionNode(node)) {
      return node.attachedTo === undefined && node.next !== undefined
        ? ['next']
        : [];
    }

    if (supportsSimpleNext(node)) {
      return ['next'];
    }

    if (node.type === 'dice-check') {
      return ['success', 'failure'];
    }

    if (node.type === 'condition') {
      return ['trueNext', 'falseNext'];
    }

    if (['choice', 'vote', 'timed-choice'].includes(node.type)) {
      return (node.choices ?? []).flatMap((choice, index) => (
        choice.disabled
          ? []
          : [`choices.${index}.next`]
      ));
    }

    if (node.type === 'minigame') {
      return minigameOutcomeIds(node.minigameId).map(
        (outcome) => `resultNext.${outcome}`
      );
    }

    return [];
  }

  // Deletion must inspect hidden, disabled, and mode-switching routes too.
  // The visible route list intentionally omits some of those editor details.
  function allRouteFields(node: StoryNode): string[] {
    if (isCompanionNode(node)) {
      return node.attachedTo === undefined && node.next !== undefined
        ? ['next']
        : [];
    }

    if (supportsSimpleNext(node)) {
      return ['next'];
    }

    if (node.type === 'dice-check') {
      return ['success', 'failure'];
    }

    if (node.type === 'condition') {
      return ['trueNext', 'falseNext'];
    }

    if (['choice', 'vote', 'timed-choice'].includes(node.type)) {
      return (node.choices ?? []).map((_choice, index) => `choices.${index}.next`);
    }

    if (node.type === 'minigame') {
      return Object.keys(node.resultNext ?? {}).map((outcome) => `resultNext.${outcome}`);
    }

    return [];
  }

  function supportsSimpleNext(node: StoryNode): boolean {
    return ['dialogue', 'input', 'checkpoint', 'conversation', 'image', 'clear-terminal', 'change-character']
      .includes(node.type);
  }

  function supportsSpeakerProperties(node: StoryNode): boolean {
    return [
      'dialogue',
      'input',
      'choice',
      'timed-choice',
      'vote',
      'dice-check',
      'image',
      'minigame',
      'ending'
    ].includes(node.type);
  }

  function nodeHasButtons(node: StoryNode): boolean {
    return [
      'dialogue',
      'image',
      'choice',
      'timed-choice',
      'vote',
      'input',
      'conversation',
      'dice-check',
      'minigame'
    ].includes(node.type)
      || (node.type === 'ambience' && node.attachedTo === undefined);
  }

  function isCompanionNode(node: StoryNode): boolean {
    return isCompanionNodeType(node.type);
  }

  function canAttachToNode(companion: StoryNode, host: StoryNode): boolean {
    if (host.type === 'label' || isCompanionNode(host) || host.id === companion.id) {
      return false;
    }

    return (companion.audience ?? 'both') === (host.audience ?? 'both');
  }

  function nodeIsInvalid(node: StoryNode): boolean {
    if (!editingStory) {
      return false;
    }

    if (isCompanionNode(node) && node.attachedTo !== undefined) {
      const host = editingStory.nodes.find((candidate) => candidate.id === node.attachedTo);

      return !host || !canAttachToNode(node, host);
    }

    const isStartNode = Object.values(editingStory.initialSceneIds).includes(node.id)
      || editingStory.singleplayerInitialSceneId === node.id;
    const hasIncomingRoute = editingStory.nodes.some(
      (candidate) => routeFields(candidate).some(
        (field) => getRouteValue(candidate, field) === node.id
      )
    );
    const routes = routeFields(node);
    const hasMissingRoute = node.type !== 'ending'
      && (routes.length === 0 || routes.some((field) => !getRouteValue(node, field)));
    const hasBrokenRoute = routes.some((field) => {
      const destinationId = getRouteValue(node, field);
      const destination = editingStory?.nodes.find(
        (candidate) => candidate.id === destinationId
      );

      return Boolean(destinationId)
        && (!destination
          || destination.type === 'label'
          || !canLinkToNode(node.id, destination));
    });
    const hasInvalidSpectatorLane = node.type === 'dice-check'
      && nodeMap(node) === 'multiplayer'
      && node.spectatorRoll === true
      && !['p1', 'p2'].includes(node.audience ?? 'both');

    return (!isStartNode && !hasIncomingRoute)
      || hasMissingRoute
      || hasBrokenRoute
      || hasInvalidSpectatorLane;
  }

  function nodeHasBranches(node: StoryNode): boolean {
    return ['choice', 'vote', 'timed-choice', 'dice-check', 'condition', 'minigame']
      .includes(node.type);
  }

  function minigameOutcomeIds(minigameId: unknown): string[] {
    const outcomes = ['won', 'lost'];

    if (minigamesWithDraws.has(String(minigameId))) {
      outcomes.push('draw');
    }

    outcomes.push('cancelled');
    return outcomes;
  }

  function setMinigameId(event: Event): void {
    if (!selectedNode || selectedNode.type !== 'minigame') {
      return;
    }

    selectedNode.minigameId = (event.currentTarget as HTMLSelectElement).value;
    selectedNode.resultNext ??= {};

    for (const outcome of minigameOutcomeIds(selectedNode.minigameId)) {
      selectedNode.resultNext[outcome] ??= '';
    }

    refreshStory();
  }

  function clearNodeRoutes(node: StoryNode): void {
    if (isCompanionNode(node)) {
      node.attachedTo = '';
      delete node.next;
      return;
    }

    for (const field of routeFields(node)) {
      setRouteValue(node, field, '');
    }
  }

  function updateConversationCount(player: PlayerId, value: number): void {
    if (!selectedNode?.messagesPerPlayer) {
      return;
    }

    const count = Math.max(0, Math.floor(Number(value ?? 0)));
    const otherPlayer = player === 'p1' ? 'p2' : 'p1';
    selectedNode.messagesPerPlayer[player] = count;
    const otherCount = Number(selectedNode.messagesPerPlayer[otherPlayer] ?? 0);

    if (count > otherCount + 1) {
      selectedNode.messagesPerPlayer[otherPlayer] = count - 1;
    } else if (otherCount > count + 1) {
      selectedNode.messagesPerPlayer[otherPlayer] = count + 1;
    }

    refreshStory();
  }

  async function openImageLibrary(target: 'portrait' | 'image' | 'item'): Promise<void> {
    imageLibraryTarget = target;
    clearMessages();

    try {
      const response = await fetch('/api/story-assets/images');
      const result = await response.json();

      if (!response.ok || !Array.isArray(result.images)) {
        throw new Error(result.error ?? 'The image library could not be loaded.');
      }

      storyImages = result.images;
      imageLibraryOpen = true;
    } catch (error) {
      errorMessage = error instanceof Error
        ? error.message
        : 'The image library could not be loaded.';
    }
  }

  function selectStoryImage(path: string): void {
    if (!selectedNode) {
      return;
    }

    rememberForUndo();

    if (imageLibraryTarget === 'portrait') {
      selectedNode.portrait = path;
    } else if (imageLibraryTarget === 'item' && selectedNode.effects?.[0]) {
      selectedNode.effects[0].image = path;
    } else {
      selectedNode.src = path;
    }

    imageLibraryOpen = false;
    refreshStory();
  }

  function removeCustomSpeakerPortrait(): void {
    if (!selectedNode) {
      return;
    }

    rememberForUndo();
    selectedNode.portrait = '';
    selectedNode.portraitAlt = '';
    refreshStory();
  }

  async function openAudioLibrary(target: 'music' | 'sound'): Promise<void> {
    audioLibraryTarget = target;
    clearMessages();

    try {
      const response = await fetch('/api/story-assets/audio');
      const result = await response.json();

      if (!response.ok || !Array.isArray(result.assets)) {
        throw new Error(result.error ?? 'The audio library could not be loaded.');
      }

      audioAssets = result.assets.filter((asset: AudioAsset) => asset.kind === target);
      audioLibraryOpen = true;
    } catch (error) {
      errorMessage = error instanceof Error
        ? error.message
        : 'The audio library could not be loaded.';
    }
  }

  function openSelectedAudioLibrary(): void {
    if (!selectedNode) {
      return;
    }

    const target = selectedNode.audioKind === 'sound' ? 'sound' : 'music';

    void openAudioLibrary(target);
  }

  function selectStoryAudio(asset: AudioAsset): void {
    if (!selectedNode) {
      return;
    }

    rememberForUndo();

    if (audioLibraryTarget === 'music') {
      selectedNode.music = asset.path;
      selectedNode.sound = '';
    } else {
      selectedNode.sound = asset.path;
      selectedNode.music = '';
    }

    const preview = [...document.querySelectorAll<HTMLAudioElement>('.audio-library-list audio')]
      .find((audio) => audio.getAttribute('src') === asset.path);

    if (preview && Number.isFinite(preview.duration)) {
      selectedNode.audioDurationSeconds = Math.round(preview.duration * 10) / 10;
    }

    audioLibraryOpen = false;
    refreshStory();
  }

  function setAudioKind(event: Event): void {
    if (!selectedNode) {
      return;
    }

    rememberForUndo();
    selectedNode.audioKind = (event.currentTarget as HTMLSelectElement).value as 'music' | 'sound';
    selectedNode.music = '';
    selectedNode.sound = '';
    selectedNode.audioLoop = selectedNode.audioKind === 'music';
    selectedNode.audioDurationSeconds = 0;
    selectedNode.audioStartSeconds = 0;
    selectedNode.audioStopSeconds = 0;
    refreshStory();
  }

  function setAudioRangeMode(event: Event): void {
    if (!selectedNode) {
      return;
    }

    selectedNode.audioRangeMode = (event.currentTarget as HTMLSelectElement).value as 'full' | 'partial';

    if (selectedNode.audioRangeMode === 'partial'
      && Number(selectedNode.audioStopSeconds ?? 0) <= Number(selectedNode.audioStartSeconds ?? 0)) {
      selectedNode.audioStopSeconds = Number(selectedNode.audioDurationSeconds ?? 0);
    }

    refreshStory();
  }

  function recordAudioDuration(event: Event): void {
    if (!selectedNode) {
      return;
    }

    const audio = event.currentTarget as HTMLAudioElement;
    const selectedPath = selectedNode.audioKind === 'sound'
      ? selectedNode.sound
      : selectedNode.music;

    if (audio.getAttribute('src') === selectedPath && Number.isFinite(audio.duration)) {
      selectedNode.audioDurationSeconds = Math.round(audio.duration * 10) / 10;
    }
  }

  function stopOtherAudioPreviews(event: Event): void {
    const selectedPreview = event.currentTarget as HTMLAudioElement;

    for (const preview of document.querySelectorAll<HTMLAudioElement>('.audio-library-list audio')) {
      if (preview !== selectedPreview) {
        preview.pause();
        preview.currentTime = 0;
      }
    }
  }

  function setStopMusicIds(event: Event): void {
    if (!selectedNode) {
      return;
    }

    selectedNode.stopMusicIds = (event.currentTarget as HTMLInputElement).value
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    refreshStory();
  }

  function toggleStopMusicLayer(layer: number, enabled: boolean): void {
    if (!selectedNode) {
      return;
    }

    const layers = new Set<number>(selectedNode.stopMusicLayers ?? []);

    if (enabled) {
      layers.add(layer);
    } else {
      layers.delete(layer);
    }

    selectedNode.stopMusicLayers = [...layers].sort((left, right) => left - right);
    refreshStory();
  }

  function setChoiceCondition(index: number, enabled: boolean): void {
    const choice = selectedNode?.choices?.[index];

    if (!choice) {
      return;
    }

    rememberForUndo();
    choice.condition = enabled
      ? {
          type: 'has-item',
          key: defaultConditionKey('has-item')
        }
      : undefined;
    refreshStory();
  }

  function defaultConditionKey(type: string): string {
    if (type === 'has-item') {
      return knownStoryItems[0] ?? '';
    }

    if (type === 'flag-equals') {
      return knownStoryFlags[0] ?? '';
    }

    if (type === 'stat-at-least') {
      return characterStats[0];
    }

    if (['relationship-at-least', 'relationship-at-most'].includes(type)) {
      return relationshipsForNode(selectedNode)[0]?.id ?? '';
    }

    if (type === 'decision-made') {
      return rememberedChoiceOptions[0]?.key ?? '';
    }

    if (type === 'playing-as') {
      return 'p1';
    }

    return '';
  }

  function storyFlagValues(flagId: string): string[] {
    return [...new Set(
      editingStory?.nodes
        .filter((node) => (
          node.type === 'story-flag'
          && String(node.effects?.[0]?.key ?? '') === flagId
        ))
        .map((node) => String(node.effects?.[0]?.value ?? ''))
        .filter(Boolean) ?? []
    )];
  }

  function defaultConditionValue(type: string): string | number | boolean | undefined {
    if (type === 'flag-equals') {
      return storyFlagValues(knownStoryFlags[0] ?? '')[0] ?? 'true';
    }

    if (type === 'stat-at-least') {
      return 1;
    }

    if (['relationship-at-least', 'relationship-at-most'].includes(type)) {
      return type === 'relationship-at-least' ? 3 : -3;
    }

    return undefined;
  }

  function setNodeConditionType(event: Event): void {
    if (!selectedNode?.condition) {
      return;
    }

    const type = (event.currentTarget as HTMLSelectElement).value;
    rememberForUndo();
    selectedNode.condition = {
      type,
      key: defaultConditionKey(type),
      value: defaultConditionValue(type)
    };
    refreshStory();
  }

  function setChoiceConditionType(index: number, event: Event): void {
    const choice = selectedNode?.choices?.[index];

    if (!choice?.condition) {
      return;
    }

    const type = (event.currentTarget as HTMLSelectElement).value;
    rememberForUndo();
    choice.condition = {
      type,
      key: defaultConditionKey(type),
      value: defaultConditionValue(type)
    } as typeof choice.condition;
    refreshStory();
  }

  function setNodeConditionFlag(event: Event): void {
    if (!selectedNode?.condition) {
      return;
    }

    const flagId = (event.currentTarget as HTMLSelectElement).value;
    selectedNode.condition.key = flagId;
    selectedNode.condition.value = storyFlagValues(flagId)[0] ?? '';
    refreshStory();
  }

  function setChoiceConditionFlag(index: number, event: Event): void {
    const condition = selectedNode?.choices?.[index]?.condition;

    if (!condition) {
      return;
    }

    const flagId = (event.currentTarget as HTMLSelectElement).value;
    condition.key = flagId;
    condition.value = storyFlagValues(flagId)[0] ?? '';
    refreshStory();
  }

  function insertStoredInputToken(event: Event): void {
    if (!selectedNode) {
      return;
    }

    const select = event.currentTarget as HTMLSelectElement;
    const token = select.value;

    if (!token) {
      return;
    }

    rememberForUndo();

    if (selectedNode.type === 'input') {
      selectedNode.prompt = `${selectedNode.prompt ?? ''}${selectedNode.prompt ? ' ' : ''}${token}`;
    } else {
      selectedNode.text = `${selectedNode.text ?? ''}${selectedNode.text ? ' ' : ''}${token}`;
    }

    select.value = '';
    refreshStory();
  }

  function storedInputToken(inputKey: unknown): string {
    const normalizedKey = String(inputKey ?? '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, '_');
    const tokenKey = normalizedKey.startsWith('INPUT_')
      ? normalizedKey
      : `INPUT_${normalizedKey}`;

    return `{${tokenKey}}`;
  }

  function setEffectStoredInput(event: Event): void {
    if (!selectedNode?.effects?.[0]) {
      return;
    }

    const select = event.currentTarget as HTMLSelectElement;

    if (!select.value) {
      return;
    }

    rememberForUndo();
    selectedNode.effects[0].value = select.value;
    select.value = '';
    refreshStory();
  }

  function setItemOperation(event: Event): void {
    if (!selectedNode?.effects?.[0]) {
      return;
    }

    const operation = (event.currentTarget as HTMLSelectElement).value;
    const currentTemplate = String(selectedNode.announcementTemplate ?? '');

    rememberForUndo();
    selectedNode.effects[0].type = operation;

    if (operation === 'remove-item') {
      selectedNode.effects[0].image = '';

      if (!currentTemplate || currentTemplate === 'Acquired item: <ITEM>.') {
        selectedNode.announcementTemplate = 'Removed item: <ITEM>.';
      }
    } else if (!currentTemplate || currentTemplate === 'Removed item: <ITEM>.') {
      selectedNode.announcementTemplate = 'Acquired item: <ITEM>.';
    }

    refreshStory();
  }

  function setPlayerStateOperation(event: Event): void {
    if (!selectedNode?.effects?.[0]) {
      return;
    }

    const operation = (event.currentTarget as HTMLSelectElement).value;
    const defaults: Record<string, { key: string; value?: string | number }> = {
      'adjust-stat': { key: 'luck', value: 1 },
      'set-player-name': { key: '', value: '' },
      'discover-character': { key: '' },
      'adjust-relationship': { key: relationshipsForNode(selectedNode)[0]?.id ?? '', value: 1 },
      'install-mod': { key: 'neuro-link-chat' },
      'remove-mod': { key: 'neuro-link-chat' }
    };
    const nextEffect = defaults[operation] ?? { key: '' };

    rememberForUndo();
    selectedNode.effects[0] = {
      type: operation,
      ...nextEffect
    };
    selectedNode.playerMessage = operation === 'adjust-relationship'
      ? String(selectedNode.playerMessage ?? '')
      : '';
    refreshStory();
  }

  function itemAnnouncementPreview(node: StoryNode): string {
    const itemName = String(node.effects?.[0]?.key ?? 'Item').trim() || 'Item';
    const template = String(node.announcementTemplate ?? 'Acquired item: <ITEM>.');

    return template.includes('<ITEM>')
      ? template.replaceAll('<ITEM>', itemName)
      : `${template}${itemName}`;
  }

  async function deleteStoryImage(path: string, confirmed = false): Promise<void> {
    const fileName = path.split('/').at(-1);

    if (!fileName) {
      return;
    }

    clearMessages();

    try {
      const query = confirmed ? '?confirm=true' : '';
      const response = await fetch(
        `/api/story-assets/images/${encodeURIComponent(fileName)}${query}`,
        { method: 'DELETE' }
      );
      const result = await response.json();

      if (response.status === 409 && result.requiresConfirmation) {
        pendingAssetDeletion = {
          path,
          references: result.references ?? []
        };
        return;
      }

      if (!response.ok) {
        throw new Error(result.error ?? 'The image could not be deleted.');
      }

      storyImages = storyImages.filter((imagePath) => imagePath !== path);
      pendingAssetDeletion = null;
      statusMessage = result.references?.length
        ? 'Image deleted. Existing story references were left unchanged.'
        : 'Image deleted from the asset library.';
    } catch (error) {
      errorMessage = error instanceof Error
        ? error.message
        : 'The image could not be deleted.';
    }
  }

  function canDeleteStoryImage(path: string): boolean {
    return path.startsWith('/uploads/stories/');
  }

  function handleSimpleResult(successMessage: string) {
    return (result: { ok: boolean; error?: string }): void => {
      if (result.ok) {
        statusMessage = successMessage;
      } else {
        errorMessage = result.error ?? 'The library operation failed.';
      }
    };
  }

  async function uploadImage(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    const inspectorScrollElement = inspectorElement
      ?.querySelector<HTMLElement>('.inspector-scroll-content');
    const previousScrollTop = inspectorScrollElement?.scrollTop ?? 0;

    if (!file || !selectedNode || !['image', 'dialogue'].includes(selectedNode.type)) {
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      errorMessage = 'Images must be 8 MB or smaller.';
      input.value = '';
      return;
    }

    const imageNodeId = selectedNode.id;
    imageUploading = true;
    clearMessages();

    try {
      const response = await fetch('/api/story-assets/images', {
        method: 'POST',
        headers: {
          'Content-Type': file.type
        },
        body: file
      });
      const result = await response.json();

      if (!response.ok || !result.path) {
        throw new Error(result.error ?? 'The image upload failed.');
      }

      const imageNode = editingStory?.nodes.find((node) => node.id === imageNodeId);

      if (imageNode) {
        rememberForUndo();
        if (imageNode.type === 'dialogue') {
          imageNode.portrait = result.path;
        } else {
          imageNode.src = result.path;
        }
        refreshStory();
        await tick();

        if (inspectorScrollElement) {
          inspectorScrollElement.scrollTop = previousScrollTop;
        }

        statusMessage = 'Image uploaded to the story host.';
      }
    } catch (error) {
      errorMessage = error instanceof Error
        ? error.message
        : 'The image upload failed.';
    } finally {
      imageUploading = false;
      input.value = '';
    }
  }

  function createNode(type: string, id: string): StoryNode {
    const baseNode: StoryNode = {
      id,
      type,
      audience: 'both',
      text: '',
      next: ''
    };

    switch (type) {
      case 'dialogue':
        return {
          ...baseNode,
          speaker: '',
          characterId: '',
          expression: 'normal',
          portrait: '',
          portraitAlt: '',
          continueLabel: 'Continue',
          showCountdown: true
        };
      case 'choice':
      case 'vote':
        return {
          ...baseNode,
          choices: [
            {
              id: 'option-1',
              label: 'Option 1',
              next: ''
            },
            {
              id: 'option-2',
              label: 'Option 2',
              next: ''
            }
          ],
          timed: false,
          showCountdown: true,
          decisionSeverity: 'none'
        };
      case 'checkpoint':
        return {
          ...baseNode,
          checkpointId: `${id}.sync`
        };
      case 'input':
        return {
          ...baseNode,
          prompt: 'Enter your response.',
          placeholder: 'Type your response…',
          inputKey: `INPUT_${id.replace(/[^a-z0-9]+/gi, '_').toUpperCase()}`,
          saveInput: true,
          maxLength: 200
        };
      case 'conversation':
        return {
          ...baseNode,
          firstPlayer: 'random',
          messagesPerPlayer: {
            p1: 2,
            p2: 2
          }
        };
      case 'dice-check':
        return {
          ...baseNode,
          die: 6,
          stat: 'luck',
          threshold: 10,
          spectatorRoll: false,
          success: '',
          failure: ''
        };
      case 'item-effect':
        return {
          id,
          type,
          audience: 'both',
          attachedTo: '',
          announcementTemplate: 'Acquired item: <ITEM>.',
          effects: [
            {
              type: 'add-item',
              key: 'New item',
              image: ''
            }
          ]
        };
      case 'story-flag':
        return {
          id,
          type,
          audience: 'both',
          attachedTo: '',
          effects: [
            {
              type: 'set-flag',
              key: 'story_flag',
              value: 'true'
            }
          ]
        };
      case 'player-state':
        return {
          id,
          type,
          audience: 'both',
          attachedTo: '',
          effects: [
            {
              type: 'adjust-stat',
              key: 'luck',
              value: 1
            }
          ]
        };
      case 'condition':
        return {
          id,
          type,
          audience: 'both',
          condition: {
            type: 'has-item',
            key: 'new-item'
          },
          trueNext: '',
          falseNext: ''
        };
      case 'image':
        return {
          ...baseNode,
          text: '',
          src: '',
          logText: '',
          imagePositionX: 50,
          imagePositionY: 50,
          imageBorderColor: '#1472bf'
        };
      case 'clear-terminal':
        return {
          ...baseNode,
          text: undefined
        };
      case 'change-character':
        return {
          ...baseNode,
          text: undefined,
          characterId: '',
          resetToDefault: false
        };
      case 'ambience':
        return {
          id,
          type,
          audience: 'both',
          attachedTo: '',
          text: 'The atmosphere changes.',
          background: '',
          music: null,
          sound: ''
        };
      case 'note':
        return {
          id,
          type,
          audience: 'both',
          attachedTo: '',
          text: 'Add an author note here.'
        };
      case 'audio':
        return {
          id,
          type,
          audience: 'both',
          attachedTo: '',
          audioKind: 'music',
          music: '',
          sound: '',
          audioId: `${id}.audio`,
          audioLayer: 1,
          audioLoop: true,
          audioVolume: 1,
          fadeInSeconds: 0,
          fadeOutSeconds: 0,
          audioRangeMode: 'full',
          audioStartSeconds: 0,
          audioStopSeconds: 0
        };
      case 'stop-audio':
        return {
          id,
          type,
          audience: 'both',
          attachedTo: '',
          stopMusic: true,
          stopMusicIds: [],
          stopMusicLayers: [],
          stopSounds: false,
          fadeOutSeconds: 0
        };
      case 'screen-effect':
        // Presentation effects are companions, so they never receive a route.
        return {
          id,
          type,
          audience: 'both',
          attachedTo: '',
          screenEffect: 'shake',
          backgroundTheme: 'blue',
          effectDurationSeconds: 0.6,
          effectIterations: 1,
          effectLoop: false,
          mirrorAxis: 'horizontal',
          spinDirection: 'clockwise',
          effectColor: '#39ff88',
          scanDirection: 'left-to-right'
        };
      case 'minigame':
        return {
          ...baseNode,
          minigameId: 'netrunners',
          resultNext: {
            won: '',
            lost: '',
            cancelled: ''
          }
        };
      case 'label':
        return {
          id,
          type,
          audience: 'both',
          attachedTo: '',
          text: 'NEW SECTION'
        };
      case 'ending':
        return {
          id,
          type,
          audience: 'both',
          text: 'End of story.'
        };
      default:
        return baseNode;
    }
  }
</script>

<svelte:window on:keydown={handleEditorShortcut} />

<section
  class="story-library"
  class:story-library--editor={$location === 'editor'}
  class:story-library--save-pulse={savePulse}
  class:hide={!['library', 'editor'].includes($location)}
  aria-label={$location === 'editor' ? 'Story editor' : 'Library'}
>
  <header>
    <span>{$location === 'editor' ? 'DEJAVU://STORY_EDITOR' : 'DEJAVU://STORY_LIBRARY'}</span>
    <span>{mode.toUpperCase()}</span>
  </header>

  {#if $location === 'library' && mode === 'library'}
    <div class="library-content">
      <div class="library-heading">
        <div>
          <p class="eyebrow">STORY CARTRIDGES</p>
          <h1 id="library-title">Library</h1>
          <p class="introduction">
            Choose the singleplayer or multiplayer map when you insert a cartridge. Two players may run the same singleplayer map independently.
          </p>
        </div>
        <button class="primary-button" type="button" on:click={openCreateStory}>
          Make new story
        </button>
      </div>

      <div class="selection-panel" class:matched={Boolean($libraryState.activeStoryId)}>
        <div>
          <span>YOUR CARTRIDGE</span>
          <strong>{storyTitle(localSelection)}</strong>
          {#if localSelectionMode === 'multiplayer' && localStorySeat}
            <small>{localStorySeat === 'p1' ? 'PLAYER 1' : 'PLAYER 2'}</small>
          {/if}
        </div>
        <div class="partner-selection">
          <span>PARTNER CARTRIDGE</span>
          <strong>{storyTitle(partnerSelection)}</strong>
          {#if partnerSelection && partnerSelection !== localSelection}
            <button type="button" on:click={matchPartnerCartridge}>
              {partnerSeatPickerOpen ? 'Cancel swap' : 'Swap to partner cartridge'}
            </button>
          {/if}

          {#if partnerSeatPickerOpen && partnerSelection}
            <div class="partner-seat-picker">
              <p>Choose your role for {storyTitle(partnerSelection)}.</p>
              <button
                type="button"
                disabled={storySeatClaimedByOther('p1')}
                on:click={() => selectStory(partnerSelection, 'multiplayer', 'p1')}
              >
                {storySeatClaimedByOther('p1') ? 'Player 1 · claimed' : 'Play as Player 1'}
              </button>
              <button
                type="button"
                disabled={storySeatClaimedByOther('p2')}
                on:click={() => selectStory(partnerSelection, 'multiplayer', 'p2')}
              >
                {storySeatClaimedByOther('p2') ? 'Player 2 · claimed' : 'Play as Player 2'}
              </button>
            </div>
          {/if}
        </div>
        <p>
          {$libraryState.activeStoryId
            ? $libraryState.activeStoryMode === 'singleplayer'
              ? 'CARTRIDGE ACTIVE — READY TO PLAY'
              : 'LINK ESTABLISHED — CARTRIDGE READY'
            : 'WAITING FOR MATCHING CARTRIDGES'}
        </p>
      </div>

      <div class="story-grid">
        {#each $libraryState.stories as story}
          <article class:selected={localSelection === story.id}>
            <div class="story-card-header">
              <span>{story.status === 'draft' ? 'UNAVAILABLE' : story.protected ? 'PROTECTED' : 'PLAYABLE'}</span>
              <span>V{story.version}</span>
            </div>
            <h2>{story.title}</h2>
            <p>{story.description || 'No description yet.'}</p>
            {#if story.unavailableReason}
              <p class="story-unavailable-reason">{story.unavailableReason}</p>
            {/if}
            <dl>
              <div>
                <dt>AUTHOR</dt>
                <dd>{story.author || 'Unknown'}</dd>
              </div>
              <div>
                <dt>TYPE</dt>
                <dd>{story.builtIn ? 'BUILT-IN' : 'CUSTOM'}</dd>
              </div>
            </dl>
            <div class="card-actions">
              {#if story.playModes.singleplayer}
                <button disabled={story.status === 'draft'} type="button" on:click={() => selectStory(story.id, 'singleplayer')}>
                  {localSelection === story.id && localSelectionMode === 'singleplayer'
                    ? 'Singleplayer inserted'
                    : 'Insert singleplayer'}
                </button>
              {/if}
              {#if story.playModes.multiplayer}
                <button disabled={story.status === 'draft'} type="button" on:click={() => openSeatPicker(story.id)}>
                  {localSelection === story.id && localSelectionMode === 'multiplayer'
                    ? `Multiplayer · ${localStorySeat === 'p1' ? 'Player 1' : 'Player 2'}`
                    : 'Insert multiplayer'}
                </button>
              {/if}
              {#if localSelection === story.id}
                <button class="deselect-cartridge" type="button" on:click={() => selectStory(null, 'singleplayer')}>
                  Deselect
                </button>
              {/if}
            </div>

            {#if seatPickerStoryId === story.id}
              <div class="seat-picker">
                <p>Choose your multiplayer role. A claimed role cannot be taken from the other player.</p>
                <div>
                  <button
                    type="button"
                    disabled={storySeatClaimedByOther('p1')}
                    on:click={() => selectStory(story.id, 'multiplayer', 'p1')}
                  >
                    {storySeatClaimedByOther('p1') ? 'Player 1 · claimed' : 'Play as Player 1'}
                  </button>
                  <button
                    type="button"
                    disabled={storySeatClaimedByOther('p2')}
                    on:click={() => selectStory(story.id, 'multiplayer', 'p2')}
                  >
                    {storySeatClaimedByOther('p2') ? 'Player 2 · claimed' : 'Play as Player 2'}
                  </button>
                </div>
              </div>
            {/if}
          </article>
        {/each}
      </div>
    </div>
  {:else if $location === 'editor' && mode === 'create'}
    <div class="form-screen">
      <button class="back-button" type="button" on:click={showEditorHome}>
        ← Back to editor
      </button>
      <p class="eyebrow">NEW CARTRIDGE</p>
      <h1>Create a story</h1>
      <p class="introduction">
        {newStoryStarterDescription()}
      </p>

      <div class="story-form">
        <label for="story-title">Story title</label>
        <input id="story-title" bind:value={newTitle} maxlength="80">

        <label for="story-author">Author</label>
        <input id="story-author" bind:value={newAuthor} maxlength="80">

        <label for="story-description">Description</label>
        <textarea
          id="story-description"
          bind:value={newDescription}
          maxlength="500"
          rows="5"
        ></textarea>

        <label class="mode-checkbox story-protection-toggle">
          <input type="checkbox" bind:checked={newProtected}>
          Protect this story from deletion
        </label>
        <p class="field-help">Protected stories must be explicitly unprotected in Story settings before they can be deleted.</p>

        <fieldset class="play-mode-fieldset">
          <legend>Playable modes</legend>
          <label class="mode-checkbox">
            <input
              type="checkbox"
              checked={newPlayModes.singleplayer}
              disabled={newPlayModes.singleplayer && !newPlayModes.multiplayer}
              on:change={(event) => setNewStoryMode('singleplayer', event.currentTarget.checked)}
            >
            Singleplayer map
          </label>
          <label class="mode-checkbox">
            <input
              type="checkbox"
              checked={newPlayModes.multiplayer}
              disabled={newPlayModes.multiplayer && !newPlayModes.singleplayer}
              on:change={(event) => setNewStoryMode('multiplayer', event.currentTarget.checked)}
            >
            Multiplayer map
          </label>
          <p>If both are enabled, the editor keeps a separate node map for each mode.</p>
        </fieldset>

        <fieldset class="play-mode-fieldset">
          <legend>Main characters</legend>
          <p>Stories reference the central character library. Multiplayer roles must use different characters.</p>

          {#if newPlayModes.singleplayer}
            <label for="new-solo-character">Singleplayer character</label>
            <select id="new-solo-character" bind:value={newMainCharacterIds.singleplayer}>
              <option value="">Choose a character</option>
              {#each playableCharacters as character}
                <option value={character.id}>{character.name}</option>
              {/each}
            </select>
          {/if}

          {#if newPlayModes.multiplayer}
            <label for="new-p1-character">Player 1 character</label>
            <select id="new-p1-character" bind:value={newMainCharacterIds.multiplayer.p1}>
              <option value="">Choose a character</option>
              {#each playableCharacters as character}
                <option value={character.id}>{character.name}</option>
              {/each}
            </select>

            <label for="new-p2-character">Player 2 character</label>
            <select id="new-p2-character" bind:value={newMainCharacterIds.multiplayer.p2}>
              <option value="">Choose a different character</option>
              {#each playableCharacters as character}
                <option
                  value={character.id}
                  disabled={character.id === newMainCharacterIds.multiplayer.p1}
                >{character.name}</option>
              {/each}
            </select>
          {/if}
        </fieldset>

        <button
          class="primary-button"
          type="button"
          disabled={!newTitle.trim() || !newStoryHasCharacters}
          on:click={createStory}
        >
          Create story graph
        </button>
      </div>
    </div>
  {:else if $location === 'editor' && editingStory}
    <div
      class="editor-shell"
      on:focusin={rememberFieldEdit}
      on:change={refreshStory}
    >
      <div class="editor-toolbar" class:mobile-collapsed={mobileToolbarCollapsed}>
        <button
          class="mobile-toolbar-toggle"
          type="button"
          aria-expanded={!mobileToolbarCollapsed}
          on:click={() => mobileToolbarCollapsed = !mobileToolbarCollapsed}
        >
          {mobileToolbarCollapsed ? 'Show editor controls' : 'Hide editor controls'}
        </button>
        <button class="back-button" type="button" on:click={closeStoryEditor}>
          ← Editor
        </button>
        <div>
          <strong class="editor-story-title">{editingStory.title}</strong>
          <span>
            VERSION {editingStory.version} · {storyStartIssue(editingStory) ? 'UNAVAILABLE' : 'PLAYABLE'}
            {editingStory.protected ? ' · PROTECTED' : ''}
          </span>
        </div>
        <div class="toolbar-actions">
          <button type="button" disabled={undoStack.length === 0} on:click={undo} aria-label="Undo last editor change">
            ↶ Undo
          </button>
          <button type="button" disabled={redoStack.length === 0} on:click={redo} aria-label="Redo editor change">
            ↷ Redo
          </button>
          <button class="tutorial-button" type="button" on:click={openTutorial} aria-label="Open editor tutorial">
            ⓘ Guide
          </button>
          <button type="button" on:click={openStorySettings}>
            Settings
          </button>
          <button type="button" disabled={saveInFlight || Boolean(storyStartIssue(editingStory))} on:click={requestPlaytest}>
            ▶ Play
          </button>
          <button class="primary-button" type="button" disabled={saveInFlight} on:click={() => saveStory()}>
            {saveInFlight ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {#if storySettingsOpen}
        <div class="node-picker-backdrop story-settings-backdrop" role="presentation" on:click|self={closeStorySettings}>
          <section class="story-settings-modal" role="dialog" aria-modal="true" aria-labelledby="story-settings-title">
            <header>
              <div>
                <p>CARTRIDGE CONFIGURATION</p>
                <h2 id="story-settings-title">Story settings</h2>
              </div>
              <button type="button" aria-label="Close story settings" on:click={closeStorySettings}>×</button>
            </header>

            <div class="story-settings-content">
              <section class="settings-section metadata-settings">
                <div class="settings-section-heading">
                  <div>
                    <span>01</span>
                    <h3>Story details</h3>
                  </div>
                  <label class="mode-checkbox story-protection-toggle">
                    <input
                      type="checkbox"
                      checked={editingStory.protected}
                      on:change={(event) => requestProtectionChange(event.currentTarget.checked)}
                    >
                    Protect from deletion
                  </label>
                </div>
                <p class="field-help">Protection prevents deletion but never blocks editing.</p>
                <div class="metadata-settings-grid">
                  <label>
                    <span>Story title</span>
                    <input bind:value={editingStory.title} maxlength="80">
                  </label>
                  <label>
                    <span>Author</span>
                    <input bind:value={editingStory.author} maxlength="80">
                  </label>
                  <label class="description-field">
                    <span>Description</span>
                    <textarea bind:value={editingStory.description} maxlength="500" rows="4"></textarea>
                  </label>
                </div>
              </section>

              <section class="settings-section map-settings-section">
                <div class="settings-section-heading">
                  <div>
                    <span>02</span>
                    <h3>Maps and cast</h3>
                  </div>
                  <small>Choose the map you are configuring and its playable characters.</small>
                </div>
      <div class="map-toolbar">
        <div class="map-tabs" aria-label="Story map">
          {#if editingStory.playModes.singleplayer}
            <button class:active={activeStoryMap === 'singleplayer'} type="button" on:click={() => selectStoryMap('singleplayer')}>
              SINGLEPLAYER MAP
            </button>
          {/if}
          {#if editingStory.playModes.multiplayer}
            <button class:active={activeStoryMap === 'multiplayer'} type="button" on:click={() => selectStoryMap('multiplayer')}>
              MULTIPLAYER MAP
            </button>
          {/if}
        </div>
        <div class="mode-toggles">
          <label class="mode-checkbox">
            <input
              type="checkbox"
              checked={editingStory.playModes.singleplayer}
              disabled={editingStory.playModes.singleplayer && !editingStory.playModes.multiplayer}
              on:change={(event) => setStoryModeEnabled('singleplayer', event.currentTarget.checked)}
            >
            Solo playable
          </label>
          <label class="mode-checkbox">
            <input
              type="checkbox"
              checked={editingStory.playModes.multiplayer}
              disabled={editingStory.playModes.multiplayer && !editingStory.playModes.singleplayer}
              on:change={(event) => setStoryModeEnabled('multiplayer', event.currentTarget.checked)}
            >
            Multiplayer playable
          </label>
        </div>
        <div class="cast-controls">
          {#if activeStoryMap === 'singleplayer'}
            <label>
              <span>Main character</span>
              <select bind:value={editingStory.mainCharacterIds.singleplayer}>
                <option value="">Choose a character</option>
                {#each playableCharacters as character}
                  <option value={character.id}>{character.name}</option>
                {/each}
              </select>
            </label>
          {:else}
            <label>
              <span>Player 1</span>
              <select bind:value={editingStory.mainCharacterIds.multiplayer.p1}>
                <option value="">Choose a character</option>
                {#each playableCharacters as character}
                  <option value={character.id}>{character.name}</option>
                {/each}
              </select>
            </label>
            <label>
              <span>Player 2</span>
              <select bind:value={editingStory.mainCharacterIds.multiplayer.p2}>
                <option value="">Choose a different character</option>
                {#each playableCharacters as character}
                  <option
                    value={character.id}
                    disabled={character.id === editingStory.mainCharacterIds.multiplayer.p1}
                  >{character.name}</option>
                {/each}
              </select>
            </label>
          {/if}
        </div>
      </div>
              </section>

      <details class="start-settings settings-section" open>
        <summary>
          <span><i>03</i> Story start</span>
          <strong>{storyStartIssue(editingStory) || 'Ready to play'}</strong>
        </summary>
        <div class="start-settings-content">
          {#if activeStoryMap === 'singleplayer'}
            <label>
              <span>Single-player start node</span>
              <select bind:value={editingStory.singleplayerInitialSceneId}>
                <option value="">No start selected</option>
                {#each eligibleStartNodes('p1') as node}
                  <option value={node.id}>{displayNodeName(node)}</option>
                {/each}
              </select>
            </label>
          {:else}
            <fieldset class="start-mode-options">
              <legend>Multiplayer opening</legend>
              <label>
                <input
                  type="radio"
                  name="multiplayer-start-mode"
                  checked={editingStory.multiplayerStartMode === 'shared'}
                  on:change={() => setMultiplayerStartMode('shared')}
                >
                One shared start for both players
              </label>
              <label>
                <input
                  type="radio"
                  name="multiplayer-start-mode"
                  checked={editingStory.multiplayerStartMode === 'separate'}
                  on:change={() => setMultiplayerStartMode('separate')}
                >
                Separate Player 1 and Player 2 starts
              </label>
            </fieldset>

            {#if editingStory.multiplayerStartMode === 'shared'}
              <label>
                <span>Shared start node</span>
                <select value={editingStory.initialSceneIds.p1} on:change={(event) => setSharedStart(event.currentTarget.value)}>
                  <option value="">No shared start selected</option>
                  {#each eligibleStartNodes('both') as node}
                    <option value={node.id}>{displayNodeName(node)}</option>
                  {/each}
                </select>
              </label>
            {:else}
              <div class="start-node-grid">
                <label>
                  <span>Player 1 start node</span>
                  <select bind:value={editingStory.initialSceneIds.p1}>
                    <option value="">No Player 1 start selected</option>
                    {#each eligibleStartNodes('p1') as node}
                      <option value={node.id}>{displayNodeName(node)}</option>
                    {/each}
                  </select>
                </label>
                <label>
                  <span>Player 2 start node</span>
                  <select bind:value={editingStory.initialSceneIds.p2}>
                    <option value="">No Player 2 start selected</option>
                    {#each eligibleStartNodes('p2') as node}
                      <option value={node.id}>{displayNodeName(node)}</option>
                    {/each}
                  </select>
                </label>
              </div>
            {/if}
          {/if}
          <p>Only player-facing scene nodes and Condition nodes can start a cartridge. Incomplete starts save safely as an unavailable draft.</p>
        </div>
      </details>

      <section class="relationship-settings settings-section">
        <div class="settings-section-heading relationship-section-heading">
          <div>
            <span>04</span>
            <h3>Relationships</h3>
          </div>
          <div class="relationship-player-tabs" aria-label="Relationship player">
            <button
              class:active={relationshipSettingsPlayer === 'p1'}
              type="button"
              on:click={() => relationshipSettingsPlayer = 'p1'}
            >Player 1</button>
            <button
              class:active={relationshipSettingsPlayer === 'p2'}
              type="button"
              disabled={!editingStory.playModes.multiplayer}
              on:click={() => relationshipSettingsPlayer = 'p2'}
            >Player 2</button>
          </div>
        </div>
        <div class="relationship-settings-content">
          <div class="relationship-settings-heading">
            <p>
              Configure {relationshipSettingsPlayer === 'p1' ? 'Player 1' : 'Player 2'}’s starting relationship meters.
              Player State nodes in that player’s lane change these values; shared nodes change both players when both have that relationship configured.
            </p>
            <button
              type="button"
              disabled={relationshipTargets().length === 0}
              on:click={addRelationship}
            >
              + Add relationship
            </button>
          </div>

          {#if configuredRelationshipsForPlayer(relationshipSettingsPlayer).length === 0}
            <p class="relationship-empty">No relationship meters are configured for this player.</p>
          {:else}
            <div class="relationship-config-list">
              {#each configuredRelationshipsForPlayer(relationshipSettingsPlayer) as entry}
                {@const relationship = entry.relationship}
                {@const index = entry.index}
                <article>
                  <label>
                    <span>Character</span>
                    <select
                      value={relationship.characterId}
                      on:change={(event) => setRelationshipTarget(index, event)}
                    >
                      {#each relationshipTargets(index) as target}
                        <option value={target.id}>{target.name}</option>
                      {/each}
                    </select>
                  </label>
                  <label>
                    <span>Starting value</span>
                    <input
                      type="number"
                      bind:value={editingStory.relationships[index].initialValue}
                      on:change={() => normalizeRelationship(index)}
                    >
                  </label>
                  <label>
                    <span>Minimum</span>
                    <input
                      type="number"
                      bind:value={editingStory.relationships[index].minimum}
                      on:change={() => normalizeRelationship(index)}
                    >
                  </label>
                  <label>
                    <span>Maximum</span>
                    <input
                      type="number"
                      bind:value={editingStory.relationships[index].maximum}
                      on:change={() => normalizeRelationship(index)}
                    >
                  </label>
                  <label class="relationship-visible-toggle">
                    <input type="checkbox" bind:checked={editingStory.relationships[index].visible}>
                    <span>Visible to player</span>
                  </label>
                  <button
                    class="relationship-remove"
                    type="button"
                    aria-label={`Remove relationship with ${relationshipTargetName(relationship.id)}`}
                    on:click={() => removeRelationship(index)}
                  >
                    Remove
                  </button>
                </article>
              {/each}
            </div>
          {/if}
        </div>
      </section>

            </div>
            <footer>
              <span>{storyStartIssue(editingStory) || 'Cartridge configuration is playable.'}</span>
              <button class="primary-button" type="button" on:click={closeStorySettings}>Done</button>
            </footer>
          </section>
        </div>
      {/if}

      <p class="graph-position-help">
        Routes control rows. Select a node to edit its previous and next connections in the inspector.
      </p>

      <div class="editor-workspace" style={`--inspector-width: ${inspectorWidth}px`}>
        <div class="flow-panel">
          {#if linkSelection}
            <div class="link-mode-banner" role="status">
              <span>Select a destination for {linkSelection.label.toLowerCase()}.</span>
              <button type="button" on:click={cancelLinkSelection}>Cancel</button>
            </div>
          {/if}

          <div
            class="map-zoom-controls"
            class:link-active={Boolean(linkSelection)}
            aria-label="Story map zoom controls"
          >
            <button
              type="button"
              aria-label="Zoom out story map"
              disabled={mapZoom <= minimumMapZoom}
              on:click={() => adjustMapZoom(-mapZoomStep)}
            >−</button>
            <button type="button" aria-label="Reset story map zoom" on:click={resetMapZoom}>
              {Math.round(mapZoom * 100)}%
            </button>
            <button
              type="button"
              aria-label="Zoom in story map"
              disabled={mapZoom >= maximumMapZoom}
              on:click={() => adjustMapZoom(mapZoomStep)}
            >+</button>
          </div>

          <div
            class="flow-canvas"
            class:selecting-route={Boolean(linkSelection)}
            aria-label="Story flow"
            bind:this={flowCanvasElement}
          >
            <div
              class="flow-lanes"
              class:singleplayer-map={activeStoryMap === 'singleplayer'}
              style={`zoom: ${mapZoom}`}
            >
            {#each lanes as lane (`${lane.id}:${storyRevision}`)}
              {@const laneGraph = getLaneGraph(lane.id)}
              <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
              <section
                class="flow-lane"
                class:active={activeLane === lane.id}
                class:has-branches={laneGraph.maxColumns > 1}
                class:singleplayer-disabled={activeStoryMap === 'singleplayer' && lane.id !== 'p1'}
                style={`--lane-columns: ${laneGraph.maxColumns}; --lane-column-width: ${laneGraph.columnWidth}px`}
                role="group"
                aria-label={`${lane.label} lane`}
              >
                <button
                  class="lane-heading"
                  type="button"
                  disabled={activeStoryMap === 'singleplayer' && lane.id !== 'p1'}
                  on:click|stopPropagation={() => activeLane = lane.id}
                >
                  <span>{lane.label}</span>
                  <strong>
                    {getLaneNodes(lane.id).filter((node) => node.type !== 'label' && !isCompanionNode(node)).length} FLOW
                    · {getLaneNodes(lane.id).filter(isCompanionNode).length} COMPANION
                  </strong>
                </button>

                <div class="lane-node-grid">
                  {#each laneGraph.levels as level (level.depth)}
                    <div
                      class="graph-level"
                      class:parallel-level={level.nodes.length > 1}
                      class:merge-level={level.nodes.some(nodeMergesRoutes)}
                      data-depth={level.depth}
                      style={`--level-columns: ${laneGraph.maxColumns}`}
                    >
                      {#each level.nodes as node (`${node.id}:${storyRevision}`)}
                        <!-- svelte-ignore a11y-no-static-element-interactions -->
                        <div
                          role="listitem"
                          class="node-wrapper"
                          class:selected-node-wrapper={selectedNodeId === node.id}
                          data-node-id={node.id}
                          data-revision={storyRevision}
                          class:branch-node={nodeHasBranches(node)}
                          class:merge-node={nodeMergesRoutes(node)}
                          class:companion-node={isCompanionNode(node)}
                          class:stacked-companion={companionStackIndex(level.nodes, node) > 0}
                          class:has-route={routeFields(node).some((field) => getRouteValue(node, field))}
                          class:connected-before={nodeIsIncomingConnection(node, selectedNode)}
                          class:connected-after={nodeIsOutgoingConnection(node, selectedNode)}
                          class:connected-companion={nodeIsCompanionConnection(node, selectedNode)}
                          style={`--companion-stack-index: ${companionStackIndex(level.nodes, node)}; --node-column: ${centeredVisualLevelColumn(laneGraph.maxColumns, level.nodes, node)}`}
                        >
                          {#if branchPathLabel(node)}
                            <span class="branch-path-label">{branchPathLabel(node)}</span>
                          {:else if nodeMergesRoutes(node)}
                            <span class="branch-path-label merge-label">MERGED PATHS</span>
                          {/if}
                      <div class="node-quick-actions" aria-label={`Quick actions for ${displayNodeName(node)}`}>
                        {#if !isCompanionNode(node)}
                          <button
                            class="node-companion-button"
                            type="button"
                            aria-label={`Add companion to ${displayNodeName(node)}`}
                            title="Add companion"
                            on:click|stopPropagation={() => openCompanionPicker(node)}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M12 5v14M5 12h14"></path>
                            </svg>
                          </button>
                        {/if}
                        <button
                          class="node-expand-button"
                          type="button"
                          aria-label={`Expand properties for ${displayNodeName(node)}`}
                          title="Expand properties"
                          on:click|stopPropagation={() => openExpandedInspector(node)}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M9 4H4v5M15 4h5v5M20 15v5h-5M4 15v5h5"></path>
                          </svg>
                        </button>
                        <button type="button" aria-label={`Copy ${displayNodeName(node)}`} title="Copy" on:click|stopPropagation={() => copyNode(node)}>
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <rect x="8" y="8" width="11" height="11" rx="2"></rect>
                            <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>
                          </svg>
                        </button>
                        <button type="button" aria-label={`Duplicate ${displayNodeName(node)}`} title="Duplicate" on:click|stopPropagation={() => duplicateNode(node)}>
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <rect x="5" y="5" width="10" height="10" rx="2"></rect>
                            <path d="M9 15v2a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2"></path>
                            <path d="M10 8v4M8 10h4"></path>
                          </svg>
                        </button>
                        <button class="quick-delete" type="button" aria-label={`Delete ${displayNodeName(node)}`} title="Delete" on:click|stopPropagation={() => deleteNode(node)}>
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M4 7h16M9 7V4h6v3M8 10v8M12 10v8M16 10v8M6 7l1 14h10l1-14"></path>
                          </svg>
                        </button>
                      </div>
                      <button
                        class={`flow-node ${nodeShapeClass(node.type, nodeIsStart(node))}`}
                        class:selected={selectedNodeId === node.id}
                        class:invalid={nodeIsInvalid(node)}
                        class:label-node={node.type === 'label'}
                        class:valid-link-target={Boolean(linkSelection) && isValidLinkTarget(node)}
                        class:invalid-link-target={Boolean(linkSelection) && !isValidLinkTarget(node)}
                        type="button"
                        on:pointerdown|preventDefault|stopPropagation={() => selectNode(node)}
                      >
                        {#if startNodeLabel(node)}
                          <span class="start-node-badge">{startNodeLabel(node)}</span>
                        {/if}
                        {#if isCompactSpecialNode(node)}
                          <strong class="compact-node-title">{compactNodeTitle(node)}</strong>
                          {#if isMultiplayerNodeType(node.type)}
                            <span class="multiplayer-badge">MULTIPLAYER</span>
                          {/if}
                        {:else}
                          <span>{nodeOrdinal(node)}</span>
                          <div class="node-badge-row">
                            {#if isCompanionNode(node)}
                              <span class="companion-badge">COMPANION</span>
                            {/if}
                            {#if isMultiplayerNodeType(node.type)}
                              <span class="multiplayer-badge">MULTIPLAYER</span>
                            {/if}
                          </div>
                          <strong>{displayNodeName(node)}</strong>
                          <small>{nodeIsInvalid(node) ? 'INCOMPLETE CONNECTION' : node.id}</small>
                          <span class="node-route-list">
                            {#if isCompanionNode(node) && node.attachedTo !== undefined}
                              <span>
                                WITH → {attachedHostLabel(node).toUpperCase()}
                              </span>
                            {:else}
                              {#each routeFields(node).filter((field) => getRouteValue(node, field)) as field}
                                <span class:loop-route={routeIsLoop(node, field)}>
                                  {routeFieldLabel(node, field)} → {routeLabel(node, field)}
                                  {#if routeIsLoop(node, field)}
                                    <strong>↻ LOOP</strong>
                                  {/if}
                                </span>
                              {/each}
                            {/if}
                          </span>
                        {/if}
                      </button>

                      {#each routeFields(node).filter((field) => !getRouteValue(node, field)) as field}
                        <button
                          class="branch-add-button"
                          type="button"
                          on:click|stopPropagation={() => openNodePicker({
                            lane: lane.id,
                            sourceId: node.id,
                            field,
                            insertAfterId: node.id
                          })}
                        >
                          + {routeFieldLabel(node, field)}
                        </button>
                      {/each}
                        </div>
                      {/each}
                    </div>
                  {/each}
                </div>

                <button
                  class="lane-add-button"
                  type="button"
                  disabled={activeStoryMap === 'singleplayer' && lane.id !== 'p1'}
                  on:click|stopPropagation={() => openNodePicker({
                    lane: lane.id,
                    insertAfterId: getLaneNodes(lane.id).at(-1)?.id
                  })}
                >
                  <span>＋</span>
                  Add to {lane.label.toLowerCase()}
                </button>
              </section>
            {/each}
            </div>
          </div>
        </div>

        {#if inspectorExpanded}
          <button
            class="inspector-modal-backdrop"
            type="button"
            aria-label="Close expanded node properties"
            on:click={closeExpandedInspector}
          ></button>
        {/if}

        <button
          class="inspector-resizer"
          class:active={isResizingInspector}
          type="button"
          aria-label="Resize node properties sidebar"
          title="Drag to resize node properties"
          on:pointerdown={beginInspectorResize}
          on:keydown={handleInspectorResizeKey}
        ></button>

        <aside
          class="node-inspector"
          class:expanded={inspectorExpanded}
          role={inspectorExpanded ? 'dialog' : undefined}
          aria-modal={inspectorExpanded ? 'true' : undefined}
          aria-label={inspectorExpanded ? 'Expanded node properties' : 'Node inspector'}
          bind:this={inspectorElement}
        >
          {#if selectedNode}
            {#if inspectorExpanded}
              <button
                class="inspector-modal-x"
                type="button"
                aria-label="Close expanded node properties"
                on:click={closeExpandedInspector}
              >×</button>
            {/if}

            <div class="inspector-scroll-content">
            <div class="inspector-heading">
              <div>
                <p>NODE INSPECTOR</p>
                <h2>{selectedNode.type}</h2>
                <code>{selectedNode.id}</code>
              </div>
            </div>

            {#if activeStoryMap === 'singleplayer' && ['checkpoint', 'conversation', 'vote'].includes(selectedNode.type)}
              <p class="inspector-warning">This is a multiplayer-only node. Replace it before playing this solo map.</p>
            {/if}

            {#if selectedNode.type !== 'label'
              && !nodeIsStart(selectedNode)
              && !(isCompanionNode(selectedNode) && selectedNode.attachedTo !== undefined)}
              <div class="route-label">Previous node</div>
              <div class="previous-route-list">
                {#if incomingConnections(selectedNode).length === 0}
                  <span class="missing">No incoming connection</span>
                {:else}
                  {#each incomingConnections(selectedNode) as connection}
                    <div>
                      <button class="route-node-link" type="button" on:click={() => selectConnectedNode(connection.node.id)}>
                        {displayNodeName(connection.node)} · {routeFieldLabel(connection.node, connection.field)}
                      </button>
                      <button
                        type="button"
                        aria-label={`Disconnect ${displayNodeName(connection.node)}`}
                        on:click={() => clearIncomingRoute(connection.node, connection.field)}
                      >×</button>
                    </div>
                  {/each}
                {/if}
              </div>
              <button class="select-previous-button" type="button" on:click={startPreviousSelection}>
                Select previous node
              </button>
            {/if}

            {#if routeFields(selectedNode).includes('next')}
              <div class="route-label">
                {isCompanionNode(selectedNode) ? 'Legacy return node' : 'Next node'}
              </div>
              <div class="route-control">
                <button
                  class="route-node-link"
                  class:missing={!selectedNode.next}
                  type="button"
                  disabled={!selectedNode.next}
                  on:click={() => selectConnectedNode(selectedNode.next)}
                >{routeLabel(selectedNode, 'next')}</button>
                <button type="button" on:click={() => startLinkSelection('next', 'Next node')}>
                  {isCompanionNode(selectedNode) ? 'Select legacy return' : 'Select next node'}
                </button>
                {#if selectedNode.next}
                  <button type="button" aria-label="Clear next node" on:click={() => clearRoute(selectedNode, 'next')}>×</button>
                {/if}
              </div>
            {/if}

            {#if isCompanionNode(selectedNode) && selectedNode.attachedTo !== undefined}
              <div class="route-label">Attached to story node</div>
              <div class="route-control">
                <span class:missing={!selectedNode.attachedTo}>
                  {attachedHostLabel(selectedNode)}
                </span>
                <button type="button" on:click={startAttachmentSelection}>Select host node</button>
                {#if selectedNode.attachedTo}
                  <button type="button" aria-label="Clear companion host" on:click={() => {
                    rememberForUndo();
                    selectedNode.attachedTo = '';
                    refreshStory();
                  }}>×</button>
                {/if}
              </div>
            {/if}

            {#if selectedNode.type === 'note'}
              <label for="note-text">Author note</label>
              <textarea
                id="note-text"
                bind:value={selectedNode.text}
                rows="10"
                maxlength="5000"
                placeholder="Record context or reminders for other authors."
              ></textarea>
              <p class="inspector-help">Notes only appear in the editor and never enter the terminal.</p>
            {/if}

            {#if selectedNode.type === 'label'}
              <label for="label-text">Label title</label>
              <input
                id="label-text"
                bind:value={selectedNode.text}
                maxlength="60"
                placeholder="Chapter or section label"
              >
              <p class="inspector-help">Labels organize the editor beside their host and never appear during play.</p>
            {/if}

            {#if selectedNode.type !== 'condition'
              && selectedNode.type !== 'input'
              && selectedNode.type !== 'clear-terminal'
              && !(isCompanionNode(selectedNode) && selectedNode.attachedTo !== undefined)}
              <label for="node-text">
                {selectedNode.type === 'label' ? 'Label title' : 'Terminal text'}
              </label>
              <textarea
                id="node-text"
                bind:value={selectedNode.text}
                rows="5"
                maxlength={selectedNode.type === 'label' ? 60 : undefined}
              ></textarea>
            {/if}

            {#if selectedNode.type === 'input'}
              <label for="input-prompt">Player prompt</label>
              <textarea id="input-prompt" bind:value={selectedNode.prompt} rows="5"></textarea>
              <label class="choice-disabled-toggle">
                <input type="checkbox" bind:checked={selectedNode.saveInput}>
                Store this response for later nodes
              </label>
              {#if selectedNode.saveInput}
                <label for="input-key">Saved input key</label>
                <input
                  id="input-key"
                  bind:value={selectedNode.inputKey}
                  placeholder="FAVORITE_COLOR"
                >
                <p class="inspector-help">
                  This response is added to this cartridge’s input library until the story restarts.
                </p>
              {/if}
              <label for="input-placeholder">Input placeholder</label>
              <input id="input-placeholder" bind:value={selectedNode.placeholder} placeholder="Type your response…">
              <label for="input-max-length">Maximum response length</label>
              <input
                id="input-max-length"
                type="number"
                min="1"
                max="2000"
                bind:value={selectedNode.maxLength}
              >
            {/if}

            {#if storedInputNodes.length > 0
              && !['condition', 'label', 'note', 'clear-terminal'].includes(selectedNode.type)}
              <label for="stored-input-token">Insert a stored input value</label>
              <select id="stored-input-token" value="" on:change={insertStoredInputToken}>
                <option value="">Choose from this story’s input library…</option>
                {#each storedInputNodes as inputNode}
                  <option value={storedInputToken(inputNode.inputKey)}>
                    {inputNode.inputKey} · {inputNode.prompt || inputNode.id}
                  </option>
                {/each}
              </select>
            {/if}

            {#if supportsSpeakerProperties(selectedNode)}
              <label for="node-speaker">Speaker</label>
              <select id="node-speaker" bind:value={selectedNode.characterId}>
                <option value="">Custom speaker</option>
                {#each speakerCharacters as character}
                  <option value={character.id}>{character.name}</option>
                {/each}
              </select>

              {#if selectedNode.characterId}
                <label for="speaker-expression">Expression</label>
                <select id="speaker-expression" bind:value={selectedNode.expression}>
                  <option value="normal">Normal</option>
                  <option value="shocked">Shocked</option>
                  <option value="angry">Angry</option>
                  <option value="sad">Sad</option>
                  <option value="happy">Happy</option>
                </select>
                {@const dialogueCharacter = $characterLibraryState.characters.find(
                  (character) => character.id === selectedNode.characterId
                )}
                {#if dialogueCharacter && characterExpressionImage(dialogueCharacter, selectedNode.expression)}
                  <div class="image-preview image-preview--portrait">
                    <img
                      src={characterExpressionImage(dialogueCharacter, selectedNode.expression)}
                      alt={`${dialogueCharacter.name} ${selectedNode.expression ?? 'normal'} expression`}
                      style:object-position={`${characterExpressionPosition(dialogueCharacter, selectedNode.expression).x}% ${characterExpressionPosition(dialogueCharacter, selectedNode.expression).y}%`}
                    >
                    <span>{dialogueCharacter.name} · {selectedNode.expression ?? 'normal'}</span>
                  </div>
                {:else}
                  <p class="inspector-help">This expression has no image yet. Add it in Characters.</p>
                {/if}
              {:else}
                <label for="custom-speaker-name">Custom speaker name</label>
                <input id="custom-speaker-name" bind:value={selectedNode.speaker}>
                <span class="inspector-label">Custom speaker image</span>
                {#if selectedNode.portrait}
                  <div class="image-preview image-preview--portrait">
                    <img src={selectedNode.portrait} alt={selectedNode.portraitAlt ?? ''}>
                    <span>{selectedNode.portrait.split('/').at(-1)}</span>
                  </div>
                {/if}
                <button type="button" on:click={() => openImageLibrary('portrait')}>Select speaker image</button>
                {#if selectedNode.portrait}
                  <button type="button" on:click={removeCustomSpeakerPortrait}>Remove speaker image</button>
                  <label for="custom-speaker-image-alt">Speaker image description</label>
                  <input id="custom-speaker-image-alt" bind:value={selectedNode.portraitAlt} placeholder="Describe the speaker portrait">
                {/if}
              {/if}
            {/if}

            {#if selectedNode.type === 'dialogue'}
              <label for="dialogue-continue-label">Continue button text</label>
              <input
                id="dialogue-continue-label"
                bind:value={selectedNode.continueLabel}
                maxlength="60"
                placeholder="Continue"
              >
              <label class="choice-disabled-toggle">
                <input type="checkbox" bind:checked={selectedNode.timed}>
                Timed dialogue — disable Continue and advance automatically
              </label>
              {#if selectedNode.timed}
                <label for="dialogue-duration">Automatic wait in milliseconds</label>
                <input
                  id="dialogue-duration"
                  type="number"
                  min="100"
                  step="100"
                  bind:value={selectedNode.durationMs}
                >
                <label class="choice-disabled-toggle">
                  <input type="checkbox" bind:checked={selectedNode.showCountdown}>
                  Show countdown text to the player
                </label>
              {/if}
            {/if}

            {#if selectedNode.type === 'dice-check'}
              <div class="field-grid">
                <div>
                  <label for="dice-type">Die</label>
                  <select id="dice-type" bind:value={selectedNode.die}>
                    {#each [4, 6, 8, 10, 12, 20] as die}
                      <option value={die}>D{die}</option>
                    {/each}
                  </select>
                </div>
                <div>
                  <label for="dice-stat">Stat</label>
                  <select id="dice-stat" bind:value={selectedNode.stat}>
                    {#each characterStats as stat}
                      <option value={stat}>{stat[0].toUpperCase() + stat.slice(1)}</option>
                    {/each}
                  </select>
                </div>
                <div>
                  <label for="dice-target">Target</label>
                  <input id="dice-target" type="number" bind:value={selectedNode.threshold}>
                </div>
              </div>
              {#if activeStoryMap === 'multiplayer'}
                <label class="choice-disabled-toggle">
                  <input
                    type="checkbox"
                    bind:checked={selectedNode.spectatorRoll}
                    disabled={!selectedNode.spectatorRoll
                      && !['p1', 'p2'].includes(selectedNode.audience ?? 'both')}
                  >
                  Let the other player spectate this roll
                </label>
                <p class="inspector-help">
                  Put this Dice node in the rolling player’s lane, then route a Shared Vote option into it.
                  Both players enter the dice terminal, but only the selected player can roll or close it.
                </p>
              {/if}
              <div class="route-label">Success node</div>
              <div class="route-control">
                <button class="route-node-link" type="button" disabled={!selectedNode.success} on:click={() => selectConnectedNode(selectedNode.success)}>{routeLabel(selectedNode, 'success')}</button>
                <button type="button" on:click={() => startLinkSelection('success', 'Success node')}>Select node</button>
                {#if selectedNode.success}
                  <button type="button" aria-label="Clear success node" on:click={() => clearRoute(selectedNode, 'success')}>×</button>
                {/if}
              </div>
              <div class="route-label">Failure node</div>
              <div class="route-control">
                <button class="route-node-link" type="button" disabled={!selectedNode.failure} on:click={() => selectConnectedNode(selectedNode.failure)}>{routeLabel(selectedNode, 'failure')}</button>
                <button type="button" on:click={() => startLinkSelection('failure', 'Failure node')}>Select node</button>
                {#if selectedNode.failure}
                  <button type="button" aria-label="Clear failure node" on:click={() => clearRoute(selectedNode, 'failure')}>×</button>
                {/if}
              </div>
            {/if}

            {#if selectedNode.type === 'checkpoint'}
              <label for="checkpoint-id">Checkpoint key</label>
              <input id="checkpoint-id" bind:value={selectedNode.checkpointId}>
            {/if}

            {#if selectedNode.type === 'conversation'}
              <label for="first-speaker">First speaker</label>
              <select id="first-speaker" bind:value={selectedNode.firstPlayer}>
                <option value="random">Random</option>
                <option value="p1">Player 1</option>
                <option value="p2">Player 2</option>
              </select>
              <div class="field-grid">
                <div>
                  <label for="p1-messages">Player 1 turns</label>
                  <input
                    id="p1-messages"
                    type="number"
                    min="0"
                    value={selectedNode.messagesPerPlayer.p1}
                    on:change={(event) => updateConversationCount('p1', Number(event.currentTarget.value))}
                  >
                </div>
                <div>
                  <label for="p2-messages">Player 2 turns</label>
                  <input
                    id="p2-messages"
                    type="number"
                    min="0"
                    value={selectedNode.messagesPerPlayer.p2}
                    on:change={(event) => updateConversationCount('p2', Number(event.currentTarget.value))}
                  >
                </div>
              </div>
            {/if}

            {#if ['choice', 'vote'].includes(selectedNode.type)}
              {#if selectedNode.type === 'choice'}
                <fieldset class="decision-severity">
                  <legend>Decision severity</legend>
                  <p>Remember the selected option so later conditions can reference it.</p>
                  {#each ['none', 'minor', 'major'] as severity}
                    <label>
                      <input type="radio" name={`decision-severity-${selectedNode.id}`} value={severity} bind:group={selectedNode.decisionSeverity}>
                      {severity[0].toUpperCase() + severity.slice(1)}
                    </label>
                  {/each}
                </fieldset>
              {/if}
              {#if selectedNode.type === 'choice'}
                <label class="choice-disabled-toggle">
                  <input type="checkbox" bind:checked={selectedNode.timed}>
                  Timed choice
                </label>
              {/if}
              {#if selectedNode.type === 'choice' && selectedNode.timed}
                <label for="choice-duration">Timer in milliseconds</label>
                <input id="choice-duration" type="number" min="1000" bind:value={selectedNode.durationMs}>
                <label class="choice-disabled-toggle">
                  <input type="checkbox" bind:checked={selectedNode.showCountdown}>
                  Show countdown text to the player
                </label>
              {/if}
              <label for="choice-count">Number of buttons</label>
              <input
                id="choice-count"
                type="number"
                min="2"
                max="5"
                value={selectedNode.choices?.length ?? 2}
                on:input={setChoiceCount}
              >
              <p class="inspector-help">
                Add between two and five buttons. Disabled buttons remain visible but cannot be selected.
              </p>
              {#if selectedNode.type === 'choice' && selectedNode.timed}
                <label for="fallback-choice">Automatic fallback</label>
                <select id="fallback-choice" bind:value={selectedNode.fallbackChoiceId}>
                  {#each enabledNodeChoices(selectedNode) as choice}
                    <option value={choice.id}>{choice.label || choice.id}</option>
                  {/each}
                </select>
              {/if}
              <div class="choice-editor">
                <div class="choice-heading">
                  <h3>Options</h3>
                  <button
                    type="button"
                    disabled={(selectedNode.choices?.length ?? 0) >= 5}
                    on:click={addChoice}
                  >+ {nextChoiceLabel()}</button>
                </div>
                {#each selectedNode.choices ?? [] as choice, index}
                  <div class="choice-row">
                    <div class="choice-row-heading">
                      <strong>OPTION {index + 1}</strong>
                      <button
                        type="button"
                        aria-label={`Remove option ${index + 1}`}
                        disabled={(selectedNode.choices?.length ?? 0) <= 2}
                        on:click={() => removeChoice(index)}
                      >× Remove</button>
                    </div>
                    <label>
                      <span>Internal option ID</span>
                      <input bind:value={choice.id} placeholder="option-id">
                    </label>
                    <label>
                      <span>Button text</span>
                      <input bind:value={choice.label} placeholder="Player-facing label">
                    </label>
                    <label class="choice-disabled-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(choice.disabled)}
                        on:change={(event) => setChoiceDisabled(index, event.currentTarget.checked)}
                      >
                      Disabled
                    </label>
                    <label class="choice-disabled-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(choice.condition)}
                        on:change={(event) => setChoiceCondition(index, event.currentTarget.checked)}
                      >
                      Require campaign state
                    </label>
                    {#if choice.condition}
                      <div class="choice-condition-editor">
                        <select
                          aria-label="Requirement type"
                          value={choice.condition.type.startsWith('relationship-') ? 'relationship-at-least' : choice.condition.type}
                          on:change={(event) => setChoiceConditionType(index, event)}
                        >
                          <option value="has-item">Has item</option>
                          <option value="flag-equals">Flag equals</option>
                          <option value="stat-at-least">Stat at least</option>
                          <option value="relationship-at-least">Relationship</option>
                          <option value="decision-made">Remembered decision</option>
                        </select>
                        {#if choice.condition.type === 'decision-made'}
                          <select aria-label="Remembered decision" bind:value={choice.condition.key}>
                            <option value="">Choose a remembered option</option>
                            {#each rememberedChoiceOptions as rememberedChoice}
                              <option value={rememberedChoice.key}>{rememberedChoice.label}</option>
                            {/each}
                          </select>
                        {:else if choice.condition.type === 'has-item'}
                          <select aria-label="Required item" bind:value={choice.condition.key}>
                            <option value="">Choose a story item</option>
                            {#each knownStoryItems as item}
                              <option value={item}>{item}</option>
                            {/each}
                          </select>
                        {:else if choice.condition.type === 'flag-equals'}
                          <select
                            aria-label="Required story flag"
                            value={choice.condition.key}
                            on:change={(event) => setChoiceConditionFlag(index, event)}
                          >
                            <option value="">Choose a story flag</option>
                            {#each knownStoryFlags as flag}
                              <option value={flag}>{flag}</option>
                            {/each}
                          </select>
                        {:else if choice.condition.type === 'stat-at-least'}
                          <select aria-label="Required player stat" bind:value={choice.condition.key}>
                            {#each characterStats as stat}
                              <option value={stat}>{stat}</option>
                            {/each}
                          </select>
                        {:else if choice.condition.type.startsWith('relationship-')}
                          <select aria-label="Relationship target" bind:value={choice.condition.key}>
                            <option value="">Choose a configured relationship</option>
                            {#each relationshipsForNode(selectedNode) as relationship}
                              <option value={relationship.id}>{relationshipTargetName(relationship.id)}</option>
                            {/each}
                          </select>
                          <select aria-label="Relationship comparison" bind:value={choice.condition.type}>
                            <option value="relationship-at-least">Is at least</option>
                            <option value="relationship-at-most">Is at most</option>
                          </select>
                        {/if}
                        {#if choice.condition.type === 'flag-equals'}
                          <select aria-label="Required flag value" bind:value={choice.condition.value}>
                            <option value="">Choose a value set by this story</option>
                            {#each storyFlagValues(choice.condition.key) as flagValue}
                              <option value={flagValue}>{flagValue}</option>
                            {/each}
                          </select>
                        {:else if choice.condition.type === 'stat-at-least'}
                          <input
                            type="number"
                            aria-label="Required stat value"
                            bind:value={choice.condition.value}
                          >
                        {:else if choice.condition.type.startsWith('relationship-')}
                          <select aria-label="Required relationship level" bind:value={choice.condition.value}>
                            {#each relationshipLevelOptions as level}
                              <option value={level.value}>{level.label} ({level.value > 0 ? '+' : ''}{level.value})</option>
                            {/each}
                          </select>
                        {/if}
                      </div>
                    {/if}
                    <div class="choice-route">
                      <span>Destination</span>
                      <button class="route-node-link" type="button" disabled={!choice.next} on:click={() => selectConnectedNode(choice.next)}>{routeLabel(selectedNode, `choices.${index}.next`)}</button>
                      <button type="button" on:click={() => startLinkSelection(`choices.${index}.next`, `Option ${index + 1}`)}>Select</button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

            {#if selectedNode.type === 'change-character'}
              <label class="choice-disabled-toggle">
                <input type="checkbox" bind:checked={selectedNode.resetToDefault}>
                Reset to the player’s default main character
              </label>
              {#if !selectedNode.resetToDefault}
                <label for="changed-character-id">Assume character identity</label>
                <select id="changed-character-id" bind:value={selectedNode.characterId}>
                  <option value="">Choose a character</option>
                  {#each playableCharacters as character}
                    <option value={character.id}>{character.name}</option>
                  {/each}
                </select>
              {/if}
              <p class="inspector-help">
                The current player uses this character’s name, wallet, and stats until another Change Character node or a story restart.
              </p>
            {/if}

            {#if selectedNode.type === 'screen-effect'}
              <label for="screen-effect-type">Terminal effect</label>
              <select id="screen-effect-type" value={selectedNode.screenEffect} on:change={setScreenEffectType}>
                <option value="color">Terminal color</option>
                <option value="shake">Screen shake</option>
                <option value="blink">Terminal blink</option>
                <option value="mirror">Mirror terminal</option>
                <option value="spin">Spin terminal</option>
                <option value="glow">Pulse glow</option>
                <option value="scan">Scanner bar</option>
              </select>
              {#if selectedNode.screenEffect === 'color'}
                <label for="terminal-color-theme">Terminal color theme</label>
                <select id="terminal-color-theme" bind:value={selectedNode.backgroundTheme}>
                  {#each terminalThemes as theme}
                    <option value={theme}>{theme[0].toUpperCase() + theme.slice(1)}</option>
                  {/each}
                </select>
                <p class="inspector-help">The premade terminal palette is applied while the attached host scene is active.</p>
              {:else if selectedNode.screenEffect === 'mirror'}
                <label for="mirror-axis">Mirror axis</label>
                <select id="mirror-axis" bind:value={selectedNode.mirrorAxis}>
                  <option value="horizontal">Read backwards</option>
                  <option value="vertical">Flip upside down</option>
                  <option value="both">Flip both axes</option>
                </select>
              {/if}
              {#if selectedNode.screenEffect === 'spin'}
                <label for="spin-direction">Spin direction</label>
                <select id="spin-direction" bind:value={selectedNode.spinDirection}>
                  <option value="clockwise">Clockwise</option>
                  <option value="counterclockwise">Counterclockwise</option>
                </select>
              {/if}
              {#if ['glow', 'scan'].includes(selectedNode.screenEffect)}
                <label class="image-color-control" for="screen-effect-color">
                  <span>Effect color</span>
                  <input id="screen-effect-color" type="color" bind:value={selectedNode.effectColor}>
                </label>
              {/if}
              {#if selectedNode.screenEffect === 'scan'}
                <label for="scan-direction">Scan direction</label>
                <select id="scan-direction" bind:value={selectedNode.scanDirection}>
                  <option value="left-to-right">Left to right</option>
                  <option value="right-to-left">Right to left</option>
                  <option value="top-to-bottom">Top to bottom</option>
                  <option value="bottom-to-top">Bottom to top</option>
                </select>
              {/if}
              {#if selectedNode.screenEffect !== 'color'}
                <div class="field-grid">
                  <div>
                    <label for="screen-effect-duration">Speed in seconds</label>
                    <input
                      id="screen-effect-duration"
                      type="number"
                      min="0.1"
                      max="20"
                      step="0.1"
                      bind:value={selectedNode.effectDurationSeconds}
                    >
                  </div>
                  <div class:field-disabled={Boolean(selectedNode.effectLoop)}>
                    <label for="screen-effect-iterations">Trigger / spin count</label>
                    <input
                      id="screen-effect-iterations"
                      type="number"
                      min="1"
                      max="20"
                      step="1"
                      disabled={Boolean(selectedNode.effectLoop)}
                      bind:value={selectedNode.effectIterations}
                    >
                    {#if selectedNode.effectLoop}
                      <small>Unavailable while this effect loops infinitely.</small>
                    {/if}
                  </div>
                </div>
                <label class="choice-disabled-toggle">
                  <input type="checkbox" bind:checked={selectedNode.effectLoop}>
                  Loop until the story moves to the next node
                </label>
                <p class="inspector-help">
                  Different terminal effects attached to the same host stack together. The same effect type can only be attached once.
                </p>
              {/if}
            {/if}

            {#if selectedNode.type === 'item-effect'}
              <label for="item-operation">Item action</label>
              <select
                id="item-operation"
                value={selectedNode.effects[0].type}
                on:change={setItemOperation}
              >
                <option value="add-item">Give item</option>
                <option value="remove-item">Remove item</option>
              </select>

              {#if selectedNode.effects[0].type === 'add-item'}
                <label for="item-name">Item name</label>
                <input id="item-name" bind:value={selectedNode.effects[0].key} placeholder="Map of Vespas">

                <span class="inspector-label">Item image</span>
                {#if selectedNode.effects[0].image}
                  <div class="image-preview">
                    <img src={selectedNode.effects[0].image} alt="">
                    <span>{selectedNode.effects[0].image.split('/').at(-1)}</span>
                  </div>
                  <button type="button" on:click={() => {
                    selectedNode.effects[0].image = '';
                    refreshStory();
                  }}>Remove item image</button>
                {/if}
                <button type="button" on:click={() => openImageLibrary('item')}>
                  {selectedNode.effects[0].image ? 'Change item image' : 'Select item image'}
                </button>
                <p class="inspector-help">
                  Optional. Players can expand this artwork by selecting the item in their Bag.
                </p>
              {:else}
                <label for="item-to-remove">Item to remove</label>
                <input
                  id="item-to-remove"
                  list="known-story-items"
                  bind:value={selectedNode.effects[0].key}
                  placeholder="Map of Vespas"
                >
                <datalist id="known-story-items">
                  {#each knownStoryItems as item}
                    <option value={item}></option>
                  {/each}
                </datalist>
                <p class="inspector-help">Use the exact player-facing item name that was given earlier.</p>
              {/if}

              <label for="item-announcement">Terminal announcement</label>
              <input
                id="item-announcement"
                bind:value={selectedNode.announcementTemplate}
                placeholder="Acquired item: <ITEM>."
              >
              <p class="inspector-help">
                Use &lt;ITEM&gt; wherever the item name should appear. If omitted, the item name is appended.
              </p>
              <div class="effect-preview">
                <span>WHEN TRIGGERED</span>
                <strong>{itemAnnouncementPreview(selectedNode)}</strong>
                <p>
                  {selectedNode.effects[0].type === 'add-item'
                    ? `You can later check this with Player has item → ${selectedNode.effects[0].key || 'Item name'}.`
                    : `Remove ${selectedNode.effects[0].key || 'the named item'} from the player’s Bag.`}
                </p>
              </div>
            {/if}

            {#if selectedNode.type === 'story-flag'}
              <label for="flag-id">Flag ID</label>
              <input id="flag-id" bind:value={selectedNode.effects[0].key} placeholder="has_gone_to_shop">

              <label for="flag-value">Set value to</label>
              <input id="flag-value" bind:value={selectedNode.effects[0].value} placeholder="true">
              <p class="inspector-help">
                Example: has_gone_to_shop → true. A Condition node can compare this exact ID and value later.
              </p>

              {#if storedInputNodes.length > 0}
                <label for="flag-input-value">Use a stored input value</label>
                <select id="flag-input-value" value="" on:change={setEffectStoredInput}>
                  <option value="">Choose from this story’s input library…</option>
                  {#each storedInputNodes as inputNode}
                    <option value={storedInputToken(inputNode.inputKey)}>
                      {inputNode.inputKey} · {inputNode.prompt || inputNode.id}
                    </option>
                  {/each}
                </select>
              {/if}

              <div class="effect-preview">
                <span>WHEN TRIGGERED</span>
                <strong>{selectedNode.effects[0].key || 'flag_id'} → {selectedNode.effects[0].value || 'value'}</strong>
              </div>
            {/if}

            {#if selectedNode.type === 'player-state'}
              <label for="player-state-operation">Player change</label>
              <select
                id="player-state-operation"
                value={selectedNode.effects[0].type}
                on:change={setPlayerStateOperation}
              >
                <option value="adjust-stat">Adjust stat</option>
                <option value="set-player-name">Set player name</option>
                <option value="discover-character">Discover character</option>
                <option value="adjust-relationship">Adjust relationship</option>
                {#if activeStoryMap === 'multiplayer'}
                  <option value="install-mod">Install multiplayer neuro mod</option>
                  <option value="remove-mod">Remove multiplayer neuro mod</option>
                {/if}
              </select>

              {#if selectedNode.effects[0].type === 'adjust-stat'}
                <label for="player-stat">Stat</label>
                <select id="player-stat" bind:value={selectedNode.effects[0].key}>
                  {#each characterStats as stat}
                    <option value={stat}>{stat}</option>
                  {/each}
                </select>

                <label for="player-stat-amount">Amount to add</label>
                <input id="player-stat-amount" type="number" step="1" bind:value={selectedNode.effects[0].value}>
                <p class="inspector-help">Use a negative number to subtract from the stat.</p>
              {:else if selectedNode.effects[0].type === 'set-player-name'}
                <label for="new-player-name">New player name</label>
                <input id="new-player-name" bind:value={selectedNode.effects[0].value} placeholder="New name">
                <p class="inspector-help">
                  This sets a custom name for the current cartridge session. It never renames the reusable character.
                </p>

                {#if storedInputNodes.length > 0}
                  <label for="player-name-input">Use a stored input value</label>
                  <select id="player-name-input" value="" on:change={setEffectStoredInput}>
                    <option value="">Choose from this story’s input library…</option>
                    {#each storedInputNodes as inputNode}
                      <option value={storedInputToken(inputNode.inputKey)}>
                        {inputNode.inputKey} · {inputNode.prompt || inputNode.id}
                      </option>
                    {/each}
                  </select>
                {/if}
              {:else if selectedNode.effects[0].type === 'discover-character'}
                <label for="discovered-character">Character</label>
                <select id="discovered-character" bind:value={selectedNode.effects[0].key}>
                  <option value="">Choose a playable character or NPC</option>
                  {#each speakerCharacters as character}
                    <option value={character.id}>{character.name}</option>
                  {/each}
                </select>
              {:else if selectedNode.effects[0].type === 'adjust-relationship'}
                <label for="relationship-id">With</label>
                <select id="relationship-id" bind:value={selectedNode.effects[0].key}>
                  <option value="">Choose a configured relationship</option>
                  {#each relationshipsForNode(selectedNode) as relationship}
                    <option value={relationship.id}>{relationshipTargetName(relationship.id)}</option>
                  {/each}
                </select>

                <label for="relationship-amount">Amount to add</label>
                <input id="relationship-amount" type="number" step="1" bind:value={selectedNode.effects[0].value}>
                <div class="relationship-amount-buttons" aria-label="Relationship amount shortcuts">
                  {#each [-2, -1, 1, 2] as amount}
                    <button type="button" on:click={() => {
                      selectedNode.effects[0].value = amount;
                      refreshStory();
                    }}>{amount > 0 ? '+' : ''}{amount}</button>
                  {/each}
                </div>

                <label for="relationship-message">Player message</label>
                <input
                  id="relationship-message"
                  bind:value={selectedNode.playerMessage}
                  placeholder="Ajax appreciated your honesty."
                >
                {#if relationshipsForNode(selectedNode).length === 0}
                  <p class="inspector-help">
                    Configure this player’s relationship in Settings first. Shared nodes only list relationships configured for both players.
                  </p>
                {:else}
                  {@const relationshipDefinition = relationshipsForNode(selectedNode).find(
                    (relationship) => relationship.id === selectedNode.effects[0].key
                  )}
                  <div class="effect-preview">
                    <span>WHEN TRIGGERED</span>
                    <strong>
                      The current player’s relationship with
                      {relationshipTargetName(String(selectedNode.effects[0].key || ''))}
                      {Number(selectedNode.effects[0].value ?? 0) < 0 ? 'decreases' : 'increases'} by
                      {Math.abs(Number(selectedNode.effects[0].value ?? 0))},
                      clamped between {relationshipDefinition?.minimum ?? -5} and {relationshipDefinition?.maximum ?? 5}.
                    </strong>
                  </div>
                {/if}
              {:else}
                <label for="neuro-mod-id">Neuro mod ID</label>
                <input id="neuro-mod-id" bind:value={selectedNode.effects[0].key} placeholder="neuro-link-chat">
              {/if}
            {/if}

            {#if selectedNode.type === 'condition'}
              <label for="condition-type">Condition</label>
              <select
                id="condition-type"
                value={selectedNode.condition.type.startsWith('relationship-') ? 'relationship-at-least' : selectedNode.condition.type}
                on:change={setNodeConditionType}
              >
                <option value="has-item">Player has item</option>
                <option value="flag-equals">Story flag equals value</option>
                <option value="stat-at-least">Player stat is at least value</option>
                <option value="relationship-at-least">Player relationship</option>
                <option value="last-dice-success">Previous dice check succeeded</option>
                <option value="decision-made">Player made a remembered decision</option>
                {#if activeStoryMap === 'multiplayer'}
                  <option value="playing-as">Playing as story player</option>
                {/if}
              </select>
              {#if selectedNode.condition.type === 'decision-made'}
                <label for="condition-decision">Remembered option</label>
                <select id="condition-decision" bind:value={selectedNode.condition.key}>
                  <option value="">Choose a remembered option</option>
                  {#each rememberedChoiceOptions as rememberedChoice}
                    <option value={rememberedChoice.key}>{rememberedChoice.label}</option>
                  {/each}
                </select>
              {:else if selectedNode.condition.type === 'playing-as'}
                <label for="condition-player-role">Story role</label>
                <select id="condition-player-role" bind:value={selectedNode.condition.key}>
                  <option value="p1">Player 1</option>
                  <option value="p2">Player 2</option>
                </select>
              {:else if selectedNode.condition.type === 'has-item'}
                <label for="condition-item">Item</label>
                <select id="condition-item" bind:value={selectedNode.condition.key}>
                  <option value="">Choose an item created by this story</option>
                  {#each knownStoryItems as item}
                    <option value={item}>{item}</option>
                  {/each}
                </select>
                {#if knownStoryItems.length === 0}
                  <p class="inspector-help">Add an Item node that gives an item before using this condition.</p>
                {/if}
              {:else if selectedNode.condition.type === 'flag-equals'}
                <label for="condition-flag">Story flag</label>
                <select
                  id="condition-flag"
                  value={selectedNode.condition.key}
                  on:change={setNodeConditionFlag}
                >
                  <option value="">Choose a flag created by this story</option>
                  {#each knownStoryFlags as flag}
                    <option value={flag}>{flag}</option>
                  {/each}
                </select>
                {#if knownStoryFlags.length === 0}
                  <p class="inspector-help">Add a Story Flag node before using this condition.</p>
                {/if}
              {:else if selectedNode.condition.type === 'stat-at-least'}
                <label for="condition-stat">Player stat</label>
                <select id="condition-stat" bind:value={selectedNode.condition.key}>
                  {#each characterStats as stat}
                    <option value={stat}>{stat}</option>
                  {/each}
                </select>
              {:else if selectedNode.condition.type.startsWith('relationship-')}
                <label for="condition-relationship">Relationship with</label>
                <select id="condition-relationship" bind:value={selectedNode.condition.key}>
                  <option value="">Choose a configured relationship</option>
                  {#each relationshipsForNode(selectedNode) as relationship}
                    <option value={relationship.id}>{relationshipTargetName(relationship.id)}</option>
                  {/each}
                </select>
                <label for="condition-relationship-comparison">Comparison</label>
                <select id="condition-relationship-comparison" bind:value={selectedNode.condition.type}>
                  <option value="relationship-at-least">Is at least</option>
                  <option value="relationship-at-most">Is at most</option>
                </select>
                {#if editingStory.relationships.length === 0}
                  <p class="inspector-help">Configure a relationship in Story Relationships before checking one.</p>
                {/if}
              {/if}
              {#if selectedNode.condition.type === 'flag-equals'}
                <label for="condition-value">Comparison value</label>
                <select id="condition-value" bind:value={selectedNode.condition.value}>
                  <option value="">Choose a value set by this story</option>
                  {#each storyFlagValues(selectedNode.condition.key) as flagValue}
                    <option value={flagValue}>{flagValue}</option>
                  {/each}
                </select>
              {:else if selectedNode.condition.type === 'stat-at-least'}
                <label for="condition-value">Minimum stat value</label>
                <input id="condition-value" type="number" bind:value={selectedNode.condition.value}>
              {:else if selectedNode.condition.type.startsWith('relationship-')}
                <label for="condition-value">Relationship level</label>
                <select id="condition-value" bind:value={selectedNode.condition.value}>
                  {#each relationshipLevelOptions as level}
                    <option value={level.value}>{level.label} ({level.value > 0 ? '+' : ''}{level.value})</option>
                  {/each}
                </select>
                <div class="effect-preview">
                  <span>WHEN EVALUATED</span>
                  <strong>
                    If the relationship with {relationshipTargetName(String(selectedNode.condition.key || ''))}
                    is {selectedNode.condition.type === 'relationship-at-most' ? 'at most' : 'at least'}
                    {relationshipLevelOptions.find((level) => level.value === Number(selectedNode.condition.value))?.label ?? selectedNode.condition.value},
                    follow the true branch.
                  </strong>
                </div>
              {/if}
              <div class="route-label">When true</div>
              <div class="route-control">
                <button class="route-node-link" type="button" disabled={!selectedNode.trueNext} on:click={() => selectConnectedNode(selectedNode.trueNext)}>{routeLabel(selectedNode, 'trueNext')}</button>
                <button type="button" on:click={() => startLinkSelection('trueNext', 'True branch')}>Select node</button>
                {#if selectedNode.trueNext}
                  <button type="button" aria-label="Clear true branch" on:click={() => clearRoute(selectedNode, 'trueNext')}>×</button>
                {/if}
              </div>
              <div class="route-label">When false</div>
              <div class="route-control">
                <button class="route-node-link" type="button" disabled={!selectedNode.falseNext} on:click={() => selectConnectedNode(selectedNode.falseNext)}>{routeLabel(selectedNode, 'falseNext')}</button>
                <button type="button" on:click={() => startLinkSelection('falseNext', 'False branch')}>Select node</button>
                {#if selectedNode.falseNext}
                  <button type="button" aria-label="Clear false branch" on:click={() => clearRoute(selectedNode, 'falseNext')}>×</button>
                {/if}
              </div>
            {/if}

            {#if selectedNode.type === 'image'}
              <label for="image-upload">Story image</label>
              <div class="asset-actions">
                <label class="upload-button" for="image-upload">
                  {imageUploading ? 'Uploading image…' : 'Upload image'}
                </label>
                <button type="button" on:click={() => openImageLibrary('image')}>Select from library</button>
              </div>
              <input
                id="image-upload"
                class="visually-hidden"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml"
                disabled={imageUploading}
                on:change={uploadImage}
              >
              {#if selectedNode.src}
                <div class="image-preview">
                  <div class="story-image-frame">
                    <img
                      src={selectedNode.src}
                      alt={selectedNode.logText || 'Story image preview'}
                      style:object-position={`${selectedNode.imagePositionX ?? 50}% ${selectedNode.imagePositionY ?? 50}%`}
                    >
                  </div>
                  <span>{selectedNode.src}</span>
                  <div class="crop-controls">
                    <label>
                      <span>Move left/right</span>
                      <input type="range" min="0" max="100" bind:value={selectedNode.imagePositionX}>
                    </label>
                    <label>
                      <span>Move up/down</span>
                      <input type="range" min="0" max="100" bind:value={selectedNode.imagePositionY}>
                    </label>
                  </div>
                  <label class="image-color-control" for="image-border-color">
                    <span>Terminal border color</span>
                    <input
                      id="image-border-color"
                      type="color"
                      bind:value={selectedNode.imageBorderColor}
                    >
                  </label>
                  <button type="button" on:click={() => {
                    rememberForUndo();
                    selectedNode.src = '';
                    refreshStory();
                  }}>Remove image</button>
                </div>
              {/if}
              <label for="image-log-text">Log text</label>
              <textarea
                id="image-log-text"
                bind:value={selectedNode.logText}
                rows="3"
                placeholder="Describe what should appear in this cartridge's logs."
              ></textarea>
            {/if}

            {#if selectedNode.type === 'ambience'}
              <label for="background-source">Background image path</label>
              <input id="background-source" bind:value={selectedNode.background} placeholder="/backgrounds/location.webp">
              <label for="music-source">Music path</label>
              <input id="music-source" bind:value={selectedNode.music} placeholder="/audio/music/theme.mp3">
              <label for="sound-source">Sound effect path</label>
              <input id="sound-source" bind:value={selectedNode.sound} placeholder="/audio/sounds/door.mp3">
              <p class="inspector-warning">Legacy atmosphere node. New stories should use separate Music and Sound effect companions.</p>
            {/if}

            {#if selectedNode.type === 'audio'}
              <label for="audio-kind">Audio type</label>
              <select id="audio-kind" value={selectedNode.audioKind} on:change={setAudioKind}>
                <option value="music">Music</option>
                <option value="sound">Sound effect</option>
              </select>
              <span class="inspector-label">Selected audio</span>
              <p class="inspector-help">
                {selectedNode.audioKind === 'sound'
                  ? selectedNode.sound || 'No sound selected.'
                  : selectedNode.music || 'No music selected.'}
              </p>
              <button type="button" on:click={openSelectedAudioLibrary}>
                Select from audio library
              </button>
              <div class="field-grid">
                <div>
                  <label for="audio-id">Track ID</label>
                  <input id="audio-id" bind:value={selectedNode.audioId}>
                </div>
                <div>
                  <label for="audio-layer">Layer</label>
                  <input id="audio-layer" type="number" min="1" max="10" bind:value={selectedNode.audioLayer}>
                </div>
                <div>
                  <label for="audio-volume">Volume</label>
                  <input id="audio-volume" type="range" min="0" max="1" step="0.05" bind:value={selectedNode.audioVolume}>
                  <span>{Math.round(Number(selectedNode.audioVolume ?? 1) * 100)}%</span>
                </div>
                <div>
                  <label for="audio-fade-in">Fade in seconds</label>
                  <input id="audio-fade-in" type="number" min="0" max="30" step="0.1" bind:value={selectedNode.fadeInSeconds}>
                </div>
                <div>
                  <label for="audio-fade-out">Natural fade out seconds</label>
                  <input id="audio-fade-out" type="number" min="0" max="30" step="0.1" bind:value={selectedNode.fadeOutSeconds}>
                </div>
              </div>
              <label class="choice-disabled-toggle">
                <input type="checkbox" bind:checked={selectedNode.audioLoop}>
                Loop until stopped
              </label>
              <label for="audio-range-mode">Playback duration</label>
              <select id="audio-range-mode" value={selectedNode.audioRangeMode} on:change={setAudioRangeMode}>
                <option value="full">Full song / sound</option>
                <option value="partial">Partial segment</option>
              </select>
              {#if selectedNode.audioRangeMode === 'partial'}
                <div class="audio-segment-editor">
                  <label>
                    <span>Start second</span>
                    <div>
                      <input
                        type="range"
                        min="0"
                        max={Math.max(1, Number(selectedNode.audioDurationSeconds ?? 300))}
                        step="0.1"
                        bind:value={selectedNode.audioStartSeconds}
                      >
                      <input type="number" min="0" step="0.1" bind:value={selectedNode.audioStartSeconds}>
                    </div>
                  </label>
                  <label>
                    <span>Stop second</span>
                    <div>
                      <input
                        type="range"
                        min="0"
                        max={Math.max(1, Number(selectedNode.audioDurationSeconds ?? 300))}
                        step="0.1"
                        bind:value={selectedNode.audioStopSeconds}
                      >
                      <input type="number" min="0" step="0.1" bind:value={selectedNode.audioStopSeconds}>
                    </div>
                  </label>
                  <small>
                    {selectedNode.audioDurationSeconds
                      ? `Detected duration: ${selectedNode.audioDurationSeconds}s`
                      : 'Preview the selected file in the library once to detect its duration.'}
                  </small>
                </div>
              {/if}
              <p class="inspector-help">
                Audio overlaps by default. IDs target one track; layers let a Stop Audio node control a music group.
              </p>
            {/if}

            {#if selectedNode.type === 'stop-audio'}
              <fieldset>
                <legend>Audio to stop</legend>
                <label class="choice-disabled-toggle">
                  <input type="checkbox" bind:checked={selectedNode.stopMusic}>
                  Music
                </label>
                <label class="choice-disabled-toggle">
                  <input type="checkbox" bind:checked={selectedNode.stopSounds}>
                  Sound effects
                </label>
              </fieldset>
              {#if selectedNode.stopMusic}
              <label for="stop-music-ids">Track IDs to stop</label>
              <input
                id="stop-music-ids"
                value={(selectedNode.stopMusicIds ?? []).join(', ')}
                placeholder="Leave blank to use layers or stop all"
                on:input={setStopMusicIds}
              >
              <fieldset>
                <legend>Layers to stop</legend>
                <div class="audio-layer-grid">
                  {#each Array.from({ length: 10 }, (_, index) => index + 1) as layer}
                    <label>
                      <input
                        type="checkbox"
                        checked={(selectedNode.stopMusicLayers ?? []).includes(layer)}
                        on:change={(event) => toggleStopMusicLayer(layer, event.currentTarget.checked)}
                      >
                      {layer}
                    </label>
                  {/each}
                </div>
              </fieldset>
              {/if}
              <label for="audio-fade-out">Fade out seconds</label>
              <input id="audio-fade-out" type="number" min="0" max="30" step="0.1" bind:value={selectedNode.fadeOutSeconds}>
              <p class="inspector-help">
                With no IDs or layers selected, every music track stops. Selected IDs and layers are combined.
              </p>
            {/if}

            {#if selectedNode.type === 'minigame'}
              <label for="minigame-id">Minigame</label>
              <select id="minigame-id" value={selectedNode.minigameId} on:change={setMinigameId}>
                <option value="netrunners">NetRunners</option>
                <option value="billywig">Billywig</option>
                <option value="pigz">Pigz</option>
                <option value="trace-race">TracerT</option>
                <option value="packet-war">Packettack</option>
                <option value="lo-hi">Lo-Hi</option>
                <option value="mastermind">Cipher</option>
                <option value="chopsticks">Overclock</option>
                <option value="firewall-auction">Breach</option>
                <option value="drone-relay">Drone Relay</option>
              </select>
              <p class="inspector-help">
                Route wins, losses, supported draws, and early exits independently.
                Outcomes are evaluated from Player 1’s perspective for shared multiplayer nodes.
              </p>
              {#each minigameOutcomeIds(selectedNode.minigameId) as outcome}
                {@const routeField = `resultNext.${outcome}`}
                <div class="route-label">{routeFieldLabel(selectedNode, routeField)} destination</div>
                <div class="route-control">
                  <button
                    class="route-node-link"
                    type="button"
                    disabled={!selectedNode.resultNext[outcome]}
                    on:click={() => selectConnectedNode(selectedNode.resultNext[outcome])}
                  >{routeLabel(selectedNode, routeField)}</button>
                  <button type="button" on:click={() => startLinkSelection(routeField, `${routeFieldLabel(selectedNode, routeField)} destination`)}>Select node</button>
                  {#if selectedNode.resultNext[outcome]}
                    <button type="button" aria-label={`Clear ${outcome} destination`} on:click={() => clearRoute(selectedNode, routeField)}>×</button>
                  {/if}
                </div>
              {/each}
            {/if}

            {#if nodeHasButtons(selectedNode)}
              <section class="button-hover-editor">
                <label class="choice-disabled-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedNode.hoverEffectsEnabled)}
                    on:change={toggleHoverEffects}
                  >
                  Enable hover effects
                </label>
                {#if selectedNode.hoverEffectsEnabled}
                  <div class="field-grid">
                    <label>
                      <span>Background color</span>
                      <input type="color" bind:value={selectedNode.hoverBackgroundColor}>
                    </label>
                    <label>
                      <span>Text color</span>
                      <input type="color" bind:value={selectedNode.hoverTextColor}>
                    </label>
                  </div>
                  {#if ['choice', 'timed-choice', 'vote'].includes(selectedNode.type)}
                    {#each selectedNode.choices ?? [] as choice, index}
                      <label>
                        <span>Option {index + 1} hover text</span>
                        <input bind:value={choice.hoverText} placeholder={choice.label || `Option ${index + 1}`}>
                      </label>
                    {/each}
                  {:else}
                    <label>
                      <span>Hover button text</span>
                      <input bind:value={selectedNode.hoverText} placeholder="Leave blank to keep the normal text">
                    </label>
                  {/if}
                {/if}
              </section>
            {/if}

            <div class="inspector-delete-zone">
              <button class="danger-button" type="button" on:click={deleteSelectedNode}>
                Delete node
              </button>
            </div>
            </div>

            {#if inspectorExpanded}
              <footer class="inspector-modal-footer">
                <button class="inspector-modal-close" type="button" on:click={closeExpandedInspector}>
                  Close expanded view
                </button>
              </footer>
            {/if}
          {:else}
            <p class="empty-inspector">Select a node from the flow canvas.</p>
          {/if}
        </aside>
      </div>

      {#if insertionTarget}
        <div
          class="node-picker-backdrop"
          role="presentation"
          on:click|self={closeNodePicker}
        >
          <section
            class="node-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="node-picker-title"
          >
            <header>
              <div>
                <p>ADD TO {lanes.find((lane) => lane.id === insertionTarget?.lane)?.label}</p>
                <h2 id="node-picker-title">Choose a node</h2>
              </div>
              <button type="button" aria-label="Close node picker" on:click={closeNodePicker}>×</button>
            </header>

            {#if copiedNode && (!insertionTarget.companionOnly || isCompanionNode(copiedNode))}
              <button class="paste-node-button" type="button" on:click={pasteNode}>
                <span>PASTE COPIED NODE</span>
                <strong>{displayNodeName(copiedNode)}</strong>
              </button>
            {/if}

            <label class="node-search">
              <span>Search node types</span>
              <input bind:value={nodeSearch} type="search" placeholder="Try dialogue, choice, image…">
            </label>

            {#if !nodeSearch && recentNodeTypes.length > 0}
              <section class="node-palette-section node-palette-recents">
                <header>
                  <p class="node-group-label">RECENTLY USED</p>
                  <small>Your quickest access to the last node types you added.</small>
                </header>
                <div class="node-type-grid">
                  {#each recentNodeDefinitions() as node}
                    <button class={nodeShapeClass(node.type)} type="button" on:click={() => addNode(node.type)}>
                      <span class="node-badge-row">
                        {#if isCompanionNodeType(node.type)}
                          <span class="node-type-badge companion">COMPANION</span>
                        {/if}
                        {#if isMultiplayerNodeType(node.type)}
                          <span class="node-type-badge multiplayer">MULTIPLAYER</span>
                        {/if}
                      </span>
                      <strong>{node.name}</strong>
                      <small>{node.description}</small>
                    </button>
                  {/each}
                </div>
              </section>
            {/if}

            {#each tutorialNodeSections as section, sectionIndex}
              {@const visibleNodes = section.nodes.filter((node) => nodeAvailableForMap(node.type) && nodeMatchesSearch(node, nodeSearch))}
              {#if visibleNodes.length > 0}
                <section class={`node-palette-section node-palette-section-${sectionIndex + 1}`}>
                  <header>
                    <p class="node-group-label">{section.title}</p>
                    <p class="node-group-description">{section.description}</p>
                  </header>
                  <div class="node-type-grid">
                    {#each visibleNodes as node}
                      <button class={nodeShapeClass(node.type)} type="button" on:click={() => addNode(node.type)}>
                        <span class="node-badge-row">
                          {#if isCompanionNodeType(node.type)}
                            <span class="node-type-badge companion">COMPANION</span>
                          {/if}
                          {#if isMultiplayerNodeType(node.type)}
                            <span class="node-type-badge multiplayer">MULTIPLAYER</span>
                          {/if}
                        </span>
                        <strong>{node.name}</strong>
                        <small>{node.description}</small>
                      </button>
                    {/each}
                  </div>
                </section>
              {/if}
            {/each}
          </section>
        </div>
      {/if}

      {#if unprotectConfirmationOpen}
        <div class="node-picker-backdrop protection-confirmation-backdrop" role="presentation">
          <section class="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="unprotect-title">
            <p>REMOVE STORY PROTECTION</p>
            <h2 id="unprotect-title">Allow this story to be deleted?</h2>
            <p>You can protect it again at any time. This confirmation does not delete the story.</p>
            <div>
              <button type="button" on:click={() => unprotectConfirmationOpen = false}>Keep protected</button>
              <button class="danger-button" type="button" on:click={confirmUnprotectStory}>Unprotect story</button>
            </div>
          </section>
        </div>
      {/if}

      {#if playtestWarningOpen}
        <div class="node-picker-backdrop" role="presentation">
          <section class="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="playtest-warning-title">
            <p>REPLACE ACTIVE CARTRIDGE</p>
            <h2 id="playtest-warning-title">Start this playtest?</h2>
            <p>
              “{storyTitle($libraryState.activeStoryId)}” is currently loaded. Playing from the editor will replace it with “{editingStory.title}”.
            </p>
            <div>
              <button type="button" on:click={() => playtestWarningOpen = false}>Cancel</button>
              <button class="primary-button" type="button" disabled={saveInFlight} on:click={startPlaytest}>Save and play</button>
            </div>
          </section>
        </div>
      {/if}

      {#if tutorialOpen}
        <div class="node-picker-backdrop" role="presentation">
          <section class="editor-tutorial" role="dialog" aria-modal="true" aria-labelledby="editor-guide-title">
            <header>
              <div>
                <p>EDITOR HANDBOOK</p>
                <h2 id="editor-guide-title">Story nodes and workflows</h2>
              </div>
              <button type="button" aria-label="Close editor tutorial" on:click={closeTutorial}>×</button>
            </header>

            <p class="tutorial-introduction">
              Main-flow nodes create the playable path. Companion nodes sit beside a host and activate with it without adding another step.
            </p>

            <section class="tutorial-workflow" aria-labelledby="workflow-guide-title">
              <p class="tutorial-section-label">WORKFLOW</p>
              <h3 id="workflow-guide-title">Build and connect a path</h3>
              <ol>
                <li><strong>Settings</strong> contains cartridge details, deletion protection, maps, playable modes, the cast, start nodes, and relationships.</li>
                <li><strong>Story start</strong> chooses a solo opening, one Shared multiplayer opening, or separate Player 1 and Player 2 openings. Missing starts save as an unavailable draft.</li>
                <li><strong>Relationships</strong> are configured separately for Player 1 and Player 2. A Player State node in a private lane changes that player’s meter; a Shared node changes both players when both meters exist.</li>
                <li><strong>Add to Player</strong> appends a node to that lane. It auto-connects only when the previous node has an unused normal route.</li>
                <li><strong>+ next, + yes, or + no</strong> creates a node directly on that route. Use <strong>Select node</strong> to connect an existing node instead.</li>
                <li><strong>Select previous node</strong> makes an existing node lead into the selected node. Red nodes are missing a required or valid connection.</li>
                <li><strong>Loops are supported.</strong> Route branch endings back to a Choice hub and route one exit button forward. Backward routes display <strong>↻ LOOP</strong>.</li>
                <li>Use the <strong>Player 1</strong> and <strong>Player 2</strong> lanes for private scenes. Put synchronized actions and votes in <strong>Shared</strong>.</li>
                <li>Companions use <strong>Select host node</strong>. They never receive previous or next routes.</li>
                <li>A stored Player input can feed <strong>Player state → Set player name</strong>. The custom name lasts only for the current cartridge session.</li>
              </ol>
            </section>

            <div class="tutorial-node-sections">
              {#each tutorialNodeSections as section}
                <section class="tutorial-node-section">
                  <p class="tutorial-section-label">NODE REFERENCE</p>
                  <h3>{section.title}</h3>
                  <p class="tutorial-section-description">{section.description}</p>

                  <div class="tutorial-node-grid">
                    {#each section.nodes as node}
                      <article class={nodeShapeClass(node.type)}>
                        <div class="node-badge-row">
                          {#if isCompanionNodeType(node.type)}
                            <span class="node-type-badge companion">COMPANION</span>
                          {/if}
                          {#if isMultiplayerNodeType(node.type)}
                            <span class="node-type-badge multiplayer">MULTIPLAYER</span>
                          {/if}
                        </div>
                        <div class="tutorial-node-heading">
                          <h4>{node.name}</h4>
                          <code>{node.type}</code>
                        </div>
                        <p>{node.description}</p>
                        <p class="tutorial-node-usage"><strong>How to use it:</strong> {node.usage}</p>
                      </article>
                    {/each}
                  </div>
                </section>
              {/each}
            </div>

            {#if undocumentedNodeTypes.length > 0}
              <p class="tutorial-warning" role="alert">
                Handbook entries are still needed for:
                {undocumentedNodeTypes.map((nodeType) => nodeType.label).join(', ')}.
              </p>
            {/if}

            <footer class="tutorial-footer">
              <p>Save after every playable route reaches another node or an Ending.</p>
              <button class="primary-button" type="button" on:click={closeTutorial}>Got it</button>
            </footer>
          </section>
        </div>
      {/if}

      <datalist id="story-node-ids">
        {#each editingStory.nodes as node}
          <option value={node.id}></option>
        {/each}
      </datalist>
    </div>
  {:else if $location === 'editor'}
    <div class="editor-empty-state">
      <p class="eyebrow">STORY EDITOR</p>
      <div class="editor-home-heading">
        <div>
          <h1 id="library-title">Manage stories</h1>
          <p class="introduction">
            Create, edit, duplicate, or remove cartridges here. The Library remains focused on selecting stories to play.
          </p>
        </div>
        <button class="primary-button" type="button" on:click={openCreateStory}>Create new story</button>
      </div>
      <div class="editor-story-list">
        {#each $libraryState.stories as story}
          <article>
            <button class="editor-story-open" type="button" on:click={() => openEditor(story.id)}>
              <strong>{story.title}</strong>
              <span>
                {story.status === 'draft' ? 'UNAVAILABLE' : story.protected ? 'PROTECTED' : 'PLAYABLE'} · V{story.version}
              </span>
              {#if story.unavailableReason}
                <small>{story.unavailableReason}</small>
              {/if}
            </button>
            <div>
              <button type="button" on:click={() => openEditor(story.id)}>Edit</button>
              <button type="button" on:click={() => duplicateStory(story.id)}>Duplicate</button>
              {#if !story.builtIn && !story.protected}
                <button class="danger-button" type="button" on:click={() => deleteStory(story.id)}>
                  {deleteArmedId === story.id ? 'Confirm delete' : 'Delete'}
                </button>
              {:else if story.protected}
                <button type="button" disabled title="Unprotect this story in Story settings before deleting it.">
                  Protected
                </button>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    </div>
  {/if}

  {#if imageLibraryOpen}
    <div class="image-library-backdrop">
      <section class="image-library-modal" role="dialog" aria-modal="true" aria-labelledby="image-library-title">
        <header>
          <div>
            <p class="eyebrow">STORY ASSETS</p>
            <h2 id="image-library-title">Image library</h2>
          </div>
          <button type="button" aria-label="Close image library" on:click={() => imageLibraryOpen = false}>×</button>
        </header>

        {#if storyImages.length === 0}
          <p class="empty-inspector">
            No images are available yet. Upload one or place a supported image
            in public/uploads/stories.
          </p>
        {:else}
          <div class="image-library-grid">
            {#each storyImages as imagePath}
              <article>
                <button class="asset-select" type="button" on:click={() => selectStoryImage(imagePath)}>
                  <img src={imagePath} alt="">
                  <span>{imagePath.split('/').at(-1)}</span>
                </button>
                {#if canDeleteStoryImage(imagePath)}
                  <button class="asset-delete" type="button" on:click={() => deleteStoryImage(imagePath)}>
                    DELETE
                  </button>
                {:else}
                  <span class="asset-built-in">
                    {imagePath.startsWith('/character_imgs/') ? 'BUILT-IN PORTRAIT' : 'BUILT-IN IMAGE'}
                  </span>
                {/if}
              </article>
            {/each}
          </div>
        {/if}
      </section>
    </div>
  {/if}

  {#if audioLibraryOpen}
    <div class="image-library-backdrop">
      <section class="image-library-modal audio-library-modal" role="dialog" aria-modal="true" aria-labelledby="audio-library-title">
        <header>
          <div>
            <p class="eyebrow">STORY ASSETS</p>
            <h2 id="audio-library-title">{audioLibraryTarget === 'music' ? 'Music' : 'Sound effect'} library</h2>
          </div>
          <button type="button" aria-label="Close audio library" on:click={() => audioLibraryOpen = false}>×</button>
        </header>

        <p class="inspector-help">
          Preview files here, then select one. The player shows duration after the browser reads its metadata.
        </p>

        {#if selectedNode?.type === 'audio'}
          <div class="audio-library-settings">
            <label>
              <span>Volume · {Math.round(Number(selectedNode.audioVolume ?? 1) * 100)}%</span>
              <input type="range" min="0" max="1" step="0.05" bind:value={selectedNode.audioVolume}>
            </label>
            <label>
              <span>Fade in</span>
              <input type="number" min="0" max="30" step="0.1" bind:value={selectedNode.fadeInSeconds}>
            </label>
            <label>
              <span>Fade out</span>
              <input type="number" min="0" max="30" step="0.1" bind:value={selectedNode.fadeOutSeconds}>
            </label>
            <label class="choice-disabled-toggle">
              <input type="checkbox" bind:checked={selectedNode.audioLoop}>
              Loop
            </label>
          </div>
        {/if}

        {#if audioAssets.length === 0}
          <p class="empty-inspector">
            No matching audio files are available. Add them to
            public/audio/{audioLibraryTarget === 'music' ? 'music' : 'sounds'}.
          </p>
        {:else}
          <div class="audio-library-list">
            {#each audioAssets as asset}
              <article>
                <div>
                  <strong>{asset.name}</strong>
                  <small>{asset.path}</small>
                </div>
                <audio
                  controls
                  preload="metadata"
                  src={asset.path}
                  on:loadedmetadata={recordAudioDuration}
                  on:play={stopOtherAudioPreviews}
                ></audio>
                <button class="primary-button" type="button" on:click={() => selectStoryAudio(asset)}>
                  Select
                </button>
              </article>
            {/each}
          </div>
        {/if}
      </section>
    </div>
  {/if}

  {#if pendingAssetDeletion}
    <div class="image-library-backdrop asset-warning-backdrop">
      <section class="asset-warning" role="alertdialog" aria-modal="true" aria-labelledby="asset-warning-title">
        <p class="eyebrow">REFERENCED ASSET</p>
        <h2 id="asset-warning-title">Delete this image anyway?</h2>
        <p>
          The file is referenced by {pendingAssetDeletion.references.length}
          {pendingAssetDeletion.references.length === 1 ? ' story' : ' stories'}.
          Deleting it is permitted, but those image or portrait nodes will show a missing asset until replaced.
        </p>
        <ul>
          {#each pendingAssetDeletion.references as reference}
            <li>{reference.title}</li>
          {/each}
        </ul>
        <div>
          <button type="button" on:click={() => pendingAssetDeletion = null}>KEEP IMAGE</button>
          <button class="danger-button" type="button" on:click={() => deleteStoryImage(pendingAssetDeletion?.path ?? '', true)}>
            DELETE ANYWAY
          </button>
        </div>
      </section>
    </div>
  {/if}

  {#if statusMessage}
    <div class="toast-message success-message" role="status" transition:fade>
      <span>{statusMessage}</span>
      <button type="button" aria-label="Dismiss message" on:click={clearMessages}>×</button>
    </div>
  {/if}
  {#if errorMessage}
    <div class="toast-message error-message" role="alert" transition:fade>
      <span>{errorMessage}</span>
      <button type="button" aria-label="Dismiss error" on:click={clearMessages}>×</button>
    </div>
  {/if}
</section>

<style lang="scss">
  .story-library {
    --library-terminal-accent: #55f09a;

    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    max-width: 1600px;
    overflow: hidden;
    background: #060b14;
    border: 1px solid var(--library-terminal-accent);
    border-radius: 8px;
    box-shadow: 0 0 34px color-mix(in srgb, var(--library-terminal-accent) 32%, transparent);

    &.story-library--save-pulse {
      animation: saved-pulse 900ms ease-out;
    }

    &.story-library--editor {
      --library-terminal-accent: #ff8a32;
      background: #100905;

      > header {
        background: #24150c;
      }

      .map-toolbar,
      .editor-toolbar {
        background: #160d08;
      }

      .node-inspector {
        background: #120a07;
      }

      .flow-canvas {
        background-color: #0d0805;
        background-image:
          linear-gradient(#ff8a321c 1px, transparent 1px),
          linear-gradient(90deg, #ff8a321c 1px, transparent 1px);
      }
    }

    > header {
      min-height: 38px;
      padding: 9px 14px;
      color: var(--library-terminal-accent);
      background: #111a2c;
      border-bottom: 1px solid var(--library-terminal-accent);
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.72rem;
      letter-spacing: 2px;

      display: flex;
      justify-content: space-between;
    }
  }

  .library-content,
  .form-screen {
    height: calc(100% - 38px);
    padding: clamp(22px, 4vw, 52px);
    overflow-y: auto;
  }

  .library-content .eyebrow {
    color: #55f09a;
  }

  .library-heading {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 24px;

    > div {
      min-width: 0;
    }

    .primary-button {
      flex: 0 0 auto;
      white-space: nowrap;
    }
  }

  .eyebrow {
    color: #4a98d9;
    font-size: 0.7rem;
    letter-spacing: 2px;
  }

  h1 {
    margin: 8px 0 10px;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: clamp(2rem, 5vw, 3.6rem);
  }

  .introduction {
    max-width: 72ch;
    color: #aeb9c9;
    line-height: 1.6;
  }

  button,
  input,
  textarea,
  select {
    min-height: 40px;
    padding: 8px 11px;
    color: #e8edf6;
    background: #0b1423;
    border: 1px solid #334155;
    border-radius: 4px;
    font: inherit;
  }

  button {
    cursor: pointer;

    &:hover,
    &:focus-visible {
      border-color: #02fbfb;
      outline: 2px solid #ffffff;
      outline-offset: 2px;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }

  .primary-button {
    color: #07111d;
    background: #02fbfb;
    border-color: #02fbfb;
    font-weight: 800;
  }

  .danger-button {
    color: #ffd9d3;
    border-color: #cb381f;
  }

  .selection-panel {
    margin-top: 30px;
    padding: 16px;
    background: #111827;
    border: 1px solid #ad781c;

    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;

    div {
      padding: 12px;
      background: #070b16;
      border: 1px solid #2c3b54;
    }

    span {
      display: block;
      margin-bottom: 6px;
      color: #8893a2;
      font-size: 0.68rem;
    }

    strong {
      color: #f8e69a;
    }

    small {
      display: block;
      margin-top: 5px;
      color: #67e8f9;
      font-size: 0.62rem;
      letter-spacing: 1px;
    }

    > p {
      grid-column: 1 / -1;
      color: #f8e69a;
      font-size: 0.72rem;
      text-align: center;
    }
  }

  .selection-panel.matched {
    border-color: #4f813d;

    strong,
    > p {
      color: #9dffa6;
    }
  }

  .partner-selection {
    display: grid;
    gap: 8px;

    > button {
      width: 100%;
      margin-top: 4px;
      color: #d8eaff;
      border-color: #5798dc;
    }
  }

  .partner-seat-picker {
    padding: 10px !important;
    background: #0a1625 !important;
    border-color: #5798dc !important;

    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;

    p {
      grid-column: 1 / -1;
      color: #b9dcf8;
      font-size: 0.72rem;
      line-height: 1.45;
    }
  }

  .story-grid {
    margin-top: 22px;

    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 16px;

    article {
      position: relative;
      min-height: 360px;
      padding: 42px 24px 52px;
      overflow: hidden;
      background:
        linear-gradient(135deg, #17243a, #0a101c 65%),
        #0c1322;
      border: 4px solid #33445d;
      border-radius: 12px 12px 28px 28px;
      box-shadow:
        inset 0 0 0 2px #080d16,
        inset 0 -18px 0 #070b12,
        0 12px 24px #02061788;

      &::before {
        content: '';
        position: absolute;
        top: 12px;
        left: 50%;
        width: 42%;
        height: 10px;
        background: #03060b;
        border: 2px solid #435774;
        border-radius: 999px;
        box-shadow: inset 0 2px 4px #000000;
        transform: translateX(-50%);
      }

      &::after {
        content: '';
        position: absolute;
        right: 22%;
        bottom: 9px;
        left: 22%;
        height: 13px;
        background: repeating-linear-gradient(
          90deg,
          #b98a38 0,
          #b98a38 8px,
          #49330f 8px,
          #49330f 12px
        );
        border: 1px solid #d9b96a;
      }

      h2 {
        margin: 14px 0 10px;
        color: #e8edf6;
        font-family: "Orbitron", "Space Mono", sans-serif;
      }

      > p {
        min-height: 4.8em;
        color: #aeb9c9;
        line-height: 1.55;
      }

      dl {
        margin-top: 18px;

        display: flex;
        gap: 26px;
      }

      dt {
        color: #64748b;
        font-size: 0.65rem;
      }

      dd {
        margin-top: 4px;
        color: #6dc2fb;
      }
    }

    article.selected {
      border-color: #02fbfb;
      box-shadow:
        inset 0 0 0 2px #07111d,
        inset 0 -18px 0 #07111d,
        0 0 24px #02fbfb44;
    }
  }

  .story-card-header {
    color: #4a98d9;
    font-size: 0.68rem;

    display: flex;
    justify-content: space-between;
  }

  .card-actions {
    margin-top: 20px;

    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .deselect-cartridge {
    color: #fca5a5;
    border-color: #7f1d1d;
  }

  .seat-picker {
    margin-top: 12px;
    padding: 12px;
    background: #07111d;
    border: 1px solid #3b82f6;

    p {
      min-height: 0;
      color: #bfdbfe;
      font-size: 0.76rem;
      line-height: 1.45;
    }

    div {
      margin-top: 10px;

      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }
  }

  .form-screen {
    max-width: 760px;
    margin: 0 auto;
  }

  .back-button {
    margin-bottom: 28px;
    background: transparent;
    border: 0;
  }

  .story-form {
    margin-top: 28px;

    display: grid;
    gap: 10px;

    label {
      margin-top: 10px;
      color: #4a98d9;
      font-size: 0.72rem;
      text-transform: uppercase;
    }

    textarea {
      resize: none;
    }
  }

  .editor-shell {
    height: calc(100% - 38px);

    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
  }

  .editor-story-title {
    display: block;
    margin-bottom: 4px;
    color: #f5e8dd;
    font-family: "Orbitron", "Space Mono", sans-serif;
  }

  .field-help,
  .story-unavailable-reason {
    color: #e8a589;
    font-size: 0.7rem;
    line-height: 1.5;
  }

  .story-protection-toggle {
    padding: 10px;
    background: #17121e;
    border: 1px solid #6d4a89;
  }

  .play-mode-fieldset {
    margin: 16px 0;
    padding: 14px;
    border: 1px solid #2c3b54;

    legend {
      color: #6dc2fb;
      font-size: 0.72rem;
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    label {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    p {
      margin: 8px 0 0;
      color: #8893a2;
      font-size: 0.72rem;
    }
  }

  .map-toolbar {
    padding: 8px 14px;
    background: #080f1b;
    border-bottom: 1px solid #2c3b54;

    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .relationship-settings,
  .start-settings {
    background: #09111e;
    border-bottom: 1px solid #2c3b54;
  }

  .start-settings {
    summary {
      min-height: 36px;
      padding: 8px 14px;
      color: #9dcdf4;
      cursor: pointer;
      font-size: 0.7rem;
      letter-spacing: 1px;

      display: flex;
      justify-content: space-between;
      align-items: center;

      strong {
        color: #647f9c;
        font-size: 0.62rem;
      }
    }
  }

  .start-settings-content {
    padding: 12px 14px 16px;
    border-top: 1px solid #1f3045;

    display: grid;
    gap: 12px;

    > label,
    .start-node-grid label {
      color: #8fd6ff;

      display: grid;
      gap: 6px;
    }

    > p {
      color: #8ea5bd;
      font-size: 0.7rem;
      line-height: 1.5;
    }
  }

  .start-node-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .start-mode-options {
    padding: 10px;
    border: 1px solid #29445d;

    display: flex;
    flex-wrap: wrap;
    gap: 12px;

    legend {
      padding-inline: 5px;
      color: #8fd6ff;
    }

    label {
      display: flex;
      align-items: center;
      gap: 7px;
    }
  }

  .relationship-settings-content {
    max-height: 280px;
    padding: 12px 14px 16px;
    overflow-y: auto;
    border-top: 1px solid #1f3045;
  }

  .relationship-settings-heading {
    margin-bottom: 12px;

    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;

    p {
      max-width: 75ch;
      color: #8ea5bd;
      font-size: 0.7rem;
      line-height: 1.5;
    }

    button {
      flex: 0 0 auto;
    }
  }

  .relationship-config-list {
    display: grid;
    gap: 8px;

    article {
      padding: 10px;
      background: #070d18;
      border: 1px solid #294d6d;

      display: grid;
      grid-template-columns: minmax(170px, 1.5fr) repeat(3, minmax(100px, 0.7fr)) auto auto;
      align-items: end;
      gap: 8px;
    }

    label {
      min-width: 0;

      display: grid;
      gap: 4px;

      > span {
        color: #82bced;
        font-size: 0.58rem;
        letter-spacing: 0.8px;
        text-transform: uppercase;
      }
    }

    input,
    select {
      width: 100%;
      min-width: 0;
    }
  }

  .relationship-visible-toggle {
    min-height: 40px;
    grid-template-columns: auto 1fr !important;
    align-items: center;

    input {
      width: auto;
    }
  }

  .relationship-remove {
    color: #fca5a5;
    border-color: #7f1d1d;
  }

  .relationship-empty {
    padding: 12px;
    color: #7f96ae;
    background: #070d18;
    border: 1px dashed #294d6d;
    font-size: 0.72rem;
  }

  .map-tabs,
  .mode-toggles {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .graph-position-help {
    margin: 0;
    padding: 7px 14px;
    color: #7f96ae;
    background: #070d18;
    border-bottom: 1px solid #1f3045;
    font-size: 0.7rem;
  }

  .cast-controls {
    display: flex;
    align-items: flex-end;
    gap: 8px;

    label {
      display: grid;
      gap: 4px;
    }

    span {
      color: #6dc2fb;
      font-size: 0.62rem;
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    select {
      min-width: 150px;
      padding: 6px 8px;
    }
  }

  .inspector-help {
    margin: 8px 0 14px;
    color: #8893a2;
    font-size: 0.75rem;
    line-height: 1.5;
  }

  .map-tabs button {
    padding: 7px 10px;
    color: #8893a2;
    background: #0c1322;
    border-color: #2c3b54;

    &.active {
      color: #07111d;
      background: #02fbfb;
      border-color: #ffffff;
    }
  }

  .effect-preview {
    margin: 14px 0;
    padding: 12px;
    background: #081522;
    border: 1px solid #315f87;

    display: grid;
    gap: 7px;

    span {
      color: #82bced;
      font-size: 0.58rem;
      letter-spacing: 1.3px;
    }

    strong {
      color: #d2eaff;
      line-height: 1.45;
    }

    p {
      color: #9aafc4;
      font-size: 0.68rem;
      line-height: 1.5;
    }
  }

  .relationship-amount-buttons {
    margin: 7px 0 12px;

    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;

    button {
      min-width: 0;
      color: #b9dcf8;
      border-color: #315f87;
    }
  }

  .mode-toggles label {
    color: #aeb9c9;
    font-size: 0.68rem;
  }

  .mode-checkbox {
    position: relative;
    min-height: 30px;
    padding: 6px 10px 6px 38px;
    color: #aeb9c9;
    background: #080f1b;
    border: 1px solid #2c3b54;
    cursor: pointer;

    display: flex;
    align-items: center;

    input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }

    &::before {
      content: '';
      position: absolute;
      left: 10px;
      width: 16px;
      height: 16px;
      background: #030812;
      border: 1px solid #4a98d9;
      box-shadow: inset 0 0 0 3px #030812;
    }

    &:has(input:checked) {
      color: #d8fbff;
      border-color: #02fbfb;

      &::before {
        background: #02fbfb;
        box-shadow: inset 0 0 0 3px #07111d, 0 0 12px #02fbfb77;
      }
    }

    &:has(input:focus-visible) {
      outline: 2px solid #ffffff;
      outline-offset: 2px;
    }

    &:has(input:disabled) {
      cursor: not-allowed;
      opacity: 0.72;
    }
  }

  .editor-toolbar {
    padding: 10px 14px;
    background: #0c1322;
    border-bottom: 1px solid #2c3b54;

    display: grid;
    grid-template-columns: auto minmax(220px, 1fr) auto;
    align-items: center;
    gap: 14px;

    .back-button {
      margin: 0;
    }

    div {
      display: grid;
      gap: 4px;
    }

    span {
      color: #64748b;
      font-size: 0.65rem;
    }
  }

  .mobile-toolbar-toggle {
    display: none;
  }

  .toolbar-actions {
    display: flex !important;
    grid-template-columns: none !important;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px !important;

    button {
      min-height: 34px;
      padding: 6px 10px;
      font-size: 0.67rem;
    }

    .tutorial-button {
      color: #f8e69a;
      border-color: #ad781c;
    }
  }

  .editor-workspace {
    min-height: 0;

    display: grid;
    grid-template-columns: minmax(0, 1fr) 8px var(--inspector-width, 340px);
  }

  .node-inspector {
    position: relative;
    min-height: 0;
    padding: 0;
    overflow: hidden;
    background: #09111e;

    display: flex;
    flex-direction: column;

    h2 {
      margin-bottom: 14px;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.9rem;
    }

    code {
      color: #8893a2;
      font-size: 0.65rem;
      overflow-wrap: anywhere;
    }

    &.expanded {
      position: absolute;
      z-index: 61;
      top: clamp(16px, 4vh, 40px);
      bottom: clamp(16px, 4vh, 40px);
      left: 50%;
      width: min(760px, calc(100% - 40px));
      padding: 0;
      box-sizing: border-box;
      border: 1px solid #ff8a32;
      box-shadow: 0 24px 80px #000000bb, 0 0 34px #ff8a3244;
      transform: translateX(-50%);

      textarea {
        min-height: 150px;
      }

      .choice-editor textarea {
        min-height: 110px;
      }
    }
  }

  .inspector-scroll-content {
    min-height: 0;
    padding: 14px;
    overflow-y: auto;

    flex: 1 1 auto;
  }

  .node-inspector.expanded .inspector-scroll-content {
    padding: clamp(20px, 3vw, 38px);
    padding-top: 54px;
  }

  .inspector-resizer {
    position: relative;
    z-index: 5;
    width: 8px;
    height: 100%;
    min-width: 8px;
    min-height: 0;
    padding: 0;
    background: #0a111d;
    border-right: 1px solid #2c3b54;
    border-left: 1px solid #2c3b54;
    cursor: col-resize;
    touch-action: none;

    &::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 2px;
      width: 2px;
      height: 48px;
      background: #64748b;
      transform: translateY(-50%);
    }

    &:hover,
    &:focus-visible,
    &.active {
      background: #213149;
      outline: none;

      &::after {
        background: #02fbfb;
        box-shadow: 0 0 10px #02fbfb;
      }
    }
  }

  .inspector-modal-backdrop {
    position: absolute;
    z-index: 60;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    background: #02050bd9;
    border: 0;
  }

  .inspector-modal-close {
    width: 100%;
    color: #ffd5b5;
    background: #35170a;
    border-color: #ff8a32;
  }

  .inspector-modal-footer {
    padding: 12px clamp(20px, 3vw, 38px);
    background: #160d08;
    border-top: 1px solid #ff8a32;
    box-shadow: 0 -8px 22px #00000066;

    flex: 0 0 auto;
  }

  .inspector-modal-x {
    position: absolute;
    z-index: 4;
    top: 12px;
    right: 12px;
    width: 36px;
    min-height: 36px;
    padding: 4px;
    color: #ffd5b5;
    background: #35170a;
    border-color: #ff8a32;
    font-size: 1.2rem;
  }

  .flow-panel {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .flow-canvas {
    width: 100%;
    height: 100%;
    padding: 18px;
    box-sizing: border-box;
    overflow: auto;
    background-color: #050912;
    background-image:
      linear-gradient(#1472bf18 1px, transparent 1px),
      linear-gradient(90deg, #1472bf18 1px, transparent 1px);
    background-size: 24px 24px;
  }

  .map-zoom-controls {
    position: absolute;
    z-index: 7;
    top: 18px;
    right: 18px;
    width: max-content;
    padding: 4px;
    background: #07111dee;
    border: 1px solid #334155;
    box-shadow: 0 5px 18px #00000066;

    display: flex;
    gap: 4px;

    &.link-active {
      top: 82px;
    }

    button {
      min-width: 34px;
      min-height: 30px;
      padding: 4px 8px;
    }

    button:nth-child(2) {
      min-width: 58px;
      color: #f8e69a;
      font-size: 0.66rem;
    }
  }

  .flow-lanes {
    min-width: max-content;
    padding-top: 50px;

    display: flex;
    gap: clamp(28px, 4vw, 64px);
    align-items: stretch;
  }

  .flow-canvas.selecting-route .flow-lanes {
    padding-top: 114px;
  }

  // A solo graph has one usable lane, so keep it visually balanced on desktop.
  .flow-lanes.singleplayer-map {
    width: max-content;
    min-width: 100%;
    justify-content: flex-start;

    .singleplayer-disabled {
      display: none;
    }

    .flow-lane {
      margin-inline: auto;
    }
  }

  .link-mode-banner {
    position: absolute;
    z-index: 10;
    top: 18px;
    right: 18px;
    left: 18px;
    padding: 10px 12px;
    color: #07111d;
    background: #02fbfb;
    border: 1px solid #ffffff;
    box-shadow: 0 0 22px #02fbfb55;

    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;

    span {
      color: #07111d;
      font-weight: 800;
    }

    button {
      color: #07111d;
      background: #ffffffaa;
      border-color: #07111d;
    }
  }

  .start-node-badge {
    width: fit-content;
    padding: 3px 10px 3px 7px;
    color: #9fffd1;
    background: linear-gradient(90deg, #0c352c, #071a20);
    border: 1px solid #43e5a7;
    clip-path: polygon(0 0, calc(100% - 7px) 0, 100% 50%, calc(100% - 7px) 100%, 0 100%);
    box-shadow: inset 3px 0 #43e5a7, 0 0 12px #43e5a744;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: 0.5rem;
    font-weight: 900;
    letter-spacing: 1px;
    text-shadow: 0 0 7px #43e5a7;
  }

  .flow-lane {
    flex: 0 0 auto;
    width: calc(
      (var(--lane-columns, 1) * var(--lane-column-width, 258px))
      + ((var(--lane-columns, 1) - 1) * 12px)
      + 42px
    );
    min-height: 100%;
    padding: 10px;
    border: 1px dashed #2c3b54;
    transition: width 0.25s ease, border-color 0.2s ease;

    &.active {
      border-color: #02fbfb;
      box-shadow: inset 0 0 20px #02fbfb12;
    }

    &.singleplayer-disabled {
      opacity: 0.32;
      filter: grayscale(1);
      pointer-events: none;
    }
  }

  .lane-heading {
    width: 100%;
    margin-bottom: 12px;
    color: #4a98d9;
    background: #0b1423cc;
    border-color: transparent;
    font-size: 0.68rem;
    letter-spacing: 1px;

    display: flex;
    justify-content: space-between;
    align-items: center;

    span {
      color: #6dc2fb;
    }

    strong {
      color: #8893a2;
      font-size: 0.6rem;
    }
  }

  .flow-lane.active .lane-heading {
    border-color: #02fbfb;

    strong {
      color: #02fbfb;
    }
  }

  .lane-node-grid {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .graph-level {
    position: relative;
    min-width: 100%;

    display: grid;
    grid-template-columns: repeat(var(--level-columns, 1), var(--lane-column-width, 258px));
    justify-content: center;
    align-items: flex-start;
    gap: 12px;

    &:not(:first-child) .node-wrapper:not(.companion-node)::before {
      content: '';
      position: absolute;
      z-index: 0;
      top: -20px;
      left: 50%;
      height: 20px;
      border-left: 1px solid #02fbfb;
      box-shadow: 0 0 7px #02fbfb;
    }

    &.parallel-level::after,
    &.merge-level::after {
      content: '';
      position: absolute;
      z-index: 0;
      top: -20px;
      right: 129px;
      left: 129px;
      border-top: 1px solid #02fbfb;
      box-shadow: 0 0 7px #02fbfb;
    }
  }

  .node-wrapper {
    position: relative;
    width: 258px;
    min-width: 258px;

    display: grid;
    grid-column: var(--node-column, auto);
    grid-row: 1;
    gap: 5px;

    &.has-route::after {
      content: '';
      position: absolute;
      z-index: 0;
      bottom: -20px;
      left: 50%;
      width: 1px;
      height: 20px;
      background: linear-gradient(#02fbfb, #1472bf55);
      box-shadow: 0 0 7px #02fbfb;
    }

    &.companion-node {
      width: calc(100% - 24px);
      margin-left: 24px;

      &::before {
        content: '';
        position: absolute;
        top: 28px;
        left: -24px;
        width: 22px;
        border-top: 1px dashed #e0ad03;
      }

      .flow-node {
        background: #17150d;
        border-style: dashed;
        border-color: #ad781c;
      }
    }

    &.stacked-companion {
      z-index: calc(2 + var(--companion-stack-index));
      transform: translate(
        calc(var(--companion-stack-index) * 12px),
        calc(var(--companion-stack-index) * 8px)
      );
      transition: transform 0.18s ease, scale 0.18s ease;

      &.selected-node-wrapper {
        z-index: 40;
        transform: translate(
          calc(var(--companion-stack-index) * 12px),
          -10px
        );
        scale: 1.035;
      }
    }

    &.connected-before .flow-node {
      border-color: #8b5dbd !important;
      border-style: dotted !important;
      border-width: 2px !important;
      box-shadow: none;

      &::after {
        content: none;
      }
    }

    &.connected-after .flow-node {
      border-color: #d8b4fe !important;
      border-style: dashed !important;
      border-width: 2px !important;
      box-shadow: 0 0 9px #c084fc35;

      &::after {
        content: none;
      }
    }

    &.connected-companion .flow-node {
      background: linear-gradient(90deg, #351d58, #151022 74%);
      border: 2px solid #b98cff;
      box-shadow: 0 0 20px #b98cff45;

      &::after {
        content: 'CONNECTED';
        color: #d5b8ff;
      }
    }

    &.connected-before .flow-node::after,
    &.connected-after .flow-node::after,
    &.connected-companion .flow-node::after {
      width: max-content;
      padding: 2px 5px;
      font-size: 0.5rem;
      font-weight: 800;
      letter-spacing: 1px;
      background: #07111ddd;
      border: 1px solid currentColor;
    }

  }

  .branch-path-label {
    position: absolute;
    z-index: 4;
    top: -6px;
    left: 8px;
    padding: 2px 6px;
    color: #f8e69a;
    background: #211b08;
    border: 1px solid #ad781c;
    font-size: 0.52rem;
    font-weight: 800;
    letter-spacing: 1px;
    transform: translateY(-100%);

    &.merge-label {
      color: #8effb3;
      background: #0b2316;
      border-color: #4f813d;
    }
  }

  .node-quick-actions {
    position: absolute;
    z-index: 4;
    top: 5px;
    right: 5px;
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s ease, visibility 0.15s ease;

    display: flex;
    gap: 3px;

    button {
      width: 24px;
      height: 24px;
      min-height: 24px;
      padding: 4px;
      background: #050912e8;
      border-color: #334155;
    }

    svg {
      width: 14px;
      height: 14px;
      fill: none;
      stroke: #94a3b8;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.7;
    }

    .quick-delete:hover svg,
    .quick-delete:focus-visible svg {
      stroke: #e58271;
    }

    .node-expand-button:hover svg,
    .node-expand-button:focus-visible svg {
      stroke: #02fbfb;
    }

  }

  .node-wrapper:hover > .node-quick-actions,
  .node-wrapper:focus-within > .node-quick-actions,
  .node-wrapper.selected-node-wrapper > .node-quick-actions {
    visibility: visible;
    opacity: 1;
    pointer-events: auto;
  }

  .flow-node {
    width: 100%;
    height: auto;
    min-height: 94px;
    margin: 0;
    padding-top: 34px;
    text-align: left;

    display: grid;
    gap: 6px;

    span {
      color: #ff75fd;
      font-size: 0.62rem;
      text-transform: uppercase;
    }

    strong {
      overflow: hidden;
      color: #02fbfb;
      font-size: 0.74rem;
      text-overflow: ellipsis;
    }

    small {
      overflow: hidden;
      color: #94a3b8;
      font-size: 0.66rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .node-route-list {
      margin-top: 3px;
      padding-top: 6px;
      border-top: 1px dashed #334155;

      display: grid;
      gap: 3px;

      span {
        overflow: hidden;
        color: #9dffa6;
        font-size: 0.55rem;
        text-overflow: ellipsis;
        white-space: nowrap;

        strong {
          margin-left: 5px;
          color: #f8e69a;
          font-size: 0.5rem;
        }
      }

      span.loop-route {
        color: #f8e69a;
      }
    }

    .companion-badge,
    .multiplayer-badge {
      width: max-content;
      padding: 2px 5px;
      font-size: 0.52rem;
      letter-spacing: 1px;
    }

    .companion-badge {
      color: #f8e69a;
      background: #332b0a;
      border: 1px solid #ad781c;
    }

    .multiplayer-badge {
      color: #d5b8ff;
      background: #25143d;
      border: 1px solid #8f62cb;
    }
  }

  .node-badge-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .node-type-badge {
    width: max-content;
    padding: 2px 5px !important;
    font-size: 0.52rem;
    font-weight: 800;
    letter-spacing: 0.8px;

    &.companion {
      color: #f8e69a;
      background: #332b0a;
      border: 1px solid #ad781c;
    }

    &.multiplayer {
      color: #d5b8ff;
      background: #25143d;
      border: 1px solid #8f62cb;
    }
  }

  .node-is-start {
    border-left-color: #43e5a7 !important;
    box-shadow: inset 4px 0 #43e5a7, 0 0 18px #43e5a726 !important;
  }

  .node-shape-dialogue {
    border-radius: 0 !important;
  }

  .node-shape-branch {
    border-radius: 22px 22px 0 0 !important;
  }

  .node-shape-checkpoint {
    color: #ffffff;
    background: repeating-conic-gradient(#ffffff 0 25%, #000000 0 50%) !important;
    background-size: 18px 18px !important;
    border: 2px solid #ffffff !important;
    border-radius: 0 !important;

    > * {
      padding: 3px 5px;
      background: #050912ee;
    }
  }

  .node-shape-clear {
    background: #111820 !important;
    border: 2px solid #aeb9c9 !important;
    border-radius: 0 !important;
  }

  .node-shape-label {
    border: 2px dotted #6dc2fb !important;
    border-radius: 0 !important;
  }

  .node-shape-ending {
    background: repeating-conic-gradient(#d94646 0 25%, #050505 0 50%) !important;
    background-size: 18px 18px !important;
    border: 2px solid #e74f4f !important;
    border-radius: 0 !important;

    > * {
      padding: 3px 5px;
      background: #120606ee;
    }
  }

  .node-shape-audio {
    border-radius: 0 22px 0 22px !important;
  }

  .node-shape-image {
    border-radius: 22px 0 22px 0 !important;
  }

  .node-shape-minigame {
    border-radius: 28px !important;
  }

  .node-shape-effect {
    border-radius: 8px !important;
  }

  .flow-node.node-shape-checkpoint,
  .flow-node.node-shape-clear,
  .flow-node.node-shape-label,
  .flow-node.node-shape-ending {
    min-height: 58px;
    padding: 10px 88px 10px 14px;
    align-content: center;
  }

  .compact-node-title {
    width: max-content;
    padding: 4px 7px;
    color: #ffffff !important;
    background: #050912e8;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: 0.75rem !important;
    letter-spacing: 1.2px;
  }

  .flow-node.selected {
    background: #321b55 !important;
    border-color: #c084fc !important;
    outline: 3px solid #7e22ce;
    outline-offset: 2px;
    box-shadow: 0 0 22px #a855f766;
  }

  .flow-node.invalid {
    border-color: #cb381f;
    box-shadow: inset 0 0 18px #cb381f26;

    small {
      color: #e58271;
    }
  }

  .flow-node.label-node {
    min-height: 58px;
    background: #0d1a28;
    border-color: #4a98d9;

    strong {
      color: #ffffff;
      font-family: "Orbitron", "Space Mono", sans-serif;
      letter-spacing: 1px;
    }
  }

  .selecting-route .flow-node.invalid-link-target {
    cursor: not-allowed;
    opacity: 0.3;
  }

  .selecting-route .flow-node.valid-link-target {
    border-color: #9dffa6;
    box-shadow: 0 0 18px #9dffa644;
  }

  .branch-add-button,
  .lane-add-button {
    width: 100%;
    min-height: 34px;
    color: #6dc2fb;
    background: #07111dcc;
    border: 1px dashed #4a98d9;
    font-size: 0.65rem;
  }

  .lane-add-button {
    min-height: 48px;
    margin-top: 20px;

    span {
      margin-right: 5px;
      color: #02fbfb;
      font-size: 1rem;
    }
  }

  .node-inspector {
    border-left: 1px solid #2c3b54;

    .inspector-scroll-content > label,
    .inspector-scroll-content > .route-label,
    .field-grid label {
      display: block;
      margin: 13px 0 6px;
      color: #6dc2fb;
      font-size: 0.68rem;
      text-transform: uppercase;
    }

    .inspector-scroll-content > input,
    .inspector-scroll-content > textarea,
    .inspector-scroll-content > select {
      width: 100%;
    }
  }

  .inspector-warning {
    margin-top: 10px;
    padding: 10px;
    color: #ffd3cc;
    background: #34120d;
    border-left: 3px solid #e58271;
    font-size: 0.72rem;
    line-height: 1.5;
  }

  .inspector-delete-zone {
    margin-top: 28px;
    padding-top: 16px;
    border-top: 1px solid #52251f;

    button {
      width: 100%;
    }
  }

  .button-hover-editor,
  .audio-segment-editor {
    margin-top: 24px;
    padding: 14px;
    background: #07111d;
    border: 1px solid #294668;

    display: grid;
    gap: 10px;

    label {
      color: #6dc2fb;
      font-size: 0.68rem;
      text-transform: uppercase;

      display: grid;
      gap: 6px;
    }
  }

  .audio-segment-editor {
    margin-top: 10px;

    label > div {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 86px;
      gap: 8px;
    }

    input {
      width: 100%;
    }

    small {
      color: #94a3b8;
      line-height: 1.45;
    }
  }

  .inspector-heading,
  .choice-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .inspector-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .inspector-heading p {
    color: #4a98d9;
    font-size: 0.62rem;
  }

  .inspector-heading h2,
  .choice-heading h3 {
    margin: 4px 0 0;
    text-transform: uppercase;
  }

  .field-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 9px;

    input,
    select {
      width: 100%;
    }
  }

  .field-disabled {
    opacity: 0.42;

    small {
      display: block;
      margin-top: 5px;
      color: #94a3b8;
      font-size: 0.64rem;
      line-height: 1.35;
    }
  }

  .inspector-help {
    margin: 12px 0;
    padding: 10px;
    color: #aeb9c9;
    background: #0b1524;
    border-left: 3px solid #4a98d9;
    font-size: 0.72rem;
    line-height: 1.55;

    strong {
      color: #7dd3fc;
    }
  }

  .choice-editor {
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px dashed #334155;
  }

  .choice-row {
    margin-top: 12px;
    padding: 12px;
    background: #080f1b;
    border: 1px solid #2c3b54;

    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;

    > label {
      color: #6dc2fb;
      font-size: 0.66rem;
      letter-spacing: 0.6px;
      text-transform: uppercase;

      display: grid;
      gap: 5px;
    }

    input,
    select {
      width: 100%;
      min-width: 0;
    }
  }

  .choice-row-heading {
    padding-bottom: 8px;
    border-bottom: 1px dashed #334155;

    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;

    strong {
      color: #c4b5fd;
      font-size: 0.68rem;
      letter-spacing: 1px;
    }

    button {
      min-height: 30px;
      padding: 4px 8px;
      color: #ffb4aa;
      border-color: #71362e;
    }
  }

  .choice-field-help {
    margin: -2px 0 2px;
    color: #8893a2;
    font-size: 0.66rem;
    line-height: 1.45;
  }

  .choice-disabled-toggle {
    grid-column: 1 / -1;
    min-height: 34px;
    padding: 5px 8px;
    color: #c4b5fd;
    background: #171329;
    border: 1px solid #4c356f;

    display: flex;
    align-items: center;
    gap: 8px;

    input {
      width: 16px;
      min-height: 16px;
    }
  }

  .decision-severity {
    grid-column: 1 / -1;
    padding: 12px;
    background: #11101d;
    border: 1px solid #4c356f;

    legend {
      padding: 0 6px;
      color: #d8b4fe;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    p {
      margin: 0 0 10px;
      color: #8893a2;
      font-size: 0.68rem;
      line-height: 1.45;
    }

    label {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      margin-right: 14px;
    }

    input {
      width: 16px;
      min-height: 16px;
    }
  }

  .image-color-control {
    color: #aeb9c9;

    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;

    input[type='color'] {
      width: 54px;
      min-height: 36px;
      padding: 3px;
    }
  }

  .choice-route {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 5px;

    > span {
      grid-column: 1 / -1;
      color: #6dc2fb;
      font-size: 0.66rem;
      letter-spacing: 0.6px;
      text-transform: uppercase;
    }

    .route-node-link {
      padding: 9px;
      overflow: hidden;
      color: #9dffa6;
      background: #07111d;
      border: 1px solid #334155;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: left;
    }

    .route-node-link:disabled {
      color: #e58271;
    }
  }

  .route-control {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 5px;

    span,
    .route-node-link {
      min-width: 0;
      padding: 10px;
      overflow: hidden;
      color: #9dffa6;
      background: #07111d;
      border: 1px solid #334155;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: left;
    }

    span.missing,
    .route-node-link.missing {
      color: #e58271;
    }
  }

  .previous-route-list {
    display: grid;
    gap: 5px;

    > span,
    > div {
      min-width: 0;
      min-height: 38px;
      padding: 8px 10px;
      color: #9dffa6;
      background: #07111d;
      border: 1px solid #334155;
    }

    > div {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 5px;

      span,
      .route-node-link {
        overflow: hidden;
        color: #9dffa6;
        background: transparent;
        border: 0;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-align: left;
      }

      button {
        min-height: 28px;
        padding: 3px 8px;
      }
    }

    .missing {
      color: #e58271;
    }
  }

  .select-previous-button {
    width: 100%;
    margin-top: 5px;
  }

  .node-picker-backdrop {
    position: absolute;
    z-index: 20;
    inset: 38px 0 0;
    padding: clamp(10px, 3vw, 28px);
    overflow: auto;
    background: #020617dd;
    backdrop-filter: blur(5px);

    display: grid;
    place-items: center;
  }

  .node-picker {
    width: min(760px, 100%);
    min-width: 0;
    max-height: 85%;
    padding: 22px;
    box-sizing: border-box;
    overflow-y: auto;
    background: #09111e;
    border: 1px solid #02fbfb;
    box-shadow: 0 0 48px #02fbfb33;

    > header {
      position: sticky;
      z-index: 3;
      top: -22px;
      margin-bottom: 20px;
      padding: 22px 0 12px;
      background: #09111ef5;
      border-bottom: 1px solid #243750;

      display: flex;
      justify-content: space-between;
      align-items: start;

      p {
        color: #4a98d9;
        font-size: 0.65rem;
        letter-spacing: 1px;
      }

      h2 {
        margin-top: 5px;
        font-family: "Orbitron", "Space Mono", sans-serif;
      }
    }
  }

  .paste-node-button {
    width: 100%;
    margin-bottom: 15px;
    color: #07111d;
    background: #9dffa6;
    border-color: #9dffa6;
    text-align: left;

    display: grid;
    gap: 3px;

    span,
    strong {
      color: #07111d;
    }

    span {
      font-size: 0.6rem;
    }
  }

  .node-type-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
    gap: 9px;

    button {
      min-height: 104px;
      padding: 12px;
      text-align: left;

      display: grid;
      align-content: center;
      gap: 4px;

      small {
        color: #94a3b8;
        font-size: 0.66rem;
        line-height: 1.35;
      }
    }
  }

  .node-palette-section {
    --palette-accent: #4a98d9;

    margin-top: 16px;
    padding: 14px;
    background: color-mix(in srgb, var(--palette-accent) 8%, #07101d);
    border: 1px solid color-mix(in srgb, var(--palette-accent) 52%, #243750);
    border-left: 5px solid var(--palette-accent);

    > header {
      margin-bottom: 12px;
      padding-bottom: 9px;
      border-bottom: 1px dashed color-mix(in srgb, var(--palette-accent) 55%, transparent);

      small {
        color: #9bb0c6;
      }
    }

    .node-group-label {
      margin: 0 0 5px;
      color: var(--palette-accent);
      font-size: 0.78rem;
      font-weight: 900;
    }

    .node-group-description {
      margin: 0;
    }
  }

  .node-palette-recents {
    --palette-accent: #f8e69a;
  }

  .node-palette-section-1 {
    --palette-accent: #35d3ff;
  }

  .node-palette-section-2 {
    --palette-accent: #c4b5fd;
  }

  .node-palette-section-3 {
    --palette-accent: #ff88b7;
  }

  .node-palette-section-4 {
    --palette-accent: #8cff9c;
  }

  .node-palette-section-5 {
    --palette-accent: #ffb568;
  }

  .story-settings-modal {
    width: min(1120px, 100%);
    max-height: min(90vh, 920px);
    padding: 0;
    overflow: hidden;
    background: #120c08;
    border: 1px solid #ff8a32;
    box-shadow: 0 20px 60px #000000aa;

    display: flex;
    flex-direction: column;

    > header {
      padding: 16px 20px;
      background: #1d1009;
      border-bottom: 1px solid #5b321c;

      display: flex;
      justify-content: space-between;
      align-items: start;

      p {
        color: #ff8a32;
        font-size: 0.62rem;
        letter-spacing: 1.5px;
      }

      h2 {
        margin-top: 3px;
        font-family: "Orbitron", "Space Mono", sans-serif;
      }
    }

    > footer {
      padding: 12px 20px;
      background: #1d1009;
      border-top: 1px solid #5b321c;

      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 14px;

      span {
        color: #c7a58d;
        font-size: 0.7rem;
      }
    }
  }

  .story-settings-backdrop {
    z-index: 30;
    inset: 38px 0 0;
  }

  .story-settings-content {
    min-height: 0;
    padding: 18px;
    overflow-y: auto;

    display: grid;
    gap: 16px;
  }

  .settings-section {
    padding: 16px;
    background: #0d1019;
    border: 1px solid #394456;
    border-left: 4px solid #ff8a32;
  }

  .settings-section-heading {
    margin-bottom: 12px;

    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;

    > div:first-child {
      display: flex;
      align-items: center;
      gap: 10px;

      > span {
        color: #ff8a32;
        font-size: 0.65rem;
        font-weight: 900;
      }
    }

    h3 {
      color: #f5e8dd;
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.9rem;
    }

    small {
      color: #8ea5bd;
      font-size: 0.66rem;
    }
  }

  .metadata-settings-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;

    label {
      color: #ffbd8b;

      display: grid;
      gap: 6px;
    }

    .description-field {
      grid-column: 1 / -1;
    }
  }

  .story-settings-modal .map-toolbar {
    padding: 0;
    background: transparent;
    border: 0;

    align-items: flex-start;
    flex-wrap: wrap;
  }

  .story-settings-modal .start-settings,
  .story-settings-modal .relationship-settings {
    background: #0d1019;
    border-bottom: 1px solid #394456;
    border-left: 4px solid #ff8a32;
  }

  .story-settings-modal .start-settings summary {
    padding: 0;
    color: #f5e8dd;

    span {
      font-family: "Orbitron", "Space Mono", sans-serif;
      font-size: 0.9rem;
      letter-spacing: 0;

      i {
        margin-right: 10px;
        color: #ff8a32;
        font-size: 0.65rem;
        font-style: normal;
      }
    }
  }

  .story-settings-modal .start-settings-content,
  .story-settings-modal .relationship-settings-content {
    max-height: none;
    padding: 14px 0 0;
    border-top-color: #394456;
  }

  .relationship-player-tabs {
    display: flex;
    gap: 6px;

    button.active {
      color: #08111d;
      background: #5ab4f6;
      border-color: #a8ddff;
      box-shadow: 0 0 14px #5ab4f655;
    }
  }

  .protection-confirmation-backdrop {
    z-index: 35;
  }

  .node-search {
    margin-bottom: 20px;

    display: grid;
    gap: 6px;

    span {
      color: #6dc2fb;
      font-size: 0.65rem;
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    input {
      width: 100%;
      padding: 10px 12px;
    }
  }

  .confirmation-dialog {
    width: min(500px, 100%);
    padding: 24px;
    background: #120c08;
    border: 1px solid #ff8a32;
    box-shadow: 0 0 38px #ff8a3244;

    h2 {
      margin: 6px 0 14px;
      font-family: "Orbitron", "Space Mono", sans-serif;
    }

    p {
      color: #c7b8ad;
      line-height: 1.55;
    }

    > div {
      margin-top: 20px;

      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  }

  .node-group-label {
    margin: 8px 0 10px;
    color: #6dc2fb;
    font-size: 0.64rem;
    letter-spacing: 1.4px;
  }

  .node-group-description {
    margin: -4px 0 10px;
    color: #94a3b8;
    font-size: 0.7rem;
    line-height: 1.5;
  }

  .upload-button {
    width: 100%;
    min-height: 42px;
    padding: 10px 12px;
    color: #07111d !important;
    background: #6dc2fb;
    border: 1px solid #6dc2fb;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 800;
    text-align: center;
  }

  .asset-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;

    .upload-button,
    button {
      margin: 0;
    }
  }

  .image-library-backdrop {
    position: absolute;
    z-index: 40;
    inset: 38px 0 0;
    padding: 24px;
    background: #020617e8;

    display: grid;
    place-items: center;
  }

  .image-library-modal {
    width: min(900px, 100%);
    max-height: 86vh;
    padding: 22px;
    overflow-y: auto;
    background: #09111e;
    border: 1px solid #4a98d9;
    box-shadow: 0 0 45px #4a98d944;

    > header {
      position: sticky;
      z-index: 3;
      top: -22px;
      margin-bottom: 18px;
      padding: 22px 0 12px;
      background: #09111ef5;
      border-bottom: 1px solid #243750;

      display: flex;
      justify-content: space-between;
      align-items: start;

      h2 {
        margin-top: 5px;
        font-family: "Orbitron", "Space Mono", sans-serif;
      }
    }
  }

  .image-library-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;

    article {
      min-width: 0;
      padding: 8px;
      background: #07101c;
      border: 1px solid #253b56;

      display: grid;
      gap: 7px;
    }

    .asset-select {
      min-width: 0;
      padding: 0;
      background: transparent;
      border: 0;
      text-align: left;

      display: grid;
      gap: 7px;
    }

    .asset-delete {
      color: #ff9b8b;
      background: #2a0d0a;
      border-color: #cb381f;
      font-size: 0.62rem;
    }

    .asset-built-in {
      padding: 8px;
      color: #67e8f9;
      background: #082f49;
      border: 1px solid #0e7490;
      text-align: center;
    }

    img {
      width: 100%;
      aspect-ratio: 4 / 3;
      object-fit: cover;
      background: #020617;
    }

    span {
      overflow: hidden;
      color: #94a3b8;
      font-size: 0.62rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .asset-warning-backdrop {
    z-index: 45;
  }

  .asset-warning {
    width: min(560px, 100%);
    padding: 26px;
    background: #120b0b;
    border: 1px solid #e58271;
    box-shadow: 0 0 38px #cb381f44;

    h2 {
      margin: 8px 0 12px;
      color: #ffb0a4;
      font-family: "Orbitron", "Space Mono", sans-serif;
    }

    p,
    li {
      color: #d8c2bf;
      line-height: 1.55;
    }

    > div {
      margin-top: 20px;

      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .danger-button {
      color: #fff2ef;
      background: #692519;
      border-color: #e58271;
    }
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .image-preview {
    margin-top: 8px;
    padding: 8px;
    background: #07111d;
    border: 1px solid #334155;

    display: grid;
    gap: 7px;

    img {
      width: 100%;
      max-height: 170px;
      object-fit: contain;
      background: #020617;
    }

    span {
      overflow: hidden;
      color: #94a3b8;
      font-size: 0.62rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .story-image-frame {
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    background: #020617;

    img {
      width: 100%;
      height: 100%;
      max-height: none;
      object-fit: cover;
    }
  }

  .crop-controls {
    display: grid;
    gap: 7px;

    label {
      display: grid;
      gap: 4px;
    }

    span {
      font-size: 0.62rem;
      white-space: normal;
    }

    input[type='range'] {
      width: 100%;
    }
  }

  .image-preview--portrait img {
    width: 112px;
    height: 132px;
    margin: 0 auto;
    object-fit: cover;
  }

  .editor-tutorial {
    width: min(920px, 100%);
    max-height: 85%;
    padding: 24px;
    overflow-y: auto;
    background: #09111e;
    border: 1px solid #02fbfb;
    box-shadow: 0 0 48px #02fbfb33;

    > header {
      position: sticky;
      z-index: 3;
      top: -24px;
      margin-bottom: 18px;
      padding: 24px 0 16px;
      background: #09111ef5;
      border-bottom: 1px solid #1e3a52;

      display: flex;
      justify-content: space-between;
      align-items: start;

      p {
        color: #4a98d9;
        font-size: 0.65rem;
        letter-spacing: 1px;
      }

      h2 {
        margin-top: 5px;
        font-family: "Orbitron", "Space Mono", sans-serif;
      }
    }

    h3,
    h4 {
      color: #eef8ff;
      font-family: "Orbitron", "Space Mono", sans-serif;
    }

    h3 {
      margin: 5px 0 8px;
      font-size: 1rem;
    }

    h4 {
      font-size: 0.83rem;
    }

    ol {
      margin: 14px 0 0 20px;

      display: grid;
      gap: 10px;
    }

    li {
      padding-left: 5px;
      color: #b7c2d3;
      line-height: 1.55;

      strong {
        color: #f8e69a;
      }
    }
  }

  .tutorial-introduction {
    max-width: 78ch;
    margin-bottom: 20px;
    color: #b7c2d3;
    line-height: 1.65;
  }

  .tutorial-workflow,
  .tutorial-node-section {
    padding: 18px;
    background: #07101c;
    border: 1px solid #1f4059;
  }

  .tutorial-workflow {
    margin-bottom: 18px;
  }

  .tutorial-section-label {
    color: #4a98d9;
    font-size: 0.62rem;
    letter-spacing: 1.4px;
  }

  .tutorial-node-sections {
    display: grid;
    gap: 18px;
  }

  .tutorial-section-description {
    margin-bottom: 14px;
    color: #94a3b8;
    line-height: 1.5;
  }

  .tutorial-node-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;

    article {
      padding: 14px;
      background: #0c1726;
      border: 1px solid #263d54;
    }

    article > p {
      color: #b7c2d3;
      line-height: 1.5;
    }
  }

  .tutorial-node-heading {
    margin-bottom: 9px;

    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;

    code {
      padding: 3px 6px;
      color: #02fbfb;
      background: #020617;
      border: 1px solid #17455a;
      font-size: 0.63rem;
    }
  }

  .tutorial-node-usage {
    margin-top: 9px;
    padding-top: 9px;
    border-top: 1px dashed #263d54;

    strong {
      color: #f8e69a;
    }
  }

  .tutorial-footer {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid #1e3a52;

    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 18px;

    p {
      color: #94a3b8;
    }
  }

  .tutorial-warning {
    margin-top: 18px;
    padding: 12px 14px;
    color: #ffdbd6;
    background: #2b1115;
    border: 1px solid #cb381f;
    line-height: 1.5;
  }

  .editor-empty-state {
    height: calc(100% - 38px);
    padding: clamp(24px, 5vw, 64px);
    overflow-y: auto;
  }

  .editor-home-heading {
    width: min(980px, 100%);

    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 24px;

    > div {
      min-width: 0;
    }

    .primary-button {
      flex: 0 0 auto;
    }
  }

  .editor-story-list {
    width: min(980px, 100%);
    margin: 26px 0;

    display: grid;
    gap: 8px;

    article {
      padding: 10px;
      background: #0c1322;
      border: 1px solid #2c3b54;

      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 18px;

      > div {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 6px;
      }
    }

    .editor-story-open {
      min-width: 0;
      text-align: left;

      display: grid;
      gap: 5px;

      strong {
        color: #02fbfb;
      }

      span {
        color: #8893a2;
        font-size: 0.65rem;
      }
    }
  }

  .empty-inspector {
    color: #8893a2;
    line-height: 1.5;
  }

  .toast-message {
    position: absolute;
    z-index: 5;
    right: 20px;
    bottom: 20px;
    max-width: 460px;
    padding: 12px 16px;
    background: #111827;
    border: 1px solid;
    box-shadow: 0 8px 30px #00000099;

    display: flex;
    align-items: center;
    gap: 12px;

    span {
      color: inherit;
    }

    button {
      min-height: 26px;
      padding: 2px 7px;
      color: inherit;
      background: transparent;
      border-color: currentColor;
    }
  }

  @keyframes saved-pulse {
    0%, 100% {
      box-shadow: 0 0 34px color-mix(in srgb, var(--library-terminal-accent) 32%, transparent);
    }

    45% {
      box-shadow:
        0 0 28px color-mix(in srgb, var(--library-terminal-accent) 80%, transparent),
        inset 0 0 18px color-mix(in srgb, var(--library-terminal-accent) 18%, transparent);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .story-library--save-pulse {
      animation: none !important;
    }
  }

  .success-message {
    color: #d7f0bb;
    border-color: #4f813d;
  }

  .error-message {
    color: #ffdbd6;
    border-color: #cb381f;
  }

  .audio-layer-grid {
    margin-top: 8px;

    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;

    label {
      display: flex;
      align-items: center;
      gap: 5px;
    }
  }

  .audio-library-modal {
    max-width: 760px;
  }

  .audio-library-list {
    margin-top: 18px;

    display: grid;
    gap: 12px;

    article {
      padding: 12px;
      background: #0a1220;
      border: 1px solid #294668;

      display: grid;
      grid-template-columns: minmax(150px, 1fr) minmax(220px, 2fr) auto;
      gap: 12px;
      align-items: center;
    }

    div {
      min-width: 0;

      display: grid;
      gap: 4px;
    }

    small {
      overflow: hidden;
      color: #7f96ae;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    audio {
      width: 100%;
    }
  }

  .audio-library-settings {
    margin-top: 16px;
    padding: 12px;
    background: #111a2c;
    border: 1px solid #294668;

    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;

    label {
      min-width: 0;

      display: grid;
      gap: 6px;
    }
  }

  @media (max-width: 1050px) {
    .editor-workspace {
      grid-template-columns: minmax(0, 1fr) 8px var(--inspector-width, 290px);
    }

    .relationship-config-list article {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 800px) {
    .library-content,
    .form-screen {
      padding: 20px 16px;
    }

    .library-heading {
      align-items: stretch;
      flex-direction: column;
    }

    .editor-home-heading {
      align-items: stretch;
      flex-direction: column;
    }

    .editor-story-list article {
      align-items: stretch;
      flex-direction: column;

      > div {
        justify-content: flex-start;
      }
    }

    .selection-panel {
      grid-template-columns: 1fr;

      > p {
        grid-column: 1;
      }
    }

    .editor-workspace {
      overflow-x: auto;
      grid-template-columns: 760px 280px;
    }

    .inspector-resizer {
      display: none;
    }

    .node-inspector.expanded {
      top: 10px;
      bottom: 10px;
      left: 50%;
      width: calc(100% - 20px);
      padding: 0;
      transform: translateX(-50%);
    }

    // Start the solo lane at the edge on phones so it is immediately reachable by touch.
    .flow-lanes.singleplayer-map {
      justify-content: flex-start;
    }

    .editor-toolbar {
      grid-template-columns: 1fr;

      .back-button {
        width: fit-content;
      }
    }

    .mobile-toolbar-toggle {
      width: 100%;
      display: block;
    }

    .editor-toolbar.mobile-collapsed > :not(.mobile-toolbar-toggle),
    .editor-toolbar.mobile-collapsed + .graph-position-help {
      display: none;
    }

    .toolbar-actions {
      justify-content: flex-start;
    }

    .map-toolbar {
      overflow-x: auto;
      align-items: flex-start;
      flex-direction: column;
    }

    .story-settings-modal {
      max-height: calc(100vh - 58px);
    }

    .story-settings-content {
      padding: 10px;
    }

    .settings-section-heading,
    .relationship-settings-heading,
    .story-settings-modal > footer {
      align-items: stretch;
      flex-direction: column;
    }

    .metadata-settings-grid,
    .start-node-grid {
      grid-template-columns: 1fr;
    }

    .metadata-settings-grid .description-field {
      grid-column: auto;
    }

    .relationship-player-tabs {
      width: 100%;

      button {
        flex: 1 1 50%;
      }
    }

    .map-tabs,
    .mode-toggles,
    .cast-controls {
      width: max-content;
    }

    .relationship-settings-heading {
      align-items: stretch;
      flex-direction: column;

      button {
        width: 100%;
      }
    }

    .start-node-grid {
      grid-template-columns: 1fr;
    }

    .relationship-config-list article {
      grid-template-columns: 1fr;
    }

    .node-type-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .tutorial-node-grid {
      grid-template-columns: 1fr;
    }

    .tutorial-footer {
      align-items: stretch;
      flex-direction: column;

      .primary-button {
        width: 100%;
      }
    }

    .audio-library-list article {
      grid-template-columns: 1fr;
    }

    .audio-library-settings {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 420px) {
    .story-grid,
    .node-type-grid {
      grid-template-columns: 1fr;
    }

    .card-actions {
      grid-template-columns: 1fr;
    }

    .seat-picker div {
      grid-template-columns: 1fr;
    }

    .editor-tutorial {
      padding: 18px 14px;
    }

    .toast-message {
      right: 10px;
      bottom: 10px;
      left: 10px;
    }
  }
</style>
