export type TypewriterTiming = {
  characterMs: number;
  commaMs: number;
  sentenceMs: number;
  paragraphMs: number;
  overrides?: Record<string, number>;
};

export type TypewriterOptions = {
  text: string;
  timing?: Partial<TypewriterTiming>;
  enabled?: boolean;
  onUpdate?: () => void;
  onComplete?: () => void;
};

export type TypewriterSegment = {
  text: string;
  className?: string;
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  italic?: boolean;
};

export type RichTypewriterOptions = {
  segments: TypewriterSegment[];
  timing?: Partial<TypewriterTiming>;
  enabled?: boolean;
  onUpdate?: () => void;
  onComplete?: () => void;
};

export const typewriterProfiles = {
  dialogue: {
    characterMs: 22,
    commaMs: 130,
    sentenceMs: 320,
    paragraphMs: 500
  },
  narration: {
    characterMs: 18,
    commaMs: 110,
    sentenceMs: 280,
    paragraphMs: 450
  },
  system: {
    characterMs: 12,
    commaMs: 70,
    sentenceMs: 160,
    paragraphMs: 240
  }
} satisfies Record<string, TypewriterTiming>;

const defaultTiming = typewriterProfiles.narration;

export function typewriter(node: HTMLElement, options: TypewriterOptions) {
  let runId = 0;
  let currentOptions = options;
  let completed = false;

  const finish = (): void => {
    runId += 1;
    node.textContent = currentOptions.text;
    currentOptions.onUpdate?.();

    if (!completed) {
      completed = true;
      currentOptions.onComplete?.();
      node.dispatchEvent(new CustomEvent('typewritercomplete'));
    }
  };

  const handleSkip = (): void => {
    finish();
  };

  const run = async (): Promise<void> => {
    const thisRun = ++runId;
    const timing = {
      ...defaultTiming,
      ...currentOptions.timing
    };
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    completed = false;
    node.textContent = '';

    if (currentOptions.enabled === false || reduceMotion) {
      finish();
      return;
    }

    for (const character of currentOptions.text) {
      if (thisRun !== runId) {
        return;
      }

      node.textContent += character;
      currentOptions.onUpdate?.();
      await wait(getCharacterDelay(character, timing));
    }

    if (thisRun === runId) {
      completed = true;
      currentOptions.onComplete?.();
      node.dispatchEvent(new CustomEvent('typewritercomplete'));
    }
  };

  node.addEventListener('typewriterskip', handleSkip);
  void run();

  return {
    update(nextOptions: TypewriterOptions): void {
      const restartRequired = hasTypewriterContentChanged(
        currentOptions,
        nextOptions
      );

      currentOptions = nextOptions;

      if (restartRequired) {
        void run();
      }
    },
    destroy(): void {
      runId += 1;
      node.removeEventListener('typewriterskip', handleSkip);
    }
  };
}

export function richTypewriter(
  node: HTMLElement,
  options: RichTypewriterOptions
) {
  let runId = 0;
  let currentOptions = options;
  let completed = false;

  const renderCompleteText = (): void => {
    node.textContent = '';

    for (const segment of currentOptions.segments) {
      const content = segmentHasPresentation(segment)
        ? document.createElement('span')
        : document.createTextNode(segment.text);

      if (content instanceof HTMLElement) {
        applySegmentPresentation(content, segment);
        content.textContent = segment.text;
      }

      node.append(content);
    }
  };

  const finish = (): void => {
    runId += 1;
    renderCompleteText();

    if (!completed) {
      completed = true;
      currentOptions.onComplete?.();
      node.dispatchEvent(new CustomEvent('typewritercomplete'));
    }
  };

  const handleSkip = (): void => {
    finish();
  };

  const run = async (): Promise<void> => {
    const thisRun = ++runId;
    const timing = {
      ...defaultTiming,
      ...currentOptions.timing
    };
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const textNodes = createSegmentTextNodes(node, currentOptions.segments);

    completed = false;

    if (currentOptions.enabled === false || reduceMotion) {
      finish();
      return;
    }

    for (const { segment, textNode } of textNodes) {
      for (const character of segment.text) {
        if (thisRun !== runId) {
          return;
        }

        textNode.textContent += character;
        currentOptions.onUpdate?.();
        await wait(getCharacterDelay(character, timing));
      }
    }

    if (thisRun === runId) {
      completed = true;
      currentOptions.onComplete?.();
      node.dispatchEvent(new CustomEvent('typewritercomplete'));
    }
  };

  node.addEventListener('typewriterskip', handleSkip);
  void run();

  return {
    update(nextOptions: RichTypewriterOptions): void {
      const restartRequired = haveRichTypewriterOptionsChanged(
        currentOptions,
        nextOptions
      );

      currentOptions = nextOptions;

      if (restartRequired) {
        void run();
      }
    },
    destroy(): void {
      runId += 1;
      node.removeEventListener('typewriterskip', handleSkip);
    }
  };
}

function createSegmentTextNodes(
  node: HTMLElement,
  segments: TypewriterSegment[]
): Array<{ segment: TypewriterSegment; textNode: Text }> {
  node.textContent = '';

  return segments.map((segment) => {
    const textNode = document.createTextNode('');

    if (segmentHasPresentation(segment)) {
      const wrapper = document.createElement('span');
      applySegmentPresentation(wrapper, segment);
      wrapper.append(textNode);
      node.append(wrapper);
    } else {
      node.append(textNode);
    }

    return {
      segment,
      textNode
    };
  });
}

function haveRichTypewriterOptionsChanged(
  previous: RichTypewriterOptions,
  next: RichTypewriterOptions
): boolean {
  if (previous.segments.length !== next.segments.length) {
    return true;
  }

  const contentChanged = previous.segments.some((segment, index) => (
    segment.text !== next.segments[index].text
    || segment.className !== next.segments[index].className
    || segment.color !== next.segments[index].color
    || segment.backgroundColor !== next.segments[index].backgroundColor
    || segment.bold !== next.segments[index].bold
    || segment.italic !== next.segments[index].italic
  ));

  if (contentChanged) {
    return true;
  }

  return hasTypewriterContentChanged(
    {
      text: '',
      timing: previous.timing,
      enabled: previous.enabled
    },
    {
      text: '',
      timing: next.timing,
      enabled: next.enabled
    }
  );
}

function segmentHasPresentation(segment: TypewriterSegment): boolean {
  return Boolean(
    segment.className
    || segment.color
    || segment.backgroundColor
    || segment.bold
    || segment.italic
  );
}

function applySegmentPresentation(
  element: HTMLElement,
  segment: TypewriterSegment
): void {
  element.className = segment.className ?? '';

  if (segment.color) {
    element.style.color = segment.color;
  }

  if (segment.backgroundColor) {
    element.style.backgroundColor = segment.backgroundColor;
    element.style.padding = '0.08em 0.28em';
    element.style.borderRadius = '0.3em';
    element.style.boxDecorationBreak = 'clone';
    element.style.setProperty('-webkit-box-decoration-break', 'clone');
  }

  if (segment.bold) {
    element.style.fontWeight = '700';
  }

  if (segment.italic) {
    element.style.fontStyle = 'italic';
  }
}

function hasTypewriterContentChanged(
  previous: TypewriterOptions,
  next: TypewriterOptions
): boolean {
  if (previous.text !== next.text) {
    return true;
  }

  if ((previous.enabled !== false) !== (next.enabled !== false)) {
    return true;
  }

  const previousTiming = {
    ...defaultTiming,
    ...previous.timing
  };
  const nextTiming = {
    ...defaultTiming,
    ...next.timing
  };

  return previousTiming.characterMs !== nextTiming.characterMs
    || previousTiming.commaMs !== nextTiming.commaMs
    || previousTiming.sentenceMs !== nextTiming.sentenceMs
    || previousTiming.paragraphMs !== nextTiming.paragraphMs
    || !haveMatchingOverrides(previousTiming.overrides, nextTiming.overrides);
}

function haveMatchingOverrides(
  previous: Record<string, number> | undefined,
  next: Record<string, number> | undefined
): boolean {
  const previousEntries = Object.entries(previous ?? {});
  const nextEntries = Object.entries(next ?? {});

  if (previousEntries.length !== nextEntries.length) {
    return false;
  }

  return previousEntries.every(([character, delay]) => next?.[character] === delay);
}

function getCharacterDelay(character: string, timing: TypewriterTiming): number {
  if (timing.overrides?.[character] !== undefined) {
    return timing.overrides[character];
  }

  if (character === '\n') {
    return timing.paragraphMs;
  }

  if (['.', '!', '?'].includes(character)) {
    return timing.sentenceMs;
  }

  if ([',', ';', ':'].includes(character)) {
    return timing.commaMs;
  }

  return timing.characterMs;
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}
