<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import {
    applySceneAudio,
    resumeStoryAudio,
    unlockAudioPlayback
  } from '../audio/audioManager';
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
    type StoryChapter,
    type StoryDocument,
    type StoryNode,
    type StoryVersionSummary
  } from '../stores/library';
  import location from '../stores/location';
  import { campaignState } from '../stores/campaign';
  import { sessionState, type PlayerId } from '../stores/session';
  import RichTextEditor from './RichTextEditor.svelte';
  import StoryChapterManager from './story-editor/StoryChapterManager.svelte';
  import StoryEditorGuide from './story-editor/StoryEditorGuide.svelte';
  import StoryEditorToolbar from './story-editor/StoryEditorToolbar.svelte';
  import StoryValidationToast from './story-editor/StoryValidationToast.svelte';
  import StoryVersionHistory from './story-editor/StoryVersionHistory.svelte';
  import {
    companionNodeTypes,
    nodeTypes,
    tutorialNodeSections,
    type TutorialNode
  } from './story-editor/catalog';
  import type {
    StoryPlayMode,
    StoryValidationIssue
  } from './story-editor/types';

  type EditorMode = 'library' | 'create' | 'editor';
  type LaneId = 'p1' | 'both' | 'p2';
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


  type PlayerPortraitPreview = {
    roleLabel: string;
    character?: CharacterRecord;
  };
  type RouteOverlayConnection = {
    id: string;
    path: string;
    kind: 'flow' | 'companion';
    selected: boolean;
  };
  type MinimapNode = {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    companion: boolean;
    selected: boolean;
  };
  type MinimapViewport = {
    x: number;
    y: number;
    width: number;
    height: number;
  };


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
  const terminalThemeColors: Record<string, string> = {
    blue: '#19488e',
    red: '#ef5b67',
    purple: '#b77aff',
    green: '#55f09a',
    amber: '#f0b94f',
    pink: '#ff75c8',
    cyan: '#02fbfb',
    white: '#e8edf6'
  };
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
  let colorCopyTimer: number | undefined;
  let copiedColorKey = '';
  let lastToastKey = '';
  let validationIssues: StoryValidationIssue[] = [];
  let validationDetailsOpen = false;
  let lastLocation = '';
  let nodeSearch = '';
  let recentNodeTypes: string[] = [];
  let playtestWarningOpen = false;
  let playtestSeatPickerOpen = false;
  let pendingPlaytestSeat: PlayerId | null = null;
  let saveInFlight = false;
  let savePulse = false;
  let lastSavedStoryKey = '';
  let autosaveTimer: number | undefined;
  let savePulseTimer: number | undefined;
  let inspectorElement: HTMLElement;
  let flowCanvasElement: HTMLElement;
  let flowPanelElement: HTMLElement;
  let graphPresentationFrame: number | undefined;
  let routeOverlayConnections: RouteOverlayConnection[] = [];
  let minimapNodes: MinimapNode[] = [];
  let minimapViewport: MinimapViewport = {
    x: 0,
    y: 0,
    width: 100,
    height: 100
  };
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
  let playerPortraitPreviews: PlayerPortraitPreview[] = [];
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
  let storyVersions: StoryVersionSummary[] = [];
  let versionHistoryLoading = false;
  let versionRestoreInFlight = false;
  let chapterIssueCounts: Record<string, number> = {};

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
    loadStoryVersions();
  }

  function closeStorySettings(): void {
    storySettingsOpen = false;
    unprotectConfirmationOpen = false;
  }

  function addChapter(): void {
    if (!editingStory) {
      return;
    }

    rememberForUndo();
    const chapterNumber = editingStory.chapters.length + 1;
    const usedIds = new Set(editingStory.chapters.map((chapter) => chapter.id));
    const baseId = `chapter-${chapterNumber}`;
    let id = baseId;
    let suffix = 2;

    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }

    editingStory.chapters.push({
      id,
      name: `Chapter ${chapterNumber}`,
      color: chapterPaletteColor(chapterNumber - 1),
      description: '',
      collapsed: false
    });
    refreshStory();
  }

  function updateChapter(event: CustomEvent<{
    chapterId: string;
    field: keyof StoryChapter;
    value: string | boolean;
  }>): void {
    if (!editingStory) {
      return;
    }

    const chapter = editingStory.chapters.find(
      (candidate) => candidate.id === event.detail.chapterId
    );

    if (!chapter) {
      return;
    }

    rememberForUndo();
    const { field, value } = event.detail;

    if (field === 'collapsed') {
      chapter.collapsed = Boolean(value);
    } else if (field === 'color') {
      chapter.color = String(value).toUpperCase();
    } else if (field === 'name' || field === 'description') {
      chapter[field] = String(value);
    }

    refreshStory();
  }

  function moveChapter(event: CustomEvent<{ chapterId: string; direction: -1 | 1 }>): void {
    if (!editingStory) {
      return;
    }

    const index = editingStory.chapters.findIndex(
      (chapter) => chapter.id === event.detail.chapterId
    );
    const destination = index + event.detail.direction;

    if (index < 0 || destination < 0 || destination >= editingStory.chapters.length) {
      return;
    }

    rememberForUndo();
    const [chapter] = editingStory.chapters.splice(index, 1);
    editingStory.chapters.splice(destination, 0, chapter);
    refreshStory();
  }

  function removeChapter(event: CustomEvent<{ chapterId: string }>): void {
    if (!editingStory) {
      return;
    }

    rememberForUndo();
    editingStory.chapters = editingStory.chapters.filter(
      (chapter) => chapter.id !== event.detail.chapterId
    );

    for (const node of editingStory.nodes) {
      if (node.chapterId === event.detail.chapterId) {
        node.chapterId = '';
      }
    }

    refreshStory();
  }

  function toggleChapter(event: CustomEvent<{ chapterId: string }>): void {
    const chapter = editingStory?.chapters.find(
      (candidate) => candidate.id === event.detail.chapterId
    );

    if (!chapter) {
      return;
    }

    rememberForUndo();
    chapter.collapsed = !chapter.collapsed;
    refreshStory();
  }

  function chapterPaletteColor(index: number): string {
    const colors = ['#02FBFB', '#8D7CFF', '#FF75C8', '#55F09A', '#F0B94F', '#EF5B67'];

    return colors[index % colors.length];
  }

  function loadStoryVersions(): void {
    if (!editingStory || versionHistoryLoading) {
      return;
    }

    versionHistoryLoading = true;
    socket.emit('library:get-story-versions', editingStory.id, (result: {
      ok: boolean;
      versions?: StoryVersionSummary[];
      error?: string;
    }) => {
      versionHistoryLoading = false;

      if (!result.ok) {
        errorMessage = result.error ?? 'Could not load story version history.';
        return;
      }

      storyVersions = result.versions ?? [];
    });
  }

  function restoreStoryVersion(event: CustomEvent<{ version: number }>): void {
    if (!editingStory || versionRestoreInFlight) {
      return;
    }

    const requestedVersion = event.detail.version;

    if (storyContentKey(editingStory) !== lastSavedStoryKey) {
      saveStory('manual', () => {
        performStoryVersionRestore(requestedVersion);
      });
      return;
    }

    performStoryVersionRestore(requestedVersion);
  }

  function performStoryVersionRestore(version: number): void {
    if (!editingStory) {
      return;
    }

    const selectedBeforeRestore = selectedNodeId;
    versionRestoreInFlight = true;
    clearMessages();
    socket.emit('library:restore-story-version', {
      storyId: editingStory.id,
      version
    }, (result: {
      ok: boolean;
      story?: StoryDocument;
      versions?: StoryVersionSummary[];
      error?: string;
    }) => {
      versionRestoreInFlight = false;

      if (!result.ok || !result.story) {
        errorMessage = result.error ?? 'Could not restore the selected story version.';
        return;
      }

      editingStory = prepareStoryForEditor(result.story);
      storyVersions = result.versions ?? [];
      selectedNodeId = editingStory.nodes.some((node) => node.id === selectedBeforeRestore)
        ? selectedBeforeRestore
        : editingStory.nodes[0]?.id ?? '';
      activeLane = (editingStory.nodes.find((node) => node.id === selectedNodeId)?.audience
        ?? 'p1') as LaneId;
      lastSavedStoryKey = storyContentKey(editingStory);
      resetHistory();
      storyRevision += 1;
      statusMessage = `Restored version ${version} as new version ${editingStory.version}.`;
      pulseSavedTerminal();
      void scrollSelectedNodeIntoView();
    });
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

  function scheduleGraphPresentationForState(
    _revision: number,
    _zoom: number,
    _sidebarWidth: number,
    _selectedId: string,
    _storyMap: StoryPlayMode,
    storyAvailable: boolean
  ): void {
    if (storyAvailable && flowCanvasElement && flowPanelElement) {
      scheduleGraphPresentation();
    }
  }

  function scheduleGraphPresentation(): void {
    window.cancelAnimationFrame(graphPresentationFrame ?? 0);
    graphPresentationFrame = window.requestAnimationFrame(() => {
      void tick().then(updateGraphPresentation);
    });
  }

  function updateGraphPresentation(): void {
    if (!editingStory || !flowCanvasElement || !flowPanelElement) {
      routeOverlayConnections = [];
      minimapNodes = [];
      return;
    }

    const panelRect = flowPanelElement.getBoundingClientRect();
    const canvasRect = flowCanvasElement.getBoundingClientRect();
    const nodeElements = new Map<string, HTMLElement>();

    for (const element of flowCanvasElement.querySelectorAll<HTMLElement>('[data-node-id]')) {
      const nodeId = element.dataset.nodeId;

      if (nodeId) {
        nodeElements.set(nodeId, element);
      }
    }

    routeOverlayConnections = buildRouteOverlayConnections(nodeElements, panelRect);
    minimapNodes = buildMinimapNodes(nodeElements, canvasRect);
    minimapViewport = {
      x: percentage(flowCanvasElement.scrollLeft, flowCanvasElement.scrollWidth),
      y: percentage(flowCanvasElement.scrollTop, flowCanvasElement.scrollHeight),
      width: percentage(flowCanvasElement.clientWidth, flowCanvasElement.scrollWidth),
      height: percentage(flowCanvasElement.clientHeight, flowCanvasElement.scrollHeight)
    };
  }

  function buildRouteOverlayConnections(
    nodeElements: Map<string, HTMLElement>,
    panelRect: DOMRect
  ): RouteOverlayConnection[] {
    if (!editingStory) {
      return [];
    }

    const connections: RouteOverlayConnection[] = [];

    for (const node of editingStory.nodes) {
      for (const field of routeFields(node)) {
        const destinationId = getRouteValue(node, field);

        if (!destinationId) {
          continue;
        }

        const path = connectionPath(
          nodeElements.get(node.id),
          nodeElements.get(destinationId),
          panelRect,
          false
        );

        if (path) {
          connections.push({
            id: `${node.id}:${field}:${destinationId}`,
            path,
            kind: 'flow',
            selected: selectedNodeId === node.id || selectedNodeId === destinationId
          });
        }
      }

      if (!isCompanionNode(node) || !node.attachedTo) {
        continue;
      }

      const path = connectionPath(
        nodeElements.get(node.attachedTo),
        nodeElements.get(node.id),
        panelRect,
        true
      );

      if (path) {
        connections.push({
          id: `${node.attachedTo}:companion:${node.id}`,
          path,
          kind: 'companion',
          selected: selectedNodeId === node.id || selectedNodeId === node.attachedTo
        });
      }
    }

    return connections;
  }

  function connectionPath(
    sourceElement: HTMLElement | undefined,
    destinationElement: HTMLElement | undefined,
    panelRect: DOMRect,
    companion: boolean
  ): string {
    if (!sourceElement
      || !destinationElement
      || sourceElement.offsetParent === null
      || destinationElement.offsetParent === null) {
      return '';
    }

    const sourceRect = sourceElement.getBoundingClientRect();
    const destinationRect = destinationElement.getBoundingClientRect();
    const sourceX = companion
      ? sourceRect.right - panelRect.left
      : sourceRect.left + (sourceRect.width / 2) - panelRect.left;
    const sourceY = companion
      ? sourceRect.top + (sourceRect.height / 2) - panelRect.top
      : sourceRect.bottom - panelRect.top;
    const destinationX = companion
      ? destinationRect.left - panelRect.left
      : destinationRect.left + (destinationRect.width / 2) - panelRect.left;
    const destinationY = companion
      ? destinationRect.top + (destinationRect.height / 2) - panelRect.top
      : destinationRect.top - panelRect.top;

    if (companion) {
      const middleX = sourceX + ((destinationX - sourceX) / 2);

      return `M ${sourceX} ${sourceY} H ${middleX} V ${destinationY} H ${destinationX}`;
    }

    if (destinationY >= sourceY) {
      const middleY = sourceY + ((destinationY - sourceY) / 2);

      return `M ${sourceX} ${sourceY} V ${middleY} H ${destinationX} V ${destinationY}`;
    }

    const loopOffset = sourceX <= destinationX ? 42 : -42;
    const loopX = sourceX + loopOffset;

    return `M ${sourceX} ${sourceY} V ${sourceY + 24} H ${loopX} V ${destinationY - 24} H ${destinationX} V ${destinationY}`;
  }

  function buildMinimapNodes(
    nodeElements: Map<string, HTMLElement>,
    canvasRect: DOMRect
  ): MinimapNode[] {
    if (!editingStory) {
      return [];
    }

    return editingStory.nodes.flatMap((node) => {
      const element = nodeElements.get(node.id);

      if (!element || element.offsetParent === null) {
        return [];
      }

      const rect = element.getBoundingClientRect();
      const contentX = rect.left - canvasRect.left + flowCanvasElement.scrollLeft;
      const contentY = rect.top - canvasRect.top + flowCanvasElement.scrollTop;

      return [{
        id: node.id,
        x: percentage(contentX, flowCanvasElement.scrollWidth),
        y: percentage(contentY, flowCanvasElement.scrollHeight),
        width: Math.max(1.5, percentage(rect.width, flowCanvasElement.scrollWidth)),
        height: Math.max(1.5, percentage(rect.height, flowCanvasElement.scrollHeight)),
        companion: isCompanionNode(node),
        selected: selectedNodeId === node.id
      }];
    });
  }

  function percentage(value: number, total: number): number {
    if (total <= 0) {
      return 0;
    }

    return clamp((value / total) * 100, 0, 100);
  }

  function navigateFromMinimap(event: MouseEvent): void {
    if (!flowCanvasElement) {
      return;
    }

    const minimap = event.currentTarget as HTMLElement;
    const stage = minimap.querySelector<HTMLElement>('.story-minimap-stage');
    const rect = stage?.getBoundingClientRect() ?? minimap.getBoundingClientRect();
    const horizontalProgress = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const verticalProgress = clamp((event.clientY - rect.top) / rect.height, 0, 1);

    flowCanvasElement.scrollTo({
      left: (horizontalProgress * flowCanvasElement.scrollWidth) - (flowCanvasElement.clientWidth / 2),
      top: (verticalProgress * flowCanvasElement.scrollHeight) - (flowCanvasElement.clientHeight / 2),
      behavior: 'smooth'
    });
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
    window.addEventListener('resize', scheduleGraphPresentation);
  });

  $: playerId = $sessionState.playerId;
  $: playableCharacters = $characterLibraryState.characters.filter(
    (character) => character.type === 'playable'
  );
  $: speakerCharacters = $characterLibraryState.characters.filter(
    (character) => character.type !== 'account'
  );
  $: playerPortraitPreviews = editingStory
    ? activeStoryMap === 'singleplayer'
      ? [{
          roleLabel: 'Player',
          character: playableCharacters.find(
            (character) => character.id === editingStory?.mainCharacterIds.singleplayer
          )
        }]
      : (['p1', 'p2'] as PlayerId[]).map((storyPlayerId) => ({
          roleLabel: storyPlayerId === 'p1' ? 'Player 1' : 'Player 2',
          character: playableCharacters.find(
            (character) => character.id === editingStory?.mainCharacterIds.multiplayer[storyPlayerId]
          )
        }))
    : [];
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
  $: chapterIssueCounts = editingStory
    ? buildChapterIssueCounts(editingStory)
    : {};
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
  $: scheduleGraphPresentationForState(
    storyRevision,
    mapZoom,
    inspectorWidth,
    selectedNodeId,
    activeStoryMap,
    Boolean(editingStory)
  );
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
    const toastKey = `${statusMessage}|${errorMessage}|${validationIssues.length}`;

    if (toastKey !== lastToastKey) {
      lastToastKey = toastKey;
      window.clearTimeout(toastTimer);

      if ((statusMessage || errorMessage) && validationIssues.length === 0) {
        toastTimer = window.setTimeout(clearMessages, 4200);
      }
    }
  }

  onDestroy(() => {
    window.clearTimeout(toastTimer);
    window.clearTimeout(colorCopyTimer);
    window.clearTimeout(savePulseTimer);
    window.clearInterval(autosaveTimer);
    window.cancelAnimationFrame(graphPresentationFrame ?? 0);
    window.removeEventListener('resize', scheduleGraphPresentation);
    finishInspectorResize();
    socket.emit('library:release-story');
    editorLockStoryId = '';
  });

  async function copyPropertyColor(key: string, value: string | undefined): Promise<void> {
    const color = String(value ?? '').trim().toUpperCase();

    if (!color) {
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(color);
      } else {
        copyTextWithFallback(color);
      }

      showCopiedColorFeedback(key);
    } catch {
      copyTextWithFallback(color);
      showCopiedColorFeedback(key);
    }
  }

  function showCopiedColorFeedback(key: string): void {
    copiedColorKey = key;
    window.clearTimeout(colorCopyTimer);
    colorCopyTimer = window.setTimeout(() => {
      copiedColorKey = '';
    }, 1600);
  }

  function copyTextWithFallback(value: string): void {
    const copyField = document.createElement('textarea');

    copyField.value = value;
    copyField.setAttribute('readonly', '');
    copyField.style.position = 'fixed';
    copyField.style.opacity = '0';
    document.body.appendChild(copyField);
    copyField.select();
    document.execCommand('copy');
    copyField.remove();
  }

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
    validationIssues = [];
    validationDetailsOpen = false;
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

  function playSelectedCartridge(): void {
    clearMessages();

    if (!localSelection
      || localSelection !== $libraryState.activeStoryId
      || localSelectionMode !== $libraryState.activeStoryMode) {
      errorMessage = 'Both players must finish inserting the same cartridge before playing.';
      return;
    }

    if ($libraryState.activeStoryMode === 'multiplayer'
      && !multiplayerCartridgeReady()) {
      errorMessage = 'Both players must insert this multiplayer cartridge before the story can begin.';
      return;
    }

    unlockAudioPlayback();
    resumeStoryAudio();
    primeSelectedCartridgeAudio();
    location.set('terminal');
  }

  function primeSelectedCartridgeAudio(): void {
    const campaign = $campaignState;
    const campaignPlayerId = $libraryState.activeStoryMode === 'multiplayer'
      ? localStorySeat
      : playerId;

    if (!campaign?.story
      || !campaignPlayerId
      || (campaign.sessionMode === 'multiplayer' && !multiplayerCartridgeReady())) {
      return;
    }

    const currentSceneId = campaign.currentScene[campaignPlayerId];
    const currentScene = campaign.story.nodes.find(
      (candidate) => candidate.id === currentSceneId
    );

    if (!currentScene) {
      return;
    }

    const currentAudioCues = [
      currentScene,
      ...campaign.story.nodes.filter(
        (candidate) => candidate.attachedTo === currentScene.id
      )
    ];

    // Start the known cartridge cue inside the Play-button gesture. The
    // terminal recognizes the same track ID and leaves it running.
    applySceneAudio(currentAudioCues);
  }

  function multiplayerCartridgeReady(): boolean {
    return Boolean(
      $sessionState.bothPlayersConnected
      && $libraryState.seatClaims.p1
      && $libraryState.seatClaims.p2
      && $libraryState.activeStoryId
    );
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
      storyVersions = [];
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
      storyVersions = [];
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

    synchronizeStoryCharacterIds();
    const issues = storyValidationIssues(editingStory);
    const saveBlockingIssues = issues.filter((issue) => issue.blocksSave);

    if (saveBlockingIssues.length > 0) {
      if (source === 'manual') {
        showValidationReport(issues, 'save');
      }

      return;
    }

    clearMessages();
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
        showValidationReport(
          storyValidationIssues(submittedStory),
          'save',
          result.error ?? 'Could not save the story.'
        );
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

    synchronizeStoryCharacterIds();
    const issues = storyValidationIssues(editingStory);
    const playBlockingIssues = issues.filter((issue) => issue.blocksPlay);

    if (playBlockingIssues.length > 0) {
      showValidationReport(issues, 'play');
      return;
    }

    const ownsSeatForEditorStory = localSelection === editingStory.id
      && localSelectionMode === 'multiplayer'
      && Boolean(localStorySeat);

    if (activeStoryMap === 'multiplayer' && !ownsSeatForEditorStory) {
      pendingPlaytestSeat = null;
      playtestSeatPickerOpen = true;
      return;
    }

    if ($libraryState.activeStoryId && $libraryState.activeStoryId !== editingStory.id) {
      playtestWarningOpen = true;
      return;
    }

    startPlaytest();
  }

  function continuePlaytestWithSeat(): void {
    if (!editingStory || !pendingPlaytestSeat) {
      return;
    }

    playtestSeatPickerOpen = false;

    if ($libraryState.activeStoryId && $libraryState.activeStoryId !== editingStory.id) {
      playtestWarningOpen = true;
      return;
    }

    startPlaytest();
  }

  function cancelPlaytestSeatPicker(): void {
    playtestSeatPickerOpen = false;
    pendingPlaytestSeat = null;
  }

  function cancelPlaytestWarning(): void {
    playtestWarningOpen = false;
    pendingPlaytestSeat = null;
  }

  function startPlaytest(): void {
    if (!editingStory) {
      return;
    }

    unlockAudioPlayback();

    if (activeStoryMap === 'singleplayer' || multiplayerCartridgeReady()) {
      resumeStoryAudio();
      primePlaytestAudio();
    }

    const playtestSeat = pendingPlaytestSeat
      ?? (
        localSelection === editingStory.id
          && localSelectionMode === 'multiplayer'
          ? localStorySeat
          : null
      );

    const launch = (): void => {
      const ownsSelectedPlaytestSeat = activeStoryMap === 'singleplayer'
        || (
          localSelection === editingStory?.id
          && localSelectionMode === 'multiplayer'
          && localStorySeat === playtestSeat
        );

      if ($libraryState.activeStoryId === editingStory?.id
        && $libraryState.activeStoryMode === activeStoryMap
        && ownsSelectedPlaytestSeat) {
        playtestWarningOpen = false;
        pendingPlaytestSeat = null;
        location.set('terminal');
        return;
      }

      socket.emit('library:select-story', {
        storyId: editingStory?.id,
        mode: activeStoryMap,
        seat: activeStoryMap === 'multiplayer' ? playtestSeat : undefined
      }, (result: { ok: boolean; error?: string }) => {
        if (!result.ok) {
          errorMessage = result.error ?? 'Could not stage the playtest.';
          return;
        }

        playtestWarningOpen = false;
        pendingPlaytestSeat = null;
        location.set('terminal');
      });
    };

    // Playtesting always waits for a confirmed server save, even when the local
    // document appears unchanged, so the cartridge can never launch stale data.
    saveStory('manual', launch);
  }

  function primePlaytestAudio(): void {
    if (!editingStory
      || (activeStoryMap === 'multiplayer' && !multiplayerCartridgeReady())) {
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
    prepared.chapters ??= [];
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
      node.chapterId = prepared.chapters.some((chapter) => chapter.id === node.chapterId)
        ? node.chapterId
        : '';
      delete node.clearTerminal;
      node.textFormats = Array.isArray(node.textFormats) ? node.textFormats : [];
      node.promptFormats = Array.isArray(node.promptFormats) ? node.promptFormats : [];

      if (node.map === 'singleplayer') {
        node.audience = 'p1';
      }

      if (node.type === 'label') {
        node.attachedTo ??= '';
      }

      if (node.type === 'background') {
        node.type = 'screen-effect';
        node.screenEffect = 'color';
        node.backgroundTheme ??= terminalThemeColors[String(node.background)]
          ? node.background as StoryNode['backgroundTheme']
          : 'blue';
        node.effectColor = terminalThemeColors[String(node.backgroundTheme)]
          ?? terminalThemeColors.blue;
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
        node.continueLabel ??= 'Continue';
        node.imagePositionX ??= 50;
        node.imagePositionY ??= 50;
        node.logText ??= node.alt ?? '';
        node.imageBorderColor ??= '#1472bf';
        node.timed ??= false;
        node.durationMs ??= 3_000;
        node.showCountdown ??= true;
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

        if (node.type === 'choice' && node.timed) {
          const durationMs = Number(node.durationMs);

          node.durationMs = Number.isFinite(durationMs)
            ? Math.max(0, durationMs)
            : 0;
        }
      }

      if (node.type === 'dice-check') {
        node.spectatorRoll ??= false;
      }

      if (node.type === 'screen-effect') {
        node.effectDurationSeconds ??= node.screenEffect === 'blink' ? 0.75 : 0.6;
        node.effectIterations ??= 1;
        node.effectLoop ??= false;
        node.glowTarget ??= 'inner';
        node.mirrorAxis ??= 'horizontal';
        node.spinDirection ??= 'clockwise';
        node.effectColor ??= '#39ff88';
        node.scanDirection ??= 'left-to-right';

        if (node.screenEffect === 'color'
          && (!node.effectColor || node.effectColor === '#39ff88')) {
          node.effectColor = terminalThemeColors[String(node.backgroundTheme)]
            ?? terminalThemeColors.blue;
        }
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

    for (const companion of prepared.nodes.filter(isCompanionNode)) {
      const host = prepared.nodes.find((node) => node.id === companion.attachedTo);

      if (host) {
        companion.chapterId = host.chapterId ?? '';
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
      selectedNode.glowTarget ??= 'inner';
    } else if (requestedEffect === 'color') {
      selectedNode.effectLoop = false;
      selectedNode.effectColor = terminalThemeColors[String(selectedNode.backgroundTheme)]
        ?? terminalThemeColors.blue;
    }

    refreshStory();
  }

  function nodeAvailableForMap(type: string): boolean {
    const companionHost = editingStory?.nodes.find(
      (node) => node.id === insertionTarget?.sourceId
    );
    const modeAllowsNode = activeStoryMap !== 'singleplayer'
      || !['checkpoint', 'conversation', 'vote'].includes(type);
    const targetAllowsNode = !insertionTarget?.companionOnly
      || isCompanionNodeType(type);
    const clearTerminalAllowsNode = companionHost?.type !== 'clear-terminal'
      || type === 'stop-audio';

    return modeAllowsNode && targetAllowsNode && clearTerminalAllowsNode;
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

  function storyValidationIssues(story: StoryDocument): StoryValidationIssue[] {
    const issues: StoryValidationIssue[] = [];
    const nodesById = new Map(story.nodes.map((node) => [node.id, node]));
    const charactersById = new Map(
      $characterLibraryState.characters.map((character) => [character.id, character])
    );
    const enabledStartIds: string[] = [];

    if (!story.playModes.singleplayer && !story.playModes.multiplayer) {
      issues.push({
        id: 'story:no-play-mode',
        title: 'No playable map enabled',
        message: 'The cartridge has neither a single-player nor multiplayer map enabled.',
        fix: 'Open Story Settings and enable at least one playable map.',
        blocksSave: true,
        blocksPlay: true
      });
    }

    if (story.playModes.singleplayer) {
      addPlayableCharacterIssue(
        issues,
        charactersById,
        story.mainCharacterIds.singleplayer,
        'Single-player character',
        'singleplayer'
      );
      addStartIssue(
        issues,
        nodesById,
        story.singleplayerInitialSceneId,
        'Single-player start',
        'singleplayer',
        'p1'
      );
      enabledStartIds.push(story.singleplayerInitialSceneId);
    }

    if (story.playModes.multiplayer) {
      addPlayableCharacterIssue(
        issues,
        charactersById,
        story.mainCharacterIds.multiplayer.p1,
        'Player 1 character',
        'multiplayer'
      );
      addPlayableCharacterIssue(
        issues,
        charactersById,
        story.mainCharacterIds.multiplayer.p2,
        'Player 2 character',
        'multiplayer'
      );

      if (story.mainCharacterIds.multiplayer.p1
        && story.mainCharacterIds.multiplayer.p1 === story.mainCharacterIds.multiplayer.p2) {
        issues.push({
          id: 'story:duplicate-multiplayer-character',
          title: 'Players share the same character',
          message: 'Player 1 and Player 2 cannot use the same main character.',
          fix: 'Open Story Settings and select a different playable character for either player.',
          map: 'multiplayer',
          blocksSave: true,
          blocksPlay: true
        });
      }

      if (story.multiplayerStartMode === 'shared') {
        const sharedStartId = story.initialSceneIds.p1 === story.initialSceneIds.p2
          ? story.initialSceneIds.p1
          : '';

        addStartIssue(
          issues,
          nodesById,
          sharedStartId,
          'Shared multiplayer start',
          'multiplayer',
          'both'
        );
        enabledStartIds.push(sharedStartId);
      } else {
        addStartIssue(
          issues,
          nodesById,
          story.initialSceneIds.p1,
          'Player 1 start',
          'multiplayer',
          'p1'
        );
        addStartIssue(
          issues,
          nodesById,
          story.initialSceneIds.p2,
          'Player 2 start',
          'multiplayer',
          'p2'
        );
        enabledStartIds.push(story.initialSceneIds.p1, story.initialSceneIds.p2);
      }
    }

    const reachableNodeIds = collectReachableNodeIds(story, enabledStartIds);
    const seenNodeIds = new Set<string>();

    for (const node of story.nodes) {
      const nodeTitle = displayNodeName(node);
      const map = nodeMap(node);

      if (!node.id || seenNodeIds.has(node.id)) {
        issues.push({
          id: `node:${node.id || 'missing'}:duplicate-id`,
          title: node.id ? `Duplicate node ID: ${node.id}` : 'Node is missing an ID',
          message: 'Every node must have a unique, non-empty ID.',
          fix: 'Delete and recreate the duplicate node so the editor can generate a unique ID.',
          nodeId: node.id || undefined,
          map,
          blocksSave: true,
          blocksPlay: true
        });
      }

      seenNodeIds.add(node.id);

      const character = node.characterId
        ? charactersById.get(node.characterId)
        : undefined;

      if (node.characterId && (!character || character.type === 'account')) {
        issues.push({
          id: `node:${node.id}:invalid-speaker`,
          title: `${nodeTitle} has an unavailable character`,
          message: `Node ${node.id} references a character that no longer exists or is an account character.`,
          fix: 'Open the node and select a playable character, an NPC, or Custom speaker.',
          nodeId: node.id,
          map,
          blocksSave: true,
          blocksPlay: true
        });
      } else if (node.type === 'change-character'
        && !node.resetToDefault
        && character?.type !== 'playable') {
        issues.push({
          id: `node:${node.id}:invalid-character-change`,
          title: `${nodeTitle} needs a playable character`,
          message: `Change Character node ${node.id} does not target a playable story character.`,
          fix: 'Select a playable character or enable Reset to default.',
          nodeId: node.id,
          map,
          blocksSave: true,
          blocksPlay: true
        });
      }

      if (['choice', 'vote', 'timed-choice'].includes(node.type)) {
        addChoiceValidationIssues(issues, node, nodeTitle, map);
      }

      if (isCompanionNode(node)) {
        const host = node.attachedTo ? nodesById.get(node.attachedTo) : undefined;

        if (!host || !canAttachToNode(node, host)) {
          issues.push({
            id: `node:${node.id}:invalid-host`,
            title: `${nodeTitle} is not attached`,
            message: `Companion node ${node.id} has no valid host in its lane.`,
            fix: 'Open the node and use Select host node to attach it to a main-flow node.',
            nodeId: node.id,
            map,
            blocksSave: false,
            blocksPlay: false
          });
        }

        continue;
      }

      const isStart = enabledStartIds.includes(node.id);
      const hasIncomingRoute = story.nodes.some((candidate) => (
        routeFields(candidate).some((field) => getRouteValue(candidate, field) === node.id)
      ));

      if (!isStart && !hasIncomingRoute) {
        issues.push({
          id: `node:${node.id}:unconnected`,
          title: `${nodeTitle} is not connected`,
          message: `Node ${node.id} cannot currently be reached from another node.`,
          fix: 'Connect a previous node, choose it as a valid start, or remove it if it is unused.',
          nodeId: node.id,
          map,
          blocksSave: false,
          blocksPlay: false
        });
      }

      if (!reachableNodeIds.has(node.id)) {
        continue;
      }

      const backwardFields = routeFields(node).filter((field) => {
        const destination = nodesById.get(getRouteValue(node, field));

        return destination ? routeMovesBackward(node, destination) : false;
      });

      if (backwardFields.length > 0) {
        issues.push({
          id: `node:${node.id}:backward-chapter-route`,
          title: `${nodeTitle} routes to an earlier chapter`,
          message: `Node ${node.id} has a route that moves backward in the configured chapter order.`,
          fix: 'Move the destination chapter later, assign the nodes to the same chapter, or reconnect the route to a later chapter.',
          nodeId: node.id,
          map,
          blocksSave: false,
          blocksPlay: true
        });
      }

      const brokenFields = routeFields(node).filter((field) => {
        const destinationId = getRouteValue(node, field);
        const destination = nodesById.get(destinationId);

        return Boolean(destinationId)
          && (!destination
            || destination.type === 'label'
            || (!routeMovesBackward(node, destination) && !canLinkToNode(node.id, destination)));
      });

      if (brokenFields.length > 0) {
        issues.push({
          id: `node:${node.id}:broken-route`,
          title: `${nodeTitle} has a broken route`,
          message: `Node ${node.id} points to an unavailable or incompatible destination.`,
          fix: 'Reconnect the affected destination using the node’s route controls.',
          nodeId: node.id,
          map,
          blocksSave: false,
          blocksPlay: true
        });
      }

      if (node.type === 'image' && !String(node.src ?? '').trim()) {
        issues.push({
          id: `node:${node.id}:missing-image`,
          title: `${nodeTitle} has no image`,
          message: `Image node ${node.id} is reachable but has no artwork selected.`,
          fix: 'Open the node and upload an image or select one from the image library.',
          nodeId: node.id,
          map,
          blocksSave: false,
          blocksPlay: true
        });
      }
    }

    return issues;
  }

  function buildChapterIssueCounts(story: StoryDocument): Record<string, number> {
    const nodeById = new Map(story.nodes.map((node) => [node.id, node]));
    const counts: Record<string, number> = {};

    for (const issue of storyValidationIssues(story)) {
      const chapterId = issue.nodeId
        ? nodeById.get(issue.nodeId)?.chapterId
        : '';

      if (chapterId) {
        counts[chapterId] = (counts[chapterId] ?? 0) + 1;
      }
    }

    return counts;
  }

  function addPlayableCharacterIssue(
    issues: StoryValidationIssue[],
    charactersById: Map<string, CharacterRecord>,
    characterId: string | null,
    label: string,
    map: StoryPlayMode
  ): void {
    if (characterId && charactersById.get(characterId)?.type === 'playable') {
      return;
    }

    issues.push({
      id: `story:${map}:${label.toLowerCase().replaceAll(' ', '-')}`,
      title: `${label} is missing`,
      message: `${label} must reference an existing playable character.`,
      fix: 'Open Story Settings and select a character from the playable-character library.',
      map,
      blocksSave: true,
      blocksPlay: true
    });
  }

  function addStartIssue(
    issues: StoryValidationIssue[],
    nodesById: Map<string, StoryNode>,
    nodeId: string,
    label: string,
    map: StoryPlayMode,
    audience: LaneId
  ): void {
    const node = nodesById.get(nodeId);

    if (startNodeIsValid(node, map, audience)) {
      return;
    }

    const expectedAudience = audience === 'both' ? 'the Shared lane' : `${audience.toUpperCase()} lane`;
    issues.push({
      id: `story:${map}:${audience}:invalid-start`,
      title: `${label} is missing or invalid`,
      message: node
        ? `${node.id} cannot be used as ${label.toLowerCase()}.`
        : `No node is selected for ${label.toLowerCase()}.`,
      fix: `Open Story Settings and choose a player-facing scene or Condition node on ${expectedAudience}.`,
      nodeId: node?.id,
      map,
      blocksSave: false,
      blocksPlay: true
    });
  }

  function addChoiceValidationIssues(
    issues: StoryValidationIssue[],
    node: StoryNode,
    nodeTitle: string,
    map: StoryPlayMode
  ): void {
    const choices = node.choices ?? [];
    const enabledChoices = choices.filter((choice) => !choice.disabled);

    if (choices.length < 2 || choices.length > 5) {
      issues.push({
        id: `node:${node.id}:choice-count`,
        title: `${nodeTitle} has an invalid option count`,
        message: `Node ${node.id} contains ${choices.length} options; it requires between two and five.`,
        fix: 'Open the node and add or remove options until it has two to five.',
        nodeId: node.id,
        map,
        blocksSave: true,
        blocksPlay: true
      });
    }

    if (enabledChoices.length === 0) {
      issues.push({
        id: `node:${node.id}:no-enabled-choice`,
        title: `${nodeTitle} has no selectable option`,
        message: `Every option on node ${node.id} is disabled.`,
        fix: 'Enable at least one option so the player can continue.',
        nodeId: node.id,
        map,
        blocksSave: true,
        blocksPlay: true
      });
    }

    if (node.timed && !enabledChoices.some((choice) => choice.id === node.fallbackChoiceId)) {
      issues.push({
        id: `node:${node.id}:missing-fallback`,
        title: `${nodeTitle} needs a timed fallback`,
        message: `Timed choice node ${node.id} has no enabled fallback option.`,
        fix: 'Choose one enabled option as the automatic selection.',
        nodeId: node.id,
        map,
        blocksSave: true,
        blocksPlay: true
      });
    }
  }

  function collectReachableNodeIds(story: StoryDocument, startIds: string[]): Set<string> {
    const nodesById = new Map(story.nodes.map((node) => [node.id, node]));
    const reachable = new Set<string>();
    const pending = startIds.filter(Boolean);

    while (pending.length > 0) {
      const nodeId = pending.shift();

      if (!nodeId || reachable.has(nodeId)) {
        continue;
      }

      const node = nodesById.get(nodeId);

      if (!node) {
        continue;
      }

      reachable.add(nodeId);

      for (const field of routeFields(node)) {
        const destinationId = getRouteValue(node, field);

        if (destinationId && !reachable.has(destinationId)) {
          pending.push(destinationId);
        }
      }
    }

    return reachable;
  }

  function showValidationReport(
    issues: StoryValidationIssue[],
    action: 'play' | 'save',
    fallbackMessage = ''
  ): void {
    window.clearTimeout(toastTimer);
    validationIssues = issues.length > 0
      ? issues
      : [{
          id: `story:${action}:unknown-error`,
          title: `The story could not ${action}`,
          message: fallbackMessage || `The story could not ${action}.`,
          fix: 'Review Story Settings and the currently selected node, then try again.',
          blocksSave: action === 'save',
          blocksPlay: action === 'play'
        }];
    validationDetailsOpen = false;
    errorMessage = action === 'play'
      ? `Cannot play this story: ${validationIssues.filter((issue) => issue.blocksPlay).length} issue${validationIssues.filter((issue) => issue.blocksPlay).length === 1 ? '' : 's'} must be fixed.`
      : `Cannot save this story: ${validationIssues.filter((issue) => issue.blocksSave).length} issue${validationIssues.filter((issue) => issue.blocksSave).length === 1 ? '' : 's'} must be fixed.`;
  }

  function toggleValidationDetails(): void {
    validationDetailsOpen = !validationDetailsOpen;
    window.clearTimeout(toastTimer);
  }

  function focusValidationIssue(issue: StoryValidationIssue): void {
    if (!editingStory || !issue.nodeId) {
      if (issue.map) {
        openStorySettings();
      }

      clearMessages();
      return;
    }

    const node = editingStory.nodes.find((candidate) => candidate.id === issue.nodeId);

    if (!node) {
      return;
    }

    activeStoryMap = issue.map ?? nodeMap(node);
    selectedNodeId = node.id;
    activeLane = (node.audience ?? 'both') as LaneId;
    inspectorExpanded = false;
    clearMessages();
    void scrollSelectedNodeIntoView();
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

      if (availableEffect === 'color') {
        node.effectColor = terminalThemeColors.blue;
      }
    }

    rememberForUndo();
    node.audience = insertionTarget.lane;
    node.map = activeStoryMap;
    node.chapterId = inheritedChapterId(insertionTarget);

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
    node.chapterId = inheritedChapterId(insertionTarget);
    clearNodeRoutes(node);
    insertNode(node, insertionTarget);
    connectInsertionTarget(node.id, insertionTarget);
    selectedNodeId = node.id;
    insertionTarget = null;
    refreshStory();
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

      if (host && canAttachToNode(insertedNode, host)) {
        insertedNode.attachedTo = host.id;
        insertedNode.chapterId = host.chapterId ?? '';
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

  function inheritedChapterId(target: InsertionTarget): string {
    if (!editingStory) {
      return '';
    }

    const sourceId = target.sourceId ?? target.insertAfterId;
    const source = editingStory.nodes.find((node) => node.id === sourceId);

    if (!source) {
      return '';
    }

    if (isCompanionNode(source)) {
      const host = editingStory.nodes.find((node) => node.id === source.attachedTo);

      return host?.chapterId ?? source.chapterId ?? '';
    }

    return source.chapterId ?? '';
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
          (node) => companionStackIndex(level.nodes, node) * 18
        ))
      )
    };
  }

  function maximumCompanionStackIndex(nodes: StoryNode[]): number {
    return Math.max(
      0,
      ...nodes.map((node) => companionStackIndex(nodes, node))
    );
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
        currentNode.chapterId = node.chapterId ?? '';
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

  function setSelectedNodeChapter(event: Event): void {
    if (!editingStory || !selectedNode) {
      return;
    }

    const chapterId = (event.currentTarget as HTMLSelectElement).value;

    rememberForUndo();
    selectedNode.chapterId = chapterId;

    if (!isCompanionNode(selectedNode)) {
      for (const companion of editingStory.nodes.filter(
        (node) => node.attachedTo === selectedNode?.id
      )) {
        companion.chapterId = chapterId;
      }
    }

    refreshStory();
  }

  function chapterForNode(node: StoryNode): StoryChapter | undefined {
    return editingStory?.chapters.find((chapter) => chapter.id === node.chapterId);
  }

  function chapterIsCollapsed(chapterId: string | undefined): boolean {
    return Boolean(editingStory?.chapters.find(
      (chapter) => chapter.id === chapterId
    )?.collapsed);
  }

  function chapterOrder(chapterId: string | undefined): number {
    if (!editingStory || !chapterId) {
      return -1;
    }

    return editingStory.chapters.findIndex((chapter) => chapter.id === chapterId);
  }

  function chapterNodeCount(chapterId: string): number {
    return editingStory?.nodes.filter((node) => node.chapterId === chapterId).length ?? 0;
  }

  function chapterBoundaryCount(chapterId: string, direction: 'entry' | 'exit'): number {
    if (!editingStory) {
      return 0;
    }

    const chapterNodeIds = new Set(editingStory.nodes.filter(
      (node) => node.chapterId === chapterId
    ).map((node) => node.id));
    let count = 0;

    for (const node of editingStory.nodes) {
      for (const field of routeFields(node)) {
        const destinationId = getRouteValue(node, field);
        const sourceInside = chapterNodeIds.has(node.id);
        const destinationInside = chapterNodeIds.has(destinationId);

        if (direction === 'entry' && !sourceInside && destinationInside) {
          count += 1;
        }

        if (direction === 'exit' && sourceInside && destinationId && !destinationInside) {
          count += 1;
        }
      }
    }

    return count;
  }

  function routeMovesBackward(source: StoryNode, destination: StoryNode): boolean {
    const sourceChapterOrder = chapterOrder(source.chapterId);
    const destinationChapterOrder = chapterOrder(destination.chapterId);

    return sourceChapterOrder >= 0
      && destinationChapterOrder >= 0
      && destinationChapterOrder < sourceChapterOrder;
  }

  function toggleChapterOnMap(chapter: StoryChapter): void {
    rememberForUndo();
    chapter.collapsed = !chapter.collapsed;
    refreshStory();
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

    if (routeMovesBackward(source, destination)) {
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

    if (host.type === 'clear-terminal' && companion.type !== 'stop-audio') {
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

  function handleSimpleResult(
    successMessage: string
  ): (result: { ok: boolean; error?: string }) => void {
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
          showPlayerPortrait: false,
          playerExpression: 'normal',
          maxLength: 200
        };
      case 'conversation':
        return {
          ...baseNode,
          firstPlayer: 'random',
          showPlayerPortrait: false,
          playerExpression: 'normal',
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
          continueLabel: 'Continue',
          src: '',
          logText: '',
          imagePositionX: 50,
          imagePositionY: 50,
          imageBorderColor: '#1472bf',
          timed: false,
          durationMs: 3_000,
          showCountdown: true
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
          glowTarget: 'inner',
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
        {#if localSelection
          && localSelection === partnerSelection
          && localSelection === $libraryState.activeStoryId
          && localSelectionMode === 'multiplayer'
          && localStorySeat}
          <button class="selection-play-button primary-button" type="button" on:click={playSelectedCartridge}>
            Play cartridge
          </button>
        {/if}
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
      <StoryEditorToolbar
        story={editingStory}
        mobileCollapsed={mobileToolbarCollapsed}
        undoCount={undoStack.length}
        redoCount={redoStack.length}
        {saveInFlight}
        unavailableReason={storyStartIssue(editingStory)}
        on:back={closeStoryEditor}
        on:guide={openTutorial}
        on:play={requestPlaytest}
        on:redo={redo}
        on:save={() => saveStory()}
        on:settings={openStorySettings}
        on:toggleMobile={() => mobileToolbarCollapsed = !mobileToolbarCollapsed}
        on:undo={undo}
      />

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

      <StoryChapterManager
        chapters={editingStory.chapters}
        nodes={editingStory.nodes}
        issueCounts={chapterIssueCounts}
        on:add={addChapter}
        on:change={updateChapter}
        on:move={moveChapter}
        on:remove={removeChapter}
        on:toggle={toggleChapter}
      />

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

      <StoryVersionHistory
        versions={storyVersions}
        currentVersion={editingStory.version}
        loading={versionHistoryLoading}
        restoring={versionRestoreInFlight}
        on:refresh={loadStoryVersions}
        on:restore={restoreStoryVersion}
      />

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
        <div class="flow-panel" bind:this={flowPanelElement}>
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

          <svg class="route-overlay" aria-hidden="true">
            <defs>
              <marker id="route-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z"></path>
              </marker>
              <marker id="companion-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z"></path>
              </marker>
            </defs>
            {#each routeOverlayConnections as connection (connection.id)}
              <path
                class:route-connection={connection.kind === 'flow'}
                class:companion-connection={connection.kind === 'companion'}
                class:selected-connection={connection.selected}
                d={connection.path}
                marker-end={connection.kind === 'companion' ? 'url(#companion-arrow)' : 'url(#route-arrow)'}
              ></path>
            {/each}
          </svg>

          {#if editingStory.chapters.length > 0}
            <nav class="chapter-map-strip" aria-label="Story chapters">
              {#each editingStory.chapters as chapter, index (chapter.id)}
                <button
                  type="button"
                  class:collapsed={chapter.collapsed}
                  class:has-issues={(chapterIssueCounts[chapter.id] ?? 0) > 0}
                  style={`--chapter-color: ${chapter.color}`}
                  on:click={() => toggleChapterOnMap(chapter)}
                >
                  <span>{index + 1}</span>
                  <strong>{chapter.name}</strong>
                  <small>
                    {chapterNodeCount(chapter.id)} nodes · {chapterBoundaryCount(chapter.id, 'entry')} in · {chapterBoundaryCount(chapter.id, 'exit')} out
                  </small>
                  {#if (chapterIssueCounts[chapter.id] ?? 0) > 0}
                    <em>{chapterIssueCounts[chapter.id]} issues</em>
                  {/if}
                  <i>{chapter.collapsed ? 'Expand' : 'Collapse'}</i>
                </button>
              {/each}
            </nav>
          {/if}

          <div
            class="flow-canvas"
            class:selecting-route={Boolean(linkSelection)}
            aria-label="Story flow"
            bind:this={flowCanvasElement}
            on:scroll={scheduleGraphPresentation}
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
                      style={`--level-columns: ${laneGraph.maxColumns}; --max-companion-stack-index: ${maximumCompanionStackIndex(level.nodes)}`}
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
                          class:chapter-collapsed-node={chapterIsCollapsed(node.chapterId)}
                          class:chapter-assigned={Boolean(chapterForNode(node))}
                          style={`--companion-stack-index: ${companionStackIndex(level.nodes, node)}; --node-column: ${centeredVisualLevelColumn(laneGraph.maxColumns, level.nodes, node)}; --node-chapter-color: ${chapterForNode(node)?.color ?? 'transparent'}`}
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
                            {#if chapterForNode(node)}
                              <span class="chapter-badge">{chapterForNode(node)?.name}</span>
                            {/if}
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

          <button
            class="story-minimap"
            type="button"
            aria-label="Story map overview. Click to navigate."
            on:click={navigateFromMinimap}
          >
            <span class="story-minimap-title">MAP</span>
            <span class="story-minimap-stage">
              {#each minimapNodes as node (node.id)}
                <i
                  class:companion={node.companion}
                  class:selected={node.selected}
                  style={`left: ${node.x}%; top: ${node.y}%; width: ${node.width}%; height: ${node.height}%`}
                ></i>
              {/each}
              <b
                class="story-minimap-viewport"
                style={`left: ${minimapViewport.x}%; top: ${minimapViewport.y}%; width: ${minimapViewport.width}%; height: ${minimapViewport.height}%`}
              ></b>
            </span>
          </button>
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

            {#if editingStory.chapters.length > 0}
              <section class="inspector-property-group chapter-property-group">
                <h3>Chapter</h3>
                <label>
                  <span>Chapter assignment</span>
                  <select
                    value={selectedNode.chapterId ?? ''}
                    disabled={isCompanionNode(selectedNode) && Boolean(selectedNode.attachedTo)}
                    on:change={setSelectedNodeChapter}
                  >
                    <option value="">Unassigned</option>
                    {#each editingStory.chapters as chapter, index}
                      <option value={chapter.id}>{index + 1}. {chapter.name}</option>
                    {/each}
                  </select>
                </label>
                {#if isCompanionNode(selectedNode) && selectedNode.attachedTo}
                  <small>Companion nodes automatically follow their host node’s chapter.</small>
                {:else}
                  <small>Nodes added after this one inherit the same chapter automatically.</small>
                {/if}
              </section>
            {/if}

            {#if (selectedNode.type !== 'label'
              && !nodeIsStart(selectedNode)
              && !(isCompanionNode(selectedNode) && selectedNode.attachedTo !== undefined))
              || routeFields(selectedNode).includes('next')}
              <section class="route-settings-group">
                <h3>Story route</h3>

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
                        class="disconnect-route-button"
                        type="button"
                        aria-label={`Disconnect ${displayNodeName(connection.node)}`}
                        on:click={() => clearIncomingRoute(connection.node, connection.field)}
                      >Disconnect</button>
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
                  <button class="disconnect-route-button" type="button" on:click={() => clearRoute(selectedNode, 'next')}>Disconnect next node</button>
                {/if}
              </div>
            {/if}

              </section>
            {/if}

            {#if isCompanionNode(selectedNode) && selectedNode.attachedTo !== undefined}
              <div class="route-label">Attached to story node</div>
              <div class="route-control">
                <span class:missing={!selectedNode.attachedTo}>
                  {attachedHostLabel(selectedNode)}
                </span>
                <button type="button" on:click={startAttachmentSelection}>Select host node</button>
                {#if selectedNode.attachedTo}
                  <button class="disconnect-route-button" type="button" on:click={() => {
                    rememberForUndo();
                    selectedNode.attachedTo = '';
                    refreshStory();
                  }}>Disconnect host node</button>
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
              <label class="node-text-property" for="node-text">
                {selectedNode.type === 'label' ? 'Label title' : 'Terminal text'}
              </label>
              <RichTextEditor
                bind:value={selectedNode.text}
                bind:formats={selectedNode.textFormats}
                id="node-text"
                rows={5}
                maxlength={selectedNode.type === 'label' ? 60 : undefined}
              />
            {/if}

            {#if selectedNode.type === 'input'}
              <label for="input-prompt">Player prompt</label>
              <RichTextEditor
                bind:value={selectedNode.prompt}
                bind:formats={selectedNode.promptFormats}
                id="input-prompt"
                rows={5}
              />
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
              <div class="inspector-property-group">
                <h3>{selectedNode.type === 'input' ? 'Question presentation' : 'Speaker and portrait'}</h3>
                {#if selectedNode.type === 'input'}
                  <p class="inspector-help">
                    Controls who presents the question above the player’s input field.
                  </p>
                {:else}
                  <p class="inspector-help">
                    Choose a story character or provide a custom speaker identity for this node.
                  </p>
                {/if}

                <label for="node-speaker">
                  {selectedNode.type === 'input' ? 'Prompt speaker' : 'Speaker'}
                </label>
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
                    <option value="confused">Confused</option>
                    <option value="dead">Dead</option>
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
                  <label for="custom-speaker-name">
                    {selectedNode.type === 'input' ? 'Custom prompt speaker name' : 'Custom speaker name'}
                  </label>
                  <input id="custom-speaker-name" bind:value={selectedNode.speaker}>
                  <span class="inspector-label property-section-label">
                    {selectedNode.type === 'input' ? 'Custom prompt speaker image' : 'Custom speaker image'}
                  </span>
                  {#if selectedNode.portrait}
                    <div class="image-preview image-preview--portrait">
                      <img src={selectedNode.portrait} alt={selectedNode.portraitAlt ?? ''}>
                      <span>{selectedNode.portrait.split('/').at(-1)}</span>
                    </div>
                  {/if}
                  <div class="inspector-action-stack">
                    <button class="inspector-action-button" type="button" on:click={() => openImageLibrary('portrait')}>
                      {selectedNode.type === 'input' ? 'Select prompt speaker image' : 'Select speaker image'}
                    </button>
                    {#if selectedNode.portrait}
                      <button class="inspector-action-button inspector-action-button--danger" type="button" on:click={removeCustomSpeakerPortrait}>
                        {selectedNode.type === 'input' ? 'Remove prompt speaker image' : 'Remove speaker image'}
                      </button>
                    {/if}
                  </div>
                  {#if selectedNode.portrait}
                    <label for="custom-speaker-image-alt">
                      {selectedNode.type === 'input' ? 'Prompt speaker image description' : 'Speaker image description'}
                    </label>
                    <input id="custom-speaker-image-alt" bind:value={selectedNode.portraitAlt} placeholder="Describe the speaker portrait">
                  {/if}
                {/if}
              </div>
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
                  <button class="disconnect-route-button" type="button" on:click={() => clearRoute(selectedNode, 'success')}>Disconnect success node</button>
                {/if}
              </div>
              <div class="route-label">Failure node</div>
              <div class="route-control">
                <button class="route-node-link" type="button" disabled={!selectedNode.failure} on:click={() => selectConnectedNode(selectedNode.failure)}>{routeLabel(selectedNode, 'failure')}</button>
                <button type="button" on:click={() => startLinkSelection('failure', 'Failure node')}>Select node</button>
                {#if selectedNode.failure}
                  <button class="disconnect-route-button" type="button" on:click={() => clearRoute(selectedNode, 'failure')}>Disconnect failure node</button>
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

            {#if ['input', 'conversation'].includes(selectedNode.type)}
              <div class:inspector-property-group={selectedNode.type === 'input'}>
                {#if selectedNode.type === 'input'}
                  <h3>Player response presentation</h3>
                  <p class="inspector-help">
                    Controls how the player’s submitted answer appears beneath the question.
                  </p>
                {/if}

                <label class="choice-disabled-toggle">
                  <input type="checkbox" bind:checked={selectedNode.showPlayerPortrait}>
                  Show the speaking player’s character portrait
                </label>
                {#if selectedNode.showPlayerPortrait}
                  <label for="player-message-expression">Player portrait expression</label>
                  <select id="player-message-expression" bind:value={selectedNode.playerExpression}>
                    <option value="normal">Normal</option>
                    <option value="shocked">Shocked</option>
                    <option value="angry">Angry</option>
                    <option value="sad">Sad</option>
                    <option value="happy">Happy</option>
                    <option value="confused">Confused</option>
                    <option value="dead">Dead</option>
                  </select>

                  {#if selectedNode.type === 'input'}
                    <div class="player-portrait-previews" aria-label="Player response portrait previews">
                      {#each playerPortraitPreviews as preview}
                        <div class="player-portrait-preview">
                          <strong>{preview.roleLabel}</strong>
                          {#if preview.character && characterExpressionImage(preview.character, selectedNode.playerExpression)}
                            <img
                              src={characterExpressionImage(preview.character, selectedNode.playerExpression)}
                              alt={`${preview.character.name} ${selectedNode.playerExpression ?? 'normal'} expression`}
                              style:object-position={`${characterExpressionPosition(preview.character, selectedNode.playerExpression).x}% ${characterExpressionPosition(preview.character, selectedNode.playerExpression).y}%`}
                            >
                            <span>{preview.character.name} · {selectedNode.playerExpression ?? 'normal'}</span>
                          {:else}
                            <span>No configured portrait</span>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  {/if}

                  <p class="inspector-help">
                    Each response uses the speaking player’s current story character. A Change Character node can replace the previewed character during play.
                  </p>
                {/if}
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
                <input id="choice-duration" type="number" min="0" bind:value={selectedNode.durationMs}>
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
                <div class="color-property-control">
                  <label class="image-color-control" for="terminal-color">
                    <span>Terminal color</span>
                    <input id="terminal-color" type="color" bind:value={selectedNode.effectColor}>
                  </label>
                  <button type="button" on:click={() => copyPropertyColor('terminal-color', selectedNode.effectColor)}>
                    {copiedColorKey === 'terminal-color' ? 'Copied' : `Copy ${selectedNode.effectColor?.toUpperCase()}`}
                  </button>
                </div>
                <p class="inspector-help">
                  Sets the terminal border, header accents, controls, and surrounding outline while the attached scene is active.
                </p>
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
                <div class="color-property-control">
                  <label class="image-color-control" for="screen-effect-color">
                    <span>Effect color</span>
                    <input id="screen-effect-color" type="color" bind:value={selectedNode.effectColor}>
                  </label>
                  <button type="button" on:click={() => copyPropertyColor('screen-effect-color', selectedNode.effectColor)}>
                    {copiedColorKey === 'screen-effect-color' ? 'Copied' : `Copy ${selectedNode.effectColor?.toUpperCase()}`}
                  </button>
                </div>
              {/if}
              {#if selectedNode.screenEffect === 'glow'}
                <label for="glow-target">Glow placement</label>
                <select id="glow-target" bind:value={selectedNode.glowTarget}>
                  <option value="inner">Inner — terminal screen</option>
                  <option value="outer">Outer — behind the full terminal</option>
                  <option value="both">Both inner and outer</option>
                </select>
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
                  <button class="disconnect-route-button" type="button" on:click={() => clearRoute(selectedNode, 'trueNext')}>Disconnect true branch</button>
                {/if}
              </div>
              <div class="route-label">When false</div>
              <div class="route-control">
                <button class="route-node-link" type="button" disabled={!selectedNode.falseNext} on:click={() => selectConnectedNode(selectedNode.falseNext)}>{routeLabel(selectedNode, 'falseNext')}</button>
                <button type="button" on:click={() => startLinkSelection('falseNext', 'False branch')}>Select node</button>
                {#if selectedNode.falseNext}
                  <button class="disconnect-route-button" type="button" on:click={() => clearRoute(selectedNode, 'falseNext')}>Disconnect false branch</button>
                {/if}
              </div>
            {/if}

            {#if selectedNode.type === 'image'}
              <section class="image-property-group">
              <h3>Story image</h3>
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
                  <div class="color-property-control">
                    <label class="image-color-control" for="image-border-color">
                      <span>Terminal border color</span>
                      <input
                        id="image-border-color"
                        type="color"
                        bind:value={selectedNode.imageBorderColor}
                      >
                    </label>
                    <button type="button" on:click={() => copyPropertyColor('image-border-color', selectedNode.imageBorderColor)}>
                      {copiedColorKey === 'image-border-color' ? 'Copied' : `Copy ${selectedNode.imageBorderColor?.toUpperCase()}`}
                    </button>
                  </div>
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
              <label for="image-continue-label">Button text</label>
              <input
                id="image-continue-label"
                bind:value={selectedNode.continueLabel}
                maxlength="60"
                placeholder="Continue"
              >
              <label class="choice-disabled-toggle">
                <input type="checkbox" bind:checked={selectedNode.timed}>
                Timed image — advance automatically
              </label>
              {#if selectedNode.timed}
                <label for="image-duration">Automatic wait in milliseconds</label>
                <input
                  id="image-duration"
                  type="number"
                  min="0"
                  step="100"
                  bind:value={selectedNode.durationMs}
                >
                <label class="choice-disabled-toggle">
                  <input type="checkbox" bind:checked={selectedNode.showCountdown}>
                  Show countdown text to the player
                </label>
              {/if}
              </section>
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
                    <button class="disconnect-route-button" type="button" on:click={() => clearRoute(selectedNode, routeField)}>
                      Disconnect {outcome} destination
                    </button>
                  {/if}
                </div>
              {/each}
            {/if}

            {#if nodeHasButtons(selectedNode)}
              <section class="button-hover-editor">
                <header class="hover-effects-heading">
                  <div>
                    <p>BUTTON APPEARANCE</p>
                    <h3>Hover effects</h3>
                  </div>
                  <span>OPTIONAL</span>
                </header>
                <p class="hover-effects-description">
                  Change how this node’s buttons look or read only while a player hovers over them.
                  The normal button design remains unchanged.
                </p>
                <label class="hover-effects-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedNode.hoverEffectsEnabled)}
                    on:change={toggleHoverEffects}
                  >
                  <span>
                    <strong>Enable hover effects</strong>
                    <small>Reveal alternate colors and optional hover-only text.</small>
                  </span>
                </label>
                {#if selectedNode.hoverEffectsEnabled}
                  <div class="hover-effects-fields">
                    <section class="hover-effect-control">
                      <header>
                        <strong>Background color</strong>
                        <small>Color behind the button label while hovered.</small>
                      </header>
                      <label>
                        <span>Choose background color</span>
                        <input type="color" bind:value={selectedNode.hoverBackgroundColor}>
                      </label>
                      <button type="button" on:click={() => copyPropertyColor('hover-background', selectedNode.hoverBackgroundColor)}>
                        {copiedColorKey === 'hover-background' ? 'Copied' : `Copy ${selectedNode.hoverBackgroundColor?.toUpperCase()}`}
                      </button>
                    </section>
                    <section class="hover-effect-control">
                      <header>
                        <strong>Text color</strong>
                        <small>Color of the button label while hovered.</small>
                      </header>
                      <label>
                        <span>Choose text color</span>
                        <input type="color" bind:value={selectedNode.hoverTextColor}>
                      </label>
                      <button type="button" on:click={() => copyPropertyColor('hover-text', selectedNode.hoverTextColor)}>
                        {copiedColorKey === 'hover-text' ? 'Copied' : `Copy ${selectedNode.hoverTextColor?.toUpperCase()}`}
                      </button>
                    </section>
                  </div>
                  <section class="hover-text-editor">
                    <header>
                      <strong>Hover-only text</strong>
                      <small>Leave a field blank to keep its normal button text.</small>
                    </header>
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
                  </section>
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
                  Close
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
              <button type="button" on:click={cancelPlaytestWarning}>Cancel</button>
              <button class="primary-button" type="button" disabled={saveInFlight} on:click={startPlaytest}>Save and play</button>
            </div>
          </section>
        </div>
      {/if}

      {#if playtestSeatPickerOpen}
        <div
          class="node-picker-backdrop"
          role="presentation"
          on:click|self={cancelPlaytestSeatPicker}
        >
          <section class="confirmation-dialog playtest-seat-dialog" role="dialog" aria-modal="true" aria-labelledby="playtest-seat-title">
            <p>MULTIPLAYER ROLE</p>
            <h2 id="playtest-seat-title">Who are you playing as?</h2>
            <p>Select an available role, then start the playtest.</p>

            <div class="playtest-seat-options">
              <button
                class:selected={pendingPlaytestSeat === 'p1'}
                type="button"
                disabled={storySeatClaimedByOther('p1')}
                on:click={() => pendingPlaytestSeat = 'p1'}
              >
                {storySeatClaimedByOther('p1') ? 'Player 1 · claimed' : 'Player 1'}
              </button>
              <button
                class:selected={pendingPlaytestSeat === 'p2'}
                type="button"
                disabled={storySeatClaimedByOther('p2')}
                on:click={() => pendingPlaytestSeat = 'p2'}
              >
                {storySeatClaimedByOther('p2') ? 'Player 2 · claimed' : 'Player 2'}
              </button>
            </div>

            <div class="playtest-seat-actions">
              <button type="button" on:click={cancelPlaytestSeatPicker}>Cancel</button>
              <button
                class="primary-button"
                type="button"
                disabled={!pendingPlaytestSeat || saveInFlight}
                on:click={continuePlaytestWithSeat}
              >
                Play
              </button>
            </div>
          </section>
        </div>
      {/if}

      {#if tutorialOpen}
        <StoryEditorGuide on:close={closeTutorial} />
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
                    {imagePath.startsWith('/media/characters/portraits/') ? 'BUILT-IN PORTRAIT' : 'BUILT-IN IMAGE'}
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

  <StoryValidationToast
    {statusMessage}
    {errorMessage}
    issues={validationIssues}
    detailsOpen={validationDetailsOpen}
    on:close={clearMessages}
    on:toggleDetails={toggleValidationDetails}
    on:focusIssue={(event) => focusValidationIssue(event.detail.issue)}
  />
</section>

<style lang="scss">
  @use "./story-editor/story-library.scss";
</style>
