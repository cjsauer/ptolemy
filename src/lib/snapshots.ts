import { ICampaign } from 'src/components/models';
import { db, ICampaignSnapshot } from './db';

const MAX_SNAPSHOTS = 100;

export async function createSnapshot(campaign: ICampaign, label: string): Promise<number> {
  const snapshot: ICampaignSnapshot = {
    campaignId: campaign.id,
    timestamp: Date.now(),
    label,
    data: JSON.parse(JSON.stringify(campaign)) as ICampaign,
  };

  const id = await db.snapshots.add(snapshot);

  // Prune old snapshots beyond MAX_SNAPSHOTS for this campaign
  const allSnapshots = await db.snapshots
    .where('campaignId')
    .equals(campaign.id)
    .sortBy('timestamp');

  if (allSnapshots.length > MAX_SNAPSHOTS) {
    const toDelete = allSnapshots.slice(0, allSnapshots.length - MAX_SNAPSHOTS);
    await db.snapshots.bulkDelete(toDelete.map((s) => s.id as number));
  }

  return id;
}

export async function listSnapshots(campaignId: string): Promise<ICampaignSnapshot[]> {
  return db.snapshots
    .where('campaignId')
    .equals(campaignId)
    .reverse()
    .sortBy('timestamp');
}

export async function restoreSnapshot(snapshotId: number): Promise<ICampaign | null> {
  const snapshot = await db.snapshots.get(snapshotId);
  if (!snapshot) return null;
  return JSON.parse(JSON.stringify(snapshot.data)) as ICampaign;
}

export async function deleteSnapshot(snapshotId: number): Promise<void> {
  await db.snapshots.delete(snapshotId);
}
