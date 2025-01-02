import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { AppError, ErrorTypes, handleError } from '../utils/errorHandler';
import api from '../utils/axios';

// Initialize Supabase client
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

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
    currentStep: 'welcome',
    matrixConnected: false,
    connectedPlatforms: []
  });

  const checkOnboardingStatus = useCallback(async (currentSession) => {
    try {
      const { data } = await api.get('/user/onboarding-status', {
        headers: { Authorization: `Bearer ${currentSession.access_token}` }
      });
      
      setOnboardingStatus({
        isComplete: data.isComplete,
        currentStep: data.currentStep,
        matrixConnected: data.matrixConnected,
        connectedPlatforms: data.connectedPlatforms || []
      });
    } catch (error) {
      handleError(error, { context: 'checkOnboardingStatus' });
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        // Get initial session
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        
        if (mounted) {
          setSession(initialSession);
          if (initialSession) {
            await checkOnboardingStatus(initialSession);
          }
          setLoading(false);
        }

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
          if (mounted) {
            setSession(newSession);
            if (newSession) {
              await checkOnboardingStatus(newSession);
            } else {
              setOnboardingStatus({
                isComplete: false,
                currentStep: 'welcome',
                matrixConnected: false,
                connectedPlatforms: []
              });
            }
          }
        });

        return () => {
          mounted = false;
          subscription?.unsubscribe();
        };
      } catch (error) {
        console.error('Error initializing auth:', error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();
  }, [checkOnboardingStatus]);

  const signIn = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw new AppError(ErrorTypes.AUTH, error.message);
      return data;
    } catch (error) {
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