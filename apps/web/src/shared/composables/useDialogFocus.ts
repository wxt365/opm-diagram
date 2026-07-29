import { nextTick, ref, watch, type ComponentPublicInstance, type Ref } from "vue";

export function useDialogFocus(isOpen: Readonly<Ref<boolean>>, requestClose: () => void) {
  const dialogElement = ref<HTMLElement>();
  let triggerElement: HTMLElement | undefined;

  function captureTrigger() {
    const activeElement = document.activeElement;
    triggerElement = activeElement instanceof HTMLElement ? activeElement : undefined;
  }

  function closeDialog() {
    requestClose();
  }

  function onDialogKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
    }
  }

  function setDialogElement(element: Element | ComponentPublicInstance | null) {
    dialogElement.value = element instanceof HTMLElement ? element : undefined;
  }

  watch(isOpen, async (open) => {
    await nextTick();
    if (open) {
      const focusTarget = [
        "[autofocus]:not(:disabled)",
        "input:not([type='hidden']):not(:disabled)",
        "textarea:not(:disabled)",
        "select:not(:disabled)",
        "button:not(:disabled)",
      ].map((selector) => dialogElement.value?.querySelector<HTMLElement>(selector)).find(Boolean);
      focusTarget?.focus();
      return;
    }
    triggerElement?.focus();
    triggerElement = undefined;
  }, { flush: "post" });

  return { captureTrigger, closeDialog, onDialogKeydown, setDialogElement };
}
