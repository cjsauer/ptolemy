import { defineStore } from 'pinia';
import { IChatToolCall } from 'src/components/models';
import { TokenUsage } from 'src/lib/gm-agent';

export const useChat = defineStore({
  id: 'chat',

  state() {
    return {
      thinking: false,
      streaming: false,
      streamingText: '',
      streamToolCalls: [] as IChatToolCall[],
      lastUsage: null as TokenUsage | null,
      usageHistory: [] as TokenUsage[],
      inputText: '',
    };
  },
});
