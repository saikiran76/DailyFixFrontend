import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import api from '../utils/axios';
import { initializeSocket } from '../utils/socket';
import LoadingSpinner from '../components/LoadingSpinner';
import Sidebar from '../components/Sidebar';
import UnifiedInbox from '../components/UnifiedInbox';

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!session) {
      navigate('/login');
      return;
    }

    const fetchInitialData = async () => {
      try {
        // Fetch connected accounts
        const accountsResponse = await api.get('/accounts/connected');
        const connectedAccounts = accountsResponse.data;
        
        if (!connectedAccounts || connectedAccounts.length === 0) {
          navigate('/onboarding/platform-selection');
          return;
        }

        setAccounts(connectedAccounts);
        
        // Set initial platform from location state or first connected account
        const locationState = location.state;
        if (locationState?.platform) {
          setSelectedPlatform(locationState.platform);
          if (locationState.view === 'discord-entities') {
            navigate('/dashboard/discord', { replace: true });
          }
        } else if (connectedAccounts.length > 0) {
          setSelectedPlatform(connectedAccounts[0].platform);
        }

        // Initialize socket connection
        const socket = await initializeSocket();
        if (socket) {
          socketRef.current = socket;
          
          socket.on('connect', () => {
            console.log('Socket connected');
            toast.success('Real-time updates enabled');
          });
          
          socket.on('message', (message) => {
            setMessages(prev => {
              // Avoid duplicate messages
              const exists = prev.some(m => m.id === message.id);
              if (exists) return prev;
              return [message, ...prev];
            });
          });

          socket.on('status_update', (update) => {
            if (update.type === 'connection_lost') {
              toast.error(`Lost connection to ${update.platform}`);
            } else if (update.type === 'connection_restored') {
              toast.success(`Reconnected to ${update.platform}`);
            }
          });

          socket.on('platform_update', (update) => {
            if (update.type === 'connected') {
              setAccounts(prev => [...prev, update.account]);
              toast.success(`${update.platform} connected`);
            } else if (update.type === 'disconnected') {
              setAccounts(prev => prev.filter(a => a.id !== update.accountId));
              toast.info(`${update.platform} disconnected`);
            }
          });

          socket.on('disconnect', () => {
            toast.error('Lost connection to server');
          });

          socket.on('reconnect', () => {
            toast.success('Reconnected to server');
            // Refresh data on reconnect
            fetchInitialData();
          });
        }

      } catch (error) {
        console.error('Error initializing dashboard:', error);
        toast.error('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [session, navigate, location.state]);

  const handlePlatformSelect = (platform) => {
    setSelectedPlatform(platform);
    if (platform === 'discord') {
      navigate('/dashboard/discord');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-dark text-white">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-dark text-white">
      <Sidebar
        accounts={accounts}
        selectedPlatform={selectedPlatform}
        onPlatformSelect={handlePlatformSelect}
      />
      <main className="flex-1 overflow-hidden flex flex-col">
        <Outlet />
      </main>
    </div>
  );
};

export default Dashboard; 