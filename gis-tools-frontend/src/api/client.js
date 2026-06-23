import axios from 'axios'
import { runtimeConfig } from '../config/runtime'

const baseURL = runtimeConfig.apiBaseUrl

export const apiClient = axios.create({
  baseURL,
})
