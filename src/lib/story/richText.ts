import type { RichTextFormat } from '../stores/library';

export type RichTextSegment = {
  text: string;
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  italic?: boolean;
};

const colorPattern = /^#[0-9a-f]{6}$/i;

export function createRichTextSegments(
  text: string,
  formats: RichTextFormat[] = []
): RichTextSegment[] {
  if (!text) {
    return [];
  }

  const normalizedFormats = formats
    .map((format) => normalizeFormat(format, text.length))
    .filter((format): format is RichTextFormat => Boolean(format));

  if (normalizedFormats.length === 0) {
    return [{ text }];
  }

  const boundaries = [...new Set([
    0,
    text.length,
    ...normalizedFormats.flatMap((format) => [format.start, format.end])
  ])].sort((left, right) => left - right);
  const segments: RichTextSegment[] = [];

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const activeFormats = normalizedFormats.filter(
      (format) => format.start <= start && format.end >= end
    );
    const segment = activeFormats.reduce<RichTextSegment>(
      (result, format) => ({
        ...result,
        color: format.color ?? result.color,
        backgroundColor: format.backgroundColor ?? result.backgroundColor,
        bold: format.bold ?? result.bold,
        italic: format.italic ?? result.italic
      }),
      { text: text.slice(start, end) }
    );

    segments.push(segment);
  }

  return mergeMatchingSegments(segments);
}

export function richTextSegmentStyle(segment: RichTextSegment): string {
  const styles: string[] = [];

  if (segment.color) {
    styles.push(`color: ${segment.color}`);
  }

  if (segment.backgroundColor) {
    styles.push(`background-color: ${segment.backgroundColor}`);
    styles.push('padding: 0.08em 0.28em');
    styles.push('border-radius: 0.3em');
    styles.push('box-decoration-break: clone');
    styles.push('-webkit-box-decoration-break: clone');
  }

  if (segment.bold) {
    styles.push('font-weight: 700');
  }

  if (segment.italic) {
    styles.push('font-style: italic');
  }

  return styles.join('; ');
}

function normalizeFormat(
  format: RichTextFormat,
  textLength: number
): RichTextFormat | null {
  const start = Math.max(0, Math.min(textLength, Math.floor(Number(format.start))));
  const end = Math.max(start, Math.min(textLength, Math.floor(Number(format.end))));

  if (end <= start) {
    return null;
  }

  return {
    id: String(format.id || `${start}-${end}`),
    start,
    end,
    color: validColor(format.color),
    backgroundColor: validColor(format.backgroundColor),
    bold: Boolean(format.bold) || undefined,
    italic: Boolean(format.italic) || undefined
  };
}

function validColor(color: string | undefined): string | undefined {
  return color && colorPattern.test(color) ? color : undefined;
}

function mergeMatchingSegments(segments: RichTextSegment[]): RichTextSegment[] {
  const merged: RichTextSegment[] = [];

  for (const segment of segments) {
    const previous = merged.at(-1);

    if (previous && matchingPresentation(previous, segment)) {
      previous.text += segment.text;
    } else {
      merged.push({ ...segment });
    }
  }

  return merged;
}

function matchingPresentation(
  left: RichTextSegment,
  right: RichTextSegment
): boolean {
  return left.color === right.color
    && left.backgroundColor === right.backgroundColor
    && left.bold === right.bold
    && left.italic === right.italic;
}
