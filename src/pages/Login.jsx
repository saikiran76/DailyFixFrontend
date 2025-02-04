import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import { signIn } from '../store/slices/authSlice';
import { toast } from 'react-hot-toast';
import logger from '../utils/logger';

const Login = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { session, loading } = useSelector((state) => state.auth);
  const { isComplete } = useSelector((state) => state.onboarding);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [attempts, setAttempts] = useState(0);

  // Clear form error when inputs change
  useEffect(() => {
    if (formError) {
      setFormError(null);
    }
  }, [email, password]);

  useEffect(() => {
    if (session) {
      logger.info('[Login] Session found, checking onboarding status:', isComplete);
      if (isComplete) {
        navigate('/dashboard');
      } else {
        navigate('/onboarding');
      }
    }
  }, [session, isComplete, navigate]);

  const validateForm = () => {
    if (!email.trim()) {
      setFormError('Email is required');
      return false;
    }
    if (!email.includes('@')) {
      setFormError('Please enter a valid email address');
      return false;
    }
    if (!password) {
      setFormError('Password is required');
      return false;
    }
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Clear previous errors
    setFormError(null);

    // Validate form
    if (!validateForm()) {
      return;
    }

    try {
      setIsSubmitting(true);
      logger.info('[Login] Attempting sign in for:', email);
      
      // Show loading toast
      const loadingToast = toast.loading('Signing in...');
      
      // Dispatch sign in action
      const result = await dispatch(signIn({ email, password })).unwrap();
      
      logger.info('[Login] Sign in result:', {
        hasSession: !!result?.session,
        hasUser: !!result?.user
      });

      toast.dismiss(loadingToast);
      
      if (!result?.session) {
        throw new Error('Invalid credentials');
      }

      // Success toast
      toast.success('Successfully signed in!');
      
      // Navigation will be handled by the useEffect above

    } catch (error) {
      setAttempts(prev => prev + 1);
      logger.error('[Login] Sign in failed:', error);
      
      let errorMessage = 'Failed to sign in. Please try again.';
      
      if (error.message.includes('Invalid credentials') || error.message.includes('Invalid login')) {
        errorMessage = 'Invalid email or password. Please try again.';
      } else if (error.message.includes('network')) {
        errorMessage = 'Network error. Please check your connection.';
      }
      
      setFormError(errorMessage);
      toast.error(errorMessage);

      // If multiple failed attempts, show additional help
      if (attempts >= 2) {
        toast.error('Having trouble? Make sure you\'re using the correct email and password.', {
          duration: 5000
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <Link to="/signup" className="font-medium text-indigo-600 hover:text-indigo-500">
              create a new account
            </Link>
          </p>
        </div>

        {formError && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">{formError}</h3>
              </div>
            </div>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address" className="sr-only">
                Email address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className={`appearance-none rounded-none relative block w-full px-3 py-2 border ${
                  formError && !email ? 'border-red-300' : 'border-gray-300'
                } placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm`}
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className={`appearance-none rounded-none relative block w-full px-3 py-2 border ${
                  formError && !password ? 'border-red-300' : 'border-gray-300'
                } placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm`}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isSubmitting || loading}
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                (isSubmitting || loading) ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isSubmitting || loading ? (
                <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </span>
              ) : null}
              {isSubmitting || loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>

        {attempts >= 2 && (
          <div className="mt-4 text-sm text-gray-600">
            <p className="text-center">
              Forgot your password?{' '}
              <Link to="/reset-password" className="font-medium text-indigo-600 hover:text-indigo-500">
                Reset it here
              </Link>
            </p>
          </div>
        )}

        <div className="mt-3">
          <p className="text-center text-gray-600 text-sm">
            Don't have an account?{' '}
            <Link to="/signup" className="font-medium text-indigo-600 hover:text-indigo-500">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
