<template>
  <q-btn icon="mdi-chat" flat dense @click="sendToCompanion(data)">
    <q-tooltip>Send to companion</q-tooltip>
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
