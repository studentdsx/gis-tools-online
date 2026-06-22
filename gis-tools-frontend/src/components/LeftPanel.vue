<script setup>
import { useAppStore } from '../stores/app'

const appStore = useAppStore()

function closePanel() {
  appStore.toggleLeftPanel(false)
}
</script>

<template>
  <div class="panel left-panel">
    <div class="panel-header">
      <h3 class="panel-title">{{ title }}</h3>
      <button class="close-btn" @click="closePanel">×</button>
    </div>
    <div class="panel-content">
      <slot></slot>
      <div v-if="title === '测量工具'" class="tool-grid">
        <button class="tool-btn">距离测量</button>
        <button class="tool-btn">面积测量</button>
        <button class="tool-btn">高度测量</button>
      </div>
      <div v-else-if="title === '绘制工具'" class="tool-grid">
        <button class="tool-btn">点</button>
        <button class="tool-btn">线</button>
        <button class="tool-btn">面</button>
        <button class="tool-btn">圆</button>
        <button class="tool-btn">矩形</button>
        <button class="tool-btn">文本</button>
      </div>
      <div v-else-if="title === '空间分析'" class="tool-list">
        <button class="tool-item">缓冲区分析</button>
        <button class="tool-item">叠加分析</button>
        <button class="tool-item">路径分析</button>
        <button class="tool-item">热力图</button>
      </div>
      <div v-else-if="title === '图层管理'" class="layer-list">
        <div class="layer-item">
          <input type="checkbox" checked />
          <span>底图</span>
        </div>
        <div class="layer-item">
          <input type="checkbox" />
          <span>行政区划</span>
        </div>
        <div class="layer-item">
          <input type="checkbox" />
          <span>道路网络</span>
        </div>
        <div class="layer-item">
          <input type="checkbox" />
          <span>POI数据</span>
        </div>
      </div>
      <div v-else-if="title === '数据导出'" class="export-options">
        <button class="export-btn">导出GeoJSON</button>
        <button class="export-btn">导出Shapefile</button>
        <button class="export-btn">导出KML</button>
        <button class="export-btn">导出图片</button>
      </div>
      <p v-else class="placeholder">请选择功能</p>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    title: {
      type: String,
      default: ''
    }
  }
}
</script>

<style scoped>
.panel {
  width: 300px;
  background: #1e2a3a;
  border-right: 1px solid #3d4f6f;
  display: flex;
  flex-direction: column;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.3);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: #2d3a4f;
  border-bottom: 1px solid #3d4f6f;
}

.panel-title {
  color: #fff;
  font-size: 15px;
  font-weight: 500;
}

.close-btn {
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  color: #a0aec0;
  font-size: 22px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.panel-content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.tool-btn {
  padding: 12px;
  background: #2d3a4f;
  border: 1px solid #3d4f6f;
  border-radius: 6px;
  color: #e2e8f0;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tool-btn:hover {
  background: #4a90d9;
  border-color: #4a90d9;
}

.tool-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool-item {
  padding: 12px 16px;
  background: #2d3a4f;
  border: 1px solid #3d4f6f;
  border-radius: 6px;
  color: #e2e8f0;
  font-size: 14px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
}

.tool-item:hover {
  background: #4a90d9;
  border-color: #4a90d9;
}

.layer-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.layer-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: #2d3a4f;
  border-radius: 6px;
  color: #e2e8f0;
  font-size: 14px;
}

.layer-item input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: #4a90d9;
}

.export-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.export-btn {
  padding: 14px 16px;
  background: linear-gradient(135deg, #4a90d9 0%, #357abd 100%);
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.export-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(74, 144, 217, 0.4);
}

.placeholder {
  color: #718096;
  text-align: center;
  padding: 40px 0;
}
</style>
