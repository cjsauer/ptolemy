<template>
  <q-page class="full-height">
    <gm-chat />
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import GmChat from 'src/components/GmChat/GmChat.vue';

export default defineComponent({
  name: 'PlayPage',
  components: { GmChat },
});
</script>

<style lang="sass" scoped>
.q-page
  display: flex
  flex-direction: column
</style>
