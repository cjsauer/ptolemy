import Anthropic from '@anthropic-ai/sdk';
import { ICampaign } from 'src/components/models';
import { buildEntitySystemPrompt, EntityRef } from './context-tree';

export interface AgentIntent {
  agent: EntityRef;
  intent: string;
  targets: string[];
  systemPrompt: string;
}

// Collect all entities in the campaign that could have intents
function collectEntities(campaign: ICampaign): EntityRef[] {
  const entities: EntityRef[] = [];

  for (let si = 0; si < campaign.sectors.length; si++) {
    const sector = campaign.sectors[si];
    for (const [cellId, cell] of Object.entries(sector.cells)) {
      cell.npcs.forEach(n => {
        if (n.name) entities.push({ type: 'npc', name: n.name, sectorIndex: si, cellId });
      });
      cell.settlements.forEach(s => {
        if (s.name) entities.push({ type: 'settlement', name: s.name, sectorIndex: si, cellId });
      });
    }
  }

  campaign.factions.forEach(f => {
    if (f.name) entities.push({ type: 'faction', name: f.name });
  });

  return entities;
}

// Ask a single entity what they intend to do
async function getIntent(
  client: Anthropic,
  model: string,
  campaign: ICampaign,
  entity: EntityRef,
  dt: string,
  localContext?: string
): Promise<AgentIntent> {
  const systemPrompt = buildEntitySystemPrompt(campaign, entity.type, entity.name, false);

  let userContent = `Time passes: ${dt}. In a sentence or two, what do you intend to do during this time? Be concrete and specific — not vague aspirations, but actual actions you would take. Only reference people, places, and factions that appear in your context above — do not invent new character names. You can only interact in person with people at your current location. For ${dt}, you cannot travel to other settlements.`;

  if (localContext) {
    userContent = `Here is what is currently happening around you:\n\n${localContext}\n\n${userContent}`;
  }

  const response = await client.messages.create({
    model,
    max_tokens: 512,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: userContent,
    }],
  });

  const text = response.content[0]?.type === 'text' ? response.content[0].text : '';

  // Extract mentioned entity names from the response (simple heuristic)
  const allNames = collectEntityNames(campaign);
  const targets = allNames.filter(n =>
    n.toLowerCase() !== entity.name.toLowerCase() && text.toLowerCase().includes(n.toLowerCase())
  );

  return {
    agent: entity,
    intent: text,
    targets,
    systemPrompt,
  };
}

function collectEntityNames(campaign: ICampaign): string[] {
  const names: string[] = [];
  for (const sector of campaign.sectors) {
    for (const cell of Object.values(sector.cells)) {
      cell.npcs.forEach(n => { if (n.name) names.push(n.name); });
      cell.settlements.forEach(s => { if (s.name) names.push(s.name); });
      cell.ships.forEach(s => { if (s.name) names.push(s.name); });
      cell.derelicts.forEach(d => { if (d.name) names.push(d.name); });
      cell.planets.forEach(p => { if (p.name) names.push(p.name); });
    }
  }
  campaign.factions.forEach(f => { if (f.name) names.push(f.name); });
  if (campaign.character.name) names.push(campaign.character.name);
  if (campaign.character.callsign) names.push(campaign.character.callsign);
  return names;
}

export interface TickOptions {
  apiKey: string;
  model?: string;
  campaign: ICampaign;
  dt: string;
  entityFilter?: (entity: EntityRef) => boolean;
  onStart?: (total: number, entities: EntityRef[]) => void;
  onProgress?: (completed: number, total: number, intent: AgentIntent) => void;
}

export async function worldTick(options: TickOptions): Promise<AgentIntent[]> {
  const { apiKey, campaign, dt, entityFilter, onStart, onProgress } = options;
  const model = options.model || 'claude-sonnet-4-6';

  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  let entities = collectEntities(campaign);
  if (entityFilter) {
    entities = entities.filter(entityFilter);
  }

  const results: AgentIntent[] = [];
  let completed = 0;
  const total = entities.length;

  if (onStart) onStart(total, entities);

  const report = (intent: AgentIntent) => {
    completed++;
    results.push(intent);
    if (onProgress) onProgress(completed, total, intent);
  };

  const handleError = (entity: EntityRef) => (err: unknown) => ({
    agent: entity,
    intent: `[Error: ${err instanceof Error ? err.message : 'Unknown error'}]`,
    targets: [] as string[],
    systemPrompt: '',
  });

  // Phase 1: Factions — sector-wide forces and agendas
  const factionEntities = entities.filter(e => e.type === 'faction');
  const factionPromises = factionEntities.map(entity =>
    getIntent(client, model, campaign, entity, dt)
      .catch(handleError(entity))
      .then(intent => { report(intent); return intent; })
  );
  const factionResults = await Promise.all(factionPromises);

  // Build faction context string for settlements
  const factionContext = factionResults
    .filter(i => i.intent && !i.intent.startsWith('[Error'))
    .map(i => `The faction "${i.agent.name}" is acting: ${i.intent}`)
    .join('\n');

  // Phase 2: Settlements — local atmosphere, pressured by faction activity
  const settlementEntities = entities.filter(e => e.type === 'settlement');
  const settlementPromises = settlementEntities.map(entity =>
    getIntent(client, model, campaign, entity, dt, factionContext || undefined)
      .catch(handleError(entity))
      .then(intent => { report(intent); return intent; })
  );
  const settlementResults = await Promise.all(settlementPromises);

  // Build a map of cellId -> settlement intent for NPC context
  const cellContext = new Map<string, string>();
  for (const intent of settlementResults) {
    if (intent.agent.cellId) {
      cellContext.set(intent.agent.cellId, `Local situation at ${intent.agent.name}: ${intent.intent}`);
    }
  }

  // Phase 3: NPCs and other entities — individuals reacting to local conditions
  const npcEntities = entities.filter(e => e.type !== 'settlement' && e.type !== 'faction');
  const npcPromises = npcEntities.map(entity => {
    let localCtx: string | undefined;
    if (entity.cellId && cellContext.has(entity.cellId)) {
      localCtx = cellContext.get(entity.cellId) as string;
    }

    return getIntent(client, model, campaign, entity, dt, localCtx)
      .catch(handleError(entity))
      .then(intent => { report(intent); return intent; });
  });
  await Promise.all(npcPromises);

  return results;
}
