import { ICampaign } from 'src/components/models';
import { buildEntitySystemPrompt, EntityRef } from './context-tree';

export interface AgentIntent {
  agent: EntityRef;
  intent: string;
  targets: string[];
  systemPrompt: string;
}

interface OllamaResponse {
  message: { content: string };
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
  ollamaUrl: string,
  model: string,
  campaign: ICampaign,
  entity: EntityRef,
  dt: string
): Promise<AgentIntent> {
  const systemPrompt = buildEntitySystemPrompt(campaign, entity.type, entity.name);

  const resp = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Time passes: ${dt}. In a sentence or two, what do you intend to do during this time? Name any specific people, places, or factions involved. Be concrete and specific — not vague aspirations, but actual actions you would take.` },
      ],
    }),
  });

  if (!resp.ok) {
    throw new Error(`Ollama error: ${resp.status} ${resp.statusText}`);
  }

  const data = (await resp.json()) as OllamaResponse;
  const text = data.message.content;

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
  ollamaUrl?: string;
  model?: string;
  campaign: ICampaign;
  dt: string;
  entityFilter?: (entity: EntityRef) => boolean;
  onProgress?: (completed: number, total: number, intent: AgentIntent) => void;
}

export async function worldTick(options: TickOptions): Promise<AgentIntent[]> {
  const { campaign, dt, entityFilter, onProgress } = options;
  const ollamaUrl = options.ollamaUrl || 'http://localhost:11434';
  const model = options.model || 'gpt-oss:20b';

  let entities = collectEntities(campaign);
  if (entityFilter) {
    entities = entities.filter(entityFilter);
  }

  const results: AgentIntent[] = [];
  let completed = 0;
  const total = entities.length;

  // Run all agents in parallel, report progress as each completes
  const intentPromises = entities.map(entity =>
    getIntent(ollamaUrl, model, campaign, entity, dt)
      .catch(err => ({
        agent: entity,
        intent: `[Error: ${err instanceof Error ? err.message : 'Unknown error'}]`,
        targets: [] as string[],
        systemPrompt: '',
      }))
      .then(intent => {
        completed++;
        results.push(intent);
        if (onProgress) onProgress(completed, total, intent);
        return intent;
      })
  );

  await Promise.all(intentPromises);
  return results;
}
