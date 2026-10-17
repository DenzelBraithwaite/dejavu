import { createSceneRegistry } from './sceneTypes.js';
import { prologueScenes } from './chapters/prologue.js';

export const initialSceneIds = {
  p1: 'prologue.p1.wake',
  p2: 'prologue.p2.wake'
};

export const storyRegistry = createSceneRegistry([
  ...prologueScenes
]);

/**
 * @param {string} sceneId
 */
export function getScene(sceneId) {
  return storyRegistry.get(sceneId);
}
