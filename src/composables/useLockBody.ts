import { onBeforeUnmount, ref, unref, watch } from "vue";

export function useLockBody(locked: boolean | { value: boolean }) {
  const previousOverflow = ref<string | null>(null);

  const applyLock = (nextLocked: boolean) => {
    if (typeof document === "undefined") {
      return;
    }
    const body = document.body;

    if (nextLocked) {
      if (previousOverflow.value === null) {
        previousOverflow.value = body.style.overflow;
      }
      body.style.overflow = "hidden";
    } else if (previousOverflow.value !== null) {
      body.style.overflow = previousOverflow.value;
      previousOverflow.value = null;
    }
  };

  watch(
    () => unref(locked),
    (value) => applyLock(value),
    { immediate: true }
  );

  onBeforeUnmount(() => applyLock(false));
}
