export type CharacterRecord = {
  id: string;
  name: string;
  association: string;
  role: string;
  summary: string;
  image?: string;
};

export const characterRegistry: Record<string, CharacterRecord> = {
  kat: {
    id: 'kat',
    name: 'Kat',
    association: 'RAID',
    role: 'Face of RAID',
    summary: 'A calm, commanding RAID representative who is never seen without protection.'
  },
  trinity: {
    id: 'trinity',
    name: 'Trinity',
    association: 'Spoofs',
    role: 'Leader',
    summary: 'The leader of the Spoofs and one of the most capable hackers in Vespas.'
  },
  benny: {
    id: 'benny',
    name: 'Benny',
    association: 'Factionless',
    role: 'Leader of Los Logia',
    summary: 'A feared, heavily modified fighter whose true history is not yet understood.'
  }
};
