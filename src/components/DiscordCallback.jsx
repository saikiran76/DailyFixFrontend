import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { updateOnboardingStep } from '../store/slices/onboardingSlice';

const DiscordCallback = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { currentStep } = useSelector(state => state.onboarding);

  useEffect(() => {
    const handleCallback = async () => {
      // Handle Discord callback logic here
      await dispatch(updateOnboardingStep('whatsapp_setup')); 
      navigate('/onboarding');
    };

    handleCallback();
  }, [dispatch, navigate]);

  return <div>Processing Discord callback...</div>;
};

export default DiscordCallback; 