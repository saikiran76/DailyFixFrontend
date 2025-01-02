import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { handleError } from '../utils/errorHandler';
import api from '../utils/axios';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'react-toastify';
import { initializeSocket, disconnectSocket } from '../utils/socket';
import { usePlatformConnection } from '../hooks/usePlatformConnection';

const PLATFORM_CONFIGS = {
  whatsapp: {
    name: 'WhatsApp',
    icon: '📱',
    connectionType: 'QR_CODE'
  },
  telegram: {
    name: 'Telegram',
    icon: '✈️',
    connectionType: 'BOT_TOKEN'
  }
};

const PlatformConnection = ({ platform, onSuccess }) => {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [socket, setSocket] = useState(null);
  const { connect, finalize } = usePlatformConnection();

  useEffect(() => {
    const initSocket = async () => {
      try {
        const newSocket = await initializeSocket();
        if (newSocket) {
          setSocket(newSocket);
          console.log('Socket initialized for platform connection');
        }
      } catch (error) {
        console.error('Socket initialization error:', error);
        toast.error('Failed to establish connection. Please try again.');
      }
    };

    initSocket();

    return () => {
      if (socket) {
        disconnectSocket();
      }
    };
  }, []);

  const handleBotTokenSubmit = async (token) => {
    try {
      setLoading(true);
      setError(null);
      
      await finalize(platform, token);
      toast.success(`${PLATFORM_CONFIGS[platform].name} connected successfully!`);
      onSuccess?.();
      
    } catch (error) {
      console.error('Platform connection error:', error);
      setError(error.message || 'Failed to connect platform');
      handleError(error, { context: 'platformConnection' });
      toast.error(error.message || 'Failed to connect platform');
    } finally {
      setLoading(false);
    }
  };

  const renderConnectionUI = () => {
    const config = PLATFORM_CONFIGS[platform];
    if (!config) {
      return <div className="text-red-500">Unsupported platform</div>;
    }

    return (
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">
          {config.icon} Connect {config.name}
        </h2>
        {config.connectionType === 'BOT_TOKEN' ? (
          <div className="max-w-md mx-auto">
            <input
              type="text"
              placeholder={`Enter your ${config.name} bot token`}
              className="w-full p-2 mb-4 bg-dark-lighter text-white rounded"
              onChange={(e) => handleBotTokenSubmit(e.target.value)}
              disabled={loading}
            />
            {error && <div className="text-red-500 mb-4">{error}</div>}
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="bg-white p-4 rounded-lg mb-4">
              <QRCodeSVG value="placeholder-qr-value" size={200} />
            </div>
            <p className="text-gray-400">Scan this QR code with your {config.name} app</p>
          </div>
        )}
      </div>
    );
  };

  if (!session) {
    navigate('/login');
    return null;
  }

  return (
    <div className="p-6">
      {loading ? (
        <div className="flex justify-center items-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
      ) : (
        renderConnectionUI()
      )}
    </div>
  );
};

export default PlatformConnection; 