import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { handleError, ErrorTypes, AppError } from '../utils/errorHandler';
import api from '../utils/axios';
import { toast } from 'react-hot-toast';
import ProtocolSelection from '../components/ProtocolSelection';

// Onboarding steps configuration
const ONBOARDING_STEPS = {
  WELCOME: 'welcome',
  PROTOCOL_SELECTION: 'protocol_selection',
  MATRIX_SETUP: 'matrix_setup',
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
      return ONBOARDING_STEPS.PLATFORM_SELECTION;
    case ONBOARDING_STEPS.MATRIX_SETUP:
      return ONBOARDING_STEPS.PROTOCOL_SELECTION;
    case ONBOARDING_STEPS.PLATFORM_SELECTION:
      return ONBOARDING_STEPS.COMPLETION;
    default:
      return ONBOARDING_STEPS.WELCOME;
  }
};

// Default Matrix homeserver URL
const DEFAULT_MATRIX_HOMESERVER = 'http://13.48.71.200:8008';
const MATRIX_SERVER_DOMAIN = 'example-mtbr.duckdns.org';

// Step components
const WelcomeStep = ({ onNext }) => {
  const navigate = useNavigate();
  const { updateOnboardingStep } = useAuth();

  const handleNext = async () => {
    try {
      const nextStep = getNextStep(ONBOARDING_STEPS.WELCOME);
      await updateOnboardingStep(nextStep);
      navigate(`/onboarding/${nextStep}`);
    } catch (error) {
      console.error('Error in welcome step:', error);
      toast.error('Failed to proceed. Please try again.');
    }
  };

  return (
    <div className="max-w-lg mx-auto text-center p-8">
      <h1 className="text-3xl font-bold mb-4">Welcome to Daily Fix</h1>
      <p className="text-gray-300 mb-8">
        Your centralized messaging hub. Let's get you set up in just a few steps.
      </p>
      <button
        onClick={handleNext}
        className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary/80 transition-colors"
      >
        Get Started
      </button>
    </div>
  );
};

const MatrixSetupStep = ({ onNext }) => {
  const navigate = useNavigate();
  const { updateOnboardingStep } = useAuth();

  const handleBack = async () => {
    try {
      await updateOnboardingStep('protocol_selection');
      navigate('/onboarding/protocol-selection');
    } catch (error) {
      console.error('Error updating onboarding step:', error);
      toast.error('Failed to go back. Please try again.');
    }
  };

  return (
    <div className="max-w-md mx-auto p-8 text-center">
      <div className="bg-yellow-500/20 text-yellow-500 p-4 rounded-lg mb-6">
        Under Maintenance
      </div>
      
      <h2 className="text-2xl font-bold mb-6 text-white">Matrix Protocol Integration</h2>
      
      <p className="text-gray-400 mb-8">
        The Matrix protocol integration is currently under development. 
        Please use the Direct API Connection option for now.
      </p>

      <button
        onClick={handleBack}
        className="bg-gray-700 text-white px-6 py-2 rounded-lg hover:bg-gray-600 transition-colors"
      >
        Go Back
      </button>
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

  useEffect(() => {
    if (!session) {
      navigate('/login');
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
      navigate(`/onboarding/${validStep}`);
    }
  }, [session, location.pathname, onboardingStatus]);

  const renderStep = () => {
    switch (currentStep) {
      case ONBOARDING_STEPS.WELCOME:
        return <WelcomeStep />;
      case ONBOARDING_STEPS.PROTOCOL_SELECTION:
        return <ProtocolSelection onNext={async (nextStep) => {
          await updateOnboardingStep(nextStep);
          navigate(`/onboarding/${nextStep}`);
        }} />;
      case ONBOARDING_STEPS.MATRIX_SETUP:
        return <MatrixSetupStep />;
      case ONBOARDING_STEPS.PLATFORM_SELECTION:
        return <PlatformSelectionStep />;
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
