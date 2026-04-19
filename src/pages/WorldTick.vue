<template>
  <q-page class="world-tick-page">
    <!-- Controls -->
    <div class="controls-bar row items-center no-wrap q-px-md q-py-sm">
      <div class="sf-header text-h6 q-mr-md phase-title">SECTOR PULSE</div>
      <q-select
        v-model="tickDt"
        :options="dtOptions"
        outlined
        dense
        dark
        class="dt-select"
        :disable="chat.tickRunning"
      />
      <q-btn
        v-if="!chat.tickRunning"
        label="Run"
        icon="mdi-play"
        color="primary"
        flat
        dense
        class="q-ml-sm"
        @click="runTick"
      />
      <q-btn
        v-else
        label="Running..."
        icon="mdi-loading mdi-spin"
        flat
        dense
        disable
        class="q-ml-sm"
      />
      <q-space />
      <div v-if="chat.tickRunning || chat.tickResults.length > 0" class="text-caption text-grey">
        {{ chat.tickCompleted }} / {{ chat.tickTotal }} entities
      </div>
      <q-btn
        v-if="chat.tickResults.length > 0 && !chat.tickRunning"
        flat
        dense
        icon="mdi-close"
        color="grey"
        class="q-ml-sm"
        @click="clearResults"
      >
        <q-tooltip>Clear results</q-tooltip>
      </q-btn>
    </div>

    <!-- Progress -->
    <q-linear-progress
      v-if="chat.tickRunning"
      :value="chat.tickTotal > 0 ? chat.tickCompleted / chat.tickTotal : 0"
      color="primary"
      class="progress-bar"
    />

    <!-- Empty state -->
    <div v-if="chat.tickResults.length === 0 && !chat.tickRunning" class="empty-state column items-center q-mt-xl">
      <q-icon name="mdi-satellite-variant" size="64px" color="primary" class="q-mb-md pulse-icon" />
      <div class="sf-header text-h6">Listening...</div>
      <div class="text-caption text-grey q-mt-sm" style="max-width: 400px; text-align: center">
        Run a tick to query every faction, settlement, and NPC in the sector. Results cascade: factions act first, shaping settlement conditions, which pressure individual NPCs.
      </div>
    </div>

    <!-- Results: Three phases -->
    <div v-if="chat.tickResults.length > 0" class="phases-container q-pa-md">
      <!-- Factions -->
      <div v-if="factionIntents.length > 0" class="phase-section">
        <div class="phase-header">
          <div class="phase-line phase-line-faction"></div>
          <span class="phase-label sf-header">FACTIONS</span>
          <div class="phase-line phase-line-faction"></div>
        </div>
        <div class="intents-grid">
          <div v-for="(intent, i) in factionIntents" :key="'f'+i" class="intent-card intent-faction">
            <div class="intent-card-header row items-center no-wrap">
              <q-badge color="orange" class="q-mr-sm">faction</q-badge>
              <span class="intent-name">{{ intent.agent.name }}</span>
              <q-space />
              <q-btn flat dense round icon="mdi-bug" size="xs" color="grey-7" @click="toggleDebug('f'+i)">
                <q-tooltip>Show prompt</q-tooltip>
              </q-btn>
            </div>
            <div class="intent-body">{{ intent.intent }}</div>
            <div v-if="intent.targets.length > 0" class="intent-targets">
              <div v-for="target in intent.targets" :key="target" class="target-chip" @click="toggleTarget(target)">
                {{ target }}
              </div>
            </div>
            <pre v-if="debugOpen === 'f'+i" class="intent-debug">{{ intent.systemPrompt }}</pre>
          </div>
        </div>
      </div>

      <!-- Flow arrow -->
      <div v-if="factionIntents.length > 0 && settlementIntents.length > 0" class="flow-arrow">
        <q-icon name="mdi-chevron-double-down" size="sm" color="primary" />
      </div>

      <!-- Settlements -->
      <div v-if="settlementIntents.length > 0" class="phase-section">
        <div class="phase-header">
          <div class="phase-line phase-line-settlement"></div>
          <span class="phase-label sf-header">SETTLEMENTS</span>
          <div class="phase-line phase-line-settlement"></div>
        </div>
        <div class="intents-grid">
          <div v-for="(intent, i) in settlementIntents" :key="'s'+i" class="intent-card intent-settlement">
            <div class="intent-card-header row items-center no-wrap">
              <q-badge color="teal" class="q-mr-sm">settlement</q-badge>
              <span class="intent-name">{{ intent.agent.name }}</span>
              <q-space />
              <q-btn flat dense round icon="mdi-bug" size="xs" color="grey-7" @click="toggleDebug('s'+i)">
                <q-tooltip>Show prompt</q-tooltip>
              </q-btn>
            </div>
            <div class="intent-body">{{ intent.intent }}</div>
            <div v-if="intent.targets.length > 0" class="intent-targets">
              <div v-for="target in intent.targets" :key="target" class="target-chip" @click="toggleTarget(target)">
                {{ target }}
              </div>
            </div>
            <pre v-if="debugOpen === 's'+i" class="intent-debug">{{ intent.systemPrompt }}</pre>
          </div>
        </div>
      </div>

      <!-- Flow arrow -->
      <div v-if="settlementIntents.length > 0 && npcIntents.length > 0" class="flow-arrow">
        <q-icon name="mdi-chevron-double-down" size="sm" color="primary" />
      </div>

      <!-- NPCs -->
      <div v-if="npcIntents.length > 0" class="phase-section">
        <div class="phase-header">
          <div class="phase-line phase-line-npc"></div>
          <span class="phase-label sf-header">INDIVIDUALS</span>
          <div class="phase-line phase-line-npc"></div>
        </div>
        <div class="intents-grid">
          <div v-for="(intent, i) in npcIntents" :key="'n'+i" class="intent-card intent-npc">
            <div class="intent-card-header row items-center no-wrap">
              <q-badge color="purple" class="q-mr-sm">npc</q-badge>
              <span class="intent-name">{{ intent.agent.name }}</span>
              <q-space />
              <q-btn flat dense round icon="mdi-bug" size="xs" color="grey-7" @click="toggleDebug('n'+i)">
                <q-tooltip>Show prompt</q-tooltip>
              </q-btn>
            </div>
            <div class="intent-body">{{ intent.intent }}</div>
            <div v-if="intent.targets.length > 0" class="intent-targets">
              <div v-for="target in intent.targets" :key="target" class="target-chip" @click="toggleTarget(target)">
                {{ target }}
              </div>
            </div>
            <pre v-if="debugOpen === 'n'+i" class="intent-debug">{{ intent.systemPrompt }}</pre>
          </div>
        </div>
      </div>
    </div>

    <!-- Entity detail drawer -->
    <q-dialog v-model="showTargetDetail" position="right">
      <q-card class="target-detail-card">
        <q-card-section class="bg-secondary row items-center q-py-sm">
          <q-badge :color="targetDetail?.type === 'npc' ? 'purple' : targetDetail?.type === 'settlement' ? 'teal' : targetDetail?.type === 'faction' ? 'orange' : 'grey'" class="q-mr-sm">
            {{ targetDetail?.type }}
          </q-badge>
          <span class="sf-header text-h6">{{ targetDetail?.name }}</span>
          <q-space />
          <q-btn flat dense icon="close" @click="showTargetDetail = false" />
        </q-card-section>
        <q-card-section v-if="targetDetail">
          <div v-for="(val, key) in targetDetail.fields" :key="key" class="q-mb-sm">
            <div class="text-caption text-grey" style="text-transform: uppercase; letter-spacing: 0.05em">{{ key }}</div>
            <div>{{ val }}</div>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted } from 'vue';
import { useCampaign } from 'src/store/campaign';
import { useConfig } from 'src/store/config';
import { useChat } from 'src/store/chat';
import { worldTick, AgentIntent } from 'src/lib/world-tick';
import { lookupEntityByName, EntitySummary } from 'src/lib/context-tree';

export default defineComponent({
  name: 'WorldTickPage',
  setup() {
    const campaign = useCampaign();
    const config = useConfig();
    const chat = useChat();

    const tickDt = ref('the next few days');
    const dtOptions = ['the next few hours', 'the next day', 'the next few days', 'the next week', 'the next month'];
    const debugOpen = ref('');
    const showTargetDetail = ref(false);
    const targetDetail = ref<EntitySummary | null>(null);

    const factionIntents = computed(() => chat.tickResults.filter(i => i.agent.type === 'faction'));
    const settlementIntents = computed(() => chat.tickResults.filter(i => i.agent.type === 'settlement'));
    const npcIntents = computed(() => chat.tickResults.filter(i => i.agent.type !== 'faction' && i.agent.type !== 'settlement'));

    // Restore persisted results on mount
    onMounted(() => {
      if (chat.tickResults.length === 0 && campaign.data.lastTickResults) {
        const saved = campaign.data.lastTickResults;
        chat.tickResults = saved.intents.map(i => ({
          agent: { type: i.agentType, name: i.agentName } as AgentIntent['agent'],
          intent: i.intent,
          targets: i.targets,
          systemPrompt: i.systemPrompt,
        }));
        chat.tickTotal = saved.intents.length;
        chat.tickCompleted = saved.intents.length;
        tickDt.value = saved.dt;
      }
    });

    const persistResults = () => {
      campaign.data.lastTickResults = {
        dt: tickDt.value,
        timestamp: Date.now(),
        intents: chat.tickResults.map(i => ({
          agentType: i.agent.type,
          agentName: i.agent.name,
          intent: i.intent,
          targets: i.targets,
          systemPrompt: i.systemPrompt,
        })),
      };
    };

    const runTick = async () => {
      const apiKey = config.data.claudeApiKey;
      if (!apiKey) {
        alert('Please set your Anthropic API key in settings.');
        return;
      }
      chat.tickRunning = true;
      chat.tickResults = [];
      chat.tickCompleted = 0;
      debugOpen.value = '';
      try {
        await worldTick({
          apiKey,
          campaign: campaign.data,
          dt: tickDt.value,
          onStart: (total) => { chat.tickTotal = total; },
          onProgress: (completed, total, intent) => {
            chat.tickCompleted = completed;
            chat.tickResults.push(intent);
          },
        });
        persistResults();
      } catch (err) {
        console.error('[World Tick]', err);
      } finally {
        chat.tickRunning = false;
      }
    };

    const clearResults = () => {
      chat.tickResults = [];
      chat.tickCompleted = 0;
      chat.tickTotal = 0;
      campaign.data.lastTickResults = undefined;
    };

    const toggleDebug = (key: string) => {
      debugOpen.value = debugOpen.value === key ? '' : key;
    };

    const toggleTarget = (name: string) => {
      const entity = lookupEntityByName(campaign.data, name);
      if (entity) {
        targetDetail.value = entity;
        showTargetDetail.value = true;
      }
    };

    return {
      chat,
      tickDt,
      dtOptions,
      debugOpen,
      showTargetDetail,
      targetDetail,
      factionIntents,
      settlementIntents,
      npcIntents,
      runTick,
      clearResults,
      toggleDebug,
      toggleTarget,
    };
  },
});
</script>

<style lang="sass" scoped>
.world-tick-page
  min-height: 100%

.controls-bar
  border-bottom: 1px solid rgba(200, 164, 92, 0.12)
  background: rgba(12, 14, 24, 0.8)

.dt-select
  min-width: 200px

.progress-bar
  height: 2px

.empty-state
  opacity: 0.7

.pulse-icon
  animation: pulse-glow 3s ease-in-out infinite

@keyframes pulse-glow
  0%, 100%
    filter: drop-shadow(0 0 4px rgba(168, 137, 60, 0.3))
  50%
    filter: drop-shadow(0 0 16px rgba(168, 137, 60, 0.6))

.phases-container
  max-width: 1000px
  margin: 0 auto

.phase-section
  margin-bottom: 8px

.phase-header
  display: flex
  align-items: center
  gap: 12px
  margin-bottom: 12px

.phase-label
  font-size: 1rem
  letter-spacing: 0.12em
  color: rgba(255, 255, 255, 0.5)
  white-space: nowrap

.phase-line
  flex: 1
  height: 1px

.phase-line-faction
  background: linear-gradient(90deg, transparent, rgba(255, 152, 0, 0.3), transparent)

.phase-line-settlement
  background: linear-gradient(90deg, transparent, rgba(0, 150, 136, 0.3), transparent)

.phase-line-npc
  background: linear-gradient(90deg, transparent, rgba(156, 39, 176, 0.3), transparent)

.flow-arrow
  text-align: center
  padding: 4px 0
  opacity: 0.4

.intents-grid
  display: grid
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))
  gap: 12px

.intent-card
  background: rgba(14, 17, 32, 0.6)
  border-radius: 6px
  padding: 12px 14px
  border-left: 3px solid transparent
  transition: border-color 0.15s

.intent-faction
  border-left-color: rgba(255, 152, 0, 0.4)
  &:hover
    border-left-color: rgba(255, 152, 0, 0.8)

.intent-settlement
  border-left-color: rgba(0, 150, 136, 0.4)
  &:hover
    border-left-color: rgba(0, 150, 136, 0.8)

.intent-npc
  border-left-color: rgba(156, 39, 176, 0.4)
  &:hover
    border-left-color: rgba(156, 39, 176, 0.8)

.intent-card-header
  margin-bottom: 6px

.intent-name
  font-family: Teko
  font-size: 1.1rem
  letter-spacing: 0.03em

.intent-body
  font-size: 0.9rem
  line-height: 1.5
  color: rgba(255, 255, 255, 0.85)

.intent-targets
  display: flex
  flex-wrap: wrap
  gap: 4px
  margin-top: 8px

.target-chip
  background: rgba(200, 164, 92, 0.1)
  border: 1px solid rgba(200, 164, 92, 0.2)
  border-radius: 3px
  padding: 1px 8px
  font-size: 0.8rem
  cursor: pointer
  transition: background 0.1s
  &:hover
    background: rgba(200, 164, 92, 0.25)

.intent-debug
  white-space: pre-wrap
  word-break: break-word
  font-family: monospace
  font-size: 0.7rem
  color: rgba(255, 255, 255, 0.5)
  background: rgba(0, 0, 0, 0.3)
  padding: 8px
  border-radius: 4px
  margin-top: 8px
  max-height: 250px
  overflow-y: auto

.target-detail-card
  background: $dark
  min-width: 300px
  max-width: 400px
  height: 100vh
</style>
