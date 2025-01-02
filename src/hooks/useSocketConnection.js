import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { toast } from 'react-hot-toast';
import { supabase } from '../utils/supabase';
import { getConnectionOptions } from '../utils/socketEvents';
import api from '../utils/api';

const SOCKET_SERVER = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const MAX_RECONNECTION_ATTEMPTS = 3;
const RECONNECTION_DELAY = 2000;

export const useSocketConnection = (platform) => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const socketRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const messageQueueRef = useRef([]);
  const cleanupInProgressRef = useRef(false);
  const tokenValidRef = useRef(true);

  const cleanupSocket = useCallback(() => {
    if (cleanupInProgressRef.current) {
      console.debug('Cleanup already in progress, skipping');
      return;
    }
    
    cleanupInProgressRef.current = true;
    console.debug('Cleaning up existing socket');
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setIsConnected(false);
    setConnectionStatus('disconnected');
    reconnectAttemptsRef.current = 0;
    messageQueueRef.current = [];
    cleanupInProgressRef.current = false;
  }, []);

  const validateToken = useCallback(async () => {
    try {
      // Check if we have a valid session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.debug('No valid session found');
        return false;
      }

      // Verify Discord connection status
      if (platform === 'discord') {
        const maxRetries = 3;
        let retryCount = 0;
        let isValid = false;

        while (retryCount < maxRetries && !isValid) {
          try {
            const { data } = await api.get('/connect/discord/status');
            console.debug('Discord status response:', data);
            if (data?.status === 'active') {
              isValid = true;
              break;
            }
            
            retryCount++;
            if (retryCount < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          } catch (error) {
            console.error('Token validation attempt ${retryCount + 1} failed:', error);
            retryCount++;
            if (retryCount < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        }

        if (!isValid) {
          console.debug('Discord connection not valid after retries');
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  }, [platform]);

  const initializeSocket = useCallback(async () => {
    if (socketRef.current || cleanupInProgressRef.current) {
      console.debug('Socket already exists or cleanup in progress, reusing connection');
      return socketRef.current;
    }

    try {
      // Validate token before attempting connection
      const isValid = await validateToken();
      if (!isValid) {
        tokenValidRef.current = false;
        console.debug('Token validation failed, not initializing socket');
        cleanupSocket();
        return null;
      }

      tokenValidRef.current = true;
      const { data: { session } } = await supabase.auth.getSession();
      
      // Initialize socket with connection options
      console.debug('Initializing socket connection to:', SOCKET_SERVER);
      const socket = io(SOCKET_SERVER, getConnectionOptions(session.access_token, platform));

      // Set up event handlers
      socket.on('connect', () => {
        console.debug('Socket connected successfully');
        setIsConnected(true);
        setConnectionStatus('connected');
        reconnectAttemptsRef.current = 0;
        
        if (tokenValidRef.current) {
          toast.success('Real-time updates enabled');
        }

        // Process any queued messages
        if (messageQueueRef.current.length > 0) {
          console.debug('Processing queued messages:', messageQueueRef.current.length);
          messageQueueRef.current.forEach(({ event, data }) => {
            socket.emit(event, data);
          });
          messageQueueRef.current = [];
        }
      });

      socket.on('connect_error', async (error) => {
        console.error('Socket connection error:', error);
        setConnectionStatus('error');
        
        // Check if error is auth-related
        if (error.message?.includes('auth') || error.message?.includes('unauthorized')) {
          const isValid = await validateToken();
          if (!isValid) {
            tokenValidRef.current = false;
            cleanupSocket();
            return;
          }
        }
        
        handleReconnection();
      });

      socket.on('disconnect', async (reason) => {
        console.debug('Socket disconnected:', reason);
        setIsConnected(false);
        setConnectionStatus('disconnected');

        if (reason === 'io server disconnect' || reason === 'io client disconnect') {
          cleanupSocket();
        } else {
          // Validate token before attempting reconnection
          const isValid = await validateToken();
          if (!isValid) {
            tokenValidRef.current = false;
            cleanupSocket();
            return;
          }
          handleReconnection();
        }
      });

      socket.on('error', async (error) => {
        console.error('Socket error:', error);
        setConnectionStatus('error');
        
        if (error.type === 'unauthorized') {
          const isValid = await validateToken();
          if (!isValid) {
            tokenValidRef.current = false;
            cleanupSocket();
            return;
          }
        }
      });

      socketRef.current = socket;
      return socket;
    } catch (error) {
      console.error('Error initializing socket:', error);
      setConnectionStatus('error');
      cleanupSocket();
      return null;
    }
  }, [platform, cleanupSocket, validateToken]);

  const handleReconnection = useCallback(() => {
    if (!tokenValidRef.current || reconnectAttemptsRef.current >= MAX_RECONNECTION_ATTEMPTS) {
      console.debug('Max reconnection attempts reached or token invalid');
      cleanupSocket();
      if (tokenValidRef.current) {
        toast.error('Lost connection to server. Please refresh the page.');
      }
      return;
    }

    reconnectAttemptsRef.current += 1;
    const delay = RECONNECTION_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1);
    
    console.debug(`Attempting reconnection ${reconnectAttemptsRef.current}/${MAX_RECONNECTION_ATTEMPTS} in ${delay}ms`);
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    reconnectTimeoutRef.current = setTimeout(async () => {
      if (socketRef.current?.connected) return;
      
      try {
        const isValid = await validateToken();
        if (!isValid) {
          tokenValidRef.current = false;
          cleanupSocket();
          return;
        }
        
        await initializeSocket();
      } catch (error) {
        console.error('Reconnection attempt failed:', error);
        handleReconnection();
      }
    }, delay);
  }, [cleanupSocket, initializeSocket, validateToken]);

  // Initialize socket connection
  useEffect(() => {
    const init = async () => {
      const isValid = await validateToken();
      if (isValid) {
        await initializeSocket();
      }
    };
    
    init();
    return cleanupSocket;
  }, [platform, initializeSocket, cleanupSocket, validateToken]);

  return {
    socket: socketRef.current,
    isConnected,
    connectionStatus,
    messageQueue: messageQueueRef.current
  };
};

export default useSocketConnection; 