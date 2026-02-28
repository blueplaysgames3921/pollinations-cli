import axios from 'axios';
import { config } from './config-store.js';

const BASE_URL = 'https://gen.pollinations.ai';

export const getApi = () => {
  const apiKey = config.get('apiKey');
  return axios.create({
    baseURL: BASE_URL,
    headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}
  });
};
