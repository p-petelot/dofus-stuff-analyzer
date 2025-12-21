<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

const props = defineProps<{
  brand: { label: string; to: string };
  links: Array<{ label: string; to: string }>;
  themeKey: string;
  themeOptions: Array<{ key: string; icon?: string; label: string }>;
}>();

const emit = defineEmits<{
  (e: "update:theme", value: string): void;
}>();

const route = useRoute();
const router = useRouter();
const mobileOpen = ref(false);

const isActive = (to: string) => computed(() => route.path === to || route.path.startsWith(`${to}/`));

function handleNavigate(to: string) {
  router.push(to);
  mobileOpen.value = false;
}

function toggleTheme(value: string) {
  emit("update:theme", value);
}
</script>

<template>
  <header class="nav">
    <div class="nav__inner">
      <button class="nav__burger" type="button" @click="mobileOpen = !mobileOpen" aria-label="Menu">
        <span />
        <span />
        <span />
      </button>
      <div class="nav__brand" @click="handleNavigate(brand.to)">
        <img src="/logo.svg" alt="PrismForge" />
        <span>{{ brand.label }}</span>
      </div>
      <nav class="nav__links" aria-label="Navigation principale">
        <button
          v-for="link in links"
          :key="link.to"
          :class="['nav__link', { 'nav__link--active': isActive(link.to).value }]"
          type="button"
          @click="handleNavigate(link.to)"
        >
          {{ link.label }}
        </button>
      </nav>
      <div class="nav__actions">
        <label class="nav__select">
          <span class="sr-only">Thème</span>
          <select :value="themeKey" @change="toggleTheme(($event.target as HTMLSelectElement).value)">
            <option v-for="option in themeOptions" :key="option.key" :value="option.key">
              {{ option.icon ? `${option.icon} ` : '' }}{{ option.label }}
            </option>
          </select>
        </label>
      </div>
    </div>
    <transition name="fade">
      <div v-if="mobileOpen" class="nav__mobile">
        <button
          v-for="link in links"
          :key="link.to"
          class="nav__mobile-link"
          type="button"
          @click="handleNavigate(link.to)"
        >
          {{ link.label }}
        </button>
      </div>
    </transition>
  </header>
</template>

<style scoped>
.nav {
  position: sticky;
  top: 0;
  z-index: 10;
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(var(--text-muted-rgb, 148, 163, 184), 0.22);
  background: rgba(6, 10, 18, 0.72);
}

.nav__inner {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 14px;
  padding: 14px clamp(18px, 3vw, 48px);
  max-width: 1200px;
  margin: 0 auto;
}

.nav__burger {
  display: none;
  background: transparent;
  border: none;
  padding: 6px;
  cursor: pointer;
  gap: 5px;
  flex-direction: column;
}

.nav__burger span {
  display: block;
  width: 20px;
  height: 2px;
  background: var(--text, #e2e8f0);
}

.nav__brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-weight: 800;
  cursor: pointer;
}

.nav__brand img {
  width: 32px;
  height: 32px;
}

.nav__links {
  display: inline-flex;
  gap: 6px;
  justify-content: center;
}

.nav__link {
  border: none;
  background: transparent;
  color: var(--text, #e2e8f0);
  padding: 10px 12px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 600;
}

.nav__link--active {
  background: rgba(var(--accent-primary-rgb, 139, 92, 246), 0.16);
}

.nav__actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
}

.nav__select select {
  border-radius: 12px;
  border: 1px solid rgba(var(--text-muted-rgb, 148, 163, 184), 0.3);
  background: rgba(255, 255, 255, 0.02);
  color: var(--text, #e2e8f0);
  padding: 8px 10px;
}

.nav__mobile {
  display: none;
}

@media (max-width: 820px) {
  .nav__inner {
    grid-template-columns: auto 1fr auto;
  }
  .nav__links {
    display: none;
  }
  .nav__burger {
    display: inline-flex;
  }
  .nav__mobile {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 0 18px 16px;
  }
  .nav__mobile-link {
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(var(--surface-8-rgb, 10, 17, 40), 0.8);
    border: 1px solid rgba(var(--text-muted-rgb, 148, 163, 184), 0.2);
    color: var(--text, #e2e8f0);
    cursor: pointer;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
