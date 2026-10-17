import { createSceneRegistry } from './sceneTypes.js';
import { dejaVuStoryDocument } from './dejaVuStory.js';

export const initialSceneIds = dejaVuStoryDocument.initialSceneIds;

export const storyRegistry = createSceneRegistry([
  ...dejaVuStoryDocument.nodes
]);

/**
 * @param {string} sceneId
 */
export function getScene(sceneId) {
  return storyRegistry.get(sceneId);
}
