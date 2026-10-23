import { defineScene } from '../sceneTypes.js';

export const prologueScenes = [
  defineScene({
    id: 'prologue.p1.wake',
    type: 'dialogue',
    audience: 'p1',
    speaker: 'RAID Lady',
    text: 'Can you hear me?',
    next: 'prologue.p1.nod',
    effects: [
      {
        type: 'discover-character',
        key: 'kat'
      }
    ]
  }),
  defineScene({
    id: 'prologue.p2.wake',
    type: 'dialogue',
    audience: 'p2',
    speaker: 'RAID Lady',
    text: 'Can you hear me?',
    next: 'prologue.p2.nod',
    effects: [
      {
        type: 'discover-character',
        key: 'kat'
      }
    ]
  }),
  defineScene({
    id: 'prologue.p1.nod',
    type: 'choice',
    audience: 'p1',
    text: 'Your body feels heavy. Even opening your eyes takes effort.',
    choices: [
      {
        id: 'nod',
        label: 'Nod slowly',
        next: 'prologue.p1.bandages'
      }
    ]
  }),
  defineScene({
    id: 'prologue.p2.nod',
    type: 'choice',
    audience: 'p2',
    text: 'Your body feels heavy. Even opening your eyes takes effort.',
    choices: [
      {
        id: 'nod',
        label: 'Nod slowly',
        next: 'prologue.p2.bandages'
      }
    ]
  }),
  defineScene({
    id: 'prologue.p1.bandages',
    type: 'dialogue',
    audience: 'p1',
    speaker: 'RAID Lady',
    text: 'Good, good. I’m going to take the bandages off your eyes now. Please hold still.',
    next: 'prologue.p1.focus'
  }),
  defineScene({
    id: 'prologue.p2.bandages',
    type: 'dialogue',
    audience: 'p2',
    speaker: 'RAID Lady',
    text: 'Good, good. I’m going to take the bandages off your eyes now. Please hold still.',
    next: 'prologue.p2.focus'
  }),
  defineScene({
    id: 'prologue.p1.focus',
    type: 'dice-check',
    audience: 'p1',
    text: 'The room swims into view. Focus on the woman standing beside the pod.',
    die: 6,
    stat: 'ocuware',
    threshold: 12,
    success: 'prologue.p1.lab',
    failure: 'prologue.p1.lab-blurred'
  }),
  defineScene({
    id: 'prologue.p2.focus',
    type: 'dice-check',
    audience: 'p2',
    text: 'The room swims into view. Focus on the woman standing beside the pod.',
    die: 6,
    stat: 'ocuware',
    threshold: 12,
    success: 'prologue.p2.lab',
    failure: 'prologue.p2.lab-blurred'
  }),
  defineScene({
    id: 'prologue.p1.lab',
    type: 'dialogue',
    audience: 'p1',
    text: 'Your vision snaps into focus. You are inside an incredibly advanced mech lab. A woman in a long white waistcoat watches you over a clipboard.',
    next: 'prologue.p1.explanation'
  }),
  defineScene({
    id: 'prologue.p2.lab',
    type: 'dialogue',
    audience: 'p2',
    text: 'Your vision snaps into focus. You are inside an incredibly advanced mech lab. A woman in a long white waistcoat watches you over a clipboard.',
    next: 'prologue.p2.explanation'
  }),
  defineScene({
    id: 'prologue.p1.lab-blurred',
    type: 'dialogue',
    audience: 'p1',
    text: 'The room remains blurred at the edges. Shapes suggest an advanced mech lab, but the woman beside you is the only face you can hold in focus.',
    next: 'prologue.p1.explanation'
  }),
  defineScene({
    id: 'prologue.p2.lab-blurred',
    type: 'dialogue',
    audience: 'p2',
    text: 'The room remains blurred at the edges. Shapes suggest an advanced mech lab, but the woman beside you is the only face you can hold in focus.',
    next: 'prologue.p2.explanation'
  }),
  defineScene({
    id: 'prologue.p1.explanation',
    type: 'dialogue',
    audience: 'p1',
    speaker: 'RAID Lady',
    text: 'Excellent. All tests returned green. Move slowly—you have just undergone an experimental operation. The anaesthetic should wear off soon.',
    next: 'prologue.p1.name'
  }),
  defineScene({
    id: 'prologue.p2.explanation',
    type: 'dialogue',
    audience: 'p2',
    speaker: 'RAID Lady',
    text: 'Excellent. All tests returned green. Move slowly—you have just undergone an experimental operation. The anaesthetic should wear off soon.',
    next: 'prologue.p2.name'
  }),
  defineScene({
    id: 'prologue.p1.name',
    type: 'input',
    audience: 'p1',
    prompt: 'Your memories are foggy, but one thing remains. What is your tag?',
    maxLength: 24,
    next: 'prologue.p1.alarm'
  }),
  defineScene({
    id: 'prologue.p2.name',
    type: 'input',
    audience: 'p2',
    prompt: 'Your memories are foggy, but one thing remains. What is your tag?',
    maxLength: 24,
    next: 'prologue.p2.alarm'
  }),
  defineScene({
    id: 'prologue.p1.alarm',
    type: 'timed-choice',
    audience: 'p1',
    text: 'An explosion shakes the facility. Emergency lights flood the wing in red as the RAID escort reaches for your wheelchair.',
    fallbackChoiceId: 'observe',
    choices: [
      {
        id: 'demand',
        label: 'Demand answers',
        next: 'prologue.p1.escape',
        effects: [
          {
            type: 'set-flag',
            key: 'p1.confrontational',
            value: true
          }
        ]
      },
      {
        id: 'observe',
        label: 'Stay quiet and observe',
        next: 'prologue.p1.escape',
        effects: [
          {
            type: 'set-flag',
            key: 'p1.observant',
            value: true
          }
        ]
      }
    ]
  }),
  defineScene({
    id: 'prologue.p2.alarm',
    type: 'timed-choice',
    audience: 'p2',
    text: 'An explosion shakes the facility. Emergency lights flood the wing in red as the RAID escort reaches for your wheelchair.',
    fallbackChoiceId: 'observe',
    choices: [
      {
        id: 'demand',
        label: 'Demand answers',
        next: 'prologue.p2.escape',
        effects: [
          {
            type: 'set-flag',
            key: 'p2.confrontational',
            value: true
          }
        ]
      },
      {
        id: 'observe',
        label: 'Stay quiet and observe',
        next: 'prologue.p2.escape',
        effects: [
          {
            type: 'set-flag',
            key: 'p2.observant',
            value: true
          }
        ]
      }
    ]
  }),
  defineScene({
    id: 'prologue.p1.escape',
    type: 'dialogue',
    audience: 'p1',
    text: 'Your escort rushes you through an elevator and into a narrow garage. Someone is already bringing a second patient toward the waiting car.',
    next: 'prologue.p1.car'
  }),
  defineScene({
    id: 'prologue.p2.escape',
    type: 'dialogue',
    audience: 'p2',
    text: 'Your escort rushes you through an elevator and into a narrow garage. Another patient is already waiting in the back of the car.',
    next: 'prologue.p2.car'
  }),
  defineScene({
    id: 'prologue.p1.car',
    type: 'checkpoint',
    audience: 'p1',
    text: 'Wait for the other patient to reach the car.',
    checkpointId: 'prologue.car',
    next: 'prologue.conversation'
  }),
  defineScene({
    id: 'prologue.p2.car',
    type: 'checkpoint',
    audience: 'p2',
    text: 'Wait for the other patient to reach the car.',
    checkpointId: 'prologue.car',
    next: 'prologue.conversation'
  }),
  defineScene({
    id: 'prologue.conversation',
    type: 'conversation',
    audience: 'both',
    text: 'The tinted windows hide the facility as the car pulls away. Neither of you trusts your escorts. You have a few moments to speak privately.',
    messagesPerPlayer: {
      p1: 3,
      p2: 2
    },
    firstPlayer: 'random',
    next: 'prologue.trust-vote'
  }),
  defineScene({
    id: 'prologue.trust-vote',
    type: 'vote',
    audience: 'both',
    text: 'Do you agree to watch each other’s backs until you understand what happened?',
    choices: [
      {
        id: 'trust',
        label: 'Agree',
        next: 'prologue.arrival',
        effects: [
          {
            type: 'set-flag',
            key: 'players.mutualTrust',
            value: true
          }
        ]
      },
      {
        id: 'distance',
        label: 'Keep your distance',
        next: 'prologue.arrival',
        effects: [
          {
            type: 'set-flag',
            key: 'players.mutualTrust',
            value: false
          }
        ]
      }
    ]
  }),
  defineScene({
    id: 'prologue.arrival',
    type: 'image',
    audience: 'both',
    text: 'The car carries you deeper into Vespas. Whatever RAID placed behind your eyes, somebody was willing to attack a fortified facility to reach it.',
    src: '/audience-chamber.png',
    alt: 'A dim chamber waiting at the end of the journey',
    next: 'chapter-01.placeholder'
  }),
  defineScene({
    id: 'chapter-01.placeholder',
    type: 'ending',
    audience: 'both',
    text: 'Chapter 1 — Eyes Sparkling. The Spoofs chapter is ready for its detailed scene draft.'
  })
];
