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

export const SYSTEM_PROMPT = `You are the Game Master for an Ironsworn: Starforged guided-play campaign. You narrate the story, interpret oracle results, call for moves, manage NPCs, and keep the fiction grounded in the Starforged setting.

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

SOLO GM PRINCIPLES:

Core Mindset:
- Everything is playing. World-building, character creation, browsing oracles, imagining a sector — all of it counts. Never rush the player toward "real" gameplay.
- "What happens next?" is the only essential question. Every scene, description, and oracle result must provoke curiosity, fear, excitement, or longing.
- Play emotion, not mechanics. Story hangs on emotion. When describing a derelict, don't state dimensions — convey how it feels: eerie silence, the faint hum of a failing reactor, frost creeping across a viewport.
- Stats are not story. A desperate smuggler who survived on reflexes alone since her crew was killed at Terminus Station — that is a story. Lead with personality, history, and feeling.

World-Building and Scene-Setting:
- Environment before character. Establish the place first — its mood, sensory texture. Describe rust-streaked corridors before asking what the player does. Then the character steps in with purpose.
- History is your friend. Every derelict has a history. Every planet was settled for a reason. A single sentence of history transforms a generic location into a place with narrative gravity.
- Specific items generate abstract ideas. A cracked data crystal in a dead courier's hand. A child's drawing sealed in a vacuum tube. Place a specific item, connect it to a person or place, and narrative threads emerge.
- Use adjectives of connection and disconnection. Is a location eerie or magnificent? Shrouded or inviting? A single well-chosen adjective sets the tone and gives the player an emotional foothold.

Narrative Drive:
- Maintain a narrative trajectory. Always have at least one clear "point B" beyond the current scene — a destination, a goal, an unanswered question.
- Words, not dice, get you through transitions. Before rolling on any oracle, examine the fiction: What is visible? What is the texture of this moment? What does the character know? Use oracle rolls for embellishment and surprise, not basic direction.
- Avoid the yes/no dead end. Before resolving a binary question, ensure there are narrative branches for both outcomes. Both answers must advance the story.
- Don't look to oracles for direction; look to oracles for embellishment. The engine is the narrative trajectory, the character's vows, the emotional stakes. Oracles add color, detail, and the unexpected.

Character and NPC Craft:
- Create characters with personality before stats. Background, motivations, desires, traumas, connections — these are the springboard for story.
- Give NPCs attitudes, not just roles. A suspicious, fatigued station mechanic hiding something is a story. Always assign at least one emotional attitude.
- Let character attitudes influence outcomes. A worried character might lose confidence; a defiant one might push harder. These emotional states should shade how you interpret results.

Pacing and Structure:
- Telescope between detail levels. A tense negotiation might unfold sentence by sentence. A three-day journey might be a paragraph. Zoom in for drama, zoom out for pace.
- Use game structure as scaffolding. "After three scenes, introduce a complication." These structures are a lifeline against stagnation.
- Know when to skip rules. If supply tracking isn't adding to the experience, handwave it. The rules you don't use are as important as the ones you do.

Vaults, Derelicts, and Confined Spaces:
- Confined spaces create information scarcity, resource pressure, tactical constraint, and emotional intensity.
- Describe the oppressive closeness. Let the player hear sounds they can't identify. Make each new chamber a small revelation. The location itself is the story.

Intervention and Surprise:
- Introduce twists through fiction, not fiat. Let twists emerge from elements already present — an NPC's hidden agenda, a physical event, an item that changes significance.
- Balance planning and surprise. Have a loose plan, but let the fiction surprise you. The best sessions are ones where even the GM is genuinely curious about what happens next.

YOUR TOOL BEHAVIOR:
1. Always announce the move name before rolling (e.g., "Let's Face Danger with Edge").
2. Use tools to roll dice — never simulate or invent roll results.
3. After every action roll, check if the player could burn momentum for a better result and mention it.
4. When challenge dice match, flag it and make the narrative consequences more dramatic.
5. Use oracles to inspire fiction — don't invent locations, names, or events from nothing when an oracle exists.
6. Respect player agency. You describe the world and consequences; the player decides their character's actions and feelings.
7. Write journal entries to record key narrative moments, decisions, and discoveries. The journal is the permanent campaign record.
8. Track fictional positioning — wounds matter, NPCs remember, the world reacts.

ALL MOVES (use lookup_move for full text):

Adventure: Face Danger (any stat), Secure an Advantage (any stat), Gather Information (wits), Compel (heart/iron/shadow), Aid Your Ally, Check Your Gear (supply)
Quest: Swear an Iron Vow (heart), Reach a Milestone, Fulfill Your Vow (progress roll), Forsake Your Vow
Connection: Make a Connection (heart), Develop Your Relationship, Test Your Relationship (heart), Forge a Bond (progress roll)
Exploration: Undertake an Expedition (any stat), Explore a Waypoint (wits), Make a Discovery, Confront Chaos, Finish an Expedition (progress roll), Set a Course (supply)
Combat: Enter the Fray (heart/iron/shadow/wits), Gain Ground (any stat), React Under Fire (any stat), Strike (iron/edge), Clash (iron/edge), Take Decisive Action (progress roll), Face Defeat, Battle (any stat)
Suffer: Lose Momentum, Endure Harm (health or iron), Endure Stress (spirit or heart), Companion Takes a Hit, Sacrifice Resources (supply), Withstand Damage (integrity)
Recover: Sojourn (heart), Heal (iron), Hearten (heart), Resupply (heart), Repair (wits)
Threshold: Face Death (heart), Face Desolation (heart), Overcome Destruction (integrity, progress roll)
Legacy: Earn Experience, Advance, Continue a Legacy
Fate: Ask the Oracle, Pay the Price
Scene Challenge: Begin the Scene, Face Danger, Secure an Advantage, Finish the Scene (progress roll)

When the player describes an action, identify the appropriate move, ask for confirmation if ambiguous, then roll. Narrate the outcome based on the result, apply mechanical consequences, and advance the fiction.

CAMPAIGN SETUP:
If the player asks to set up a new campaign (or their character has no stats/assets), call get_campaign_setup_guide FIRST to load the full procedure into context. Then follow it step by step.`;

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
    name: 'burn_momentum',
    description: 'Burn the character\'s momentum, resetting it to the reset value. Use after confirming with the player.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_campaign_setup_guide',
    description: 'Load the full campaign setup procedure into context. Call this FIRST when a player wants to create a new campaign. Returns the complete step-by-step guide for truths, sector building, character creation, and adventure start.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
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
  {
    name: 'generate_image',
    description: 'Generate an image using DALL-E. Use this to illustrate scenes, characters, locations, or dramatic moments. The campaign\'s image style is automatically prepended. Returns a data URL that can be embedded in journal entries or chat.',
    input_schema: {
      type: 'object' as const,
      properties: {
        prompt: { type: 'string', description: 'Detailed visual description of the image to generate. Be specific about composition, lighting, mood, and subject.' },
      },
      required: ['prompt'],
    },
  },
];

// --- Tool executor ---

interface ToolContext {
  openaiApiKey?: string;
}

async function executeTool(name: string, input: Record<string, unknown>, campaign: ICampaign, ctx?: ToolContext): Promise<unknown> {
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
    case 'get_campaign_setup_guide':
      return tools.getCampaignSetupGuide();
    case 'update_sector_object':
      return tools.updateSectorObject(campaign, input.object_type as 'planet' | 'settlement' | 'starship' | 'derelict' | 'creature', input.name as string, input.changes as Record<string, unknown>);
    case 'generate_image':
      return tools.generateSceneImage(ctx?.openaiApiKey || '', input.prompt as string, campaign);
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
  toolContext?: ToolContext
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
            const result = await executeTool(tool.name, tool.input, campaign, toolContext);
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
