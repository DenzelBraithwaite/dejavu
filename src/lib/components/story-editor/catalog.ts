export type TutorialNode = {
  name: string;
  type: string;
  description: string;
  usage: string;
};

export type TutorialSection = {
  title: string;
  description: string;
  nodes: TutorialNode[];
};

export const flowNodeTypes = [
  { type: 'dialogue', label: 'Dialogue' },
  { type: 'input', label: 'Player input' },
  { type: 'choice', label: 'Choice' },
  { type: 'checkpoint', label: 'Checkpoint' },
  { type: 'conversation', label: 'Open floor' },
  { type: 'dice-check', label: 'Dice' },
  { type: 'vote', label: 'Shared vote' },
  { type: 'condition', label: 'Condition' },
  { type: 'clear-terminal', label: 'Clear terminal' },
  { type: 'change-character', label: 'Change character' },
  { type: 'image', label: 'Image' },
  { type: 'minigame', label: 'Minigame' },
  { type: 'ending', label: 'Ending' }
];

export const companionNodeTypes = [
  { type: 'item-effect', label: 'Item' },
  { type: 'story-flag', label: 'Story flag' },
  { type: 'player-state', label: 'Player state' },
  { type: 'label', label: 'Visual label' },
  { type: 'note', label: 'Note' },
  { type: 'audio', label: 'Audio' },
  { type: 'stop-audio', label: 'Stop audio' },
  { type: 'screen-effect', label: 'Terminal effect' }
];

export const nodeTypes = [...flowNodeTypes, ...companionNodeTypes];

// Keep the guide catalog beside the palette so every added node has a matching explanation.
export const tutorialNodeSections: TutorialSection[] = [
  {
    title: 'Dialogue and player input',
    description: 'Present story text, collect a written response, or open a direct player conversation.',
    nodes: [
      {
        name: 'Dialogue',
        type: 'dialogue',
        description: 'Displays typed story text with an optional character, expression, or custom speaker.',
        usage: 'Write the dialogue, select its speaker and expression, then connect Next. Enable Timed to force a scene-length wait; its visible countdown can be hidden for a natural pause.'
      },
      {
        name: 'Player input',
        type: 'input',
        description: 'Collects a free-form response without changing the player character.',
        usage: 'Enable Store response when the answer matters later. Give it a key, then insert that value in future text or use Player state → Set player name to create a session-only custom name. Optionally show the responding player’s active character portrait and expression beside their answer.'
      },
      {
        name: 'Open floor',
        type: 'conversation',
        description: 'Runs a turn-based, face-to-face text conversation between the two players.',
        usage: 'Choose the first speaker and each player’s turn count, then connect the shared Next route. Enable player portraits to show each speaker’s active character and selected expression to both players.'
      }
    ]
  },
  {
    title: 'Branches and rules',
    description: 'Split the story through buttons, timers, dice, votes, or stored campaign state.',
    nodes: [
      {
        name: 'Choice',
        type: 'choice',
        description: 'Shows two to five labelled buttons with optional timing, locks, and remembered decisions.',
        usage: 'Set labels and destinations, optionally enable a visible or hidden timer, and mark the decision Minor or Major when future conditions should remember it.'
      },
      {
        name: 'Dice',
        type: 'dice-check',
        description: 'Rolls a selected die against a character stat and target value.',
        usage: 'Choose the die, stat, and target, then connect both Success and Failure. In multiplayer, a private-lane Dice node can let the other player spectate when reached from a Shared Vote.'
      },
      {
        name: 'Condition',
        type: 'condition',
        description: 'Immediately routes by campaign state, a remembered decision, or which multiplayer role is playing.',
        usage: 'Select the rule and connect both True and False. A Playing as condition can split a Shared route back into Player 1 and Player 2 lanes.'
      },
      {
        name: 'Shared vote',
        type: 'vote',
        description: 'Collects a button choice from both players and resolves the shared result.',
        usage: 'Create two to five options and connect every enabled result. Use it only on the Shared lane. Matching votes briefly flash the chosen result; opposing votes animate the random selection before the story continues.'
      }
    ]
  },
  {
    title: 'Media',
    description: 'Change the atmosphere, show visual content, or launch a coded game.',
    nodes: [
      {
        name: 'Audio',
        type: 'audio',
        description: 'Plays layered music or a sound effect without stopping existing audio.',
        usage: 'Choose Music or Sound, select a library file, then configure volume, looping, fades, and an optional playback segment.'
      },
      {
        name: 'Image',
        type: 'image',
        description: 'Displays uploaded artwork as a routed step inside the terminal.',
        usage: 'Select and position an image, write its Log text, customize its Continue button, or enable a timer to advance automatically.'
      },
      {
        name: 'Minigame',
        type: 'minigame',
        description: 'Launches a registered coded minigame from the story.',
        usage: 'Choose the game and connect both Finished Game and Exited Early destinations.'
      }
    ]
  },
  {
    title: 'Effects',
    description: 'Attach state changes or terminal presentation effects to another story node.',
    nodes: [
      {
        name: 'Item',
        type: 'item-effect',
        description: 'Gives a named item to the player or removes one from their Bag.',
        usage: 'Choose Give or Remove, enter the player-facing item name, optionally add artwork, and customize the terminal announcement.'
      },
      {
        name: 'Story flag',
        type: 'story-flag',
        description: 'Stores a named value that conditions can check later in the cartridge.',
        usage: 'Use a stable Flag ID such as has_gone_to_shop and set its value. A later Condition can compare that flag.'
      },
      {
        name: 'Player state',
        type: 'player-state',
        description: 'Changes the active player’s name, stats, relationships, known characters, or multiplayer mods.',
        usage: 'Choose one focused operation. Stat changes use a positive amount to add or a negative amount to subtract.'
      },
      {
        name: 'Terminal effect',
        type: 'screen-effect',
        description: 'Changes terminal color or applies animated presentation effects when its host becomes active.',
        usage: 'Choose a custom color, shake, blink, mirror, spin, glow, or scan effect. Glow can appear inside the screen, behind the full terminal, or in both places.'
      }
    ]
  },
  {
    title: 'Special nodes',
    description: 'Use compact utility markers to synchronize, clear, organize, or end a path.',
    nodes: [
      {
        name: 'Checkpoint',
        type: 'checkpoint',
        description: 'Stops one player until both players reach the same checkpoint key.',
        usage: 'Place matching checkpoint nodes on both player lanes, give them the same key, and connect Next.'
      },
      {
        name: 'Clear terminal',
        type: 'clear-terminal',
        description: 'Clears all terminal text and images before immediately continuing.',
        usage: 'Place it where history should disappear and connect Next. It can host companions, including Stop Audio, when the terminal and soundtrack should clear together.'
      },
      {
        name: 'Stop audio',
        type: 'stop-audio',
        description: 'Stops music, sound effects, or both without adding another story step.',
        usage: 'Choose the audio categories, optional music IDs/layers, and fade-out time, then attach it.'
      },
      {
        name: 'Change character',
        type: 'change-character',
        description: 'Changes the character identity and stats used by the current player for the rest of the session.',
        usage: 'Choose another story character or reset to the player’s default main character, then connect Next.'
      },
      {
        name: 'Visual label',
        type: 'label',
        description: 'Adds a heading or note to organize the editor canvas without affecting play.',
        usage: 'Attach it to a nearby host node and write a useful chapter or section title. Labels never receive story routes or appear during play.'
      },
      {
        name: 'Note',
        type: 'note',
        description: 'Stores longer author notes beside a story node without appearing during play.',
        usage: 'Attach it to a host node and record context, reminders, or implementation details for other authors.'
      },
      {
        name: 'Ending',
        type: 'ending',
        description: 'Marks the final destination of a playable route.',
        usage: 'Write the closing terminal text. Ending nodes intentionally have no outgoing route.'
      }
    ]
  }
];

// Surface missing handbook entries immediately when the palette gains another node.
export const documentedNodeTypes = new Set(
  tutorialNodeSections.flatMap((section) => {
    return section.nodes.map((node) => {
      return node.type;
    });
  })
);
export const undocumentedNodeTypes = nodeTypes.filter((nodeType) => {
  return !documentedNodeTypes.has(nodeType.type);
});

