import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { handleError, ErrorTypes, AppError } from '../utils/errorHandler';
import api from '../utils/api';
import { toast } from 'react-hot-toast';
import ProtocolSelection from '../components/ProtocolSelection';
import WhatsAppBridgeSetup from '../components/WhatsAppBridgeSetup';
import { useDispatch, useSelector } from 'react-redux';
import { fetchOnboardingStatus, updateOnboardingStep } from '../store/slices/onboardingSlice';
import { onboardingService } from '../services/onboardingService';

// Onboarding steps configuration
const ONBOARDING_STEPS = {
  INITIAL: 'initial',
  PROTOCOL_SELECTION: 'protocol_selection',
  MATRIX: 'matrix',
  WHATSAPP: 'whatsapp',
  COMPLETE: 'complete'
};

// Add step metadata
const STEP_METADATA = {
  [ONBOARDING_STEPS.INITIAL]: {
    title: 'Welcome to DailyFix',
    description: 'Let\'s get you set up with a secure messaging protocol.',
    nextSteps: ['protocol_selection']
  },
  [ONBOARDING_STEPS.PROTOCOL_SELECTION]: {
    title: 'Select Your Protocol',
    description: 'Choose Matrix as your secure messaging protocol.',
    nextSteps: ['matrix']
  },
  [ONBOARDING_STEPS.MATRIX]: {
    title: 'Connect Matrix',
    description: 'Set up your Matrix account for secure messaging.',
    nextSteps: ['whatsapp']
  },
  [ONBOARDING_STEPS.WHATSAPP]: {
    title: 'Connect WhatsApp',
    description: 'Link your WhatsApp account to start syncing messages through Matrix.',
    nextSteps: ['complete']
  },
  [ONBOARDING_STEPS.COMPLETE]: {
    title: 'Setup Complete',
    description: 'You\'re all set! Redirecting to dashboard...',
    nextSteps: []
  }
};

// Step validation
const isValidStep = (step) => Object.values(ONBOARDING_STEPS).includes(step);

const getNextStep = (currentStep, connectedPlatforms = []) => {
  switch (currentStep) {
    case ONBOARDING_STEPS.INITIAL:
      return ONBOARDING_STEPS.PROTOCOL_SELECTION;
    case ONBOARDING_STEPS.PROTOCOL_SELECTION:
      return ONBOARDING_STEPS.MATRIX;
    case ONBOARDING_STEPS.MATRIX:
      return connectedPlatforms.includes('matrix') ? ONBOARDING_STEPS.WHATSAPP : ONBOARDING_STEPS.MATRIX;
    case ONBOARDING_STEPS.WHATSAPP:
      return connectedPlatforms.includes('whatsapp') ? ONBOARDING_STEPS.COMPLETE : ONBOARDING_STEPS.WHATSAPP;
    case ONBOARDING_STEPS.COMPLETE:
      return null;
    default:
      return ONBOARDING_STEPS.INITIAL;
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
        Your centralized messaging hub powered by Matrix. Let's get you set up in just a few steps.
      </p>
      <button
        onClick={() => onNext(ONBOARDING_STEPS.PROTOCOL_SELECTION)}
        className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary/80 transition-colors"
      >
        Get Started with Matrix
      </button>
    </div>
  );
};

const MatrixSetupStep = ({ onNext }) => {
  const [status, setStatus] = useState({
    loading: true,
    error: null,
    showSuccess: false,
    connectionStatus: null
  });
  const dispatch = useDispatch();
  const navigate = useNavigate();

  useEffect(() => {
    const checkStatus = async () => {
      try {
        setStatus(prev => ({ ...prev, loading: true, error: null }));
        const onboardingStatus = await onboardingService.getOnboardingStatus(true);
        
        setStatus(prev => ({
          ...prev,
          loading: false,
          connectionStatus: onboardingStatus.matrixConnected ? 'connected' : 'disconnected'
        }));
      } catch (error) {
        console.error('Error checking status:', error);
        setStatus(prev => ({
          ...prev,
          loading: false,
          error: 'Failed to check connection status. Please try again.'
        }));
      }
    };

    checkStatus();
  }, [dispatch, navigate]);

  const handleComplete = async () => {
    try {
      setStatus(prev => ({ ...prev, loading: true, error: null }));
      const onboardingStatus = await onboardingService.getOnboardingStatus(true);

      // Only proceed if Matrix is connected
      if (!onboardingStatus.matrixConnected) {
        setStatus(prev => ({
          ...prev,
          loading: false,
          error: 'Matrix connection is required before proceeding.'
        }));
        return;
      }

      // Proceed to WhatsApp setup
      await dispatch(updateOnboardingStep({ step: 'whatsapp' })).unwrap();
      onNext();
    } catch (error) {
      console.error('Error completing setup:', error);
      setStatus(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to complete setup. Please try again.'
      }));
    }
  };

  return (
    <div className="max-w-lg mx-auto p-8">
      <h2 className="text-2xl font-bold mb-4">{STEP_METADATA[ONBOARDING_STEPS.MATRIX].title}</h2>
      <p className="text-gray-300 mb-8">{STEP_METADATA[ONBOARDING_STEPS.MATRIX].description}</p>
      
      {status.connectionStatus === 'connected' ? (
        <div className="text-center">
          <div className="text-green-500 mb-4">✓</div>
          <p className="text-green-400 mb-4">Matrix connected successfully!</p>
          <button
            onClick={handleComplete}
            className="px-6 py-2 bg-primary text-white rounded hover:bg-primary-dark transition-colors"
          >
            Continue to WhatsApp Setup
          </button>
        </div>
      ) : (
        <div>
          <ol className="list-decimal list-inside mb-8 space-y-4">
            <li>Install Element on your device if you haven't already</li>
            <li>Create a Matrix account or sign in to your existing one</li>
            <li>Keep Element open to receive the invitation</li>
            <li>Click continue below to proceed</li>
          </ol>
          <button
            onClick={handleComplete}
            className="w-full px-6 py-2 bg-primary text-white rounded hover:bg-primary-dark transition-colors"
            disabled={!status.connectionStatus === 'connected'}
          >
            Continue
          </button>
        </div>
      )}

      {status.error && (
        <div className="mt-4 p-4 bg-red-500/10 border border-red-500 rounded-lg">
          <p className="text-red-400">{status.error}</p>
        </div>
      )}
    </div>
  );
};

const PlatformSelectionStep = ({ onNext }) => {
  const navigate = useNavigate();
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const { session } = useSelector(state => state.auth);

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
      const response = await api.post(`http://localhost:3002/connect/${platform.id}/initiate`, requestData);
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
  const [status, setStatus] = useState({
    loading: true,
    error: null,
    showSuccess: false,
    connectionStatus: null,
    matrixConnected: false
  });
  const dispatch = useDispatch();
  const navigate = useNavigate();

  useEffect(() => {
    const checkStatus = async () => {
      try {
        setStatus(prev => ({ ...prev, loading: true, error: null }));
        const onboardingStatus = await onboardingService.getOnboardingStatus(true);
        
        // Strict Matrix dependency check
        if (!onboardingStatus.matrixConnected) {
          setStatus(prev => ({
            ...prev,
            loading: false,
            error: 'Matrix connection is required. Redirecting to Matrix setup...'
          }));
          // Short delay to show the error message
          setTimeout(async () => {
            await dispatch(updateOnboardingStep({ step: 'matrix' })).unwrap();
            navigate('/onboarding/matrix', { replace: true });
          }, 2000);
          return;
        }

        // If both are connected, complete onboarding
        if (onboardingStatus.whatsappConnected && onboardingStatus.matrixConnected) {
          setStatus(prev => ({ ...prev, showSuccess: true }));
          await dispatch(updateOnboardingStep({ step: 'complete' })).unwrap();
          navigate('/dashboard', { replace: true });
          return;
        }

        setStatus(prev => ({
          ...prev,
          loading: false,
          matrixConnected: onboardingStatus.matrixConnected,
          connectionStatus: onboardingStatus.whatsappConnected ? 'connected' : 'disconnected'
        }));
      } catch (error) {
        console.error('Error checking status:', error);
        setStatus(prev => ({
          ...prev,
          loading: false,
          error: 'Failed to check connection status. Please try again.'
        }));
      }
    };

    checkStatus();
  }, [dispatch, navigate]);

  const handleComplete = async () => {
    try {
      setStatus(prev => ({ ...prev, loading: true, error: null }));
      const onboardingStatus = await onboardingService.getOnboardingStatus(true);

      // Double-check Matrix connection
      if (!onboardingStatus.matrixConnected) {
        setStatus(prev => ({
          ...prev,
          loading: false,
          error: 'Matrix connection is required. Redirecting to Matrix setup...'
        }));
        setTimeout(async () => {
          await dispatch(updateOnboardingStep({ step: 'matrix' })).unwrap();
          navigate('/onboarding/matrix', { replace: true });
        }, 2000);
        return;
      }

      if (onboardingStatus.whatsappConnected) {
        setStatus(prev => ({ ...prev, showSuccess: true }));
        await dispatch(updateOnboardingStep({ step: 'complete' })).unwrap();
        navigate('/dashboard', { replace: true });
      }
    } catch (error) {
      console.error('Error completing setup:', error);
      setStatus(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to complete setup. Please try again.'
      }));
    }
  };

  // Show loading state while checking status or completing onboarding
  if (status.loading || status.showSuccess) {
    return (
      <div className="max-w-lg mx-auto text-center p-8">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-300">
          {status.showSuccess ? 'Completing setup and redirecting to dashboard...' : 'Checking connection status...'}
        </p>
      </div>
    );
  }

  if (status.error) {
    return (
      <div className="max-w-lg mx-auto text-center p-8">
        <div className="text-red-500 mb-4">⚠️</div>
        <p className="text-red-400">
          {status.error}
        </p>
        <button 
          onClick={() => dispatch(fetchOnboardingStatus())}
          className="mt-4 px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-8">
      <h2 className="text-2xl font-bold mb-4">{STEP_METADATA[ONBOARDING_STEPS.WHATSAPP].title}</h2>
      <p className="text-gray-300 mb-8">{STEP_METADATA[ONBOARDING_STEPS.WHATSAPP].description}</p>
      
      {status.connectionStatus === 'connected' ? (
        <div className="text-center">
          <div className="text-green-500 mb-4">✓</div>
          <p className="text-green-400 mb-4">WhatsApp connected successfully!</p>
          <button
            onClick={handleComplete}
            className="px-6 py-2 bg-primary text-white rounded hover:bg-primary-dark transition-colors"
          >
            Continue
          </button>
        </div>
      ) : (
        <WhatsAppBridgeSetup onComplete={handleComplete} />
      )}
    </div>
  );
};

const CompletionStep = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [hasAttempted, setHasAttempted] = useState(false);

  useEffect(() => {
    const redirectToDashboard = async () => {
      // If we've already attempted to update, just redirect
      if (hasAttempted) {
        navigate('/dashboard', { replace: true });
        return;
      }

      try {
        setHasAttempted(true);
        await dispatch(updateOnboardingStep({ step: 'complete' })).unwrap();
        navigate('/dashboard', { replace: true });
      } catch (error) {
        // Log error but continue to dashboard
        console.error('Error in completion step:', error);
        // Single error toast instead of multiple
        toast.error('Note: Failed to save onboarding status, but continuing to dashboard...');
        navigate('/dashboard', { replace: true });
      }
    };

    redirectToDashboard();
  }, [dispatch, navigate, hasAttempted]);

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
  const dispatch = useDispatch();
  const { session } = useSelector(state => state.auth);
  const { currentStep, isComplete } = useSelector(state => state.onboarding);
  const navigationAttemptedRef = useRef(false);

  useEffect(() => {
    const checkAndRedirect = async () => {
      if (!session) {
        navigate('/login');
        return;
      }

      try {
        const status = await onboardingService.getOnboardingStatus(true);
        
        // If onboarding is complete, redirect to dashboard
        if (status.isComplete) {
          navigate('/dashboard', { replace: true });
          return;
        }

        // If we have a current step but are at root onboarding, redirect
        if (status.currentStep && location.pathname === '/onboarding') {
          navigate(`/onboarding/${status.currentStep}`, { replace: true });
          return;
        }

        // Get step from URL
        const urlStep = location.pathname.split('/').pop();
        
        // Validate step and redirect if needed
        if (!isValidStep(urlStep)) {
          const validStep = status.currentStep || ONBOARDING_STEPS.INITIAL;
          navigate(`/onboarding/${validStep}`, { replace: true });
        }
      } catch (error) {
        console.error('Error in onboarding check:', error);
        toast.error('Failed to check onboarding status. Please try again.');
      }
    };

    checkAndRedirect();
  }, [session, location.pathname, navigate]);

  // Reset navigation attempt ref when component unmounts
  useEffect(() => {
    return () => {
      navigationAttemptedRef.current = false;
    };
  }, []);

  const handleStepChange = async (nextStep) => {
    try {
      await dispatch(updateOnboardingStep({ step: nextStep })).unwrap();
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
      case ONBOARDING_STEPS.INITIAL:
        return <WelcomeStep onNext={handleStepChange} />;
      case ONBOARDING_STEPS.PROTOCOL_SELECTION:
        return <ProtocolSelection onNext={() => handleStepChange(ONBOARDING_STEPS.MATRIX)} />;
      case ONBOARDING_STEPS.MATRIX:
        return <MatrixSetupStep onNext={() => handleStepChange(ONBOARDING_STEPS.WHATSAPP)} />;
      case ONBOARDING_STEPS.WHATSAPP:
        return <WhatsAppSetupStep />;
      case ONBOARDING_STEPS.COMPLETE:
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
