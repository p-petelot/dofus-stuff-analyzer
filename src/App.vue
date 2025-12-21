<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { RouterView } from "vue-router";
import AppNavbar from "./components/AppNavbar.vue";
import {
  DEFAULT_THEME_KEY,
  THEME_OPTIONS,
  applyThemeToDocument,
  loadStoredTheme,
  persistTheme,
} from "../lib/theme-controller";

const themeKey = ref(loadStoredTheme?.() ?? DEFAULT_THEME_KEY);

const links = [
  { label: "Accueil", to: "/" },
  { label: "Inspiration", to: "/inspiration" },
  { label: "Vision", to: "/vision" },
];

onMounted(() => {
  applyThemeToDocument(themeKey.value);
});

watch(themeKey, (value) => {
  applyThemeToDocument(value);
  persistTheme?.(value);
});
</script>

<template>
  <div class="app-shell">
    <AppNavbar
      :brand="{ label: 'PrismForge', to: '/' }"
      :links="links"
      :theme-key="themeKey"
      :theme-options="THEME_OPTIONS.map((option) => ({ key: option.key, label: option.labelKey ?? option.key, icon: option.icon }))"
      @update:theme="(value) => (themeKey.value = value)"
    />
    <div class="navbar-spacer" aria-hidden="true" />
    <RouterView />
  </div>
</template>
