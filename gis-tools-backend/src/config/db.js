const { Pool } = require('pg')
const dbConfig = require('./database')

const env = process.env.NODE_ENV || 'development'
const config = dbConfig[env]

const pool = new Pool({
  user: config.username,
  host: config.host,
  database: config.database,
  password: config.password,
  port: config.port,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
})

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err)
  process.exit(-1)
})

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
}
