import { ICampaign, ISession } from 'src/components/models';
import { db } from './db';

const CLIENT_ID = '933994372207-29ntgiu2evu27u6ae8ii9sk59inbkbqt.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';

let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let accessToken: string | null = null;

const TOKEN_KEY = 'ptolemy-gdrive-token';
const TOKEN_EXPIRY_KEY = 'ptolemy-gdrive-token-expiry';

// --- Auth ---

// Restore token from localStorage on module load
function restoreToken(): void {
  const saved = localStorage.getItem(TOKEN_KEY);
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (saved && expiry && Date.now() < parseInt(expiry)) {
    accessToken = saved;
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
  }
}
restoreToken();

function saveToken(token: string): void {
  accessToken = token;
  // Google tokens expire in ~3600 seconds; store with a small buffer
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + 3500 * 1000));
  localStorage.setItem('ptolemy-gdrive-authed', 'true');
}

function clearToken(): void {
  accessToken = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
}

export function isSignedIn(): boolean {
  return accessToken !== null;
}

export function wasSignedIn(): boolean {
  return localStorage.getItem('ptolemy-gdrive-authed') === 'true';
}

function ensureTokenClient(): google.accounts.oauth2.TokenClient {
  if (!tokenClient) {
    let resolvePromise: (() => void) | null = null;
    let rejectPromise: ((err: Error) => void) | null = null;

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) {
          clearToken();
          if (rejectPromise) rejectPromise(new Error(String(response.error)));
          return;
        }
        saveToken(response.access_token);
        if (resolvePromise) resolvePromise();
      },
      error_callback: (error) => {
        // Silent auth failures (e.g. popup blocked, no prior consent)
        if (rejectPromise) rejectPromise(new Error(error.message || error.type));
      },
    });

    // Expose promise hooks for signIn/trySilentSignIn
    (tokenClient as unknown as Record<string, unknown>)._setPromise = (res: () => void, rej: (err: Error) => void) => {
      resolvePromise = res;
      rejectPromise = rej;
    };
  }
  return tokenClient;
}

export async function signIn(): Promise<void> {
  return new Promise((resolve, reject) => {
    const tc = ensureTokenClient();
    (tc as unknown as Record<string, (res: () => void, rej: (err: Error) => void) => void>)._setPromise(resolve, reject);
    tc.requestAccessToken();
  });
}

export function signOut(): void {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => { /* done */ });
  }
  clearToken();
}

export function loadGisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof google !== 'undefined' && google.accounts) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

// --- File ID cache (avoids re-querying Drive for known files) ---

const fileIdCache = new Map<string, string>();

// --- Drive helpers ---

async function driveRequest(url: string, options: RequestInit = {}): Promise<Response> {
  if (!accessToken) throw new Error('Not signed in to Google Drive');
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  const resp = await fetch(url, { ...options, headers });
  if (resp.status === 401) {
    clearToken();
    throw new Error('Google Drive token expired. Please sign in again.');
  }
  return resp;
}

// Find a file by name in appdata (cached)
async function findFile(name: string): Promise<string | null> {
  const cached = fileIdCache.get(name);
  if (cached) return cached;

  const resp = await driveRequest(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${name}'&fields=files(id)`
  );
  const data = (await resp.json()) as { files: { id: string }[] };
  if (data.files.length > 0) {
    fileIdCache.set(name, data.files[0].id);
    return data.files[0].id;
  }
  return null;
}

// List files matching a prefix (also populates cache)
async function listFiles(prefix: string): Promise<{ id: string; name: string }[]> {
  const resp = await driveRequest(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name contains '${prefix}'&fields=files(id,name)&pageSize=1000`
  );
  const data = (await resp.json()) as { files: { id: string; name: string }[] };
  for (const f of data.files) {
    fileIdCache.set(f.name, f.id);
  }
  return data.files;
}

// Read JSON from a file
async function readFile<T>(fileId: string): Promise<T> {
  const resp = await driveRequest(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
  );
  return (await resp.json()) as T;
}

// Write JSON to an existing file
async function updateFile(fileId: string, data: unknown): Promise<void> {
  await driveRequest(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  );
}

// Create a new JSON file in appdata
async function createFile(name: string, data: unknown): Promise<string> {
  const metadata = { name, parents: ['appDataFolder'] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([JSON.stringify(data)], { type: 'application/json' }));

  const resp = await driveRequest(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    { method: 'POST', body: form }
  );
  const result = (await resp.json()) as { id: string };
  fileIdCache.set(name, result.id);
  return result.id;
}

// Delete a file
async function deleteFile(fileId: string, name?: string): Promise<void> {
  await driveRequest(
    `https://www.googleapis.com/drive/v3/files/${fileId}`,
    { method: 'DELETE' }
  );
  if (name) fileIdCache.delete(name);
}

// --- File naming ---

function campaignFileName(id: string): string {
  return `ptolemy-campaign-${id}.json`;
}

function sessionFileName(campaignId: string, sessionId: string): string {
  return `ptolemy-session-${campaignId}-${sessionId}.json`;
}

// --- Campaign sync (without sessions) ---

// Strip sessions from campaign for lightweight sync
function stripSessions(campaign: ICampaign): ICampaign {
  const copy = JSON.parse(JSON.stringify(campaign)) as ICampaign;
  // Store session metadata (id, name, createdAt) but not chat content
  if (copy.sessions) {
    copy.sessions = copy.sessions.map(s => ({
      id: s.id,
      name: s.name,
      chat: [], // empty — actual chat lives in session files
      createdAt: s.createdAt,
    }));
  }
  delete copy.gmChat;
  return copy;
}

export async function pushCampaign(campaign: ICampaign): Promise<void> {
  const fileName = campaignFileName(campaign.id);
  const stripped = stripSessions(campaign);

  const fileId = await findFile(fileName);
  if (fileId) {
    await updateFile(fileId, stripped);
  } else {
    await createFile(fileName, stripped);
  }

  // Push sessions in parallel
  if (campaign.sessions) {
    const sessionPushes = campaign.sessions
      .filter(s => s.chat.length > 0)
      .map(s => pushSession(campaign.id, s));
    await Promise.all(sessionPushes);
  }
}

// --- Session sync ---

async function pushSession(campaignId: string, session: ISession): Promise<void> {
  const fileName = sessionFileName(campaignId, session.id);
  const fileId = await findFile(fileName);
  if (fileId) {
    await updateFile(fileId, session);
  } else {
    await createFile(fileName, session);
  }
}

async function pullSessions(campaignId: string): Promise<ISession[]> {
  const prefix = `ptolemy-session-${campaignId}`;
  const files = await listFiles(prefix);
  const sessionPromises = files.map(async (file) => {
    try {
      const session = await readFile<ISession>(file.id);
      if (session && session.id) return session;
    } catch (e) {
      console.log(`[Drive] Failed to read session ${file.name}:`, e);
    }
    return null;
  });
  const results = await Promise.all(sessionPromises);
  const sessions = results.filter((s): s is ISession => s !== null);
  return sessions;
}

// --- Full sync ---

export async function sync(): Promise<{ total: number; updated: number; pushed: number }> {
  // List all campaign files
  const files = await listFiles('ptolemy-campaign-');
  const local = await db.campaign.toArray();
  const localMap = new Map(local.map(c => [c.id, c]));
  let updated = 0;
  let pushed = 0;

  // Pull remote campaigns
  const remoteIds = new Set<string>();
  for (const file of files) {
    try {
      const remote = await readFile<ICampaign>(file.id);
      if (!remote || !remote.id) continue;
      remoteIds.add(remote.id);

      const localCampaign = localMap.get(remote.id);
      if (!localCampaign) {
        // New from remote — pull sessions too
        const sessions = await pullSessions(remote.id);
        remote.sessions = sessions.length > 0 ? sessions : remote.sessions;
        await db.campaign.put(remote);
        updated++;
      } else {
        const localTime = localCampaign.lastModified || 0;
        const remoteTime = remote.lastModified || 0;
        if (remoteTime > localTime) {
          // Remote is newer — pull sessions too
          const sessions = await pullSessions(remote.id);
          remote.sessions = sessions.length > 0 ? sessions : remote.sessions;
          await db.campaign.put(remote);
          updated++;
        }
      }
    } catch (e) {
      console.log(`[Drive] Failed to read campaign ${file.name}:`, e);
    }
  }

  // Push local campaigns that are newer or missing from remote
  for (const lc of local) {
    if (!remoteIds.has(lc.id)) {
      await pushCampaign(lc);
      pushed++;
    } else {
      // Check if local is newer
      const file = files.find(f => f.name === campaignFileName(lc.id));
      if (file) {
        const remote = await readFile<ICampaign>(file.id);
        const localTime = lc.lastModified || 0;
        const remoteTime = remote.lastModified || 0;
        if (localTime > remoteTime) {
          await pushCampaign(lc);
          pushed++;
        }
      }
    }
  }

  const total = new Set([...local.map(c => c.id), ...remoteIds]).size;
  return { total, updated, pushed };
}

// --- Delete ---

export async function deleteCampaignFromDrive(id: string): Promise<void> {
  // Delete campaign file
  const cfName = campaignFileName(id);
  const campaignFileId = await findFile(cfName);
  if (campaignFileId) await deleteFile(campaignFileId, cfName);

  // Delete all session files in parallel
  const prefix = `ptolemy-session-${id}`;
  const sessionFiles = await listFiles(prefix);
  await Promise.all(sessionFiles.map(f => deleteFile(f.id, f.name)));
}
