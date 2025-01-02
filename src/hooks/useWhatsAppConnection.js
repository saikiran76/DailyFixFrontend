import React, { useState, useCallback } from 'react';
import { initializeSocket, handleStatusUpdate, handleSocketError, handleSocketDisconnect } from '../services/directServices/whatsappDirect';
import { api } from '../services/api';

export const useWhatsAppConnection = () => {
  const [state, setState] = useState({
    status: 'initializing',
    qrCode: null,
    error: null,
    retryCount: 0,
    isSocketConnected: false
  });

  const connect = useCallback(async (isRetry = false) => {
    try {
      setState(prev => ({ 
        ...prev, 
        status: 'initializing',
        error: null,
        qrCode: null 
      }));

      const socket = await initializeSocket();
      
      if (!socket) {
        throw new Error('Failed to initialize socket connection');
      }

      const setupSocketListeners = (socket) => {
        socket.on('whatsapp_status', handleStatusUpdate);
        socket.on('connect_error', handleSocketError);
        socket.on('disconnect', handleSocketDisconnect);
      };

      setupSocketListeners(socket);

      const response = await api.post('/connect/whatsapp/initiate');
      
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