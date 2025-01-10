import { useState, useCallback } from 'react';
import { socket } from '../utils/socket';
import { api } from '../services/api';

export const useWhatsAppConnection = () => {
  const [state, setState] = useState({
    status: 'initializing',
    error: null,
    retryCount: 0,
    isSocketConnected: false
  });

  const connect = useCallback(async (isRetry = false) => {
    try {
      setState(prev => ({ 
        ...prev, 
        status: 'initializing',
        error: null
      }));

      // Initialize socket connection
      if (!socket.connected) {
        await socket.connect();
      }

      // Request WhatsApp connection through Matrix bridge
      const response = await api.post('/matrix/whatsapp/connect');
      
      if (response.data.status === 'error') {
        throw new Error(response.data.message);
      }

      return socket;

    } catch (error) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: error.message,
        isSocketConnected: false
      }));
      throw error;
    }
  }, []);

  return {
    ...state,
    connect,
    retry: () => connect(true)
  };
}; 