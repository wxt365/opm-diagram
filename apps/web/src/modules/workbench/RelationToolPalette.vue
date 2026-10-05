<template>
  <section ref="paletteRef" class="relation-tool-palette" aria-label="关系工具" data-testid="p03-relation-tool-palette">
    <div class="relation-tool-palette__scroller" role="group" aria-label="OPM 关系工具 / OPM relation tools">
      <template v-for="(family, index) in families" :key="family">
        <span v-if="index > 0" class="relation-tool-palette__separator" aria-hidden="true" />
        <div class="relation-tool-palette__group" role="group" :aria-label="familyLabels[family]" :data-testid="`p03-relation-toolbar-${family}`">
          <div class="relation-tool-palette__quick-items">
            <button
              v-for="item in frequentItemsFor(family)"
              :key="itemId(item)"
              class="relation-tool-palette__quick-item"
              :class="{ 'is-active': itemActive(item) }"
              type="button"
              :disabled="itemDisabled(item)"
              :title="itemTitle(item)"
              :aria-label="itemTitle(item)"
              :data-testid="`p03-relation-quick-option-${itemId(item)}`"
              @click="activateItem(item)"
            >
              <RelationToolSymbol :symbol-id="item.symbol_descriptor.id" :label="itemLabel(item)" />
            </button>
          </div>
          <button
            :ref="(element) => setToggleRef(family, element)"
            class="relation-tool-palette__expand"
            :class="{ 'is-open': openFamily === family }"
            type="button"
            :title="expandTitle(family)"
            :aria-label="expandTitle(family)"
            aria-haspopup="menu"
            :aria-expanded="openFamily === family"
            :aria-controls="`p03-relation-menu-${family}`"
            :data-testid="`p03-relation-menu-toggle-${family}`"
            @click="toggleMenu(family)"
          >
            <ChevronDown :size="15" aria-hidden="true" />
          </button>
        </div>
      </template>
    </div>

    <section
      v-if="openFamily"
      :id="`p03-relation-menu-${openFamily}`"
      ref="menuRef"
      class="relation-tool-palette__menu"
      :style="menuStyle"
      role="menu"
      :aria-label="`${familyLabels[openFamily]}：全部关系 / All relations`"
      :data-testid="`p03-relation-menu-${openFamily}`"
    >
      <div class="relation-tool-palette__menu-grid">
        <button
          v-for="item in itemsFor(openFamily)"
          :key="itemId(item)"
          class="relation-tool-palette__menu-item"
          :class="{ 'is-active': itemActive(item) }"
          type="button"
          role="menuitem"
          :disabled="itemDisabled(item)"
          :title="itemTitle(item)"
          :aria-label="itemTitle(item)"
          :data-testid="`p03-relation-menu-option-${itemId(item)}`"
          @click="activateItem(item)"
        >
          <RelationToolSymbol :symbol-id="item.symbol_descriptor.id" :label="itemLabel(item)" />
        </button>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { ChevronDown } from "@lucide/vue";
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import type { ComponentPublicInstance } from "vue";

import RelationToolSymbol from "@/modules/workbench/RelationToolSymbol.vue";
import { isSupportedRelationToolSymbol } from "@/modules/workbench/opd/core/relation-tool-symbol";
import {
  RELATION_TOOL_ASSET_UNAVAILABLE,
  relationToolDisplayName,
  relationToolUnavailableReason,
} from "@/modules/workbench/opd/core/relation-tool-presentation";
import type { RelationCatalogItemWire } from "@/shared/api/localRuntimeApi";
import { isTransformationCapability, isTransformationMemberAvailable, TRANSFORMATION_CAPABILITIES, TRANSFORMATION_TOOL_LABEL, TRANSFORMATION_TOOL_HINT, type RelationToolIntent } from "@/modules/workbench/opd/core/transformation-tool";

type RelationCatalogFamily = RelationCatalogItemWire["family"];

const props = defineProps<{
  families: readonly RelationCatalogFamily[];
  items: readonly RelationCatalogItemWire[];
  readonly: boolean;
  activeCapabilityId?: string;
}>();

const emit = defineEmits<{
  activate: [item: RelationCatalogItemWire, intent: RelationToolIntent];
}>();

const familyLabels: Record<RelationCatalogFamily, string> = {
  PROCEDURAL: "过程关系 / Procedural",
  CONTROL: "控制关系 / Control",
  STRUCTURAL: "结构关系 / Structural",
};

const expandTitles: Readonly<Record<RelationCatalogFamily, string>> = {
  PROCEDURAL: "展开全部过程关系 / Show all procedural relations",
  CONTROL: "展开全部控制关系 / Show all control relations",
  STRUCTURAL: "展开全部结构关系 / Show all structural relations",
};

const frequentCapabilityIds: Readonly<Record<RelationCatalogFamily, readonly string[]>> = {
  PROCEDURAL: ["CAP-ISO-PROC-001", "CAP-ISO-PROC-003", "CAP-ISO-PROC-004", "CAP-ISO-PROC-005"],
  CONTROL: ["CAP-ISO-CTRL-001", "CAP-ISO-CTRL-002", "CAP-ISO-CTRL-005", "CAP-ISO-CTRL-006"],
  STRUCTURAL: ["CAP-ISO-STRUCT-001", "CAP-ISO-STRUCT-005", "CAP-ISO-STRUCT-006", "CAP-ISO-STRUCT-007", "CAP-ISO-STRUCT-008"],
};

const paletteRef = ref<HTMLElement>();
const menuRef = ref<HTMLElement>();
const openFamily = ref<RelationCatalogFamily>();
const menuStyle = ref<Record<string, string>>({});
const toggleRefs = new Map<RelationCatalogFamily, HTMLButtonElement>();
let toolbarScroller: HTMLElement | undefined;

function itemsFor(family: RelationCatalogFamily) {
  const items = props.items.filter((item) => item.family === family);
  if (family !== "PROCEDURAL") return items;
  const members = items.filter((item) => isTransformationCapability(item.capability_id));
  const representative = members.find(isTransformationMemberAvailable) ?? members[0];
  return items.flatMap((item) => isTransformationCapability(item.capability_id)
    ? item === members[0] && representative ? [representative] : []
    : [item]);
}

function frequentItemsFor(family: RelationCatalogFamily) {
  return frequentCapabilityIds[family]
    .map((capabilityId) => itemsFor(family).find((item) => itemId(item) === capabilityId))
    .filter((item): item is RelationCatalogItemWire => item !== undefined);
}

function itemDisabled(item: RelationCatalogItemWire) {
  if (isTransformationCapability(item.capability_id)) return props.readonly || !isTransformationMemberAvailable(item);
  return props.readonly || !item.enabled || !relationToolDisplayName(item.capability_id) || !isSupportedRelationToolSymbol(item.symbol_descriptor.id);
}

function itemId(item: RelationCatalogItemWire) {
  return isTransformationCapability(item.capability_id) ? TRANSFORMATION_CAPABILITIES[0] : item.capability_id;
}

function itemActive(item: RelationCatalogItemWire) {
  return isTransformationCapability(item.capability_id)
    ? isTransformationCapability(props.activeCapabilityId ?? "")
    : item.capability_id === props.activeCapabilityId;
}

function itemLabel(item: RelationCatalogItemWire) {
  if (isTransformationCapability(item.capability_id)) return TRANSFORMATION_TOOL_LABEL;
  return relationToolDisplayName(item.capability_id) ?? "关系 / Relation";
}

function itemTitle(item: RelationCatalogItemWire) {
  if (isTransformationCapability(item.capability_id)) {
    const lines = [TRANSFORMATION_TOOL_LABEL, TRANSFORMATION_TOOL_HINT];
    if (props.readonly) lines.push(relationToolUnavailableReason("READ_ONLY_REVISION"));
    for (const id of TRANSFORMATION_CAPABILITIES) {
      const member = props.items.find((entry) => entry.capability_id === id);
      if (!member || !isTransformationMemberAvailable(member)) {
        const reason = member && !member.enabled ? relationToolUnavailableReason(member.reason_codes[0]) : RELATION_TOOL_ASSET_UNAVAILABLE;
        lines.push(`${relationToolDisplayName(id)}：${reason}`);
      }
    }
    return lines.join("\n");
  }
  const label = relationToolDisplayName(item.capability_id);
  if (!label) return `关系 / Relation\n${RELATION_TOOL_ASSET_UNAVAILABLE}`;
  if (!isSupportedRelationToolSymbol(item.symbol_descriptor.id)) return `${label}\n${RELATION_TOOL_ASSET_UNAVAILABLE}`;
  if (props.readonly) return `${label}\n${relationToolUnavailableReason("READ_ONLY_REVISION")}`;
  return item.enabled ? label : `${label}\n${relationToolUnavailableReason(item.reason_codes[0])}`;
}

function expandTitle(family: RelationCatalogFamily) {
  return expandTitles[family];
}

function setToggleRef(family: RelationCatalogFamily, element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLButtonElement) toggleRefs.set(family, element);
  else toggleRefs.delete(family);
}

async function toggleMenu(family: RelationCatalogFamily) {
  if (openFamily.value === family) {
    closeMenu();
    return;
  }
  openFamily.value = family;
  await nextTick();
  updateMenuPosition();
  menuRef.value?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
}

function activateItem(item: RelationCatalogItemWire) {
  if (itemDisabled(item)) return;
  emit("activate", item, isTransformationCapability(item.capability_id) ? "TRANSFORMATION" : "SINGLE");
  closeMenu();
}

function closeMenu(restoreFocus = false) {
  const family = openFamily.value;
  openFamily.value = undefined;
  if (restoreFocus && family) toggleRefs.get(family)?.focus();
}

function updateMenuPosition() {
  if (!openFamily.value || !paletteRef.value) return;
  const toggleBounds = toggleRefs.get(openFamily.value)?.getBoundingClientRect();
  const paletteBounds = paletteRef.value.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const width = Math.min(256, Math.max(208, viewportWidth - 16));
  const wantedLeft = toggleBounds?.left ?? paletteBounds.left;
  const left = Math.max(8, Math.min(wantedLeft, Math.max(8, viewportWidth - width - 8)));
  const top = (toggleBounds?.bottom ?? paletteBounds.bottom) + 6;
  menuStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    maxHeight: `${Math.max(160, window.innerHeight - top - 8)}px`,
  };
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!paletteRef.value?.contains(event.target as Node)) closeMenu();
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape" || !openFamily.value) return;
  event.preventDefault();
  closeMenu(true);
}

onMounted(() => {
  toolbarScroller = paletteRef.value?.closest<HTMLElement>(".editor-toolbar") ?? undefined;
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  document.addEventListener("keydown", handleDocumentKeydown);
  window.addEventListener("resize", updateMenuPosition);
  toolbarScroller?.addEventListener("scroll", updateMenuPosition, { passive: true });
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
  document.removeEventListener("keydown", handleDocumentKeydown);
  window.removeEventListener("resize", updateMenuPosition);
  toolbarScroller?.removeEventListener("scroll", updateMenuPosition);
});
</script>
