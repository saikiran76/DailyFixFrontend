import io from 'socket.io-client';
import { supabase } from './supabase';

let socketInstance = null;
const SOCKET_URL = 'http://localhost:3001';
const RECONNECTION_ATTEMPTS = 5;
const RECONNECTION_DELAY = 2000;
const RECONNECTION_DELAY_MAX = 10000;

let messageHandler = null;

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

export const initializeSocket = async (isPlatformConnection = false) => {
  try {
    // Return existing socket if it's already connected
    if (socketInstance?.connected) {
      console.log('Reusing existing socket connection');
      return socketInstance;
    }

    // Clean up existing socket if it exists but isn't connected
    if (socketInstance) {
      console.log('Cleaning up existing socket');
      socketInstance.removeAllListeners();
      socketInstance.close();
      socketInstance = null;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      throw new Error('No active session');
    }

    console.log('Initializing socket connection to:', SOCKET_URL);

    socketInstance = io(SOCKET_URL, {
      auth: {
        token: session.access_token,
      },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: RECONNECTION_ATTEMPTS,
      reconnectionDelay: RECONNECTION_DELAY,
      reconnectionDelayMax: RECONNECTION_DELAY_MAX,
      timeout: isPlatformConnection ? 300000 : 20000, // 5 minutes for platform connections
      forceNew: false,
      autoConnect: true,
      rejectUnauthorized: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    // Set up event handlers
    socketInstance.on('connect', () => {
      console.log('Socket connected successfully');
      // Re-authenticate on reconnection
      socketInstance.emit('authenticate', { token: session.access_token });
    });

    socketInstance.on('connect_error', async (error) => {
      console.error('Socket connection error:', error);
      // Attempt to refresh session on auth errors
      if (error.message?.includes('Authentication') || error.message?.includes('token')) {
        try {
          const { data: { session } } = await supabase.auth.refreshSession();
          if (session?.access_token) {
            socketInstance.auth.token = session.access_token;
            socketInstance.connect();
          }
        } catch (refreshError) {
          console.error('Session refresh failed:', refreshError);
        }
      }
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      // If the server initiated the disconnect, don't auto-reconnect
      if (reason === 'io server disconnect') {
        socketInstance.connect();
      }
    });

    socketInstance.on('reconnect', (attemptNumber) => {
      console.log('Socket reconnected after', attemptNumber, 'attempts');
    });

    socketInstance.on('reconnect_attempt', (attemptNumber) => {
      console.log('Socket reconnection attempt:', attemptNumber);
      // Update auth token on reconnection attempts
      socketInstance.auth.token = session.access_token;
    });

    socketInstance.on('reconnect_error', (error) => {
      console.error('Socket reconnection error:', error);
    });

    socketInstance.on('reconnect_failed', () => {
      console.error('Socket reconnection failed after', RECONNECTION_ATTEMPTS, 'attempts');
      // Clear the instance so next connection attempt creates a new one
      socketInstance = null;
    });

    return socketInstance;
  } catch (error) {
    console.error('Socket initialization error:', error);
    throw error;
  }
};

export const disconnectSocket = () => {
  if (socketInstance) {
    console.log('Disconnecting socket');
    socketInstance.removeAllListeners();
    socketInstance.close();
    socketInstance = null;
  }
};

export const getSocket = () => socketInstance;

// Helper function to check socket health
export const checkSocketHealth = () => {
  if (!socketInstance) {
    return { connected: false, status: 'not_initialized' };
  }
  return {
    connected: socketInstance.connected,
    status: socketInstance.connected ? 'connected' : 'disconnected'
  };
}; 