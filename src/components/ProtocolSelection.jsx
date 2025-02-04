import React from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { updateOnboardingStep, ONBOARDING_STEPS, ONBOARDING_ROUTES, PLATFORMS } from '../store/slices/onboardingSlice';
import { toast } from 'react-hot-toast';
import logger from '../utils/logger';

const ProtocolSelection = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const handleMatrixSelection = async () => {
    try {
      logger.info('[ProtocolSelection] Selected Matrix protocol');
      
      // Validate Matrix server availability first
      try {
        const response = await fetch('https://example-mtbr.duckdns.org/_matrix/client/versions');
        if (!response.ok) {
          throw new Error('Matrix server is not responding. Please try again later.');
        }
      } catch (error) {
        logger.error('[ProtocolSelection] Matrix server check failed:', error);
        toast.error('Unable to connect to Matrix server. Please check your internet connection and try again.');
        return;
      }

      await dispatch(updateOnboardingStep({ 
        step: ONBOARDING_STEPS.MATRIX,
        data: { selectedProtocol: PLATFORMS.MATRIX.id }
      })).unwrap();
      
      navigate(ONBOARDING_ROUTES.MATRIX);
    } catch (error) {
      logger.error('[ProtocolSelection] Error updating onboarding step:', error);
      const errorMessage = error.response?.data?.message || 
                          error.message || 
                          'Failed to proceed. Please try again.';
      toast.error(errorMessage);
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
            <div className="absolute top-4 right-4 bg-green-500/20 text-green-500 px-3 py-1 rounded-full text-sm">
              Available and Recommended
            </div>
            
            <h3 className="text-xl font-semibold text-gray-400 mb-2 flex items-center">
              <span className="text-2xl mr-3">🔐</span>
              Matrix Protocol
              <span className="ml-2 text-sm font-normal">(Enterprise Grade)</span>
            </h3>
            
            <p className="text-gray-500 text-sm">
              Connect using the decentralized Matrix protocol for enhanced security and interoperability.
              Required for WhatsApp integration.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="px-2 py-1 bg-dark rounded text-xs text-green-400">Matrix</span>
              <span className="px-2 py-1 bg-dark rounded text-xs text-green-400">WhatsApp</span>
              <span className="px-2 py-1 bg-dark rounded text-xs text-gray-400 opacity-50">Telegram (Coming Soon)</span>
              <span className="px-2 py-1 bg-dark rounded text-xs text-gray-400 opacity-50">Discord (Coming Soon)</span>
            </div>
          </button>
        </div>

        {/* Direct API Option - Disabled */}
        <div className="relative opacity-50">
          <button
            disabled
            className="w-full p-6 border border-gray-700 rounded-lg bg-dark-lighter text-left cursor-not-allowed"
          >
            <div className="absolute top-4 right-4 bg-yellow-500/20 text-yellow-500 px-3 py-1 rounded-full text-sm">
              Coming Soon
            </div>
            
            <h3 className="text-xl font-semibold text-gray-400 mb-2 flex items-center">
              <span className="text-2xl mr-3">⚡</span>
              Direct API Connection
              <span className="ml-2 text-sm font-normal">(Limited Access)</span>
            </h3>
            
            <p className="text-gray-500 text-sm">
              Connect directly to messaging platforms using their official APIs.
              Limited functionality, no access to messages or contacts.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="px-2 py-1 bg-dark rounded text-xs text-gray-400">Discord</span>
            </div>
          </button>
        </div>
      </div>

      <div className="mt-8 text-center">
        <p className="text-sm text-gray-500">
          Matrix Protocol is required for full functionality including WhatsApp integration.
          Direct API connections will be available in future updates.
        </p>
      </div>
    </div>
  );
};

export default ProtocolSelection; 