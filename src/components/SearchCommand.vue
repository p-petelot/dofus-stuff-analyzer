<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import type { NavLink } from "../types/navigation";
import styles from "./SearchCommand.module.css?module";

interface SearchCommandProps {
  links: NavLink[];
  open: boolean;
}

const props = defineProps<SearchCommandProps>();
const emit = defineEmits<{
  (event: "close"): void;
}>();

type SearchItem = {
  label: string;
  href: string;
  desc?: string;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

function flattenLinks(links: NavLink[]): SearchItem[] {
  return links.flatMap((link) => {
    if (link.children && link.children.length > 0) {
      return [
        { label: link.label, href: link.href },
        ...link.children.map((child) => ({
          label: `${link.label} · ${child.label}`,
          href: child.href,
          desc: child.desc,
        })),
      ];
    }
    return [{ label: link.label, href: link.href }];
  });
}

const containerRef = ref<HTMLDivElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const query = ref("");
const router = useRouter();

const items = computed(() => flattenLinks(props.links ?? []));
const results = computed(() => {
  const term = query.value.trim().toLowerCase();
  if (!term) return items.value;
  return items.value.filter((item) =>
    [item.label, item.desc, item.href]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(term))
  );
});

function close() {
  emit("close");
}

async function handleNavigate(href: string) {
  await router.push(href);
  close();
}

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  }

  const node = containerRef.value;
  if (!node || event.key !== "Tab") return;
  const focusable = node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
};

watch(
  () => props.open,
  (open) => {
    if (open) {
      query.value = "";
      document.addEventListener("keydown", handleKeyDown);
      nextTick(() => {
        window.requestAnimationFrame(() => inputRef.value?.focus());
      });
    } else {
      document.removeEventListener("keydown", handleKeyDown);
    }
  }
);

onMounted(() => {
  if (props.open) {
    document.addEventListener("keydown", handleKeyDown);
    nextTick(() => {
      window.requestAnimationFrame(() => inputRef.value?.focus());
    });
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", handleKeyDown);
});
</script>

<template>
  <div v-if="open" :class="styles.overlay" role="presentation" @click="close">
    <div
      role="dialog"
      aria-modal="true"
      :class="styles.dialog"
      ref="containerRef"
      @click.stop
    >
      <header :class="styles.header">
        <div :class="styles.badge" aria-hidden="true">
          Commande
        </div>
        <p :class="styles.hint">
          Tapez pour naviguer. Appuyez sur <kbd>Esc</kbd> pour fermer.
        </p>
      </header>
      <div :class="styles.inputRow">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path
            d="M11 5a6 6 0 0 1 4.472 9.983l3.272 3.273a1 1 0 0 1-1.414 1.414l-3.273-3.272A6 6 0 1 1 11 5Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
            fill="currentColor"
          />
        </svg>
        <input
          ref="inputRef"
          v-model="query"
          placeholder="Rechercher une page..."
          :class="styles.input"
          aria-label="Rechercher"
        />
        <kbd :class="styles.shortcut">⌘K</kbd>
      </div>
      <div :class="styles.results">
        <p v-if="results.length === 0" :class="styles.empty">
          Aucun résultat ne correspond à votre recherche.
        </p>
        <ul v-else :class="styles.list">
          <li v-for="item in results" :key="item.href">
            <button type="button" :class="styles.result" @click="() => handleNavigate(item.href)">
              <span :class="styles.resultLabel">{{ item.label }}</span>
              <span :class="styles.resultDesc">{{ item.desc ?? item.href }}</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
