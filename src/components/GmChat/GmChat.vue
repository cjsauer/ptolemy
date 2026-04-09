<template>
  <div class="gm-chat">
    <!-- Session bar -->
    <div class="session-bar row items-center no-wrap q-px-sm q-py-xs">
      <q-btn-dropdown flat dense no-caps :label="currentSession?.name || 'No session'" size="sm" color="primary" class="session-dropdown">
        <q-list dense>
          <q-item
            v-for="s in sessions"
            :key="s.id"
            clickable
            v-close-popup
            @click="switchToSession(s.id)"
            :active="s.id === currentSession?.id"
          >
            <q-item-section>
              <q-item-label>{{ s.name }}</q-item-label>
              <q-item-label caption>{{ new Date(s.createdAt).toLocaleDateString() }} · {{ s.chat.length }} messages</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-btn
                flat
                dense
                round
                icon="delete"
                size="xs"
                color="grey-7"
                @click.stop="confirmDeleteSession(s.id, s.name)"
              />
            </q-item-section>
          </q-item>
          <q-separator />
          <q-item clickable v-close-popup @click="newSession()">
            <q-item-section avatar>
              <q-icon name="add" size="xs" />
            </q-item-section>
            <q-item-section>New Session</q-item-section>
          </q-item>
        </q-list>
      </q-btn-dropdown>
    </div>

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
          :disable="chat.thinking"
          @click="startCampaignSetup"
        />
      </div>

      <chat-message v-for="(msg, i) in messages" :key="i" :msg="msg" @rewind="rewindTo(i)" />

      <!-- Streaming response -->
      <div v-if="chat.streaming" class="chat-message assistant q-my-sm">
        <div class="message-label text-caption text-grey">GM</div>
        <div class="message-body streaming-body">
          <div class="gm-text" v-html="renderedStreaming"></div>
          <tool-card
            v-for="(tc, i) in chat.streamToolCalls"
            :key="i"
            :name="tc.name"
            :result="typeof tc.result === 'string' ? JSON.parse(tc.result) : tc.result"
          />
          <span class="cursor-blink">|</span>
        </div>
      </div>

      <!-- Thinking indicator -->
      <div v-if="chat.thinking && !chat.streaming" class="text-grey q-my-sm q-ml-sm">
        <q-spinner-dots size="24px" color="primary" />
        <span class="q-ml-sm text-caption">The GM is thinking...</span>
      </div>
    </div>

    <!-- Input bar -->
    <div class="input-bar q-pa-sm row items-center no-wrap">
      <q-btn
        round
        dense
        flat
        icon="mdi-bug"
        size="sm"
        color="grey"
        class="q-mr-xs"
        @click="showDebug = true"
      >
        <q-tooltip>Debug panel</q-tooltip>
      </q-btn>
      <q-input
        v-model="input"
        placeholder="What do you do?"
        outlined
        dense
        dark
        autogrow
        :disable="chat.thinking"
        @keydown.enter.exact.prevent="send"
        class="col"
      >
        <template v-slot:after>
          <q-btn
            v-if="!chat.thinking"
            round
            dense
            flat
            icon="send"
            color="primary"
            :disable="!input.trim()"
            @click="send"
          />
          <q-btn
            v-else
            round
            dense
            flat
            icon="stop"
            color="negative"
            @click="stop"
          >
            <q-tooltip>Stop generating</q-tooltip>
          </q-btn>
        </template>
      </q-input>
    </div>

    <!-- Rewind confirm -->
    <q-dialog v-model="showRewindConfirm">
      <q-card class="card-bg" style="min-width: 320px">
        <q-card-section class="bg-secondary sf-header text-h6">Rewind</q-card-section>
        <q-card-section>
          <template v-if="rewindSnapshotId">
            This will restore all game state (character, sector, vows, chat) to the snapshot taken before this message. {{ messages.length - rewindTarget }} message(s) and all state changes will be reverted.
          </template>
          <template v-else>
            No snapshot is available for this message (it predates the snapshot system). This will only remove {{ messages.length - rewindTarget }} message(s) without reverting game state.
            <div class="text-warning text-caption q-mt-sm">
              Character, vows, clocks, and sector changes will NOT be undone.
            </div>
          </template>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" @click="showRewindConfirm = false" />
          <q-btn flat label="Rewind" color="warning" @click="confirmRewind" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Delete session confirm -->
    <q-dialog v-model="showDeleteSession">
      <q-card class="card-bg" style="min-width: 320px">
        <q-card-section class="bg-secondary sf-header text-h6">Delete Session</q-card-section>
        <q-card-section>
          Delete "{{ deleteSessionName }}"? This will remove all messages in this session. Game state is not affected.
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" @click="showDeleteSession = false" />
          <q-btn flat label="Delete" color="negative" @click="doDeleteSession" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Debug dialog -->
    <q-dialog v-model="showDebug" maximized>
      <q-card class="debug-panel">
        <q-card-section class="row items-center bg-secondary q-py-sm">
          <div class="sf-header text-h6 col">Debug Panel</div>
          <q-btn flat dense icon="close" @click="showDebug = false" />
        </q-card-section>

        <q-card-section class="q-pa-none" style="height: calc(100vh - 50px); overflow: auto">
          <q-tabs v-model="debugTab" dense class="bg-secondary" active-color="primary" indicator-color="primary">
            <q-tab name="prompt" label="System Prompt" />
            <q-tab name="state" label="Game State" />
            <q-tab name="journal" label="Journal Context" />
            <q-tab name="history" label="Chat History" />
            <q-tab name="tools" label="Tool Defs" />
            <q-tab name="usage" label="Token Usage" />
          </q-tabs>

          <q-tab-panels v-model="debugTab" class="debug-panels">
            <q-tab-panel name="prompt">
              <pre class="debug-pre">{{ debugSystemPrompt }}</pre>
            </q-tab-panel>
            <q-tab-panel name="state">
              <pre class="debug-pre">{{ debugGameState }}</pre>
            </q-tab-panel>
            <q-tab-panel name="journal">
              <pre class="debug-pre">{{ debugJournal }}</pre>
            </q-tab-panel>
            <q-tab-panel name="history">
              <pre class="debug-pre">{{ debugHistory }}</pre>
            </q-tab-panel>
            <q-tab-panel name="tools">
              <pre class="debug-pre">{{ debugTools }}</pre>
            </q-tab-panel>
            <q-tab-panel name="usage">
              <div class="q-pa-md">
                <div v-if="chat.lastUsage" class="usage-grid">
                  <div class="usage-item">
                    <div class="usage-label">Input tokens</div>
                    <div class="usage-value">{{ chat.lastUsage.inputTokens.toLocaleString() }}</div>
                  </div>
                  <div class="usage-item">
                    <div class="usage-label">Output tokens</div>
                    <div class="usage-value">{{ chat.lastUsage.outputTokens.toLocaleString() }}</div>
                  </div>
                  <div class="usage-item">
                    <div class="usage-label">Cache creation</div>
                    <div class="usage-value">{{ chat.lastUsage.cacheCreationTokens.toLocaleString() }}</div>
                  </div>
                  <div class="usage-item">
                    <div class="usage-label">Cache read</div>
                    <div class="usage-value">{{ chat.lastUsage.cacheReadTokens.toLocaleString() }}</div>
                  </div>
                  <div class="usage-item">
                    <div class="usage-label">Total (cumulative)</div>
                    <div class="usage-value">{{ (totalTokens.input).toLocaleString() }} in / {{ (totalTokens.output).toLocaleString() }} out</div>
                  </div>
                </div>
                <div v-else class="text-grey">No API calls yet this session.</div>

                <div v-if="chat.usageHistory.length > 0" class="q-mt-lg">
                  <div class="text-bold q-mb-sm">Call history</div>
                  <div v-for="(u, i) in chat.usageHistory" :key="i" class="usage-row q-mb-xs">
                    <span class="text-caption text-grey">#{{ i + 1 }}</span>
                    <span class="q-ml-sm">{{ u.inputTokens.toLocaleString() }} in</span>
                    <span class="q-ml-sm">{{ u.outputTokens.toLocaleString() }} out</span>
                    <span v-if="u.cacheReadTokens" class="q-ml-sm text-positive">{{ u.cacheReadTokens.toLocaleString() }} cached</span>
                  </div>
                </div>
              </div>
            </q-tab-panel>
          </q-tab-panels>
        </q-card-section>
      </q-card>
    </q-dialog>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, nextTick, watch, onMounted } from 'vue';
import { marked } from 'marked';
import { useCampaign } from 'src/store/campaign';
import { useConfig } from 'src/store/config';
import { useChat } from 'src/store/chat';
import { IChatMessage } from 'src/components/models';
import { runTurn, buildPrompt } from 'src/lib/gm-agent';
import { createSnapshot, restoreSnapshot } from 'src/lib/snapshots';
import { getCurrentSession, createSession, ensureSessions } from 'src/lib/sessions';
import { ISession } from 'src/components/models';
import ChatMessage from './ChatMessage.vue';
import ToolCard from './ToolCard.vue';

marked.setOptions({
  breaks: true,
  gfm: true,
});

export default defineComponent({
  name: 'GmChat',
  components: { ChatMessage, ToolCard },
  setup() {
    const campaign = useCampaign();
    const config = useConfig();
    const chat = useChat();

    const input = ref('');
    const messageList = ref<HTMLElement | null>(null);
    let abortController: AbortController | null = null;

    // Session management
    const currentSession = computed((): ISession | null => {
      ensureSessions(campaign.data);
      return getCurrentSession(campaign.data);
    });

    const sessions = computed((): ISession[] => {
      ensureSessions(campaign.data);
      return campaign.data.sessions || [];
    });

    const messages = computed((): IChatMessage[] => {
      return currentSession.value?.chat || [];
    });

    const newSession = (name?: string) => {
      createSession(campaign.data, name);
    };

    const switchToSession = (sessionId: string) => {
      campaign.data.currentSession = sessionId;
    };

    // Debug state
    const showDebug = ref(false);
    const debugTab = ref('prompt');
    const totalTokens = computed(() => {
      return chat.usageHistory.reduce((acc, u) => ({
        input: acc.input + u.inputTokens,
        output: acc.output + u.outputTokens,
      }), { input: 0, output: 0 });
    });

    // Build the exact prompt Claude would see (single source of truth)
    const debugPrompt = computed(() => buildPrompt(campaign.data, '(your next message)', currentSession.value?.chat || []));
    const debugSystemPrompt = computed(() => debugPrompt.value.system.map(b => b.text).join('\n\n---\n\n'));
    const debugGameState = computed(() => {
      const stateBlock = debugPrompt.value.system.find(b => b.text.includes('<game_state>'));
      return stateBlock?.text || '(no game state)';
    });
    const debugJournal = computed(() => {
      const journalBlock = debugPrompt.value.system.find(b => b.text.includes('<journal>'));
      return journalBlock?.text || '(empty journal)';
    });
    const debugHistory = computed(() => JSON.stringify(debugPrompt.value.messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string'
        ? m.content.substring(0, 200) + (m.content.length > 200 ? '...' : '')
        : `[${(m.content as unknown[]).length} blocks]`,
    })), null, 2));
    const debugTools = computed(() => JSON.stringify(debugPrompt.value.tools.map(t => ({
      name: t.name,
      description: t.description,
      params: Object.keys(((t.input_schema as Record<string, unknown>).properties || {}) as Record<string, unknown>),
    })), null, 2));

    const isFreshCampaign = computed(() => {
      const stats = campaign.data.character.stats;
      const hasStats = stats.edge + stats.heart + stats.iron + stats.shadow + stats.wits > 0;
      const hasAssets = campaign.data.character.assets.length > 0;
      return !hasStats && !hasAssets;
    });

    // Session deletion
    const showDeleteSession = ref(false);
    const deleteSessionId = ref('');
    const deleteSessionName = ref('');
    const confirmDeleteSession = (id: string, name: string) => {
      deleteSessionId.value = id;
      deleteSessionName.value = name;
      showDeleteSession.value = true;
    };
    const doDeleteSession = () => {
      if (!campaign.data.sessions) return;
      const idx = campaign.data.sessions.findIndex((s) => s.id === deleteSessionId.value);
      if (idx < 0) return;
      campaign.data.sessions.splice(idx, 1);
      // If we deleted the current session, switch to the last one or clear
      if (campaign.data.currentSession === deleteSessionId.value) {
        const last = campaign.data.sessions[campaign.data.sessions.length - 1];
        campaign.data.currentSession = last?.id;
      }
      showDeleteSession.value = false;
    };

    const rewindTarget = ref(-1);
    const rewindSnapshotId = ref<number | null>(null);
    const showRewindConfirm = ref(false);
    const rewindTo = (index: number) => {
      rewindTarget.value = index;
      const sessionChat = currentSession.value?.chat || [];
      rewindSnapshotId.value = null;
      for (let i = index; i >= 0; i--) {
        if (sessionChat[i].snapshotId) {
          rewindSnapshotId.value = sessionChat[i].snapshotId as number;
          break;
        }
      }
      showRewindConfirm.value = true;
    };
    const confirmRewind = async () => {
      const session = currentSession.value;
      if (!session) return;
      const rewoundText = session.chat[rewindTarget.value]?.content || '';

      if (rewindSnapshotId.value) {
        const restored = await restoreSnapshot(rewindSnapshotId.value);
        if (restored) {
          campaign.data = restored;
          await campaign.save();
        }
      } else {
        session.chat.splice(rewindTarget.value);
      }
      showRewindConfirm.value = false;
      input.value = rewoundText;
    };

    const stop = () => {
      if (abortController) {
        abortController.abort();
      }
    };

    const startCampaignSetup = () => {
      input.value = "Let's set up a new campaign! Walk me through the Starforged Chapter 2 procedure.";
      void send();
    };

    const renderedStreaming = computed(() => {
      return marked.parse(chat.streamingText) as string;
    });

    const scrollToBottom = () => {
      void nextTick(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (messageList.value) {
              messageList.value.scrollTop = messageList.value.scrollHeight;
            }
          });
        });
      });
    };

    watch(messages, scrollToBottom, { deep: true });
    watch(() => chat.streamingText, scrollToBottom);
    onMounted(scrollToBottom);

    const send = async () => {
      const text = input.value.trim();
      if (!text || chat.thinking) return;

      const apiKey = config.data.claudeApiKey;
      const model = config.data.claudeModel || 'claude-opus-4-6';

      if (!apiKey) {
        alert('Please set your Anthropic API key in Claude GM Settings (left drawer menu).');
        return;
      }

      // Ensure we have a session
      if (!currentSession.value) {
        createSession(campaign.data);
      }
      const session = currentSession.value as ISession;

      // Snapshot before GM turn
      const snapshotId = await createSnapshot(campaign.data, `Before: ${text.substring(0, 50)}`);

      // Add user message with snapshot reference
      const userMsg: IChatMessage = {
        role: 'user',
        content: text,
        timestamp: Date.now(),
        snapshotId,
      };
      session.chat.push(userMsg);
      input.value = '';
      chat.thinking = true;
      chat.streamingText = '';
      chat.streamToolCalls = [];
      abortController = new AbortController();
      scrollToBottom();

      try {
        const generator = runTurn(apiKey, model, campaign.data, text, session.chat.slice(0, -1), abortController.signal);

        for await (const event of generator) {
          switch (event.type) {
            case 'text_delta':
              chat.streaming = true;
              chat.streamingText += event.text;
              scrollToBottom();
              break;
            case 'tool_result':
              chat.streamToolCalls.push({
                name: event.name,
                input: {},
                result: event.result as Record<string, unknown>,
              });
              scrollToBottom();
              break;
            case 'error':
              console.error('[GM Agent]', event.message);
              chat.streamingText += `\n\n*Error: ${event.message}*`;
              break;
            case 'done':
              if (event.usage) {
                chat.lastUsage = event.usage;
                chat.usageHistory.push(event.usage);
              }
              break;
          }
        }

        // Save assistant message
        const assistantMsg: IChatMessage = {
          role: 'assistant',
          content: chat.streamingText,
          toolCalls: chat.streamToolCalls.length > 0 ? [...chat.streamToolCalls] : undefined,
          timestamp: Date.now(),
        };
        session.chat.push(assistantMsg);
      } catch (err) {
        // Save partial content if we were aborted mid-stream
        if (abortController?.signal.aborted && chat.streamingText.trim()) {
          const partialMsg: IChatMessage = {
            role: 'assistant',
            content: chat.streamingText,
            toolCalls: chat.streamToolCalls.length > 0 ? [...chat.streamToolCalls] : undefined,
            timestamp: Date.now(),
          };
          session.chat.push(partialMsg);
        } else if (!abortController?.signal.aborted) {
          console.error('[GM Agent] Fatal error:', err);
          const errorMsg: IChatMessage = {
            role: 'assistant',
            content: `*An error occurred: ${err instanceof Error ? err.message : 'Unknown error'}*`,
            timestamp: Date.now(),
          };
          session.chat.push(errorMsg);
        }
      } finally {
        chat.thinking = false;
        chat.streaming = false;
        chat.streamingText = '';
        chat.streamToolCalls = [];
        abortController = null;
        scrollToBottom();
      }
    };

    return {
      input,
      chat,
      messages,
      messageList,
      sessions,
      currentSession,
      newSession,
      switchToSession,
      renderedStreaming,
      isFreshCampaign,
      startCampaignSetup,
      stop,
      rewindTo,
      rewindTarget,
      showRewindConfirm,
      confirmRewind,
      rewindSnapshotId,
      showDeleteSession,
      deleteSessionName,
      confirmDeleteSession,
      doDeleteSession,
      send,
      showDebug,
      debugTab,
      debugSystemPrompt,
      debugGameState,
      debugJournal,
      debugHistory,
      debugTools,
      totalTokens,
    };
  },
});
</script>

<style lang="sass" scoped>
.gm-chat
  display: flex
  flex-direction: column
  flex: 1
  overflow-x: hidden

.session-bar
  flex-shrink: 0
  border-bottom: 1px solid rgba(200, 164, 92, 0.1)
  background: rgba(12, 14, 24, 0.95)

.message-list
  max-width: 1200px
  margin: 0 auto
  width: 100%
  overflow-x: hidden
  overflow-y: auto
  overflow-wrap: break-word
  word-break: break-word
  flex: 1
  min-height: 0

.input-bar
  flex-shrink: 0
  border-top: 1px solid rgba(200, 164, 92, 0.12)
  background: rgba(12, 14, 24, 0.95)
  max-width: 1200px
  margin: 0 auto
  width: 100%

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

.debug-panel
  background: $dark

.debug-panels
  background: transparent

.debug-pre
  white-space: pre-wrap
  word-break: break-word
  font-family: monospace
  font-size: 0.8rem
  color: rgba(255, 255, 255, 0.8)
  line-height: 1.5
  margin: 0

.usage-grid
  display: grid
  grid-template-columns: 1fr 1fr
  gap: 12px

.usage-item
  background: rgba(200, 164, 92, 0.06)
  border: 1px solid rgba(200, 164, 92, 0.1)
  border-radius: 6px
  padding: 12px

.usage-label
  font-size: 0.75rem
  color: rgba(255, 255, 255, 0.5)
  text-transform: uppercase
  letter-spacing: 0.05em

.usage-value
  font-size: 1.2rem
  font-family: monospace
  color: $primary
  margin-top: 4px

.usage-row
  font-family: monospace
  font-size: 0.85rem
  padding: 4px 8px
  background: rgba(255, 255, 255, 0.03)
  border-radius: 3px
</style>
