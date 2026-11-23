<template>
  <AppLayout>
    <RouterView />
  </AppLayout>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount } from "vue";
import AppLayout from "@/layout/AppLayout.vue";
import { listenDesktopPrepare } from "@/shared/desktop";
let stopDesktopPrepare: (() => void) | undefined;
onMounted(() => { stopDesktopPrepare = listenDesktopPrepare(); });
onBeforeUnmount(() => stopDesktopPrepare?.());
</script>
