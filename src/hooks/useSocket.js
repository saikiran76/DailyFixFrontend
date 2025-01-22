import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { io } from 'socket.io-client';
import { selectSession } from '../store/slices/authSlice';
import logger from '../utils/logger';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3001';

export function useSocket() {
  const socketRef = useRef(null);
  const session = useSelector(selectSession);

  useEffect(() => {
    if (!session?.access_token || !session?.user?.id) {
      logger.debug('[useSocket] No valid session, skipping socket connection');
      return;
    }

    try {
      logger.info('[useSocket] Initializing socket connection');
      
      socketRef.current = io(SOCKET_URL, {
        auth: {
          token: session.access_token,
          userId: session.user.id
        },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        transports: ['websocket']
      });

      const socket = socketRef.current;

      socket.on('connect', () => {
        logger.info('[useSocket] Socket connected successfully');
      });

      socket.on('connect_error', (error) => {
        logger.error('[useSocket] Socket connection error:', error);
      });

      socket.on('disconnect', (reason) => {
        logger.warn('[useSocket] Socket disconnected:', reason);
      });

      socket.on('error', (error) => {
        logger.error('Socket error:', error);
      });

      return () => {
        if (socket) {
          logger.info('[useSocket] Cleaning up socket connection');
          socket.disconnect();
          socketRef.current = null;
        }
      };
    } catch (error) {
      logger.error('[useSocket] Failed to initialize socket:', error);
    }
  }, [session?.access_token, session?.user?.id]);

  return socketRef.current;
}

export default useSocket; 