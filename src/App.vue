<script setup lang="ts">
import { RouterView } from "vue-router";
import Navbar from "./components/Navbar.vue";
import type { NavLink } from "./types/navigation";

const links: NavLink[] = [
  { label: "Accueil", href: "/" },
  { label: "Inspiration", href: "/inspiration" },
  { label: "Vision", href: "/vision" },
];
</script>

<template>
  <Navbar
    :brand="{ label: 'KrosPalette', href: '/' }"
    :links="links"
    enable-search
    enable-theme-toggle
  />
  <main class="layout-offset">
    <RouterView />
  </main>
</template>
