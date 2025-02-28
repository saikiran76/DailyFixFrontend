import { io } from 'socket.io-client';
import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import logger from './logger';
import TokenManager from './tokenManager';
import tokenService from '../services/tokenService';

// Update socket URL configuration
const SOCKET_URL = import.meta.env.VITE_API_URL || 
  (import.meta.env.VITE_DEV ? 'http://23.22.150.97:3002' : 'http://23.22.150.97:3002');

logger.info('[Socket] Initializing with URL:', SOCKET_URL);

// Socket connection states for better state management
export const SOCKET_STATES = {
  INITIAL: 'initial',
  CONNECTING: 'connecting',
  AUTHENTICATING: 'authenticating',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  ERROR: 'error'
};

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

// Enhanced socket state tracking
let socketState = {
  state: SOCKET_STATES.INITIAL,
  authenticated: false,
  connecting: false,
  connectionStart: Date.now(),
  lastActivity: Date.now(),
  pendingOperations: new Set(),
  roomSubscriptions: new Set(),
  error: null,
  retryCount: 0,
  lastHeartbeat: Date.now()
};

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
    socketState.state = SOCKET_STATES.CONNECTING;
    socketState.connectionStart = Date.now();

    connectionPromise = new Promise(async (resolve, reject) => {
      try {
        if (socketInstance && !socketInstance.connected) {
          logger.info('Cleaning up disconnected socket');
          await cleanupSocket();
        }

        // Get valid token using token service with retry
        let tokens = null;
        let retryCount = 0;
        const maxRetries = CONNECTION_CONFIG.RECONNECTION_ATTEMPTS;

        while (retryCount < maxRetries) {
          try {
            const tokenData = await tokenService.getValidToken();
            tokens = {
              accessToken: tokenData.access_token,
              userId: tokenData.userId
            };
            break;
          } catch (error) {
            retryCount++;
            if (retryCount === maxRetries) {
              throw error;
            }
            await new Promise(r => setTimeout(r, CONNECTION_CONFIG.RECONNECTION_DELAY));
          }
        }

        if (!tokens?.accessToken) {
          throw new Error('No valid access token available');
        }

        // Initialize socket with robust configuration
        socketInstance = io(SOCKET_URL, {
          auth: {
            token: tokens.accessToken,
            userId: tokens.userId
          },
          reconnection: true,
          reconnectionAttempts: CONNECTION_CONFIG.RECONNECTION_ATTEMPTS,
          reconnectionDelay: CONNECTION_CONFIG.RECONNECTION_DELAY,
          reconnectionDelayMax: CONNECTION_CONFIG.RECONNECTION_DELAY_MAX,
          timeout: CONNECTION_CONFIG.CONNECTION_TIMEOUT,
          transports: ['polling', 'websocket'],  // Allow polling fallback
          forceNew: true,
          autoConnect: true,  // Changed to true
          withCredentials: true,
          extraHeaders: {
            'Authorization': `Bearer ${tokens.accessToken}`
          }
        });

        // Set up connection handlers
        socketInstance.on('connect', () => {
          logger.info('Socket connected successfully');
          socketState.state = SOCKET_STATES.CONNECTED;
          socketState.authenticated = true;
          socketState.error = null;
          socketState.retryCount = 0;
          socketState.lastActivity = Date.now();
          
          // Authenticate immediately after connection
          socketInstance.emit('authenticate', { 
            token: tokens.accessToken,
            userId: tokens.userId 
          });
        });

        socketInstance.on('connect_error', (error) => {
          logger.error('Socket connection error:', error);
          socketState.state = SOCKET_STATES.ERROR;
          socketState.error = error;
          socketState.retryCount++;

          if (socketState.retryCount >= maxRetries) {
            reject(new Error('Max reconnection attempts reached'));
          }
        });

        socketInstance.on('disconnect', (reason) => {
          logger.warn('Socket disconnected:', reason);
          socketState.state = SOCKET_STATES.DISCONNECTED;
          socketState.authenticated = false;

          if (reason === 'io server disconnect') {
            // Server initiated disconnect, attempt reconnection
            socketInstance.connect();
          }
        });

        // Set up heartbeat
        const heartbeatInterval = setInterval(() => {
          if (socketInstance?.connected) {
            socketInstance.emit('heartbeat');
            socketState.lastHeartbeat = Date.now();
          }
        }, 30000);

        // Clean up on window unload
        window.addEventListener('beforeunload', () => {
          clearInterval(heartbeatInterval);
          cleanupSocket();
        });

        // Wait for initial connection
        await new Promise((resolveConnection, rejectConnection) => {
          const timeout = setTimeout(() => {
            rejectConnection(new Error('Connection timeout'));
          }, CONNECTION_CONFIG.CONNECTION_TIMEOUT);

          socketInstance.once('connect', () => {
            clearTimeout(timeout);
            resolveConnection();
          });
        });

        resolve(socketInstance);
      } catch (error) {
        logger.error('Socket initialization error:', error);
        socketState.state = SOCKET_STATES.ERROR;
        socketState.error = error;
        reject(error);
      }
    });

    return await connectionPromise;
  } catch (error) {
    logger.error('Fatal socket initialization error:', error);
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
    return { connected: false, status: 'not_initialized', socket: null };
  }

  const health = {
    connected: socketInstance.connected,
    status: socketInstance.connected ? 'connected' : 'disconnected',
    socket: socketInstance,
    lastActivity: socketState.lastActivity,
    authenticated: socketState.authenticated,
    pendingOperations: socketState.pendingOperations.size,
    reconnectAttempts: 0
  };

  return health;
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

const handleReconnect = async (socket, options = {}) => {
  if (socketState.connecting) return;
  socketState.connecting = true;

  try {
    // Enhanced token refresh with retries
    const tokens = await handleTokenRefresh(socket);
    
    if (socket) {
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
    }
  } catch (error) {
    logger.error('Reconnection failed after token refresh attempts:', error);
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
  let connectionTimeout = null;

  // Reset socket state for new connection
  socketState = {
    authenticated: false,
    connecting: false,
    connectionStart: Date.now(),
    lastActivity: Date.now(),
    pendingOperations: new Set(),
    roomSubscriptions: new Set()
  };

  const clearTimeouts = () => {
    if (heartbeatTimeout) {
      clearTimeout(heartbeatTimeout);
      heartbeatTimeout = null;
    }
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
      connectionTimeout = null;
    }
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

  // Enhanced connection timeout with retry
  const setupConnectionTimeout = () => {
    clearTimeout(connectionTimeout);
    connectionTimeout = setTimeout(async () => {
      if (!socket.connected) {
        logger.error('Socket connection timeout');
        
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          logger.info('Attempting reconnection after timeout');
          await handleReconnect(socket, options);
        } else {
          const error = new Error('Socket connection timeout after retries');
          if (options.onError) {
            options.onError(error);
          }
          reject(error);
        }
      }
    }, options.timeout || CONNECTION_CONFIG.CONNECTION_TIMEOUT);
  };

  socket.on('connect_error', async (error) => {
    logger.error('Socket connection error:', error);
    
    if (error.message.includes('auth')) {
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        await handleReconnect(socket, options);
      } else {
        if (options.onAuthError) {
          options.onAuthError(error);
        }
        reject(error);
      }
    } else if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      const baseDelay = INITIAL_RETRY_DELAY * Math.pow(2, reconnectAttempts - 1);
      const jitter = Math.floor(Math.random() * 1000);
      const delay = Math.min(baseDelay + jitter, 30000);
      
      logger.info(`Attempting reconnection ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);
      
      setTimeout(() => {
        if (!socket.connected) {
          handleReconnect(socket, options);
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
    clearTimeouts();
    
    // Update state
    socketState.authenticated = false;
    socketState.lastActivity = Date.now();
    
    // Clean up room subscriptions
    await cleanupRoomSubscriptions(socket);
    
    // Handle disconnects that should trigger a reconnect
    if (reason === 'io server disconnect' || reason === 'transport close') {
      reconnectAttempts = 0; // Reset counter for new connection attempt
      handleReconnect(socket, options);
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
    socketState.connecting = false;
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
        handleReconnect(socket, options);
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

  socket.on('connect', () => {
    clearTimeouts();
    socketState.state = SOCKET_STATES.AUTHENTICATING;
    socketState.connectionStart = Date.now();
    socketState.lastActivity = Date.now();
    if (options.onStateChange) {
      options.onStateChange(socketState);
    }
    resolve(socket);
  });

  // Set initial connection timeout
  setupConnectionTimeout();
};

// Enhanced socket manager with proper state synchronization
class SocketManager {
  constructor() {
    // Direct reference to socketState instead of copying
    this.state = socketState;
    this.socket = null;
    this.connectionPromise = null;
    this.eventHandlers = new Map();
    this.stateChangeListeners = new Set();
    this.connectionTimeout = null;
    this.heartbeatTimeout = null;
  }

  // State management
  updateState(updates) {
    Object.assign(this.state, updates);
    // Notify listeners of state change
    this.stateChangeListeners.forEach(listener => listener(this.state));
  }

  onStateChange(listener) {
    this.stateChangeListeners.add(listener);
    return () => this.stateChangeListeners.delete(listener);
  }

  // Enhanced socket readiness check
  isReady() {
    return this.socket?.connected && this.state.authenticated && 
           this.state.state === SOCKET_STATES.CONNECTED;
  }

  // Enhanced emit with connection waiting
  async emit(event, data, options = {}) {
      if (!this.isReady()) {
      if (options.waitForConnection) {
        await this.waitForConnection(options.timeout);
      } else {
        throw new Error('Socket not ready for operations');
      }
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Event emission timeout'));
      }, options.timeout || 5000);

      this.socket.emit(event, data, (response) => {
        clearTimeout(timeout);
        if (response?.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });
    });
  }

  // Enhanced event subscription
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event).add(handler);

    if (this.socket) {
      this.socket.on(event, handler);
    }

    return () => this.off(event, handler);
  }

  // Enhanced event unsubscription
  off(event, handler) {
    if (this.socket) {
      this.socket.off(event, handler);
    }
    
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(event);
      }
    }
  }

  // Reattach event handlers after reconnection
  reattachEventHandlers(socket) {
    for (const [event, handlers] of this.eventHandlers) {
      for (const handler of handlers) {
        socket.on(event, handler);
      }
    }
  }

  // Enhanced connection with proper state transitions
  async connect(options = {}) {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.updateState({
      state: SOCKET_STATES.CONNECTING,
      error: null,
      retryCount: 0,
      connecting: true
    });

    try {
      const socket = await initializeSocket({
        ...options,
        onStateChange: (newState) => this.updateState(newState)
      });
      
      this.socket = socket;
      this.reattachEventHandlers(socket);

      return socket;
    } catch (error) {
      this.updateState({
        state: SOCKET_STATES.ERROR,
        error,
        connecting: false
      });
      throw error;
    }
  }

  // Wait for connection to be ready
  waitForConnection(timeout = 5000) {
    return new Promise((resolve, reject) => {
      if (this.isReady()) {
        resolve();
        return;
      }

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Connection timeout'));
      }, timeout);

      const onStateChange = (state) => {
        if (this.isReady()) {
          cleanup();
          resolve();
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.stateChangeListeners.delete(onStateChange);
      };

      this.stateChangeListeners.add(onStateChange);
    });
  }

  // Enhanced health check
  checkHealth() {
    return {
      state: this.state.state,
      connected: this.socket?.connected || false,
      authenticated: this.state.authenticated,
      lastActivity: this.state.lastActivity,
      lastHeartbeat: this.state.lastHeartbeat,
      pendingOperations: this.state.pendingOperations.size,
      roomSubscriptions: Array.from(this.state.roomSubscriptions),
      error: this.state.error,
      retryCount: this.state.retryCount,
      uptime: this.state.connectionStart ? Date.now() - this.state.connectionStart : 0
    };
  }

  // Enhanced disconnect
  async disconnect() {
    this.updateState({
      state: SOCKET_STATES.DISCONNECTED,
      authenticated: false,
      connecting: false
    });
    
    await cleanupSocket();
    this.socket = null;
    this.connectionPromise = null;
  }
}

// Create singleton instance
const socketManager = new SocketManager();

export default socketManager; 