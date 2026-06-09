<script setup>
import { reactive, ref, watch } from 'vue'
import { apiClient } from '../api/client'

const props = defineProps({
  visible: Boolean
})

const emit = defineEmits(['close', 'success'])

const form = reactive({
  name: '',
  host: 'localhost',
  port: '5432',
  database: '',
  username: 'postgres',
  password: ''
})

const testing = ref(false)
const saving = ref(false)
const result = ref(null)

watch(() => props.visible, (visible) => {
  if (visible) {
    result.value = null
  }
})

function resetForm() {
  form.name = ''
  form.host = 'localhost'
  form.port = '5432'
  form.database = ''
  form.username = 'postgres'
  form.password = ''
  result.value = null
}

function validateForm() {
  if (!form.name || !form.host || !form.port || !form.database || !form.username) {
    result.value = { success: false, message: '请填写连接名称、主机、端口、数据库和用户名' }
    return false
  }

  return true
}

async function testConnection() {
  if (!validateForm()) return

  testing.value = true
  result.value = null

  try {
    const res = await apiClient.post('/api/database/test', {
      host: form.host,
      port: form.port,
      database: form.database,
      username: form.username,
      password: form.password
    })
    result.value = res.data
  } catch (error) {
    result.value = { success: false, message: error.response?.data?.message || error.message }
  } finally {
    testing.value = false
  }
}

async function saveConnection() {
  if (!validateForm()) return

  saving.value = true

  try {
    const res = await apiClient.post('/api/database', { ...form })
    emit('success', { ...res.data, password: form.password })
    emit('close')
    resetForm()
  } catch (error) {
    result.value = { success: false, message: error.response?.data?.error || error.message }
  } finally {
    saving.value = false
  }
}

function cancel() {
  emit('close')
  resetForm()
}
</script>

<template>
  <div v-if="visible" class="modal-overlay" @click.self="cancel">
    <section class="modal-content" role="dialog" aria-modal="true" aria-labelledby="postgis-modal-title">
      <header class="modal-header">
        <div>
          <p class="eyebrow">PostGIS</p>
          <h3 id="postgis-modal-title">添加数据库连接</h3>
        </div>
        <button class="icon-btn" type="button" aria-label="关闭" @click="cancel">x</button>
      </header>

      <div class="modal-body">
        <div class="form-group">
          <label for="conn-name">连接名称</label>
          <input id="conn-name" v-model.trim="form.name" type="text" placeholder="本地 PostGIS" />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="conn-host">主机</label>
            <input id="conn-host" v-model.trim="form.host" type="text" placeholder="localhost" />
          </div>
          <div class="form-group port-field">
            <label for="conn-port">端口</label>
            <input id="conn-port" v-model.trim="form.port" type="text" placeholder="5432" />
          </div>
        </div>

        <div class="form-group">
          <label for="conn-db">数据库</label>
          <input id="conn-db" v-model.trim="form.database" type="text" placeholder="gis_tools" />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="conn-user">用户名</label>
            <input id="conn-user" v-model.trim="form.username" type="text" placeholder="postgres" />
          </div>
          <div class="form-group">
            <label for="conn-password">密码</label>
            <input id="conn-password" v-model="form.password" type="password" placeholder="可留空" />
          </div>
        </div>

        <p v-if="result" class="status-message" :class="{ success: result.success }">
          {{ result.message }}
        </p>
      </div>

      <footer class="modal-footer">
        <button class="ghost-btn" type="button" :disabled="testing || saving" @click="testConnection">
          {{ testing ? '测试中...' : '测试连接' }}
        </button>
        <div class="footer-actions">
          <button class="plain-btn" type="button" @click="cancel">取消</button>
          <button class="primary-btn" type="button" :disabled="saving || testing" @click="saveConnection">
            {{ saving ? '保存中...' : '保存连接' }}
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(12, 20, 30, 0.48);
  backdrop-filter: blur(6px);
}

.modal-content {
  width: min(520px, calc(100vw - 32px));
  background: #f8faf7;
  border: 1px solid #d8ded6;
  border-radius: 8px;
  box-shadow: 0 22px 60px rgba(7, 18, 28, 0.28);
  overflow: hidden;
}

.modal-header,
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
}

.modal-header {
  border-bottom: 1px solid #dfe5dc;
  background: #eef3ed;
}

.eyebrow {
  margin: 0 0 3px;
  color: #55715d;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h3 {
  margin: 0;
  color: #16231a;
  font-size: 17px;
  font-weight: 700;
}

.icon-btn {
  width: 30px;
  height: 30px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #506157;
  cursor: pointer;
}

.icon-btn:hover {
  border-color: #c8d3c4;
  background: #fff;
}

.modal-body {
  padding: 18px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 112px;
  gap: 12px;
}

.form-row + .form-group,
.form-group + .form-row,
.form-group + .form-group {
  margin-top: 14px;
}

.form-group {
  min-width: 0;
}

label {
  display: block;
  margin-bottom: 6px;
  color: #526158;
  font-size: 12px;
  font-weight: 700;
}

input {
  width: 100%;
  height: 36px;
  padding: 0 11px;
  border: 1px solid #cfd8ca;
  border-radius: 6px;
  background: #fff;
  color: #17211a;
  font-size: 13px;
  outline: none;
}

input:focus {
  border-color: #4d8b62;
  box-shadow: 0 0 0 3px rgba(77, 139, 98, 0.16);
}

.status-message {
  margin: 16px 0 0;
  padding: 10px 12px;
  border: 1px solid #e0bbb7;
  border-radius: 6px;
  background: #fff1ef;
  color: #9d2f28;
  font-size: 13px;
  line-height: 1.5;
}

.status-message.success {
  border-color: #b9d7bf;
  background: #edf8ef;
  color: #236b36;
}

.modal-footer {
  border-top: 1px solid #dfe5dc;
  background: #f1f5ef;
}

.footer-actions {
  display: flex;
  gap: 8px;
}

.plain-btn,
.ghost-btn,
.primary-btn {
  height: 34px;
  padding: 0 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.plain-btn,
.ghost-btn {
  border: 1px solid #cbd6c8;
  background: #fff;
  color: #26372b;
}

.primary-btn {
  border: 1px solid #2f7445;
  background: #34794a;
  color: #fff;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

@media (max-width: 560px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}
.modal-overlay {
  background: rgba(20, 35, 55, 0.42);
  backdrop-filter: blur(4px);
}

.modal-content {
  background: #fff;
  border-color: #d7e0ec;
  border-radius: 7px;
  box-shadow: 0 18px 42px rgba(31, 75, 130, 0.22);
}

.modal-header {
  background: #f8fbff;
  border-bottom-color: #d7e0ec;
}

.eyebrow {
  color: #0f5fc6;
}

h3 {
  color: #1f2a37;
  font-size: 16px;
}

.icon-btn:hover {
  border-color: #c7d5e8;
  background: #edf5ff;
}

label {
  color: #43556f;
}

input {
  border-color: #cbd8ea;
  border-radius: 5px;
}

input:focus {
  border-color: #0f5fc6;
  box-shadow: 0 0 0 3px rgba(15, 95, 198, 0.12);
}

.modal-footer {
  background: #f8fbff;
  border-top-color: #d7e0ec;
}

.plain-btn,
.ghost-btn,
.primary-btn {
  border-radius: 5px;
}

.plain-btn,
.ghost-btn {
  border-color: #cbd8ea;
  color: #1f2a37;
}

.primary-btn {
  border-color: #0f5fc6;
  background: #0f5fc6;
}

.primary-btn:hover:not(:disabled) {
  background: #0b55b4;
}

.status-message.success {
  border-color: #a9d2b6;
}
</style>
