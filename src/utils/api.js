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

// const response = await axios.get(
//   'http://localhost:3001/connect/discord/servers/662267976984297473/channels',
//   {
//     headers: {
//       Authorization: 'Bearer <your_token>',
//       Accept: 'application/json',
//       'Content-Type': 'application/json',
//     },
//   }
// );
// console.log(response.data);

// Create API instance with interceptors
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
  timeout: 30000,
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  },
  withCredentials: false,
  transformRequest: [
    (data, headers) => {
      // Keep the original data transformation
      if (data && headers['Content-Type'] === 'application/json') {
        return JSON.stringify(data);
      }
      return data;
    }
  ]
});

// Request interceptor
api.interceptors.request.use(
  async (config) => {
    try {
      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
        console.log('Access token found and set in headers');
      } else {
        console.warn('No access token available');
      }

      // Add request ID for tracking
      config.headers['X-Request-ID'] = crypto.randomUUID();

      // Handle different endpoint types
      if (config.url?.includes('/discord/')) {
        // Remove any existing /connect prefix to avoid duplication
        const cleanUrl = config.url.replace('/connect', '');
        config.url = `/connect${cleanUrl}`;
      } else if (config.url?.includes('/matrix/')) {
        // Ensure matrix endpoints are properly prefixed
        const cleanUrl = config.url.replace('/matrix', '');
        config.url = `/matrix${cleanUrl}`;
      }

      // Log the final request configuration
      console.log('Request:', {
        url: config.url,
        fullUrl: `${config.baseURL}${config.url}`,
        method: config.method,
        headers: {
          ...config.headers,
          Authorization: '[REDACTED]'
        }
      });

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
    // Log successful responses
    console.log('Response:', {
      url: response.config.url,
      status: response.status,
      data: response.data
    });
    return response;
  },
  async (error) => {
    // Log the error details
    console.error('API Error:', {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });

    // Handle 401 Unauthorized errors
    if (error.response?.status === 401) {
      try {
        // Attempt to refresh the session
        const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError) {
          console.error('Session refresh failed:', refreshError);
          // Clear session and redirect to login
          await supabase.auth.signOut();
          window.location.href = '/login';
          return Promise.reject(error);
        }

        if (session) {
          // Retry the original request with new token
          const originalRequest = error.config;
          originalRequest.headers.Authorization = `Bearer ${session.access_token}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        console.error('Error refreshing session:', refreshError);
        // Clear session and redirect to login
        await supabase.auth.signOut();
        window.location.href = '/login';
      }
    }

    // Handle network errors
    if (!error.response) {
      console.error('Network error:', error.message);
      return Promise.reject({
        status: 'error',
        message: 'Network error. Please check your connection.',
        error: error.message
      });
    }

    // Handle other errors
    return Promise.reject({
      status: 'error',
      message: error.response?.data?.message || 'An unexpected error occurred',
      error: error.response?.data
    });
  }
);

api.getAccessToken = async function() {
  try {
    // First try to get the current session directly from Supabase
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token && session?.user?.id) {
      return {
        token: session.access_token,
        userId: session.user.id
      };
    }

    // If no session, try to refresh it
    const { data: { session: refreshedSession } } = await supabase.auth.refreshSession();
    if (refreshedSession?.access_token && refreshedSession?.user?.id) {
      return {
        token: refreshedSession.access_token,
        userId: refreshedSession.user.id
      };
    }

    console.error('No valid session found');
    return null;
  } catch (error) {
    console.error('Error getting access token:', error);
    return null;
  }
};

export default api; 