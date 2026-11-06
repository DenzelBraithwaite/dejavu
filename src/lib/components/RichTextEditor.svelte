<script lang="ts">
  import { tick } from 'svelte';
  import type { RichTextFormat } from '../stores/library';

  export let id = '';
  export let value = '';
  export let formats: RichTextFormat[] = [];
  export let rows = 5;
  export let maxlength: number | undefined = undefined;
  export let placeholder = '';

  let textareaElement: HTMLTextAreaElement;
  let selectionStart = 0;
  let selectionEnd = 0;
  let textColor = '#f472b6';
  let highlightColor = '#6d28d9';
  let selectionBold = false;
  let selectionItalic = false;
  let baseHeight = 110;

  $: baseHeight = Math.max(82, (rows * 24) + 24);
  $: if (!Array.isArray(formats)) {
    formats = [];
  }
  $: selectionBold = selectionHasProperty('bold');
  $: selectionItalic = selectionHasProperty('italic');

  function rememberSelection(): void {
    selectionStart = textareaElement.selectionStart ?? 0;
    selectionEnd = textareaElement.selectionEnd ?? selectionStart;
  }

  function handleInput(event: Event): void {
    const input = event.currentTarget as HTMLTextAreaElement;
    const previousValue = value;
    const nextValue = input.value;

    formats = adjustFormatsForTextChange(previousValue, nextValue, formats);
    value = nextValue;
    rememberSelection();
  }

  function applyTextColor(): void {
    applyFormat({ color: textColor });
  }

  function applyHighlightColor(): void {
    applyFormat({ backgroundColor: highlightColor });
  }

  function setBold(enabled: boolean): void {
    if (enabled) {
      applyFormat({ bold: true });
    } else {
      clearFormatProperty('bold');
    }
  }

  function setItalic(enabled: boolean): void {
    if (enabled) {
      applyFormat({ italic: true });
    } else {
      clearFormatProperty('italic');
    }
  }

  function clearTextColor(): void {
    clearFormatProperty('color');
  }

  function clearHighlightColor(): void {
    clearFormatProperty('backgroundColor');
  }

  function clearAllFormatting(): void {
    if (!hasSelection()) {
      return;
    }

    formats = formats.flatMap((format) => preserveOutsideSelection(format));
    void restoreSelection();
  }

  function applyFormat(changes: Partial<RichTextFormat>): void {
    if (!hasSelection()) {
      return;
    }

    formats = [
      ...formats,
      {
        id: createFormatId(),
        start: selectionStart,
        end: selectionEnd,
        ...changes
      }
    ];
    void restoreSelection();
  }

  function clearFormatProperty(
    property: 'bold' | 'italic' | 'color' | 'backgroundColor'
  ): void {
    if (!hasSelection()) {
      return;
    }

    formats = formats.flatMap((format) => removePropertyInsideSelection(format, property));
    void restoreSelection();
  }

  function removePropertyInsideSelection(
    format: RichTextFormat,
    property: 'bold' | 'italic' | 'color' | 'backgroundColor'
  ): RichTextFormat[] {
    if (format[property] === undefined
      || format.end <= selectionStart
      || format.start >= selectionEnd) {
      return [format];
    }

    const pieces: RichTextFormat[] = [];
    const overlapStart = Math.max(format.start, selectionStart);
    const overlapEnd = Math.min(format.end, selectionEnd);

    if (format.start < overlapStart) {
      pieces.push({
        ...format,
        id: createFormatId(),
        end: overlapStart
      });
    }

    const middle = {
      ...format,
      id: createFormatId(),
      start: overlapStart,
      end: overlapEnd
    };

    delete middle[property];

    if (hasPresentation(middle)) {
      pieces.push(middle);
    }

    if (format.end > overlapEnd) {
      pieces.push({
        ...format,
        id: createFormatId(),
        start: overlapEnd
      });
    }

    return pieces;
  }

  function preserveOutsideSelection(format: RichTextFormat): RichTextFormat[] {
    if (format.end <= selectionStart || format.start >= selectionEnd) {
      return [format];
    }

    const pieces: RichTextFormat[] = [];

    if (format.start < selectionStart) {
      pieces.push({
        ...format,
        id: createFormatId(),
        end: selectionStart
      });
    }

    if (format.end > selectionEnd) {
      pieces.push({
        ...format,
        id: createFormatId(),
        start: selectionEnd
      });
    }

    return pieces;
  }

  function selectionHasProperty(property: 'bold' | 'italic'): boolean {
    if (!hasSelection()) {
      return false;
    }

    return formats.some((format) => (
      format.start <= selectionStart
      && format.end >= selectionEnd
      && format[property] === true
    ));
  }

  function hasSelection(): boolean {
    return selectionEnd > selectionStart;
  }

  function hasPresentation(format: RichTextFormat): boolean {
    return Boolean(
      format.bold
      || format.italic
      || format.color
      || format.backgroundColor
    );
  }

  async function restoreSelection(): Promise<void> {
    await tick();
    textareaElement.focus();
    textareaElement.setSelectionRange(selectionStart, selectionEnd);
  }

  function createFormatId(): string {
    return `format-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function adjustFormatsForTextChange(
    previousValue: string,
    nextValue: string,
    currentFormats: RichTextFormat[]
  ): RichTextFormat[] {
    let prefixLength = 0;
    let suffixLength = 0;

    while (prefixLength < previousValue.length
      && prefixLength < nextValue.length
      && previousValue[prefixLength] === nextValue[prefixLength]) {
      prefixLength += 1;
    }

    while (suffixLength < previousValue.length - prefixLength
      && suffixLength < nextValue.length - prefixLength
      && previousValue[previousValue.length - suffixLength - 1]
        === nextValue[nextValue.length - suffixLength - 1]) {
      suffixLength += 1;
    }

    const previousChangeEnd = previousValue.length - suffixLength;
    const insertedLength = nextValue.length - prefixLength - suffixLength;
    const lengthChange = nextValue.length - previousValue.length;

    return currentFormats
      .map((format) => ({
        ...format,
        start: mapEditedPosition(
          format.start,
          prefixLength,
          previousChangeEnd,
          insertedLength,
          lengthChange,
          'start'
        ),
        end: mapEditedPosition(
          format.end,
          prefixLength,
          previousChangeEnd,
          insertedLength,
          lengthChange,
          'end'
        )
      }))
      .filter((format) => format.end > format.start);
  }

  function mapEditedPosition(
    position: number,
    changeStart: number,
    previousChangeEnd: number,
    insertedLength: number,
    lengthChange: number,
    edge: 'start' | 'end'
  ): number {
    if (position <= changeStart) {
      return position;
    }

    if (position >= previousChangeEnd) {
      return position + lengthChange;
    }

    return edge === 'start'
      ? changeStart
      : changeStart + insertedLength;
  }
</script>

<div class="rich-text-editor">
  <div class="formatting-toolbar" aria-label="Selected text formatting controls">
    <fieldset>
      <legend>Weight</legend>
      <div>
        <button
          class:active={!selectionBold}
          type="button"
          disabled={!hasSelection()}
          on:click={() => setBold(false)}
        >Normal</button>
        <button
          class:active={selectionBold}
          type="button"
          disabled={!hasSelection()}
          on:click={() => setBold(true)}
        ><strong>Bold</strong></button>
      </div>
    </fieldset>

    <fieldset>
      <legend>Style</legend>
      <div>
        <button
          class:active={!selectionItalic}
          type="button"
          disabled={!hasSelection()}
          on:click={() => setItalic(false)}
        >Normal</button>
        <button
          class:active={selectionItalic}
          type="button"
          disabled={!hasSelection()}
          on:click={() => setItalic(true)}
        ><em>Italic</em></button>
      </div>
    </fieldset>

    <fieldset class="color-format-control">
      <legend>Text color</legend>
      <input type="color" bind:value={textColor} aria-label="Selected text color">
      <button type="button" disabled={!hasSelection()} on:click={applyTextColor}>Apply color</button>
      <button type="button" disabled={!hasSelection()} on:click={clearTextColor}>Default</button>
    </fieldset>

    <fieldset class="color-format-control">
      <legend>Highlight</legend>
      <input type="color" bind:value={highlightColor} aria-label="Selected text highlight color">
      <button type="button" disabled={!hasSelection()} on:click={applyHighlightColor}>Apply highlight</button>
      <button type="button" disabled={!hasSelection()} on:click={clearHighlightColor}>Remove</button>
    </fieldset>
  </div>

  <p class="formatting-help">
    Select part of the message, then apply formatting. Formatting can overlap.
  </p>

  <textarea
    {id}
    {rows}
    {maxlength}
    {placeholder}
    bind:this={textareaElement}
    value={value}
    style:min-height={`${baseHeight}px`}
    style:max-height={`${baseHeight * 2}px`}
    on:input={handleInput}
    on:select={rememberSelection}
    on:keyup={rememberSelection}
    on:mouseup={rememberSelection}
  ></textarea>

  <button
    class="clear-formatting-button"
    type="button"
    disabled={!hasSelection()}
    on:click={clearAllFormatting}
  >Clear formatting from selection</button>
</div>

<style lang="scss">
  .rich-text-editor {
    width: 100%;
    padding: 14px;
    background: #08121f;
    border: 1px solid #294668;

    display: grid;
    gap: 12px;
  }

  .formatting-toolbar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  fieldset {
    min-width: 0;
    margin: 0;
    padding: 10px;
    border: 1px solid #334e6c;

    display: grid;
    gap: 8px;

    > div {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }
  }

  legend {
    padding: 0 5px;
    color: #7dd3fc;
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.7px;
    text-transform: uppercase;
  }

  button,
  input,
  textarea {
    min-height: 38px;
    padding: 8px 10px;
    color: #e8edf6;
    background: #0b1727;
    border: 1px solid #3b5878;
    border-radius: 4px;
    font: inherit;
  }

  button {
    cursor: pointer;

    &.active {
      color: #16091f;
      background: #d8b4fe;
      border-color: #f0dcff;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.38;
    }
  }

  .color-format-control {
    grid-template-columns: 52px minmax(0, 1fr);

    input {
      grid-row: 1 / 3;
      width: 52px;
      height: 100%;
      padding: 4px;
      cursor: pointer;
    }
  }

  .formatting-help {
    margin: 0;
    color: #8fa4ba;
    font-size: 0.66rem;
    line-height: 1.5;
  }

  textarea {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    line-height: 1.55;
  }

  .clear-formatting-button {
    width: 100%;
    color: #b9c9da;
    background: #101b2a;
  }

  @media (max-width: 560px) {
    .formatting-toolbar {
      grid-template-columns: 1fr;
    }
  }
</style>
