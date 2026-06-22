import { createRouter, createWebHistory } from 'vue-router'
import MainView from '../views/MainView.vue'
import MapshaperView from '../views/MapshaperView.vue'
import PortalView from '../views/PortalView.vue'

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
    },
    {
      path: '/data-import',
      redirect: '/'
    },
    {
      path: '/data-edit',
      redirect: '/'
    },
    {
      path: '/analysis-tools',
      redirect: '/'
    },
    {
      path: '/data-download',
      redirect: '/'
    },
    {
      path: '/visualization',
      redirect: '/'
    },
    {
      path: '/portal',
      name: 'portal',
      component: PortalView
    }
  ]
})

export default router
