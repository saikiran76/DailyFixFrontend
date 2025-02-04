import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import logger from '../utils/logger';
import { useSocket } from '../utils/socket';
import { toast } from 'react-hot-toast';

const CONNECTION_STATES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ERROR: 'error',
  CONNECTING: 'connecting'
};

const WhatsAppConnection = () => {
  const navigate = useNavigate();
  const session = useSelector(state => state.auth.session);
  const socket = useSocket();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [connectionState, setConnectionState] = useState({
    status: CONNECTION_STATES.INACTIVE,
    health: 'healthy',
    error: null,
    lastActivity: null
  });

  useEffect(() => {
    if (!session) {
      logger.warn('[WhatsAppConnection] No session found, redirecting to login');
      navigate('/login');
      return;
    }

    if (!socket) {
      logger.warn('[WhatsAppConnection] Socket not initialized');
      return;
    }

    // Listen for WhatsApp status updates
    socket.on('whatsapp:status', (data) => {
      logger.info('[WhatsAppConnection] Status update:', data);
      setConnectionState(prev => ({
        ...prev,
        status: data.status,
        lastActivity: new Date().toISOString()
      }));

      if (data.error) {
        handleError(data.error);
      }
    });

    // Listen for Matrix state changes
    socket.on('matrix:state_change', (data) => {
      logger.info('[WhatsAppConnection] Matrix state change:', data);
      setConnectionState(prev => ({
        ...prev,
        health: data.health,
        lastActivity: new Date().toISOString()
      }));
    });

    // Listen for sync state updates
    socket.on('whatsapp:sync_state', (data) => {
      logger.info('[WhatsAppConnection] Sync state update:', data);
      if (data.state === 'error') {
        handleError(data.error);
      }
    });

    // Initial connection check
    const checkConnection = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const { data, error: fetchError } = await supabase
          .from('accounts')
          .select('status, credentials')
          .eq('user_id', session.user.id)
          .eq('platform', 'whatsapp')
          .single();

        if (fetchError) throw fetchError;

        setConnectionState(prev => ({
          ...prev,
          status: data?.status || CONNECTION_STATES.INACTIVE
        }));
        
        setLoading(false);
      } catch (err) {
        logger.error('[WhatsAppConnection] Error checking connection:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    checkConnection();

    // Cleanup listeners
    return () => {
      socket.off('whatsapp:status');
      socket.off('matrix:state_change');
      socket.off('whatsapp:sync_state');
    };
  }, [session, navigate, socket]);

  const handleError = (error) => {
    const errorType = error.type || 'UNKNOWN_ERROR';
    
    switch (errorType) {
      case 'AUTH_ERROR':
        toast.error('Authentication error. Please log in again.');
        navigate('/login');
        break;
      case 'RATE_LIMIT':
        toast.error('Too many requests. Please try again later.');
        break;
      case 'NETWORK':
        toast.error('Network error. Attempting to reconnect...');
        break;
      default:
        toast.error(error.message || 'An unknown error occurred');
    }

    setError(error.message);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
        <p className="mt-4 text-gray-400">Checking WhatsApp connection...</p>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-lg bg-white shadow">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className={`w-3 h-3 rounded-full ${
            connectionState.status === CONNECTION_STATES.ACTIVE ? 'bg-green-500' :
            connectionState.status === CONNECTION_STATES.CONNECTING ? 'bg-yellow-500' :
            connectionState.status === CONNECTION_STATES.ERROR ? 'bg-red-500' :
            'bg-gray-500'
          }`} />
          <span className="font-medium">
            WhatsApp {
              connectionState.status === CONNECTION_STATES.ACTIVE ? 'Connected' :
              connectionState.status === CONNECTION_STATES.CONNECTING ? 'Connecting...' :
              connectionState.status === CONNECTION_STATES.ERROR ? 'Error' :
              'Disconnected'
            }
          </span>
        </div>
        {error && (
          <div className="text-sm text-red-500">
            {error}
          </div>
        )}
      </div>
      {connectionState.lastActivity && (
        <p className="text-xs text-gray-400 mt-2">
          Last activity: {new Date(connectionState.lastActivity).toLocaleString()}
        </p>
      )}
    </div>
  );
};

export default WhatsAppConnection; 