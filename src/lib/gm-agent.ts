import Anthropic from '@anthropic-ai/sdk';
import { ICampaign, IChatMessage, INPC, IPlanet, ISettlement, IStarship, IDerelict, ICreature, IFaction } from 'src/components/models';
import * as tools from './gm-tools';

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

export const SYSTEM_PROMPT = `You are a Creative Companion for a solo Ironsworn: Starforged campaign. You are NOT a game master. You are a creative friend sitting at the table — you help interpret oracle results, voice NPCs, build the world, and suggest narrative directions. The player handles all rules, dice, and mechanical state.

WHAT YOU DO:
- Roll on oracle tables and interpret results in the context of the current fiction
- Voice NPCs with personality, attitude, and secrets
- Build world details — settlements, planets, NPCs, factions, derelicts
- Suggest narrative directions, complications, and dramatic questions
- React to roll results the player shares with you (see below)
- Write journal entries when asked
- Create clocks and progress tracks as narrative tension devices
- Look up move rules when the player asks

WHAT YOU DO NOT DO:
- Do NOT decide which moves to trigger — that is the player's decision
- Do NOT roll action dice or progress dice — the player rolls their own
- Do NOT manage momentum, health, spirit, supply, or any meters
- Do NOT mark progress, burn momentum, or toggle asset abilities
- Do NOT tell the player which stat to roll or which move to make
- Do NOT narrate mechanical consequences — only fictional ones

REACTING TO ROLL RESULTS:
The player rolls their own dice and may share results with you. When you see a roll result:
- Use lookup_move to check the move's strong hit / weak hit / miss outcomes if needed
- These outcomes are creative prompts: "you succeed but at a cost" or "you fail and face a new danger"
- Narrate what happens in the FICTION, not the mechanics
- Strong hits: things go well, the fiction advances cleanly
- Weak hits: success with a complication, a cost, or a hard choice
- Misses: new danger, things get worse, Pay the Price
- Matches: amplify the outcome dramatically — bigger wins, harder consequences

CREATIVE PRINCIPLES:

Brevity and Oracles:
- Be terse. No purple prose. No flowery descriptions. Say what needs saying and stop.
- NEVER invent locations, names, events, or details when an oracle exists. Roll the oracle.
- When in doubt, roll an oracle and interpret the result. Oracles are your primary creative tool.
- Do not generate cliché descriptions. No "slightly sweet" air. No "eerie silence broken only by..." No "a chill runs down your spine."

World-Building:
- Environment before character. Establish the place first.
- History matters. Every location was built for a reason. One sentence of history transforms a generic place.
- Specific items generate ideas. A cracked data crystal. A child's drawing in a vacuum tube. Place a specific object, connect it to something, and threads emerge.
- Use adjectives of connection and disconnection. Eerie or magnificent? Shrouded or inviting?

Narrative:
- Maintain a narrative trajectory. Always have a "point B" beyond the current scene.
- Oracles embellish; they don't direct. The engine is the character's vows and emotional stakes.
- Avoid yes/no dead ends. Both outcomes of a question should advance the story.
- Introduce twists through fiction already present, not by fiat.

Character and NPC Craft:
- Give NPCs attitudes, not just roles. A suspicious, fatigued mechanic hiding something — that's a character.
- Let attitudes shape how NPCs respond. A worried NPC hedges; a defiant one pushes back.

Pacing:
- Telescope between detail levels. Zoom in for tense moments, zoom out for travel.
- If the player is setting up a new campaign, help creatively when asked — roll oracles, interpret results, suggest ideas. The player drives the process.`;

// --- Tool definitions for the Anthropic API ---

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
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
    name: 'roll_oracle',
    description: `Roll on a Starforged oracle table. Use full dataforged IDs starting with "Starforged/Oracles/".

Common oracle IDs:
- Core: Core/Action, Core/Theme, Core/Descriptor, Core/Focus
- Characters: Characters/Name/Given_Name, Characters/Name/Family_Name, Characters/Name/Callsign, Characters/First_Look, Characters/Disposition, Characters/Role, Characters/Goal, Characters/Revealed_Aspect
- Space: Space/Sector_Name/Prefix, Space/Sector_Name/Suffix, Space/Stellar_Object, Space/Sighting/Terminus (or Outlands, Expanse)
- Planets: Planets/Class, Planets/{Type}/Atmosphere, Planets/{Type}/Settlements/Terminus, Planets/{Type}/Observed_From_Space, Planets/{Type}/Feature, Planets/{Type}/Life (Types: Desert, Furnace, Grave, Ice, Jovian, Jungle, Ocean, Rocky, Shattered, Tainted, Vital). NOTE: Planets do NOT have a Name oracle — invent planet names or use Core/Action+Core/Theme for inspiration.
- Settlements: Settlements/Name, Settlements/Location, Settlements/Population/Terminus, Settlements/First_Look, Settlements/Authority, Settlements/Projects, Settlements/Trouble
- Starships: Starships/Name, Starships/Type, Starships/Fleet, Starships/Mission/Terminus, Starships/Initial_Contact, Starships/First_Look
- Factions: Factions/Name_Template, Factions/Type, Factions/Influence, Factions/Sphere, Factions/Projects, Factions/Relationships, Factions/Quirks, Factions/Rumors
- Creatures: Creatures/Environment, Creatures/Scale, Creatures/Ultra-scale, Creatures/Basic_Form/{Env}, Creatures/First_Look, Creatures/Encountered_Behavior, Creatures/Revealed_Aspect
- Derelicts: Derelicts/Location, Derelicts/Type/{Location}, Derelicts/Condition, Derelicts/Outer_First_Look, Derelicts/Inner_First_Look, Derelicts/{Zone}/Area, Derelicts/{Zone}/Feature, Derelicts/{Zone}/Peril, Derelicts/{Zone}/Opportunity
- Moves: Moves/Ask_the_Oracle/{Likelihood}, Moves/Pay_the_Price`,
    input_schema: {
      type: 'object' as const,
      properties: {
        oracle_id: { type: 'string', description: 'Full dataforged oracle ID, e.g. "Starforged/Oracles/Core/Action". Always prefix with "Starforged/Oracles/".' },
      },
      required: ['oracle_id'],
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
    description: 'Append HTML content to an existing journal entry. Use this to add to an entry incrementally.',
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
    name: 'create_journal_entry',
    description: 'Create a new journal entry with a title and content. Use this to start a new entry (e.g. for a new session, a new chapter, or a major event). New entries appear at the top of the journal.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Entry title' },
        content: { type: 'string', description: 'HTML content' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'update_journal_entry',
    description: 'Replace the title or content of an existing journal entry. Use this to correct or rewrite an entry instead of appending.',
    input_schema: {
      type: 'object' as const,
      properties: {
        entry_index: { type: 'number', description: 'Journal entry index' },
        title: { type: 'string', description: 'New title (optional)' },
        content: { type: 'string', description: 'New content — replaces existing content entirely (optional)' },
      },
      required: ['entry_index'],
    },
  },
  {
    name: 'create_connection',
    description: 'Add an NPC connection to a sector cell.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sector_index: { type: 'number', description: 'Sector index' },
        cell_id: { type: 'string', description: 'Hex grid cell ID in format "h-{x}-{y}" (e.g. "h-5-3"). Place related items in the same cell. Use different cells to spread locations across the sector map.' },
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
    name: 'add_planet',
    description: 'Add a planet to a sector cell.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sector_index: { type: 'number' },
        cell_id: { type: 'string', description: 'Hex cell ID, format "h-{x}-{y}"' },
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
        cell_id: { type: 'string', description: 'Hex cell ID, format "h-{x}-{y}"' },
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
        cell_id: { type: 'string', description: 'Hex cell ID, format "h-{x}-{y}"' },
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
        cell_id: { type: 'string', description: 'Hex cell ID, format "h-{x}-{y}"' },
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
        cell_id: { type: 'string', description: 'Hex cell ID, format "h-{x}-{y}"' },
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
    name: 'update_sector_object',
    description: 'Update fields on an existing planet, settlement, starship, derelict, or creature by name. Use this instead of add_ when the object already exists. Searches all sectors.',
    input_schema: {
      type: 'object' as const,
      properties: {
        object_type: { type: 'string', enum: ['planet', 'settlement', 'starship', 'derelict', 'creature'], description: 'Type of object to update' },
        name: { type: 'string', description: 'Name of the object to find' },
        changes: { type: 'object', description: 'Fields to update, e.g. {"atmosphere": "Toxic", "notes": "Volcanic activity"}', additionalProperties: true },
      },
      required: ['object_type', 'name', 'changes'],
    },
  },
];

// --- Tool executor ---

// eslint-disable-next-line @typescript-eslint/require-await
async function executeTool(name: string, input: Record<string, unknown>, campaign: ICampaign): Promise<unknown> {
  switch (name) {
    case 'get_game_state':
      return tools.getGameState(campaign);
    case 'roll_oracle':
      return tools.rollOracle(campaign, input.oracle_id as string);
    case 'create_clock':
      return tools.createClock(campaign, input.name as string, input.segments as number, input.advance as string);
    case 'create_progress_track':
      return tools.createProgressTrack(campaign, input.name as string, input.difficulty as number, input.notes as string);
    case 'add_journal':
      return tools.addJournal(campaign, input.content as string, input.entry_index as number);
    case 'create_journal_entry':
      return tools.createJournalEntry(campaign, input.title as string, input.content as string);
    case 'update_journal_entry':
      return tools.updateJournalEntry(campaign, input.entry_index as number, { title: input.title as string, content: input.content as string });
    case 'create_connection': {
      const { sector_index, cell_id, ...npcData } = input;
      return tools.createConnection(campaign, sector_index as number, cell_id as string, npcData as Partial<INPC> & { name: string });
    }
    case 'update_npc':
      return tools.updateNpc(campaign, input.npc_name as string, input as Partial<INPC>);
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
    case 'update_sector_object':
      return tools.updateSectorObject(campaign, input.object_type as 'planet' | 'settlement' | 'starship' | 'derelict' | 'creature', input.name as string, input.changes as Record<string, unknown>);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// --- Build game state context block ---

export function buildGameStateContext(campaign: ICampaign): string {
  const state = tools.getGameState(campaign);
  return `<game_state>
${JSON.stringify(state, null, 2)}
</game_state>`;
}

// --- Build journal context ---

export function buildJournalContext(campaign: ICampaign): string {
  if (!campaign.journal || campaign.journal.length === 0) return '';

  const journalText = campaign.journal
    .map((entry, i) => `--- Entry ${i}: ${entry.title} ${entry.pinned ? '[PINNED]' : ''} ---\n${entry.content}`)
    .join('\n\n');

  return `<journal>\n${journalText}\n</journal>`;
}

// --- Convert chat history to Anthropic message format ---

// Strip base64 data URLs from content to avoid sending megabytes of image data to Claude
function stripDataUrls(content: string): string {
  return content.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[generated image]');
}

function buildMessages(
  chatHistory: IChatMessage[],
  playerAction: string
): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];

  for (const msg of chatHistory) {
    const content = typeof msg.content === 'string' ? stripDataUrls(msg.content) : msg.content;
    messages.push({
      role: msg.role,
      content,
    });
  }

  // Add current player action
  messages.push({
    role: 'user',
    content: playerAction,
  });

  return messages;
}

// --- Prompt builder (single source of truth for what Claude sees) ---

export interface BuiltPrompt {
  system: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
}

export function buildPrompt(
  campaign: ICampaign,
  playerAction: string,
  chatHistory: IChatMessage[]
): BuiltPrompt {
  const journalContext = buildJournalContext(campaign);
  const gameStateContext = buildGameStateContext(campaign);

  const system: Anthropic.TextBlockParam[] = [
    {
      type: 'text',
      text: SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    },
  ];

  if (journalContext) {
    system.push({
      type: 'text',
      text: journalContext,
      cache_control: { type: 'ephemeral' },
    });
  }

  system.push({
    type: 'text',
    text: gameStateContext,
  });

  if (campaign.customPrompt) {
    system.push({
      type: 'text',
      text: `<player_instructions>\n${campaign.customPrompt}\n</player_instructions>`,
    });
  }

  const messages = buildMessages(chatHistory, playerAction);

  return { system, messages, tools: TOOL_DEFINITIONS };
}

// --- Main agentic loop ---

export async function* runTurn(
  apiKey: string,
  model: string,
  campaign: ICampaign,
  playerAction: string,
  chatHistory: IChatMessage[],
  abortSignal?: AbortSignal,
): AsyncGenerator<AgentEvent> {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  const { system: systemContent, messages, tools } = buildPrompt(campaign, playerAction, chatHistory);

  const totalUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
  };

  // Agentic loop: keep going until Claude stops calling tools
  let continueLoop = true;
  while (continueLoop) {
    if (abortSignal?.aborted) break;

    try {
      const stream = client.messages.stream({
        model,
        max_tokens: 4096,
        system: systemContent,
        messages,
        tools,
      });

      const toolUses: { id: string; name: string; input: Record<string, unknown> }[] = [];

      // Stream events as they arrive
      for await (const event of stream) {
        if (abortSignal?.aborted) {
          stream.abort();
          break;
        }
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield { type: 'text_delta', text: event.delta.text };
          }
          // tool input JSON deltas are accumulated by the SDK automatically
        } else if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            yield { type: 'tool_use_start', name: event.content_block.name, id: event.content_block.id };
          }
        }
      }

      // Get the final assembled message (tool inputs are now complete)
      const response = await stream.finalMessage();

      // Track usage
      if (response.usage) {
        totalUsage.inputTokens += response.usage.input_tokens;
        totalUsage.outputTokens += response.usage.output_tokens;
        const usage = response.usage as unknown as Record<string, number>;
        totalUsage.cacheCreationTokens += usage['cache_creation_input_tokens'] || 0;
        totalUsage.cacheReadTokens += usage['cache_read_input_tokens'] || 0;
      }

      // Collect completed tool_use blocks from the final message
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          toolUses.push({
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          });
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
            const result = await executeTool(tool.name, tool.input, campaign);
            yield { type: 'tool_result', name: tool.name, result };
            // Strip image data from tool results sent back to Claude
            const resultForClaude = stripDataUrls(JSON.stringify(result));
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tool.id,
              content: resultForClaude,
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

        // Emit a separator so text from the next API call doesn't smash into the previous text
        yield { type: 'text_delta', text: '\n\n' };

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
