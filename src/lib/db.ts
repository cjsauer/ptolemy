import { IConfig, ICampaign, ISGAsset, ICustomOracle } from 'components/models';
import Dexie from 'dexie';

export interface ICampaignSnapshot {
  id?: number;
  campaignId: string;
  timestamp: number;
  label: string;
  data: ICampaign;
}

export class StargazerDB extends Dexie {
  config: Dexie.Table<IConfig, number>;
  campaign: Dexie.Table<ICampaign, string>;
  assets: Dexie.Table<ISGAsset, string>;
  oracles: Dexie.Table<ICustomOracle, string>;
  snapshots: Dexie.Table<ICampaignSnapshot, number>;

  constructor() {
    super('StargazerDB');

    this.version(2).stores({
      config: '&id',
      campaign: '&id',
      assets: '&id',
      oracles: '&$id',
    });

    this.version(3).stores({
      config: '&id',
      campaign: '&id',
      assets: '&id',
      oracles: '&$id',
      snapshots: '++id, campaignId, timestamp',
    });

    this.config = this.table('config');
    this.campaign = this.table('campaign');
    this.assets = this.table('assets');
    this.oracles = this.table('oracles');
    this.snapshots = this.table('snapshots');
  }
}

export const db = new StargazerDB();
