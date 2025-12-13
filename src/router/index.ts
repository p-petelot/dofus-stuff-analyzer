import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/pages/HomePage.vue'),
    meta: {
      titleKey: 'nav.studio'
    }
  },
  {
    path: '/inspiration',
    name: 'inspiration',
    component: () => import('@/pages/InspirationPage.vue'),
    meta: {
      titleKey: 'nav.inspiration'
    }
  },
  {
    path: '/vision',
    name: 'vision',
    component: () => import('@/pages/VisionPage.vue'),
    meta: {
      titleKey: 'nav.vision'
    }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    return { top: 0 }
  }
})

export default router
