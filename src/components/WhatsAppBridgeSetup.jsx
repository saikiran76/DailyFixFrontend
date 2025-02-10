import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useSocket } from '../utils/socket';
import api from '../utils/api';  // Our configured axios instance
import QRCode from 'qrcode';
import logger from '../utils/logger';
import {
  fetchOnboardingStatus,
  updateOnboardingStep,
  setWhatsappQRCode,
  setWhatsappSetupState,
  setWhatsappTimeLeft,
  setWhatsappError,
  resetWhatsappSetup,
  setBridgeRoomId,
  selectWhatsappSetup,
  setWhatsappPhoneNumber
} from '../store/slices/onboardingSlice';

const WhatsAppBridgeSetup = ({ onComplete }) => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const socket = useSocket();
  const { session } = useSelector(state => state.auth);
  const {
    loading,
    error,
    qrCode,
    timeLeft,
    qrExpired,
    setupState
  } = useSelector(selectWhatsappSetup);
  const [isInitializing, setIsInitializing] = useState(true);
  const [showRetryButton, setShowRetryButton] = useState(false);

  // Use a ref to track if a QR code has been received
  const qrReceivedRef = useRef(false);
  useEffect(() => {
    if (qrCode) {
      qrReceivedRef.current = true;
    }
  }, [qrCode]);

  console.log('[WhatsAppBridgeSetup] Rendering with state:', { 
    loading, error, qrCode, timeLeft, qrExpired, setupState, hasSocket: !!socket,
    isInitializing
  });

  // Initialize socket connection if needed
  useEffect(() => {
    if (!socket && session?.access_token) {
      logger.info('[WhatsAppBridgeSetup] Initializing socket connection:', {
        hasToken: !!session?.access_token,
        socketState: socket?.connected ? 'connected' : 'disconnected'
      });
    }

    // Join the user's room when socket is available
    if (socket && session?.user?.id) {
      const userRoom = `user:${session.user.id}`;
      logger.info('[WhatsAppBridgeSetup] Joining socket room:', userRoom);
      
      // First authenticate
      socket.emit('authenticate', { userId: session.user.id });
      
      // Then join room
      socket.emit('join:room', userRoom);
      
      // Verify room join
      socket.on('room:joined', (data) => {
        logger.info('[WhatsAppBridgeSetup] Socket room joined successfully:', data);
      });

      socket.on('room:error', (error) => {
        logger.error('[WhatsAppBridgeSetup] Socket room join error:', error);
      });
    }
  }, [socket, session?.access_token, session?.user?.id]);

  // Initiate WhatsApp connection using the correct API path
  const handleConnect = useCallback(async () => {
    try {
      dispatch(setWhatsappSetupState('preparing'));
      logger.info('[WhatsAppBridgeSetup] Starting WhatsApp connection');
      
      // Using our api instance, which has the correct baseURL.
      const response = await api.post('/matrix/whatsapp/connect', {}, {
        timeout: 30000 // 30-second timeout; backend now resolves quickly on QR code receipt
      });
      
      logger.info('[WhatsAppBridgeSetup] Connection initiated:', response.data);
      
      // If we received a QR code in the initial response, process it
      if (response.data.qrCode) {
        QRCode.toDataURL(response.data.qrCode, {
          errorCorrectionLevel: 'L',
          margin: 4,
          width: 256
        })
        .then(qrDataUrl => {
          logger.info('[WhatsAppBridgeSetup] Initial QR code converted successfully');
          dispatch(setWhatsappQRCode(qrDataUrl));
          dispatch(setWhatsappSetupState('qr_ready'));
        })
        .catch(error => {
          logger.error('[WhatsAppBridgeSetup] Initial QR code conversion error:', error);
          dispatch(setWhatsappError('Failed to generate QR code'));
          dispatch(setWhatsappSetupState('error'));
        });
      } else {
        dispatch(setWhatsappSetupState('waiting_for_qr'));
      }
      
    } catch (error) {
      logger.error('[WhatsAppBridgeSetup] Setup error:', error);
      if (error.code === 'ECONNABORTED') {
        logger.info('[WhatsAppBridgeSetup] Initial connection timeout - waiting for socket events');
        dispatch(setWhatsappSetupState('waiting_for_qr'));
      } else {
        dispatch(setWhatsappError(error.message));
        dispatch(setWhatsappSetupState('error'));
      }
    }
  }, [dispatch]);

  // Start the connection when the component mounts
  useEffect(() => {
    handleConnect();
    setIsInitializing(false);
  }, [handleConnect]);

  // Enhanced socket event handlers
  useEffect(() => {
    if (!socket) return;

    const handleQRCode = (data) => {
      logger.info('[WhatsAppBridgeSetup] QR code received:', {
        hasData: !!data,
        qrLength: data?.qrCode?.length,
        roomId: data?.roomId
      });
      if (!data?.qrCode) {
        logger.warn('[WhatsAppBridgeSetup] No QR code in socket event');
        return;
      }

      QRCode.toDataURL(data.qrCode, {
        errorCorrectionLevel: 'L',
        margin: 4,
        width: 256
      })
      .then(qrDataUrl => {
        logger.info('[WhatsAppBridgeSetup] QR code converted successfully');
        dispatch(setWhatsappQRCode(qrDataUrl));
        dispatch(setWhatsappSetupState('qr_ready'));
      })
      .catch(error => {
        logger.error('[WhatsAppBridgeSetup] QR code conversion error:', error);
        dispatch(setWhatsappError('Failed to generate QR code'));
        dispatch(setWhatsappSetupState('error'));
      });
    };

    const handleSetupStatus = (data) => {
      logger.info('[WhatsAppBridgeSetup] Setup status update:', data);
      if (data?.state) {
        dispatch(setWhatsappSetupState(data.state));
        if (data.state === 'connected' && data.phoneNumber) {
          dispatch(setWhatsappPhoneNumber(data.phoneNumber));
        }
        if (data.bridgeRoomId) {
          dispatch(setBridgeRoomId(data.bridgeRoomId));
        }
        if (data.state === 'puppet_sent') {
          dispatch(setWhatsappSetupState('puppet_sent'));
          toast.success('Real-time Setup is enabled');
        }
      }
    };

    const handleStatus = async (data) => {
      logger.info('[WhatsAppBridgeSetup] Status update:', data);
      
      if (data?.status === 'error') {
        await Promise.all([
          dispatch(setWhatsappError(data.error || 'Unknown error')),
          dispatch(setWhatsappSetupState('error'))
        ]);
      } else if (data?.status === 'connected' || data?.status === 'active') {
        const updates = [
          dispatch(setWhatsappSetupState('connected')),
          dispatch(setWhatsappPhoneNumber(data.phoneNumber))
        ];
        if (data.bridgeRoomId) {
          updates.push(dispatch(setBridgeRoomId(data.bridgeRoomId)));
        }
        await Promise.all(updates);
        
        // Ensure onComplete is called after all state updates
        if (typeof onComplete === 'function') {
          setTimeout(() => onComplete(), 0);
        }
      } else if (data?.status === 'qr_scanned') {
        await dispatch(setWhatsappSetupState('qr_scanned'));
      }
    };

    // Add explicit handlers for scan and connection events
    socket.on('whatsapp:qr:scanned', async () => {
      logger.info('[WhatsAppBridgeSetup] QR code scanned');
      await dispatch(setWhatsappSetupState('qr_scanned'));
    });

    socket.on('whatsapp:connected', async (data) => {
      logger.info('[WhatsAppBridgeSetup] WhatsApp connected:', data);
      const updates = [
        dispatch(setWhatsappSetupState('connected')),
        dispatch(setWhatsappPhoneNumber(data.phoneNumber))
      ];
      if (data.bridgeRoomId) {
        updates.push(dispatch(setBridgeRoomId(data.bridgeRoomId)));
      }
      await Promise.all(updates);
      
      // Ensure onComplete is called after all state updates
      if (typeof onComplete === 'function') {
        setTimeout(() => onComplete(), 0);
      }
    });

    socket.on('whatsapp:qr', handleQRCode);
    socket.on('whatsapp:setup:status', handleSetupStatus);
    socket.on('whatsapp:status', handleStatus);

    return () => {
      socket.off('whatsapp:qr', handleQRCode);
      socket.off('whatsapp:setup:status', handleSetupStatus);
      socket.off('whatsapp:status', handleStatus);
      socket.off('whatsapp:qr:scanned');
      socket.off('whatsapp:connected');
    };
  }, [socket, dispatch, onComplete]);

  // Refined unmount cleanup: only reset if a QR code has not been received
  useEffect(() => {
    return () => {
      if (!qrReceivedRef.current) {
        dispatch(resetWhatsappSetup());
      }
    };
  }, [dispatch]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Enhanced status display component
  const StatusDisplay = () => {
    switch (setupState) {
      case 'preparing':
        return <p className="text-gray-400">Preparing WhatsApp connection...</p>;
      case 'waiting_for_qr':
        return <p className="text-gray-400">Waiting for QR code...</p>;
      case 'qr_ready':
        return <p className="text-gray-400">QR code ready for scanning</p>;
      case 'qr_scanned':
        return (
          <div className="text-center">
            <p className="text-green-400">QR code scanned successfully!</p>
            <p className="text-gray-400 mt-2">Establishing connection...</p>
          </div>
        );
      case 'connecting':
        return <p className="text-gray-400">Connecting to WhatsApp...</p>;
      case 'connected':
        return <p className="text-green-400">WhatsApp connected successfully!</p>;
      case 'error':
        return <p className="text-red-400">{error?.message || 'Connection error'}</p>;
      default:
        return null;
    }
  };

  // Rendering conditions
  if (isInitializing || !socket) {
    return (
      <div className="max-w-md mx-auto p-8 text-center">
        <h2 className="text-2xl font-bold mb-6 text-white">Initializing WhatsApp Setup</h2>
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-gray-400">Establishing secure connection...</p>
        <p className="mt-2 text-sm text-gray-500">This may take a few moments</p>
        {showRetryButton && (
        <button
          onClick={() => {
              setShowRetryButton(false);
              handleConnect();
          }}
            className="mt-6 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/80 transition-colors"
        >
            Retry Connection
        </button>
        )}
      </div>
    );
  }

  // If we have a QR code, show it regardless of other states
  if (qrCode) {
    return (
      <div className="max-w-md mx-auto p-8 text-center">
        <h2 className="text-2xl font-bold mb-6 text-white">Connect WhatsApp</h2>
        <div className="mb-4 text-primary">Time remaining: {formatTime(timeLeft)}</div>
        <div className="bg-white p-4 rounded-lg mb-8 inline-block">
            <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64" />
        </div>
        <div className="space-y-4 text-left">
          <p className="text-gray-300">To connect WhatsApp:</p>
          <ol className="text-sm text-gray-500 space-y-2 list-decimal list-inside">
            <li>Open WhatsApp on your phone</li>
            <li>Tap Menu or Settings and select WhatsApp Web</li>
            <li>Point your phone camera at this screen</li>
            <li>Keep this window open while scanning</li>
          </ol>
          </div>
        <div className="mt-6">
          <StatusDisplay />
        </div>
      </div>
    );
  }

  if (loading || setupState === 'preparing' || setupState === 'waiting_for_qr') {
    return (
      <div className="max-w-md mx-auto p-8 text-center">
        <h2 className="text-2xl font-bold mb-6 text-white">Setting Up WhatsApp</h2>
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-gray-400">
          {setupState === 'preparing' ? 'Preparing WhatsApp connection...' : 'Waiting for QR code...'}
        </p>
        <p className="mt-2 text-sm text-gray-500">This may take a few moments</p>
      </div>
    );
  }

  if (setupState === 'error') {
    return (
      <div className="max-w-md mx-auto p-8 text-center">
        <h2 className="text-2xl font-bold mb-6 text-white">Connection Error</h2>
        <p className="text-red-500 mb-4">{error?.message || 'Failed to connect WhatsApp'}</p>
        <button
          onClick={() => window.location.reload()}
          className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary/80 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-8 text-center">
      <h2 className="text-2xl font-bold mb-6 text-white">Preparing WhatsApp Setup</h2>
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto"></div>
      <p className="mt-4 text-gray-400">Initializing WhatsApp connection...</p>
    </div>
  );
};

export default WhatsAppBridgeSetup; 