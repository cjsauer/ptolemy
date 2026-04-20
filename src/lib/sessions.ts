import { ICampaign, ISession } from 'src/components/models';
import { v4 as uuid } from 'uuid';

export function ensureSessions(campaign: ICampaign): void {
  if (!campaign.sessions) {
    campaign.sessions = [];
    // Migrate legacy gmChat into first session
    if (campaign.gmChat && campaign.gmChat.length > 0) {
      const migrated: ISession = {
        id: uuid(),
        name: 'Session 1',
        chat: campaign.gmChat,
        createdAt: campaign.gmChat[0]?.timestamp || Date.now(),
      };
      campaign.sessions.push(migrated);
      campaign.currentSession = migrated.id;
      campaign.gmChat = undefined;
    }
  }
}

export function getCurrentSession(campaign: ICampaign): ISession | null {
  ensureSessions(campaign);
  if (!campaign.sessions || campaign.sessions.length === 0) return null;
  return campaign.sessions.find((s) => s.id === campaign.currentSession) || null;
}

export function createSession(campaign: ICampaign, name?: string): ISession {
  ensureSessions(campaign);
  const session: ISession = {
    id: uuid(),
    name: name || `Session ${campaign.sessions?.length || 0}`,
    chat: [],
    createdAt: Date.now(),
  };
  if (!campaign.sessions) campaign.sessions = [];
  campaign.sessions.push(session);
  campaign.currentSession = session.id;
  return session;
}

export function switchSession(campaign: ICampaign, sessionId: string): ISession | null {
  ensureSessions(campaign);
  const session = campaign.sessions?.find((s) => s.id === sessionId);
  if (session) {
    campaign.currentSession = sessionId;
  }
  return session || null;
}
