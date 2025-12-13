<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const searchColor = ref('')
const isLoading = ref(false)
const results = ref<any[]>([])

const popularColors = [
  '#FF5733',
  '#33FF57',
  '#3357FF',
  '#FF33F5',
  '#F5FF33',
  '#33FFF5',
  '#FF8C00',
  '#8B00FF',
  '#00FF8C',
  '#FF0080',
  '#0080FF',
  '#80FF00',
  '#FFD700',
  '#C0C0C0',
  '#000000'
]

async function searchByColor(color: string) {
  searchColor.value = color
  isLoading.value = true

  // Simulate API call
  await new Promise((resolve) => setTimeout(resolve, 1000))

  // Mock results
  results.value = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    name: `Skin ${i + 1}`,
    colors: [color, '#FFFFFF', '#000000']
  }))

  isLoading.value = false
}

function handleColorInput(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.value.match(/^#[0-9A-Fa-f]{6}$/)) {
    searchByColor(target.value)
  }
}
</script>

<template>
  <div class="inspiration-page">
    <header class="inspiration-page__header">
      <h1 class="inspiration-page__title">{{ t('inspiration.title') }}</h1>
      <p class="inspiration-page__subtitle">{{ t('inspiration.subtitle') }}</p>
    </header>

    <section class="inspiration-page__search card">
      <div class="inspiration-page__search-input">
        <input
          v-model="searchColor"
          type="text"
          class="input"
          :placeholder="t('inspiration.search.placeholder')"
          @input="handleColorInput"
        />
        <input
          type="color"
          :value="searchColor || '#8B5CF6'"
          class="inspiration-page__color-picker"
          @input="(e) => searchByColor((e.target as HTMLInputElement).value)"
        />
      </div>
    </section>

    <section class="inspiration-page__colors card">
      <h2 class="inspiration-page__section-title">{{ t('inspiration.colors.title') }}</h2>
      <div class="inspiration-page__color-grid">
        <button
          v-for="color in popularColors"
          :key="color"
          class="inspiration-page__color-swatch"
          :style="{ backgroundColor: color }"
          :class="{ 'inspiration-page__color-swatch--active': searchColor === color }"
          @click="searchByColor(color)"
        >
          <span class="sr-only">{{ color }}</span>
        </button>
      </div>
    </section>

    <section class="inspiration-page__results">
      <h2 class="inspiration-page__section-title">{{ t('inspiration.results.title') }}</h2>

      <div v-if="isLoading" class="inspiration-page__loading">
        <span class="loader"></span>
        <span>{{ t('inspiration.results.loading') }}</span>
      </div>

      <div v-else-if="results.length === 0" class="inspiration-page__empty">
        {{ t('inspiration.results.empty') }}
      </div>

      <div v-else class="inspiration-page__grid">
        <div v-for="result in results" :key="result.id" class="inspiration-page__card card">
          <div class="inspiration-page__card-preview">
            <div
              class="inspiration-page__card-color"
              :style="{ backgroundColor: result.colors[0] }"
            ></div>
          </div>
          <div class="inspiration-page__card-info">
            <h3 class="inspiration-page__card-name">{{ result.name }}</h3>
            <div class="inspiration-page__card-palette">
              <span
                v-for="(color, i) in result.colors"
                :key="i"
                class="inspiration-page__card-dot"
                :style="{ backgroundColor: color }"
              ></span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.inspiration-page {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.inspiration-page__header {
  text-align: center;
  margin-bottom: 32px;
}

.inspiration-page__title {
  font-size: 2rem;
  font-weight: 700;
  margin: 0 0 8px;
  background: linear-gradient(135deg, rgb(var(--accent-primary-rgb)), rgb(var(--accent-secondary-rgb)));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.inspiration-page__subtitle {
  color: var(--text-muted);
  margin: 0;
}

.inspiration-page__search {
  margin-bottom: 24px;
}

.inspiration-page__search-input {
  display: flex;
  gap: 12px;
}

.inspiration-page__search-input .input {
  flex: 1;
}

.inspiration-page__color-picker {
  width: 48px;
  height: 48px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.inspiration-page__colors {
  margin-bottom: 24px;
}

.inspiration-page__section-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 16px;
}

.inspiration-page__color-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.inspiration-page__color-swatch {
  width: 40px;
  height: 40px;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.2s, border-color 0.2s;
}

.inspiration-page__color-swatch:hover {
  transform: scale(1.1);
}

.inspiration-page__color-swatch--active {
  border-color: var(--text);
  transform: scale(1.1);
}

.inspiration-page__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px;
  color: var(--text-muted);
}

.inspiration-page__empty {
  text-align: center;
  padding: 48px;
  color: var(--text-muted);
}

.inspiration-page__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.inspiration-page__card {
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s;
}

.inspiration-page__card:hover {
  transform: translateY(-4px);
}

.inspiration-page__card-preview {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.inspiration-page__card-color {
  width: 80%;
  height: 80%;
  border-radius: var(--radius-sm);
}

.inspiration-page__card-info {
  padding: 12px 16px;
  border-top: 1px solid var(--card-border);
}

.inspiration-page__card-name {
  font-size: 0.9rem;
  font-weight: 500;
  margin: 0 0 8px;
}

.inspiration-page__card-palette {
  display: flex;
  gap: 6px;
}

.inspiration-page__card-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
}
</style>
