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

export async function pushToGist(token: string, gistId: string): Promise<void> {
  const campaigns = await db.campaign.toArray();
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
  if (!resp.ok) throw new Error(`Failed to push to gist: ${resp.status} ${resp.statusText}`);
}

export async function pullFromGist(token: string, gistId: string): Promise<ICampaign[]> {
  const resp = await fetch(`${GIST_API}/${gistId}`, {
    headers: headers(token),
  });
  if (!resp.ok) throw new Error(`Failed to pull from gist: ${resp.status} ${resp.statusText}`);
  const data = (await resp.json()) as GistResponse;
  const file = data.files[GIST_FILENAME];
  if (!file) throw new Error(`Gist does not contain ${GIST_FILENAME}`);
  return JSON.parse(file.content) as ICampaign[];
}

export async function syncFromGist(token: string, gistId: string): Promise<number> {
  const campaigns = await pullFromGist(token, gistId);
  await db.campaign.bulkPut(campaigns);
  return campaigns.length;
}

export async function getGistMeta(token: string, gistId: string): Promise<{ updatedAt: string }> {
  const resp = await fetch(`${GIST_API}/${gistId}`, {
    method: 'GET',
    headers: headers(token),
  });
  if (!resp.ok) throw new Error(`Failed to fetch gist: ${resp.status} ${resp.statusText}`);
  const data = (await resp.json()) as GistResponse;
  return { updatedAt: data.updated_at };
}
