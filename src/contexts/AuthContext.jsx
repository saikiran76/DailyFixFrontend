import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { AppError, ErrorTypes, handleError } from '../utils/errorHandler';
import api from '../utils/axios';

// Initialize Supabase client
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

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

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onboardingStatus, setOnboardingStatus] = useState({
    isComplete: false,
    currentStep: ONBOARDING_STEPS.WELCOME,
    matrixConnected: false,
    connectedPlatforms: []
  });

  const checkOnboardingStatus = useCallback(async (currentSession) => {
    try {
      const { data: onboarding } = await supabase
        .from('user_onboarding')
        .select('current_step, is_complete')
        .eq('user_id', currentSession.user.id)
        .single();

      // Check Matrix connection status
      const { data: matrixAccount } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', currentSession.user.id)
        .eq('platform', 'matrix')
        .single();
      
      setOnboardingStatus({
        isComplete: onboarding?.is_complete || false,
        currentStep: onboarding?.current_step || ONBOARDING_STEPS.WELCOME,
        matrixConnected: !!matrixAccount,
        connectedPlatforms: []
      });
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      setOnboardingStatus({
        isComplete: false,
        currentStep: ONBOARDING_STEPS.WELCOME,
        matrixConnected: false,
        connectedPlatforms: []
      });
    }
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      try {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);

        if (session) {
          // Check onboarding status
          const { data: onboarding } = await supabase
            .from('user_onboarding')
            .select('current_step, is_complete')
            .eq('user_id', session.user.id)
            .single();

          if (!onboarding) {
            // Create initial onboarding record
            await supabase.from('user_onboarding').insert({
              user_id: session.user.id,
              current_step: ONBOARDING_STEPS.WELCOME,
              is_complete: false
            });
            setOnboardingStatus({ 
              currentStep: ONBOARDING_STEPS.WELCOME, 
              isComplete: false,
              matrixConnected: false,
              connectedPlatforms: []
            });
          } else {
            setOnboardingStatus({
              currentStep: onboarding.current_step,
              isComplete: onboarding.is_complete,
              matrixConnected: false,
              connectedPlatforms: []
            });
          }
        }
      } catch (error) {
        console.error('Session check error:', error);
        setSession(null);
        setOnboardingStatus({
          isComplete: false,
          currentStep: ONBOARDING_STEPS.WELCOME,
          matrixConnected: false,
          connectedPlatforms: []
        });
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session);
      setSession(session);

      if (session) {
        try {
          const { data: onboarding } = await supabase
            .from('user_onboarding')
            .select('current_step, is_complete')
            .eq('user_id', session.user.id)
            .single();

          if (!onboarding) {
            await supabase.from('user_onboarding').insert({
              user_id: session.user.id,
              current_step: ONBOARDING_STEPS.WELCOME,
              is_complete: false
            });
            setOnboardingStatus({
              currentStep: ONBOARDING_STEPS.WELCOME,
              isComplete: false,
              matrixConnected: false,
              connectedPlatforms: []
            });
          } else {
            setOnboardingStatus({
              currentStep: onboarding.current_step,
              isComplete: onboarding.is_complete,
              matrixConnected: false,
              connectedPlatforms: []
            });
          }
        } catch (error) {
          console.error('Error checking onboarding status:', error);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw new AppError(ErrorTypes.AUTH, error.message);
      
      // Set session after successful login
      setSession(data.session);

      // Check onboarding status for the new session
      if (data.session) {
        const { data: onboarding } = await supabase
          .from('user_onboarding')
          .select('current_step, is_complete')
          .eq('user_id', data.session.user.id)
          .single();

        // Check Matrix connection status
        const { data: matrixAccount } = await supabase
          .from('accounts')
          .select('*')
          .eq('user_id', data.session.user.id)
          .eq('platform', 'matrix')
          .single();

        if (!onboarding) {
          // Create initial onboarding record
          await supabase.from('user_onboarding').insert({
            user_id: data.session.user.id,
            current_step: ONBOARDING_STEPS.WELCOME,
            is_complete: false
          });
          setOnboardingStatus({
            currentStep: ONBOARDING_STEPS.WELCOME,
            isComplete: false,
            matrixConnected: false,
            connectedPlatforms: []
          });
        } else {
          setOnboardingStatus({
            currentStep: onboarding.current_step,
            isComplete: onboarding.is_complete,
            matrixConnected: !!matrixAccount,
            connectedPlatforms: matrixAccount ? ['matrix'] : []
          });
        }
      }

      return data;
    } catch (error) {
      console.error('Sign in error:', error);
      throw new AppError(ErrorTypes.AUTH, error.message);
    }
  };

  const signUp = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw new AppError(ErrorTypes.AUTH, error.message);
      return data;
    } catch (error) {
      throw new AppError(ErrorTypes.AUTH, error.message);
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw new AppError(ErrorTypes.AUTH, error.message);
      setSession(null);
      setOnboardingStatus({
        isComplete: false,
        currentStep: 'welcome',
        matrixConnected: false,
        connectedPlatforms: []
      });
    } catch (error) {
      throw new AppError(ErrorTypes.AUTH, error.message);
    }
  };

  const updateOnboardingStep = async (step) => {
    try {
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      await api.post('/user/onboarding-status', {
        currentStep: step
      }, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      
      setOnboardingStatus(prev => ({
        ...prev,
        currentStep: step
      }));
    } catch (error) {
      handleError(error, { context: 'updateOnboardingStep' });
    }
  };

  const value = {
    session,
    loading,
    onboardingStatus,
    signIn,
    signUp,
    signOut,
    updateOnboardingStep,
    checkOnboardingStatus
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}; 