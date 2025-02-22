import axios from 'axios';
import { supabase } from './supabase';
import { toast } from 'react-toastify';
import { tokenManager } from './tokenManager';
import logger from './logger';

// Standard response structure
export const ResponseStatus = {
  SUCCESS: 'success',
  ERROR: 'error',
  RATE_LIMITED: 'rate_limited',
  PARTIAL: 'partial'
};

// Standard error types
export const ErrorTypes = {
  TOKEN_EXPIRED: 'token_expired',
  TOKEN_INVALID: 'token_invalid',
  RATE_LIMIT: 'rate_limit',
  API_ERROR: 'api_error',
  NETWORK_ERROR: 'network_error',
  VALIDATION_ERROR: 'validation_error',
  SERVICE_UNAVAILABLE: 'service_unavailable'
};

// API response validator
export const validateResponse = (data, schema) => {
  if (!data) return false;
  
  for (const [key, type] of Object.entries(schema)) {
    if (!(key in data)) return false;
    if (typeof data[key] !== type) return false;
  }
  
  return true;
};

// Standard response schemas
export const ResponseSchemas = {
  servers: {
    id: 'string',
    name: 'string',
    icon: 'string'
  },
  directMessages: {
    id: 'string',
    recipients: 'object'
  },
  status: {
    status: 'string',
    message: 'string'
  }
};

// Create unified API instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://23.22.150.97:3002',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// Request interceptor
api.interceptors.request.use(
  async (config) => {
    try {
      // Get auth data from localStorage
      const authData = localStorage.getItem('dailyfix_auth');
      if (authData) {
        const { access_token } = JSON.parse(authData);
        if (access_token) {
          config.headers.Authorization = `Bearer ${access_token}`;
        }
      }

      // Get Matrix device ID if exists
      const matrixDeviceId = localStorage.getItem('matrix_device_id');
      if (matrixDeviceId) {
        config.headers['Matrix-Device-Id'] = matrixDeviceId;
      }

      logger.debug('[API] Request config:', {
        url: config.url,
        method: config.method,
        hasAuth: !!config.headers.Authorization,
        hasMatrixId: !!config.headers['Matrix-Device-Id']
      });

      return config;
    } catch (error) {
      logger.error('[API] Request interceptor error:', error);
      return Promise.reject(error);
    }
  },
  (error) => {
    logger.error('[API] Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    logger.debug('[API] Response:', {
      url: response.config.url,
      status: response.status,
      hasData: !!response.data
    });
    return response;
  },
  (error) => {
    logger.error('[API] Response error:', {
      url: error.config?.url,
      status: error.response?.status,
      message: error.message
    });
    return Promise.reject(error);
  }
);

// Helper method to get current auth state
api.getAuthState = async () => {
  try {
    const token = await tokenManager.getValidToken();
    if (!token) return null;

    const session = await supabase.auth.getSession();
    return session?.data?.session || null;
  } catch (error) {
    console.error('Error getting auth state:', error);
    return null;
  }
};

export default api; 