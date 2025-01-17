import io from 'socket.io-client';
import { supabase } from './supabase';

let socketInstance = null;
let connectionAttemptInProgress = false;
let connectionPromise = null;
let messageHandler = null;
const SOCKET_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';

const CONNECTION_CONFIG = {
  RECONNECTION_ATTEMPTS: 3,
  RECONNECTION_DELAY: 2000,
  RECONNECTION_DELAY_MAX: 10000,
  CONNECTION_TIMEOUT: 30000
};

// Discord message handling
export const subscribeToDiscordMessages = (channelId, handler) => {
  if (!socketInstance) {
    console.error('Socket not initialized');
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
  // If there's already a connection attempt in progress, return that promise
  if (connectionPromise) {
    console.log('Returning existing connection promise');
    return connectionPromise;
  }

  // If socket exists and is connected, return it
  if (socketInstance?.connected) {
    console.log('Returning existing connected socket');
    return socketInstance;
  }

  try {
    connectionAttemptInProgress = true;
    connectionPromise = new Promise(async (resolve, reject) => {
      try {
        // Clean up existing socket if it exists but isn't connected
        if (socketInstance && !socketInstance.connected) {
          console.log('Cleaning up disconnected socket');
          await disconnectSocket();
        }

        // Get current Supabase session
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error('No valid session found');
        }

        console.log('Creating new socket connection with auth:', {
          hasToken: !!session.access_token,
          userId: session.user.id
        });

        socketInstance = io(SOCKET_URL, {
          auth: {
            token: session.access_token,
            userId: session.user.id
          },
          transports: ['websocket'],
          reconnection: true,
          reconnectionAttempts: CONNECTION_CONFIG.RECONNECTION_ATTEMPTS,
          reconnectionDelay: CONNECTION_CONFIG.RECONNECTION_DELAY,
          reconnectionDelayMax: CONNECTION_CONFIG.RECONNECTION_DELAY_MAX,
          timeout: options.timeout || CONNECTION_CONFIG.CONNECTION_TIMEOUT,
          forceNew: true
        });

        // Set up connection promise handlers
        socketInstance.on('connect', () => {
          console.log('Socket connected successfully');
          if (options.onConnect) {
            options.onConnect();
          }
          resolve(socketInstance);
        });

        socketInstance.on('connect_error', async (error) => {
          console.error('Socket connection error:', error);
          
          if (error.message?.includes('Authentication failed')) {
            // Check current session
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            if (!currentSession?.access_token) {
              if (options.onAuthError) {
                options.onAuthError(error);
              }
              reject(error);
            } else {
              // Update socket auth with current token and reconnect
              socketInstance.auth.token = currentSession.access_token;
              socketInstance.auth.userId = currentSession.user.id;
              socketInstance.connect();
            }
          } else if (options.onError) {
            options.onError(error);
            reject(error);
          }
        });

        socketInstance.on('disconnect', (reason) => {
          console.log('Socket disconnected:', reason);
          if (options.onDisconnect) {
            options.onDisconnect(reason);
          }
        });

        // Set timeout for connection
        const timeout = setTimeout(() => {
          if (!socketInstance?.connected) {
            const error = new Error('Socket connection timeout');
            if (options.onError) {
              options.onError(error);
            }
            reject(error);
          }
        }, options.timeout || CONNECTION_CONFIG.CONNECTION_TIMEOUT);

        // Clean up timeout on connection
        socketInstance.on('connect', () => {
          clearTimeout(timeout);
        });

      } catch (error) {
        console.error('Socket initialization error:', error);
        reject(error);
      }
    });

    return await connectionPromise;
  } catch (error) {
    console.error('Socket initialization failed:', error);
    throw error;
  } finally {
    connectionAttemptInProgress = false;
    connectionPromise = null;
  }
};

export const disconnectSocket = async () => {
  if (socketInstance) {
    console.log('Disconnecting socket');
    // Store the message handler if it exists
    const existingHandler = messageHandler;
    
    socketInstance.removeAllListeners();
    socketInstance.disconnect();
    socketInstance = null;
    connectionPromise = null;
    
    // Restore the message handler for next connection
    messageHandler = existingHandler;
  }
};

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