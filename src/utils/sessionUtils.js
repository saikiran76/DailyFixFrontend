import api from './api';

export const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

export const validateSession = async () => {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      return { valid: false, error: 'No session token found' };
    }

    const lastActivity = localStorage.getItem('last_activity');
    if (lastActivity && Date.now() - parseInt(lastActivity) > SESSION_TIMEOUT) {
      return { valid: false, error: 'Session expired' };
    }

    // Verify token with backend
    const response = await api.get('/auth/verify');
    if (!response.data.valid) {
      return { valid: false, error: 'Invalid session' };
    }

    // Update last activity
    localStorage.setItem('last_activity', Date.now().toString());
    return { valid: true };
  } catch (error) {
    console.error('Session validation error:', error);
    return { valid: false, error: error.message };
  }
};

// export const updateLastActivity = () => {
//   localStorage.setItem('last_activity', Date.now().toString());
// };

export const clearSession = () => {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('last_activity');
  localStorage.removeItem('matrix_credentials');
}; 