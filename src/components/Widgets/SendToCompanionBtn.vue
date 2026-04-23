<template>
  <q-btn icon="mdi-chat" :label="label" :flat="!bordered" :outline="bordered" :dense="!bordered" @click="sendToCompanion(data)">
    <q-tooltip v-if="!label">Send to companion</q-tooltip>
  </q-btn>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { useQuasar } from 'quasar';
import { useChat } from 'src/store/chat';

export default defineComponent({
  name: 'SendToCompanionBtn',
  props: {
    data: {
      type: String,
      required: true,
    },
    bordered: {
      type: Boolean,
      default: false,
    },
    label: {
      type: String,
      default: '',
    },
  },
  setup() {
    const $q = useQuasar();
    const chat = useChat();

    const sendToCompanion = (msg: string) => {
      if (chat.inputText.length > 0 && !chat.inputText.endsWith('\n')) {
        chat.inputText += '\n';
      }
      chat.inputText += msg;
      $q.notify({
        message: 'Added to companion input',
        color: 'dark',
        position: 'top',
        icon: 'mdi-chat',
        timeout: 1000,
      });
    };

    return { sendToCompanion };
  },
});
</script>
