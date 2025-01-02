import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';

const ProtocolSelection = ({ onNext, onDirectSelect }) => {
  const navigate = useNavigate();
  const { updateOnboardingStep } = useAuth();

  const handleMatrixSelection = async () => {
    try {
      await updateOnboardingStep('matrix_setup');
      toast.error('Matrix Protocol integration is currently under maintenance. Please use Direct API Connection for now.');
      navigate('/onboarding/matrix-setup');
    } catch (error) {
      console.error('Error updating onboarding step:', error);
      toast.error('Failed to proceed. Please try again.');
    }
  };

  const handleDirectSelection = async () => {
    try {
      await updateOnboardingStep('platform_selection');
      navigate('/onboarding/platform-selection');
    } catch (error) {
      console.error('Error updating onboarding step:', error);
      toast.error('Failed to proceed. Please try again.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h2 className="text-2xl font-bold mb-6 text-center text-white">
        Choose Your Connection Protocol
      </h2>
      
      <div className="space-y-6">
        {/* Matrix Protocol Option */}
        <div className="relative">
          <button
            onClick={handleMatrixSelection}
            className="w-full p-6 border border-gray-700 rounded-lg bg-dark-lighter hover:bg-dark/50 transition-colors text-left relative group"
          >
            <div className="absolute top-4 right-4 bg-yellow-500/20 text-yellow-500 px-3 py-1 rounded-full text-sm">
              Under Maintenance
            </div>
            
            <h3 className="text-xl font-semibold text-gray-400 mb-2 flex items-center">
              <span className="text-2xl mr-3">🔐</span>
              Matrix Protocol
              <span className="ml-2 text-sm font-normal">(Enterprise Grade)</span>
            </h3>
            
            <p className="text-gray-500 text-sm">
              Connect using the decentralized Matrix protocol for enhanced security and interoperability.
              Currently under maintenance.
            </p>
          </button>
        </div>

        {/* Direct API Option */}
        <div className="relative">
          <button
            onClick={handleDirectSelection}
            className="w-full p-6 border border-primary rounded-lg bg-dark-lighter hover:bg-primary/10 transition-colors text-left group"
          >
            <div className="absolute top-4 right-4 bg-green-500/20 text-green-500 px-3 py-1 rounded-full text-sm">
              Recommended
            </div>
            
            <h3 className="text-xl font-semibold text-white mb-2 flex items-center">
              <span className="text-2xl mr-3">⚡</span>
              Direct API Connection
              <span className="ml-2 text-sm font-normal">(Fast & Reliable)</span>
            </h3>
            
            <p className="text-gray-400 text-sm">
              Connect directly to messaging platforms using their official APIs.
              Recommended for immediate deployment.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="px-2 py-1 bg-dark rounded text-xs text-gray-400">WhatsApp</span>
              <span className="px-2 py-1 bg-dark rounded text-xs text-gray-400">Telegram</span>
              <span className="px-2 py-1 bg-dark rounded text-xs text-gray-400">Slack</span>
              <span className="px-2 py-1 bg-dark rounded text-xs text-gray-400">Discord</span>
            </div>
          </button>
        </div>
      </div>

      <div className="mt-8 text-center">
        <p className="text-sm text-gray-500">
          Both options provide seamless integration with your favorite messaging platforms.
          Choose Direct API Connection for immediate access.
        </p>
      </div>
    </div>
  );
};

export default ProtocolSelection; 