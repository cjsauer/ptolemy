import Anthropic from '@anthropic-ai/sdk';
import { ICampaign, IChatMessage, INPC, IPlanet, ISettlement, IStarship, IDerelict, ICreature, IFaction } from 'src/components/models';
import * as tools from './gm-tools';
import { CharacterChanges } from './gm-tools';

// --- Agent event types for streaming to UI ---

export type AgentEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use_start'; name: string; id: string }
  | { type: 'tool_result'; name: string; result: unknown }
  | { type: 'error'; message: string }
  | { type: 'done'; usage?: TokenUsage };

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

// --- System prompt ---

const SYSTEM_PROMPT = `You are the Game Master for an Ironsworn: Starforged guided-play campaign. You narrate the story, interpret oracle results, call for moves, manage NPCs, and keep the fiction grounded in the Starforged setting.

CORE RULES:
- Starforged uses 3 dice: an action die (d6) + stat + adds vs two challenge dice (d10s).
- Strong Hit: action score beats BOTH challenge dice. Weak Hit: beats ONE. Miss: beats NEITHER.
- When challenge dice match, it's a MATCH — amplify the outcome (stronger hit or harder miss).
- Momentum can be "burned" to replace the action score. After burning, momentum resets to its reset value.
- Progress moves use filled boxes (0-10) as the score instead of action die + stat.
- Condition meters: health, spirit, supply (0-5). Momentum (-6 to +10).
- Impacts reduce max momentum and reset value.

PROGRESS TRACKS:
- Troublesome: mark 3 boxes per mark. Dangerous: 2. Formidable: 1. Extreme: half box. Epic: quarter box.
- Each box has 4 ticks. A full box = 4 ticks.

YOUR BEHAVIOR:
1. Always announce the move name before rolling (e.g., "Let's Face Danger with Edge").
2. Use tools to roll dice — never simulate or invent roll results.
3. After every action roll, check if the player could burn momentum for a better result and mention it.
4. When challenge dice match, flag it and make the narrative consequences more dramatic.
5. Use oracles generously to inspire fiction — don't invent locations, names, or events from nothing when an oracle exists.
6. Respect player agency. You describe the world and consequences; the player decides their character's actions and feelings.
7. Write journal entries to record key narrative moments, decisions, and discoveries. The journal is the permanent campaign record.
8. Keep narration vivid but concise. 1-2 paragraphs per beat, not novels.
9. When a scene ends, briefly recap the situation and ask what the player wants to do next.
10. Track fictional positioning — wounds matter, NPCs remember, the world reacts.

MOVES YOU SHOULD KNOW:
- Face Danger (any stat based on approach)
- Secure an Advantage (any stat)
- Gather Information (wits)
- Compel (heart/iron/shadow)
- Aid Your Ally (any stat — but this is solo, so rare)
- Make a Connection (heart)
- Forge a Bond (heart, progress roll)
- Swear an Iron Vow (heart)
- Reach a Milestone (mark progress on vow)
- Fulfill Your Vow (progress roll)
- Take Decisive Action (progress roll on combat)
- Endure Harm (health or iron)
- Endure Stress (spirit or heart)
- Lose Momentum (reduce momentum)
- Face Death / Face Desolation / Overcome Destruction (progress rolls at 0)
- Sojourn (heart — recover in community)
- Heal (iron or wits)
- Repair (wits)
- Resupply (wits)

When the player describes an action, identify the appropriate move, ask for confirmation if ambiguous, then roll. Narrate the outcome based on the result, apply mechanical consequences, and advance the fiction.

CAMPAIGN SETUP:
If the player asks to set up a new campaign (or their character has no stats/assets), walk them through the Starforged Chapter 2 procedure conversationally. This should feel like a conversation, not a form.

1. **Setting Truths** — Present each truth category one at a time, offer the 3 options or a custom option. Player picks or you roll. Write via set_truths.
2. **Character Creation**:
   - Choose 2 paths (browse assets, present options by playstyle)
   - Create backstory (ask questions, roll Action+Theme for inspiration)
   - Write a background vow (epic rank)
   - Board starship (add STARSHIP asset, player names the ship)
   - Choose a final asset
   - Set stats (distribute 3, 2, 2, 1, 1 among edge/heart/iron/shadow/wits)
   - Envision character (roll first-look oracle, ask player to describe)
   - Name character (offer name oracle or player chooses)
   - Gear up (spacer kit + path-appropriate gear)
   - Write all via update_character + add_asset
3. **Build Starting Sector**:
   - Generate sector name via roll_oracle + create_sector
   - Generate 1-2 settlements via roll_oracle + add_settlement
   - Zoom in on starting settlement details
   - Create a local connection (Make a Connection, auto strong hit) via create_connection
   - Introduce sector trouble via roll_oracle
4. **Begin Your Adventure**:
   - Review settlement trouble + connection + sector peril
   - Suggest an inciting incident (personal, won't go away, ticking clock, limited scope)
   - Discuss until it excites the player
   - Swear an Iron Vow (troublesome or dangerous rank, roll +heart)
   - Begin play

Go through each step at a natural pace — don't rush. Let the player make choices and ask questions. The existing UI (Character page, Sector page, Challenges page) updates in real time as you populate data via tools.`;

// --- Tool definitions for the Anthropic API ---

const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'get_game_state',
    description: 'Get a consolidated snapshot of the current game state: character stats, meters, momentum, impacts, active vows with progress, clocks, assets, location.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'roll_action',
    description: 'Make a Starforged action roll: d6 + stat + adds vs 2d10. Returns the full result including momentum burn eligibility. Always announce the move name before calling this.',
    input_schema: {
      type: 'object' as const,
      properties: {
        stat: { type: 'string', enum: ['edge', 'heart', 'iron', 'shadow', 'wits'], description: 'The stat to roll with' },
        adds: { type: 'number', description: 'Additional modifier to add (default 0)' },
      },
      required: ['stat'],
    },
  },
  {
    name: 'roll_progress',
    description: 'Make a progress roll for a vow or progress track. Uses the track\'s filled boxes as the score vs 2d10.',
    input_schema: {
      type: 'object' as const,
      properties: {
        track_name: { type: 'string', description: 'Name of the vow or progress track' },
      },
      required: ['track_name'],
    },
  },
  {
    name: 'roll_oracle',
    description: 'Roll on a Starforged oracle table. Use dataforged IDs like "Starforged/Oracles/Core/Action" or "Starforged/Oracles/Characters/Name/Given_Name".',
    input_schema: {
      type: 'object' as const,
      properties: {
        oracle_id: { type: 'string', description: 'The dataforged oracle table ID' },
      },
      required: ['oracle_id'],
    },
  },
  {
    name: 'mark_progress',
    description: 'Mark progress on a vow or progress track. Automatically applies the correct number of ticks based on the track\'s difficulty rank.',
    input_schema: {
      type: 'object' as const,
      properties: {
        track_name: { type: 'string', description: 'Name of the vow or progress track' },
        times: { type: 'number', description: 'Number of times to mark progress (default 1)' },
      },
      required: ['track_name'],
    },
  },
  {
    name: 'update_character',
    description: 'Modify character stats, condition meters, momentum, impacts, location, or gear. Values are clamped to valid ranges.',
    input_schema: {
      type: 'object' as const,
      properties: {
        health: { type: 'number', description: 'Set health (0-5)' },
        spirit: { type: 'number', description: 'Set spirit (0-5)' },
        supply: { type: 'number', description: 'Set supply (0-5)' },
        momentum: { type: 'number', description: 'Set momentum (-6 to max)' },
        location: { type: 'string', description: 'Update current location' },
        gear: { type: 'string', description: 'Update gear list' },
        name: { type: 'string', description: 'Set character name' },
        pronouns: { type: 'string', description: 'Set character pronouns' },
        callsign: { type: 'string', description: 'Set character callsign' },
        characteristics: { type: 'string', description: 'Set character characteristics/description' },
        stats: {
          type: 'object',
          description: 'Set stat values (edge, heart, iron, shadow, wits). Each 0-5.',
          properties: {
            edge: { type: 'number' },
            heart: { type: 'number' },
            iron: { type: 'number' },
            shadow: { type: 'number' },
            wits: { type: 'number' },
          },
        },
        impacts: {
          type: 'object',
          description: 'Toggle impacts by name. e.g. {"Wounded": true}',
          additionalProperties: { type: 'boolean' },
        },
      },
      required: [],
    },
  },
  {
    name: 'create_vow',
    description: 'Create a new vow (progress track on the character). Difficulty: 1=Troublesome, 2=Dangerous, 3=Formidable, 4=Extreme, 5=Epic.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Vow name' },
        difficulty: { type: 'number', description: 'Difficulty rank 1-5' },
        notes: { type: 'string', description: 'Optional notes about the vow' },
      },
      required: ['name', 'difficulty'],
    },
  },
  {
    name: 'fulfill_vow',
    description: 'Complete or forsake a vow, removing it from active vows.',
    input_schema: {
      type: 'object' as const,
      properties: {
        vow_name: { type: 'string', description: 'Name of the vow' },
        outcome: { type: 'string', enum: ['fulfilled', 'forsaken'], description: 'Whether the vow was fulfilled or forsaken' },
      },
      required: ['vow_name', 'outcome'],
    },
  },
  {
    name: 'create_clock',
    description: 'Create a tension or campaign clock with 4, 6, 8, or 10 segments.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Clock name' },
        segments: { type: 'number', enum: [4, 6, 8, 10], description: 'Number of segments' },
        advance: { type: 'string', enum: ['Almost Certain', 'Likely', 'Fifty-fifty', 'Unlikely', 'Small Chance'], description: 'Oracle likelihood for automatic advancement' },
      },
      required: ['name', 'segments'],
    },
  },
  {
    name: 'advance_clock',
    description: 'Fill segments on a clock. Returns whether the clock is complete.',
    input_schema: {
      type: 'object' as const,
      properties: {
        clock_name: { type: 'string', description: 'Name of the clock' },
        segments: { type: 'number', description: 'Number of segments to fill (default 1)' },
      },
      required: ['clock_name'],
    },
  },
  {
    name: 'create_progress_track',
    description: 'Create a non-vow progress track (combat, expedition, etc.).',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Track name' },
        difficulty: { type: 'number', description: 'Difficulty rank 1-5' },
        notes: { type: 'string', description: 'Optional notes' },
      },
      required: ['name', 'difficulty'],
    },
  },
  {
    name: 'add_journal',
    description: 'Append narration/content to the campaign journal. Use HTML formatting. This is the permanent campaign record.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'HTML content to append' },
        entry_index: { type: 'number', description: 'Journal entry index (default 0, the most recent)' },
      },
      required: ['content'],
    },
  },
  {
    name: 'create_connection',
    description: 'Add an NPC connection to a sector cell.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sector_index: { type: 'number', description: 'Sector index' },
        cell_id: { type: 'string', description: 'Cell ID in the sector' },
        name: { type: 'string', description: 'NPC name' },
        role: { type: 'string' },
        disposition: { type: 'string' },
        goal: { type: 'string' },
        pronouns: { type: 'string' },
      },
      required: ['sector_index', 'cell_id', 'name'],
    },
  },
  {
    name: 'update_npc',
    description: 'Modify an NPC\'s fields (searches all sectors).',
    input_schema: {
      type: 'object' as const,
      properties: {
        npc_name: { type: 'string', description: 'NPC name to find' },
        disposition: { type: 'string' },
        notes: { type: 'string' },
        bond: { type: 'boolean' },
        role: { type: 'string' },
        goal: { type: 'string' },
      },
      required: ['npc_name'],
    },
  },
  {
    name: 'mark_legacy',
    description: 'Mark ticks on a legacy track (quests, bonds, or discoveries).',
    input_schema: {
      type: 'object' as const,
      properties: {
        legacy_type: { type: 'string', enum: ['quests', 'bonds', 'discoveries'], description: 'Which legacy track' },
        ticks: { type: 'number', description: 'Number of ticks to mark (default 1)' },
      },
      required: ['legacy_type'],
    },
  },
  {
    name: 'toggle_asset_ability',
    description: 'Toggle an asset ability on or off (e.g., when spending XP to unlock).',
    input_schema: {
      type: 'object' as const,
      properties: {
        asset_title: { type: 'string', description: 'Asset name' },
        ability_index: { type: 'number', description: 'Ability index (0-based)' },
      },
      required: ['asset_title', 'ability_index'],
    },
  },
  {
    name: 'add_planet',
    description: 'Add a planet to a sector cell.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sector_index: { type: 'number' },
        cell_id: { type: 'string' },
        name: { type: 'string' },
        type: { type: 'string', enum: ['Desert', 'Furnace', 'Grave', 'Ice', 'Jovian', 'Jungle', 'Ocean', 'Rocky', 'Shattered', 'Tainted', 'Vital'] },
        atmosphere: { type: 'string' },
        life: { type: 'string' },
        settlements: { type: 'string' },
        description: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['sector_index', 'cell_id', 'name'],
    },
  },
  {
    name: 'add_settlement',
    description: 'Add a settlement to a sector cell.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sector_index: { type: 'number' },
        cell_id: { type: 'string' },
        name: { type: 'string' },
        location: { type: 'string', enum: ['Planetside', 'Orbital', 'Deep Space'] },
        population: { type: 'string' },
        authority: { type: 'string' },
        trouble: { type: 'string' },
        firstLook: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['sector_index', 'cell_id', 'name'],
    },
  },
  {
    name: 'add_starship',
    description: 'Add a starship to a sector cell.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sector_index: { type: 'number' },
        cell_id: { type: 'string' },
        name: { type: 'string' },
        class: { type: 'string' },
        fleet: { type: 'string' },
        mission: { type: 'string' },
        firstLook: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['sector_index', 'cell_id', 'name'],
    },
  },
  {
    name: 'add_derelict',
    description: 'Add a derelict to a sector cell.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sector_index: { type: 'number' },
        cell_id: { type: 'string' },
        name: { type: 'string' },
        location: { type: 'string', enum: ['Planetside', 'Orbital', 'Deep Space'] },
        type: { type: 'string', enum: ['Starship', 'Settlement'] },
        condition: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['sector_index', 'cell_id', 'name'],
    },
  },
  {
    name: 'add_creature',
    description: 'Add a creature to a sector cell.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sector_index: { type: 'number' },
        cell_id: { type: 'string' },
        name: { type: 'string' },
        environment: { type: 'string', enum: ['Space', 'Interior', 'Land', 'Liquid', 'Air'] },
        scale: { type: 'string' },
        form: { type: 'string' },
        behaviour: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['sector_index', 'cell_id', 'name'],
    },
  },
  {
    name: 'lookup_move',
    description: 'Look up the full text of a Starforged move by name or ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        move_id: { type: 'string', description: 'Move name (e.g. "Face Danger") or dataforged ID' },
      },
      required: ['move_id'],
    },
  },
  {
    name: 'lookup_asset',
    description: 'Look up asset details from dataforged by name or ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        asset_id: { type: 'string', description: 'Asset name or dataforged ID' },
      },
      required: ['asset_id'],
    },
  },
  {
    name: 'set_truths',
    description: 'Set setting truths for the campaign world. Valid truth categories: Cataclysm, Exodus, Communities, Iron, Laws, Religion, Magic, Communication and Data, Medicine, Artificial Intelligence, War, Lifeforms, Precursors, Horrors. Keys are normalized automatically.',
    input_schema: {
      type: 'object' as const,
      properties: {
        truths: {
          type: 'object',
          description: 'Key-value pairs of truth categories and their selected text. e.g. {"Cataclysm": "The Sun Plague..."}',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['truths'],
    },
  },
  {
    name: 'add_asset',
    description: 'Add a dataforged asset to the character by name or ID. First ability is enabled by default.',
    input_schema: {
      type: 'object' as const,
      properties: {
        asset_id: { type: 'string', description: 'Asset name or dataforged ID' },
        abilities: {
          type: 'array',
          items: { type: 'boolean' },
          description: 'Which abilities are enabled (default: [true, false, false])',
        },
      },
      required: ['asset_id'],
    },
  },
  {
    name: 'create_sector',
    description: 'Create a new sector.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Sector name' },
        region: { type: 'string', enum: ['Terminus', 'Outlands', 'Expanse'] },
      },
      required: ['name'],
    },
  },
  {
    name: 'create_faction',
    description: 'Create a new faction.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        type: { type: 'string' },
        influence: { type: 'string' },
        sphere: { type: 'string' },
        projects: { type: 'string' },
        relationships: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'burn_momentum',
    description: 'Burn the character\'s momentum, resetting it to the reset value. Use after confirming with the player.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

// --- Tool executor ---

function executeTool(name: string, input: Record<string, unknown>, campaign: ICampaign): unknown {
  switch (name) {
    case 'get_game_state':
      return tools.getGameState(campaign);
    case 'roll_action':
      return tools.rollAction(campaign, input.stat as string, (input.adds as number) ?? 0);
    case 'roll_progress':
      return tools.rollProgress(campaign, input.track_name as string);
    case 'roll_oracle':
      return tools.rollOracle(campaign, input.oracle_id as string);
    case 'mark_progress':
      return tools.markProgress(campaign, input.track_name as string, (input.times as number) ?? 1);
    case 'update_character':
      return tools.updateCharacter(campaign, input as CharacterChanges);
    case 'create_vow':
      return tools.createVow(campaign, input.name as string, input.difficulty as number, input.notes as string);
    case 'fulfill_vow':
      return tools.fulfillVow(campaign, input.vow_name as string, input.outcome as 'fulfilled' | 'forsaken');
    case 'create_clock':
      return tools.createClock(campaign, input.name as string, input.segments as number, input.advance as string);
    case 'advance_clock':
      return tools.advanceClock(campaign, input.clock_name as string, (input.segments as number) ?? 1);
    case 'create_progress_track':
      return tools.createProgressTrack(campaign, input.name as string, input.difficulty as number, input.notes as string);
    case 'add_journal':
      return tools.addJournal(campaign, input.content as string, input.entry_index as number);
    case 'create_connection': {
      const { sector_index, cell_id, ...npcData } = input;
      return tools.createConnection(campaign, sector_index as number, cell_id as string, npcData as Partial<INPC> & { name: string });
    }
    case 'update_npc':
      return tools.updateNpc(campaign, input.npc_name as string, input as Partial<INPC>);
    case 'mark_legacy':
      return tools.markLegacy(campaign, input.legacy_type as 'quests' | 'bonds' | 'discoveries', (input.ticks as number) ?? 1);
    case 'toggle_asset_ability':
      return tools.toggleAssetAbility(campaign, input.asset_title as string, input.ability_index as number);
    case 'add_planet': {
      const { sector_index, cell_id, ...planetData } = input;
      return tools.addPlanet(campaign, sector_index as number, cell_id as string, planetData as Partial<IPlanet> & { name: string });
    }
    case 'add_settlement': {
      const { sector_index, cell_id, ...settlementData } = input;
      return tools.addSettlement(campaign, sector_index as number, cell_id as string, settlementData as Partial<ISettlement> & { name: string });
    }
    case 'add_starship': {
      const { sector_index, cell_id, ...shipData } = input;
      return tools.addStarship(campaign, sector_index as number, cell_id as string, shipData as Partial<IStarship> & { name: string });
    }
    case 'add_derelict': {
      const { sector_index, cell_id, ...derelictData } = input;
      return tools.addDerelict(campaign, sector_index as number, cell_id as string, derelictData as Partial<IDerelict> & { name: string });
    }
    case 'add_creature': {
      const { sector_index, cell_id, ...creatureData } = input;
      return tools.addCreature(campaign, sector_index as number, cell_id as string, creatureData as Partial<ICreature> & { name: string });
    }
    case 'lookup_move':
      return tools.lookupMove(campaign, input.move_id as string);
    case 'lookup_asset':
      return tools.lookupAsset(campaign, input.asset_id as string);
    case 'set_truths':
      return tools.setTruths(campaign, input.truths as Record<string, string>);
    case 'add_asset':
      return tools.addAsset(campaign, input.asset_id as string, input.abilities as boolean[]);
    case 'create_sector':
      return tools.createSector(campaign, input.name as string, input.region as string);
    case 'create_faction':
      return tools.createFaction(campaign, input as Partial<IFaction> & { name: string });
    case 'burn_momentum':
      return tools.burnMomentum(campaign);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// --- Build game state context block ---

function buildGameStateContext(campaign: ICampaign): string {
  const state = tools.getGameState(campaign);
  return `<game_state>
${JSON.stringify(state, null, 2)}
</game_state>`;
}

// --- Build journal context ---

function buildJournalContext(campaign: ICampaign): string {
  if (!campaign.journal || campaign.journal.length === 0) return '';

  const journalText = campaign.journal
    .map((entry, i) => `--- Entry ${i}: ${entry.title} ${entry.pinned ? '[PINNED]' : ''} ---\n${entry.content}`)
    .join('\n\n');

  return `<journal>\n${journalText}\n</journal>`;
}

// --- Convert chat history to Anthropic message format ---

function buildMessages(
  chatHistory: IChatMessage[],
  playerAction: string
): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];

  // Add chat history (keep last 30 messages to stay within context)
  const recentHistory = chatHistory.slice(-30);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : msg.content,
    });
  }

  // Add current player action
  messages.push({
    role: 'user',
    content: playerAction,
  });

  return messages;
}

// --- Main agentic loop ---

export async function* runTurn(
  apiKey: string,
  model: string,
  campaign: ICampaign,
  playerAction: string,
  chatHistory: IChatMessage[]
): AsyncGenerator<AgentEvent> {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  // Build system prompt with game state and journal
  const journalContext = buildJournalContext(campaign);
  const gameStateContext = buildGameStateContext(campaign);

  const systemContent: Anthropic.TextBlockParam[] = [
    {
      type: 'text',
      text: SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    },
  ];

  if (journalContext) {
    systemContent.push({
      type: 'text',
      text: journalContext,
      cache_control: { type: 'ephemeral' },
    });
  }

  systemContent.push({
    type: 'text',
    text: gameStateContext,
  });

  const messages = buildMessages(chatHistory, playerAction);

  const totalUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
  };

  // Agentic loop: keep going until Claude stops calling tools
  let continueLoop = true;
  while (continueLoop) {
    try {
      const stream = client.messages.stream({
        model,
        max_tokens: 4096,
        system: systemContent,
        messages,
        tools: TOOL_DEFINITIONS,
      });

      const toolUses: { id: string; name: string; input: Record<string, unknown> }[] = [];

      const response = await stream.finalMessage();

      // Track usage
      if (response.usage) {
        totalUsage.inputTokens += response.usage.input_tokens;
        totalUsage.outputTokens += response.usage.output_tokens;
        const usage = response.usage as unknown as Record<string, number>;
        totalUsage.cacheCreationTokens += usage['cache_creation_input_tokens'] || 0;
        totalUsage.cacheReadTokens += usage['cache_read_input_tokens'] || 0;
      }

      // Process content blocks
      for (const block of response.content) {
        if (block.type === 'text') {
          yield { type: 'text_delta', text: block.text };
        } else if (block.type === 'tool_use') {
          toolUses.push({
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          });
          yield { type: 'tool_use_start', name: block.name, id: block.id };
        }
      }

      if (response.stop_reason === 'tool_use' && toolUses.length > 0) {
        // Add assistant message to conversation
        messages.push({
          role: 'assistant',
          content: response.content,
        });

        // Execute tools and build tool results
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const tool of toolUses) {
          try {
            const result = executeTool(tool.name, tool.input, campaign);
            yield { type: 'tool_result', name: tool.name, result };
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tool.id,
              content: JSON.stringify(result),
            });
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            yield { type: 'tool_result', name: tool.name, result: { error: errorMsg } };
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tool.id,
              content: JSON.stringify({ error: errorMsg }),
              is_error: true,
            });
          }
        }

        // Add tool results to messages
        messages.push({
          role: 'user',
          content: toolResults,
        });

        // Continue the loop for another API call
      } else {
        // end_turn or no more tools — we're done
        continueLoop = false;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown API error';
      yield { type: 'error', message };
      continueLoop = false;
    }
  }

  // Log token usage
  console.log('[GM Agent] Token usage:', totalUsage);
  yield { type: 'done', usage: totalUsage };
}
