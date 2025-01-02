import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatformConnection } from '../hooks/usePlatformConnection';
import { toast } from 'react-hot-toast';

const TelegramConnection = () => {
  const navigate = useNavigate();
  const {
    status,
    error,
    connect,
    finalize,
    isSocketConnected,
    retry,
    cleanup
  } = usePlatformConnection('telegram');

  const [botToken, setBotToken] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    // Initialize connection
    connect();

    // Only cleanup on unmount if we're not in the middle of connecting
    return () => {
      if (!isSubmitting) {
        cleanup();
      }
    };
  }, []);

  const handleTokenSubmit = async (e) => {
    e.preventDefault();
    
    if (!botToken?.trim()) {
      toast.error('Please enter a bot token');
      return;
    }

    // Basic token format validation
    if (!botToken.match(/^\d+:[A-Za-z0-9_-]{35}$/)) {
      toast.error('Invalid token format. Please check your token and try again.');
      return;
    }
    
    try {
      setIsSubmitting(true);
      const success = await finalize({ token: botToken.trim() });
      if (success) {
        toast.success('Telegram connected successfully!');
        navigate('/dashboard');
      } else {
        throw new Error('Failed to connect Telegram bot');
      }
    } catch (error) {
      console.error('Error connecting Telegram:', error);
      const errorMessage = error.response?.data?.message || error.message;
      
      // Handle specific error cases
      if (errorMessage.includes('in progress')) {
        toast.error('Another connection attempt is in progress. Please wait a moment.');
      } else if (errorMessage.includes('timeout')) {
        toast.error('Connection timed out. Please try again.');
      } else if (errorMessage.includes('Invalid token')) {
        toast.error('Invalid bot token. Please check if you copied the correct token from BotFather.');
      } else {
        toast.error(errorMessage || 'Failed to connect Telegram');
      }

      // If it's a timeout or operation in progress error, automatically retry after a delay
      if (errorMessage.includes('timeout') || errorMessage.includes('in progress')) {
        setTimeout(() => {
          retry();
        }, 2000);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle connection errors with retry option
  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Connection Error</h2>
          <p className="text-gray-700 mb-4">{error?.message || 'Failed to connect to Telegram'}</p>
          <div className="space-y-4">
            <button
              onClick={retry}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full bg-gray-600 text-white py-2 px-4 rounded hover:bg-gray-700 transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Connect Telegram</h2>
        
        {status === 'initializing' && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-700">Establishing connection...</p>
            {!isSocketConnected && (
              <p className="text-sm text-gray-500 mt-2">
                Attempting to establish real-time connection...
              </p>
            )}
          </div>
        )}

        {(status === 'pending' || status === 'connecting') && (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Follow these steps:</h3>
              <ol className="list-decimal list-inside space-y-3 text-gray-600">
                <li>Open Telegram and search for @BotFather</li>
                <li>Send /newbot to create a new bot</li>
                <li>Follow BotFather's instructions to set up your bot</li>
                <li>Copy the API token provided by BotFather</li>
                <li>Paste the token below to connect your bot</li>
              </ol>
            </div>

            <form onSubmit={handleTokenSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bot Token:
                </label>
                <input
                  type="text"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your bot token"
                  required
                  disabled={isSubmitting}
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting || !botToken}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Connecting...' : 'Connect Telegram'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default TelegramConnection; 