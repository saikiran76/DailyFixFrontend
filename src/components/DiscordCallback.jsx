import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '../utils/axios';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';

const DiscordCallback = () => {
  const [error, setError] = useState('');
  const [status, setStatus] = useState('initializing');
  const callbackProcessed = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { onboardingStatus, updateOnboardingStep } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      // Prevent multiple callback processing
      if (callbackProcessed.current) {
        console.debug('Callback already processed, skipping');
        return;
      }
      callbackProcessed.current = true;

      try {
        // Get auth session first
        const { data: { session: authSession }, error: authError } = await supabase.auth.getSession();
        if (authError || !authSession) {
          console.error('Auth session error:', {
            error: authError,
            hasSession: !!authSession,
            timestamp: new Date().toISOString()
          });
          throw new Error('No valid session found. Please log in again.');
        }

        // Check URL parameters
        const params = new URLSearchParams(location.search);
        const code = params.get('code');
        const state = params.get('state');
        const error = params.get('error');
        const error_description = params.get('error_description');

        console.debug('Processing callback parameters:', {
          hasCode: !!code,
          hasState: !!state,
          hasError: !!error,
          error_description,
          timestamp: new Date().toISOString()
        });

        if (error || error_description) {
          throw new Error(error_description || error || 'Discord authorization was denied');
        }

        if (!code || !state) {
          throw new Error('Missing required OAuth parameters');
        }

        // Make a single attempt to exchange the code
        setStatus('connecting');
        const response = await api.post('/connect/discord/callback', { 
          code,
          state
        });

        console.debug('Discord callback response:', {
          status: response.data.status,
          username: response.data.platform_username,
          timestamp: new Date().toISOString()
        });

        if (response.data.status === 'active') {
          setStatus('success');
          toast.success(`Successfully connected Discord as ${response.data.platform_username}!`);

          try {
            // First update onboarding status
            setStatus('updating-onboarding');
            await updateOnboardingStep('complete', true);

            // Then verify it was updated
            const { data: verifyStatus } = await api.get('/onboarding/status');
            console.debug('Verified onboarding status:', verifyStatus);

            // Initial delay to allow token propagation
            setStatus('verifying-connection');
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Verify Discord connection is active and tokens are valid
            const maxRetries = 3;
            let retryCount = 0;
            let isConnected = false;

            while (retryCount < maxRetries && !isConnected) {
              try {
                const { data: discordStatus } = await api.get('/connect/discord/status');
                console.debug(`Discord connection status (attempt ${retryCount + 1}):`, discordStatus);
                
                if (discordStatus.status === 'active') {
                  isConnected = true;
                  break;
                }
                
                retryCount++;
                if (retryCount < maxRetries) {
                  setStatus(`verifying-connection-retry-${retryCount}`);
                  await new Promise(resolve => setTimeout(resolve, 2000));
                }
              } catch (verifyError) {
                console.error(`Verification attempt ${retryCount + 1} failed:`, verifyError);
                retryCount++;
                if (retryCount < maxRetries) {
                  setStatus(`verifying-connection-retry-${retryCount}`);
                  await new Promise(resolve => setTimeout(resolve, 2000));
                }
              }
            }

            if (!isConnected) {
              throw new Error('Failed to verify Discord connection after multiple attempts');
            }

            // Final verification before navigation
            setStatus('final-verification');
            const { data: finalStatus } = await api.get('/connect/discord/status');
            if (finalStatus.status !== 'active') {
              throw new Error('Discord connection verification failed after final check');
            }

            setStatus('redirecting');
            // Only navigate after all verifications pass
            navigate('/dashboard/discord', { 
              replace: true,
              state: { 
                fromCallback: true,
                platform: 'discord',
                username: response.data.platform_username,
                view: 'discord-entities'
              }
            });
          } catch (error) {
            console.error('Error completing setup:', error);
            
            // If we get here, all retries failed
            toast.error('Failed to verify Discord connection. Please try again.');
            navigate('/connect/discord', { replace: true });
          }
        } else {
          throw new Error('Unexpected response status: ' + response.data.status);
        }
      } catch (error) {
        console.error('Discord callback error:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status,
          timestamp: new Date().toISOString()
        });

        const errorMessage = error.response?.data?.message || error.message || 'Failed to complete Discord connection';
        setError(errorMessage);
        setStatus('error');
        toast.error(errorMessage);

        // Handle navigation based on error type
        if (error.response?.status === 401 || error.message.includes('No valid session')) {
          navigate('/login', { replace: true });
        } else {
          navigate('/connect/discord', { replace: true });
        }
      }
    };

    handleCallback();
  }, [location.search, navigate, onboardingStatus, updateOnboardingStep]);

  const getStatusMessage = () => {
    switch (status) {
      case 'initializing':
        return 'Initializing Discord connection...';
      case 'validating-params':
        return 'Validating connection parameters...';
      case 'checking-session':
        return 'Verifying your session...';
      case 'connecting':
        return 'Connecting to Discord...';
      case 'success':
        return 'Successfully connected! Redirecting...';
      case 'error':
        return 'Connection failed';
      default:
        return 'Processing...';
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8 p-8">
          <div className="bg-red-50 p-4 rounded-md">
            <h3 className="text-red-800 font-medium">Connection Error</h3>
            <p className="text-red-700 mt-1 text-sm">{error}</p>
            <div className="mt-4 space-y-2">
              <button
                onClick={() => navigate('/connect/discord')}
                className="w-full inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Try Again
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="bg-blue-50 p-4 rounded-md">
          <h3 className="text-blue-800 font-medium">Connecting Discord</h3>
          <p className="text-blue-700 mt-1 text-sm">{getStatusMessage()}</p>
          <div className="mt-4 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiscordCallback; 