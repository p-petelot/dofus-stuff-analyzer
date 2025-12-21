<script setup lang="ts">
const inspirations = [
  {
    title: "Destin du Monde Nuage",
    img: "/backgrounds/Destin_du_monde_nuage.png",
    accent: "#22d3ee",
  },
  {
    title: "Sufokia nocturne",
    img: "/backgrounds/Brakmar_ombre.png",
    accent: "#f97316",
  },
  {
    title: "Astrub pastel",
    img: "/backgrounds/Astrub.png",
    accent: "#a855f7",
  },
];
</script>

<template>
  <main class="page">
    <header class="hero">
      <div>
        <p class="pill">Moodboard</p>
        <h1 class="hero__title">Inspiration rapide</h1>
        <p class="hero__lead">
          Sélectionne un fond, un set de couleurs et enregistre tes idées dans tes propres composants.
          Chaque vignette réutilise les assets statiques conservés dans <code>public/</code>.
        </p>
      </div>
    </header>

    <section class="card-grid">
      <article v-for="entry in inspirations" :key="entry.title" class="card">
        <img :src="entry.img" :alt="entry.title" style="width: 100%; border-radius: 12px; object-fit: cover" />
        <h2>{{ entry.title }}</h2>
        <p class="muted">Accent: {{ entry.accent }}</p>
        <div class="pill-list">
          <span class="pill">Palette</span>
          <span class="pill">Fond</span>
          <span class="pill">Capture</span>
        </div>
      </article>
    </section>
  </main>
</template>
