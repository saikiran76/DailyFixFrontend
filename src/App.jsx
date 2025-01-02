import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" />;
  }

  return children;
};

const AppRoutes = () => {
  const { session, loading, onboardingStatus } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If not logged in, only show login route
  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/oauth/discord/callback" element={<DiscordCallback />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // If logged in but onboarding not complete, redirect to onboarding
  if (!onboardingStatus.isComplete && 
      !window.location.pathname.startsWith('/onboarding') && 
      !window.location.pathname.startsWith('/oauth/discord/callback')) {
    return <Navigate to="/onboarding" replace />;
  }

  // Main app routes for authenticated users
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
