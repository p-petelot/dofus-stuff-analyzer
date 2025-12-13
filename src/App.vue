<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { RouterView } from 'vue-router'
import Navbar from '@/components/layout/Navbar.vue'
import { useThemeStore } from '@/stores/theme'

const themeStore = useThemeStore()

onMounted(() => {
  themeStore.initTheme()
})

watch(
  () => themeStore.currentTheme,
  (theme) => {
    themeStore.applyTheme(theme)
  }
)
</script>

<template>
  <div class="app" :data-theme="themeStore.currentTheme">
    <Navbar />
    <main class="page layout-offset">
      <RouterView />
    </main>
  </div>
</template>

<style>
.app {
  min-height: 100vh;
}
</style>
