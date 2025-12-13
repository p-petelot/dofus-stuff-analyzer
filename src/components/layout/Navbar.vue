<script setup lang="ts">
import { ref, computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useThemeStore, THEME_OPTIONS } from '@/stores/theme'
import { setLocale } from '@/locales'
import { LANGUAGES, FLAG_CDN } from '@/lib/constants'
import type { ThemeKey, LanguageCode } from '@/types'

const route = useRoute()
const { t, locale } = useI18n()
const themeStore = useThemeStore()

const isMobileMenuOpen = ref(false)
const isThemeDropdownOpen = ref(false)
const isLanguageDropdownOpen = ref(false)

const navLinks = computed(() => [
  { to: '/', label: t('nav.studio'), name: 'home' },
  { to: '/inspiration', label: t('nav.inspiration'), name: 'inspiration' },
  { to: '/vision', label: t('nav.vision'), name: 'vision' }
])

const currentLanguage = computed(() => {
  return LANGUAGES.find((l) => l.code === locale.value) || LANGUAGES[0]
})

function toggleMobileMenu() {
  isMobileMenuOpen.value = !isMobileMenuOpen.value
}

function closeMobileMenu() {
  isMobileMenuOpen.value = false
}

function toggleThemeDropdown() {
  isThemeDropdownOpen.value = !isThemeDropdownOpen.value
  isLanguageDropdownOpen.value = false
}

function toggleLanguageDropdown() {
  isLanguageDropdownOpen.value = !isLanguageDropdownOpen.value
  isThemeDropdownOpen.value = false
}

function selectTheme(theme: ThemeKey) {
  themeStore.setTheme(theme)
  isThemeDropdownOpen.value = false
}

function selectLanguage(code: LanguageCode) {
  setLocale(code)
  isLanguageDropdownOpen.value = false
}

function closeDropdowns() {
  isThemeDropdownOpen.value = false
  isLanguageDropdownOpen.value = false
}

function isActiveRoute(name: string): boolean {
  return route.name === name
}

function getFlagUrl(flag: string): string {
  return `${FLAG_CDN}/w40/${flag}.png`
}
</script>

<template>
  <header class="navbar" @mouseleave="closeDropdowns">
    <div class="navbar__container">
      <!-- Logo -->
      <RouterLink to="/" class="navbar__logo" @click="closeMobileMenu">
        <img src="/logo.svg" alt="KrosPalette" class="navbar__logo-img" />
        <span class="navbar__logo-text">KrosPalette</span>
      </RouterLink>

      <!-- Desktop Navigation -->
      <nav class="navbar__nav navbar__nav--desktop">
        <RouterLink
          v-for="link in navLinks"
          :key="link.name"
          :to="link.to"
          class="navbar__link"
          :class="{ 'navbar__link--active': isActiveRoute(link.name) }"
        >
          {{ link.label }}
        </RouterLink>
      </nav>

      <!-- Actions -->
      <div class="navbar__actions">
        <!-- Theme Dropdown -->
        <div class="navbar__dropdown">
          <button
            class="navbar__action-btn"
            :aria-label="t('theme.label')"
            @click="toggleThemeDropdown"
          >
            <span class="navbar__action-icon">
              {{ THEME_OPTIONS.find((o) => o.key === themeStore.currentTheme)?.icon || '🌙' }}
            </span>
          </button>
          <Transition name="dropdown">
            <div v-if="isThemeDropdownOpen" class="navbar__dropdown-menu">
              <button
                v-for="option in THEME_OPTIONS"
                :key="option.key"
                class="navbar__dropdown-item"
                :class="{ 'navbar__dropdown-item--active': themeStore.currentTheme === option.key }"
                @click="selectTheme(option.key)"
              >
                <span class="navbar__dropdown-icon">{{ option.icon }}</span>
                <span>{{ t(option.labelKey) }}</span>
              </button>
            </div>
          </Transition>
        </div>

        <!-- Language Dropdown -->
        <div class="navbar__dropdown">
          <button
            class="navbar__action-btn"
            :aria-label="t('language.label')"
            @click="toggleLanguageDropdown"
          >
            <img
              :src="getFlagUrl(currentLanguage.flag)"
              :alt="currentLanguage.name"
              class="navbar__flag"
            />
          </button>
          <Transition name="dropdown">
            <div v-if="isLanguageDropdownOpen" class="navbar__dropdown-menu">
              <button
                v-for="lang in LANGUAGES"
                :key="lang.code"
                class="navbar__dropdown-item"
                :class="{ 'navbar__dropdown-item--active': locale === lang.code }"
                @click="selectLanguage(lang.code)"
              >
                <img :src="getFlagUrl(lang.flag)" :alt="lang.name" class="navbar__flag" />
                <span>{{ lang.name }}</span>
              </button>
            </div>
          </Transition>
        </div>

        <!-- Mobile Menu Toggle -->
        <button
          class="navbar__hamburger"
          :class="{ 'navbar__hamburger--open': isMobileMenuOpen }"
          :aria-label="isMobileMenuOpen ? 'Close menu' : 'Open menu'"
          @click="toggleMobileMenu"
        >
          <span class="navbar__hamburger-line"></span>
          <span class="navbar__hamburger-line"></span>
          <span class="navbar__hamburger-line"></span>
        </button>
      </div>
    </div>

    <!-- Mobile Navigation -->
    <Transition name="mobile-menu">
      <nav v-if="isMobileMenuOpen" class="navbar__nav navbar__nav--mobile">
        <RouterLink
          v-for="link in navLinks"
          :key="link.name"
          :to="link.to"
          class="navbar__link navbar__link--mobile"
          :class="{ 'navbar__link--active': isActiveRoute(link.name) }"
          @click="closeMobileMenu"
        >
          {{ link.label }}
        </RouterLink>
      </nav>
    </Transition>
  </header>
</template>

<style scoped>
.navbar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--navbar-surface);
  border-bottom: 1px solid var(--navbar-border);
  box-shadow: var(--navbar-shadow);
  backdrop-filter: blur(12px);
}

.navbar__container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 16px;
  height: 64px;
}

.navbar__logo {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--navbar-text);
}

.navbar__logo-img {
  width: 36px;
  height: 36px;
}

.navbar__logo-text {
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.navbar__nav--desktop {
  display: none;
  gap: 8px;
}

@media (min-width: 768px) {
  .navbar__nav--desktop {
    display: flex;
  }
}

.navbar__link {
  padding: 8px 16px;
  border-radius: 8px;
  text-decoration: none;
  color: var(--navbar-muted);
  font-weight: 500;
  font-size: 0.9rem;
  transition: color 0.2s, background 0.2s;
}

.navbar__link:hover {
  color: var(--navbar-text);
  background: rgba(var(--accent-primary-rgb), 0.1);
}

.navbar__link--active {
  color: var(--navbar-text);
  background: rgba(var(--accent-primary-rgb), 0.15);
}

.navbar__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.navbar__dropdown {
  position: relative;
}

.navbar__action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transition: background 0.2s;
}

.navbar__action-btn:hover {
  background: rgba(var(--accent-primary-rgb), 0.1);
}

.navbar__action-icon {
  font-size: 1.25rem;
}

.navbar__flag {
  width: 24px;
  height: 18px;
  object-fit: cover;
  border-radius: 2px;
}

.navbar__dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  min-width: 160px;
  padding: 8px;
  background: var(--mobile-panel);
  border: 1px solid var(--navbar-border);
  border-radius: 12px;
  box-shadow: 0 16px 32px -12px rgba(0, 0, 0, 0.4);
}

.navbar__dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--navbar-muted);
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.navbar__dropdown-item:hover {
  background: rgba(var(--accent-primary-rgb), 0.1);
  color: var(--navbar-text);
}

.navbar__dropdown-item--active {
  background: rgba(var(--accent-primary-rgb), 0.15);
  color: var(--navbar-text);
}

.navbar__dropdown-icon {
  font-size: 1.1rem;
}

.navbar__hamburger {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  width: 40px;
  height: 40px;
  padding: 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
}

@media (min-width: 768px) {
  .navbar__hamburger {
    display: none;
  }
}

.navbar__hamburger-line {
  display: block;
  width: 100%;
  height: 2px;
  background: var(--navbar-icon);
  border-radius: 1px;
  transition: transform 0.3s, opacity 0.3s;
}

.navbar__hamburger--open .navbar__hamburger-line:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}

.navbar__hamburger--open .navbar__hamburger-line:nth-child(2) {
  opacity: 0;
}

.navbar__hamburger--open .navbar__hamburger-line:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}

.navbar__nav--mobile {
  display: flex;
  flex-direction: column;
  padding: 16px;
  background: var(--mobile-panel-strong);
  border-top: 1px solid var(--navbar-border);
}

.navbar__link--mobile {
  padding: 14px 16px;
  font-size: 1rem;
}

/* Transitions */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.mobile-menu-enter-active,
.mobile-menu-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}

.mobile-menu-enter-from,
.mobile-menu-leave-to {
  opacity: 0;
  transform: translateY(-16px);
}
</style>
