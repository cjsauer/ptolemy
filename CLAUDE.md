# CLAUDE.md

## Project

Ptolemy is an AI-assisted Ironsworn: Starforged solo TTRPG app. Forked from Stargazer. Vue 3 + Quasar + Pinia + Dexie + TypeScript.

## Build & Dev

```bash
yarn            # install deps
quasar dev      # dev server (hot reload)
quasar build    # production build
```

Build output: `dist/spa/`. Deployed to GitHub Pages via Actions on push to `main`.

## Key Commands

- `npx quasar build 2>&1 | grep -E "WARNING|ERROR"` — quick check for build issues
- `git push` — deploys automatically via `.github/workflows/deploy.yml`

## Architecture

### AI Integration — Two Systems

**Creative Companion** (`src/lib/gm-agent.ts`): Chat-based AI that helps with oracle interpretation, NPC voices, and world-building. Does NOT manage rules, dice, or game state. Player handles all mechanics.

**World Tick** (`src/lib/world-tick.ts`): Autonomous world simulation. Three-phase cascade: Factions → Settlements → NPCs. Each entity gets a context-tree prompt built from its location in the data hierarchy.

### Context Tree (`src/lib/context-tree.ts`)

Builds system prompts for entities by walking up the data hierarchy: Forge truths → Sector → Cell (stars, planets, settlements) → Entity. Each level adds context the entity would know. `buildEntitySystemPrompt(campaign, type, name, includePC)`.

### Pinia Stores

| Store | File | Purpose |
|-------|------|---------|
| `campaign` | `src/store/campaign.ts` | Character, journal, vows, sectors, factions, sessions |
| `config` | `src/store/config.ts` | API key, model, current campaign ID, map settings |
| `chat` | `src/store/chat.ts` | Streaming state, tick results, input text (survives tab switches) |
| `assets` | `src/store/assets.ts` | Custom asset cards |
| `oracles` | `src/store/oracles.ts` | Custom oracle tables |

### Data Persistence

- **IndexedDB** (via Dexie) for campaign data, config, snapshots
- **Snapshots** (`src/lib/snapshots.ts`): Full campaign state saved before each AI turn. Used for rewind.
- DB schema v3 includes `snapshots` table

### Sessions (`src/lib/sessions.ts`)

Each campaign has multiple chat sessions. Only the current session's history goes to Claude. Legacy `gmChat` field auto-migrates to Session 0.

## Important Patterns

### Dice use `crypto.getRandomValues()`
All dice and oracle rolls use hardware entropy, not `Math.random()`. See `src/lib/roll.ts` and `src/lib/oracles.ts`.

### Dice animation (`src/lib/dice-animation.ts`)
`animateRoll(target, rolling, randomFn, finalValue)` — reusable tumble animation for all rollers.

### Send to Companion (`src/components/Widgets/SendToCompanionBtn.vue`)
Appends data to `chat.inputText`. Used in Roller, OInput (all oracles), Move, ProgressTrack. Props: `data` (string), `bordered` (bool), `label` (string).

### Moves reference embedded in system prompt
All 56 Starforged moves are generated from dataforged at startup and cached in the system prompt. ~12K tokens, cached via `cache_control: ephemeral`.

### The Creative Companion does NOT:
- Roll dice (player uses Roller widget)
- Manage momentum/health/spirit/supply
- Decide which moves to trigger
- Mark progress or burn momentum

### The Creative Companion DOES:
- Roll oracles and interpret results
- Create/edit world objects (NPCs, settlements, planets, etc.)
- Create clocks and progress tracks (narrative structure)
- Write journal entries
- React to roll results the player shares via Send to Companion

## File Conventions

- Interfaces in `src/components/models.ts`
- Game logic in `src/lib/`
- Vue components organized by feature in `src/components/`
- Pages in `src/pages/`
- No tests (yet)

## Lint Rules

- `@typescript-eslint` strict — no `any`, no unused vars, no inferrable types
- Use `as unknown as T` for necessary type coercions (not `as any`)
- Use `void` prefix for floating promises (e.g. `void nextTick(...)`)

## Style

- Deep space theme: dark navy backgrounds, warm gold accents (`$primary: #a8893c`)
- Font: Teko for headers, OpenSans for body, Convergence for tabs
- CSS variables in `src/css/quasar.variables.scss`
- Global styles in `src/css/app.scss`
