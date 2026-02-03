<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRefs, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import SearchCommand from "./SearchCommand.vue";
import { useLanguage } from "../lib/i18n";
import {
  DEFAULT_THEME_KEY,
  THEME_OPTIONS,
  applyThemeToDocument,
  loadStoredTheme,
  persistTheme,
} from "../lib/theme-controller";
import { useLockBody } from "../composables/useLockBody";
import type { NavBrand, NavLink } from "../types/navigation";
import styles from "./Navbar.module.css?module";

const props = withDefaults(
  defineProps<{
    brand: NavBrand;
    links: NavLink[];
    enableSearch?: boolean;
    enableThemeToggle?: boolean;
    className?: string;
  }>(),
  {
    enableSearch: false,
    enableThemeToggle: false,
    className: "",
  }
);

const { brand, links, enableSearch, enableThemeToggle, className } = toRefs(props);

const route = useRoute();
const router = useRouter();
const languageStore = useLanguage();
const { language, languages: languageOptions } = storeToRefs(languageStore);
const { setLanguage, t } = languageStore;

const activePath = ref(route.path ?? "/");
const isScrolled = ref(false);
const mobileOpen = ref(false);
const searchOpen = ref(false);
const mobileSection = ref<string | null>(null);
const dropdownOpen = ref<string | null>(null);
const themeMenuOpen = ref(false);
const languageMenuOpen = ref(false);
const theme = ref<typeof DEFAULT_THEME_KEY | (typeof THEME_OPTIONS)[number]["key"]>(DEFAULT_THEME_KEY);
const indicator = ref({ width: 0, left: 0, opacity: 0 });

const navListRef = ref<HTMLUListElement | null>(null);
const mobileDrawerRef = ref<HTMLDivElement | null>(null);
const themeMenuRef = ref<HTMLDivElement | null>(null);
const themeTriggerRef = ref<HTMLButtonElement | null>(null);
const languageMenuRef = ref<HTMLDivElement | null>(null);
const languageTriggerRef = ref<HTMLButtonElement | null>(null);
const dropdownIntentRef = ref<number | null>(null);
const indicatorTargetRef = ref<HTMLElement | null>(null);

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

const gradientId = `brand-${Math.random().toString(36).slice(2, 8)}`;

const resolvedLinks = computed(() => links.value ?? []);

const themeOptions = computed(() =>
  THEME_OPTIONS.map((option) => {
    const label = t(option.labelKey);
    const normalized = typeof label === "string" ? label : String(label ?? "");
    return { ...option, label: normalized };
  })
);

const activeThemeOption = computed(
  () => themeOptions.value.find((entry) => entry.key === theme.value) ?? themeOptions.value[0] ?? null
);

const themeSelectorLabel = computed(() => {
  const label = t("theme.selectorAria");
  return typeof label === "string" && label.trim().length > 0 ? label : "Sélection du thème";
});

const languageSelectorLabel = computed(() => {
  const label = t("language.selectorAria");
  return typeof label === "string" && label.trim().length > 0 ? label : "Langue";
});

const activeLanguageOption = computed(
  () => languageOptions.value.find((entry) => entry.code === language.value) ?? null
);

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function clearDropdownIntent() {
  if (dropdownIntentRef.value !== null) {
    window.clearTimeout(dropdownIntentRef.value);
    dropdownIntentRef.value = null;
  }
}

function openDropdown(href: string | null) {
  clearDropdownIntent();
  dropdownOpen.value = href;
}

function closeDropdown() {
  clearDropdownIntent();
  dropdownOpen.value = null;
}

function scheduleDropdownClose() {
  clearDropdownIntent();
  dropdownIntentRef.value = window.setTimeout(() => {
    dropdownOpen.value = null;
    dropdownIntentRef.value = null;
  }, 320);
}

function updateIndicator(element: HTMLElement | null) {
  if (!navListRef.value) {
    indicatorTargetRef.value = element;
    return;
  }
  if (!element) {
    indicatorTargetRef.value = null;
    indicator.value = { ...indicator.value, opacity: 0 };
    return;
  }
  indicatorTargetRef.value = element;
  const listRect = navListRef.value.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  indicator.value = {
    width: elementRect.width,
    left: elementRect.left - listRect.left,
    opacity: 1,
  };
}

function resetIndicatorToActive() {
  if (!navListRef.value) return;
  const activeElement = navListRef.value.querySelector<HTMLElement>('[data-active-link="true"]');
  updateIndicator(activeElement ?? null);
}

function isActive(href: string) {
  if (!activePath.value) return false;
  if (href === "/") {
    return activePath.value === "/";
  }
  return activePath.value.startsWith(href);
}

async function navigateAndClose(href: string) {
  await router.push(href);
  mobileOpen.value = false;
}

function handleThemeSelect(nextTheme: string) {
  if (nextTheme === theme.value) {
    themeMenuOpen.value = false;
    return;
  }
  theme.value = nextTheme;
  themeMenuOpen.value = false;
}

function handleLanguageSelect(code: string) {
  if (!code || code === language.value) {
    languageMenuOpen.value = false;
    return;
  }
  setLanguage(code);
  languageMenuOpen.value = false;
}

function closePreferenceMenus() {
  themeMenuOpen.value = false;
  languageMenuOpen.value = false;
}

useLockBody(computed(() => mobileOpen.value || searchOpen.value));

watch(
  () => route.path,
  () => {
    activePath.value = route.path ?? "/";
    closePreferenceMenus();
    dropdownOpen.value = null;
    mobileOpen.value = false;
    mobileSection.value = null;
    searchOpen.value = false;
    nextTick(() => resetIndicatorToActive());
  }
);

watch(
  () => theme.value,
  (value) => {
    applyThemeToDocument(value);
    persistTheme(value);
  },
  { immediate: true }
);

onMounted(() => {
  const storedTheme = loadStoredTheme();
  theme.value = storedTheme;
});

const handleResize = () => {
  if (indicatorTargetRef.value) {
    updateIndicator(indicatorTargetRef.value);
  } else {
    resetIndicatorToActive();
  }
};

const handleScroll = () => {
  isScrolled.value = window.scrollY > 8;
};

const handleShortcut = (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchOpen.value = !searchOpen.value;
  }
};

onMounted(() => {
  window.addEventListener("resize", handleResize);
  window.addEventListener("scroll", handleScroll, { passive: true });
  document.addEventListener("keydown", handleShortcut);

  handleScroll();
  resetIndicatorToActive();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("scroll", handleScroll);
  document.removeEventListener("keydown", handleShortcut);
});

watch(
  () => themeMenuOpen.value || languageMenuOpen.value,
  (open, _old, onCleanup) => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const withinTheme =
        themeMenuRef.value?.contains(target) || themeTriggerRef.value?.contains(target);
      const withinLanguage =
        languageMenuRef.value?.contains(target) || languageTriggerRef.value?.contains(target);
      if (withinTheme || withinLanguage) {
        return;
      }
      closePreferenceMenus();
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePreferenceMenus();
      }
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);

    onCleanup(() => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    });
  }
);

watch(
  () => mobileOpen.value,
  (open, _old, onCleanup) => {
    if (!open) {
      mobileSection.value = null;
      return;
    }
    const node = mobileDrawerRef.value;
    if (!node) return;
    const focusable = node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    const first = focusable[0] ?? null;
    const last = focusable[focusable.length - 1] ?? null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        mobileOpen.value = false;
      }
      if (event.key === "Tab" && focusable.length > 0) {
        if (event.shiftKey && first && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && last && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => {
      first?.focus();
    });

    onCleanup(() => {
      document.removeEventListener("keydown", handleKeyDown);
    });
  }
);
</script>

<template>
  <nav
    :class="classNames(styles.navbar, isScrolled && styles.navbarPinned, className)"
    :data-scrolled="isScrolled || undefined"
  >
    <div :class="classNames(styles.inner, isScrolled && styles.innerScrolled)">
      <div :class="styles.brandArea">
        <RouterLink :to="brand.href" :class="styles.brandLink" :aria-label="brand.label">
          <component v-if="brand.logo" :is="brand.logo" :class="styles.brandIcon" />
          <template v-else>
            <svg aria-hidden="true" viewBox="0 0 160 160" focusable="false" :class="styles.brandIcon">
              <defs>
                <radialGradient :id="`${gradientId}-shell`" cx="52%" cy="28%" r="72%">
                  <stop offset="0%" stop-color="var(--logo-highlight)" stop-opacity="0.18" />
                  <stop offset="38%" stop-color="var(--logo-secondary)" stop-opacity="0.92" />
                  <stop offset="100%" stop-color="var(--logo-primary)" />
                </radialGradient>
                <radialGradient :id="`${gradientId}-aura`" cx="44%" cy="68%" r="46%">
                  <stop offset="0%" stop-color="rgba(255, 255, 255, 0.36)" />
                  <stop offset="75%" stop-color="rgba(255, 255, 255, 0.0)" />
                </radialGradient>
                <linearGradient :id="`${gradientId}-highlight`" x1="12%" y1="12%" x2="88%" y2="88%">
                  <stop offset="0%" stop-color="rgba(255, 255, 255, 0.75)" />
                  <stop offset="42%" stop-color="rgba(255, 255, 255, 0.22)" />
                  <stop offset="100%" stop-color="rgba(255, 255, 255, 0)" />
                </linearGradient>
                <linearGradient :id="`${gradientId}-swirl`" x1="0%" y1="50%" x2="100%" y2="50%">
                  <stop offset="0%" stop-color="var(--logo-highlight)" />
                  <stop offset="58%" stop-color="var(--logo-highlight-strong)" />
                  <stop offset="100%" stop-color="var(--logo-secondary)" />
                </linearGradient>
              </defs>
              <g transform="translate(16 8)">
                <path
                  d="M64 0C41.5 0 22 30.4 22 68s19.5 68 42 68 42-30.4 42-68S86.5 0 64 0Z"
                  :fill="`url(#${gradientId}-shell)`"
                />
                <path
                  d="M64 4c-19 0-36 28-36 64 0 30.7 14.8 55.6 32.8 59.4a4 4 0 0 0 1.6-.02c18-3.6 32.6-28.7 32.6-59.38C95 32 83 4 64 4Z"
                  fill="rgba(12, 20, 26, 0.16)"
                  opacity="0.4"
                />
                <path
                  d="M78.6 37.2c-2.6-6.2-8.4-10.2-15.2-10.2-6.3 0-12 3.2-14.9 8.6L41 51.6a8 8 0 0 1-7 4.2h-7.8c-1.7 0-3 1.5-2.7 3.2l2.1 12.3c.2 1.1 1 2 2 2.4l5.4 2c2.8 1 5 3 6.4 5.6l4.8 9.3c.5 1 1.5 1.7 2.6 1.7h10.4c1.9 0 3.5 1.4 3.7 3.3l1.4 11.8c.2 1.5 1.5 2.6 3 2.6h12.4c1.4 0 2.7-1 3-2.4l4.5-19.6c.3-1.1.9-2.1 1.8-2.8l8.3-6.5c.8-.6 1.2-1.6 1.1-2.6l-1.4-15.6c-.1-1.2-.7-2.2-1.7-2.9l-5.5-3.8c-1.1-.7-1.9-1.8-2.2-3.1l-2.8-11.2Z"
                  fill="rgba(5, 11, 16, 0.35)"
                  opacity="0.65"
                />
                <path
                  d="M81.8 47.6c-3.5 0-6.6 2-8.2 5.1l-2.8 5.3c-.5 1-1.5 1.7-2.6 1.7h-7.8c-6.3 0-11.4 5.1-11.4 11.4v3.8c0 2.8 1 5.6 2.9 7.7l8.6 9.5c1 1.1 2.4 1.7 3.8 1.7h12.8c9.8 0 17.8-8 17.8-17.8V62.4c0-5.6-4.6-10.2-10.2-10.2H81.8Z"
                  fill="rgba(12, 28, 40, 0.35)"
                  opacity="0.5"
                />
                <path
                  d="M73.5 40.4c-2.1-4.3-6.6-7-11.5-7-4.8 0-9.1 2.6-11.2 6.8L44 54.8a6 6 0 0 1-5.3 3.3h-5.6c-1.2 0-2.1 1.1-1.8 2.3l1.5 8.8c.1.8.7 1.5 1.5 1.8l3.9 1.5c2 0.8 3.6 2.3 4.6 4.2l3.4 6.6a2.8 2.8 0 0 0 2.5 1.6h7.3c1.3 0 2.4 1 2.5 2.3l1 8.4c.2 1.1 1.1 2 2.2 2h8.7c1 0 1.9-.7 2.2-1.7l3.2-14c.2-.8.7-1.5 1.3-2l6.1-4.6c.6-.4.9-1.1.8-1.8l-1-11.2c-.1-.8-.5-1.5-1.2-1.9l-4-2.7c-.8-.5-1.4-1.3-1.6-2.2l-2-8Z"
                  fill="var(--logo-depth)"
                />
                <path
                  d="M63.6 53.5c-1.8 3.5-5.4 5.7-9.3 5.7h-4.8c-1.4 0-2.4 1.4-1.9 2.7 4.6 12.4 16.3 20.7 29.6 20.7h7.2c.9 0 1.7-.7 1.8-1.6l1.1-8.8c.1-.8-.4-1.5-1.1-1.8l-6.4-2.4c-.8-.3-1.3-1-1.4-1.8l-.6-6.3c-.1-1.1-.9-2-2-2.2l-6.1-1.2a2.2 2.2 0 0 1-1.7-3.1l2.5-5.3c.4-.8-.3-1.7-1.2-1.7-2.8.2-5.5 1.9-6.7 4.3Z"
                  fill="rgba(255, 255, 255, 0.08)"
                />
                <path
                  d="M64 16c-10 0-20.8 9.4-26.5 23.3 5.8-7 13.6-11 21.5-11 16.6 0 30 16.3 30 36.4 0 8.1-2.2 15.5-6 21.3 9-7.8 15-20.9 15-35 0-19.3-14.8-35-33-35Z"
                  :fill="`url(#${gradientId}-aura)`"
                />
                <path
                  d="M100.6 48.8c4.2-1.2 8.5 1.9 8.7 6.3.5 8.2-3.6 16.2-10.6 21l-24.2 16.6c-1.1.8-2.6 1-3.9.5l-7.1-2.9c-1.1-.5-2.3.4-2.1 1.6l1.8 11.6c.2 1.6 1.6 2.7 3.2 2.5 23.5-3.5 41.1-24 41.1-48.9 0-2.8-2.7-5-5.6-4.3l-1.3.3c-1.4.4-2.7-.9-2.4-2.3l.6-1.9c.2-.6.7-1.1 1.3-1.3Z"
                  :fill="`url(#${gradientId}-highlight)`"
                  opacity="0.75"
                />
                <path
                  d="M38 92c4.6 8.8 14 14.8 24.2 14.8 6.8 0 13.5-2.5 18.8-7l1-.8c.8-.6 1.9-.4 2.4.4l1.6 2.8c.3.6.2 1.3-.3 1.8C78.8 111 70.5 115 61 115 48.5 115 37 108.3 30.8 97.4c-.5-.9-.1-2 .8-2.4l3.8-1.9c.9-.5 2.1-.1 2.6.9Z"
                  :stroke="`url(#${gradientId}-swirl)`"
                  fill="none"
                  stroke-width="4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  opacity="0.9"
                />
                <path
                  d="M94.8 28.2c1-.6 2.3-.2 2.7.8l2.4 5.7c.3.7 0 1.5-.7 1.9C81 47.5 71 68.7 71 90.8v2c0 1.3-1.3 2.1-2.5 1.6l-6.2-2.6c-.8-.4-1.2-1.2-1-2.1 4.5-21.4 17.5-40 33.5-52.5Z"
                  fill="rgba(255, 255, 255, 0.16)"
                />
                <path
                  d="M41.8 32c-1-.5-2.2 0-2.6 1l-3.2 7.5c-.3.8.1 1.7.9 2 11.2 4.5 21 13.4 26.8 24.5.5 1 1.7 1.4 2.6.8l5.3-3.2c.7-.5 1-1.4.6-2.2-6.4-13.4-17.7-24-30.4-30.4Z"
                  fill="rgba(255, 255, 255, 0.12)"
                />
              </g>
              <path
                d="M32 96c-2 6.6 1.4 13.6 7.8 16.3l12.7 5.4c1 .4 2-.4 1.9-1.5l-.5-5.6c-.1-1 1-1.7 1.8-1.2l6.8 4.1c.8.5 1.9.2 2.3-.7l2.6-5.6c.4-.9 1.6-1.1 2.3-.4l4.7 4.7c.6.6 1.6.6 2.2 0l6.6-6.6c.7-.7 1.8-.6 2.4.2l5.4 7.2c.6.8 1.8.8 2.5.1l9.4-9.4c.7-.7.6-1.8-.2-2.4L82 90.5"
                :stroke="`url(#${gradientId}-swirl)`"
                fill="none"
                stroke-width="4"
                stroke-linecap="round"
                stroke-linejoin="round"
                opacity="0.9"
              />
              <path
                d="M124 64c2.2-5.4-.7-11.7-6.4-13.6l-12.6-4.2c-.9-.3-1.8.4-1.7 1.4l.3 4.8c.1 1-1 1.7-1.8 1.2l-6.9-3.9c-.8-.5-1.9-.1-2.2.8l-2.1 6c-.3.9-1.5 1.2-2.2.5l-4.8-4.7c-.7-.6-1.7-.6-2.3 0l-7.6 7.6"
                :stroke="`url(#${gradientId}-swirl)`"
                fill="none"
                stroke-width="3.2"
                stroke-linecap="round"
                stroke-linejoin="round"
                opacity="0.65"
              />
            </svg>
          </template>
          <span :class="styles.brandText">{{ brand.label }}</span>
        </RouterLink>
      </div>

      <div :class="styles.desktopNav">
        <div
          :class="styles.navListWrapper"
          @mouseleave="(event) => {
            const next = event.relatedTarget as Node | null;
            if (next && (event.currentTarget as HTMLElement).contains(next)) return;
            scheduleDropdownClose();
            resetIndicatorToActive();
          }"
          @blur="(event) => {
            const next = event.relatedTarget as Node | null;
            if (!(event.currentTarget as HTMLElement).contains(next)) {
              closeDropdown();
              resetIndicatorToActive();
            }
          }"
        >
          <ul :class="styles.navList" ref="navListRef">
            <li
              v-for="link in resolvedLinks"
              :key="link.href"
              :class="styles.navItem"
              v-if="link.children && link.children.length > 0"
              @mouseenter="() => openDropdown(link.href)"
              @mouseleave="(event) => {
                const next = event.relatedTarget as Node | null;
                if (next && (event.currentTarget as HTMLElement).contains(next)) return;
                scheduleDropdownClose();
                resetIndicatorToActive();
              }"
              @focus.capture="() => openDropdown(link.href)"
              @blur="(event) => {
                const next = event.relatedTarget as Node | null;
                if (!(event.currentTarget as HTMLElement).contains(next)) {
                  closeDropdown();
                  resetIndicatorToActive();
                }
              }"
            >
              <button
                type="button"
                :class="classNames(styles.navLink, isActive(link.href) && styles.navLinkActive)"
                :data-active-link="isActive(link.href) ? 'true' : undefined"
                :aria-expanded="dropdownOpen === link.href"
                aria-haspopup="menu"
                @click="(event) => {
                  const expanded = dropdownOpen === link.href;
                  if (expanded) {
                    closeDropdown();
                    resetIndicatorToActive();
                  } else {
                    openDropdown(link.href);
                    updateIndicator(event.currentTarget as HTMLElement);
                  }
                }"
                @mouseenter="(event) => {
                  openDropdown(link.href);
                  updateIndicator(event.currentTarget as HTMLElement);
                }"
                @focus="(event) => {
                  openDropdown(link.href);
                  updateIndicator(event.currentTarget as HTMLElement);
                }"
              >
                {{ link.label }}
                <svg aria-hidden="true" viewBox="0 0 24 24" :class="styles.navCaret">
                  <path
                    d="M6.293 9.293a1 1 0 0 1 1.414 0L12 13.586l4.293-4.293a1 1 0 1 1 1.414 1.414l-5 5a1 1 0 0 1-1.414 0l-5-5a1 1 0 0 1 0-1.414Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
              <div
                v-if="dropdownOpen === link.href"
                :class="styles.dropdown"
                tabindex="-1"
                @mouseenter="() => openDropdown(link.href)"
                @mouseleave="() => {
                  scheduleDropdownClose();
                  resetIndicatorToActive();
                }"
              >
                <p :class="styles.dropdownLabel">{{ link.label }}</p>
                <ul :class="styles.dropdownList">
                  <li v-for="child in link.children" :key="child.href">
                    <RouterLink
                      :to="child.href"
                      :class="classNames(
                        styles.dropdownLink,
                        isActive(child.href) && styles.dropdownLinkActive
                      )"
                      :aria-current="isActive(child.href) ? 'page' : undefined"
                      @click="closeDropdown"
                    >
                      <span>{{ child.label }}</span>
                      <span :class="styles.dropdownDesc">{{ child.desc }}</span>
                    </RouterLink>
                  </li>
                </ul>
              </div>
            </li>
            <li
              v-else
              :key="link.href"
              :class="styles.navItem"
            >
              <RouterLink
                :to="link.href"
                :class="classNames(styles.navLink, isActive(link.href) && styles.navLinkActive)"
                :aria-current="isActive(link.href) ? 'page' : undefined"
                :data-active-link="isActive(link.href) ? 'true' : undefined"
                @mouseenter="(event) => updateIndicator(event.currentTarget as HTMLElement)"
                @focus="(event) => updateIndicator(event.currentTarget as HTMLElement)"
              >
                {{ link.label }}
              </RouterLink>
            </li>
          </ul>
          <span
            :class="styles.navIndicator"
            :style="{ width: `${indicator.width}px`, transform: `translateX(${indicator.left}px)`, opacity: indicator.opacity }"
            aria-hidden="true"
          />
        </div>

        <div :class="styles.actions">
          <button
            v-if="enableSearch"
            type="button"
            :class="styles.iconButton"
            @click="() => (searchOpen = true)"
            aria-label="Ouvrir la recherche"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path
                d="M11 5a6 6 0 0 1 4.472 9.983l3.272 3.273a1 1 0 0 1-1.414 1.414l-3.273-3.272A6 6 0 1 1 11 5Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
                fill="currentColor"
              />
            </svg>
          </button>

          <div v-if="enableThemeToggle" :class="styles.themeToggle" ref="themeMenuRef">
            <button
              type="button"
              :class="styles.themeTrigger"
              @click="() => { themeMenuOpen = !themeMenuOpen; languageMenuOpen = false; }"
              aria-haspopup="menu"
              :aria-expanded="themeMenuOpen"
              :aria-label="themeSelectorLabel"
              ref="themeTriggerRef"
            >
              <span :class="styles.themeIcon" aria-hidden="true">
                {{ activeThemeOption?.icon ?? "🌙" }}
              </span>
              <span :class="styles.themeLabel" aria-hidden="true">
                {{ activeThemeOption?.label ?? "Thème" }}
              </span>
              <span class="sr-only">{{ themeSelectorLabel }}</span>
            </button>
            <div
              v-if="themeMenuOpen"
              :class="styles.themeMenu"
              role="menu"
              :aria-label="themeSelectorLabel"
            >
              <button
                v-for="option in themeOptions"
                :key="option.key"
                type="button"
                role="menuitemradio"
                :aria-checked="theme === option.key"
                :class="classNames(styles.themeOption, theme === option.key && styles.themeOptionActive)"
                @click="() => handleThemeSelect(option.key)"
              >
                <span :class="styles.themeOptionIcon" aria-hidden="true">{{ option.icon }}</span>
                <span :class="styles.themeOptionLabel">{{ option.label }}</span>
              </button>
            </div>
          </div>

          <div v-if="languageOptions.length" :class="styles.languageToggle" ref="languageMenuRef">
            <button
              type="button"
              :class="styles.languageTrigger"
              @click="() => { languageMenuOpen = !languageMenuOpen; themeMenuOpen = false; }"
              aria-haspopup="menu"
              :aria-expanded="languageMenuOpen"
              :aria-label="languageSelectorLabel"
              ref="languageTriggerRef"
            >
              <span v-if="activeLanguageOption" :class="styles.languageFlag" aria-hidden="true">
                <img :src="activeLanguageOption.flag" alt="" loading="lazy" />
              </span>
              <span v-else :class="styles.languageIcon" aria-hidden="true">🌐</span>
              <span :class="styles.languageLabel" aria-hidden="true">
                {{ activeLanguageOption?.label ?? "Langue" }}
              </span>
              <span class="sr-only">{{ languageSelectorLabel }}</span>
            </button>
            <div
              v-if="languageMenuOpen"
              :class="styles.languageMenu"
              role="menu"
              :aria-label="languageSelectorLabel"
            >
              <button
                v-for="option in languageOptions"
                :key="option.code"
                type="button"
                role="menuitemradio"
                :aria-checked="language === option.code"
                :class="classNames(styles.languageOption, language === option.code && styles.languageOptionActive)"
                @click="() => handleLanguageSelect(option.code)"
              >
                <span :class="styles.languageOptionFlag" aria-hidden="true">
                  <img :src="option.flag" alt="" loading="lazy" />
                </span>
                <span :class="styles.languageOptionLabel">{{ option.label }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div :class="styles.mobileControls">
        <button
          v-if="enableSearch"
          type="button"
          :class="styles.iconButton"
          @click="() => (searchOpen = true)"
          aria-label="Ouvrir la recherche"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path
              d="M11 5a6 6 0 0 1 4.472 9.983l3.272 3.273a1 1 0 0 1-1.414 1.414l-3.273-3.272A6 6 0 1 1 11 5Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
              fill="currentColor"
            />
          </svg>
        </button>
        <button
          type="button"
          :class="styles.iconButton"
          @click="() => (mobileOpen = true)"
          :aria-expanded="mobileOpen"
          aria-controls="mobile-nav"
          aria-label="Ouvrir le menu"
        >
          <span class="sr-only">Ouvrir le menu</span>
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path
              d="M4 7a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Zm0 5a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Zm1 4a1 1 0 1 0 0 2h14a1 1 0 1 0 0-2H5Z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>
    </div>
  </nav>

  <div
    v-if="mobileOpen"
    :class="styles.mobileOverlay"
    role="dialog"
    aria-modal="true"
    @click="() => (mobileOpen = false)"
  >
    <div
      id="mobile-nav"
      ref="mobileDrawerRef"
      :class="styles.mobilePanel"
      @click.stop
    >
      <div :class="styles.mobileHeader">
        <RouterLink :to="brand.href" :class="styles.mobileBrand" @click="() => (mobileOpen = false)">
          <span>{{ brand.label }}</span>
        </RouterLink>
        <button
          type="button"
          :class="styles.iconButton"
          @click="() => (mobileOpen = false)"
          aria-label="Fermer le menu"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path
              d="M6.225 4.811a1 1 0 0 1 1.414 0L12 9.172l4.361-4.361a1 1 0 0 1 1.414 1.414L13.414 10.5l4.361 4.361a1 1 0 1 1-1.414 1.414L12 11.914l-4.361 4.361a1 1 0 1 1-1.414-1.414L10.586 10.5 6.225 6.139a1 1 0 0 1 0-1.414Z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>

      <div :class="styles.mobileContent">
        <ul :class="styles.mobileList">
          <li v-for="link in resolvedLinks" :key="link.href">
            <template v-if="link.children && link.children.length > 0">
              <button
                type="button"
                :class="classNames(styles.mobileSectionButton, mobileSection === link.href && styles.mobileSectionButtonExpanded)"
                @click="() => (mobileSection = mobileSection === link.href ? null : link.href)"
                :aria-expanded="mobileSection === link.href"
                :aria-controls="`section-${link.href}`"
              >
                <span>{{ link.label }}</span>
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path
                    d="M6.293 9.293a1 1 0 0 1 1.414 0L12 13.586l4.293-4.293a1 1 0 1 1 1.414 1.414l-5 5a1 1 0 0 1-1.414 0l-5-5a1 1 0 0 1 0-1.414Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
              <ul
                :id="`section-${link.href}`"
                :class="classNames(styles.mobileChildList, mobileSection === link.href && styles.mobileChildListVisible)"
              >
                <li v-for="child in link.children" :key="child.href">
                  <button
                    type="button"
                    :class="classNames(
                      styles.mobileChildButton,
                      isActive(child.href) && styles.mobileChildButtonActive
                    )"
                    @click="() => navigateAndClose(child.href)"
                  >
                    <span>{{ child.label }}</span>
                    <span :class="styles.mobileChildDesc">{{ child.desc }}</span>
                  </button>
                </li>
              </ul>
            </template>
            <template v-else>
              <button
                type="button"
                :class="classNames(styles.mobileLink, isActive(link.href) && styles.mobileLinkActive)"
                @click="() => navigateAndClose(link.href)"
                :aria-current="isActive(link.href) ? 'page' : undefined"
              >
                {{ link.label }}
              </button>
            </template>
          </li>
        </ul>
      </div>

      <div :class="styles.mobileFooter">
        <div v-if="enableThemeToggle" :class="styles.mobileThemeGroup">
          <button
            v-for="option in themeOptions"
            :key="option.key"
            type="button"
            :class="classNames(styles.mobileThemeButton, theme === option.key && styles.mobileThemeButtonActive)"
            @click="() => handleThemeSelect(option.key)"
          >
            <span :class="styles.mobileThemeIcon" aria-hidden="true">{{ option.icon }}</span>
            <span>{{ option.label }}</span>
          </button>
        </div>

        <div v-if="languageOptions.length" :class="styles.mobileLanguageGroup" :aria-label="languageSelectorLabel">
          <button
            v-for="option in languageOptions"
            :key="option.code"
            type="button"
            :class="classNames(
              styles.mobileLanguageButton,
              language === option.code && styles.mobileLanguageButtonActive
            )"
            @click="() => handleLanguageSelect(option.code)"
          >
            <span :class="styles.mobileLanguageFlag" aria-hidden="true">
              <img :src="option.flag" alt="" loading="lazy" />
            </span>
            <span>{{ option.label }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <SearchCommand
    v-if="enableSearch"
    :links="resolvedLinks"
    :open="searchOpen"
    @close="() => (searchOpen = false)"
  />
</template>
