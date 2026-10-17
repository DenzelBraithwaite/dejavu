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
      currentOptions = nextOptions;
      void run();
    },
    destroy(): void {
      runId += 1;
      node.removeEventListener('typewriterskip', handleSkip);
    }
  };
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
