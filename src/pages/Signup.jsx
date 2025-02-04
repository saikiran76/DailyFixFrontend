// frontend/src/pages/Signup.jsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import supabase from '../utils/supabase';
import api from '../utils/api';
import '../styles/Login.css';
import logger from '../utils/logger';
import { updateSession } from '../store/slices/authSlice';
import { toast } from 'react-toastify';

const Signup = () => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      logger.info('[Signup] Attempting signup with email:', email);
      
      // Sign up with Supabase
      const { data, signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName
          }
        }
      });

      logger.info('[Signup] Supabase response:', { 
        hasData: !!data,
        hasUser: !!data?.user,
        hasSession: !!data?.session,
        error: signUpError
      });

      if (signUpError) throw signUpError;

      // Check if email confirmation is required
      if (data?.user?.identities?.length === 0) {
        logger.info('[Signup] Email confirmation required');
        toast.info('Email verification required! Please check your inbox.');
        setError('Please check your email inbox to verify your account. Redirecting to login...');
        setTimeout(() => {
          navigate('/login');
        }, 5500);
        return;
      }

      if (data?.user && data?.session) {
        logger.info('[Signup] Signup successful, storing session');
        
        // Store complete session in Redux
        dispatch(updateSession({ session: data.session }));
        
        // Store auth data in localStorage
        const authData = {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at
        };
        localStorage.setItem('dailyfix_auth', JSON.stringify(authData));
        
        // Update API headers
        api.defaults.headers.common['Authorization'] = `Bearer ${data.session.access_token}`;
        
        logger.info('[Signup] Session stored, navigating to onboarding');
        navigate('/onboarding');
      } else {
        logger.error('[Signup] Missing session data:', {
          user: data?.user,
          session: data?.session,
          identities: data?.user?.identities
        });
        throw new Error('Signup successful but waiting for email confirmation. Please check your email.');
      }
    } catch (error) {
      logger.error('[Signup] Error during signup:', error);
      setError(error.message || 'Signup failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark">
      <div className="max-w-md w-full bg-dark-lighter p-8 rounded-lg shadow-lg">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">Sign Up</h2>
        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-500 p-3 rounded mb-4">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              placeholder="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full p-3 bg-dark border border-gray-700 rounded text-white"
              required
            />
          </div>
          <div>
            <input
              type="text"
              placeholder="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full p-3 bg-dark border border-gray-700 rounded text-white"
              required
            />
          </div>
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 bg-dark border border-gray-700 rounded text-white"
              required
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 bg-dark border border-gray-700 rounded text-white"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full p-3 bg-primary text-white rounded hover:bg-primary/80 disabled:opacity-50"
          >
            {isLoading ? 'Signing up...' : 'Sign Up'}
          </button>
        </form>
        <p className="text-center text-gray-400 mt-4">
          Already have an account? <Link to="/login" className="text-primary hover:text-primary/80">Login</Link>
        </p>
      </div>
    </div>
  );
};

export default Signup;
