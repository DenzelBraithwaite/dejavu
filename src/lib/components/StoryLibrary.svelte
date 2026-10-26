<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { applySceneAudio, unlockAudioPlayback } from '../audio/audioManager';
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
    { type: 'timed-choice', label: 'Timed choice' },
    { type: 'condition', label: 'Condition' },
    { type: 'clear-terminal', label: 'Clear terminal' },
    { type: 'image', label: 'Image' },
    { type: 'minigame', label: 'Minigame' },
    { type: 'label', label: 'Visual label' },
    { type: 'ending', label: 'Ending' }
  ];

  const companionNodeTypes = [
    { type: 'effect', label: 'Item / effect' },
    { type: 'note', label: 'Note' },
    { type: 'music', label: 'Play music' },
    { type: 'sound-effect', label: 'Sound effect' },
    { type: 'stop-music', label: 'Stop music' },
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
          usage: 'Choose the audience, write the dialogue, select its speaker and expression, then connect Next.'
        },
        {
          name: 'Player input',
          type: 'input',
          description: 'Saves a free-form response in the current story session without changing the character.',
          usage: 'Choose a saved key, then reuse the response in text or effects with a token such as {INPUT_FAVORITE_COLOR}.'
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
          description: 'Shows two to five labelled buttons with static or campaign-state locks and optional player-mode changes.',
          usage: 'Set labels, item/flag/stat/relationship requirements, and destinations. A mode-changing option starts the matching map.'
        },
        {
          name: 'Timed choice',
          type: 'timed-choice',
          description: 'Works like Choice but automatically selects a fallback when its timer expires.',
          usage: 'Set the duration, buttons, fallback option, and a destination for every option.'
        },
        {
          name: 'Dice',
          type: 'dice-check',
          description: 'Rolls a selected die against a character stat and target value.',
          usage: 'Choose the die, stat, and target, then connect both Success and Failure.'
        },
        {
          name: 'Condition',
          type: 'condition',
          description: 'Immediately routes by an item, flag, stat threshold, or previous dice result.',
          usage: 'Select the rule and connect both True and False. Conditions do not display a prompt.'
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
          name: 'Play music',
          type: 'music',
          description: 'Starts layered music without stopping tracks already playing.',
          usage: 'Choose a library track, ID, layer, volume, loop behavior, and fades, then attach it to its starting scene.'
        },
        {
          name: 'Sound effect',
          type: 'sound-effect',
          description: 'Plays a one-shot or looping sound while existing music continues.',
          usage: 'Choose a library sound, volume, loop behavior, and fades, then attach it to the triggering scene.'
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
          name: 'Item / effect',
          type: 'effect',
          description: 'Changes campaign state by giving items, setting flags, adjusting stats, or managing mods.',
          usage: 'Select the operation and value, then attach it to the flow node where the change occurs.'
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
          name: 'Stop music',
          type: 'stop-music',
          description: 'Stops every track or selected music IDs/layers without adding another story step.',
          usage: 'Choose optional track IDs, layers, fade-out time, and whether looping sounds also stop, then attach it.'
        },
        {
          name: 'Visual label',
          type: 'label',
          description: 'Adds a heading or note to organize the editor canvas without affecting play.',
          usage: 'Write a useful chapter or section title. Labels never receive story routes.'
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
  const minigamesWithDraws = new Set([
    'billywig',
    'lo-hi',
    'firewall-auction',
    'drone-relay'
  ]);

  let mode: EditorMode = 'library';
  let newTitle = '';
  let newDescription = '';
  let newAuthor = '';
  let newPlayModes = {
    singleplayer: false,
    multiplayer: true
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
  let imageLibraryTarget: 'portrait' | 'image' = 'image';
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

  function openTutorial(): void {
    tutorialOpen = true;
  }

  function closeTutorial(): void {
    tutorialOpen = false;
  }

  function openExpandedInspector(node: StoryNode): void {
    linkSelection = null;
    selectedNodeId = node.id;
    activeLane = (node.audience ?? 'both') as LaneId;
    errorMessage = '';
    inspectorExpanded = true;

    tick().then(() => {
      inspectorElement?.scrollTo({ top: 0 });
    });
  }

  function closeExpandedInspector(): void {
    inspectorExpanded = false;
  }

  function adjustMapZoom(delta: number): void {
    const nextZoom = Math.min(maximumMapZoom, Math.max(minimumMapZoom, mapZoom + delta));
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
    inspectorWidth = Math.min(maximumInspectorWidth, Math.max(minimumInspectorWidth, inspectorWidth + delta));
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

  function selectStory(storyId: string, mode: StoryPlayMode): void {
    clearMessages();
    unlockAudioPlayback();
    socket.emit('library:select-story', {
      storyId,
      mode
    }, handleSimpleResult('Cartridge inserted. Story Mode is ready.'));
  }

  function matchPartnerCartridge(): void {
    if (!partnerSelection) {
      return;
    }

    const partnerMode = partnerId
      ? $libraryState.selectionModes[partnerId]
      : null;

    if (partnerMode) {
      selectStory(partnerSelection, partnerMode);
    }
  }

  function createStory(): void {
    clearMessages();
    socket.emit('library:create-story', {
      title: newTitle,
      description: newDescription,
      author: newAuthor,
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
      newPlayModes = {
        singleplayer: false,
        multiplayer: true
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
        : fallbackNodeId;
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
        mode: activeStoryMap
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
      || candidate.type === 'stop-music'
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

    if (!prepared.singleplayerInitialSceneId
      || !prepared.nodes.some((node) => node.id === prepared.singleplayerInitialSceneId)) {
      const startId = `${prepared.id}.solo.start`;
      const endingId = `${prepared.id}.solo.ending`;
      prepared.singleplayerInitialSceneId = startId;
      prepared.nodes.push(
        {
          id: startId,
          type: 'dialogue',
          audience: 'p1',
          map: 'singleplayer',
          speaker: 'SYSTEM',
          text: 'Your story begins here.',
          next: endingId
        },
        {
          id: endingId,
          type: 'ending',
          audience: 'p1',
          map: 'singleplayer',
          text: 'End of story.'
        }
      );
    }

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

      if (node.type === 'background') {
        node.type = 'screen-effect';
        node.screenEffect = 'color';
        node.backgroundTheme ??= terminalThemes.includes(String(node.background))
          ? node.background as StoryNode['backgroundTheme']
          : 'blue';
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
      }

      if (['choice', 'vote', 'timed-choice'].includes(node.type)) {
        node.choices ??= [];

        while (node.choices.length < 2) {
          const optionNumber = node.choices.length + 1;

          node.choices.push({
            id: `option-${optionNumber}`,
            label: `Option ${optionNumber}`,
            next: ''
          });
        }

        const enabledFallback = node.choices.find((choice) => !choice.disabled);

        if (node.type === 'timed-choice'
          && !node.choices.some(
            (choice) => choice.id === node.fallbackChoiceId && !choice.disabled
          )) {
          node.fallbackChoiceId = enabledFallback?.id ?? node.choices[0].id;
        }
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

      if (node.type === 'label') {
        node.text = String(node.text ?? '').slice(0, 60);
      }

      if (node.type === 'note') {
        node.text = String(node.text ?? '').slice(0, 5000);
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

      if (node.type === 'music' || node.type === 'sound-effect') {
        node.audioId ??= `${node.id}.audio`;
        node.audioLayer ??= 1;
        node.audioLoop ??= node.type === 'music';
        node.audioVolume ??= 1;
        node.fadeInSeconds ??= 0;
        node.fadeOutSeconds ??= 0;
      }

      if (node.type === 'stop-music') {
        node.stopMusicIds ??= [];
        node.stopMusicLayers ??= [];
        node.stopSounds ??= false;
        node.fadeOutSeconds ??= 0;
      }
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
    } else if (['clear-terminal', 'stop-music'].includes(type)) {
      shapeClass = 'node-shape-clear';
    } else if (['label', 'note'].includes(type)) {
      shapeClass = 'node-shape-label';
    } else if (['ambience', 'music', 'sound-effect'].includes(type)) {
      shapeClass = 'node-shape-audio';
    } else if (type === 'image') {
      shapeClass = 'node-shape-image';
    } else if (type === 'minigame') {
      shapeClass = 'node-shape-minigame';
    } else if (['effect', 'screen-effect'].includes(type)) {
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
    return ['checkpoint', 'clear-terminal', 'stop-music', 'label', 'note', 'ending'].includes(node.type);
  }

  function compactNodeTitle(node: StoryNode): string {
    const titles: Record<string, string> = {
      checkpoint: 'CHECKPOINT',
      'clear-terminal': 'CLEAR',
      'stop-music': 'STOP MUSIC',
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

  function duplicateSelectedNode(): void {
    if (!selectedNode) {
      return;
    }

    duplicateNode(selectedNode);
  }

  function duplicateNode(node: StoryNode): void {
    copiedNode = structuredClone(node);
    openNodePicker({
      lane: (node.audience ?? 'both') as LaneId,
      insertAfterId: node.id
    });
    pasteNode();
  }

  function copySelectedNode(): void {
    if (!selectedNode) {
      return;
    }

    copyNode(selectedNode);
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

    if (
      Object.values(editingStory.initialSceneIds).includes(node.id)
      || editingStory.singleplayerInitialSceneId === node.id
    ) {
      errorMessage = 'Choose a different start node before deleting this one.';
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

  function ensureTimedChoiceFallback(): void {
    if (!selectedNode || selectedNode.type !== 'timed-choice') {
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
    const choiceCount = Math.min(5, Math.max(2, requestedCount || 2));
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
      maxColumns: Math.max(1, ...orderedLevels.map((level) => level.nodes.length))
    };
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
    selectedNodeId = map === 'singleplayer'
      ? editingStory.singleplayerInitialSceneId
      : editingStory.initialSceneIds.p1;
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

    refreshStory();
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

    return sourceLane === 'both'
      ? destinationLane === 'both'
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
          || (choice.playerMode && choice.playerMode !== nodeMap(node))
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
    return ['dialogue', 'input', 'checkpoint', 'conversation', 'image', 'clear-terminal']
      .includes(node.type);
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
    if (!editingStory || node.type === 'label') {
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

    return (!isStartNode && !hasIncomingRoute) || hasMissingRoute || hasBrokenRoute;
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

  async function openImageLibrary(target: 'portrait' | 'image'): Promise<void> {
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
    } else {
      selectedNode.src = path;
    }

    imageLibraryOpen = false;
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

  function selectStoryAudio(asset: AudioAsset): void {
    if (!selectedNode) {
      return;
    }

    rememberForUndo();

    if (audioLibraryTarget === 'music') {
      selectedNode.music = asset.path;
    } else {
      selectedNode.sound = asset.path;
    }

    audioLibraryOpen = false;
    refreshStory();
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
          key: 'item-id'
        }
      : undefined;
    refreshStory();
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
    const previousScrollTop = inspectorElement?.scrollTop ?? 0;

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

        if (inspectorElement) {
          inspectorElement.scrollTop = previousScrollTop;
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
          continueLabel: 'Continue'
        };
      case 'choice':
      case 'vote':
      case 'timed-choice':
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
          ...(type === 'timed-choice'
            ? {
                durationMs: 20_000,
                fallbackChoiceId: 'option-1'
              }
            : {})
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
          success: '',
          failure: ''
        };
      case 'effect':
        return {
          id,
          type,
          audience: 'both',
          attachedTo: '',
          text: 'You acquired a new item.',
          effects: [
            {
              type: 'add-item',
              key: 'new-item'
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
      case 'music':
        return {
          id,
          type,
          audience: 'both',
          attachedTo: '',
          music: '',
          audioId: `${id}.audio`,
          audioLayer: 1,
          audioLoop: true,
          audioVolume: 1,
          fadeInSeconds: 0,
          fadeOutSeconds: 0
        };
      case 'sound-effect':
        return {
          id,
          type,
          audience: 'both',
          attachedTo: '',
          sound: '',
          audioId: `${id}.audio`,
          audioLayer: 1,
          audioLoop: false,
          audioVolume: 1,
          fadeInSeconds: 0,
          fadeOutSeconds: 0
        };
      case 'stop-music':
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
        </div>
        <div>
          <span>PARTNER CARTRIDGE</span>
          <strong>{storyTitle(partnerSelection)}</strong>
        </div>
        {#if partnerSelection && (
          partnerSelection !== localSelection
        )}
          <button type="button" on:click={matchPartnerCartridge}>Swap to partner cartridge</button>
        {/if}
        <p>
          {$libraryState.activeStoryId
            ? $libraryState.activeStoryMode === 'singleplayer'
              ? 'CARTRIDGE ACTIVE — STORY MODE READY'
              : 'LINK ESTABLISHED — STORY MODE READY'
            : 'WAITING FOR MATCHING CARTRIDGES'}
        </p>
      </div>

      <div class="story-grid">
        {#each $libraryState.stories as story}
          <article class:selected={localSelection === story.id}>
            <div class="story-card-header">
              <span>{story.builtIn ? 'BUILT-IN' : 'PLAYABLE'}</span>
              <span>V{story.version}</span>
            </div>
            <h2>{story.title}</h2>
            <p>{story.description || 'No description yet.'}</p>
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
                <button type="button" on:click={() => selectStory(story.id, 'singleplayer')}>
                  {localSelection === story.id && localSelectionMode === 'singleplayer'
                    ? 'Singleplayer inserted'
                    : 'Insert singleplayer'}
                </button>
              {/if}
              {#if story.playModes.multiplayer}
                <button type="button" on:click={() => selectStory(story.id, 'multiplayer')}>
                  {localSelection === story.id && localSelectionMode === 'multiplayer'
                    ? 'Multiplayer inserted'
                    : 'Insert multiplayer'}
                </button>
              {/if}
            </div>
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
        A starter graph with separate Player 1 and Player 2 openings will be created automatically.
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
              {#each $characterLibraryState.characters as character}
                <option value={character.id}>{character.name}</option>
              {/each}
            </select>
          {/if}

          {#if newPlayModes.multiplayer}
            <label for="new-p1-character">Player 1 character</label>
            <select id="new-p1-character" bind:value={newMainCharacterIds.multiplayer.p1}>
              <option value="">Choose a character</option>
              {#each $characterLibraryState.characters as character}
                <option value={character.id}>{character.name}</option>
              {/each}
            </select>

            <label for="new-p2-character">Player 2 character</label>
            <select id="new-p2-character" bind:value={newMainCharacterIds.multiplayer.p2}>
              <option value="">Choose a different character</option>
              {#each $characterLibraryState.characters as character}
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
          <input aria-label="Story title" bind:value={editingStory.title} maxlength="80">
          <span>VERSION {editingStory.version} · {editingStory.builtIn ? 'BUILT-IN' : 'PLAYABLE'}</span>
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
          <button type="button" disabled={saveInFlight} on:click={requestPlaytest}>
            ▶ Play
          </button>
          <button class="primary-button" type="button" disabled={saveInFlight} on:click={() => saveStory()}>
            {saveInFlight ? 'Saving…' : 'Save story'}
          </button>
        </div>
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
                {#each $characterLibraryState.characters as character}
                  <option value={character.id}>{character.name}</option>
                {/each}
              </select>
            </label>
          {:else}
            <label>
              <span>Player 1</span>
              <select bind:value={editingStory.mainCharacterIds.multiplayer.p1}>
                <option value="">Choose a character</option>
                {#each $characterLibraryState.characters as character}
                  <option value={character.id}>{character.name}</option>
                {/each}
              </select>
            </label>
            <label>
              <span>Player 2</span>
              <select bind:value={editingStory.mainCharacterIds.multiplayer.p2}>
                <option value="">Choose a different character</option>
                {#each $characterLibraryState.characters as character}
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

      <p class="graph-position-help">
        Routes control rows. Select a node to change its audience or edit its previous and next connections in the inspector.
      </p>

      <div class="editor-workspace" style={`--inspector-width: ${inspectorWidth}px`}>
        <div
          class="flow-canvas"
          class:selecting-route={Boolean(linkSelection)}
          aria-label="Story flow"
          bind:this={flowCanvasElement}
        >
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

          {#if linkSelection}
            <div class="link-mode-banner" role="status">
              <span>Select a destination for {linkSelection.label.toLowerCase()}.</span>
              <button type="button" on:click={cancelLinkSelection}>Cancel</button>
            </div>
          {/if}

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
                style={`--lane-columns: ${laneGraph.maxColumns}`}
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
                          class:has-route={routeFields(node).some((field) => getRouteValue(node, field))}
                          class:connected-before={nodeIsIncomingConnection(node, selectedNode)}
                          class:connected-after={nodeIsOutgoingConnection(node, selectedNode)}
                          class:connected-companion={nodeIsCompanionConnection(node, selectedNode)}
                        >
                          {#if branchPathLabel(node)}
                            <span class="branch-path-label">{branchPathLabel(node)}</span>
                          {:else if nodeMergesRoutes(node)}
                            <span class="branch-path-label merge-label">MERGED PATHS</span>
                          {/if}
                      <div class="node-quick-actions" aria-label={`Quick actions for ${displayNodeName(node)}`}>
                        {#if !isCompanionNode(node) && node.type !== 'label'}
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
                        on:click|stopPropagation={() => selectNode(node)}
                      >
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
              <button class="inspector-modal-close" type="button" on:click={closeExpandedInspector}>
                × Close expanded view
              </button>
            {/if}

            <div class="inspector-heading">
              <div>
                <p>NODE INSPECTOR</p>
                <h2>{selectedNode.type}</h2>
                <code>{selectedNode.id}</code>
              </div>
              <div class="inspector-actions">
                <button type="button" on:click={copySelectedNode}>Copy</button>
                <button type="button" on:click={duplicateSelectedNode}>Duplicate</button>
              </div>
            </div>

            <label for="node-audience">Audience</label>
            {#if activeStoryMap === 'singleplayer'}
              <input id="node-audience" value="Player 1" disabled>
            {:else}
              <select
                id="node-audience"
                bind:value={selectedNode.audience}
                on:change={() => {
                  activeLane = selectedNode.audience;
                  refreshStory();
                }}
              >
                <option value="p1">Player 1</option>
                <option value="both">Both players</option>
                <option value="p2">Player 2</option>
              </select>
            {/if}

            {#if activeStoryMap === 'singleplayer' && ['checkpoint', 'conversation', 'vote'].includes(selectedNode.type)}
              <p class="inspector-warning">This is a multiplayer-only node. Replace it before playing this solo map.</p>
            {/if}

            {#if selectedNode.type !== 'label' && !(isCompanionNode(selectedNode) && selectedNode.attachedTo !== undefined)}
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
              <label for="input-key">Saved input key</label>
              <input
                id="input-key"
                bind:value={selectedNode.inputKey}
                placeholder="FAVORITE_COLOR"
              >
              <p class="inspector-help">
                This response lasts until the story restarts. Refer to it later with
                {'{INPUT_FAVORITE_COLOR}'} when the key is FAVORITE_COLOR.
              </p>
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

            {#if selectedNode.type === 'dialogue'
              || (selectedNode.type === 'effect' && selectedNode.attachedTo === undefined)}
              <label for="node-speaker">Speaker</label>
              {#if selectedNode.type === 'dialogue'}
                <select id="node-speaker" bind:value={selectedNode.characterId}>
                  <option value="">Custom speaker</option>
                  {#each $characterLibraryState.characters as character}
                    <option value={character.id}>{character.name}</option>
                  {/each}
                </select>
              {:else}
                <input id="node-speaker" bind:value={selectedNode.speaker}>
              {/if}
            {/if}

            {#if selectedNode.type === 'dialogue'}
              {#if selectedNode.characterId}
                <label for="dialogue-expression">Expression</label>
                <select id="dialogue-expression" bind:value={selectedNode.expression}>
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
                <p class="inspector-help">Custom speakers remain supported for system messages and unnamed extras.</p>
              {/if}
              <label for="dialogue-continue-label">Continue button text</label>
              <input
                id="dialogue-continue-label"
                bind:value={selectedNode.continueLabel}
                maxlength="60"
                placeholder="Continue"
              >
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
                  <input id="dice-stat" bind:value={selectedNode.stat}>
                </div>
                <div>
                  <label for="dice-target">Target</label>
                  <input id="dice-target" type="number" bind:value={selectedNode.threshold}>
                </div>
              </div>
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

            {#if ['choice', 'vote', 'timed-choice'].includes(selectedNode.type)}
              {#if selectedNode.type === 'timed-choice'}
                <label for="choice-duration">Timer in milliseconds</label>
                <input id="choice-duration" type="number" min="1000" bind:value={selectedNode.durationMs}>
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
              {#if selectedNode.type === 'timed-choice'}
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
                    <label>
                      <span>Player mode</span>
                      <select bind:value={choice.playerMode}>
                        <option value="">Keep current mode</option>
                        <option value="singleplayer">Set 1 player</option>
                        <option value="multiplayer">Set 2 players</option>
                      </select>
                    </label>
                    <p class="choice-field-help">
                      Keep current mode follows this option normally. The other values switch the active session to that player count and open its map.
                    </p>
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
                        <select aria-label="Requirement type" bind:value={choice.condition.type}>
                          <option value="has-item">Has item</option>
                          <option value="flag-equals">Flag equals</option>
                          <option value="stat-at-least">Stat at least</option>
                          <option value="relationship-at-least">Relationship at least</option>
                        </select>
                        <input
                          aria-label="Requirement key"
                          bind:value={choice.condition.key}
                          placeholder="Item, flag, stat, or character ID"
                        >
                        {#if choice.condition.type !== 'has-item'}
                          <input
                            aria-label="Requirement value"
                            bind:value={choice.condition.value}
                            placeholder="Required value"
                          >
                        {/if}
                      </div>
                    {/if}
                    {#if choice.playerMode && choice.playerMode !== nodeMap(selectedNode)}
                      <p class="inspector-help">
                        Starts at the configured {choice.playerMode === 'multiplayer' ? 'Player 1 and Player 2' : 'single-player'} opening node.
                      </p>
                    {:else}
                      <div class="choice-route">
                        <span>Destination</span>
                        <button class="route-node-link" type="button" disabled={!choice.next} on:click={() => selectConnectedNode(choice.next)}>{routeLabel(selectedNode, `choices.${index}.next`)}</button>
                        <button type="button" on:click={() => startLinkSelection(`choices.${index}.next`, `Option ${index + 1}`)}>Select</button>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
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

            {#if selectedNode.type === 'effect'}
              <label for="effect-type">Effect</label>
              <select id="effect-type" bind:value={selectedNode.effects[0].type}>
                <option value="add-item">Give item</option>
                <option value="remove-item">Remove item</option>
                <option value="set-flag">Set story flag</option>
                <option value="set-player-name">Set player name</option>
                <option value="adjust-stat">Adjust stat</option>
                <option value="adjust-relationship">Adjust relationship</option>
                <option value="discover-character">Discover character</option>
                {#if activeStoryMap === 'multiplayer'}
                  <option value="install-mod">Install multiplayer neuro mod</option>
                  <option value="remove-mod">Remove multiplayer neuro mod</option>
                {/if}
              </select>
              {#if selectedNode.effects[0].type !== 'set-player-name'}
                <label for="effect-key">Item, flag, stat, relationship, character, or mod ID</label>
                <input id="effect-key" bind:value={selectedNode.effects[0].key}>
              {/if}
              <label for="effect-value">Optional value</label>
              <input id="effect-value" bind:value={selectedNode.effects[0].value}>
              <p class="inspector-help">
                Values can use saved input tokens such as {'{INPUT_FAVORITE_COLOR}'}.
              </p>
            {/if}

            {#if selectedNode.type === 'condition'}
              <label for="condition-type">Condition</label>
              <select id="condition-type" bind:value={selectedNode.condition.type}>
                <option value="has-item">Player has item</option>
                <option value="flag-equals">Story flag equals value</option>
                <option value="stat-at-least">Player stat is at least value</option>
                <option value="relationship-at-least">Relationship is at least value</option>
                <option value="last-dice-success">Previous dice check succeeded</option>
              </select>
              {#if selectedNode.condition.type !== 'last-dice-success'}
                <label for="condition-key">Item, flag, stat, or relationship ID</label>
                <input id="condition-key" bind:value={selectedNode.condition.key}>
              {/if}
              {#if ['flag-equals', 'stat-at-least', 'relationship-at-least'].includes(selectedNode.condition.type)}
                <label for="condition-value">Comparison value</label>
                <input id="condition-value" bind:value={selectedNode.condition.value}>
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

            {#if selectedNode.type === 'music'}
              <span class="inspector-label">Selected music</span>
              <p class="inspector-help">{selectedNode.music || 'No track selected.'}</p>
              <button type="button" on:click={() => openAudioLibrary('music')}>Select from audio library</button>
            {/if}

            {#if selectedNode.type === 'sound-effect'}
              <label for="sound-source">Sound effect path</label>
              <input id="sound-source" bind:value={selectedNode.sound} placeholder="/audio/sounds/door.wav">
              <button type="button" on:click={() => openAudioLibrary('sound')}>Select from audio library</button>
            {/if}

            {#if ['music', 'sound-effect'].includes(selectedNode.type)}
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
              <p class="inspector-help">
                Tracks overlap by default. IDs target one track; layers let a Stop music node control a group.
              </p>
            {/if}

            {#if selectedNode.type === 'stop-music'}
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
              <label class="choice-disabled-toggle">
                <input type="checkbox" bind:checked={selectedNode.stopSounds}>
                Stop sound effects too
              </label>
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

            <div class="inspector-delete-zone">
              <button class="danger-button" type="button" on:click={deleteSelectedNode}>
                Delete node
              </button>
            </div>
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
              <p class="node-group-label">RECENTLY USED</p>
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
            {/if}

            {#each tutorialNodeSections as section}
              {@const visibleNodes = section.nodes.filter((node) => nodeAvailableForMap(node.type) && nodeMatchesSearch(node, nodeSearch))}
              {#if visibleNodes.length > 0}
                <p class="node-group-label">{section.title}</p>
                <p class="node-group-description">{section.description}</p>
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
              {/if}
            {/each}
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
                <li><strong>Add to Player</strong> appends a node to that lane. It auto-connects only when the previous node has an unused normal route.</li>
                <li><strong>+ next, + yes, or + no</strong> creates a node directly on that route. Use <strong>Select node</strong> to connect an existing node instead.</li>
                <li><strong>Select previous node</strong> makes an existing node lead into the selected node. Red nodes are missing a required or valid connection.</li>
                <li><strong>Loops are supported.</strong> Route branch endings back to a Choice hub and route one exit button forward. Backward routes display <strong>↻ LOOP</strong>.</li>
                <li>Use the <strong>Player 1</strong> and <strong>Player 2</strong> lanes for private scenes. Put synchronized actions and votes in <strong>Shared</strong>.</li>
                <li>Companions use <strong>Select host node</strong>. They never receive previous or next routes.</li>
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
              <span>{story.builtIn ? 'BUILT-IN' : 'PLAYABLE'} · V{story.version}</span>
            </button>
            <div>
              <button type="button" on:click={() => openEditor(story.id)}>Edit</button>
              <button type="button" on:click={() => duplicateStory(story.id)}>Duplicate</button>
              {#if !story.builtIn}
                <button class="danger-button" type="button" on:click={() => deleteStory(story.id)}>
                  {deleteArmedId === story.id ? 'Confirm delete' : 'Delete'}
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
                <button class="asset-delete" type="button" on:click={() => deleteStoryImage(imagePath)}>
                  DELETE
                </button>
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

        {#if selectedNode && ['music', 'sound-effect'].includes(selectedNode.type)}
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

  .story-grid {
    margin-top: 22px;

    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 16px;

    article {
      padding: 20px;
      background: #0c1322;
      border: 1px solid #2c3b54;

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
      box-shadow: 0 0 20px #02fbfb22;
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
    grid-template-rows: auto auto auto minmax(0, 1fr);
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
    padding: 14px;
    overflow-y: auto;
    background: #09111e;

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
      padding: clamp(20px, 3vw, 38px);
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
    position: sticky;
    z-index: 2;
    top: 0;
    width: 100%;
    margin-bottom: 16px;
    color: #ffd5b5;
    background: #35170a;
    border-color: #ff8a32;
  }

  .flow-canvas {
    position: relative;
    padding: 18px;
    overflow: auto;
    background-color: #050912;
    background-image:
      linear-gradient(#1472bf18 1px, transparent 1px),
      linear-gradient(90deg, #1472bf18 1px, transparent 1px);
    background-size: 24px 24px;

  }

  .map-zoom-controls {
    position: sticky;
    z-index: 7;
    top: 0;
    width: max-content;
    margin: 0 0 10px auto;
    padding: 4px;
    background: #07111dee;
    border: 1px solid #334155;
    box-shadow: 0 5px 18px #00000066;

    display: flex;
    gap: 4px;

    &.link-active {
      top: 58px;
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

    display: flex;
    gap: 16px;
    align-items: stretch;
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
    position: sticky;
    z-index: 6;
    top: 0;
    margin-bottom: 14px;
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

  .flow-lane {
    flex: 0 0 auto;
    width: calc(
      (var(--lane-columns, 1) * 258px)
      + ((var(--lane-columns, 1) - 1) * 12px)
      + 20px
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

    display: flex;
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

    &.connected-before .flow-node {
      border-color: #c084fc !important;
      border-style: dotted !important;
      border-width: 2px !important;
      box-shadow: none;

      &::after {
        content: none;
      }
    }

    &.connected-after .flow-node {
      border-color: #c084fc !important;
      border-style: dashed !important;
      border-width: 2px !important;
      box-shadow: none;

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
    border-left: 7px solid #55f09a !important;
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

    > label,
    > .route-label,
    .field-grid label {
      display: block;
      margin: 13px 0 6px;
      color: #6dc2fb;
      font-size: 0.68rem;
      text-transform: uppercase;
    }

    > input,
    > textarea,
    > select {
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

  .inspector-actions {
    width: 100%;

    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 5px;

    button {
      min-width: 0;
      min-height: 34px;
      padding: 5px;
      font-size: 0.64rem;
    }

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
      margin-bottom: 18px;

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
      margin-bottom: 18px;
      padding-bottom: 16px;
      background: #09111e;
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
      padding: 18px;
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
    .editor-toolbar.mobile-collapsed + .map-toolbar,
    .editor-toolbar.mobile-collapsed + .map-toolbar + .graph-position-help {
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

    .map-tabs,
    .mode-toggles,
    .cast-controls {
      width: max-content;
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
