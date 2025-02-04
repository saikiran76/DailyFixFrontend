import React, { useState } from 'react';
import api from '../utils/api.js';
import { toast } from 'react-hot-toast';
import LoadingSpinner from './LoadingSpinner';

const PLATFORMS = [
  {
    id: 'matrix',
    name: 'Matrix',
    description: 'Required for other platform bridges',
    primary: true
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'Connect via QR code'
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Connect via bot token'
  }
];

export default function PlatformSelector() {
  const [loading, setLoading] = useState(false);
  const [matrixCredentials, setMatrixCredentials] = useState({
    username: '',
    password: '',
    homeserver: import.meta.env.VITE_MATRIX_HOMESERVER_URL || 'https://matrix.org'
  });

  const handlePlatformSelect = async (platform) => {
    try {
      setLoading(true);
      const response = await api.post(`/connect/${platform}/initiate`);
      
      if (response.data.status === 'pending') {
        if (platform === 'matrix') {
          // Show Matrix login form
          setShowMatrixForm(true);
        } else if (platform === 'telegram') {
          // Show token input for Telegram
          setShowTelegramForm(true);
        }
      } else if (response.data.status === 'redirect') {
        window.location.href = response.data.url;
      }
    } catch (error) {
      toast.error(`Failed to initialize ${platform} connection`);
    } finally {
      setLoading(false);
    }
  };

  const handleMatrixSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const response = await api.post('/connect/matrix/finalize', matrixCredentials);
      
      if (response.data.status === 'connected') {
        toast.success('Matrix connected successfully!');
        // Refresh available platforms
        window.location.reload();
      }
    } catch (error) {
      toast.error('Failed to connect to Matrix');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-4 p-4">
      {loading && <LoadingSpinner />}
      
      {!loading && PLATFORMS.map(platform => (
        <button
          key={platform.id}
          onClick={() => handlePlatformSelect(platform.id)}
          className={`p-4 border rounded-lg ${
            platform.primary ? 'border-blue-500' : 'border-gray-200'
          }`}
          disabled={loading}
        >
          <h3 className="font-bold">{platform.name}</h3>
          <p className="text-sm text-gray-600">{platform.description}</p>
        </button>
      ))}

      {showMatrixForm && (
        <form onSubmit={handleMatrixSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Matrix Username"
            value={matrixCredentials.username}
            onChange={(e) => setMatrixCredentials(prev => ({
              ...prev,
              username: e.target.value
            }))}
            className="w-full p-2 border rounded"
          />
          <input
            type="password"
            placeholder="Matrix Password"
            value={matrixCredentials.password}
            onChange={(e) => setMatrixCredentials(prev => ({
              ...prev,
              password: e.target.value
            }))}
            className="w-full p-2 border rounded"
          />
          <button 
            type="submit"
            className="w-full p-2 bg-blue-500 text-white rounded"
            disabled={loading}
          >
            Connect Matrix
          </button>
        </form>
      )}
    </div>
  );
} 