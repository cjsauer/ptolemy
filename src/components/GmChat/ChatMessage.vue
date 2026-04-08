<template>
  <div class="chat-message q-my-sm" :class="msg.role">
    <div class="message-label text-caption text-grey">
      {{ msg.role === 'user' ? 'You' : 'GM' }}
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
import showdown from 'showdown';
import { IChatMessage } from 'src/components/models';
import ToolCard from './ToolCard.vue';

const converter = new showdown.Converter({
  simpleLineBreaks: true,
  openLinksInNewWindow: true,
});

export default defineComponent({
  name: 'ChatMessage',
  components: { ToolCard },
  props: {
    msg: { type: Object as PropType<IChatMessage>, required: true },
  },
  setup(props) {
    const rendered = computed(() => {
      if (typeof props.msg.content !== 'string') return '';
      return converter.makeHtml(props.msg.content);
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
    background: rgba(129, 161, 193, 0.2)
    border-radius: 12px 12px 0 12px
    padding: 8px 14px

.chat-message.assistant
  margin-right: auto
  .message-body
    background: rgba(59, 66, 82, 0.8)
    border-radius: 12px 12px 12px 0
    padding: 8px 14px

.message-label
  margin-bottom: 2px
  padding-left: 4px

.user-text
  white-space: pre-wrap

.gm-text
  :deep(p)
    margin: 4px 0
  :deep(strong)
    color: $primary
  :deep(h1)
    font-size: 1.3rem
    font-weight: bold
    margin: 12px 0 4px
    color: $primary
  :deep(h2)
    font-size: 1.15rem
    font-weight: bold
    margin: 10px 0 4px
    color: $primary
  :deep(h3)
    font-size: 1.05rem
    font-weight: bold
    margin: 8px 0 4px
    color: $primary
  :deep(h4), :deep(h5), :deep(h6)
    font-size: 1rem
    font-weight: bold
    margin: 6px 0 4px
    color: $primary
</style>
