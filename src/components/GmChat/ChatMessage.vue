<template>
  <div class="chat-message q-my-sm" :class="msg.role">
    <div class="message-label text-caption text-grey row items-center no-wrap">
      <span>{{ msg.role === 'user' ? 'You' : 'GM' }}</span>
      <q-btn
        v-if="msg.role === 'user'"
        flat
        dense
        round
        icon="mdi-arrow-collapse-left"
        size="xs"
        color="grey-7"
        class="rewind-btn q-ml-xs"
        @click="$emit('rewind')"
      >
        <q-tooltip>Rewind and try again</q-tooltip>
      </q-btn>
    </div>
    <div class="message-body">
      <div v-if="msg.role === 'user'" class="user-text">{{ msg.content }}</div>
      <div v-else class="gm-text" v-html="rendered"></div>
      <tool-card
        v-for="(tc, i) in msg.toolCalls"
        :key="i"
        :name="tc.name"
        :result="typeof tc.result === 'string' ? JSON.parse(tc.result) : tc.result"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, PropType } from 'vue';
import { marked } from 'marked';
import { IChatMessage } from 'src/components/models';
import ToolCard from './ToolCard.vue';

marked.setOptions({
  breaks: true,
  gfm: true,
});

export default defineComponent({
  name: 'ChatMessage',
  components: { ToolCard },
  props: {
    msg: { type: Object as PropType<IChatMessage>, required: true },
  },
  emits: ['rewind'],
  setup(props) {
    const rendered = computed(() => {
      if (typeof props.msg.content !== 'string') return '';
      return marked.parse(props.msg.content) as string;
    });
    return { rendered };
  },
});
</script>

<style lang="sass" scoped>
.chat-message
  max-width: 90%

.chat-message.user
  margin-left: auto
  .message-body
    background: rgba(200, 164, 92, 0.08)
    border: 1px solid rgba(200, 164, 92, 0.15)
    border-radius: 12px 12px 0 12px
    padding: 8px 14px

.chat-message.assistant
  margin-right: auto
  .message-body
    background: rgba(20, 25, 42, 0.9)
    border: 1px solid rgba(92, 184, 224, 0.08)
    border-radius: 12px 12px 12px 0
    padding: 8px 14px

.message-label
  margin-bottom: 2px
  padding-left: 4px
  font-family: Convergence
  letter-spacing: 0.06em
  text-transform: uppercase
  font-size: 0.65rem

.user-text
  white-space: pre-wrap

.rewind-btn
  opacity: 0
  transition: opacity 0.15s

.chat-message:hover .rewind-btn
  opacity: 1

// .gm-text styles are global in app.scss
</style>
