import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../utils/axios';
import { supabase } from '../utils/supabase';

const DiscordConnection = () => {
  const [status, setStatus] = useState('DISCONNECTED');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const checkSession = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    console.debug('Session check:', {
      hasSession: !!session,
      hasAccessToken: !!session?.access_token,
      user: session?.user?.id
    });

    if (!session?.access_token) {
      console.error('No valid session found');
      navigate('/login');
      return false;
    }
    return true;
  }, [navigate]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const checkStatus = useCallback(async () => {
    try {
      const response = await api.get('/connect/discord/status');
      setStatus(response.data.status);
    } catch (error) {
      console.error('Error checking Discord status:', error);
      if (error.response?.status === 401) {
        setStatus('DISCONNECTED');
        navigate('/login');
      }
    }
  }, [navigate]);

  const disconnect = async () => {
    try {
      setIsLoading(true);
      setError('');
      await api.post('/connect/discord/disconnect');
      setStatus('DISCONNECTED');
    } catch (error) {
      console.error('Error disconnecting Discord:', error);
      setError(error.response?.data?.message || 'Failed to disconnect');
    } finally {
      setIsLoading(false);
    }
  };

  const initiateDiscordAuth = async () => {
    console.debug('Starting Discord auth initiation', {
      timestamp: new Date().toISOString(),
      location: window.location.href,
      isLoading,
      status,
      error
    });

    try {
      setIsLoading(true);
      setError('');
      
      console.debug('Checking session...');
      const hasValidSession = await checkSession();
      if (!hasValidSession) {
        console.debug('No valid session found, returning early');
        return;
      }
      console.debug('Session check passed');

      // Initiate OAuth flow
      console.debug('Initiating OAuth flow...');
      const state = crypto.randomUUID();
      const redirect_uri = import.meta.env.VITE_DISCORD_REDIRECT_URI || `${window.location.origin}/oauth/discord/callback`;
      
      console.debug('Starting OAuth flow:', {
        state,
        redirect_uri,
        timestamp: new Date().toISOString()
      });

      // Initiate OAuth flow with server
      const response = await api.post('/connect/discord/initiate', { 
        state,
        redirect_uri
      });

      if (!response.data?.url) {
        throw new Error('Invalid response from server: missing OAuth URL');
      }

      console.debug('Got OAuth URL, redirecting...', {
        url: response.data.url,
        timestamp: new Date().toISOString()
      });
      
      window.location.href = response.data.url;

    } catch (error) {
      console.error('Error in Discord auth flow:', {
        error,
        message: error.message,
        response: error.response?.data,
        timestamp: new Date().toISOString()
      });
      
      try {
        // Clean up on error
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          await supabase
            .from('oauth_states')
            .delete()
            .eq('user_id', session.user.id)
            .eq('platform', 'discord');
        }
      } catch (cleanupError) {
        console.error('Error during cleanup:', cleanupError);
      }
      
      setError(error.response?.data?.message || error.message || 'Failed to initiate Discord connection');
    } finally {
      setIsLoading(false);
    }
  };

  const renderConnectionState = () => {
    if (isLoading) {
      return (
        <div className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center space-x-3">
              <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              <p className="text-blue-700 font-medium">Connecting to Discord...</p>
            </div>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="space-y-4">
          <div className="bg-red-50 p-4 rounded-lg">
            <p className="text-red-700 font-medium">Connection Error</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 bg-red-100 text-red-700 px-4 py-2 rounded-md text-sm hover:bg-red-200 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    if (status === 'active') {
      return (
        <div className="space-y-4">
          <div className="bg-green-50 p-4 rounded-lg">
            <p className="text-green-700 font-medium">✓ Discord Connected Successfully</p>
            <p className="text-sm text-green-600 mt-1">Your Discord server is now integrated with our platform.</p>
          </div>
          <button
            onClick={disconnect}
            disabled={isLoading}
            className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition duration-200 disabled:opacity-50"
          >
            {isLoading ? 'Disconnecting...' : 'Disconnect Discord'}
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="font-semibold text-lg mb-2">Connect Discord</h3>
          <p className="text-gray-600">Connect your Discord server to enable seamless integration with our platform.</p>
          <ul className="mt-4 space-y-2 text-sm text-gray-600">
            <li className="flex items-center">
              <svg className="w-4 h-4 mr-2 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              One-click authorization
            </li>
            <li className="flex items-center">
              <svg className="w-4 h-4 mr-2 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              No technical setup required
            </li>
            <li className="flex items-center">
              <svg className="w-4 h-4 mr-2 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Secure and reliable connection
            </li>
          </ul>
          <button
            onClick={async () => {
              console.debug('Connect button clicked', {
                timestamp: new Date().toISOString(),
                isLoading,
                status,
                error
              });

              try {
                console.debug('About to call initiateDiscordAuth');
                await initiateDiscordAuth();
                console.debug('initiateDiscordAuth completed');
              } catch (error) {
                console.error('Error in click handler:', {
                  error,
                  message: error.message,
                  stack: error.stack,
                  timestamp: new Date().toISOString()
                });
              }
            }}
            disabled={isLoading}
            className="mt-4 w-full bg-primary hover:bg-primary/90 text-white font-semibold py-2 px-4 rounded-lg transition duration-200 disabled:opacity-50"
          >
            Connect Discord
          </button>
        </div>
      </div>
    );
  };

  useEffect(() => {
    const init = async () => {
      const hasValidSession = await checkSession();
      if (hasValidSession) {
        await checkStatus();
        
        // Check if we came from a successful connection
        const state = location.state;
        if (state?.fromCallback && state?.platform === 'discord') {
          console.debug('Came from successful connection:', state);
          // You can trigger any necessary view updates here
        }
      }
    };
    init();
  }, [checkSession, checkStatus, location]);

  // Add status check on mount and when status changes
  useEffect(() => {
    if (status === 'CONNECTED') {
      console.debug('Discord connected, checking onboarding status');
      const checkOnboarding = async () => {
        try {
          const { data: onboardingData } = await api.get('/onboarding/status');
          if (onboardingData?.currentStep === 'complete') {
            console.debug('Onboarding complete, checking current path');
            // Only navigate if we're not already on the dashboard
            if (!window.location.pathname.includes('/dashboard')) {
              console.debug('Navigating to dashboard');
              navigate('/dashboard', {
                replace: true,
                state: {
                  platform: 'discord',
                  view: 'discord-entities'
                }
              });
            }
          }
        } catch (error) {
          console.error('Error checking onboarding status:', error);
          // Only navigate on error if we're not already on the dashboard
          if (!window.location.pathname.includes('/dashboard')) {
            navigate('/dashboard', {
              replace: true,
              state: {
                platform: 'discord',
                error: 'Failed to check onboarding status'
              }
            });
          }
        }
      };
      checkOnboarding();
    }
  }, [status, navigate]);

  return (
    <div className="max-w-md mx-auto p-6">
      <div className="bg-white shadow-lg rounded-xl p-6">
        <h2 className="text-2xl font-bold mb-6">Discord Integration</h2>
        
        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-4">
            <p className="font-medium">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        )}
        
        {renderConnectionState()}
      </div>
    </div>
  );
};

export default DiscordConnection; 