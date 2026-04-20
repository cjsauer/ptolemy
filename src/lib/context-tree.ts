import { ICampaign, ISectorCell, ISector } from 'src/components/models';

// Entity types that can be "talked to"
export type EntityType = 'npc' | 'settlement' | 'planet' | 'derelict' | 'creature' | 'starship' | 'faction' | 'vault';

export interface EntityRef {
  type: EntityType;
  name: string;
  // Location in the tree (resolved by findEntity)
  sectorIndex?: number;
  cellId?: string;
  entityIndex?: number;
}

export interface EntityLocation {
  sector: ISector;
  sectorIndex: number;
  cell?: ISectorCell;
  cellId?: string;
}

interface ContextLayer {
  label: string;
  content: string;
}

// Find where an entity lives in the campaign data
export function findEntity(campaign: ICampaign, type: EntityType, name: string): EntityLocation | null {
  const nameLower = name.toLowerCase();

  if (type === 'faction') {
    // Factions are campaign-level, not in a sector cell
    const faction = campaign.factions.find(f => f.name.toLowerCase() === nameLower);
    if (faction) return { sector: campaign.sectors[0], sectorIndex: 0 };
    return null;
  }

  const typeToKey = {
    npc: 'npcs',
    settlement: 'settlements',
    planet: 'planets',
    derelict: 'derelicts',
    creature: 'creatures',
    starship: 'ships',
    vault: 'vaults',
  } as const;
  const key = typeToKey[type];

  for (let si = 0; si < campaign.sectors.length; si++) {
    const sector = campaign.sectors[si];
    for (const [cellId, cell] of Object.entries(sector.cells)) {
      const arr = cell[key] as { name: string }[];
      if (arr.some(e => e.name.toLowerCase() === nameLower)) {
        return { sector, sectorIndex: si, cell, cellId };
      }
    }
  }
  return null;
}

// Build the context layers for an entity, walking up the tree
export function buildContextTree(campaign: ICampaign, type: EntityType, name: string): ContextLayer[] {
  const layers: ContextLayer[] = [];

  // Layer 1: Forge-wide truths
  if (Object.keys(campaign.truths).length > 0) {
    const truthLines = Object.entries(campaign.truths)
      .map(([key, value]) => `**${key}**: ${value}`)
      .join('\n\n');
    layers.push({
      label: 'Setting Truths',
      content: truthLines,
    });
  }

  // Factions are campaign-level
  if (type === 'faction') {
    const faction = campaign.factions.find(f => f.name.toLowerCase() === name.toLowerCase());
    if (faction) {
      const parts = [
        faction.type && `Type: ${faction.type}`,
        faction.influence && `Influence: ${faction.influence}`,
        faction.leadership && `Leadership: ${faction.leadership}`,
        faction.sphere && `Sphere: ${faction.sphere}`,
        faction.projects && `Projects: ${faction.projects}`,
        faction.relationships && `Relationships: ${faction.relationships}`,
        faction.quirks && `Quirks: ${faction.quirks}`,
        faction.rumors && `Rumors: ${faction.rumors}`,
        faction.notes && `Notes: ${faction.notes}`,
      ].filter(Boolean);
      layers.push({
        label: `Faction: ${faction.name}`,
        content: parts.join('\n'),
      });
    }
    return layers;
  }

  const location = findEntity(campaign, type, name);
  if (!location) return layers;

  // Layer 2: Sector-wide context
  const sector = location.sector;
  const sectorParts = [
    `Region: ${sector.region}`,
    sector.control && `Control: ${sector.control}`,
    sector.notes && `Notes: ${sector.notes}`,
  ].filter(Boolean);

  // Include other settlements/NPCs in the sector as common knowledge, tagged with location
  const sectorEntities: string[] = [];
  for (const [cId, cell] of Object.entries(sector.cells)) {
    const cellLabel = cell.name && cell.name !== cId ? cell.name : cId;
    cell.settlements.forEach(s => sectorEntities.push(`Settlement: ${s.name} (${s.location}, at ${cellLabel}, pop. ${s.population})`));
    cell.npcs.forEach(n => {
      const locName = cell.settlements[0]?.name || cell.name || cellLabel;
      sectorEntities.push(`Known figure: ${n.name}${n.role ? ` — ${n.role}` : ''} (at ${locName})`);
    });
  }
  if (sectorEntities.length > 0) {
    sectorParts.push(`\nKnown in this sector:\n${sectorEntities.join('\n')}`);
    sectorParts.push('\nTravel between settlements in this sector takes days to weeks. You cannot physically meet with anyone outside your current location on short timescales.');
  }

  layers.push({
    label: `Sector: ${sector.name}`,
    content: sectorParts.join('\n'),
  });

  // Layer 3: Cell/location context (everything co-located)
  if (location.cell) {
    const cell = location.cell;
    const cellParts: string[] = [];

    if (cell.notes) cellParts.push(`Location notes: ${cell.notes}`);

    cell.stars.forEach(s => {
      cellParts.push(`Star: ${s.name}. ${s.description}`);
    });

    cell.planets.forEach(p => {
      const pParts = [
        `Planet: ${p.name} (${p.type})`,
        p.atmosphere && `Atmosphere: ${p.atmosphere}`,
        p.life && `Life: ${p.life}`,
        p.observed && `Observed from space: ${p.observed}`,
        p.feature && `Feature: ${p.feature}`,
        p.diversity && `Diversity: ${p.diversity}`,
        p.biomes && `Biomes: ${p.biomes}`,
        p.description && p.description,
        p.notes && p.notes,
      ].filter(Boolean);
      cellParts.push(pParts.join('. '));
    });

    cell.settlements.forEach(s => {
      const sParts = [
        `Settlement: ${s.name} (${s.location}, pop. ${s.population})`,
        s.authority && `Authority: ${s.authority}`,
        s.firstLook && `First look: ${s.firstLook}`,
        s.initialContact && `Initial contact: ${s.initialContact}`,
        s.trouble && `Trouble: ${s.trouble}`,
        s.projects && `Projects: ${s.projects}`,
        s.notes && s.notes,
      ].filter(Boolean);
      cellParts.push(sParts.join('. '));
    });

    // Other NPCs in the same location
    cell.npcs.forEach(n => {
      if (n.name.toLowerCase() !== name.toLowerCase()) {
        const nParts = [
          `Also here: ${n.name}`,
          n.callsign && `"${n.callsign}"`,
          n.role && `(${n.role})`,
          n.disposition && `— ${n.disposition}`,
        ].filter(Boolean);
        cellParts.push(nParts.join(' '));
      }
    });

    cell.derelicts.forEach(d => {
      const dParts = [
        `Derelict: ${d.name} (${d.type}, ${d.location})`,
        d.condition && `Condition: ${d.condition}`,
        d.outerFirstLook && `Outer: ${d.outerFirstLook}`,
        d.notes && d.notes,
      ].filter(Boolean);
      cellParts.push(dParts.join('. '));
    });

    cell.ships.forEach(s => {
      const sParts = [
        `Starship: ${s.name}`,
        s.class && `Class: ${s.class}`,
        s.fleet && `Fleet: ${s.fleet}`,
        s.mission && `Mission: ${s.mission}`,
        s.firstLook && `First look: ${s.firstLook}`,
        s.notes && s.notes,
      ].filter(Boolean);
      cellParts.push(sParts.join('. '));
    });

    cell.creatures.forEach(cr => {
      const cParts = [
        `Creature: ${cr.name} (${cr.environment})`,
        cr.scale && `Scale: ${cr.scale}`,
        cr.form && `Form: ${cr.form}`,
        cr.behaviour && `Behaviour: ${cr.behaviour}`,
        cr.notes && cr.notes,
      ].filter(Boolean);
      cellParts.push(cParts.join('. '));
    });

    cell.vaults.forEach(v => {
      const vParts = [
        `Precursor Vault: ${v.name} (${v.location})`,
        v.scale && `Scale: ${v.scale}`,
        v.form && `Form: ${v.form}`,
        v.shape && `Shape: ${v.shape}`,
        v.material && `Material: ${v.material}`,
        v.purpose && `Purpose: ${v.purpose}`,
        v.outerFirstLook && `Outer: ${v.outerFirstLook}`,
        v.notes && v.notes,
      ].filter(Boolean);
      cellParts.push(vParts.join('. '));
    });

    cell.sightings.forEach(s => {
      cellParts.push(`Sighting: ${s.name}${s.notes ? `. ${s.notes}` : ''}`);
    });

    if (cellParts.length > 0) {
      layers.push({
        label: `Location: ${cell.name || location.cellId || 'Unknown'}`,
        content: cellParts.join('\n'),
      });
    }
  }

  // Layer 4: Entity-specific context
  const entityContent = buildEntityContext(campaign, type, name, location);
  if (entityContent) {
    layers.push({
      label: `${type}: ${name}`,
      content: entityContent,
    });
  }

  return layers;
}

function buildEntityContext(campaign: ICampaign, type: EntityType, name: string, location: EntityLocation): string | null {
  const nameLower = name.toLowerCase();

  if (type === 'npc' && location.cell) {
    const npc = location.cell.npcs.find(n => n.name.toLowerCase() === nameLower);
    if (!npc) return null;
    const parts = [
      npc.callsign && `Callsign: "${npc.callsign}"`,
      npc.pronouns && `Pronouns: ${npc.pronouns}`,
      npc.firstLook && `First look: ${npc.firstLook}`,
      npc.disposition && `Disposition: ${npc.disposition}`,
      npc.role && `Role: ${npc.role}`,
      npc.goal && `Goal: ${npc.goal}`,
      npc.aspect && `Aspect: ${npc.aspect}`,
      npc.connection ? 'Has an established connection with the player character.' : null,
      npc.bond ? 'Has forged a bond with the player character.' : null,
      npc.notes && `Notes: ${npc.notes}`,
    ].filter(Boolean);
    return parts.join('\n');
  }

  if (type === 'settlement' && location.cell) {
    const settlement = location.cell.settlements.find(s => s.name.toLowerCase() === nameLower);
    if (!settlement) return null;
    const parts = [
      `Location: ${settlement.location}`,
      `Population: ${settlement.population}`,
      settlement.authority && `Authority: ${settlement.authority}`,
      settlement.firstLook && `First look: ${settlement.firstLook}`,
      settlement.initialContact && `Initial contact: ${settlement.initialContact}`,
      settlement.trouble && `Trouble: ${settlement.trouble}`,
      settlement.projects && `Projects: ${settlement.projects}`,
      settlement.notes && settlement.notes,
    ].filter(Boolean);
    return parts.join('\n');
  }

  if (type === 'planet' && location.cell) {
    const planet = location.cell.planets.find(p => p.name.toLowerCase() === nameLower);
    if (!planet) return null;
    const parts = [
      `Type: ${planet.type}`,
      planet.atmosphere && `Atmosphere: ${planet.atmosphere}`,
      planet.life && `Life: ${planet.life}`,
      planet.observed && `Observed from space: ${planet.observed}`,
      planet.feature && `Feature: ${planet.feature}`,
      planet.diversity && `Diversity: ${planet.diversity}`,
      planet.biomes && `Biomes: ${planet.biomes}`,
      planet.description && planet.description,
      planet.notes && planet.notes,
    ].filter(Boolean);
    return parts.join('\n');
  }

  if (type === 'derelict' && location.cell) {
    const derelict = location.cell.derelicts.find(d => d.name.toLowerCase() === nameLower);
    if (!derelict) return null;
    const parts = [
      `Type: ${derelict.type}`,
      `Location: ${derelict.location}`,
      derelict.condition && `Condition: ${derelict.condition}`,
      derelict.outerFirstLook && `Outer first look: ${derelict.outerFirstLook}`,
      derelict.innerFirstLook && `Inner first look: ${derelict.innerFirstLook}`,
      derelict.currentZone && `Current zone: ${derelict.currentZone}`,
      derelict.explore?.area && `Area: ${derelict.explore.area}`,
      derelict.explore?.feature && `Feature: ${derelict.explore.feature}`,
      derelict.explore?.peril && `Peril: ${derelict.explore.peril}`,
      derelict.explore?.opportunity && `Opportunity: ${derelict.explore.opportunity}`,
      derelict.notes && derelict.notes,
    ].filter(Boolean);
    return parts.join('\n');
  }

  if (type === 'creature' && location.cell) {
    const creature = location.cell.creatures.find(c => c.name.toLowerCase() === nameLower);
    if (!creature) return null;
    const parts = [
      `Environment: ${creature.environment}`,
      creature.scale && `Scale: ${creature.scale}`,
      creature.form && `Form: ${creature.form}`,
      creature.firstLook && `First look: ${creature.firstLook}`,
      creature.behaviour && `Behaviour: ${creature.behaviour}`,
      creature.aspect && `Aspect: ${creature.aspect}`,
      creature.notes && creature.notes,
    ].filter(Boolean);
    return parts.join('\n');
  }

  if (type === 'starship' && location.cell) {
    const ship = location.cell.ships.find(s => s.name.toLowerCase() === nameLower);
    if (!ship) return null;
    const parts = [
      ship.class && `Class: ${ship.class}`,
      ship.fleet && `Fleet: ${ship.fleet}`,
      ship.initialContact && `Initial contact: ${ship.initialContact}`,
      ship.firstLook && `First look: ${ship.firstLook}`,
      ship.mission && `Mission: ${ship.mission}`,
      ship.factionId && `Faction: ${campaign.factions.find(f => f.id === ship.factionId)?.name || ship.factionId}`,
      ship.notes && ship.notes,
    ].filter(Boolean);
    return parts.join('\n');
  }

  if (type === 'vault' && location.cell) {
    const vault = location.cell.vaults.find(v => v.name.toLowerCase() === nameLower);
    if (!vault) return null;
    const parts = [
      `Location: ${vault.location}`,
      vault.scale && `Scale: ${vault.scale}`,
      vault.form && `Form: ${vault.form}`,
      vault.shape && `Shape: ${vault.shape}`,
      vault.material && `Material: ${vault.material}`,
      vault.outerFirstLook && `Outer first look: ${vault.outerFirstLook}`,
      vault.innerFirstLook && `Inner first look: ${vault.innerFirstLook}`,
      vault.purpose && `Purpose: ${vault.purpose}`,
      vault.interior?.feature && `Interior feature: ${vault.interior.feature}`,
      vault.interior?.peril && `Interior peril: ${vault.interior.peril}`,
      vault.interior?.opportunity && `Interior opportunity: ${vault.interior.opportunity}`,
      vault.sanctum?.feature && `Sanctum feature: ${vault.sanctum.feature}`,
      vault.sanctum?.peril && `Sanctum peril: ${vault.sanctum.peril}`,
      vault.sanctum?.opportunity && `Sanctum opportunity: ${vault.sanctum.opportunity}`,
      vault.notes && vault.notes,
    ].filter(Boolean);
    return parts.join('\n');
  }

  return null;
}

// Assemble a complete system prompt for an entity agent
export function buildEntitySystemPrompt(campaign: ICampaign, type: EntityType, name: string, includePC = true): string {
  const layers = buildContextTree(campaign, type, name);

  if (layers.length === 0) {
    return `You are ${name}. Respond in character.`;
  }

  // Player character summary (only when in conversation, not during world ticks)
  let pcSection = '';
  if (includePC) {
    const pc = campaign.character;
    const pcParts = [
      pc.name && `Name: ${pc.name}`,
      pc.callsign && `Callsign: ${pc.callsign}`,
      pc.pronouns && `Pronouns: ${pc.pronouns}`,
      pc.characteristics && `Appearance: ${pc.characteristics}`,
    ].filter(Boolean);
    pcSection = pcParts.length > 0
      ? `\nThe person you are speaking with:\n${pcParts.join('\n')}`
      : '';
  }

  const roleInstructions = entityRoleInstructions(type, name);

  const contextBlocks = layers.map(l => `<${l.label}>\n${l.content}\n</${l.label}>`).join('\n\n');

  const customPrompt = campaign.customPrompt ? `\n\nAdditional instructions from the player:\n${campaign.customPrompt}` : '';

  return `${roleInstructions}

The following is what you know about the world and your place in it:

${contextBlocks}
${pcSection}${customPrompt}`;
}

function entityRoleInstructions(type: EntityType, name: string): string {
  switch (type) {
    case 'npc':
      return `You are ${name}, a character in this world. Respond in character — speak as yourself, with your own personality, knowledge, goals, and secrets. You do not know anything about game mechanics. You are a person, not a narrator.

Stay true to your disposition and goals. If you are suspicious, be suspicious. If you are hiding something, deflect or lie. If you trust the person you're speaking with, be open.

Keep responses conversational and relatively brief — a few sentences to a short paragraph, like real dialogue.`;

    case 'settlement':
      return `You represent ${name} as a living place. Write a very short scene (3-5 sentences) — a snippet of overheard conversation, a tense exchange between unnamed locals, a public announcement, or a rumor passing between workers. The scene should reflect the settlement's current mood, pressures, and troubles. Write it like a fragment of a screenplay or a radio intercept — raw and immediate. No narration, no scene-setting, just the moment itself.`;

    case 'planet':
      return `You are the world ${name} itself — its landscapes, atmosphere, weather, and dangers. Describe what someone experiences on your surface or in your orbit. You are not a character; you are an environment. Convey sensation: temperature, light, sound, the feel of the ground, the quality of the air.`;

    case 'derelict':
      return `You are ${name}, a derelict wreck. Describe what someone encounters as they explore you — the corridors, the damage, the sounds, the dangers, the remnants of whoever was here before. Build tension through detail. You are dark, broken, and full of secrets.`;

    case 'creature':
      return `You are ${name}, a creature encountered in the wild. You do not speak in words (unless you are an intelligent species). Express yourself through behavior, sounds, body language, and reactions. Convey your nature through action.`;

    case 'starship':
      return `You represent the starship ${name}. Describe the ship's presence, its hails, its behavior. If it has a crew, you may speak as the crew collectively or as a representative voice on comms.`;

    case 'faction':
      return `You represent the faction ${name}. Speak as an institutional voice — a representative, an emissary, a propagandist, or a field agent. Your responses reflect the faction's goals, ideology, and methods. You may be diplomatic, threatening, or deceptive as appropriate to your faction's nature.`;

    case 'vault':
      return `You are ${name}, an ancient precursor vault. You are alien, mysterious, and dangerous. Describe what someone encounters as they explore you — the architecture, the mechanisms, the traps, the wonders. You were built by beings long gone, for purposes that may be incomprehensible. Your interior shifts between awe and dread.`;
  }
}

// Look up an entity by name across all types, return a summary for display
export interface EntitySummary {
  type: EntityType;
  name: string;
  fields: Record<string, string>;
}

export function lookupEntityByName(campaign: ICampaign, name: string): EntitySummary | null {
  const nameLower = name.toLowerCase();

  // Check factions
  for (const f of campaign.factions) {
    if (f.name.toLowerCase() === nameLower) {
      return { type: 'faction', name: f.name, fields: filterEmpty({ type: f.type, influence: f.influence, sphere: f.sphere, projects: f.projects, notes: f.notes }) };
    }
  }

  // Check all cells
  for (const sector of campaign.sectors) {
    for (const cell of Object.values(sector.cells)) {
      for (const n of cell.npcs) {
        if (n.name.toLowerCase() === nameLower) {
          return { type: 'npc', name: n.name, fields: filterEmpty({ callsign: n.callsign, role: n.role, disposition: n.disposition, goal: n.goal, aspect: n.aspect, notes: n.notes }) };
        }
      }
      for (const s of cell.settlements) {
        if (s.name.toLowerCase() === nameLower) {
          return { type: 'settlement', name: s.name, fields: filterEmpty({ location: s.location, population: s.population, authority: s.authority, trouble: s.trouble, projects: s.projects, notes: s.notes }) };
        }
      }
      for (const p of cell.planets) {
        if (p.name.toLowerCase() === nameLower) {
          return { type: 'planet', name: p.name, fields: filterEmpty({ type: p.type, atmosphere: p.atmosphere, life: p.life, description: p.description, notes: p.notes }) };
        }
      }
      for (const d of cell.derelicts) {
        if (d.name.toLowerCase() === nameLower) {
          return { type: 'derelict', name: d.name, fields: filterEmpty({ type: d.type, condition: d.condition, notes: d.notes }) };
        }
      }
      for (const s of cell.ships) {
        if (s.name.toLowerCase() === nameLower) {
          return { type: 'starship', name: s.name, fields: filterEmpty({ class: s.class, mission: s.mission, notes: s.notes }) };
        }
      }
      for (const cr of cell.creatures) {
        if (cr.name.toLowerCase() === nameLower) {
          return { type: 'creature', name: cr.name, fields: filterEmpty({ environment: cr.environment, scale: cr.scale, behaviour: cr.behaviour, notes: cr.notes }) };
        }
      }
      for (const v of cell.vaults) {
        if (v.name.toLowerCase() === nameLower) {
          return { type: 'vault', name: v.name, fields: filterEmpty({ location: v.location, purpose: v.purpose, notes: v.notes }) };
        }
      }
    }
  }

  return null;
}

function filterEmpty(obj: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v) out[k] = v;
  }
  return out;
}
