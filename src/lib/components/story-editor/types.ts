export type StoryPlayMode = 'singleplayer' | 'multiplayer';

export type StoryValidationIssue = {
  id: string;
  title: string;
  message: string;
  fix: string;
  nodeId?: string;
  map?: StoryPlayMode;
  blocksSave: boolean;
  blocksPlay: boolean;
};
