import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { handleError, ErrorTypes, AppError } from '../utils/errorHandler';
import api from '../utils/axios';
import { toast } from 'react-hot-toast';
import ProtocolSelection from '../components/ProtocolSelection';
import WhatsAppBridgeSetup from '../components/WhatsAppBridgeSetup';

// Onboarding steps configuration
const ONBOARDING_STEPS = {
  WELCOME: 'welcome',
  PROTOCOL_SELECTION: 'protocol_selection',
  MATRIX_SETUP: 'matrix_setup',
  WHATSAPP_SETUP: 'whatsapp_setup',
  PLATFORM_SELECTION: 'platform_selection',
  PLATFORM_CONNECTION: 'platform_connection',
  COMPLETION: 'completion'
};

// Step validation
const isValidStep = (step) => Object.values(ONBOARDING_STEPS).includes(step);

const getNextStep = (currentStep) => {
  switch (currentStep) {
    case ONBOARDING_STEPS.WELCOME:
      return ONBOARDING_STEPS.PROTOCOL_SELECTION;
    case ONBOARDING_STEPS.PROTOCOL_SELECTION:
      return ONBOARDING_STEPS.MATRIX_SETUP;
    case ONBOARDING_STEPS.MATRIX_SETUP:
      return ONBOARDING_STEPS.WHATSAPP_SETUP;
    case ONBOARDING_STEPS.WHATSAPP_SETUP:
      return ONBOARDING_STEPS.COMPLETION;
    case ONBOARDING_STEPS.PLATFORM_SELECTION:
      return ONBOARDING_STEPS.COMPLETION;
    default:
      return ONBOARDING_STEPS.WELCOME;
  }
};

// Default Matrix homeserver URL
const DEFAULT_MATRIX_HOMESERVER = 'https://example-mtbr.duckdns.org';
const MATRIX_SERVER_DOMAIN = 'example-mtbr.duckdns.org';

// Step components
const WelcomeStep = ({ onNext }) => {
  return (
    <div className="max-w-lg mx-auto text-center p-8">
      <h1 className="text-3xl font-bold mb-4">Welcome to Daily Fix</h1>
      <p className="text-gray-300 mb-8">
        Your centralized messaging hub. Let's get you set up in just a few steps.
      </p>
      <button
        onClick={onNext}
        className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary/80 transition-colors"
      >
        Get Started
      </button>
    </div>
  );
};

const MatrixSetupStep = ({ onNext }) => {
  const [loading, setLoading] = useState(false);
  const [matrixCredentials, setMatrixCredentials] = useState({
    userId: '',
    password: '',
    homeserver: DEFAULT_MATRIX_HOMESERVER
  });
  const [error, setError] = useState('');
  const { session, updateOnboardingStep } = useAuth();
  const navigate = useNavigate();

  const handleBack = async () => {
    try {
      await updateOnboardingStep(ONBOARDING_STEPS.PROTOCOL_SELECTION);
      navigate('/onboarding/protocol_selection');
    } catch (error) {
      console.error('Navigation error:', error);
      toast.error('Failed to navigate back. Please try again.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Ensure we have a valid session
      if (!session?.user?.id) {
        throw new Error('No valid session found');
      }

      const loadingToast = toast.loading('Connecting to Matrix...');

      // Initialize Matrix client with correct credential structure
      const response = await api.post('/matrix/initialize', {
        userId: matrixCredentials.userId, // This is the Matrix user ID
        password: matrixCredentials.password,
        homeserver: matrixCredentials.homeserver
      });

      if (response.data.status === 'active') {
        toast.success('Matrix connection successful!');
        toast.dismiss(loadingToast);
        // Update onboarding step before navigation
        await updateOnboardingStep(ONBOARDING_STEPS.WHATSAPP_SETUP);
        navigate('/onboarding/whatsapp_setup');
      } else {
        throw new Error(response.data.message || 'Failed to connect to Matrix');
      }
    } catch (error) {
      console.error('Matrix setup error:', error);
      setError(error.response?.data?.message || error.message);
      toast.error(error.response?.data?.message || 'Failed to connect to Matrix');
      toast.dismiss(); // Dismiss any existing loading toasts
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={handleBack}
          className="flex items-center text-gray-400 hover:text-white transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 mr-2"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
              clipRule="evenodd"
            />
          </svg>
          Back to Protocol Selection
        </button>
        <h2 className="text-2xl font-bold text-white">Matrix Protocol Setup</h2>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Matrix User ID
          </label>
          <input
            type="text"
            value={matrixCredentials.userId}
            onChange={(e) => setMatrixCredentials(prev => ({
              ...prev,
              userId: e.target.value
            }))}
            className="w-full p-3 bg-dark-lighter border border-gray-700 rounded-lg text-white"
            placeholder="@username:example.com"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Password
          </label>
          <input
            type="password"
            value={matrixCredentials.password}
            onChange={(e) => setMatrixCredentials(prev => ({
              ...prev,
              password: e.target.value
            }))}
            className="w-full p-3 bg-dark-lighter border border-gray-700 rounded-lg text-white"
            placeholder="Enter your password"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Homeserver URL
          </label>
          <input
            type="text"
            value={matrixCredentials.homeserver}
            onChange={(e) => setMatrixCredentials(prev => ({
              ...prev,
              homeserver: e.target.value
            }))}
            className="w-full p-3 bg-dark-lighter border border-gray-700 rounded-lg text-white"
            placeholder="https://matrix.example.com"
            required
          />
        </div>

        {error && (
          <div className="text-red-500 text-sm mt-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-3 px-4 rounded-lg font-medium ${
            loading
              ? 'bg-primary/50 cursor-not-allowed'
              : 'bg-primary hover:bg-primary/90'
          } text-white transition-colors`}
        >
          {loading ? 'Connecting...' : 'Connect to Matrix'}
        </button>
      </form>

      <div className="mt-8 text-center">
        <p className="text-sm text-gray-500">
          Your Matrix account will be used to bridge with other messaging platforms.
          Make sure you have access to the Matrix homeserver.
        </p>
      </div>
    </div>
  );
};

const PlatformSelectionStep = ({ onNext }) => {
  const navigate = useNavigate();
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const { session } = useAuth();

  const platforms = [
    { id: 'whatsapp', name: 'WhatsApp', icon: '📱', requiresQR: true },
    { id: 'telegram', name: 'Telegram', icon: '✈️', requiresToken: true },
    { id: 'slack', name: 'Slack', icon: '💬', requiresOAuth: true },
    { id: 'discord', name: 'Discord', icon: '🎮', requiresOAuth: true }
  ];

  const handlePlatformSelect = async (platform) => {
    try {
      setIsConnecting(true);
      setSelectedPlatform(platform);

      // Show immediate loading toast
      const loadingToast = toast.loading(`Connecting to ${platform.name}...`);

      // Ensure auth token is set
      const token = session?.access_token;
      if (!token) {
        throw new Error('No authentication token available');
      }

      // Store fresh token
      localStorage.setItem('auth_token', token);

      // Set auth header
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      // For OAuth platforms, generate and store state
      let requestData = {};
      if (platform.requiresOAuth) {
        // Generate state
        const state = crypto.randomUUID();
        
        // Store state in multiple locations for redundancy
        sessionStorage.setItem('discordOAuthState', state);
        localStorage.setItem('discordOAuthState', state);
        document.cookie = `discordOAuthState=${state};path=/;max-age=300`; // 5 minutes expiry
        
        // Store metadata
        const stateData = {
          state,
          timestamp: new Date().toISOString(),
          origin: window.location.origin,
          initiatedFrom: window.location.href
        };
        localStorage.setItem('discordOAuthMetadata', JSON.stringify(stateData));
        
        // Add state to request
        requestData = { 
          state,
          redirect_uri: `${window.location.origin}/oauth/discord/callback`
        };
        
        console.debug('OAuth state generated:', {
          state,
          platform: platform.id,
          timestamp: new Date().toISOString()
        });
      }
      
      // Initiate platform connection
      const response = await api.post(`http://localhost:3001/connect/${platform.id}/initiate`, requestData);
      console.log('Platform initiation response:', response.data);

      // Dismiss loading toast
      toast.dismiss(loadingToast);

      if (platform.requiresOAuth && response.data.url) {
        // For OAuth platforms (like Discord), redirect to auth URL
        window.location.href = response.data.url;
        return;
      }

      // For non-OAuth platforms
      if (response.data.status === 'pending' || response.data.status === 'initializing') {
        if (platform.requiresQR) {
          navigate('/connect/whatsapp');
        } else if (platform.requiresToken) {
          navigate('/connect/telegram');
        }
      } else if (response.data.status === 'connected') {
        toast.success(`Successfully connected to ${platform.name}`);
        navigate('/dashboard');
      } else {
        throw new Error(`Unexpected status: ${response.data.status}`);
      }
    } catch (error) {
      console.error(`${platform.name} connection error:`, error);
      
      // Clean up OAuth state on error
      if (platform.requiresOAuth) {
        sessionStorage.removeItem('discordOAuthState');
        localStorage.removeItem('discordOAuthState');
        localStorage.removeItem('discordOAuthMetadata');
        document.cookie = 'discordOAuthState=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      }
      
      toast.error(error.response?.data?.message || `Failed to connect to ${platform.name}. Please try again.`);
    } finally {
      setIsConnecting(false);
      setSelectedPlatform(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h2 className="text-2xl font-bold mb-6">Choose Your Messaging Platform</h2>
      <div className="grid grid-cols-2 gap-4">
        {platforms.map(platform => (
          <button
            key={platform.id}
            onClick={() => handlePlatformSelect(platform)}
            disabled={isConnecting}
            className={`p-4 border border-gray-700 rounded-lg hover:border-primary transition-colors text-left relative ${
              isConnecting && selectedPlatform?.id === platform.id ? 'opacity-50' : ''
            }`}
          >
            <span className="text-2xl mr-2">{platform.icon}</span>
            <span className="font-medium">{platform.name}</span>
            {isConnecting && selectedPlatform?.id === platform.id && (
              <div className="absolute inset-0 bg-dark/50 flex items-center justify-center">
                <div className="flex flex-col items-center space-y-2">
                  <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
                  <span className="text-sm text-gray-300">Initializing...</span>
                </div>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

const WhatsAppSetupStep = () => {
  const { updateOnboardingStep } = useAuth();
  const [showSuccess, setShowSuccess] = useState(false);
  const completionAttemptedRef = useRef(false);

  const handleComplete = async (data) => {
    try {
      if (completionAttemptedRef.current) {
        console.log('Completion already attempted, ignoring duplicate call');
        return;
      }

      console.log('Starting WhatsApp setup completion flow...', { data });
      completionAttemptedRef.current = true;

      // Update WhatsApp status first
      const statusResponse = await api.post('/matrix/whatsapp/update-status', {
        status: 'connected',
        bridgeRoomId: data.bridgeRoomId
      });

      console.log('WhatsApp status update response:', statusResponse.data);
      
      if (statusResponse.data.status !== 'success') {
        throw new Error('Failed to update WhatsApp status');
      }

      // Update onboarding step
      await updateOnboardingStep('complete');
      console.log('Onboarding step updated to complete');

      // Show success UI
      setShowSuccess(true);
      toast.success('WhatsApp connected successfully!');

      // Start message sync in background
      api.post('/matrix/whatsapp/sync')
        .then(() => console.log('Message sync started'))
        .catch(error => console.error('Message sync error:', error));

    } catch (error) {
      console.error('Error in WhatsApp setup completion:', error);
      completionAttemptedRef.current = false;
      toast.error('Failed to complete setup. Please try again.');
    }
  };

  // Success UI render
  if (showSuccess) {
    return (
      <div className="max-w-lg mx-auto text-center p-8 space-y-6">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white">WhatsApp Connected Successfully!</h2>
          <p className="text-gray-300">Your WhatsApp account is now linked to DailyFix</p>
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
        </div>
      </div>
    );
  }

  return <WhatsAppBridgeSetup onComplete={handleComplete} />;
};

const CompletionStep = () => {
  const navigate = useNavigate();
  const { updateOnboardingStep } = useAuth();

  useEffect(() => {
    const redirectToDashboard = async () => {
      try {
        await updateOnboardingStep('complete');
        navigate('/dashboard', { replace: true });
      } catch (error) {
        console.error('Error in completion step:', error);
        toast.error('Failed to complete onboarding. Please try again.');
      }
    };

    redirectToDashboard();
  }, []);

  return (
    <div className="max-w-lg mx-auto text-center p-8">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
      <p className="text-gray-300">Completing setup and redirecting to dashboard...</p>
    </div>
  );
};

const Onboarding = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, onboardingStatus, updateOnboardingStep } = useAuth();
  const [currentStep, setCurrentStep] = useState(ONBOARDING_STEPS.WELCOME);
  const navigationAttemptedRef = useRef(false);

  useEffect(() => {
    if (!session) {
      navigate('/login');
      return;
    }

    // Prevent multiple navigation attempts
    if (navigationAttemptedRef.current) {
      return;
    }

    // If onboarding is complete and we're still on an onboarding route
    if (onboardingStatus?.currentStep === 'complete' && location.pathname.includes('/onboarding')) {
      navigationAttemptedRef.current = true;
      navigate('/dashboard', { replace: true });
      return;
    }

    // Get current step from URL
    const path = location.pathname.split('/').pop();
    
    // Validate and set current step
    if (isValidStep(path)) {
      setCurrentStep(path);
    } else {
      // If invalid step, redirect to last known valid step or welcome
      const validStep = onboardingStatus?.currentStep || ONBOARDING_STEPS.WELCOME;
      if (validStep !== path) {
        navigate(`/onboarding/${validStep}`);
      }
    }
  }, [session, location.pathname, onboardingStatus]);

  // Reset navigation attempt ref when component unmounts
  useEffect(() => {
    return () => {
      navigationAttemptedRef.current = false;
    };
  }, []);

  const handleStepChange = async (nextStep) => {
    try {
      await updateOnboardingStep(nextStep);
      if (nextStep === 'complete') {
        navigationAttemptedRef.current = true;
        navigate('/dashboard', { replace: true });
      } else {
        navigate(`/onboarding/${nextStep}`);
      }
    } catch (error) {
      console.error('Error changing step:', error);
      toast.error('Failed to proceed to next step. Please try again.');
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case ONBOARDING_STEPS.WELCOME:
        return <WelcomeStep onNext={() => handleStepChange(ONBOARDING_STEPS.PROTOCOL_SELECTION)} />;
      case ONBOARDING_STEPS.PROTOCOL_SELECTION:
        return <ProtocolSelection onNext={() => handleStepChange(ONBOARDING_STEPS.MATRIX_SETUP)} />;
      case ONBOARDING_STEPS.MATRIX_SETUP:
        return <MatrixSetupStep onNext={() => handleStepChange(ONBOARDING_STEPS.WHATSAPP_SETUP)} />;
      case ONBOARDING_STEPS.WHATSAPP_SETUP:
        return <WhatsAppSetupStep />;
      case ONBOARDING_STEPS.PLATFORM_SELECTION:
        return <PlatformSelectionStep onNext={() => handleStepChange(ONBOARDING_STEPS.COMPLETION)} />;
      case ONBOARDING_STEPS.COMPLETION:
        return <CompletionStep />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-dark text-white">
      <div className="container mx-auto py-12">
        {renderStep()}
      </div>
    </div>
  );
};

export default Onboarding;
