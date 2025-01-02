import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/axios';
import { initializeSocket, disconnectSocket } from '../utils/socket';
import { toast } from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import { usePlatformConnection } from '../hooks/usePlatformConnection';

const WhatsAppConnection = ({ onSuccess }) => {
  const {
    connect,
    connectionStatus,
    error,
    qrCode,
    isConnecting
  } = usePlatformConnection('whatsapp', { onSuccess });

  useEffect(() => {
    // Automatically attempt to connect when component mounts
    connect();
  }, [connect]);

  const handleRetry = () => {
    connect();
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 space-y-4">
      <h2 className="text-2xl font-semibold text-gray-800">Connect WhatsApp</h2>
      
      {connectionStatus === 'error' && (
        <div className="w-full max-w-md p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 text-sm">{error?.message || 'Connection failed'}</p>
          <button
            onClick={handleRetry}
            disabled={isConnecting}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          >
            {isConnecting ? 'Retrying...' : 'Retry Connection'}
          </button>
        </div>
      )}

      {connectionStatus === 'pending' && qrCode && (
        <div className="w-full max-w-md p-6 bg-white border rounded-lg shadow-sm space-y-4">
          <p className="text-gray-600 text-sm text-center">
            Please scan this QR code with your WhatsApp mobile app
          </p>
          <div className="flex justify-center">
            <QRCodeSVG value={qrCode} size={256} className="mx-auto" />
          </div>
          <p className="text-xs text-gray-500 text-center">
            Open WhatsApp on your phone {'->'} Menu {'->'} WhatsApp Web {'->'} Scan QR code
          </p>
        </div>
      )}

      {connectionStatus === 'connecting' && (
        <div className="flex flex-col items-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <p className="text-gray-600">Connecting to WhatsApp...</p>
        </div>
      )}

      {connectionStatus === 'connected' && (
        <div className="w-full max-w-md p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-600 text-sm">WhatsApp connected successfully!</p>
        </div>
      )}
    </div>
  );
};

export default WhatsAppConnection; 