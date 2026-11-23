<script lang="ts">
import { defineComponent, h, toHandlerKey } from "vue";
import Component from "@/shared/workbench/CanvasContextMenu.vue";

// 保留原入口；独立包装避免 SFC 编译覆盖公共组件，并转发原有事件。
const compatibilityComponent = defineComponent({
  extends: Component,
  inheritAttrs: false,
  setup(props, { attrs, slots, emit }) {
    const listeners = Object.fromEntries(["close", "autoLayout", "history", "arrange", "toggleRelationNames"].map(name => [toHandlerKey(name), (...args: unknown[]) => emit(name, ...args)]));
    return () => h(Component, { ...attrs, ...props, ...listeners }, slots);
  },
}) as typeof Component;
export default compatibilityComponent;
</script>
