<script setup lang="ts">
// shared chrome around mounted CatalogPage; identical for both entries
defineProps<{ title: string }>();
</script>

<template>
  <main class="app">
    <h1>{{ title }}</h1>
    <p class="intro">
      Pick a category and watch the cards load. Open the console to watch the mock API log which catalog and image
      requests get aborted.
    </p>
    <slot />
  </main>
</template>

<style scoped>
.app {
  font-family: system-ui, sans-serif;
  max-width: 560px;
  margin: 2rem auto;
  padding: 0 1rem;
}
h1 {
  font-size: 1.25rem;
}
.intro {
  color: #555;
  font-size: 0.9rem;
}
</style>
