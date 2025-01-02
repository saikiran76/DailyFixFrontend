import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';

const Login = () => {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const auth = useAuth();
  console.log('Auth context in Login:', auth); // Debug log
  
  const { signIn, signUp, session, onboardingStatus } = auth;

  useEffect(() => {
    console.log('Session changed:', session); // Debug log
    console.log('Onboarding status:', onboardingStatus); // Debug log
    
    if (session) {
      if (!onboardingStatus.isComplete) {
        navigate('/onboarding');
      } else {
        navigate('/dashboard');
      }
    }
  }, [session, onboardingStatus, navigate]);

  const handleAuth = async (e) => {
    e.preventDefault();
    if (isLoading) return;
    
    setIsLoading(true);
    try {
      console.log('Starting auth process...', { isSignUp }); // Debug log
      
      if (isSignUp) {
        console.log('Attempting signup...'); // Debug log
        const { user } = await signUp(email, password);
        console.log('Signup result:', user); // Debug log
        
        if (user?.identities?.length === 0) {
          toast.success('Please check your email to verify your account');
          setIsSignUp(false);
        }
      } else {
        console.log('Attempting signin...'); // Debug log
        await signIn(email, password);
        console.log('Signin successful'); // Debug log
        // Navigation is handled by the useEffect above
      }
    } catch (error) {
      console.error('Authentication error:', error);
      toast.error(error.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8 bg-dark-lighter p-8 rounded-lg">
        <h2 className="text-2xl font-bold text-center text-white">
          {isSignUp ? 'Create Account' : 'Welcome Back'}
        </h2>
        
        <form onSubmit={handleAuth} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-400 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 rounded bg-dark border border-gray-700 text-white"
              placeholder="Enter your email"
              required
              disabled={isLoading}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-400 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 rounded bg-dark border border-gray-700 text-white"
              placeholder="Enter your password"
              required
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full p-3 bg-primary text-white rounded hover:bg-primary/80 transition-colors disabled:opacity-50 flex items-center justify-center"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </>
            ) : (
              isSignUp ? 'Create Account' : 'Sign In'
            )}
          </button>
        </form>

        <button
          onClick={() => setIsSignUp(!isSignUp)}
          className="w-full text-center text-gray-400 hover:text-white"
          disabled={isLoading}
        >
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </button>
      </div>
    </div>
  );
};

export default Login;
