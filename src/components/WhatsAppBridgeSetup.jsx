import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import logger from '../utils/logger';
import { toast } from 'react-hot-toast';
import { useSocket } from '../utils/socket';
import { fetchOnboardingStatus, updateOnboardingStep } from '../store/slices/onboardingSlice';

const WhatsAppBridgeSetup = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const socket = useSocket();
  const session = useSelector(state => state.auth.session);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds
  const [qrExpired, setQrExpired] = useState(false);
  const [setupState, setSetupState] = useState('initial'); // initial, preparing, scanning, connecting, complete, error

  useEffect(() => {
    let timer;
    if (qrCode && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setQrExpired(true);
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [qrCode, timeLeft]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!session) {
      logger.warn('[WhatsAppBridgeSetup] No session found, redirecting to login');
      navigate('/login');
      return;
    }

    if (!socket) {
      logger.warn('[WhatsAppBridgeSetup] Socket not initialized');
      return;
    }
    
    const setupBridge = async () => {
      try {
        setLoading(true);
        setError(null);
        setSetupState('preparing');
        
        // Emit setup event
        socket.emit('whatsapp:setup:start', { userId: session.user.id });

        // Listen for QR code updates
        socket.on('whatsapp:qr', (data) => {
          logger.info('[WhatsAppBridgeSetup] Received QR code');
          setQrCode(data.qrCode);
          setTimeLeft(300); // Reset timer
          setQrExpired(false);
          setSetupState('scanning');
        });

        // Listen for setup status updates
        socket.on('whatsapp:setup:status', (data) => {
          logger.info('[WhatsAppBridgeSetup] Setup status update:', data);
          setSetupState(data.state);

          if (data.state === 'error') {
            setError(data.error);
            toast.error(data.error.message || 'Setup failed');
          }
        });

        // Listen for connection status
        socket.on('whatsapp:status', async (data) => {
          logger.info('[WhatsAppBridgeSetup] Connection status:', data);
          
          if (data.status === 'active') {
            setSetupState('complete');
            toast.success('WhatsApp connected successfully!');
            
            try {
              // Get current onboarding status
              const status = await dispatch(fetchOnboardingStatus()).unwrap();
              
              // Update onboarding step based on current status
              const nextStep = status.matrixConnected ? 'complete' : 'matrix';
              await dispatch(updateOnboardingStep({ step: nextStep })).unwrap();
              
              // Navigate to next step
              navigate(`/onboarding/${nextStep}`);
            } catch (err) {
              logger.error('[WhatsAppBridgeSetup] Error updating onboarding:', err);
              toast.error('Failed to update onboarding status');
            }
          } else if (data.status === 'error') {
            setError(data.error);
            setSetupState('error');
          }
        });

      } catch (err) {
        logger.error('[WhatsAppBridgeSetup] Error setting up bridge:', err);
        setError(err.message);
        toast.error(err.message);
        setSetupState('error');
      } finally {
        setLoading(false);
      }
    };

    setupBridge();

    // Cleanup listeners
    return () => {
      socket.off('whatsapp:qr');
      socket.off('whatsapp:setup:status');
      socket.off('whatsapp:status');
    };
  }, [session, navigate, dispatch, socket]);

  if (loading && !qrCode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        <p className="mt-4 text-gray-400">Preparing WhatsApp connection...</p>
        <p className="mt-2 text-sm text-gray-500">This may take a few moments</p>
      </div>
    );
  }

  if (qrExpired) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="text-yellow-500 mb-4">⚠️ QR Code expired</div>
        <p className="text-gray-400 mb-4">Please try again to get a fresh QR code</p>
        <button
          onClick={() => {
            socket.emit('whatsapp:setup:start', { userId: session.user.id });
          }}
          className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary/80 transition-colors"
        >
          Get New QR Code
        </button>
      </div>
    );
  }

  if (qrCode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <h2 className="text-2xl font-bold mb-6">Connect WhatsApp</h2>
        <div className="mb-4 text-primary">Time remaining: {formatTime(timeLeft)}</div>
        <div className="relative">
          <div className="bg-white p-4 rounded-lg mb-8">
            <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64" />
          </div>
          <div className="absolute -top-2 -right-2 bg-primary text-white text-xs px-2 py-1 rounded-full">
            Step 1/2
          </div>
        </div>
        <div className="space-y-4 text-center max-w-md">
          <p className="text-gray-400">To connect WhatsApp:</p>
          <ol className="text-sm text-gray-500 space-y-2 text-left list-decimal list-inside">
            <li>Open WhatsApp on your phone</li>
            <li>Tap Menu or Settings and select WhatsApp Web</li>
            <li>Point your phone camera at this screen</li>
            <li>Keep this window open while scanning</li>
          </ol>
          <div className="text-xs text-gray-400 mt-4">
            Status: {setupState.charAt(0).toUpperCase() + setupState.slice(1)}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="text-red-500 mb-4">Error: {error}</div>
        <button
          onClick={() => {
            setError(null);
            socket.emit('whatsapp:setup:start', { userId: session.user.id });
          }}
          className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary/80 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return null;
};

export default WhatsAppBridgeSetup; 