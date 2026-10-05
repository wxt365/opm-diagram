<template>
  <svg
    v-if="glyph"
    class="relation-tool-symbol"
    viewBox="0 0 56 28"
    role="img"
    :aria-label="label"
    :data-glyph-kind="glyph.kind"
    :data-state-source="glyph.stateSource ? 'true' : 'false'"
    :data-state-target="glyph.stateTarget ? 'true' : 'false'"
  >
    <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6">
      <template v-if="glyph.kind.startsWith('fan-')">
        <path :d="glyph.stateTarget ? 'M4 14H19M27 14H46' : 'M4 14H19M27 14H36M36 14V5M36 14V23M36 5H52M36 14H52M36 23H52'" />
        <polygon v-if="glyph.kind === 'fan-aggregation'" points="19,14 27,8 27,20" fill="currentColor" />
        <polygon v-else points="19,14 27,8 27,20" fill="#fff" />
        <polygon v-if="glyph.kind === 'fan-exhibition'" points="21.5,14 25.5,11 25.5,17" fill="currentColor" stroke-width="1" />
        <circle v-if="glyph.kind === 'fan-classification'" cx="24" cy="14" r="2.2" fill="currentColor" stroke="none" />
      </template>
      <template v-else-if="glyph.kind === 'self-invocation'">
        <path d="M17 21C8 21 7 5 20 4L25 7L22 10L28 13C36 16 35 23 29 24" />
        <polygon points="29,24 34,20 34,26" fill="#fff" />
      </template>
      <template v-else-if="glyph.kind === 'invocation'">
        <path d="M4 14H15L19 8L24 20L29 8L34 14H47" />
        <polygon points="47,14 40,8 40,20" fill="#fff" />
      </template>
      <template v-else-if="glyph.kind === 'overtime' || glyph.kind === 'undertime'">
        <path d="M4 14H52" />
        <path d="M43 8L48 20" />
        <path v-if="glyph.kind === 'undertime'" d="M38 8L43 20" />
      </template>
      <template v-else-if="glyph.kind === 'tagged-bidirectional'">
        <path d="M4 14H52M4 14L11 8M52 14L45 20" />
      </template>
      <template v-else-if="glyph.kind === 'state-effect-pair'">
        <path d="M10 14H21M34 14H46" />
        <polygon points="21,14 16,10 16,18" fill="#fff" />
        <polygon points="46,14 41,10 41,18" fill="#fff" />
        <ellipse cx="27.5" cy="14" rx="6.5" ry="5" fill="#fff" stroke-width="1.2" />
        <rect v-if="!glyph.stateSource" x="1" y="8" width="9" height="12" fill="#fff" stroke-width="1.2" />
        <rect v-if="!glyph.stateTarget" x="46" y="8" width="9" height="12" fill="#fff" stroke-width="1.2" />
      </template>
      <template v-else>
        <path :d="binaryLine" />
        <path v-if="glyph.kind === 'tagged-directed'" :d="`M${targetX} 14L${targetX - 8} 8M${targetX} 14L${targetX - 8} 20`" />
        <polygon v-if="usesClosedTarget" :points="`${targetX},14 ${targetX - 8},8 ${targetX - 8},20`" fill="#fff" />
        <circle v-if="usesFilledCircle" cx="48" cy="14" r="4" fill="currentColor" />
        <circle v-if="glyph.kind === 'open-circle'" cx="48" cy="14" r="4" fill="#fff" />
      </template>
      <rect v-if="glyph.stateSource" x="1" y="8" width="9" height="12" rx="3" fill="#fff" stroke-width="1.2" />
      <rect v-if="glyph.stateTarget" x="46" y="8" width="9" height="12" rx="3" fill="#fff" stroke-width="1.2" />
    </g>
    <text v-if="glyph.annotation" x="36" y="10" fill="currentColor" font-size="10" font-weight="700">{{ glyph.annotation }}</text>
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { resolveRelationToolGlyph } from "@/modules/workbench/opd/core/relation-tool-symbol";

const props = defineProps<{
  symbolId: string;
  label: string;
}>();

const glyph = computed(() => resolveRelationToolGlyph(props.symbolId));
const sourceX = computed(() => glyph.value?.stateSource ? 10 : 6);
const targetX = computed(() => glyph.value?.stateTarget ? 46 : 50);
const binaryLine = computed(() => `M${glyph.value?.stateSource ? sourceX.value : 4} 14H${targetX.value}`);
const usesClosedTarget = computed(() => glyph.value?.kind === "closed-target" || glyph.value?.kind === "control-closed");
const usesFilledCircle = computed(() => glyph.value?.kind === "filled-circle" || glyph.value?.kind === "control-filled-circle");
</script>
