import React from 'react';
import { useDispatch } from 'react-redux';
import { updateOnboardingStep } from '../store/slices/onboardingSlice';

const ProtocolSelection = () => {
  const dispatch = useDispatch();

  const handleProtocolSelect = async (protocol) => {
    await dispatch(updateOnboardingStep(protocol === 'discord' ? 'discord_setup' : 'whatsapp_setup'));
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-6 text-center">Select Your Protocol</h2>
        <div className="flex gap-4">
          <button
            onClick={() => handleProtocolSelect('whatsapp')}
            className="px-6 py-3 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
          >
            WhatsApp
          </button>
          <button
            onClick={() => handleProtocolSelect('discord')}
            className="px-6 py-3 bg-indigo-500 text-white rounded hover:bg-indigo-600 transition-colors"
          >
            Discord
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProtocolSelection; 