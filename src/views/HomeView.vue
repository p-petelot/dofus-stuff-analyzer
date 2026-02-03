<template>
  <main class="page page--home">
    <section class="page__hero">
      <h1>KrosPalette (migration Vue)</h1>
      <p>
        L’interface principale sera progressivement migrée depuis la version React/Next.
        Les flux d’analyse, de palette et de suggestion d’items restent à porter dans cette vue.
      </p>
    </section>
  </main>
</template>

<style scoped>
.page {
  padding: 96px 24px 48px;
  max-width: 1200px;
  margin: 0 auto;
}

.page__hero {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

h1 {
  font-size: 2.25rem;
  margin: 0;
}

p {
  margin: 0;
  color: var(--text-muted);
}
</style>
