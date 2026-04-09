import { ICampaign } from 'src/components/models';
import { db } from './db';

const GIST_FILENAME = 'ptolemy-campaigns.json';
const GIST_API = 'https://api.github.com/gists';

interface GistResponse {
  id: string;
  files: Record<string, { content: string }>;
  updated_at: string;
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

async function fetchGistCampaigns(token: string, gistId: string): Promise<ICampaign[]> {
  const resp = await fetch(`${GIST_API}/${gistId}`, {
    headers: headers(token),
  });
  if (!resp.ok) throw new Error(`Failed to fetch gist: ${resp.status} ${resp.statusText}`);
  const data = (await resp.json()) as GistResponse;
  const file = data.files[GIST_FILENAME];
  if (!file) return [];
  return JSON.parse(file.content) as ICampaign[];
}

async function writeGistCampaigns(token: string, gistId: string, campaigns: ICampaign[]): Promise<void> {
  const resp = await fetch(`${GIST_API}/${gistId}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(campaigns, null, 2),
        },
      },
    }),
  });
  if (!resp.ok) throw new Error(`Failed to write gist: ${resp.status} ${resp.statusText}`);
}

// Overwrite gist with current local DB state (used after deletes)
export async function pushAll(token: string, gistId: string): Promise<void> {
  const campaigns = await db.campaign.toArray();
  await writeGistCampaigns(token, gistId, campaigns);
}

// Merge two lists of campaigns. For each campaign ID, keep whichever has the newer lastModified.
// Campaigns that exist only on one side are included as-is.
function mergeCampaigns(local: ICampaign[], remote: ICampaign[]): { merged: ICampaign[]; localWins: number; remoteWins: number; added: number } {
  const remoteMap = new Map(remote.map((c) => [c.id, c]));
  const mergedMap = new Map<string, ICampaign>();
  let localWins = 0;
  let remoteWins = 0;
  let added = 0;

  // Process local campaigns
  for (const lc of local) {
    const rc = remoteMap.get(lc.id);
    if (!rc) {
      // Local only
      mergedMap.set(lc.id, lc);
      added++;
    } else {
      // Both exist — newer wins
      const localTime = lc.lastModified || 0;
      const remoteTime = rc.lastModified || 0;
      if (localTime >= remoteTime) {
        mergedMap.set(lc.id, lc);
        localWins++;
      } else {
        mergedMap.set(lc.id, rc);
        remoteWins++;
      }
      remoteMap.delete(lc.id);
    }
  }

  // Remaining remote-only campaigns
  for (const [id, rc] of remoteMap) {
    mergedMap.set(id, rc);
    added++;
  }

  return { merged: Array.from(mergedMap.values()), localWins, remoteWins, added };
}

export async function createGist(token: string): Promise<string> {
  const campaigns = await db.campaign.toArray();
  const resp = await fetch(GIST_API, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      description: 'Ptolemy Stargazer campaign sync',
      public: false,
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(campaigns, null, 2),
        },
      },
    }),
  });
  if (!resp.ok) throw new Error(`Failed to create gist: ${resp.status} ${resp.statusText}`);
  const data = (await resp.json()) as GistResponse;
  return data.id;
}

export interface SyncResult {
  localWins: number;
  remoteWins: number;
  added: number;
  total: number;
}

// Full bidirectional sync: merge local + remote by newer-wins, write merged result to both gist and local DB.
export async function sync(token: string, gistId: string): Promise<SyncResult> {
  const local = await db.campaign.toArray();
  const remote = await fetchGistCampaigns(token, gistId);
  const { merged, localWins, remoteWins, added } = mergeCampaigns(local, remote);

  // Write merged result to gist
  await writeGistCampaigns(token, gistId, merged);

  // Write merged result to local DB
  await db.campaign.bulkPut(merged);

  return { localWins, remoteWins, added, total: merged.length };
}
