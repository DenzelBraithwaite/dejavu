/**
 * @typedef {'p1' | 'p2'} PlayerId
 * @typedef {'both' | PlayerId} Audience
 * @typedef {'dialogue' | 'choice' | 'input' | 'checkpoint' | 'conversation' | 'dice-check' | 'vote' | 'timed-choice' | 'image' | 'minigame' | 'effect' | 'ambience' | 'audio' | 'stop-audio' | 'screen-effect' | 'condition' | 'clear-terminal' | 'change-character' | 'label' | 'ending'} SceneType
 *
 * @typedef SceneEffect
 * @property {'set-flag' | 'add-item' | 'remove-item' | 'set-player-name' | 'discover-character' | 'adjust-stat' | 'adjust-relationship' | 'install-mod' | 'remove-mod'} type
 * @property {string} key
 * @property {string | number | boolean} [value]
 *
 * @typedef SceneChoice
 * @property {string} id
 * @property {string} label
 * @property {string} next
 * @property {boolean} [disabled]
 * @property {SceneEffect[]} [effects]
 *
 * @typedef SceneNode
 * @property {string} id
 * @property {SceneType} type
 * @property {Audience} [audience]
 * @property {'singleplayer' | 'multiplayer'} [map]
 * @property {string} [speaker]
 * @property {string} [characterId]
 * @property {'normal' | 'shocked' | 'angry' | 'sad' | 'happy' | 'confused' | 'dead'} [expression]
 * @property {string} [portrait]
 * @property {string} [portraitAlt]
 * @property {string} [text]
 * @property {string} [continueLabel]
 * @property {string} [next]
 * @property {SceneChoice[]} [choices]
 * @property {string} [prompt]
 * @property {string} [placeholder]
 * @property {number} [maxLength]
 * @property {string} [checkpointId]
 * @property {number} [messageCount]
 * @property {Partial<Record<PlayerId, number>>} [messagesPerPlayer]
 * @property {PlayerId | 'random'} [firstPlayer]
 * @property {4 | 6 | 8 | 10 | 12 | 20} [die]
 * @property {string} [stat]
 * @property {number} [threshold]
 * @property {string} [success]
 * @property {string} [failure]
 * @property {number} [durationMs]
 * @property {string} [fallbackChoiceId]
 * @property {string} [src]
 * @property {string} [alt]
 * @property {string} [logText]
 * @property {string} [imageBorderColor]
 * @property {string} [background]
 * @property {string | null} [music]
 * @property {string} [sound]
 * @property {boolean} [stopMusic]
 * @property {'color' | 'shake' | 'blink' | 'mirror' | 'spin' | 'glow' | 'scan'} [screenEffect]
 * @property {number} [effectDurationSeconds]
 * @property {number} [effectIterations]
 * @property {string} [attachedTo]
 * @property {string} [minigameId]
 * @property {Record<string, string>} [resultNext]
 * @property {{type: 'has-item' | 'flag-equals' | 'stat-at-least' | 'last-dice-success', key?: string, value?: string | number | boolean}} [condition]
 * @property {string} [trueNext]
 * @property {string} [falseNext]
 * @property {SceneEffect[]} [effects]
 * @property {string[]} [tags]
 */

/**
 * Returns a scene unchanged while giving editors and TypeScript tooling a
 * single place to validate the authoring contract.
 *
 * @param {SceneNode} scene
 * @returns {SceneNode}
 */
export function defineScene(scene) {
  return scene;
}

/**
 * Creates a registry and rejects duplicate scene IDs immediately.
 *
 * @param {SceneNode[]} scenes
 * @returns {Map<string, SceneNode>}
 */
export function createSceneRegistry(scenes) {
  const registry = new Map();

  for (const scene of scenes) {
    if (registry.has(scene.id)) {
      throw new Error(`Duplicate scene ID: ${scene.id}`);
    }

    registry.set(scene.id, scene);
  }

  return registry;
}

/**
 * Replaces authoring tokens with values from the current campaign state.
 * Unknown tokens remain visible so a typo is easy to find while testing.
 *
 * @param {string} text
 * @param {Record<string, string | number>} values
 * @returns {string}
 */
export function interpolateSceneText(text, values) {
  return text.replace(/\{([A-Z0-9_]+)\}/g, (token, key) => {
    const value = values[key];
    return value === undefined ? token : String(value);
  });
}
