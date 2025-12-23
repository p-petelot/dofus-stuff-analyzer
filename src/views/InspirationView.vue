<script setup lang="ts">
import CreativeGallery from "../components/CreativeGallery.vue";

const inspirationSwatches = [
  "#8B5CF6",
  "#F97316",
  "#10B981",
  "#38BDF8",
  "#F43F5E",
  "#FACC15",
  "#F368E0",
  "#CC8E35",
  "#0EA5E9",
  "#EC4899",
  "#78350F",
  "#64748B",
  "#0F766E",
  "#4C1D95",
  "#A16207",
];
</script>

<template>
  <main class="collections-page">
    <section class="collections-shell">
      <header class="collections-hero">
        <p class="collections-eyebrow">Inspiration</p>
        <h1>Palette ciblée</h1>
        <p>
          Cette page propose le mode Inspiration de l’ancienne interface : sélectionne une teinte clé et
          explore des variations immédiates sans passer par les modules React.
        </p>
      </header>
      <CreativeGallery
        :swatches="inspirationSwatches"
        title="Couleurs mises en avant"
        subtitle="Choisis une nuance pour obtenir des looks harmonisés."
      />
    </section>
  </main>
</template>
