import { createRouter, createWebHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import InspirationView from "../views/InspirationView.vue";
import VisionView from "../views/VisionView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: HomeView },
    { path: "/inspiration", name: "inspiration", component: InspirationView },
    { path: "/vision", name: "vision", component: VisionView },
  ],
  scrollBehavior() {
    return { top: 0 };
  },
});

export default router;
