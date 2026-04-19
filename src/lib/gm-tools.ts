import { ICampaign, IProgressTrack, EAtO, INPC, IFaction, ERegion, ISGAsset, IPlanet, ISettlement, IStarship, IDerelict, ICreature, IStats, IRollData, ECellStatus } from 'src/components/models';
import { moveRoll } from 'src/lib/roll';
import * as oracle from 'src/lib/oracles';
import { Difficulty, NewProgressTrack, NewClock } from 'src/lib/tracks';
import { NewNPC, NewCell, NewPlanet, NewSettlement, NewShip, NewDerelict, NewCreature, NewSector } from 'src/lib/sector';
import { NewFaction } from 'src/lib/campaign';
import { starforged } from 'dataforged';

// Helper: find a progress track by name across vows and progressTracks
function findTrack(campaign: ICampaign, name: string): { track: IProgressTrack; location: string } | null {
  const vowIdx = campaign.character.vows.findIndex((v) => v.name.toLowerCase() === name.toLowerCase());
  if (vowIdx >= 0) return { track: campaign.character.vows[vowIdx], location: `character.vows[${vowIdx}]` };

  const ptIdx = campaign.progressTracks.findIndex((t) => t.name.toLowerCase() === name.toLowerCase());
  if (ptIdx >= 0) return { track: campaign.progressTracks[ptIdx], location: `progressTracks[${ptIdx}]` };

  return null;
}

// Helper: compute progress score (filled boxes out of 10)
function progressScore(track: IProgressTrack): number {
  return track.boxes.filter((b) => b >= 4).length;
}

// Helper: ensure sector cell exists and is marked as a location
function ensureCell(campaign: ICampaign, sectorIndex: number, cellId: string) {
  if (!campaign.sectors[sectorIndex]) throw new Error(`Sector ${sectorIndex} does not exist`);
  if (!campaign.sectors[sectorIndex].cells[cellId]) {
    campaign.sectors[sectorIndex].cells[cellId] = NewCell(cellId);
  }
  campaign.sectors[sectorIndex].cells[cellId].stat = ECellStatus.Location;
}

// Helper: apply non-undefined fields from source onto target
function applyFields<T>(target: T, source: Partial<T>) {
  for (const key of Object.keys(source) as (keyof T)[]) {
    if (source[key] !== undefined) {
      target[key] = source[key] as T[keyof T];
    }
  }
}

// --- Tool implementations ---

export function getGameState(campaign: ICampaign) {
  const char = campaign.character;
  const activeVows = char.vows
    .filter((v) => v.name)
    .map((v) => ({
      name: v.name,
      difficulty: Difficulty[v.difficulty]?.label || 'Unknown',
      progress: progressScore(v),
      notes: v.notes || undefined,
    }));
  const activeTracks = campaign.progressTracks
    .filter((t) => t.name)
    .map((t) => ({
      name: t.name,
      difficulty: Difficulty[t.difficulty]?.label || 'Unknown',
      progress: progressScore(t),
      notes: t.notes || undefined,
    }));
  const activeClocks = char.clocks.map((c) => ({
    name: c.name,
    segments: c.segments,
    filled: c.filled,
    complete: c.filled >= c.segments,
  }));
  const impacts = Object.entries(char.impacts)
    .flatMap(([category, items]) => items.filter((i) => i.marked).map((i) => `${i.name} (${category})`));
  const assets = char.assets.map((a) => ({
    title: a.title,
    type: a.type,
    abilities: a.items.map((item, i) => ({ index: i, text: item.text.substring(0, 80), enabled: item.marked })),
  }));

  const legacies = {
    quests: campaign.character.legacies.quests.boxes.reduce((sum, b) => sum + b.ticks, 0),
    bonds: campaign.character.legacies.bonds.boxes.reduce((sum, b) => sum + b.ticks, 0),
    discoveries: campaign.character.legacies.discoveries.boxes.reduce((sum, b) => sum + b.ticks, 0),
  };

  const sectors = campaign.sectors.map((sector, i) => {
    const cells = Object.entries(sector.cells).map(([cellId, c]) => {
      const cellData: Record<string, unknown> = {};
      if (c.name && c.name !== cellId) cellData.name = c.name;
      if (c.notes) cellData.notes = c.notes;
      if (c.factions?.length) cellData.factions = c.factions;

      if (c.stars?.length) cellData.stars = c.stars.map((s) => ({ name: s.name, description: s.description }));

      if (c.settlements?.length) cellData.settlements = c.settlements.filter((s) => s.name).map((s) => ({
        name: s.name, location: s.location, population: s.population,
        authority: s.authority || undefined, firstLook: s.firstLook || undefined,
        initialContact: s.initialContact || undefined,
        trouble: s.trouble || undefined, projects: s.projects || undefined,
        notes: s.notes || undefined,
      }));

      if (c.npcs?.length) cellData.npcs = c.npcs.filter((n) => n.name).map((n) => ({
        name: n.name, callsign: n.callsign || undefined,
        pronouns: n.pronouns || undefined, role: n.role || undefined,
        disposition: n.disposition || undefined, goal: n.goal || undefined,
        aspect: n.aspect || undefined, firstLook: n.firstLook || undefined,
        bond: n.bond, connection: n.connection, notes: n.notes || undefined,
      }));

      if (c.planets?.length) cellData.planets = c.planets.filter((p) => p.name).map((p) => ({
        name: p.name, type: p.type, atmosphere: p.atmosphere || undefined,
        life: p.life || undefined, description: p.description || undefined,
        observed: p.observed || undefined, feature: p.feature || undefined,
        diversity: p.diversity || undefined, biomes: p.biomes || undefined,
        notes: p.notes || undefined,
      }));

      if (c.ships?.length) cellData.ships = c.ships.filter((s) => s.name).map((s) => ({
        name: s.name, class: s.class || undefined, fleet: s.fleet || undefined,
        initialContact: s.initialContact || undefined, firstLook: s.firstLook || undefined,
        mission: s.mission || undefined, notes: s.notes || undefined,
        faction: s.factionId ? campaign.factions.find((f) => f.id === s.factionId)?.name : undefined,
      }));

      if (c.derelicts?.length) cellData.derelicts = c.derelicts.filter((d) => d.name).map((d) => ({
        name: d.name, type: d.type, location: d.location,
        condition: d.condition || undefined,
        outerFirstLook: d.outerFirstLook || undefined, innerFirstLook: d.innerFirstLook || undefined,
        currentZone: d.currentZone || undefined,
        explore: (d.explore?.area || d.explore?.feature || d.explore?.peril || d.explore?.opportunity) ? d.explore : undefined,
        notes: d.notes || undefined,
      }));

      if (c.creatures?.length) cellData.creatures = c.creatures.filter((cr) => cr.name).map((cr) => ({
        name: cr.name, environment: cr.environment || undefined,
        scale: cr.scale || undefined, form: cr.form || undefined,
        firstLook: cr.firstLook || undefined,
        behaviour: cr.behaviour || undefined, aspect: cr.aspect || undefined,
        notes: cr.notes || undefined,
      }));

      if (c.vaults?.length) cellData.vaults = c.vaults.filter((v) => v.name).map((v) => ({
        name: v.name, location: v.location, scale: v.scale || undefined,
        form: v.form || undefined, shape: v.shape || undefined,
        material: v.material || undefined,
        outerFirstLook: v.outerFirstLook || undefined, innerFirstLook: v.innerFirstLook || undefined,
        purpose: v.purpose || undefined, notes: v.notes || undefined,
      }));

      if (c.sightings?.length) cellData.sightings = c.sightings.filter((s) => s.name).map((s) => ({
        name: s.name, notes: s.notes || undefined,
      }));

      // Only include cells with content
      const hasContent = Object.keys(cellData).length > 0;
      return hasContent ? { cellId, ...cellData } : null;
    }).filter(Boolean);

    return {
      index: i,
      name: sector.name,
      region: sector.region,
      control: sector.control || undefined,
      notes: sector.notes || undefined,
      cells: cells.length > 0 ? cells : undefined,
    };
  });

  const factions = campaign.factions
    .filter((f) => f.name)
    .map((f) => ({
      name: f.name, type: f.type || undefined, influence: f.influence || undefined,
      leadership: f.leadership || undefined, sphere: f.sphere || undefined,
      projects: f.projects || undefined, relationships: f.relationships || undefined,
      quirks: f.quirks || undefined, rumors: f.rumors || undefined,
      notes: f.notes || undefined,
    }));

  return {
    campaignName: campaign.name,
    character: {
      name: char.name,
      pronouns: char.pronouns,
      callsign: char.callsign,
      characteristics: char.characteristics,
      location: char.location,
      gear: char.gear,
      stats: { ...char.stats },
      health: char.tracks.health.value,
      spirit: char.tracks.spirit.value,
      supply: char.tracks.supply.value,
      momentum: char.tracks.momentum.value,
      momentumMax: char.tracks.momentum.max,
      momentumReset: char.tracks.momentum.reset,
      legacies,
      impacts,
      assets,
    },
    vows: activeVows,
    progressTracks: activeTracks,
    clocks: activeClocks,
    truths: Object.keys(campaign.truths).length > 0 ? campaign.truths : undefined,
    sectors,
    factions: factions.length > 0 ? factions : undefined,
  };
}

export function rollAction(
  campaign: ICampaign,
  stat: string,
  adds: number
): { roll: IRollData; stat: string; statValue: number; adds: number; canBurnMomentum: boolean; burnWouldUpgrade: string | null } {
  const char = campaign.character;
  const validStats = ['edge', 'heart', 'iron', 'shadow', 'wits'] as const;
  if (!validStats.includes(stat as typeof validStats[number])) throw new Error(`Unknown stat: ${stat}. Valid: edge, heart, iron, shadow, wits`);
  const statValue = char.stats[stat as keyof IStats];

  const momentum = char.tracks.momentum.value;
  const roll = moveRoll(statValue, adds, momentum);

  // Check momentum burn eligibility
  let canBurnMomentum = false;
  let burnWouldUpgrade: string | null = null;
  if (momentum > 0 && !roll.progress) {
    const d1 = roll.challenge.die1.roll;
    const d2 = roll.challenge.die2.roll;
    if (roll.result === 'Miss' && (momentum > d1 || momentum > d2)) {
      canBurnMomentum = true;
      burnWouldUpgrade = momentum > d1 && momentum > d2 ? 'Strong Hit' : 'Weak Hit';
    } else if (roll.result === 'Weak Hit' && momentum > d1 && momentum > d2) {
      canBurnMomentum = true;
      burnWouldUpgrade = 'Strong Hit';
    }
  }

  return { roll, stat, statValue, adds, canBurnMomentum, burnWouldUpgrade };
}

export function rollProgress(campaign: ICampaign, trackName: string): { roll: IRollData; trackName: string; progressScore: number } {
  const found = findTrack(campaign, trackName);
  if (!found) throw new Error(`Track not found: "${trackName}"`);

  const score = progressScore(found.track);
  const momentum = campaign.character.tracks.momentum.value;
  const roll = moveRoll(0, 0, momentum, score);

  return { roll, trackName, progressScore: score };
}

export function rollOracle(_campaign: ICampaign, oracleId: string): { oracleId: string; result: string } {
  const result = oracle.roll(oracleId);
  return { oracleId, result };
}

export function markProgress(campaign: ICampaign, trackName: string, times = 1): { trackName: string; marksApplied: number; boxes: number[]; progressScore: number } {
  const found = findTrack(campaign, trackName);
  if (!found) throw new Error(`Track not found: "${trackName}"`);

  const track = found.track;
  const ticksPerMark = Difficulty[track.difficulty]?.mark;
  if (ticksPerMark === undefined) throw new Error(`Invalid difficulty: ${track.difficulty}`);

  // Each "mark" adds ticksPerMark ticks. Ticks overflow into boxes (4 ticks = 1 full box).
  // For troublesome: mark=3 means 3 boxes per mark (12 ticks)
  // For dangerous: mark=2 means 2 boxes (8 ticks)
  // For formidable: mark=1 means 1 box (4 ticks)
  // For extreme: mark=0.5 means 2 ticks
  // For epic: mark=0.25 means 1 tick
  const totalTicks = Math.round(ticksPerMark * 4 * times);
  let remaining = totalTicks;

  for (let i = 0; i < track.boxes.length && remaining > 0; i++) {
    const space = 4 - track.boxes[i];
    const add = Math.min(space, remaining);
    track.boxes[i] += add;
    remaining -= add;
  }

  return { trackName, marksApplied: times, boxes: [...track.boxes], progressScore: progressScore(track) };
}

export interface CharacterChanges {
  health?: number;
  spirit?: number;
  supply?: number;
  momentum?: number;
  location?: string;
  gear?: string;
  name?: string;
  pronouns?: string;
  callsign?: string;
  characteristics?: string;
  stats?: Partial<Record<string, number>>;
  impacts?: Record<string, boolean>;
}

export function updateCharacter(
  campaign: ICampaign,
  changes: CharacterChanges
): { applied: Record<string, unknown> } {
  const char = campaign.character;
  const applied: Record<string, unknown> = {};

  if (changes.health !== undefined) {
    char.tracks.health.value = Math.max(char.tracks.health.min, Math.min(char.tracks.health.max, changes.health));
    applied.health = char.tracks.health.value;
  }
  if (changes.spirit !== undefined) {
    char.tracks.spirit.value = Math.max(char.tracks.spirit.min, Math.min(char.tracks.spirit.max, changes.spirit));
    applied.spirit = char.tracks.spirit.value;
  }
  if (changes.supply !== undefined) {
    char.tracks.supply.value = Math.max(char.tracks.supply.min, Math.min(char.tracks.supply.max, changes.supply));
    applied.supply = char.tracks.supply.value;
  }
  if (changes.momentum !== undefined) {
    char.tracks.momentum.value = Math.max(char.tracks.momentum.min, Math.min(char.tracks.momentum.max, changes.momentum));
    applied.momentum = char.tracks.momentum.value;
  }
  if (changes.location !== undefined) {
    char.location = changes.location;
    applied.location = changes.location;
  }
  if (changes.gear !== undefined) {
    char.gear = changes.gear;
    applied.gear = changes.gear;
  }
  if (changes.name !== undefined) {
    char.name = changes.name;
    applied.name = changes.name;
  }
  if (changes.pronouns !== undefined) {
    char.pronouns = changes.pronouns;
    applied.pronouns = changes.pronouns;
  }
  if (changes.callsign !== undefined) {
    char.callsign = changes.callsign;
    applied.callsign = changes.callsign;
  }
  if (changes.characteristics !== undefined) {
    char.characteristics = changes.characteristics;
    applied.characteristics = changes.characteristics;
  }
  if (changes.stats) {
    for (const [key, val] of Object.entries(changes.stats)) {
      const statKey = key as keyof IStats;
      if (val !== undefined && statKey in char.stats) {
        char.stats[statKey] = Math.max(0, Math.min(5, val));
        applied[`stats.${key}`] = char.stats[statKey];
      }
    }
  }
  if (changes.impacts) {
    for (const [impactName, marked] of Object.entries(changes.impacts)) {
      for (const category of Object.values(char.impacts)) {
        const impact = category.find((i) => i.name.toLowerCase() === impactName.toLowerCase());
        if (impact) {
          impact.marked = marked;
          applied[`impact.${impactName}`] = marked;
        }
      }
    }
  }

  return { applied };
}

export function createVow(
  campaign: ICampaign,
  name: string,
  difficulty: number,
  notes?: string
): { name: string; difficulty: string } {
  const track = NewProgressTrack(name);
  track.difficulty = Math.max(1, Math.min(5, difficulty));
  if (notes) track.notes = notes;
  campaign.character.vows.push(track);
  return { name, difficulty: Difficulty[track.difficulty]?.label || 'Unknown' };
}

export function fulfillVow(
  campaign: ICampaign,
  vowName: string,
  outcome: 'fulfilled' | 'forsaken'
): { vowName: string; outcome: string } {
  const idx = campaign.character.vows.findIndex((v) => v.name.toLowerCase() === vowName.toLowerCase());
  if (idx < 0) throw new Error(`Vow not found: "${vowName}"`);
  campaign.character.vows.splice(idx, 1);
  return { vowName, outcome };
}

export function createClock(
  campaign: ICampaign,
  name: string,
  segments: number,
  advance?: string
): { name: string; segments: number } {
  const clock = NewClock();
  clock.name = name;
  clock.segments = [4, 6, 8, 10].includes(segments) ? segments : 4;
  if (advance && Object.values(EAtO).includes(advance as EAtO)) {
    clock.advance = advance as EAtO;
  }
  campaign.character.clocks.push(clock);
  return { name: clock.name, segments: clock.segments };
}

export function advanceClock(
  campaign: ICampaign,
  clockName: string,
  segments = 1
): { clockName: string; filled: number; total: number; complete: boolean } {
  const clock = campaign.character.clocks.find((c) => c.name.toLowerCase() === clockName.toLowerCase());
  if (!clock) throw new Error(`Clock not found: "${clockName}"`);

  clock.filled = Math.min(clock.segments, clock.filled + segments);
  const complete = clock.filled >= clock.segments;
  if (complete) clock.complete = true;

  return { clockName: clock.name, filled: clock.filled, total: clock.segments, complete };
}

export function createProgressTrack(
  campaign: ICampaign,
  name: string,
  difficulty: number,
  notes?: string
): { name: string; difficulty: string } {
  const track = NewProgressTrack(name);
  track.difficulty = Math.max(1, Math.min(5, difficulty));
  if (notes) track.notes = notes;
  campaign.progressTracks.push(track);
  return { name, difficulty: Difficulty[track.difficulty]?.label || 'Unknown' };
}

export function addJournal(
  campaign: ICampaign,
  content: string,
  entryIndex?: number
): { entryIndex: number } {
  const idx = entryIndex ?? 0;
  if (idx < 0 || idx >= campaign.journal.length) throw new Error(`Journal entry ${idx} does not exist`);
  campaign.journal[idx].content += content;
  return { entryIndex: idx };
}

export function createJournalEntry(
  campaign: ICampaign,
  title: string,
  content: string
): { entryIndex: number; title: string } {
  campaign.journal.unshift({ title, content, pinned: false });
  return { entryIndex: 0, title };
}

export function updateJournalEntry(
  campaign: ICampaign,
  entryIndex: number,
  changes: { title?: string; content?: string }
): { entryIndex: number } {
  if (entryIndex < 0 || entryIndex >= campaign.journal.length) throw new Error(`Journal entry ${entryIndex} does not exist`);
  if (changes.title !== undefined) campaign.journal[entryIndex].title = changes.title;
  if (changes.content !== undefined) campaign.journal[entryIndex].content = changes.content;
  return { entryIndex };
}

export function createConnection(
  campaign: ICampaign,
  sectorIndex: number,
  cellId: string,
  data: Partial<INPC> & { name: string }
): { name: string; sectorIndex: number; cellId: string } {
  ensureCell(campaign, sectorIndex, cellId);
  const npc = NewNPC();
  applyFields(npc, data);
  npc.connection = true;
  campaign.sectors[sectorIndex].cells[cellId].npcs.push(npc);
  return { name: npc.name, sectorIndex, cellId };
}

export function updateNpc(
  campaign: ICampaign,
  npcName: string,
  changes: { disposition?: string; notes?: string; bond?: boolean; role?: string; goal?: string }
): { npcName: string; applied: Record<string, unknown> } {
  const applied: Record<string, unknown> = {};
  for (const sector of campaign.sectors) {
    for (const cell of Object.values(sector.cells)) {
      const npc = cell.npcs.find((n) => n.name.toLowerCase() === npcName.toLowerCase());
      if (npc) {
        if (changes.disposition !== undefined) { npc.disposition = changes.disposition; applied.disposition = changes.disposition; }
        if (changes.notes !== undefined) { npc.notes = changes.notes; applied.notes = changes.notes; }
        if (changes.bond !== undefined) { npc.bond = changes.bond; applied.bond = changes.bond; }
        if (changes.role !== undefined) { npc.role = changes.role; applied.role = changes.role; }
        if (changes.goal !== undefined) { npc.goal = changes.goal; applied.goal = changes.goal; }
        return { npcName, applied };
      }
    }
  }
  throw new Error(`NPC not found: "${npcName}"`);
}

export function markLegacy(
  campaign: ICampaign,
  legacyType: 'quests' | 'bonds' | 'discoveries',
  ticks = 1
): { legacyType: string; totalTicks: number } {
  const legacy = campaign.character.legacies[legacyType];
  if (!legacy) throw new Error(`Invalid legacy type: ${legacyType}`);

  let remaining = ticks;
  for (let i = 0; i < legacy.boxes.length && remaining > 0; i++) {
    const space = 4 - legacy.boxes[i].ticks;
    const add = Math.min(space, remaining);
    legacy.boxes[i].ticks += add;
    remaining -= add;
  }

  const totalTicks = legacy.boxes.reduce((sum, b) => sum + b.ticks, 0);
  return { legacyType, totalTicks };
}

export function toggleAssetAbility(
  campaign: ICampaign,
  assetTitle: string,
  abilityIndex: number
): { assetTitle: string; abilityIndex: number; enabled: boolean } {
  const asset = campaign.character.assets.find((a) => a.title.toLowerCase() === assetTitle.toLowerCase());
  if (!asset) throw new Error(`Asset not found: "${assetTitle}"`);
  if (abilityIndex < 0 || abilityIndex >= asset.items.length) throw new Error(`Ability index ${abilityIndex} out of range`);

  asset.items[abilityIndex].marked = !asset.items[abilityIndex].marked;
  return { assetTitle, abilityIndex, enabled: asset.items[abilityIndex].marked };
}

export function addPlanet(
  campaign: ICampaign,
  sectorIndex: number,
  cellId: string,
  data: Partial<IPlanet> & { name: string }
): { name: string } {
  ensureCell(campaign, sectorIndex, cellId);
  const planet = NewPlanet(data.type);
  applyFields(planet, data);
  campaign.sectors[sectorIndex].cells[cellId].planets.push(planet);
  return { name: planet.name };
}

export function addSettlement(
  campaign: ICampaign,
  sectorIndex: number,
  cellId: string,
  data: Partial<ISettlement> & { name: string }
): { name: string } {
  ensureCell(campaign, sectorIndex, cellId);
  const settlement = NewSettlement(data.location);
  applyFields(settlement, data);
  campaign.sectors[sectorIndex].cells[cellId].settlements.push(settlement);
  return { name: settlement.name };
}

export function addStarship(
  campaign: ICampaign,
  sectorIndex: number,
  cellId: string,
  data: Partial<IStarship> & { name: string }
): { name: string } {
  ensureCell(campaign, sectorIndex, cellId);
  const ship = NewShip();
  applyFields(ship, data);
  campaign.sectors[sectorIndex].cells[cellId].ships.push(ship);
  return { name: ship.name };
}

export function addDerelict(
  campaign: ICampaign,
  sectorIndex: number,
  cellId: string,
  data: Partial<IDerelict> & { name: string }
): { name: string } {
  ensureCell(campaign, sectorIndex, cellId);
  const derelict = NewDerelict(data.location, data.type);
  applyFields(derelict, data);
  campaign.sectors[sectorIndex].cells[cellId].derelicts.push(derelict);
  return { name: derelict.name };
}

export function addCreature(
  campaign: ICampaign,
  sectorIndex: number,
  cellId: string,
  data: Partial<ICreature> & { name: string }
): { name: string } {
  ensureCell(campaign, sectorIndex, cellId);
  const creature = NewCreature(data.environment);
  applyFields(creature, data);
  campaign.sectors[sectorIndex].cells[cellId].creatures.push(creature);
  return { name: creature.name };
}

export function updateSectorObject(
  campaign: ICampaign,
  objectType: 'planet' | 'settlement' | 'starship' | 'derelict' | 'creature',
  name: string,
  changes: Record<string, unknown>
): { name: string; applied: Record<string, unknown> } {
  const typeToKey = {
    planet: 'planets',
    settlement: 'settlements',
    starship: 'ships',
    derelict: 'derelicts',
    creature: 'creatures',
  } as const;
  const key = typeToKey[objectType];

  for (const sector of campaign.sectors) {
    for (const cell of Object.values(sector.cells)) {
      const arr = cell[key] as unknown as Record<string, unknown>[];
      const obj = arr.find((o) => (o.name as string || '').toLowerCase() === name.toLowerCase());
      if (obj) {
        const applied: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(changes)) {
          if (v !== undefined && k !== 'name') {
            obj[k] = v;
            applied[k] = v;
          }
        }
        return { name: obj.name as string, applied };
      }
    }
  }
  throw new Error(`${objectType} not found: "${name}"`);
}

export function lookupMove(_campaign: ICampaign, moveId: string): { name: string; text: string; oracles?: string[] } {
  // Search dataforged moves
  for (const category of starforged['Move Categories']) {
    if (category.Moves) {
      for (const move of category.Moves) {
        if (move.$id === moveId || move.Name.toLowerCase() === moveId.toLowerCase()) {
          return {
            name: move.Name,
            text: move.Text || '',
            oracles: move.Oracles,
          };
        }
      }
    }
  }
  throw new Error(`Move not found: "${moveId}"`);
}

export function lookupAsset(_campaign: ICampaign, assetId: string): { name: string; type: string; abilities: string[] } {
  for (const category of starforged['Asset Types']) {
    if (category.Assets) {
      for (const asset of category.Assets) {
        if (asset.$id === assetId || asset.Name.toLowerCase() === assetId.toLowerCase()) {
          return {
            name: asset.Name,
            type: category.Name,
            abilities: asset.Abilities?.map((a) => a.Text || '') || [],
          };
        }
      }
    }
  }
  throw new Error(`Asset not found: "${assetId}"`);
}

// Map truth labels/names to the keys used in campaign.data.truths
const TRUTH_KEY_MAP: Record<string, string> = {
  'cataclysm': 'cataclysm',
  'exodus': 'exodus',
  'communities': 'communities',
  'iron': 'iron',
  'laws': 'laws',
  'religion': 'religion',
  'magic': 'magic',
  'communication and data': 'communication',
  'communication': 'communication',
  'medicine': 'medicine',
  'artificial intelligence': 'ai',
  'ai': 'ai',
  'war': 'war',
  'lifeforms': 'lifeforms',
  'precursors': 'precursors',
  'horrors': 'horrors',
};

function normalizeTruthKey(key: string): string {
  const lower = key.toLowerCase().trim();
  return TRUTH_KEY_MAP[lower] || lower;
}

export function setTruths(
  campaign: ICampaign,
  truths: Record<string, string>
): { set: string[] } {
  const setKeys: string[] = [];
  for (const [key, value] of Object.entries(truths)) {
    const normalizedKey = normalizeTruthKey(key);
    campaign.truths[normalizedKey] = value;
    setKeys.push(normalizedKey);
  }
  return { set: setKeys };
}

export function addAsset(
  campaign: ICampaign,
  assetId: string,
  abilities?: boolean[]
): { name: string; type: string } {
  for (const category of starforged['Asset Types']) {
    if (category.Assets) {
      for (const asset of category.Assets) {
        if (asset.$id === assetId || asset.Name.toLowerCase() === assetId.toLowerCase()) {
          const newAsset: ISGAsset = {
            id: asset.$id,
            title: asset.Name,
            type: category.Name,
            items: (asset.Abilities || []).map((a, i) => ({
              text: a.Text || '',
              marked: abilities ? (abilities[i] ?? false) : i === 0,
            })),
          };
          const condMeter = asset['Condition Meter'];
          if (condMeter) {
            newAsset.track = {
              value: condMeter.Max,
              max: condMeter.Max,
              min: condMeter.Min,
            };
          }
          campaign.character.assets.push(newAsset);
          return { name: asset.Name, type: category.Name };
        }
      }
    }
  }
  throw new Error(`Asset not found: "${assetId}"`);
}

export function createSector(
  campaign: ICampaign,
  name: string,
  region?: string
): { name: string; index: number } {
  const sector = NewSector();
  sector.name = name;
  if (region) sector.region = region as ERegion;
  campaign.sectors.push(sector);
  return { name, index: campaign.sectors.length - 1 };
}

export function createFaction(
  campaign: ICampaign,
  data: Partial<IFaction> & { name: string }
): { name: string } {
  const faction = NewFaction();
  applyFields(faction, data);
  campaign.factions.push(faction);
  return { name: faction.name };
}

export function burnMomentum(campaign: ICampaign): { newMomentum: number; reset: number } {
  const mom = campaign.character.tracks.momentum;
  mom.value = mom.reset;
  return { newMomentum: mom.value, reset: mom.reset };
}

export function getCampaignSetupGuide(): { guide: string } {
  return { guide: `CAMPAIGN SETUP PROCEDURE (adapted from Starforged Chapter 2)

This should feel like a conversation, not a form. Go through each step at a natural pace — don't rush. Let the player make choices and ask questions. The existing UI (Character tab, Sector tab, Challenges tab) updates in real time as you populate data via tools.

Prep is play. Everything the player does here — choosing truths, envisioning locations, naming their ship — IS the game. Don't rush toward "real" gameplay.

=======================================
STEP 1: CHOOSE YOUR TRUTHS
=======================================
Present 14 truth categories one at a time. For each, offer the 3 options from the rulebook or a custom option. The player picks, or you roll. Write results via set_truths tool.

Categories (in order): Cataclysm, Exodus, Communities, Iron, Laws, Religion, Magic, Communication and Data, Medicine, Artificial Intelligence, War, Lifeforms, Precursors, Horrors.

Each truth has 3 options (roughly mapped to dice ranges 1-33, 34-67, 68-100). Present the BOLDED summary of each option. If the player wants details, elaborate. Some truths have subtables — offer those too.

Tips:
- Keep it moving. Read bold summaries first, details on request.
- Each truth includes character prompts (marked with ▲) and suggested assets. Mention these — they'll help character creation later.
- Leave unanswered questions. These become adventure fuel.
- It's fine to skip categories the player doesn't care about.
- Note any quest starters that excite the player — these can seed the adventure.

IMPORTANT: The player may want to customize the setting significantly (e.g., Star Wars, Firefly, etc.). That's great! Adapt the truths to fit their vision. The truths are a starting point, not a constraint.

=======================================
STEP 2: BUILD A STARTING SECTOR
=======================================
Environment before character — let the player see the world before deciding who they are in it.

Step 2a: Choose Starting Region
- Terminus: Settlements common, well-charted routes. Good for social/political stories.
- Outlands: Scattered settlements, uncharted paths. Wild frontier.
- Expanse: Few pioneers, lonely exploration, uncharted space.

Step 2b: Determine Number of Settlements
- Terminus: 4 settlements
- Outlands: 3 settlements
- Expanse: 2 settlements

Step 2c: Generate Settlement Details
For each settlement, roll on oracle tables:
- Settlements/Name
- Settlements/Location (Planetside, Orbital, Deep Space)
- Settlements/Population/{Region} (e.g., Settlements/Population/Terminus)
- Settlements/Authority
- Settlements/Projects (roll 1-2 times)

Write results via add_settlement tool. Use different hex cell IDs (format "h-x-y") to spread them across the sector map. Place related items (planet + its settlement) in the same cell.

Step 2d: Generate Planets
For any planetside or orbital settlement, roll Planets/Class to determine the planet type. Give each planet a name (invent one — planets don't have a name oracle). Roll atmosphere, observed from space, life for the planet type. Write via add_planet tool in the same cell as the settlement.

Step 2e: Generate Stars (Optional)
Roll Space/Stellar_Object for flavor. An unusual star might impact the narrative.

Step 2f: Create Sector Map
Arrange settlements on the hex map using different cell coordinates. Think about which are clustered vs remote.

Step 2g: Create Passages
- Terminus: 3 passages, Outlands: 2, Expanse: 1
Passages are charted routes between settlements. The map handles these visually.

Step 2h: Zoom In on One Settlement
Choose the most interesting settlement and roll additional details:
- Settlements/First_Look (1-2 rolls)
- Settlements/Trouble
If planetside/orbital, also roll planet details: atmosphere, observed from space, planetside features.

Step 2i: Create a Local Connection
This is the player's starting NPC relationship. Use Make a Connection — assume automatic strong hit (no roll needed, it's pre-established).
- Roll Characters/First_Look, Characters/Role, Characters/Goal, Characters/Disposition
- Give them a name (Characters/Name/Given_Name + Family_Name + Callsign)
- Place them at the detailed settlement
- Write via create_connection tool
- Their rank should be troublesome or dangerous

Step 2j: Introduce Sector Trouble
Roll Core/Action + Core/Theme for a sector-wide peril, conflict, or mystery. Or pick from: blockade, pirate activity, resource shortage, faction war, mysterious disappearances, environmental threat, precursor awakening, plague, etc.

Step 2k: Generate Sector Name
Roll Space/Sector_Name/Prefix + Space/Sector_Name/Suffix. Write via create_sector tool.

=======================================
STEP 3: CHARACTER CREATION
=======================================
Now the player knows the world. They create a character shaped by it.

Step 3a: Choose Two Paths
Present path assets by playstyle. Offer the background table for inspiration:
Battlefield Medic (Healer+Veteran), Delegate (Bannersworn+Diplomat), Far Trader (Navigator+Trader), Fugitive Hunter (Armored+Bounty Hunter), Hacker (Infiltrator+Tech), Hotshot Pilot (Ace+Navigator), Interstellar Scout (Explorer+Voidborn), Monster Hunter (Gunner+Slayer), Operative (Infiltrator+Blademaster), Outlaw (Fugitive+Gunslinger), Private Investigator (Brawler+Sleuth), Smuggler (Courier+Scoundrel), Starship Engineer (Gearhead+Tech), Supersoldier (Augmented+Mercenary), Tomb Raider (Scavenger+Scoundrel), etc.

The player can mix and match. Use lookup_asset to show details of interesting options. Add via add_asset tool.

Step 3b: Create Backstory
The character is a person with few ties. What separated them from home? Roll or pick from:
Abandoned kin, guided by vision, haunted by past, running from criminal past, sole survivor, escaped abuse, no memory, rejected duty, banished, denied birthright, always alone, sent on mission, taken away, outgrew origins, wanderlust.

Ask the player to elaborate. Tie to the sector and truths where possible.

Step 3c: Write Background Vow
An epic-rank vow representing a primary motivation. This is pre-sworn (no roll needed). Can be tied to backstory or a deeper goal. Write via create_vow tool with difficulty 5 (Epic).

Roll Core/Action + Core/Theme for inspiration if needed. Also look back at truth quest starters.

Step 3d: Board Your Starship
Take the STARSHIP command vehicle asset (add via add_asset). The player names the ship. Envision its history — how did they get it? Roll or pick: trade, built from scrap, spoils of war, derelict discovery, earned for a promise, found abandoned, granted, inherited, cheap purchase, stolen, fled with it, won in a bet.

Give it a quirk: burn marks, rust, phantom music, fickle gravity, organic growths, rattling hull, exposed cables, hidden weapons, mysterious nav logs, old bloodstain, battle scars, etc.

Step 3e: Choose Final Asset
One more asset from: module (starship upgrade), support vehicle, companion, or path. This gives 3 starting assets + STARSHIP.

Step 3f: Set Stats
Distribute 3, 2, 2, 1, 1 among: Edge (agility, ranged combat), Heart (courage, empathy, social), Iron (strength, melee), Shadow (stealth, deception), Wits (knowledge, perception).

Consider which stats their chosen assets favor. Write via update_character tool.

Step 3g: Set Condition Meters
Health: 5, Spirit: 5, Supply: 5, Momentum: +2, Max Momentum: +10, Momentum Reset: +2.
Set companion health and vehicle integrity to max values.
These are defaults — use update_character tool.

Step 3h: Envision Character
Define 1-2 facts each for: Look, Act, Wear. Keep it simple — discover more through play.
Roll Characters/First_Look for inspiration. Write to characteristics via update_character.

Step 3i: Name Character
Name, pronouns, callsign. Roll Characters/Name/Given_Name + Family_Name + Callsign if needed. The player may prefer to choose. Write via update_character.

Step 3j: Gear Up
Note important equipment. Everyone has a spacer kit (environment suit, flashlights, toolkit, medkit, communicator). Add path-appropriate gear. Write to gear via update_character.

=======================================
STEP 4: BEGIN YOUR ADVENTURE
=======================================

Step 4a: Envision an Inciting Incident
Review everything created so far for adventure hooks:
- Truth quest starters
- Settlement troubles and projects
- Connection's role and goal
- Sector trouble
- Character's backstory and paths
- Background vow

A good inciting incident is: Personal (why does YOUR character care?), Persistent (won't go away), Time-sensitive (ticking clock), Dramatic (worthy of a vow), Limited in scope (don't save the universe yet).

If stuck, roll Core/Action + Core/Theme, or pick from: aid a trapped starship, broker peace, chart new passage, defend settlement, investigate sabotage, escort cargo, rescue mission, infiltrate base, investigate manifestations, liberate prisoners, locate missing person, protect fugitive, recover artifact, rescue crew, retrieve stolen goods, sabotage enemy, search vault, shield lifeform, track beast, transport refugees.

Step 4b: Set the Scene
Two options:
- Prologue: Start calm. Arrive at a settlement. Interact. Then introduce the incident.
- In medias res: Start in the middle of the action. The incident is happening NOW.

Step 4c: Swear an Iron Vow
Make the Swear an Iron Vow move: roll +heart. If sworn to a connection, +1. If bonded, +2.
- Strong hit: Clear path forward. Take +2 momentum.
- Weak hit: More questions than answers. Take +1 momentum.
- Miss: Significant obstacle before the quest can begin.

Give the vow a troublesome or dangerous rank for this first quest. Write via create_vow tool, then roll via roll_action with stat "heart".

The adventure begins!` };
}

