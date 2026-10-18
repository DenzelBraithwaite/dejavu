<script lang="ts">
  import { socket } from '../socket';
  import {
    libraryState,
    type StoryDocument,
    type StoryNode
  } from '../stores/library';
  import location from '../stores/location';
  import { sessionState, type PlayerId } from '../stores/session';

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
  };

  type EditorSnapshot = {
    story: StoryDocument;
    selectedNodeId: string;
    activeLane: LaneId;
  };

  const flowNodeTypes = [
    { type: 'dialogue', label: 'Dialogue' },
    { type: 'input', label: 'Player input' },
    { type: 'choice', label: 'Choice' },
    { type: 'checkpoint', label: 'Checkpoint' },
    { type: 'conversation', label: 'Open floor' },
    { type: 'dice-check', label: 'Dice check' },
    { type: 'vote', label: 'Shared vote' },
    { type: 'timed-choice', label: 'Timed choice' },
    { type: 'condition', label: 'Condition' },
    { type: 'minigame', label: 'Minigame' },
    { type: 'label', label: 'Visual label' },
    { type: 'ending', label: 'Ending' }
  ];

  const companionNodeTypes = [
    { type: 'image', label: 'Show image' },
    { type: 'effect', label: 'Item / effect' },
    { type: 'ambience', label: 'Music / atmosphere' }
  ];

  const nodeTypes = [...flowNodeTypes, ...companionNodeTypes];

  const lanes: Array<{ id: LaneId; label: string }> = [
    { id: 'p1', label: 'PLAYER 1' },
    { id: 'both', label: 'SHARED' },
    { id: 'p2', label: 'PLAYER 2' }
  ];

  let mode: EditorMode = 'library';
  let newTitle = '';
  let newDescription = '';
  let newAuthor = '';
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
  let draggedNodeId = '';
  let storyRevision = 0;
  let undoStack: EditorSnapshot[] = [];
  let redoStack: EditorSnapshot[] = [];
  let tutorialOpen = false;
  let imageUploading = false;
  let lastLocation = '';

  $: playerId = $sessionState.playerId;
  $: partnerId = (playerId === 'p1' ? 'p2' : 'p1') as PlayerId;
  $: localSelection = playerId
    ? $libraryState.selections[playerId]
    : null;
  $: partnerSelection = partnerId
    ? $libraryState.selections[partnerId]
    : null;
  $: selectedNode = editingStory?.nodes.find(
    (node) => node.id === selectedNodeId
  ) ?? null;
  $: if ($location !== lastLocation) {
    lastLocation = $location;

    if ($location === 'library') {
      mode = 'library';
    } else if ($location === 'editor') {
      mode = 'editor';
    }
  }

  function storyTitle(storyId: string | null): string {
    if (!storyId) {
      return 'No cartridge selected';
    }

    return $libraryState.stories.find((story) => story.id === storyId)?.title
      ?? storyId;
  }

  function clearMessages(): void {
    statusMessage = '';
    errorMessage = '';
  }

  function showLibrary(): void {
    mode = 'library';
    location.set('library');
  }

  function showEditor(): void {
    mode = 'editor';
    location.set('editor');
  }

  function selectStory(storyId: string): void {
    clearMessages();
    socket.emit('library:select-story', storyId, handleSimpleResult(
      'Cartridge staged. Story Mode will unlock when both players match.'
    ));
  }

  function createStory(): void {
    clearMessages();
    socket.emit('library:create-story', {
      title: newTitle,
      description: newDescription,
      author: newAuthor
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
      editingStory = result.story;
      selectedNodeId = result.story.initialSceneIds.p1;
      activeLane = 'p1';
      resetHistory();
      showEditor();
      statusMessage = 'Story created in the host library.';
    });
  }

  function openEditor(storyId: string): void {
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

      editingStory = result.story;
      selectedNodeId = result.story.initialSceneIds.p1;
      activeLane = 'p1';
      resetHistory();
      showEditor();
    });
  }

  function saveStory(): void {
    if (!editingStory) {
      return;
    }

    clearMessages();
    socket.emit('library:update-story', {
      storyId: editingStory.id,
      story: editingStory
    }, (result: {
      ok: boolean;
      story?: StoryDocument;
      error?: string;
    }) => {
      if (!result.ok || !result.story) {
        errorMessage = result.error ?? 'Could not save the story.';
        return;
      }

      editingStory = result.story;
      resetHistory();
      statusMessage = `Saved version ${result.story.version}.`;
    });
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

    rememberForUndo();
    const nodeId = createUniqueNodeId(type);
    const node = createNode(type, nodeId);
    node.audience = insertionTarget.lane;

    insertNode(node, insertionTarget);
    connectInsertionTarget(node.id, insertionTarget);
    selectedNodeId = nodeId;
    insertionTarget = null;
    refreshStory();
  }

  function pasteNode(): void {
    if (!copiedNode || !editingStory || !insertionTarget) {
      return;
    }

    rememberForUndo();
    const node = structuredClone(copiedNode);
    node.id = createUniqueNodeId(node.type);
    node.audience = insertionTarget.lane;
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

    if (Object.values(editingStory.initialSceneIds).includes(node.id)) {
      errorMessage = 'Choose a different start node before deleting this one.';
      return;
    }

    rememberForUndo();
    editingStory.nodes = editingStory.nodes.filter(
      (candidate) => candidate.id !== node.id
    );
    selectedNodeId = editingStory.nodes[0]?.id ?? '';
    editingStory = {
      ...editingStory
    };
  }

  function addChoice(): void {
    if (!selectedNode) {
      return;
    }

    rememberForUndo();
    selectedNode.choices ??= [];
    selectedNode.choices = [
      ...selectedNode.choices,
      {
        id: `option-${selectedNode.choices.length + 1}`,
        label: 'New option',
        next: ''
      }
    ];
  }

  function removeChoice(index: number): void {
    rememberForUndo();
    selectedNode.choices = selectedNode.choices.filter(
      (_choice: unknown, choiceIndex: number) => choiceIndex !== index
    );
  }

  function getLaneNodes(lane: LaneId): StoryNode[] {
    return editingStory?.nodes.filter(
      (node) => (node.audience ?? 'both') === lane
    ) ?? [];
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
    if (node.type === 'label') {
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

    if (field === 'resultNext.completed') {
      return 'COMPLETE';
    }

    if (field === 'resultNext.cancelled') {
      return 'CANCEL';
    }

    return isCompanionNode(node) ? 'RETURNS' : 'NEXT';
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
      return (node.choices ?? []).map((_choice, index) => `choices.${index}.next`);
    }

    if (node.type === 'minigame') {
      return ['resultNext.completed', 'resultNext.cancelled'];
    }

    return [];
  }

  function supportsSimpleNext(node: StoryNode): boolean {
    return ['dialogue', 'input', 'checkpoint', 'conversation']
      .includes(node.type);
  }

  function isCompanionNode(node: StoryNode): boolean {
    return companionNodeTypes.some((nodeType) => nodeType.type === node.type);
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

    const isStartNode = Object.values(editingStory.initialSceneIds).includes(node.id);
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

  function startDragging(nodeId: string): void {
    draggedNodeId = nodeId;
  }

  function dropOnNode(targetNode: StoryNode): void {
    if (!editingStory || !draggedNodeId || draggedNodeId === targetNode.id) {
      draggedNodeId = '';
      return;
    }

    const draggedNode = editingStory.nodes.find((node) => node.id === draggedNodeId);

    if (!draggedNode || draggedNode.audience !== targetNode.audience) {
      errorMessage = 'Drop onto a node in the same lane, or drop onto a lane to move it.';
      draggedNodeId = '';
      return;
    }

    moveNodeBefore(draggedNode.id, targetNode.id);
    draggedNodeId = '';
  }

  function dropOnLane(lane: LaneId): void {
    if (!editingStory || !draggedNodeId) {
      return;
    }

    const draggedNode = editingStory.nodes.find((node) => node.id === draggedNodeId);

    if (!draggedNode) {
      return;
    }

    rememberForUndo();
    draggedNode.audience = lane;
    const remainingNodes = editingStory.nodes.filter((node) => node.id !== draggedNode.id);
    const lastLaneIndex = remainingNodes.reduce(
      (lastIndex, node, index) => (node.audience ?? 'both') === lane ? index : lastIndex,
      -1
    );

    remainingNodes.splice(lastLaneIndex + 1, 0, draggedNode);
    editingStory.nodes = remainingNodes;
    activeLane = lane;
    draggedNodeId = '';
    refreshStory();
  }

  function moveNodeBefore(nodeId: string, targetId: string): void {
    if (!editingStory) {
      return;
    }

    const node = editingStory.nodes.find((candidate) => candidate.id === nodeId);
    const remainingNodes = editingStory.nodes.filter((candidate) => candidate.id !== nodeId);
    const targetIndex = remainingNodes.findIndex((candidate) => candidate.id === targetId);

    if (!node || targetIndex < 0) {
      return;
    }

    rememberForUndo();
    remainingNodes.splice(targetIndex, 0, node);
    editingStory.nodes = remainingNodes;
    refreshStory();
  }

  function moveSelectedNode(direction: -1 | 1): void {
    if (!editingStory || !selectedNode) {
      return;
    }

    const laneNodes = getLaneNodes((selectedNode.audience ?? 'both') as LaneId);
    const currentIndex = laneNodes.findIndex((node) => node.id === selectedNode.id);
    const targetNode = laneNodes[currentIndex + direction];

    if (!targetNode) {
      return;
    }

    if (direction < 0) {
      moveNodeBefore(selectedNode.id, targetNode.id);
    } else {
      moveNodeBefore(targetNode.id, selectedNode.id);
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

    if (!file || !selectedNode || selectedNode.type !== 'image') {
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
        imageNode.src = result.path;
        refreshStory();
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
      case 'choice':
      case 'vote':
      case 'timed-choice':
        return {
          ...baseNode,
          choices: [
            {
              id: 'option-1',
              label: 'New option',
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
          id,
          type,
          audience: 'both',
          attachedTo: '',
          text: '',
          src: '',
          alt: ''
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
      case 'minigame':
        return {
          ...baseNode,
          minigameId: 'netrunners',
          resultNext: {
            completed: '',
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
            Both players must stage the same cartridge before Story Mode can run.
          </p>
        </div>
        <button class="primary-button" type="button" on:click={() => mode = 'create'}>
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
        <p>
          {$libraryState.activeStoryId
            ? 'LINK ESTABLISHED — STORY MODE READY'
            : 'WAITING FOR MATCHING CARTRIDGES'}
        </p>
      </div>

      <div class="story-grid">
        {#each $libraryState.stories as story}
          <article class:selected={localSelection === story.id}>
            <div class="story-card-header">
              <span>{story.status.toUpperCase()}</span>
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
              <button type="button" on:click={() => selectStory(story.id)}>
                {localSelection === story.id ? 'Selected' : 'Select story'}
              </button>
              <button type="button" on:click={() => openEditor(story.id)}>
                Edit
              </button>
              <button type="button" on:click={() => duplicateStory(story.id)}>
                Duplicate
              </button>
              {#if !story.builtIn}
                <button
                  class="danger-button"
                  type="button"
                  on:click={() => deleteStory(story.id)}
                >
                  {deleteArmedId === story.id ? 'Confirm delete' : 'Delete'}
                </button>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    </div>
  {:else if $location === 'library' && mode === 'create'}
    <div class="form-screen">
      <button class="back-button" type="button" on:click={showLibrary}>
        ← Back to library
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

        <button
          class="primary-button"
          type="button"
          disabled={!newTitle.trim()}
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
      <div class="editor-toolbar">
        <button class="back-button" type="button" on:click={showLibrary}>
          ← Library
        </button>
        <div>
          <input aria-label="Story title" bind:value={editingStory.title} maxlength="80">
          <span>VERSION {editingStory.version} · {editingStory.status.toUpperCase()}</span>
        </div>
        <div class="toolbar-actions">
          <button type="button" disabled={undoStack.length === 0} on:click={undo} aria-label="Undo last editor change">
            ↶ Undo
          </button>
          <button type="button" disabled={redoStack.length === 0} on:click={redo} aria-label="Redo editor change">
            ↷ Redo
          </button>
          <button class="tutorial-button" type="button" on:click={() => tutorialOpen = true} aria-label="Open editor tutorial">
            ⓘ Guide
          </button>
          <button class="primary-button" type="button" on:click={saveStory}>
            Save story
          </button>
        </div>
      </div>

      <div class="editor-workspace">
        <div
          class="flow-canvas"
          class:selecting-route={Boolean(linkSelection)}
          aria-label="Story flow"
        >
          {#if linkSelection}
            <div class="link-mode-banner" role="status">
              <span>Select a destination for {linkSelection.label.toLowerCase()}.</span>
              <button type="button" on:click={cancelLinkSelection}>Cancel</button>
            </div>
          {/if}

          <div class="flow-lanes">
            {#each lanes as lane (`${lane.id}:${storyRevision}`)}
              <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
              <section
                class="flow-lane"
                class:active={activeLane === lane.id}
                class:has-branches={getLaneNodes(lane.id).some((node) => node.type === 'condition')}
                role="group"
                aria-label={`${lane.label} lane`}
                on:dragover|preventDefault
                on:drop|preventDefault={() => dropOnLane(lane.id)}
              >
                <button
                  class="lane-heading"
                  type="button"
                  on:click|stopPropagation={() => activeLane = lane.id}
                >
                  <span>{lane.label}</span>
                  <strong>
                    {getLaneNodes(lane.id).filter((node) => node.type !== 'label' && !isCompanionNode(node)).length} FLOW
                    · {getLaneNodes(lane.id).filter(isCompanionNode).length} COMPANION
                  </strong>
                </button>

                <div class="lane-node-grid">
                  {#each getLaneNodes(lane.id) as node (`${node.id}:${storyRevision}`)}
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div
                      role="listitem"
                      class="node-wrapper"
                      data-revision={storyRevision}
                      class:branch-node={nodeHasBranches(node)}
                      class:companion-node={isCompanionNode(node)}
                      class:has-route={routeFields(node).some((field) => getRouteValue(node, field))}
                      draggable="true"
                      on:dragstart={() => startDragging(node.id)}
                      on:dragover|preventDefault
                      on:drop|stopPropagation|preventDefault={() => dropOnNode(node)}
                    >
                      <div class="node-quick-actions" aria-label={`Quick actions for ${displayNodeName(node)}`}>
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
                        class="flow-node"
                        class:selected={selectedNodeId === node.id}
                        class:invalid={nodeIsInvalid(node)}
                        class:label-node={node.type === 'label'}
                        class:valid-link-target={Boolean(linkSelection) && isValidLinkTarget(node)}
                        class:invalid-link-target={Boolean(linkSelection) && !isValidLinkTarget(node)}
                        type="button"
                        on:click|stopPropagation={() => selectNode(node)}
                      >
                        <span>{nodeOrdinal(node)}</span>
                        {#if isCompanionNode(node)}
                          <span class="companion-badge">COMPANION</span>
                        {/if}
                        <strong>{displayNodeName(node)}</strong>
                        {#if node.type !== 'label'}
                          <small>{nodeIsInvalid(node) ? 'INCOMPLETE CONNECTION' : node.id}</small>
                          <span class="node-route-list">
                            {#if isCompanionNode(node) && node.attachedTo !== undefined}
                              <span>
                                WITH → {attachedHostLabel(node).toUpperCase()}
                              </span>
                            {:else}
                              {#each routeFields(node).filter((field) => getRouteValue(node, field)) as field}
                                <span>
                                  {routeFieldLabel(node, field)} → {routeLabel(node, field)}
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
                          + {field.replace('trueNext', 'true').replace('falseNext', 'false').replace('resultNext.', '').replace(/choices\.\d+\.next/, 'option')}
                        </button>
                      {/each}
                    </div>
                  {/each}
                </div>

                <button
                  class="lane-add-button"
                  type="button"
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

        <aside class="node-inspector" aria-label="Node inspector">
          {#if selectedNode}
            <div class="inspector-heading">
              <div>
                <p>NODE INSPECTOR</p>
                <h2>{selectedNode.type}</h2>
              </div>
              <div class="inspector-actions">
                <button type="button" aria-label="Move node up" on:click={() => moveSelectedNode(-1)}>↑</button>
                <button type="button" aria-label="Move node down" on:click={() => moveSelectedNode(1)}>↓</button>
                <button type="button" on:click={copySelectedNode}>Copy</button>
                <button type="button" on:click={duplicateSelectedNode}>Duplicate</button>
                <button class="danger-button" type="button" on:click={deleteSelectedNode}>
                  Delete
                </button>
              </div>
            </div>

            <label for="node-id">Node ID</label>
            <input id="node-id" value={selectedNode.id} disabled>

            <label for="node-audience">Audience</label>
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

            {#if selectedNode.type !== 'label' && !(isCompanionNode(selectedNode) && selectedNode.attachedTo !== undefined)}
              <div class="route-label">Previous node</div>
              <div class="previous-route-list">
                {#if incomingConnections(selectedNode).length === 0}
                  <span class="missing">No incoming connection</span>
                {:else}
                  {#each incomingConnections(selectedNode) as connection}
                    <div>
                      <span>{displayNodeName(connection.node)} · {routeFieldLabel(connection.node, connection.field)}</span>
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

            {#if selectedNode.type !== 'condition'
              && selectedNode.type !== 'input'
              && !(isCompanionNode(selectedNode) && selectedNode.attachedTo !== undefined)}
              <label for="node-text">
                {selectedNode.type === 'label' ? 'Label title' : 'Terminal text'}
              </label>
              <textarea id="node-text" bind:value={selectedNode.text} rows="5"></textarea>
            {/if}

            {#if selectedNode.type === 'input'}
              <label for="input-prompt">Player prompt</label>
              <textarea id="input-prompt" bind:value={selectedNode.prompt} rows="5"></textarea>
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
              <input id="node-speaker" bind:value={selectedNode.speaker}>
            {/if}

            {#if routeFields(selectedNode).includes('next')}
              <div class="route-label">
                {isCompanionNode(selectedNode) ? 'Legacy return node' : 'Next node'}
              </div>
              <div class="route-control">
                <span class:missing={!selectedNode.next}>{routeLabel(selectedNode, 'next')}</span>
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
                <span class:missing={!selectedNode.success}>{routeLabel(selectedNode, 'success')}</span>
                <button type="button" on:click={() => startLinkSelection('success', 'Success node')}>Select node</button>
                {#if selectedNode.success}
                  <button type="button" aria-label="Clear success node" on:click={() => clearRoute(selectedNode, 'success')}>×</button>
                {/if}
              </div>
              <div class="route-label">Failure node</div>
              <div class="route-control">
                <span class:missing={!selectedNode.failure}>{routeLabel(selectedNode, 'failure')}</span>
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
                  <input id="p1-messages" type="number" min="0" bind:value={selectedNode.messagesPerPlayer.p1}>
                </div>
                <div>
                  <label for="p2-messages">Player 2 turns</label>
                  <input id="p2-messages" type="number" min="0" bind:value={selectedNode.messagesPerPlayer.p2}>
                </div>
              </div>
            {/if}

            {#if ['choice', 'vote', 'timed-choice'].includes(selectedNode.type)}
              {#if selectedNode.type === 'timed-choice'}
                <label for="choice-duration">Timer in milliseconds</label>
                <input id="choice-duration" type="number" min="1000" bind:value={selectedNode.durationMs}>
              {/if}
              <div class="choice-editor">
                <div class="choice-heading">
                  <h3>Options</h3>
                  <button type="button" on:click={addChoice}>+ Option</button>
                </div>
                {#each selectedNode.choices ?? [] as choice, index}
                  <div class="choice-row">
                    <input aria-label="Option ID" bind:value={choice.id} placeholder="option-id">
                    <input aria-label="Option label" bind:value={choice.label} placeholder="Player-facing label">
                    <div class="choice-route">
                      <span class:missing={!choice.next}>{routeLabel(selectedNode, `choices.${index}.next`)}</span>
                      <button type="button" on:click={() => startLinkSelection(`choices.${index}.next`, `Option ${index + 1}`)}>Select</button>
                    </div>
                    <button type="button" on:click={() => removeChoice(index)}>×</button>
                  </div>
                {/each}
              </div>
            {/if}

            {#if selectedNode.type === 'effect'}
              <label for="effect-type">Effect</label>
              <select id="effect-type" bind:value={selectedNode.effects[0].type}>
                <option value="add-item">Give item</option>
                <option value="remove-item">Remove item</option>
                <option value="set-flag">Set story flag</option>
                <option value="adjust-stat">Adjust stat</option>
                <option value="discover-character">Discover character</option>
                <option value="install-mod">Install neuro mod</option>
                <option value="remove-mod">Remove neuro mod</option>
              </select>
              <label for="effect-key">Item, flag, stat, character, or mod ID</label>
              <input id="effect-key" bind:value={selectedNode.effects[0].key}>
              <label for="effect-value">Optional value</label>
              <input id="effect-value" bind:value={selectedNode.effects[0].value}>
            {/if}

            {#if selectedNode.type === 'condition'}
              <label for="condition-type">Condition</label>
              <select id="condition-type" bind:value={selectedNode.condition.type}>
                <option value="has-item">Player has item</option>
                <option value="flag-equals">Story flag equals value</option>
                <option value="stat-at-least">Player stat is at least value</option>
                <option value="last-dice-success">Previous dice check succeeded</option>
              </select>
              {#if selectedNode.condition.type !== 'last-dice-success'}
                <label for="condition-key">Item, flag, or stat ID</label>
                <input id="condition-key" bind:value={selectedNode.condition.key}>
              {/if}
              {#if ['flag-equals', 'stat-at-least'].includes(selectedNode.condition.type)}
                <label for="condition-value">Comparison value</label>
                <input id="condition-value" bind:value={selectedNode.condition.value}>
              {/if}
              <div class="route-label">When true</div>
              <div class="route-control">
                <span class:missing={!selectedNode.trueNext}>{routeLabel(selectedNode, 'trueNext')}</span>
                <button type="button" on:click={() => startLinkSelection('trueNext', 'True branch')}>Select node</button>
                {#if selectedNode.trueNext}
                  <button type="button" aria-label="Clear true branch" on:click={() => clearRoute(selectedNode, 'trueNext')}>×</button>
                {/if}
              </div>
              <div class="route-label">When false</div>
              <div class="route-control">
                <span class:missing={!selectedNode.falseNext}>{routeLabel(selectedNode, 'falseNext')}</span>
                <button type="button" on:click={() => startLinkSelection('falseNext', 'False branch')}>Select node</button>
                {#if selectedNode.falseNext}
                  <button type="button" aria-label="Clear false branch" on:click={() => clearRoute(selectedNode, 'falseNext')}>×</button>
                {/if}
              </div>
            {/if}

            {#if selectedNode.type === 'image'}
              <label for="image-upload">Story image</label>
              <label class="upload-button" for="image-upload">
                {imageUploading ? 'Uploading image…' : 'Upload image'}
              </label>
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
                  <img src={selectedNode.src} alt={selectedNode.alt || 'Story image preview'}>
                  <span>{selectedNode.src}</span>
                  <button type="button" on:click={() => {
                    rememberForUndo();
                    selectedNode.src = '';
                    refreshStory();
                  }}>Remove image</button>
                </div>
              {/if}
              <label for="image-alt">Alternative text</label>
              <input id="image-alt" bind:value={selectedNode.alt}>
            {/if}

            {#if selectedNode.type === 'ambience'}
              <label for="background-source">Background image path</label>
              <input id="background-source" bind:value={selectedNode.background} placeholder="/backgrounds/location.webp">
              <label for="music-source">Music path</label>
              <input id="music-source" bind:value={selectedNode.music} placeholder="/audio/music/theme.mp3">
              <label for="sound-source">Sound effect path</label>
              <input id="sound-source" bind:value={selectedNode.sound} placeholder="/audio/sounds/door.mp3">
            {/if}

            {#if selectedNode.type === 'minigame'}
              <label for="minigame-id">Minigame</label>
              <select id="minigame-id" bind:value={selectedNode.minigameId}>
                <option value="netrunners">NetRunners</option>
                <option value="billywig">Billywig</option>
              </select>
              <div class="route-label">Completed destination</div>
              <div class="route-control">
                <span class:missing={!selectedNode.resultNext.completed}>{routeLabel(selectedNode, 'resultNext.completed')}</span>
                <button type="button" on:click={() => startLinkSelection('resultNext.completed', 'Completed destination')}>Select node</button>
              </div>
              <div class="route-label">Cancelled destination</div>
              <div class="route-control">
                <span class:missing={!selectedNode.resultNext.cancelled}>{routeLabel(selectedNode, 'resultNext.cancelled')}</span>
                <button type="button" on:click={() => startLinkSelection('resultNext.cancelled', 'Cancelled destination')}>Select node</button>
              </div>
            {/if}

            {#if selectedNode.type !== 'label'
              && selectedNode.type !== 'condition'
              && !(isCompanionNode(selectedNode) && selectedNode.attachedTo !== undefined)}
              <label class="checkbox-row">
                <input type="checkbox" bind:checked={selectedNode.clearTerminal}>
                Clear terminal when this node begins
              </label>
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

            {#if copiedNode}
              <button class="paste-node-button" type="button" on:click={pasteNode}>
                <span>PASTE COPIED NODE</span>
                <strong>{displayNodeName(copiedNode)}</strong>
              </button>
            {/if}

            <p class="node-group-label">MAIN STORY FLOW</p>
            <div class="node-type-grid">
              {#each flowNodeTypes as nodeType}
                <button type="button" on:click={() => addNode(nodeType.type)}>
                  <span>＋</span>
                  <strong>{nodeType.label}</strong>
                </button>
              {/each}
            </div>

            <p class="node-group-label companion-group-label">COMPANION CHANGES</p>
            <p class="node-group-description">
              Presentation and state changes attach to a main-flow node instead of becoming another step.
            </p>
            <div class="node-type-grid companion-type-grid">
              {#each companionNodeTypes as nodeType}
                <button type="button" on:click={() => addNode(nodeType.type)}>
                  <span>＋</span>
                  <strong>{nodeType.label}</strong>
                </button>
              {/each}
            </div>
          </section>
        </div>
      {/if}

      {#if tutorialOpen}
        <div class="node-picker-backdrop" role="presentation">
          <section class="editor-tutorial" role="dialog" aria-modal="true" aria-labelledby="editor-guide-title">
            <header>
              <div>
                <p>QUICK START</p>
                <h2 id="editor-guide-title">How the story editor works</h2>
              </div>
              <button type="button" aria-label="Close editor tutorial" on:click={() => tutorialOpen = false}>×</button>
            </header>
            <ol>
              <li><strong>Add to Player</strong> appends a new node to the bottom of that lane. It only auto-connects when the previous node has an unused normal route.</li>
              <li><strong>+ next, + yes, or + no</strong> creates a node directly on that exact route. Use these when building a connected sequence or branch.</li>
              <li><strong>Select next node</strong> connects to an existing node. <strong>Select previous node</strong> makes an existing node lead into the selected node.</li>
              <li><strong>Companion changes</strong> show images, update inventory, or change atmosphere with a main-flow node. They do not need their own previous or next route.</li>
              <li>Red nodes have a missing or invalid connection. Save only after every playable route reaches another node or an Ending.</li>
            </ol>
            <button class="primary-button" type="button" on:click={() => tutorialOpen = false}>Got it</button>
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
      <h1 id="library-title">Choose a story to edit</h1>
      <p class="introduction">
        Open an existing cartridge in the editor, or create a new story from the Library.
      </p>
      <div class="editor-story-list">
        {#each $libraryState.stories as story}
          <button type="button" on:click={() => openEditor(story.id)}>
            <strong>{story.title}</strong>
            <span>{story.status.toUpperCase()} · V{story.version}</span>
          </button>
        {/each}
      </div>
      <button class="back-button" type="button" on:click={showLibrary}>Open Library</button>
    </div>
  {/if}

  {#if statusMessage}
    <p class="toast-message success-message" role="status">{statusMessage}</p>
  {/if}
  {#if errorMessage}
    <p class="toast-message error-message" role="alert">{errorMessage}</p>
  {/if}
</section>

<style lang="scss">
  .story-library {
    position: relative;
    width: 100%;
    height: 95vh;
    min-width: 0;
    max-width: 1600px;
    overflow: hidden;
    background: #060b14;
    border: 1px solid #4a98d9;
    border-radius: 8px;
    box-shadow: 0 0 34px #4a98d935;

    > header {
      min-height: 38px;
      padding: 9px 14px;
      color: #02fbfb;
      background: #111a2c;
      border-bottom: 1px solid #4a98d9;
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
    grid-template-rows: auto minmax(0, 1fr);
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
    grid-template-columns: minmax(0, 1fr) 340px;
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

  .flow-lanes {
    min-width: max-content;

    display: flex;
    gap: 16px;
    align-items: stretch;
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
    width: 270px;
    min-height: 100%;
    padding: 10px;
    border: 1px dashed #2c3b54;
    transition: width 0.25s ease, border-color 0.2s ease;

    &.active {
      border-color: #02fbfb;
      box-shadow: inset 0 0 20px #02fbfb12;
    }

    &.has-branches {
      width: 554px;

      .lane-node-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
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
    display: grid;
    grid-template-columns: 1fr;
    gap: 20px 12px;
    align-items: start;
  }

  .node-wrapper {
    position: relative;
    min-width: 0;

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
  }

  .node-quick-actions {
    position: absolute;
    z-index: 4;
    top: 5px;
    right: 5px;

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
      }
    }

    .companion-badge {
      width: max-content;
      padding: 2px 5px;
      color: #f8e69a;
      background: #332b0a;
      border: 1px solid #ad781c;
      font-size: 0.52rem;
      letter-spacing: 1px;
    }
  }

  .flow-node.selected {
    background: #10263c;
    border-color: #02fbfb;
    box-shadow: 0 0 15px #02fbfb24;
  }

  .flow-node.invalid {
    border-color: #cb381f;
    box-shadow: inset 0 0 18px #cb381f26;

    small {
      color: #e58271;
    }
  }

  .flow-node.label-node {
    min-height: 64px;
    background: linear-gradient(90deg, #19406c55, #111827);
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

    .danger-button {
      grid-column: 1 / -1;
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

  .choice-editor {
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px dashed #334155;
  }

  .choice-row {
    margin-top: 8px;

    display: grid;
    grid-template-columns: 0.8fr 1fr;
    gap: 5px;

    input {
      min-width: 0;
    }
  }

  .choice-route {
    grid-column: 1 / -1;

    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 5px;

    span {
      padding: 9px;
      overflow: hidden;
      color: #9dffa6;
      background: #07111d;
      border: 1px solid #334155;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    span.missing {
      color: #e58271;
    }
  }

  .route-control {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 5px;

    span {
      min-width: 0;
      padding: 10px;
      overflow: hidden;
      color: #9dffa6;
      background: #07111d;
      border: 1px solid #334155;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    span.missing {
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

      span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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
    padding: 28px;
    background: #020617dd;
    backdrop-filter: blur(5px);

    display: grid;
    place-items: center;
  }

  .node-picker {
    width: min(760px, 100%);
    max-height: 85%;
    padding: 22px;
    overflow-y: auto;
    background: #09111e;
    border: 1px solid #02fbfb;
    box-shadow: 0 0 48px #02fbfb33;

    > header {
      margin-bottom: 20px;

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
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 9px;

    button {
      min-height: 72px;
      text-align: left;

      display: grid;
      align-content: center;
      gap: 4px;

      span {
        color: #02fbfb;
      }
    }
  }

  .node-group-label {
    margin: 8px 0 10px;
    color: #6dc2fb;
    font-size: 0.64rem;
    letter-spacing: 1.4px;
  }

  .companion-group-label {
    margin-top: 22px;
    color: #f8e69a;
  }

  .node-group-description {
    margin: -4px 0 10px;
    color: #94a3b8;
    font-size: 0.7rem;
    line-height: 1.5;
  }

  .companion-type-grid button {
    border-color: #ad781c;

    span {
      color: #f8e69a;
    }
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

  .editor-tutorial {
    width: min(680px, 100%);
    max-height: 85%;
    padding: 24px;
    overflow-y: auto;
    background: #09111e;
    border: 1px solid #02fbfb;
    box-shadow: 0 0 48px #02fbfb33;

    header {
      margin-bottom: 18px;

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

    ol {
      margin: 0 0 20px 20px;

      display: grid;
      gap: 12px;
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

  .editor-empty-state {
    height: calc(100% - 38px);
    padding: clamp(24px, 5vw, 64px);
    overflow-y: auto;
  }

  .editor-story-list {
    width: min(760px, 100%);
    margin: 26px 0;

    display: grid;
    gap: 8px;

    button {
      text-align: left;

      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 18px;

      strong {
        color: #02fbfb;
      }

      span {
        color: #8893a2;
        font-size: 0.65rem;
      }
    }
  }

  .checkbox-row {
    margin-top: 20px;

    display: flex !important;
    align-items: center;
    gap: 8px;

    input {
      min-height: auto;
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
  }

  .success-message {
    color: #d7f0bb;
    border-color: #4f813d;
  }

  .error-message {
    color: #ffdbd6;
    border-color: #cb381f;
  }

  @media (max-width: 1050px) {
    .editor-workspace {
      grid-template-columns: minmax(0, 1fr) 290px;
    }
  }

  @media (max-width: 800px) {
    .library-heading {
      align-items: stretch;
      flex-direction: column;
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

    .node-type-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
