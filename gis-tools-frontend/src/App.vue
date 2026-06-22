<script setup>
import { nextTick, ref } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import Header from './components/Header.vue'

const router = useRouter()
const headerRef = ref(null)
const routeViewRef = ref(null)

async function ensureWorkbench() {
  if (router.currentRoute.value.path !== '/') {
    await router.push('/')
  }
  await nextTick()
}

async function handleHeaderSearch(coords) {
  await ensureWorkbench()
  routeViewRef.value?.handleSearch?.(coords)
}

async function handleHeaderToolAction(action) {
  await ensureWorkbench()
  routeViewRef.value?.handleToolAction?.(action)
}

function handleMapClick(coords) {
  headerRef.value?.handleMapClickResult?.(coords)
}
</script>

<template>
  <div class="app-container">
    <Header ref="headerRef" @search="handleHeaderSearch" @tool-action="handleHeaderToolAction" />
    <RouterView v-slot="{ Component }">
      <component :is="Component" ref="routeViewRef" class="route-view" @map-click="handleMapClick" />
    </RouterView>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.app-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.route-view {
  min-height: 0;
  flex: 1;
}
</style>
