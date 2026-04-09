<template>
  <div class="tool-card q-my-xs">
    <!-- Action Roll -->
    <div v-if="name === 'roll_action'" class="roll-card">
      <div class="roll-header">
        <q-icon name="mdi-dice-6" size="sm" class="q-mr-xs" />
        <span class="text-bold">{{ result.stat?.toUpperCase() }}</span>
        <span class="q-ml-xs text-caption">+{{ result.statValue }} {{ result.adds ? `+${result.adds}` : '' }}</span>
      </div>
      <div class="roll-dice">
        <span class="action-die">d6: {{ result.roll?.action?.die }}</span>
        <span class="q-mx-xs">=</span>
        <span class="text-bold" :class="result.roll?.action?.color">{{ result.roll?.action?.score }}</span>
        <span class="q-mx-sm">vs</span>
        <span :class="result.roll?.challenge?.die1?.color">{{ result.roll?.challenge?.die1?.roll }}</span>
        <span class="q-mx-xs">&</span>
        <span :class="result.roll?.challenge?.die2?.color">{{ result.roll?.challenge?.die2?.roll }}</span>
      </div>
      <div class="roll-result text-bold" :class="resultColor(result.roll?.result)">
        {{ result.roll?.result }}
        <span v-if="result.roll?.challenge?.match" class="text-warning"> (MATCH)</span>
      </div>
      <div v-if="result.canBurnMomentum" class="text-caption text-info q-mt-xs">
        Burn momentum to upgrade to {{ result.burnWouldUpgrade }}
      </div>
    </div>

    <!-- Progress Roll -->
    <div v-else-if="name === 'roll_progress'" class="roll-card">
      <div class="roll-header">
        <q-icon name="mdi-progress-check" size="sm" class="q-mr-xs" />
        <span class="text-bold">Progress: {{ result.trackName }}</span>
      </div>
      <div class="roll-dice">
        <span class="text-bold" :class="result.roll?.action?.color">{{ result.progressScore }}</span>
        <span class="q-mx-sm">vs</span>
        <span :class="result.roll?.challenge?.die1?.color">{{ result.roll?.challenge?.die1?.roll }}</span>
        <span class="q-mx-xs">&</span>
        <span :class="result.roll?.challenge?.die2?.color">{{ result.roll?.challenge?.die2?.roll }}</span>
      </div>
      <div class="roll-result text-bold" :class="resultColor(result.roll?.result)">
        {{ result.roll?.result }}
        <span v-if="result.roll?.challenge?.match" class="text-warning"> (MATCH)</span>
      </div>
    </div>

    <!-- Oracle Roll -->
    <div v-else-if="name === 'roll_oracle'" class="oracle-card">
      <q-icon name="mdi-crystal-ball" size="sm" class="q-mr-xs" />
      <span class="text-caption">{{ shortOracleId(result.oracleId) }}:</span>
      <span class="text-bold q-ml-xs text-accent">{{ result.result }}</span>
    </div>

    <!-- Mark Progress -->
    <div v-else-if="name === 'mark_progress'" class="compact-card">
      <q-icon name="mdi-checkbox-marked" size="sm" class="q-mr-xs" />
      Marked progress on <span class="text-bold">{{ result.trackName }}</span>
      ({{ result.progressScore }}/10)
    </div>

    <!-- Character Update -->
    <div v-else-if="name === 'update_character'" class="compact-card">
      <q-icon name="mdi-account-edit" size="sm" class="q-mr-xs" />
      Updated:
      <span v-for="(val, key) in result.applied" :key="key" class="q-ml-xs">
        {{ key }}={{ val }}
      </span>
    </div>

    <!-- Vow Created -->
    <div v-else-if="name === 'create_vow'" class="compact-card">
      <q-icon name="mdi-sword-cross" size="sm" class="q-mr-xs text-warning" />
      Swore vow: <span class="text-bold">{{ result.name }}</span>
      ({{ result.difficulty }})
    </div>

    <!-- Clock -->
    <div v-else-if="name === 'create_clock' || name === 'advance_clock'" class="compact-card">
      <q-icon name="mdi-clock-outline" size="sm" class="q-mr-xs" />
      <template v-if="name === 'create_clock'">
        Clock: <span class="text-bold">{{ result.name }}</span> ({{ result.segments }} segments)
      </template>
      <template v-else>
        {{ result.clockName }}: {{ result.filled }}/{{ result.total }}
        <span v-if="result.complete" class="text-warning"> COMPLETE</span>
      </template>
    </div>

    <!-- Burn Momentum -->
    <div v-else-if="name === 'burn_momentum'" class="compact-card text-info">
      <q-icon name="mdi-lightning-bolt" size="sm" class="q-mr-xs" />
      Burned momentum! Reset to {{ result.newMomentum }}
    </div>

    <!-- Generated Image -->
    <div v-else-if="name === 'generate_image' && result.imageUrl" class="image-card">
      <img :src="result.imageUrl" class="generated-image" />
    </div>

    <!-- Generic fallback -->
    <div v-else class="compact-card">
      <q-icon name="mdi-cog" size="sm" class="q-mr-xs" />
      <span class="text-caption">{{ name }}</span>
      <span v-if="result.name" class="q-ml-xs text-bold">{{ result.name }}</span>
      <span v-if="result.error" class="text-negative q-ml-xs">{{ result.error }}</span>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';

export default defineComponent({
  name: 'ToolCard',
  props: {
    name: { type: String, required: true },
    result: { type: Object as PropType<Record<string, unknown>>, required: true },
  },
  setup() {
    const resultColor = (result?: string) => {
      if (result === 'Strong Hit') return 'text-positive';
      if (result === 'Weak Hit') return 'text-warning';
      if (result === 'Miss') return 'text-negative';
      return '';
    };

    const shortOracleId = (id?: string) => {
      if (!id) return '';
      const parts = id.split('/');
      return parts.slice(2).join('/').replace(/_/g, ' ');
    };

    return { resultColor, shortOracleId };
  },
});
</script>

<style lang="sass" scoped>
.tool-card
  font-size: 0.85rem

.roll-card
  background: rgba(14, 17, 32, 0.8)
  border-left: 3px solid $primary
  border: 1px solid rgba(200, 164, 92, 0.15)
  border-left: 3px solid $primary
  border-radius: 4px
  padding: 8px 12px
  box-shadow: 0 0 12px rgba(200, 164, 92, 0.06)

.oracle-card
  background: rgba(14, 17, 32, 0.8)
  border-left: 3px solid $accent
  border-radius: 4px
  padding: 6px 10px

.compact-card
  background: rgba(14, 17, 32, 0.6)
  border-left: 3px solid rgba(92, 184, 224, 0.4)
  border-radius: 4px
  padding: 6px 10px

.roll-header
  display: flex
  align-items: center
  font-family: Convergence
  letter-spacing: 0.04em

.roll-dice
  font-family: monospace
  margin: 4px 0
  font-size: 0.95rem
  letter-spacing: 0.02em

.roll-result
  font-size: 1rem
  font-family: Teko
  letter-spacing: 0.06em
  text-transform: uppercase

.image-card
  border-radius: 8px
  overflow: hidden

.generated-image
  width: 100%
  max-width: 512px
  border-radius: 8px
  display: block
</style>
