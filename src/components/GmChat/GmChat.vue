<template>
  <div class="gm-chat column full-height">
    <!-- Messages -->
    <div ref="messageList" class="col q-pa-md message-list">
      <div v-if="messages.length === 0" class="text-center text-grey q-mt-xl">
        <q-icon name="mdi-compass-rose" size="64px" class="q-mb-md" color="primary" />
        <div class="text-h6 sf-header">Begin your adventure</div>
        <div class="text-caption q-mt-sm q-mb-md">
          Describe what your character does, and the GM will guide the story.
        </div>
        <q-btn
          v-if="isFreshCampaign"
          label="Set up new campaign"
          color="primary"
          outline
          icon="mdi-rocket-launch"
          :disable="thinking"
          @click="startCampaignSetup"
        />
      </div>

      <chat-message v-for="(msg, i) in messages" :key="i" :msg="msg" />

      <!-- Streaming response -->
      <div v-if="streaming" class="chat-message assistant q-my-sm">
        <div class="message-label text-caption text-grey">GM</div>
        <div class="message-body streaming-body">
          <div class="gm-text" v-html="renderedStreaming"></div>
          <tool-card
            v-for="(tc, i) in streamToolCalls"
            :key="i"
            :name="tc.name"
            :result="typeof tc.result === 'string' ? JSON.parse(tc.result) : tc.result"
          />
          <span class="cursor-blink">|</span>
        </div>
      </div>

      <!-- Thinking indicator -->
      <div v-if="thinking && !streaming" class="text-grey q-my-sm q-ml-sm">
        <q-spinner-dots size="24px" color="primary" />
        <span class="q-ml-sm text-caption">The GM is thinking...</span>
      </div>
    </div>

    <!-- Input bar -->
    <div class="input-bar q-pa-sm">
      <q-input
        v-model="input"
        placeholder="What do you do?"
        outlined
        dense
        dark
        autogrow
        :disable="thinking"
        @keydown.enter.exact.prevent="send"
        class="col"
      >
        <template v-slot:after>
          <q-btn
            round
            dense
            flat
            icon="send"
            color="primary"
            :disable="!input.trim() || thinking"
            @click="send"
          />
        </template>
      </q-input>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, nextTick, watch } from 'vue';
import showdown from 'showdown';
import { useCampaign } from 'src/store/campaign';
import { useConfig } from 'src/store/config';
import { IChatMessage, IChatToolCall } from 'src/components/models';
import { runTurn } from 'src/lib/gm-agent';
import ChatMessage from './ChatMessage.vue';
import ToolCard from './ToolCard.vue';

const converter = new showdown.Converter({
  simpleLineBreaks: true,
  openLinksInNewWindow: true,
});

export default defineComponent({
  name: 'GmChat',
  components: { ChatMessage, ToolCard },
  setup() {
    const campaign = useCampaign();
    const config = useConfig();

    const input = ref('');
    const thinking = ref(false);
    const streaming = ref(false);
    const streamingText = ref('');
    const streamToolCalls = ref<IChatToolCall[]>([]);
    const messageList = ref<HTMLElement | null>(null);

    const messages = computed((): IChatMessage[] => {
      return campaign.data.gmChat || [];
    });

    const isFreshCampaign = computed(() => {
      const stats = campaign.data.character.stats;
      const hasStats = stats.edge + stats.heart + stats.iron + stats.shadow + stats.wits > 0;
      const hasAssets = campaign.data.character.assets.length > 0;
      return !hasStats && !hasAssets;
    });

    const startCampaignSetup = () => {
      input.value = "Let's set up a new campaign! Walk me through the Starforged Chapter 2 procedure.";
      void send();
    };

    const renderedStreaming = computed(() => {
      return converter.makeHtml(streamingText.value);
    });

    const scrollToBottom = () => {
      void nextTick(() => {
        if (messageList.value) {
          messageList.value.scrollTop = messageList.value.scrollHeight;
        }
      });
    };

    watch(messages, scrollToBottom, { deep: true });

    const send = async () => {
      const text = input.value.trim();
      if (!text || thinking.value) return;

      const apiKey = config.data.claudeApiKey;
      const model = config.data.claudeModel || 'claude-opus-4-6';

      if (!apiKey) {
        alert('Please set your Anthropic API key in Claude GM Settings (left drawer menu).');
        return;
      }

      // Initialize gmChat if needed
      if (!campaign.data.gmChat) {
        campaign.data.gmChat = [];
      }

      // Add user message
      const userMsg: IChatMessage = {
        role: 'user',
        content: text,
        timestamp: Date.now(),
      };
      campaign.data.gmChat.push(userMsg);
      input.value = '';
      thinking.value = true;
      streamingText.value = '';
      streamToolCalls.value = [];
      scrollToBottom();

      try {
        const generator = runTurn(apiKey, model, campaign.data, text, campaign.data.gmChat.slice(0, -1));

        for await (const event of generator) {
          switch (event.type) {
            case 'text_delta':
              streaming.value = true;
              streamingText.value += event.text;
              scrollToBottom();
              break;
            case 'tool_result':
              streamToolCalls.value.push({
                name: event.name,
                input: {},
                result: event.result as Record<string, unknown>,
              });
              scrollToBottom();
              break;
            case 'error':
              console.error('[GM Agent]', event.message);
              streamingText.value += `\n\n*Error: ${event.message}*`;
              break;
            case 'done':
              if (event.usage) {
                console.log('[GM Agent] Token usage:', event.usage);
              }
              break;
          }
        }

        // Save assistant message
        const assistantMsg: IChatMessage = {
          role: 'assistant',
          content: streamingText.value,
          toolCalls: streamToolCalls.value.length > 0 ? [...streamToolCalls.value] : undefined,
          timestamp: Date.now(),
        };
        campaign.data.gmChat.push(assistantMsg);
      } catch (err) {
        console.error('[GM Agent] Fatal error:', err);
        const errorMsg: IChatMessage = {
          role: 'assistant',
          content: `*An error occurred: ${err instanceof Error ? err.message : 'Unknown error'}*`,
          timestamp: Date.now(),
        };
        campaign.data.gmChat.push(errorMsg);
      } finally {
        thinking.value = false;
        streaming.value = false;
        streamingText.value = '';
        streamToolCalls.value = [];
        scrollToBottom();
      }
    };

    return {
      input,
      thinking,
      streaming,
      streamingText,
      streamToolCalls,
      messages,
      messageList,
      renderedStreaming,
      isFreshCampaign,
      startCampaignSetup,
      send,
    };
  },
});
</script>

<style lang="sass" scoped>
.gm-chat
  height: 100%

.message-list
  overflow-y: auto
  flex: 1

.input-bar
  border-top: 1px solid rgba(200, 164, 92, 0.12)
  background: rgba(12, 14, 24, 0.9)

.streaming-body
  background: rgba(20, 25, 42, 0.9)
  border: 1px solid rgba(200, 164, 92, 0.08)
  border-radius: 12px 12px 12px 0
  padding: 8px 14px

.cursor-blink
  animation: blink 0.8s step-end infinite
  color: $primary
  text-shadow: 0 0 8px rgba(200, 164, 92, 0.6)

@keyframes blink
  0%, 100%
    opacity: 1
  50%
    opacity: 0
</style>
