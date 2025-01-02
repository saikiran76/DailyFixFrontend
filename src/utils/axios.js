import axios from 'axios';
import { supabase } from './supabase';

const api = axios.create({
  baseURL: 'http://localhost:3001',
  withCredentials: true,
  timeout: 60000, // 60 seconds default timeout
});

// Request interceptor
api.interceptors.request.use(async (config) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    }

    // Adjust timeout for specific operations
    if (config.url?.includes('/connect/telegram/finalize')) {
      config.timeout = 120000; // 2 minutes for Telegram finalization
    } else if (config.url?.includes('/connect/whatsapp')) {
      config.timeout = 180000; // 3 minutes for WhatsApp operations
    }

    return config;
  } catch (error) {
    console.error('Error in request interceptor:', error);
    return Promise.reject(error);
  }
}, (error) => {
  return Promise.reject(error);
});

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Add isTimeout flag for timeout errors
    if (error.code === 'ECONNABORTED' && error.message.includes('timeout')) {
      error.isTimeout = true;
    }

    // Handle authentication errors
    if (error.response?.status === 401) {
      try {
        const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
        if (session) {
          // Retry the original request with new token
          const config = error.config;
          config.headers.Authorization = `Bearer ${session.access_token}`;
          return api(config);
        }
      } catch (refreshError) {
        console.error('Error refreshing token:', refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
