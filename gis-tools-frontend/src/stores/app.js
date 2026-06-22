import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStore = defineStore('app', () => {
  const currentMenu = ref('map')
  const leftPanelVisible = ref(false)
  const rightPanelVisible = ref(false)
  const leftPanelTitle = ref('')
  const rightPanelTitle = ref('')

  const currentStyle = ref('satellite')
  const measureMode = ref(null)
  const measureResult = ref({ length: 0, area: 0 })

  const menuGroups = ref([
    {
      name: '数据',
      items: [
        { id: 'import', name: '数据导入', icon: '📥' },
        { id: 'export', name: '数据导出', icon: '📤' }
      ]
    },
    {
      name: '工具',
      items: [
        { id: 'draw', name: '绘制工具', icon: '✏️' },
        { id: 'measure', name: '测量工具', icon: '📏' },
        { id: 'analysis', name: '空间分析', icon: '📊' }
      ]
    },
    {
      name: '图层',
      items: [
        { id: 'layers', name: '图层管理', icon: '🗂️' },
        { id: 'legend', name: '图例', icon: '📋' }
      ]
    }
  ])

  const menuItems = ref([
    { id: 'map', name: '地图浏览', icon: '🗺️' },
    { id: 'import', name: '数据导入', icon: '📥' },
    { id: 'draw', name: '绘制工具', icon: '✏️' },
    { id: 'measure', name: '测量工具', icon: '📏' },
    { id: 'analysis', name: '空间分析', icon: '📊' },
    { id: 'layers', name: '图层管理', icon: '🗂️' },
    { id: 'export', name: '数据导出', icon: '📤' }
  ])

  function setCurrentMenu(menuId) {
    currentMenu.value = menuId
  }

  function toggleLeftPanel(visible, title = '') {
    leftPanelVisible.value = visible
    leftPanelTitle.value = title
  }

  function toggleRightPanel(visible, title = '') {
    rightPanelVisible.value = visible
    rightPanelTitle.value = title
  }

  function setCurrentStyle(style) {
    currentStyle.value = style
  }

  function setMeasureMode(mode) {
    measureMode.value = mode
  }

  function setMeasureResult(result) {
    measureResult.value = result
  }

  return {
    currentMenu,
    leftPanelVisible,
    rightPanelVisible,
    leftPanelTitle,
    rightPanelTitle,
    currentStyle,
    measureMode,
    measureResult,
    menuGroups,
    menuItems,
    setCurrentMenu,
    toggleLeftPanel,
    toggleRightPanel,
    setCurrentStyle,
    setMeasureMode,
    setMeasureResult
  }
})
