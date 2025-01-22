import { io } from 'socket.io-client';
import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import logger from './logger';
import TokenManager from './tokenManager';
import tokenService from '../services/tokenService';

const SOCKET_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';

const CONNECTION_CONFIG = {
  RECONNECTION_ATTEMPTS: 3,
  RECONNECTION_DELAY: 2000,
  RECONNECTION_DELAY_MAX: 10000,
  CONNECTION_TIMEOUT: 30000
};

let socketInstance = null;
let connectionPromise = null;
let messageHandler = null;
let connectionAttemptInProgress = false;

// Discord message handling
export const subscribeToDiscordMessages = (channelId, handler) => {
  if (!socketInstance) {
    logger.info('Socket not initialized');
    return;
  }

  // Remove any existing handler
  if (messageHandler) {
    socketInstance.off('discord_message', messageHandler);
  }

  // Create a new handler that filters messages for this channel
  messageHandler = (data) => {
    if (data.message && data.message.channelId === channelId) {
      handler(data.message);
    }
  };

  // Subscribe to Discord messages
  socketInstance.on('discord_message', messageHandler);
};

export const unsubscribeFromDiscordMessages = () => {
  if (socketInstance && messageHandler) {
    socketInstance.off('discord_message', messageHandler);
    messageHandler = null;
  }
};

export const initializeSocket = async (options = {}) => {
  if (connectionPromise) {
    logger.info('Returning existing connection promise');
    return connectionPromise;
  }

  if (socketInstance?.connected) {
    logger.info('Returning existing connected socket');
    return socketInstance;
  }

  try {
    connectionAttemptInProgress = true;
    connectionPromise = new Promise(async (resolve, reject) => {
      try {
        if (socketInstance && !socketInstance.connected) {
          logger.info('Cleaning up disconnected socket');
          await cleanupSocket();
        }

        // Get valid token using token service
        const tokens = await tokenService.getValidToken();
        if (!tokens?.access_token) {
          throw new Error('No valid token available');
        }

        logger.info('Creating new socket connection', {
          hasToken: !!tokens.access_token,
          userId: tokens.userId
        });

        socketInstance = io(SOCKET_URL, {
          auth: {
            token: tokens.access_token,
            userId: tokens.userId
          },
          transports: ['websocket'],
          reconnection: true,
          reconnectionAttempts: CONNECTION_CONFIG.RECONNECTION_ATTEMPTS,
          reconnectionDelay: CONNECTION_CONFIG.RECONNECTION_DELAY,
          reconnectionDelayMax: CONNECTION_CONFIG.RECONNECTION_DELAY_MAX,
          timeout: options.timeout || CONNECTION_CONFIG.CONNECTION_TIMEOUT,
          forceNew: true
        });

        // Subscribe to token updates
        const unsubscribe = tokenService.subscribe(async (newTokens) => {
          if (socketInstance?.connected) {
            logger.info('Updating socket authentication with new token');
            socketInstance.auth.token = newTokens.access_token;
            socketInstance.auth.userId = newTokens.userId;
          }
        });

        setupSocketListeners(socketInstance, { ...options, unsubscribe }, resolve, reject);

      } catch (error) {
        logger.error('Socket initialization error:', error);
        reject(error);
      }
    });

    return await connectionPromise;
  } catch (error) {
    logger.error('Socket initialization failed:', error);
    throw error;
  } finally {
    connectionAttemptInProgress = false;
    connectionPromise = null;
  }
};

const cleanupSocket = async () => {
  if (socketInstance) {
    logger.info('Cleaning up socket');
    
    // Clean up token subscription if it exists
    if (socketInstance._tokenUnsubscribe) {
      socketInstance._tokenUnsubscribe();
      delete socketInstance._tokenUnsubscribe;
    }
    
    socketInstance.removeAllListeners();
    socketInstance.disconnect();
    socketInstance = null;
    connectionPromise = null;
  }
};

export const disconnectSocket = cleanupSocket;

export const getSocket = () => socketInstance;

export const checkSocketHealth = () => {
  if (!socketInstance) {
    return { connected: false, status: 'not_initialized' };
  }
  return {
    connected: socketInstance.connected,
    status: socketInstance.connected ? 'connected' : 'disconnected'
  };
};

export function useSocket() {
  const [socket, setSocket] = useState(socketInstance);
  
  useEffect(() => {
    if (!socketInstance) {
      initializeSocket()
        .then(instance => setSocket(instance))
        .catch(error => logger.info('Socket initialization failed:', error));
    } else {
      setSocket(socketInstance);
    }
  }, []);

  return socket;
}

const handleTokenRefresh = async (socket, retryCount = 0) => {
  try {
    const tokens = await tokenService.getValidToken();
    if (!tokens?.access_token) {
      throw new Error('Failed to refresh tokens');
    }
    return tokens;
  } catch (error) {
    logger.error('Token refresh failed:', error);
    throw error;
  }
};

const handleReconnect = async () => {
  if (socketState.connecting) return;
  socketState.connecting = true;

  try {
    // Enhanced token refresh with retries
    const tokens = await handleTokenRefresh(socket);
    
    socket.auth.token = tokens.access_token;
    socket.auth.userId = tokens.userId;
    
    // Update socket state before reconnect
    socketState.lastTokenRefresh = Date.now();
    socketState.authenticated = false;
    
    socket.connect();

    logger.info('Reconnection initiated with fresh tokens', {
      userId: tokens.userId,
      tokenRefreshTime: socketState.lastTokenRefresh
    });
  } catch (error) {
    logger.info('Reconnection failed after token refresh attempts:', error);
    if (options.onAuthError) {
      options.onAuthError(error);
    }
  } finally {
    socketState.connecting = false;
  }
};

const setupSocketListeners = (socket, options, resolve, reject) => {
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const INITIAL_RETRY_DELAY = 1000;
  let heartbeatTimeout = null;
  let lastHeartbeat = Date.now();

  const socketState = {
    authenticated: false,
    connecting: false,
    connectionStart: Date.now(),
    lastActivity: Date.now(),
    pendingOperations: new Set(),
    roomSubscriptions: new Set()
  };

  const updateSocketMetrics = () => {
    if (!socket) return;
    
    const metrics = {
      connected: socket.connected,
      authenticated: socketState.authenticated,
      connectionDuration: Date.now() - socketState.connectionStart,
      lastHeartbeat,
      pendingOperations: socketState.pendingOperations.size,
      roomSubscriptions: Array.from(socketState.roomSubscriptions),
      reconnectAttempts
    };

    logger.info('[Socket Metrics]', metrics);
    return metrics;
  };

  socket.on('connect_error', async (error) => {
    logger.info('Socket connection error:', error);
    
    if (error.message.includes('auth')) {
      // Handle auth errors
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        await handleReconnect();
      } else {
        if (options.onAuthError) {
          options.onAuthError(error);
        }
        reject(error);
      }
    } else if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      // Handle other connection errors with exponential backoff
      reconnectAttempts++;
      const baseDelay = INITIAL_RETRY_DELAY * Math.pow(2, reconnectAttempts - 1);
      const jitter = Math.floor(Math.random() * 1000);
      const delay = Math.min(baseDelay + jitter, 30000);
      
      logger.info(`Attempting reconnection ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);
      
      setTimeout(() => {
        if (!socket.connected) {
          handleReconnect();
        }
      }, delay);
    } else if (options.onError) {
      options.onError(error);
      reject(error);
    }
  });

  const handleRoomSubscription = async (socket, roomId, action) => {
    try {
      if (action === 'join') {
        await socket.emit('room:join', roomId);
        socketState.roomSubscriptions.add(roomId);
        logger.info(`Room subscription requested: ${roomId}`);
      } else if (action === 'leave') {
        await socket.emit('room:leave', roomId);
        socketState.roomSubscriptions.delete(roomId);
        logger.info(`Room unsubscription requested: ${roomId}`);
      }
    } catch (error) {
      logger.info(`Room ${action} failed:`, {
        roomId,
        error: error.message,
        socketId: socket.id
      });
      throw error;
    }
  };

  const cleanupRoomSubscriptions = async (socket) => {
    const rooms = Array.from(socketState.roomSubscriptions);
    logger.info(`Cleaning up ${rooms.length} room subscriptions`);

    await Promise.allSettled(
      rooms.map(roomId => handleRoomSubscription(socket, roomId, 'leave'))
    ).then(results => {
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          logger.info(`Failed to cleanup room subscription:`, {
            roomId: rooms[index],
            error: result.reason
          });
        }
      });
    });

    socketState.roomSubscriptions.clear();
  };

  socket.on('disconnect', async (reason) => {
    logger.info('Socket disconnected:', reason);
    clearTimeout(heartbeatTimeout);
    
    // Update state
    socketState.authenticated = false;
    socketState.lastActivity = Date.now();
    
    // Clean up room subscriptions
    await cleanupRoomSubscriptions(socket);
    
    // Handle disconnects that should trigger a reconnect
    if (reason === 'io server disconnect' || reason === 'transport close') {
      reconnectAttempts = 0; // Reset counter for new connection attempt
      handleReconnect();
    }
    
    if (options.onDisconnect) {
      options.onDisconnect(reason);
    }

    // Log final metrics
    updateSocketMetrics();
  });

  socket.on('auth:error', (error) => {
    logger.info('Socket authentication error:', error);
    socketState.authenticated = false;
    
    if (error.retryable) {
      logger.info(`Waiting for auth retry ${error.retryCount}, next attempt in ${error.nextRetryDelay}ms`);
      // Server will handle retry
    } else if (options.onAuthError) {
      options.onAuthError(error);
    }
  });

  socket.on('auth:success', (data) => {
    logger.info('Socket authenticated:', data);
    socketState.authenticated = true;
    socketState.lastActivity = Date.now();
    reconnectAttempts = 0; // Reset counter on successful auth
    
    // Update metrics
    updateSocketMetrics();
  });

  socket.on('heartbeat', (data) => {
    lastHeartbeat = data.timestamp;
    socketState.lastActivity = Date.now();
    socket.emit('heartbeat_ack');
    
    // Clear existing timeout
    clearTimeout(heartbeatTimeout);
    
    // Set new timeout for missing heartbeat
    heartbeatTimeout = setTimeout(() => {
      logger.warn('Missed heartbeat, checking connection...', {
        lastHeartbeat,
        timeSinceLastHeartbeat: Date.now() - lastHeartbeat
      });
      
      if (!socket.connected) {
        handleReconnect();
      }
    }, 45000); // 45 second timeout
  });

  socket.on('connection:duplicate', (data) => {
    logger.warn('Duplicate connection detected:', data);
    if (options.onDuplicateConnection) {
      options.onDuplicateConnection(data);
    }
  });

  // Room subscription handling
  socket.on('room:joined', ({ roomId }) => {
    socketState.roomSubscriptions.add(roomId);
    logger.info(`Joined room: ${roomId}`, {
      currentRooms: Array.from(socketState.roomSubscriptions)
    });
  });

  socket.on('room:left', ({ roomId }) => {
    socketState.roomSubscriptions.delete(roomId);
    logger.info(`Left room: ${roomId}`, {
      currentRooms: Array.from(socketState.roomSubscriptions)
    });
  });

  socket.on('room:error', ({ roomId, error }) => {
    logger.info(`Room error for ${roomId}:`, {
      error,
      socketId: socket.id,
      currentRooms: Array.from(socketState.roomSubscriptions)
    });
  });

  // Set connection timeout
  const connectionTimeout = setTimeout(() => {
    if (!socket.connected) {
      const error = new Error('Socket connection timeout');
      if (options.onError) {
        options.onError(error);
      }
      reject(error);
    }
  }, options.timeout || CONNECTION_CONFIG.CONNECTION_TIMEOUT);

  socket.on('connect', () => {
    clearTimeout(connectionTimeout);
    socketState.connectionStart = Date.now();
    socketState.lastActivity = Date.now();
    resolve(socket);
  });
};

const socketManager = {
  connect: initializeSocket,
  disconnect: disconnectSocket,
  getSocket,
  checkHealth: checkSocketHealth,
  subscribeToDiscordMessages,
  unsubscribeFromDiscordMessages
};

export default socketManager; 