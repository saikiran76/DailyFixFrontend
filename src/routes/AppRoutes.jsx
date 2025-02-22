import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Login from '../pages/Login';
import Signup from '../pages/Signup';
import Dashboard from '../pages/Dashboard';
import Onboarding from '../pages/Onboarding';
import { ForgotPassword } from '../pages/Signup';
import ResetPassword from '../pages/ResetPassword';
import logger from '../utils/logger';

const AppRoutes = () => {
  const { session } = useSelector(state => state.auth);
  const { matrixConnected, whatsappConnected, isComplete, currentStep } = useSelector(state => state.onboarding);

  // Helper function to determine where to redirect after login/signup
  const getPostAuthRedirect = () => {
    // If onboarding is complete or both platforms are connected, go to dashboard
    if (isComplete && (matrixConnected && whatsappConnected)) {
      logger.info('[AppRoutes] Redirecting to dashboard - onboarding complete');
      return '/dashboard';
    }

    // If in the middle of onboarding, go to current step
    if (currentStep) {
      logger.info('[AppRoutes] Redirecting to current onboarding step:', currentStep);
      return `/onboarding/${currentStep}`;
    }

    // Otherwise start onboarding
    logger.info('[AppRoutes] Starting new onboarding');
    return '/onboarding/initial';
  };

  return (
    <Routes>
      {/* Public Routes */}
      <Route 
        path="/login" 
        element={
          session ? <Navigate to={getPostAuthRedirect()} replace /> : <Login />
        } 
      />
      
      <Route 
        path="/signup" 
        element={
          session ? <Navigate to={getPostAuthRedirect()} replace /> : <Signup />
        } 
      />

      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Protected Routes */}
      <Route
        path="/dashboard"
        element={
          !session ? (
            <Navigate to="/login" replace />
          ) : !isComplete && (!matrixConnected || !whatsappConnected) ? (
            <Navigate to={getPostAuthRedirect()} replace />
          ) : (
            <Dashboard />
          )
        }
      />

      {/* Onboarding Routes */}
      <Route
        path="/onboarding"
        element={
          !session ? (
            <Navigate to="/login" replace />
          ) : isComplete || (matrixConnected && whatsappConnected) ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Navigate to={getPostAuthRedirect()} replace />
          )
        }
      />

      <Route
        path="/onboarding/:step"
        element={
          !session ? (
            <Navigate to="/login" replace />
          ) : isComplete || (matrixConnected && whatsappConnected) ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Onboarding />
          )
        }
      />

      {/* Default Route */}
      <Route 
        path="*" 
        element={<Navigate to={session ? getPostAuthRedirect() : "/login"} replace />} 
      />
    </Routes>
  );
};

export default AppRoutes; 