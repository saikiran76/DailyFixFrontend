import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/axios';
import { initializeSocket, disconnectSocket } from '../utils/socket';
import { toast } from 'react-hot-toast';
import { usePlatformConnection } from '../hooks/usePlatformConnection';

const WhatsAppConnection = ({ onSuccess }) => {
  const {
    connect,
    connectionStatus,
    error,
    bridgeRoomId,
    isConnecting
  } = usePlatformConnection('whatsapp', { onSuccess });

  useEffect(() => {
    // Automatically attempt to connect when component mounts
    connect();
  }, [connect]);

  const handleRetry = () => {
    connect();
  };

  const renderElementInstructions = () => (
    <div className="w-full max-w-md p-6 bg-white border rounded-lg shadow-sm space-y-4">
      <h3 className="text-lg font-semibold text-gray-800">Scan QR Code in Element</h3>
      <div className="space-y-3">
        <p className="text-gray-600">
          Please follow these steps to connect WhatsApp:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-600">
          <li>Open Element client</li>
          <li>Go to room: <span className="font-mono bg-gray-100 px-1 rounded">{bridgeRoomId || 'WhatsApp Bridge'}</span></li>
          <li>Find the QR code image in the room</li>
          <li>Open WhatsApp on your phone</li>
          <li>Tap Menu (three dots) → WhatsApp Web</li>
          <li>Point your phone to scan the QR code</li>
        </ol>
        <p className="text-sm text-gray-500 mt-4">
          Once scanned, the connection will be established automatically.
        </p>
      </div>
    </div>
  );

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

      {connectionStatus === 'pending' && renderElementInstructions()}

      {connectionStatus === 'connecting' && (
        <div className="flex flex-col items-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <p className="text-gray-600">Connecting to WhatsApp...</p>
          <p className="text-sm text-gray-500">Please wait while we establish the connection</p>
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