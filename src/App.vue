<template>
  <router-view v-if="loaded" />
</template>
<script lang="ts">
import { defineComponent, watch, ref, onMounted } from 'vue';

import { useConfig } from './store/config';
import { useCampaign } from './store/campaign';
import { useAssets } from './store/assets';
import { useOracles } from './store/oracles';

import { debounce, useQuasar } from 'quasar';
import { sleep } from './lib/util';
import { isSignedIn, wasSignedIn, pushCampaign, sync as driveSync } from './lib/gdrive-sync';

export default defineComponent({
  name: 'App',
  setup() {
    const loaded = ref(false);

    const $q = useQuasar();
    $q.dark.set(true);

    const campaign = useCampaign();

    const config = useConfig();

    const initialiseData = async () => {
      const assets = useAssets();
      const oracles = useOracles();

      await campaign.populateStore().catch((err) => console.log(err));
      await assets.populateStore().catch((err) => console.log(err));
      await oracles.populateStore().catch((err) => console.log(err));
    };

    onMounted(async () => {
      await initialiseData();
      loaded.value = true;

      // Auto-sync if we have a valid token from localStorage
      if (isSignedIn()) {
        try {
          const result = await driveSync();
          if (result.updated > 0) {
            await campaign.load(config.data.current);
            console.log(`[Drive] Pulled ${result.updated} updated campaign(s)`);
          }
        } catch (e) {
          console.log('[Drive] Auto-sync failed:', e);
          $q.notify({
            message: 'Drive sync token expired. Reconnect in Settings.',
            color: 'warning',
            icon: 'mdi-google-drive',
            position: 'top',
            timeout: 5000,
          });
        }
      } else if (wasSignedIn()) {
        $q.notify({
          message: 'Drive sync inactive — token expired. Reconnect in Settings.',
          color: 'warning',
          icon: 'mdi-google-drive',
          position: 'top',
          timeout: 5000,
        });
      }
    });

    watch(
      () => config.$state,
      async () => {
        await config.save();
      },
      { deep: true }
    );

    watch(
      () => config.$state.data.current,
      async () => {
        await campaign.load(config.data.current);
      }
    );

    watch(
      () => campaign.$state,
      debounce(async () => {
        config.data.saving = true;
        await campaign.save();
        if (isSignedIn()) {
          pushCampaign(campaign.data).catch((err) => console.log('[Drive] Push failed:', err));
        }
        await sleep(200);
        config.data.saving = false;
      }, 3000),
      { deep: true }
    );

    return {
      loaded,
    };
  },
});
</script>

<style lang="sass">
.card-bg
  background: $bg-card

.asset-bg
  background-color: $dark-page

.asset-card
  width: 350px

.field
  background: $field

p
  margin-bottom: 5px
  padding-bottom: 0px

.asset-text > ul
  padding: 5px
  margin: 0
  list-style-type: '-'

.asset-text > ul > li
  margin-top: 3px

.crt::before
  content: " "
  display: block
  position: absolute
  top: 0
  left: 0
  bottom: 0
  right: 0
  background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))
  z-index: 2
  background-size: 100% 2px, 3px 100%
  pointer-events: none

@keyframes flicker
  0%
    opacity: 0.27861
  5%
    opacity: 0.34769
  10%
    opacity: 0.23604
  15%
    opacity: 0.90626
  20%
    opacity: 0.18128
  25%
    opacity: 0.83891
  30%
    opacity: 0.65583
  35%
    opacity: 0.67807
  40%
    opacity: 0.26559
  45%
    opacity: 0.84693
  50%
    opacity: 0.96019
  55%
    opacity: 0.08594
  60%
    opacity: 0.20313
  65%
    opacity: 0.71988
  70%
    opacity: 0.53455
  75%
    opacity: 0.37288
  80%
    opacity: 0.71428
  85%
    opacity: 0.70419
  90%
    opacity: 0.7003
  95%
    opacity: 0.36108
  100%
    opacity: 0.24387

.crt::after
  content: " "
  display: block
  position: absolute
  top: 0
  left: 0
  bottom: 0
  right: 0
  background: rgba(18, 16, 16, 0.1)
    opacity: 0
  z-index: 2
  pointer-events: none
  animation: flicker 0.15s infinite
</style>
