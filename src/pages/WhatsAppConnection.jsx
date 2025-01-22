import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { toast } from 'react-hot-toast';
import { fetchOnboardingStatus } from '../store/slices/onboardingSlice';
import logger from '../utils/logger';

const WhatsAppConnection = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { session } = useSelector(state => state.auth);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [qrCode, setQrCode] = useState(null);

  useEffect(() => {
    if (!session) {
      navigate('/login');
      return;
    }

    const setupWhatsApp = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Start WhatsApp setup
        const response = await fetch('/api/whatsapp/setup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to start WhatsApp setup');
        }

        const data = await response.json();
        setQrCode(data.qrCode);
        
        // Poll for connection status
        const pollInterval = setInterval(async () => {
          try {
            const statusResponse = await fetch('/api/whatsapp/status', {
              headers: {
                'Authorization': `Bearer ${session.access_token}`
              }
            });
            
            if (!statusResponse.ok) {
              throw new Error('Failed to check WhatsApp status');
            }
            
            const statusData = await statusResponse.json();
            
            if (statusData.connected) {
              clearInterval(pollInterval);
              toast.success('WhatsApp connected successfully!');
              
              // Get current onboarding status
              const status = await dispatch(fetchOnboardingStatus()).unwrap();
              
              // Navigate based on Matrix connection status
              navigate(status.matrixConnected ? '/dashboard' : '/matrix-login');
            }
          } catch (err) {
            logger.error('Error checking WhatsApp status:', err);
          }
        }, 5000);

        // Cleanup interval on unmount
        return () => clearInterval(pollInterval);
      } catch (err) {
        logger.error('Error setting up WhatsApp:', err);
        setError(err.message);
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    };

    setupWhatsApp();
  }, [session, navigate, dispatch]);

  if (loading && !qrCode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <p className="mt-4 text-gray-400">Setting up WhatsApp...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900">
        <div className="text-red-500 mb-4">Error: {error}</div>
        <button
          onClick={() => window.location.reload()}
          className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (qrCode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
        <h2 className="text-2xl font-bold mb-6">Connect WhatsApp</h2>
        <p className="text-gray-400 mb-8">Scan this QR code with WhatsApp on your phone</p>
        <div className="bg-white p-4 rounded-lg mb-8">
          <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64" />
        </div>
        <p className="text-sm text-gray-500 max-w-md text-center">
          Open WhatsApp on your phone, tap Menu or Settings and select WhatsApp Web.
          Point your phone to this screen to capture the code.
        </p>
      </div>
    );
  }

  return null;
};

export default WhatsAppConnection; 