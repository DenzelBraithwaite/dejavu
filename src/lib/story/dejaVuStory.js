import { prologueScenes } from './chapters/prologue.js';

export const dejaVuStoryDocument = {
  schemaVersion: 1,
  id: 'deja-vu',
  title: 'Déjà Vu',
  description: 'Two strangers wake after an experimental operation and discover that neither their memories nor their escorts can be trusted.',
  author: 'Denzel Braithwaite',
  status: 'playable',
  version: 2,
  builtIn: true,
  playModes: {
    singleplayer: false,
    multiplayer: true
  },
  initialSceneIds: {
    p1: 'prologue.p1.wake',
    p2: 'prologue.p2.wake'
  },
  nodes: prologueScenes,
  theme: {
    id: 'dejavu-terminal',
    name: 'Déjà Vu Terminal'
  },
  supportedMinigames: [
    'netrunners',
    'billywig',
    'pigz',
    'trace-race',
    'packet-war',
    'lo-hi',
    'mastermind',
    'chopsticks'
  ]
};
