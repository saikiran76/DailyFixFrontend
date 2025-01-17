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
import io from 'socket.io-client';
import api from './utils/api';

const ProtectedRoute = ({ children }) => {
  const { session, onboardingStatus } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleNavigation = async () => {
      if (!session) {
        console.log('No session, redirecting to login');
        navigate('/login', { replace: true });
        return;
      }

      // If we're already on the dashboard, don't do any redirects
      if (location.pathname === '/dashboard') {
        return;
      }

      try {
        // Check if WhatsApp is already connected
        const response = await api.get('/matrix/whatsapp/status');
        const isWhatsAppConnected = response.data?.status === 'connected';

        // If WhatsApp is connected or onboarding is complete -> dashboard
        if (isWhatsAppConnected || onboardingStatus?.isComplete) {
          console.log('WhatsApp connected/Onboarding complete, navigating to dashboard');
          navigate('/dashboard', { replace: true });
          return;
        }

        // Handle incomplete onboarding
        if (!onboardingStatus?.isComplete) {
          const currentStep = onboardingStatus?.currentStep || 'welcome';
          
          // If we're already in the correct onboarding step, don't redirect
          if (location.pathname === `/onboarding/${currentStep}`) {
            return;
          }

          // If Matrix not connected, only allow initial steps
          const isInitialStep = ['/welcome', '/protocol_selection', '/matrix_setup']
            .some(step => location.pathname.includes(step));
          
          if (!onboardingStatus.matrixConnected && !isInitialStep) {
            console.log('Matrix not connected, redirecting to setup');
            navigate('/onboarding/matrix_setup', { replace: true });
            return;
          }

          // If not in onboarding flow, redirect to current step
          if (!location.pathname.includes('/onboarding')) {
            console.log('Redirecting to current onboarding step:', currentStep);
            navigate(`/onboarding/${currentStep}`, { replace: true });
          }
        }
      } catch (error) {
        console.error('Error checking WhatsApp status:', error);
      }
    };

    handleNavigation();
  }, [session, onboardingStatus, location.pathname]);

  // Listen for WhatsApp connection status
  useEffect(() => {
    const socket = io(process.env.REACT_APP_API_URL || 'http://localhost:3001');

    socket.on('whatsapp_status', (data) => {
      if (data.status === 'connected') {
        console.log('WhatsApp connected via socket, navigating to dashboard');
        navigate('/dashboard', { replace: true });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [navigate]);

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
