import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import WhatsAppConnection from './components/WhatsAppConnection';
import TelegramConnection from './components/TelegramConnection';
import DiscordConnection from './components/DiscordConnection';
import DiscordCallback from './components/DiscordCallback';
import DiscordView from './components/discord/DiscordView';
import MainEntitiesView from './components/discord/MainEntitiesView';
import ServerDetailsView from './components/discord/ServerDetailsView';
import ReportGenerationView from './components/discord/ReportGenerationView';
import './App.css';

const ProtectedRoute = ({ children }) => {
  const { session, onboardingStatus } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!session) {
      navigate('/login', { replace: true });
      return;
    }

    // Check if user needs to complete onboarding
    if (!onboardingStatus?.isComplete) {
      // If not in onboarding flow, redirect to current step
      if (!location.pathname.includes('/onboarding')) {
        const currentStep = onboardingStatus?.currentStep || 'welcome';
        navigate(`/onboarding/${currentStep}`, { replace: true });
        return;
      }
      
      // If in Matrix setup but Matrix is not connected
      if (location.pathname.includes('matrix_setup') && !onboardingStatus.matrixConnected) {
        return; // Allow access to Matrix setup
      }
      
      // If Matrix is not connected and trying to access other onboarding steps
      if (!onboardingStatus.matrixConnected && 
          !location.pathname.includes('welcome') && 
          !location.pathname.includes('protocol_selection') &&
          !location.pathname.includes('matrix_setup')) {
        navigate('/onboarding/matrix_setup', { replace: true });
        return;
      }
    }

    // If user is trying to access onboarding pages but has completed onboarding
    if (onboardingStatus?.isComplete && location.pathname.includes('/onboarding')) {
      navigate('/dashboard', { replace: true });
      return;
    }
  }, [session, onboardingStatus, location.pathname, navigate]);

  if (!session) return null;
  return children;
};

const AppRoutes = () => {
  const { session, loading, onboardingStatus } = useAuth();
  const location = useLocation();

  // Show loading spinner while initializing
  if (loading) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If not logged in, only show login route and OAuth callback
  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/oauth/discord/callback" element={<DiscordCallback />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // If logged in but onboarding not complete, ensure proper routing
  if (!onboardingStatus?.isComplete) {
    // Allow OAuth callback and onboarding routes
    if (location.pathname.startsWith('/oauth/discord/callback') ||
        location.pathname.startsWith('/onboarding')) {
      return (
        <Routes>
          <Route path="/oauth/discord/callback" element={<DiscordCallback />} />
          <Route path="/onboarding/*" element={<Onboarding />} />
          <Route path="*" element={<Navigate to={`/onboarding/${onboardingStatus?.currentStep || 'welcome'}`} replace />} />
        </Routes>
      );
    }
    // Redirect to current onboarding step
    return <Navigate to={`/onboarding/${onboardingStatus?.currentStep || 'welcome'}`} replace />;
  }

  // Main app routes for authenticated and onboarded users
  return (
    <Routes>
      <Route path="/oauth/discord/callback" element={<DiscordCallback />} />
      <Route path="/dashboard" element={<Dashboard />}>
        <Route index element={<Navigate to="discord" replace />} />
        <Route path="discord" element={<DiscordView />}>
          <Route index element={<MainEntitiesView />} />
          <Route path="servers/:serverId" element={<ServerDetailsView />} />
          <Route path="servers/:serverId/report" element={<ReportGenerationView />} />
        </Route>
      </Route>
      <Route path="/onboarding/*" element={<Onboarding />} />
      <Route path="/connect/discord" element={<DiscordConnection />} />
      <Route path="/connect/telegram" element={<TelegramConnection />} />
      <Route path="/connect/whatsapp" element={<WhatsAppConnection />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

const App = () => {
  return (
    <Router>
      <AuthProvider>
        <Toaster position="top-right" />
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
};

export default App;
