import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { handleError, ErrorTypes, AppError } from '../utils/errorHandler';
import api from '../utils/api';
import { toast } from 'react-hot-toast';
import ProtocolSelection from '../components/ProtocolSelection';
import WhatsAppBridgeSetup from '../components/WhatsAppBridgeSetup';
import { useDispatch, useSelector } from 'react-redux';
import { 
  fetchOnboardingStatus, 
  updateOnboardingStep,
  setOnboardingError,
  selectOnboardingState,
  ONBOARDING_ROUTES 
} from '../store/slices/onboardingSlice';
import { onboardingService } from '../services/onboardingService';

// Onboarding steps configuration
const ONBOARDING_STEPS = {
  WELCOME: 'welcome',
  PROTOCOL_SELECTION: 'protocol_selection',
  MATRIX: 'matrix',
  WHATSAPP: 'whatsapp',
  COMPLETE: 'complete'
};

// Add step metadata
const STEP_METADATA = {
  [ONBOARDING_STEPS.WELCOME]: {
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
    case ONBOARDING_STEPS.WELCOME:
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
      return ONBOARDING_STEPS.WELCOME;
  }
};

// Default Matrix homeserver URL
const DEFAULT_MATRIX_HOMESERVER = 'https://example-mtbr.duckdns.org';
const MATRIX_SERVER_DOMAIN = 'example-mtbr.duckdns.org';

// Step components
const WelcomeStep = ({ onNext }) => {
  return (
    <div className="max-w-2xl mx-auto text-center">
      <h1 className="text-4xl font-bold mb-6">{STEP_METADATA[ONBOARDING_STEPS.WELCOME].title}</h1>
      <p className="text-xl mb-8">{STEP_METADATA[ONBOARDING_STEPS.WELCOME].description}</p>
      <button
        onClick={() => onNext(ONBOARDING_STEPS.PROTOCOL_SELECTION)}
        className="bg-primary hover:bg-primary-dark text-white font-bold py-3 px-6 rounded-lg transition-colors"
      >
        Get Started
      </button>
    </div>
  );
};

const MatrixSetupStep = ({ onNext }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error, connectedPlatforms } = useSelector(state => state.onboarding);
  const { session } = useSelector(state => state.auth);
  const [matrixCredentials, setMatrixCredentials] = useState({
    userId: '',
    password: '',
    homeserver: DEFAULT_MATRIX_HOMESERVER
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // Clear form error when credentials change
  useEffect(() => {
    if (formError) {
      setFormError(null);
    }
  }, [matrixCredentials]);

  const handleBack = async () => {
    try {
      setFormError(null);
      await dispatch(updateOnboardingStep({ 
        step: ONBOARDING_STEPS.PROTOCOL_SELECTION 
      })).unwrap();
      navigate('/onboarding/protocol_selection');
      } catch (error) {
      console.error('Navigation error:', error);
      toast.error('Failed to navigate back. Please try again.');
    }
  };

  const validateForm = () => {
    if (!matrixCredentials.userId.trim()) {
      setFormError('Matrix User ID is required');
      return false;
    }
    if (!matrixCredentials.userId.includes(':')) {
      setFormError('Invalid Matrix User ID format. Should be like @user:domain.com');
      return false;
    }
    if (!matrixCredentials.password) {
      setFormError('Password is required');
      return false;
    }
    if (!matrixCredentials.homeserver.startsWith('http')) {
      setFormError('Invalid homeserver URL. Should start with http:// or https://');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Clear previous errors
    setFormError(null);
    
    // Validate form
    if (!validateForm()) {
      return;
    }

    try {
      if (!session?.user?.id) {
        throw new Error('No valid session found');
      }

      setIsSubmitting(true);
      const loadingToast = toast.loading('Connecting to Matrix...');

      const response = await api.post('/matrix/initialize', {
        userId: matrixCredentials.userId,
        password: matrixCredentials.password,
        homeserver: matrixCredentials.homeserver
      });

      if (response.data.status === 'active') {
        await dispatch(updateOnboardingStep({ 
          step: ONBOARDING_STEPS.WHATSAPP,
          data: { 
            matrixConnected: true,
            connectedPlatforms: [...connectedPlatforms, 'matrix']
          }
        })).unwrap();

        toast.success('Matrix connection successful!');
        toast.dismiss(loadingToast);
        navigate('/onboarding/whatsapp');
      } else {
        setFormError(response.data.message || 'Failed to connect to Matrix. Please check your credentials.');
        toast.error(response.data.message || 'Connection failed');
        toast.dismiss(loadingToast);
      }
    } catch (error) {
      console.error('Matrix setup error:', error);
      const errorMessage = error.response?.data?.message || error.message;
      setFormError(errorMessage);
      dispatch(setOnboardingError(errorMessage));
      toast.error('Failed to connect to Matrix. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
          <button
          onClick={handleBack}
          className="flex items-center text-gray-400 hover:text-white transition-colors"
          disabled={isSubmitting}
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
      
      {formError && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <div className="flex items-center text-red-500">
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>{formError}</span>
          </div>
          <p className="mt-2 text-sm text-red-400">
            Please check your credentials and try again. Make sure you can log into Element with these credentials.
          </p>
        </div>
      )}
      
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
            className={`w-full p-3 bg-dark-lighter border rounded-lg text-white transition-colors ${
              formError && !matrixCredentials.userId ? 'border-red-500' : 'border-gray-700'
            }`}
            placeholder="@username:example.com"
            disabled={isSubmitting}
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
            className={`w-full p-3 bg-dark-lighter border rounded-lg text-white transition-colors ${
              formError && !matrixCredentials.password ? 'border-red-500' : 'border-gray-700'
            }`}
            placeholder="Enter your password"
            disabled={isSubmitting}
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
            className={`w-full p-3 bg-dark-lighter border rounded-lg text-white transition-colors ${
              formError && !matrixCredentials.homeserver.startsWith('http') ? 'border-red-500' : 'border-gray-700'
            }`}
            placeholder="https://matrix.example.com"
            disabled={isSubmitting}
            required
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className={`w-full py-3 px-4 rounded-lg font-medium ${
            isSubmitting
              ? 'bg-primary/50 cursor-not-allowed'
              : 'bg-primary hover:bg-primary/90'
          } text-white transition-colors flex items-center justify-center`}
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Connecting...
            </>
          ) : (
            'Connect to Matrix'
          )}
        </button>
      </form>

      <div className="mt-8 text-center">
        <p className="text-sm text-gray-500">
          Your Matrix account will be used to bridge with other messaging platforms.
          Make sure you have access to the Matrix homeserver.
        </p>
        <ol className="list-decimal list-inside mb-8 space-y-4 text-left text-gray-400">
            <li>Install Element on your device if you haven't already</li>
            <li>Create a Matrix account or sign in to your existing one</li>
            <li>Keep Element open to receive the invitation</li>
            <li>Click continue below to proceed</li>
          </ol>
        </div>
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
      const response = await api.post(`connect/${platform.id}/initiate`, requestData);
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
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error, matrixConnected, whatsappConnected, currentStep } = useSelector(selectOnboardingState);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    const checkStatus = async () => {
      try {
        const onboardingStatus = await dispatch(fetchOnboardingStatus()).unwrap();
        console.log('[WhatsAppSetupStep] Status check:', onboardingStatus);
        
        if (!mounted) return;

        // Only redirect if explicitly not connected
        if (onboardingStatus.matrixConnected === false) {
          dispatch(setOnboardingError('Matrix connection is required'));
            await dispatch(updateOnboardingStep({ step: 'matrix' })).unwrap();
          navigate(ONBOARDING_ROUTES.MATRIX, { replace: true });
          return;
        }
      } catch (error) {
        console.error('Error checking status:', error);
        if (mounted) {
          dispatch(setOnboardingError('Failed to check connection status. Please try again.'));
        }
      } finally {
        if (mounted) {
          setIsChecking(false);
        }
      }
    };

    checkStatus();
    return () => {
      mounted = false;
    };
  }, [dispatch, navigate]);

  const handleComplete = async () => {
    try {
      // Use current Redux state instead of fetching
      if (!matrixConnected || !whatsappConnected) {
        logger.error('[WhatsAppSetupStep] Cannot complete onboarding - services not connected:', { matrixConnected, whatsappConnected });
        dispatch(setOnboardingError('Both Matrix and WhatsApp must be connected to complete setup'));
        return;
      }

      // Update onboarding step to complete
      await dispatch(updateOnboardingStep({ 
        step: 'complete',
        data: { 
          whatsappConnected: true,
          matrixConnected: true,
          isComplete: true,
          connectedPlatforms: ['matrix', 'whatsapp']
        }
      })).unwrap();

      // Navigate to completion route
      navigate(ONBOARDING_ROUTES.COMPLETE, { replace: true });
    } catch (error) {
      logger.error('[WhatsAppSetupStep] Error completing setup:', error);
      dispatch(setOnboardingError('Failed to complete setup. Please try again.'));
    }
  };

  console.log('[WhatsAppSetupStep] Component state:', { isChecking, loading, error, whatsappConnected });

  if (isChecking) {
    console.log('[WhatsAppSetupStep] Showing loading state');
    return (
      <div className="max-w-lg mx-auto text-center p-8">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-300">Checking connection status...</p>
      </div>
    );
  }

  if (error) {
    console.log('[WhatsAppSetupStep] Showing error state:', error);
    return (
      <div className="max-w-lg mx-auto text-center p-8">
        <div className="text-red-500 mb-4">⚠️</div>
        <p className="text-red-400">{error}</p>
        <button 
          onClick={() => {
            setIsChecking(true);
            dispatch(fetchOnboardingStatus());
          }}
          className="mt-4 px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  console.log('[WhatsAppSetupStep] Rendering main content. WhatsApp connected:', whatsappConnected);

  return (
    <div className="max-w-lg mx-auto p-8">
      <h2 className="text-2xl font-bold mb-4">{STEP_METADATA[ONBOARDING_STEPS.WHATSAPP].title}</h2>
      <p className="text-gray-300 mb-8">{STEP_METADATA[ONBOARDING_STEPS.WHATSAPP].description}</p>
      
      {whatsappConnected ? (
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
        <>
          {console.log('[WhatsAppSetupStep] Rendering WhatsAppBridgeSetup')}
        <WhatsAppBridgeSetup onComplete={handleComplete} />
        </>
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
        // Update onboarding step to complete with all necessary data
        await dispatch(updateOnboardingStep({ 
          step: 'complete',
          data: { 
            whatsappConnected: true,
            matrixConnected: true,
            isComplete: true,
            connectedPlatforms: ['matrix', 'whatsapp']
          }
        })).unwrap();
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
          const validStep = status.currentStep || ONBOARDING_STEPS.WELCOME;
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
      case ONBOARDING_STEPS.WELCOME:
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
