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

.gm-text
  :deep(p)
    margin: 4px 0
  :deep(strong)
    color: $primary
  :deep(em)
    color: rgba(255, 255, 255, 0.7)
  :deep(a)
    color: $info
    text-decoration: none
    border-bottom: 1px solid rgba(92, 184, 224, 0.3)
    &:hover
      color: lighten($info, 10%)
  :deep(h1)
    font-family: Teko
    font-size: 1.4rem
    font-weight: normal
    letter-spacing: 0.04em
    margin: 12px 0 4px
    color: $primary
  :deep(h2)
    font-family: Teko
    font-size: 1.25rem
    font-weight: normal
    letter-spacing: 0.04em
    margin: 10px 0 4px
    color: $primary
  :deep(h3)
    font-family: Teko
    font-size: 1.1rem
    font-weight: normal
    letter-spacing: 0.04em
    margin: 8px 0 4px
    color: $primary
  :deep(h4), :deep(h5), :deep(h6)
    font-size: 1rem
    font-weight: bold
    margin: 6px 0 4px
    color: rgba(200, 164, 92, 0.8)
  :deep(ul), :deep(ol)
    padding-left: 20px
    margin: 4px 0
  :deep(li)
    margin: 2px 0
  :deep(code)
    background: rgba(200, 164, 92, 0.08)
    padding: 1px 4px
    border-radius: 3px
    font-size: 0.9em
</style>
