# Ptolemy

A Claude-assisted Ironsworn: Starforged TTRPG. Forked from [Stargazer](https://github.com/nboughton/stargazer).

Named after Claudius Ptolemy — the most famous stargazer in history, and his first name is literally Claude.

# Contribution Guidelines

## No breaking changes

Modifications to the data model at this point must be limited to optional props which are verified where used to prevent runtime errors.

## Write clear and readable code

Please ensure all code submissions are designed to be as readable as possible and include comments where appropriate to ensure the intent of your code is obvious.

## Please don't try to implement multiplayer

Stargazer is designed as a solo-play app and Oracle dashboard. Pull requests attempting to add multi-player/multi-character will not be merged.

## Install the dependencies

```bash
yarn
```

### Start the app in development mode (hot-code reloading, error reporting, etc.)

```bash
quasar dev
```

### Lint the files

```bash
yarn run lint
```

### Build the app for production

```bash
quasar build
```

### Customize the configuration

See [Configuring quasar.conf.js](https://v2.quasar.dev/quasar-cli/quasar-conf-js).

---

# Architecture Overview

## Tech Stack

- **Vue 3** — reactive UI framework (composition API)
- **Quasar v2** — Material Design component library (buttons, drawers, tabs, dialogs)
- **Pinia** — state management (shared reactive stores)
- **Dexie** — IndexedDB wrapper (browser-local database)
- **Dataforged** — official Starforged rules data (oracles, moves, assets, encounters) as typed JS objects
- **TypeScript** throughout

## How Vue Works (the 30-second version)

Vue components are `.vue` files with three sections: `<template>` (HTML), `<script>` (logic), `<style>`. The key idea is **reactivity** — when you change a variable used in the template, the UI updates automatically.

```typescript
const name = ref("Kael")     // reactive value
name.value = "Wraith"        // template instantly updates everywhere name is used
```

`ref()` makes a value reactive. `computed()` derives values from other reactive sources. `watch()` triggers side effects when values change.

## State Management (Pinia Stores)

A Pinia "store" is a shared reactive object any component can import. Ptolemy has 4:

| Store | File | What it holds |
|-------|------|---------------|
| `campaign` | `src/store/campaign.ts` | The big one: character, journal, vows, sectors, factions |
| `config` | `src/store/config.ts` | App settings: current campaign ID, map config, edit mode |
| `assets` | `src/store/assets.ts` | Custom user-created asset cards |
| `oracles` | `src/store/oracles.ts` | Custom user-created oracle tables |

Any component can do:
```typescript
const campaign = useCampaign()
campaign.data.character.stats.iron = 3  // instantly visible everywhere
```

## Data Persistence (IndexedDB + Dexie)

IndexedDB is a browser-local database (like SQLite in your browser tab). Dexie is a clean wrapper around it. `src/lib/db.ts` creates a `StargazerDB` with 4 tables matching the 4 stores.

The auto-save flow (wired up in `App.vue`):
1. Player changes something (types a name, clicks a stat)
2. Vue reactivity updates the Pinia store instantly
3. A `watch()` on the store fires after 1 second (debounced)
4. Calls `campaign.save()` which JSON-serializes the campaign and writes to IndexedDB
5. On next page load, `campaign.populateStore()` reads it back

## Campaign Data Shape

```
ICampaign {
  id, name
  character: {
    name, pronouns, callsign, location, gear
    stats: { edge, heart, iron, shadow, wits }
    tracks: { health, spirit, supply, momentum } (each: value/max/min)
    impacts: { misfortunes[], lasting[], burdens[], vehicle[] }
    legacies: { quests, bonds, discoveries } (progress tracks)
    vows: IProgressTrack[]
    clocks: IClock[]
    assets: ISGAsset[]
  }
  progressTracks: IProgressTrack[]
  journal: IJournalEntry[] (title + HTML content + pinned flag)
  truths: ITruths
  sectors: ISector[]
  factions: IFaction[]
}
```

## Dice & Oracles

**Dice** (`src/lib/roll.ts`): `moveRoll(attr, adds, momentum, progress?)` rolls d6 + stat + adds vs 2d10 challenge dice. Returns `IRollData` with action score, challenge dice, result string (Strong Hit / Weak Hit / Miss), and match detection.

**Oracles** (`src/lib/oracles.ts`): `roll(id)` takes a dataforged path like `"Starforged/Oracles/Core/Action"`, finds the table in the dataforged npm package, rolls d100, returns the result string. Handles cascading automatically (Action+Theme, Descriptor+Focus, Roll twice).

## UI Layout

```
MainLayout.vue
├── Header (branding, dice roller button, edit toggle)
├── Left Drawer (campaign list, import/export, settings)
├── Right Drawer (Oracles panel, Moves panel, Journal panel)
├── Tabs (Campaign | Journal | Character | Challenges | Sector)
└── Page content (router-view)
```

**Pages** (`src/pages/`): Character.vue (stats, meters, assets), Campaign.vue (truths, factions), Journal.vue, Challenges.vue (vows/progress tracks), Sector.vue (hex map).

**Journal**: Array of `{ title, content, pinned }` entries with rich HTML editor. Roll results are appended as styled HTML via `campaign.appendToJournal(0, html)`.

## Key Source Files

| File | Purpose |
|------|---------|
| `src/App.vue` | Root component, auto-save watchers, initialization |
| `src/layouts/MainLayout.vue` | Header, drawers, tabs, navigation |
| `src/store/campaign.ts` | Campaign Pinia store (load, save, new, export) |
| `src/store/config.ts` | Config store (current campaign, map settings) |
| `src/lib/db.ts` | Dexie IndexedDB setup (StargazerDB) |
| `src/lib/roll.ts` | Dice mechanics (moveRoll, clockRoll) |
| `src/lib/oracles.ts` | Oracle lookup and rolling from dataforged |
| `src/lib/campaign.ts` | New campaign initialization |
| `src/lib/tracks.ts` | Progress track math (difficulty-based marking) |
| `src/components/models.ts` | All TypeScript interfaces (ICampaign, ICharacter, etc.) |
