import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { toast } from 'react-hot-toast';
import { fetchOnboardingStatus } from '../../store/slices/onboardingSlice';

const CompletionStep = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { session } = useSelector(state => state.auth);
  const { matrixConnected, whatsappConnected } = useSelector(state => state.onboarding);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        // Verify onboarding status one last time
        const status = await dispatch(fetchOnboardingStatus()).unwrap();
        
        if (!status.matrixConnected || !status.whatsappConnected) {
          // If either platform is not connected, redirect back to the appropriate step
          const nextStep = !status.whatsappConnected ? 'whatsapp' : 'matrix';
          navigate(`/onboarding/${nextStep}`, { replace: true });
          return;
        }

        // Show success message and redirect to main app after a delay
        toast.success('Setup completed successfully!');
        setTimeout(() => {
          navigate('/app', { replace: true });
        }, 3000);
      } catch (error) {
        console.error('Error checking completion status:', error);
        toast.error('Failed to verify setup completion');
      }
    };

    checkStatus();
  }, [dispatch, navigate, session]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <div className="text-6xl mb-8">🎉</div>
      <h1 className="text-3xl font-bold mb-4">All Set!</h1>
      <p className="text-gray-400 mb-8 text-center max-w-md">
        Your Daily Fix account is now connected to both WhatsApp and Matrix.
        You'll be redirected to the main app in a moment.
      </p>
      <div className="flex flex-col items-center space-y-4">
        <div className="flex items-center space-x-2 text-green-500">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span>WhatsApp Connected</span>
        </div>
        <div className="flex items-center space-x-2 text-green-500">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span>Matrix Connected</span>
        </div>
      </div>
    </div>
  );
};

export default CompletionStep; 