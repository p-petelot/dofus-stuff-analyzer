<script setup lang="ts">
import CreativeGallery from "../components/CreativeGallery.vue";
</script>

<template>
  <main class="collections-page">
    <section class="collections-shell">
      <header class="collections-hero">
        <p class="collections-eyebrow">KrosPalette</p>
        <h1>Palette & inspirations</h1>
        <p>
          Choisis une couleur directrice et génère instantanément des propositions cohérentes pour
          tes skins. Cette vue reprend la logique historique en React et la porte en Vue.
        </p>
      </header>
      <CreativeGallery
        title="Propositions générées"
        subtitle="Sélectionne une teinte ou laisse KrosPalette choisir."
      />
    </section>
  </main>
</template>
