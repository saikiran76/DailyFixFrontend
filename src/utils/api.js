import axios from 'axios';
import { supabase } from './supabase';

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

// Create API instance with interceptors
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 30000,
  withCredentials: true
});

// Request interceptor
api.interceptors.request.use(
  async (config) => {
    try {
      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
      }

      // Add request ID for tracking
      config.headers['X-Request-ID'] = crypto.randomUUID();

      return config;
    } catch (error) {
      console.error('Error in request interceptor:', error);
      return Promise.reject(error);
    }
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    // Validate response format
    const { data } = response;
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response format');
    }

    // Handle partial responses
    if (data.status === ResponseStatus.PARTIAL) {
      console.warn('Received partial response:', data);
    }

    return response;
  },
  async (error) => {
    if (!error.response) {
      // Network error
      return Promise.reject({
        type: ErrorTypes.NETWORK_ERROR,
        message: 'Network error occurred',
        original: error
      });
    }

    const { response } = error;
    const errorData = {
      type: ErrorTypes.API_ERROR,
      status: response.status,
      message: response.data?.message || 'An error occurred',
      original: error
    };

    // Handle specific error types
    if (response.status === 429) {
      errorData.type = ErrorTypes.RATE_LIMIT;
      errorData.retryAfter = parseInt(response.headers['retry-after'] || '5000');
    } else if (response.status === 401) {
      errorData.type = ErrorTypes.TOKEN_INVALID;
      
      // Try to refresh the session
      try {
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError) {
          // Retry the original request
          const { config } = error;
          const { data: { session } } = await supabase.auth.getSession();
          
          if (session?.access_token) {
            config.headers.Authorization = `Bearer ${session.access_token}`;
            return api(config);
          }
        }
      } catch (refreshError) {
        console.error('Error refreshing session:', refreshError);
      }
    } else if (response.status === 403) {
      errorData.type = ErrorTypes.TOKEN_EXPIRED;
    } else if (response.status === 503) {
      errorData.type = ErrorTypes.SERVICE_UNAVAILABLE;
    }

    // Add request tracking
    errorData.requestId = response.config.headers['X-Request-ID'];

    return Promise.reject(errorData);
  }
);

export default api; 