import React, { useState, useEffect } from 'react';
import { getSocket, initializeSocket } from '../utils/socket';
import toast from 'react-hot-toast';

const TopNavPanel = () => {
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    if (socket) {
      // Listen for sync completion
      socket.on('sync_complete', () => {
        setIsSyncing(false);
        toast.success('Sync completed successfully');
        toast.dismiss('sync');
      });

      // Listen for sync errors
      socket.on('error', (error) => {
        setIsSyncing(false);
        toast.error(error.message || 'Sync failed');
        toast.dismiss('sync');
      });

      return () => {
        socket.off('sync_complete');
        socket.off('error');
      };
    }
  }, []);

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      toast.loading('Syncing...', { id: 'sync' });
      
      const socket = await initializeSocket({
        onError: (error) => {
          setIsSyncing(false);
          toast.error(error.message || 'Failed to connect');
          toast.dismiss('sync');
        }
      });
      
      socket.emit('sync_request');
    } catch (error) {
      setIsSyncing(false);
      toast.error('Failed to initialize socket connection');
      toast.dismiss('sync');
    }
  };

  return (
    <div className="bg-dark-lighter shadow-sm border-b border-dark-lightest">
      <div className="flex items-center justify-end space-x-4 p-4">
        <button className="px-4 py-2 rounded-lg bg-dark hover:bg-dark-lightest transition-colors text-gray-300">
          Prioritize
        </button>
        <button className="px-4 py-2 rounded-lg bg-dark hover:bg-dark-lightest transition-colors text-gray-300">
          Summarize
        </button>
        <button className="px-4 py-2 rounded-lg bg-dark hover:bg-dark-lightest transition-colors text-gray-300">
          Analysis
        </button>
        <button 
          onClick={handleSync}
          disabled={isSyncing}
          className={`px-4 py-2 rounded-lg bg-dark hover:bg-dark-lightest transition-colors text-gray-300 flex items-center space-x-2 ${isSyncing ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <svg 
            className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
            />
          </svg>
          <span>{isSyncing ? 'Syncing...' : 'Sync'}</span>
        </button>
      </div>
    </div>
  );
};

export default TopNavPanel;