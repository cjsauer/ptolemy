# Ptolemy

A Claude-assisted Ironsworn: Starforged TTRPG. Forked from [Stargazer](https://github.com/nboughton/stargazer).

Named after Claudius Ptolemy — the most famous stargazer in history, and his first name is literally Claude.

## What It Does

Ptolemy is a solo RPG companion app for Ironsworn: Starforged. It combines traditional TTRPG tools (dice roller, progress tracks, hex sector map, oracle tables, journal) with two AI systems:

- **Creative Companion** — a Claude-powered creative partner for solo play. It aids with the imaginative side of the GM role — interpreting oracle results, voicing NPCs, building world details — while the player retains full control over rules, dice, and pacing. (Full AI rules handling remains an open design challenge; naive attempts have led to frustrating results — hallucinated move rules, incorrect math, and loss of player agency.)
- **World Tick** — an autonomous world simulation that asks every faction, settlement, and NPC what they intend to do, cascading context from macro to local to individual.

## Install & Run

```bash
yarn              # install dependencies
quasar dev        # dev server with hot reload
quasar build      # production build to dist/spa/
```

Deployed automatically to GitHub Pages on push to `main`.

## Configuration

Open the settings dialog (left drawer menu):

- **Anthropic API Key** — BYOK for Claude (Creative Companion + World Tick)
- **Model** — defaults to Claude Sonnet 4.6
- **Campaign Style** — custom prompt instructions appended to all AI prompts (per campaign)

## Tabs

| Tab | What it does |
|-----|-------------|
| **GM** | Chat with the Creative Companion. Roll oracles, send dice results, get narrative interpretation. |
| **World** | World Tick simulation. Run a tick to see what every entity intends to do. |
| **Campaign** | Setting truths, factions. |
| **Character** | Stats, meters, impacts, legacies, assets, gear. |
| **Challenges** | Vows, progress tracks, clocks. |
| **Sector** | Hex map with settlements, NPCs, planets, derelicts, creatures, vaults. |

## Architecture Overview

### Tech Stack

- **Vue 3** — reactive UI framework (composition API)
- **Quasar v2** — Material Design component library
- **Pinia** — state management (shared reactive stores)
- **Dexie** — IndexedDB wrapper (browser-local database)
- **Dataforged** — official Starforged rules data (oracles, moves, assets)
- **@anthropic-ai/sdk** — Claude API client
- **marked** — markdown rendering in chat
- **TypeScript** throughout

### State Management (Pinia Stores)

| Store | File | What it holds |
|-------|------|---------------|
| `campaign` | `src/store/campaign.ts` | Character, journal, vows, sectors, factions, sessions, tick results |
| `config` | `src/store/config.ts` | API key, model, current campaign ID, map config |
| `chat` | `src/store/chat.ts` | Streaming state, tick results, input text (survives tab switches) |
| `assets` | `src/store/assets.ts` | Custom user-created asset cards |
| `oracles` | `src/store/oracles.ts` | Custom user-created oracle tables |

### Data Persistence

IndexedDB via Dexie. Schema v3 with tables: `config`, `campaign`, `assets`, `oracles`, `snapshots`.

Auto-save: campaign state is debounced (3 seconds) and written to IndexedDB on every change.

Snapshots: full campaign state saved before each AI turn. Used for rewind (chat-only or chat + state restore).

### Campaign Data Shape

```
ICampaign {
  id, name
  character: {
    name, pronouns, callsign, characteristics, location, gear
    stats: { edge, heart, iron, shadow, wits }
    tracks: { health, spirit, supply, momentum }
    impacts, legacies, vows, clocks, assets
  }
  progressTracks: IProgressTrack[]
  journal: IJournalEntry[]
  truths: ITruths
  sectors: ISector[] → cells → { settlements, npcs, planets, ships, derelicts, creatures, vaults, sightings }
  factions: IFaction[]
  sessions: ISession[] (each with its own chat history)
  currentSession: string
  customPrompt: string (per-campaign AI instructions)
  lastTickResults: ITickResult (persisted world tick results)
}
```

### AI Systems

**Creative Companion** (`src/lib/gm-agent.ts`):
- System prompt with creative principles + full Starforged moves reference (~12K tokens, cached)
- 19 tools: oracles, journal, world-building, clocks, progress tracks, reference lookups
- Does NOT roll dice or manage game state — player handles all mechanics
- Streams responses token-by-token via Anthropic SDK

**World Tick** (`src/lib/world-tick.ts`):
- Three-phase cascade: Factions → Settlements → NPCs
- Each phase's output feeds into the next as context
- Entity prompts built via context tree (`src/lib/context-tree.ts`)
- Context tree walks the data hierarchy: truths → sector → cell → entity
- Results persist to campaign and survive page refresh

**Send to Companion** (`src/components/Widgets/SendToCompanionBtn.vue`):
- Reusable button that appends data to the chat input
- Present on: dice roller, all oracle inputs, move cards, progress track rolls
- Player adds context and sends when ready

### Dice & Oracles

**Dice** (`src/lib/roll.ts`): All rolls use `crypto.getRandomValues()` for hardware entropy. `moveRoll(attr, adds, momentum, progress?)` handles action rolls and progress rolls.

**Oracles** (`src/lib/oracles.ts`): `roll(id)` takes a dataforged path, finds the table, rolls d100, returns the result. Handles Action+Theme, Descriptor+Focus, and roll-twice cascading.

**Animation** (`src/lib/dice-animation.ts`): `animateRoll()` provides a reusable tumble animation for all rollers.

### UI Layout

```
MainLayout.vue
├── Header (campaign name, dice roller button, edit toggle)
├── Left Drawer (campaign list, import/export, settings)
├── Right Drawer (Oracles, Moves, Journal)
├── Tabs (GM | World | Campaign | Character | Challenges | Sector)
└── Page content (router-view)
```

### Key Source Files

| File | Purpose |
|------|---------|
| `src/App.vue` | Root component, auto-save watcher, initialization |
| `src/layouts/MainLayout.vue` | Header, drawers, tabs, settings dialog |
| `src/lib/gm-agent.ts` | Creative Companion: system prompt, tools, agentic loop |
| `src/lib/gm-tools.ts` | Tool implementations (oracles, world-building, journal) |
| `src/lib/world-tick.ts` | World simulation tick engine |
| `src/lib/context-tree.ts` | Entity context hierarchy for AI prompts |
| `src/lib/sessions.ts` | Chat session management |
| `src/lib/snapshots.ts` | Campaign state snapshots for undo |
| `src/lib/dice-animation.ts` | Reusable dice tumble animation |
| `src/lib/roll.ts` | Dice mechanics |
| `src/lib/oracles.ts` | Oracle lookup and rolling |
| `src/lib/tracks.ts` | Progress track math |
| `src/store/chat.ts` | Chat streaming state (Pinia) |
| `src/components/models.ts` | All TypeScript interfaces |
| `src/components/GmChat/GmChat.vue` | Chat UI with sessions, rewind, debug |
| `src/components/Widgets/Roller.vue` | Dice roller with animation |
| `src/components/Widgets/SendToCompanionBtn.vue` | Send data to chat input |
| `src/pages/WorldTick.vue` | World simulation page |

## Contribution Guidelines

### No breaking changes

Modifications to the data model must be limited to optional props verified where used.

### Write clear and readable code

Include comments where the intent isn't obvious.

### Please go ahead and try to implement multiplayer

Because that would be cool.

### Customize the configuration

See [Configuring quasar.conf.js](https://v2.quasar.dev/quasar-cli/quasar-conf-js).
