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
  height: calc(100vh - 87px) !important
  min-height: 0 !important
  max-height: calc(100vh - 87px) !important
  overflow: hidden
</style>
