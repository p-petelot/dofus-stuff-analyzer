<script setup lang="ts">
const highlights = [
  { title: "Palettes intelligentes", description: "Dépose une référence, récupère automatiquement les teintes clés en Hex et RGB." },
  { title: "Kit modulable", description: "Composants Vue 3 découplés pour le navbar, la gestion des thèmes et les ateliers." },
  { title: "Contrôle hors-ligne", description: "Tout fonctionne côté client, prêt à être branché à une API DofusDB ou à un proxy." },
];

const steps = [
  "Importe ou colle une image de skin Dofus.",
  "Choisis tes couleurs dominantes et sauvegarde la palette.",
  "Teste plusieurs fonds et casques grâce aux aperçus rapides.",
];
</script>

<template>
  <main class="page">
    <section class="hero">
      <div>
        <p class="pill">Vue 3 + Vite</p>
        <h1 class="hero__title">KrosPalette devient PrismForge</h1>
        <p class="hero__lead">
          Atelier de palettes pensé pour les créateurs de skins Dofus.
          Vue 3 simplifie la maintenance avec des composants découplés et un routage clair.
        </p>
        <div class="panel__actions">
          <button class="hero__cta" type="button" @click="$router.push('/vision')">
            Lancer l'atelier
          </button>
          <button class="button" type="button" @click="$router.push('/inspiration')">
            Explorer les inspirations
          </button>
        </div>
      </div>
      <div class="card">
        <h2>Prêt pour l'exploitation</h2>
        <p class="muted">
          Monte rapidement une stack front en Vue 3 tout en réutilisant les utilitaires existants
          (vision, palettes, i18n, thèmes).
        </p>
        <div class="pill-list">
          <span class="pill">Thèmes dynamiques</span>
          <span class="pill">Upload / Dropzone</span>
          <span class="pill">Composants SFC</span>
        </div>
      </div>
    </section>

    <section>
      <h2 class="section-title">Pourquoi passer en Vue 3 ?</h2>
      <div class="card-grid">
        <article v-for="highlight in highlights" :key="highlight.title" class="card">
          <h3>{{ highlight.title }}</h3>
          <p class="muted">{{ highlight.description }}</p>
        </article>
      </div>
    </section>

    <section class="card">
      <h2 class="section-title">Parcours conseillé</h2>
      <ol class="stack">
        <li v-for="step in steps" :key="step">{{ step }}</li>
      </ol>
    </section>
  </main>
</template>
