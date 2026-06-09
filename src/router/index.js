import { createRouter, createWebHistory } from 'vue-router'
import MainView from '../views/MainView.vue'
import MapshaperView from '../views/MapshaperView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'main',
      component: MainView
    },
    {
      path: '/mapshaper',
      name: 'mapshaper',
      component: MapshaperView
    }
  ]
})

export default router
