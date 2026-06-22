require('dotenv').config()
const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')

const databaseRoutes = require('./routes/database')
const fileRoutes = require('./routes/files')
const mapshaperRoutes = require('./routes/mapshaper')
const spatialReferenceRoutes = require('./routes/spatialReferences')
const cadRoutes = require('./routes/cad')
const csvRoutes = require('./routes/csv')
const downloadRoutes = require('./routes/download')

const app = express()
const PORT = process.env.PORT || 3000

// 中间件
app.use(cors())
app.use(bodyParser.json({ limit: '50mb' }))
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }))

// 路由
app.use('/api/database', databaseRoutes)
app.use('/api/files', fileRoutes)
app.use('/api/mapshaper', mapshaperRoutes)
app.use('/api/spatial-references', spatialReferenceRoutes)
app.use('/api/cad', cadRoutes)
app.use('/api/csv', csvRoutes)
app.use('/api/download', downloadRoutes)

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Something went wrong!' })
})

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
  console.log(`API available at http://localhost:${PORT}/api`)
})

module.exports = app
