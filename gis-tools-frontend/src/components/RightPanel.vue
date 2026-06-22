<script setup>
import { useAppStore } from '../stores/app'

const appStore = useAppStore()

function closePanel() {
  appStore.toggleRightPanel(false)
}
</script>

<template>
  <div class="panel right-panel">
    <div class="panel-header">
      <h3 class="panel-title">{{ title }}</h3>
      <button class="close-btn" @click="closePanel">×</button>
    </div>
    <div class="panel-content">
      <slot></slot>
      <div v-if="title === '测量结果'" class="result-list">
        <div class="result-item">
          <span class="result-label">距离:</span>
          <span class="result-value">0 m</span>
        </div>
        <div class="result-item">
          <span class="result-label">累计:</span>
          <span class="result-value">0 m</span>
        </div>
      </div>
      <div v-else-if="title === '分析结果'" class="analysis-result">
        <div class="info-box">
          <p>选择分析工具后在地图上点击获取结果</p>
        </div>
      </div>
      <p v-else class="placeholder">等待数据...</p>
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
  width: 280px;
  background: #1e2a3a;
  border-left: 1px solid #3d4f6f;
  display: flex;
  flex-direction: column;
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.3);
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

.result-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.result-item {
  display: flex;
  justify-content: space-between;
  padding: 12px 14px;
  background: #2d3a4f;
  border-radius: 6px;
}

.result-label {
  color: #a0aec0;
  font-size: 13px;
}

.result-value {
  color: #4a90d9;
  font-size: 14px;
  font-weight: 500;
}

.analysis-result {
  padding: 20px 0;
}

.info-box {
  padding: 20px;
  background: #2d3a4f;
  border-radius: 8px;
  text-align: center;
}

.info-box p {
  color: #718096;
  font-size: 13px;
  line-height: 1.6;
}

.placeholder {
  color: #718096;
  text-align: center;
  padding: 40px 0;
  font-size: 13px;
}
.panel {
  width: 280px;
  background: #fff;
  border-left-color: #d7e0ec;
  box-shadow: -2px 0 10px rgba(31, 75, 130, 0.08);
}

.panel-header {
  padding: 10px 12px;
  background: #f8fbff;
  border-bottom-color: #d7e0ec;
}

.panel-title {
  color: #1f2a37;
  font-size: 13px;
  font-weight: 800;
}

.close-btn {
  width: 24px;
  height: 24px;
  color: #6b7b90;
  border-radius: 4px;
}

.close-btn:hover {
  background: #edf5ff;
  color: #0f5fc6;
}

.panel-content {
  padding: 12px;
}

.result-item,
.info-box {
  background: #f8fbff;
  border: 1px solid #d7e0ec;
  border-radius: 6px;
}

.result-label,
.info-box p,
.placeholder {
  color: #6b7b90;
}

.result-value {
  color: #0f5fc6;
}
</style>
