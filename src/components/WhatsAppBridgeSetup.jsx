import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import SyncLogs from './SyncLogs';
import WhatsAppContactList from './WhatsAppContactList';
import { initializeSocket, disconnectSocket } from '../utils/socket';
import { useAuth } from '../contexts/AuthContext';
import supabase from '../utils/supabase';

const MAX_RETRIES = 3;
const CONNECTION_TIMEOUT = 300000; // 5 minutes
const QR_DISPLAY_TIMEOUT = 300000; // 5 minutes

const WhatsAppBridgeSetup = ({ onComplete }) => {
  const [status, setStatus] = useState('initial');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncProgress, setSyncProgress] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [syncLogs, setSyncLogs] = useState([]);
  const [timeRemaining, setTimeRemaining] = useState(300); // 5 minutes in seconds
  const socketRef = useRef(null);
  const timerRef = useRef(null);
  const navigate = useNavigate();
  const { session } = useAuth();
  const reconnectTimeoutRef = useRef(null);
  const lastStatusRef = useRef(null);
  const visibilityChangeRef = useRef(null);
  const socketEventsSetupRef = useRef(false);

  // Timer cleanup function
  const cleanupTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Start countdown timer
  const startTimer = useCallback(() => {
    cleanupTimer();
    setTimeRemaining(300); // Reset to 5 minutes
    
    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          cleanupTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Format time remaining
  const formatTimeRemaining = () => {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    return () => {
      cleanupTimer();
    };
  }, []);

  const addLog = useCallback((type, message, details = null) => {
    setSyncLogs(prev => [...prev, {
      type,
      message,
      details,
      timestamp: new Date().toISOString()
    }]);
  }, []);

  // Store last known status
  const updateStatus = useCallback((newStatus, data = {}) => {
    console.log('Updating status to:', newStatus, 'with data:', data);
    
    // Update last known status first
    lastStatusRef.current = { status: newStatus, ...data };
    
    // Then update React state
    setStatus(newStatus);
    
    // Log status change
    addLog('info', `Status changed to ${newStatus}`, data);
  }, [addLog]);

  // Enhanced success detection with better DB sync handling
  const verifyConnectionStatus = useCallback(async (retryCount = 0, finalAttempt = false) => {
    try {
      // Don't check status if we're waiting for QR scan
      if (status === 'awaiting_scan') {
        console.log('Currently awaiting QR scan, skipping status check');
        return { status: 'awaiting_scan' };
      }

      const response = await api.get('/matrix/whatsapp/status', {
        timeout: 10000
      });
      
      console.log('Status check response:', response.data);
      
      // During initial connection or connecting states, don't treat inactive as an error
      if (['initial', 'connecting'].includes(status) && response.data.status === 'inactive') {
        console.log('Inactive status during initialization, continuing...');
        return response.data;
      }
      
      if (response.data.status === 'active' || response.data.status === 'connected') {
        return response.data;
      }

      // If we have a success message but DB shows inactive, wait longer
      if (
        lastStatusRef.current?.loginMessage?.includes('Successfully logged in as') &&
        response.data.status === 'inactive'
      ) {
        console.log('Success message received but DB not updated, waiting...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        const retryResponse = await api.get('/matrix/whatsapp/status', {
          timeout: 10000
        });
        if (retryResponse.data.status === 'active' || retryResponse.data.status === 'connected') {
          return retryResponse.data;
        }
      }
      
      // Only retry if we're not in awaiting_scan and not a final attempt
      if (!finalAttempt && retryCount < 3 && response.data.status === 'inactive' && status !== 'awaiting_scan') {
        console.log(`Status still inactive, retrying (${retryCount + 1}/3)...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return verifyConnectionStatus(retryCount + 1);
      }

      return response.data;
    } catch (error) {
      console.error('Status verification failed:', error);
      
      // Don't retry if we're awaiting scan
      if (status === 'awaiting_scan') {
        console.log('Currently awaiting QR scan, ignoring verification error');
        return { status: 'awaiting_scan' };
      }
      
      if (!finalAttempt && retryCount < 3) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return verifyConnectionStatus(retryCount + 1);
      }
      throw error;
    }
  }, [status]);

  // Enhanced error handling in socket events
  const handleError = useCallback(async (error, source = 'socket') => {
    console.error(`Error from ${source}:`, error);
    
    // Don't handle errors if we're in awaiting_scan state
    if (status === 'awaiting_scan') {
      console.log('Currently awaiting scan, ignoring error');
      return true;
    }
    
    // If we're in any of these states, don't treat inactive as an error
    if (['connecting', 'awaiting_scan', 'initial'].includes(status)) {
      console.log('Status check during initialization, not treating inactive as error');
      return true;
    }
    
    // Always do a final status check with extended timeout
    try {
      const finalStatus = await verifyConnectionStatus(0, true);
      if (finalStatus?.status === 'connected' || finalStatus?.status === 'active') {
        console.log('Connection actually successful after final check');
        updateStatus('connected', finalStatus);
        addLog('success', 'WhatsApp connection verified');
        onComplete?.();
        return true;
      }
      
      // If we're in awaiting_scan, don't update error state
      if (finalStatus?.status === 'awaiting_scan') {
        return true;
      }
    } catch (finalError) {
      console.error('Final status check failed:', finalError);
    }
    
    // Only update error if we're not in a critical state and it's not just an inactive status
    if (!['awaiting_scan', 'connected', 'initial', 'connecting'].includes(status)) {
      const errorMessage = error.response?.status === 404
        ? 'WhatsApp connection not found. Please try again.'
        : error.message || 'Connection failed';
      
      setError(errorMessage);
      updateStatus('error');
      addLog('error', `Connection error from ${source}`, error.message);
    }
    return false;
  }, [status, verifyConnectionStatus, updateStatus, addLog, onComplete]);

  // Enhanced socket event handling with better error handling
  const setupSocketEvents = useCallback(() => {
    if (!socketRef.current) {
      console.error('No socket reference available');
      return;
    }
    
    console.log('Setting up socket events...');
    const socket = socketRef.current;
    
    // Clean up existing listeners
    socket.off('whatsapp_status');
    socket.off('whatsapp_error');

    // Enhanced WhatsApp status handler with proper flow control
    socket.on('whatsapp_status', (data) => {
      console.log('Received WhatsApp status update:', data);
      
      const updateStates = async () => {
        // Handle awaiting_scan state
        if (data.status === 'awaiting_scan' && status !== 'awaiting_scan') {
          console.log('Handling awaiting_scan status');
          updateStatus('awaiting_scan', {
            ...data,
            scanComplete: false,
            bridgeRoomId: data.bridgeRoomId,
            sessionStartTime: new Date().toISOString()
          });
          addLog('info', 'Bridge room created, check Element for QR code', { roomId: data.bridgeRoomId });
          toast.success('Please check Element for the QR code to scan');
          startTimer();
          return;
        }

        // Handle success broadcast from server
        if (data.status === 'connected' || data.loginMessage?.includes('Successfully logged in as')) {
          console.log('Received success broadcast from server');
          cleanupTimer();
          
          const phoneNumber = data.loginMessage ? data.loginMessage.split('as ')[1] : undefined;
          
          toast.success('WhatsApp connection successful!');
          addLog('success', `WhatsApp connected successfully${phoneNumber ? ` as ${phoneNumber}` : ''}`);
          
          try {
            // Update UI state before completing
            updateStatus('connected', {
              ...data,
              phoneNumber,
              timestamp: new Date().toISOString()
            });

            console.log('Calling onComplete to finish setup...');
            // Add a small delay to ensure UI updates are complete
            setTimeout(async () => {
              try {
                await onComplete({
                  currentStep: 'complete',
                  platform: 'matrix-whatsapp'
                });
                console.log('Setup completed successfully');
                addLog('success', 'Setup completed, redirecting to dashboard');
              } catch (error) {
                console.error('Error in completion callback:', error);
                toast.error('Failed to complete setup. Please try again.');
              }
            }, 1000);

          } catch (error) {
            console.error('Error during final steps:', error);
            toast.error('Failed to complete setup. Please try again.');
            if (!['awaiting_scan', 'connected'].includes(status)) {
              setError('Connection verification failed');
              updateStatus('error');
            }
          }
        }
      };

      Promise.resolve().then(updateStates).catch(error => {
        console.error('Error updating states:', error);
        if (status !== 'error') {
          handleError(error, 'status_update');
        }
      });
    });

    // Keep connection alive with more frequent pings during QR scan
    const pingInterval = setInterval(() => {
      if (socket.connected && status === 'awaiting_scan') {
        console.log('Sending keepalive ping during QR scan');
        socket.emit('ping');
      }
    }, 5000);

    // Enhanced error handling through centralized handler
    socket.on('whatsapp_error', async (error) => {
      await handleError(error, 'socket');
    });

    return () => {
      clearInterval(pingInterval);
      // Only remove listeners if not in critical states
      if (!['awaiting_scan', 'connecting'].includes(status)) {
      socket.off('whatsapp_status');
      socket.off('whatsapp_error');
      }
    };
  }, [status, addLog, cleanupTimer, onComplete, startTimer, updateStatus, handleError]);

  // Enhanced socket connection with session tracking
  const connectSocket = useCallback(async () => {
    if (!session) {
      console.log('No active session, preventing socket connection');
      return;
    }

    try {
      console.log('Initializing socket connection...');
      const socket = await initializeSocket({
        timeout: CONNECTION_TIMEOUT,
        forceNew: false,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        // Enhanced transport options
        transports: ['websocket', 'polling'],
        upgrade: true,
        rememberUpgrade: true,
        // Keep socket alive
        pingTimeout: 60000,
        pingInterval: 25000,
        extraHeaders: {
          'Connection': 'keep-alive',
          'Keep-Alive': 'timeout=300'
        },
        // Enhanced connection handling
        onConnect: () => {
          console.log('Socket connected successfully');
          addLog('info', 'Socket connection established');
          
          // Resubscribe to events if we were in awaiting_scan
          if (lastStatusRef.current?.status === 'awaiting_scan') {
            console.log('Resubscribing to events after reconnection');
            setupSocketEvents();
            
            // Verify current status
            api.get('/matrix/whatsapp/status')
              .then(response => {
                console.log('Status verification after reconnect:', response.data);
                if (response.data.status === 'connected' || response.data.status === 'active') {
                  updateStatus('connected', response.data);
                  onComplete?.();
                }
              })
              .catch(console.error);
          }
        },
        onDisconnect: (reason) => {
          console.log('Socket disconnected:', reason);
          
          // Only handle disconnect if we're not changing tabs
          if (!document.hidden && status === 'awaiting_scan') {
            console.log('Unexpected disconnect during scan, attempting reconnection');
            socket.connect();
          }
        },
        onReconnect: (attemptNumber) => {
          console.log('Socket reconnected after attempt:', attemptNumber);
          if (lastStatusRef.current?.status === 'awaiting_scan') {
            setupSocketEvents();
          }
        }
      });

      socketRef.current = socket;
      return socket;
    } catch (error) {
      console.error('Socket initialization error:', error);
      throw error;
    }
  }, [session, status, addLog, updateStatus, setupSocketEvents, onComplete]);

  // Enhanced visibility change handler with robust status verification
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden) {
        console.log('Tab hidden, maintaining connection...');
        // Only maintain connection if we're still in scan phase
        if (status === 'awaiting_scan' && socketRef.current?.connected) {
          console.log('Sending keepalive ping during scan');
          socketRef.current.emit('ping');
        }
      } else {
        console.log('Tab visible, checking state...');
        
        // Only verify if we're not already connected
        if (status !== 'connected') {
          try {
          const verifiedStatus = await verifyConnectionStatus();
            if (verifiedStatus?.status === 'connected') {
            console.log('Connection verified as successful');
            cleanupTimer();
            updateStatus('connected', verifiedStatus);
              onComplete?.();
            }
          } catch (error) {
            console.error('Error verifying connection:', error);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Clear any remaining ping interval
      if (lastStatusRef.current?.pingInterval) {
        clearInterval(lastStatusRef.current.pingInterval);
        lastStatusRef.current.pingInterval = null;
      }
    };
  }, [status, connectSocket, setupSocketEvents, updateStatus, startTimer, cleanupTimer, addLog, onComplete, verifyConnectionStatus]);

  // Initial setup with cleanup protection
  useEffect(() => {
    console.log('WhatsAppBridgeSetup mounted');
    
    return () => {
      console.log('WhatsAppBridgeSetup unmounting, cleaning up...');
      const currentStatus = lastStatusRef.current?.status || status;
      
      // Only cleanup if we're in a completely safe state
      if (!['awaiting_scan', 'connecting', 'initial'].includes(currentStatus)) {
      cleanupTimer();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
          // Keep socket alive during any non-error state
          if (currentStatus === 'error') {
        socketRef.current.off('whatsapp_status');
        socketRef.current.off('whatsapp_error');
        disconnectSocket();
          }
        }
      } else {
        console.log(`Preserving state during operation: ${currentStatus}`);
      }
    };
  }, [status, disconnectSocket]);

  // Enhanced connection handler with better error handling
  const handleConnect = useCallback(async () => {
    try {
      // Prevent duplicate connections
      if (['connecting', 'awaiting_scan'].includes(status)) {
        console.log('Connection already in progress, ignoring request');
        return;
      }

      console.log('Starting WhatsApp connection process...');
      setLoading(true);
      setError('');
      updateStatus('connecting');

      // First verify current status but don't complete immediately
      try {
        const statusCheck = await verifyConnectionStatus(0, true);
        if (statusCheck?.status === 'connected' || statusCheck?.status === 'active') {
          console.log('WhatsApp connection detected, waiting for socket confirmation...');
          updateStatus('awaiting_confirmation', statusCheck);
          return;
        }
      } catch (statusError) {
        console.error('Status check failed:', statusError);
      }

      // Ensure clean socket state
      if (socketRef.current) {
        console.log('Cleaning up existing socket...');
        socketRef.current.off('whatsapp_status');
        socketRef.current.off('whatsapp_error');
        socketRef.current.off('connect');
        socketRef.current.off('disconnect');
        disconnectSocket();
        socketRef.current = null;
      }

      // Connect socket with retry logic
      let socket = null;
      let retries = 0;
      while (!socket && retries < 3) {
        try {
          console.log(`Connecting socket (attempt ${retries + 1}/3)...`);
          socket = await connectSocket();
        } catch (socketError) {
          console.error(`Socket connection attempt ${retries + 1} failed:`, socketError);
          retries++;
          if (retries < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
          }
        }
      }

      if (!socket) {
        throw new Error('Failed to establish socket connection after 3 attempts');
      }
      
      // Set up socket events and start the process
      setupSocketEvents();
      
      // Initiate WhatsApp connection
      const response = await api.post('/matrix/whatsapp/connect');
      console.log('Connection initiated:', response.data);
      
      // Start timer for QR scan
      startTimer();
      
    } catch (error) {
      console.error('Connection failed:', error);
      await handleError(error, 'connect');
    } finally {
        setLoading(false);
    }
  }, [status, connectSocket, setupSocketEvents, updateStatus, startTimer, handleError, verifyConnectionStatus]);

  const handleSync = async () => {
    if (!session) {
      navigate('/login');
      return;
    }

    try {
      setSyncStatus('syncing');
      addLog('info', 'Starting message synchronization');

      const response = await api.post('/matrix/whatsapp/sync');
      if (response.data.status === 'syncing') {
        addLog('success', 'Message synchronization initiated');
        toast.success('Message synchronization started');
      } else {
        throw new Error('Failed to start message sync');
      }
    } catch (error) {
      console.error('Message sync error:', error);
      setSyncStatus('error');
      setError(error.response?.data?.message || error.message);
      addLog('error', 'Sync initiation failed', {
        message: error.message,
        response: error.response?.data
      });
      toast.error(error.response?.data?.message || 'Failed to sync messages');
    }
  };

  const handleRetry = () => {
    setStatus('initializing');
    setError('');
    setSyncStatus(null);
    setSyncProgress(0);
    setRetryCount(0);
    addLog('info', 'Retrying connection from start');
    handleConnect();
  };

  useEffect(() => {
    if (status === 'connected') {
      handleComplete();
    }
  }, [status]);

  const handleComplete = async () => {
    try {
      // Get bridgeRoomId from the last status update
      const currentStatus = lastStatusRef.current;
      if (!currentStatus?.bridgeRoomId) {
        console.error('No bridgeRoomId found in lastStatusRef');
        return;
      }
      
      console.log('Completing setup with status:', currentStatus);
      await onComplete({
        status: 'connected',
        bridgeRoomId: currentStatus.bridgeRoomId
      });
    } catch (error) {
      console.error('Error completing setup:', error);
    }
  };

  const renderContent = () => {
    if (status === 'connected') {
      return (
        <div className="text-center space-y-4">
          <div className="flex flex-col items-center space-y-4">
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white">WhatsApp Connected!</h2>
            <p className="text-gray-300">Your WhatsApp account is now linked</p>
            <Link 
              to="/dashboard" 
              replace={true}
              className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary/80 transition-colors"
            >
              Go to Dashboard
            </Link>
          </div>
          <SyncLogs logs={syncLogs} />
        </div>
      );
    }

    switch (status) {
      case 'initial':
        return (
          <div className="flex flex-col items-center space-y-4">
            <p className="text-gray-600 text-center">
              Connect your WhatsApp account to start receiving messages through Matrix
            </p>
            <button
              onClick={handleConnect}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Connecting...' : 'Connect WhatsApp'}
            </button>
          </div>
        );

      case 'error':
        return (
          <div className="w-full max-w-md p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600">{error}</p>
            <button
              onClick={handleRetry}
              disabled={loading}
              className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? 'Retrying...' : 'Retry Connection'}
            </button>
          </div>
        );

      case 'awaiting_scan':
        return (
          <div className="w-full max-w-md p-6 bg-white border rounded-lg shadow-sm space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Scan QR Code in Element</h3>
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-blue-700 font-medium">Time remaining: {formatTimeRemaining()}</p>
                <p className="text-sm text-blue-600">Please complete the connection within this time</p>
              </div>
              <p className="text-gray-600">
                Please follow these steps to connect WhatsApp:
              </p>
              <ol className="list-decimal list-inside space-y-2 text-gray-600">
                <li>Open Element client</li>
                <li>Find the WhatsApp Bridge room</li>
                <li>Look for the QR code image in the room</li>
                <li>Open WhatsApp on your phone</li>
                <li>Tap Menu (three dots) → WhatsApp Web</li>
                <li>Point your phone to scan the QR code in Element</li>
              </ol>
              <p className="text-sm text-gray-500 mt-4">
                Once scanned, the connection will be established automatically.
              </p>
            </div>
          </div>
        );

      case 'connecting':
        return (
          <div className="flex flex-col items-center space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="text-gray-600">Connecting to WhatsApp...</p>
            <p className="text-sm text-gray-500">This may take a few moments</p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-lg mx-auto p-8">
      {renderContent()}
          <SyncLogs logs={syncLogs} />
    </div>
  );
};

export default WhatsAppBridgeSetup; 