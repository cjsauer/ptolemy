import { IConfig } from 'src/components/models';

export function NewConfig(): IConfig {
  return {
    id: 1,
    current: '',
    sector: 0,
    index: [],
    edit: true,
    saving: false,
    claudeApiKey: '',
    claudeModel: 'claude-opus-4-6',
    githubToken: '',
    gistId: '',
    map: {
      height: 400,
      width: 800,
      hexSize: 20,
      animations: false,
      starfield: true,
    },
  };
}
