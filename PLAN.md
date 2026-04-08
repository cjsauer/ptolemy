# Ptolemy — Claude GM Integration Plan

## Vision

Transform Ptolemy from a solo bookkeeping tool into a Claude-assisted guided-play TTRPG. The player types actions in a chat interface, Claude acts as GM — narrating, rolling dice, interpreting oracles, managing NPCs, and updating game state. Everything runs client-side (zero server). User brings their own Anthropic API key.

## Architecture

```
┌─────────────────────────────────────────────┐
│              Browser (Ptolemy)               │
│                                             │
│  Vue/Quasar UI ◄──► Pinia Stores ◄──► Dexie/IndexedDB
│       ▲                  ▲                  │
│       │                  │                  │
│       ▼                  ▼                  │
│  GM Agent ──────► Anthropic JS SDK ────────►│──► api.anthropic.com
│  (tool loop)     (BYOK, browser mode)       │
│       │                                     │
│       ▼                                     │
│  Tools: roll dice, read/write state,        │
│         lookup oracles/moves/assets,        │
│         mark progress, create NPCs          │
└─────────────────────────────────────────────┘
```

- **No server.** The Anthropic JS SDK runs in the browser with `dangerouslyAllowBrowser: true`.
- **IndexedDB is the source of truth.** Claude reads and writes game state through tools that interact with Pinia stores, which auto-persist to IndexedDB.
- **Dataforged** (already an npm dep) provides all oracle tables, moves, assets, encounters.
- **Dice** use `crypto.getRandomValues()` for true RNG in the browser.

---

## Phase 1: BYOK Settings

Add API key configuration to the app.

**Files:**
- `src/components/models.ts` — add `claudeApiKey: string` and `claudeModel: string` to `IConfig`
- `src/store/config.ts` — add defaults for new fields
- `src/lib/db.ts` — bump Dexie schema version if needed
- `src/layouts/MainLayout.vue` — add settings button + dialog in left drawer

**UX:** Settings button in left drawer opens a dialog with API key input (password field), model selector dropdown (Opus 4.6 / Sonnet 4.6 / Haiku 4.5), and a test button that makes a cheap API call to verify the key works.

---

## Phase 2: GM Agent Core

The brain. A TypeScript module that manages the agentic loop: sends messages to Claude with tools, executes tool calls against game state, feeds results back, repeats until Claude finishes.

**New file: `src/lib/gm-agent.ts`**

### System Prompt

Condensed Starforged GM instructions (~4KB). Includes:
- Role definition (you are the GM for Ironsworn: Starforged guided play)
- Key mechanical rules (action rolls, progress tracks, momentum, condition meters)
- Behavioral guardrails (never roll dice yourself, announce moves by name, check momentum burn, flag matches, respect player agency)
- Pacing guidance
- Available tools summary

Does NOT include file paths, curl commands, git conventions, or other Claude Code artifacts.

### Context Window Strategy

Opus 4.6 supports 1M tokens (~750K words). We use that budget simply:

```
System prompt (rules, guardrails, tool docs)     ~4K tokens   ─┐
Full journal (entire campaign narrative)          variable      ├─ cached prefix (cache_control)
Current game state snapshot                       ~1K tokens   ─┘
Conversation history                              variable      ← pruned first if context exceeds limit
Current player action                             small
```

- **Pass the entire journal** in the system prompt. No summarization, no truncation. A campaign would need months of daily play to approach 1M tokens.
- **Use the SDK's automatic caching** (`cache_control: { type: "ephemeral" }` on `messages.create()`). Let it handle placement. Tune later if needed.
- **Log token usage** after each API call: `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens`. Display in browser console and optionally in a dev panel in the UI so we can see cache hit rates and cost per turn during playtesting.
- **If context exceeds 1M**, prune from conversation history (oldest messages first). The journal is the canonical record; conversation is ephemeral.
- **Game state snapshot** injected dynamically each turn: character stats, meters, momentum, impacts, active vows with progress, current location, clocks.

### Tool Definitions

Tools interact with Pinia stores directly (imported inside the module). Each tool reads or writes `useCampaign().data.*` and the auto-save watcher handles persistence.

| Tool | Purpose | Reads/Writes |
|------|---------|--------------|
| `get_game_state` | Consolidated snapshot of character, vows, location | Read campaign store |
| `update_character` | Modify stats, meters, momentum, impacts | Write character fields |
| `roll_action` | Starforged action roll (d6+stat vs 2d10) | Calls `moveRoll()` from `roll.ts` |
| `roll_progress` | Progress roll (boxes vs 2d10) | Calls `moveRoll()` with progress param |
| `roll_oracle` | Roll on any dataforged oracle | Calls `roll()` from `oracles.ts` |
| `mark_progress` | Mark progress on a vow/track by name | Write vow boxes per rank rules |
| `add_journal` | Append narration to the current journal entry | Write journal HTML. Claude auto-writes all narration here; player can edit via Journal tab. Chat is the live workspace, journal is the polished record. |
| `create_vow` | Create new progress track | Push to character.vows |
| `fulfill_vow` | Complete/forsake a vow, update legacy | Remove vow, mark legacy |
| `create_clock` | Create a tension or campaign clock (4/6/8/10 segments) | Push to character.clocks |
| `advance_clock` | Fill segment(s) on a clock, check if filled | Write clock segments, return if clock completed |
| `create_connection` | Add NPC to sector cell with connection flag, role, disposition, goal | Push to sector cell's npcs[] |
| `update_npc` | Modify NPC fields (disposition, notes, bond flag) | Write sector cell NPC |
| `mark_legacy` | Mark ticks/boxes on quests, bonds, or discoveries legacy track | Write character.legacies |
| `toggle_asset_ability` | Unlock an asset ability (when spending XP) | Write character.assets[].abilities |
| `create_progress_track` | Create a non-vow progress track (combat objective, expedition, etc.) | Push to campaign.progressTracks[] |
| `add_planet` | Add a planet to a sector cell (type, atmosphere, life, settlements, etc.) | Push to sector cell's planets[] |
| `add_settlement` | Add a settlement to a sector cell (name, population, authority, trouble, etc.) | Push to sector cell's settlements[] |
| `add_starship` | Add a starship to a sector cell | Push to sector cell's ships[] |
| `add_derelict` | Add a derelict to a sector cell (type, condition, zones) | Push to sector cell's derelicts[] |
| `add_creature` | Add a creature to a sector cell (environment, scale, form, behavior) | Push to sector cell's creatures[] |
| `lookup_move` | Get full move text from dataforged | Read dataforged |
| `lookup_asset` | Get asset details | Read dataforged |
| `lookup_encounter` | Get encounter stats/tactics | Read dataforged |
| `update_location` | Change current location/scene context | Write character.location |

### Agentic Loop

```typescript
async function* runTurn(playerAction: string): AsyncGenerator<AgentEvent> {
  // 1. Build messages: system prompt + conversation history + player action
  // 2. Call client.messages.stream() with tools
  // 3. For each streamed event:
  //    - text_delta → yield to UI for live rendering
  //    - tool_use → execute tool, yield tool result for UI display
  // 4. If stop_reason === "tool_use", feed results back and continue
  // 5. If stop_reason === "end_turn", done
  // 6. Persist conversation history
}
```

### Conversation History

Stored as a new field on the campaign: `campaign.data.gmChat: IChatMessage[]` where:
```typescript
interface IChatMessage {
  role: "user" | "assistant"
  content: string | ContentBlock[]  // Anthropic message format
  timestamp: number
}
```

Keep last ~30 messages in the API conversation. Display history can be longer (stored separately for the UI).

---

## Phase 3: Chat UI

**New file: `src/components/GmChat/GmChat.vue`**

A chat panel integrated into the app layout. Two parts:

### Message List
- Scrollable message list showing the conversation
- Player messages styled differently from GM narration
- Tool calls rendered inline as compact cards:
  - Action rolls: move name, dice breakdown, outcome (Strong Hit / Weak Hit / Miss), match indicator
  - Oracle rolls: table name, d100 value, result
  - Progress marks: vow name, boxes filled
- GM narration rendered as markdown (using existing `showdown` dep)
- Streaming: GM text appears token-by-token with a cursor

### Input Bar
- Text input at the bottom
- Send button (or Enter to submit)
- Disabled while Claude is processing (show "thinking..." indicator)

### Layout Integration

**Option A — New tab:** Add a "Play" tab alongside Campaign/Journal/Character/Challenges/Sector. This is the primary interface when Claude is GM. Clean, full-width, mobile-friendly.

**Option B — Right drawer panel:** Add as an expansion item in the right drawer alongside Oracles/Moves. Always accessible but shares space.

**Recommendation: Option A (new tab).** This is the main event — it deserves full screen real estate. The other tabs become reference/editing views. On mobile, the chat IS the game.

### File changes:
- `src/pages/Play.vue` — new page component
- `src/router/routes.ts` — add `/play` route
- `src/layouts/MainLayout.vue` — add Play tab
- `src/components/GmChat/GmChat.vue` — chat message list + input
- `src/components/GmChat/ChatMessage.vue` — single message renderer
- `src/components/GmChat/ToolCard.vue` — inline tool call display (rolls, oracle results)
- `src/components/models.ts` — add `IChatMessage`, `IChatToolCall` interfaces, add `gmChat` to `ICampaign`

---

## Phase 4: Game State Tools

Make the tools smart about Starforged rules so Claude doesn't have to do arithmetic.

**New file: `src/lib/gm-tools.ts`**

### `mark_progress` implementation
```typescript
function markProgress(trackName: string, campaign: ICampaign): result {
  // Find the track by name in character.vows or progressTracks
  // Look up rank → ticks per mark (troublesome=12, dangerous=8, formidable=4, extreme=2, epic=1)
  // Apply ticks, overflow into boxes
  // Return what changed
}
```

### `roll_action` implementation
```typescript
function rollAction(stat: string, adds: number, campaign: ICampaign): result {
  // Look up stat value from character.stats[stat]
  // Call moveRoll(statValue, adds, momentum)
  // Return full IRollData + momentum burn eligibility
}
```

### `update_character` implementation
```typescript
function updateCharacter(changes: Partial<ICharacter>, campaign: ICampaign): result {
  // Merge changes into campaign.data.character
  // Validate: stats 1-3, meters 0-5, momentum -6 to max
  // Return what changed
}
```

These wrap existing Ptolemy functions (`moveRoll`, `roll`, track math) so the agent gets correct results without manual calculation.

---

## Phase 5: Polish

### Streaming UX
- Token-by-token text rendering with blinking cursor
- Tool calls appear as cards mid-stream
- "Claude is thinking..." indicator while waiting for first token
- Auto-scroll to bottom on new content

### Reactive Integration
- When Claude updates character stats via tool, the Character page reflects it instantly (Pinia reactivity handles this for free)
- When Claude creates a vow, the Challenges page shows it immediately
- When Claude rolls dice, the result appears in the chat and is logged to journal

### Session Resume
- On page load, the chat history loads from `campaign.data.gmChat`
- If there's history, show it; if not, show a welcome message
- The system prompt injects current game state so Claude has context even after a page refresh

### Mobile
- Chat tab should be the default on mobile
- Input bar respects iOS keyboard push
- Message list scrolls correctly with virtual keyboard open

---

## Phase 6: Campaign Setup & Launch Flow

Claude should be able to drive the entire campaign creation process conversationally — not just "Begin Your Adventure" but the full Chapter 2 procedure from the rulebook.

### Campaign Setup Tools

Additional tools for the agent (added to `src/lib/gm-tools.ts`):

| Tool | Purpose | Writes to |
|------|---------|-----------|
| `set_truths` | Write setting truths (Cataclysm, Exodus, Communities, etc.) | `campaign.data.truths` |
| `create_character` | Set name, pronouns, callsign, stats, meters, gear | `campaign.data.character` |
| `add_asset` | Add a dataforged asset to the character (by ID, with ability states) | `campaign.data.character.assets` |
| `create_sector` | Create a new sector with name, region, stellar objects | `campaign.data.sectors` |
| `add_to_sector` | Add a planet, settlement, NPC, derelict, etc. to a sector cell | `campaign.data.sectors[i].cells[id]` |
| `create_faction` | Add a faction with type, influence, projects, relationships | `campaign.data.factions` |
| `set_location` | Update the character's current location | `campaign.data.character.location` |

### Conversational Campaign Creation Flow

When a player creates a new campaign and opens the Play tab with no chat history, Claude walks them through:

**1. Setting Truths** (Chapter 2, p.81)
- Claude presents each truth category, offers the 3 options or a custom option
- Player picks or rolls; Claude writes via `set_truths`

**2. Character Creation** (Chapter 2, p.100)
- Choose 2 paths (Claude browses dataforged assets, presents options by playstyle)
- Create backstory (Claude asks questions, rolls Action+Theme for inspiration)
- Write background vow (epic rank, Claude helps define it)
- Board starship (Claude adds STARSHIP asset, player names the ship)
- Choose final asset (Claude suggests based on paths chosen)
- Set stats (3/2/2/1/1 — Claude explains each stat, player distributes)
- Envision character (Claude rolls first-look oracle, asks player to describe)
- Name character (Claude offers name oracle or player chooses)
- Gear up (Claude suggests spacer kit + path-appropriate gear)
- All written via `create_character` + `add_asset`

**3. Build Starting Sector** (Chapter 2, p.114)
- Generate sector name, stellar objects via `roll_oracle` + `create_sector`
- Generate 1-2 settlements via `roll_oracle` + `add_to_sector`
- Zoom in on starting settlement (details, atmosphere)
- Create a local connection (auto strong hit on Make a Connection) via `create_connection`
- Introduce sector trouble via `roll_oracle`

**4. Begin Your Adventure** (Chapter 2, p.128)
- Claude reviews settlement trouble + connection goal + sector peril
- Suggests an inciting incident (personal, won't go away, ticking clock, limited scope)
- Player and Claude discuss until the incident excites them
- Set the scene (prologue recommended for first campaign)
- Swear an Iron Vow (troublesome or dangerous rank, roll +heart)
- Begin play

The whole flow should feel like a conversation, not a form. Claude asks, player answers, Claude writes state, next question. The existing Ptolemy UI (Character page, Sector page, Challenges page) updates in real time as Claude populates the data via Pinia reactivity.

---

## Implementation Order

| Phase | What | Why first |
|-------|------|-----------|
| 1 | BYOK Settings | Gate: nothing works without an API key |
| 2 | GM Agent Core | Gate: the brain that everything else depends on |
| 3 | Chat UI | Gate: player needs to interact with the agent |
| 4 | Game State Tools | Quality: reduces agent errors, better game mechanics |
| 5 | Polish | UX: streaming, reactivity, mobile |
| 6 | Campaign Launch | Experience: smooth onboarding for new campaigns |

---

## Open Questions

- **Model selection:** Default to Opus 4.6 (1M context). Sonnet 4.6 as a cheaper option. Let the user choose in BYOK settings.
- **Offline fallback:** When there's no API key or no network, the app should still work as vanilla Stargazer (all bookkeeping, oracles, moves — just no Claude GM).
