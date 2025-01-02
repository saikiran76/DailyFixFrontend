import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';

const CHANNELS_PER_PAGE = 20;

const ServerDetailsView = () => {
  const { serverId } = useParams();
  const navigate = useNavigate();
  const [server, setServer] = useState(null);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchServerDetails();
  }, [serverId]);

  const fetchServerDetails = async () => {
    try {
      setLoading(true);
      const [serverResponse, channelsResponse] = await Promise.all([
        axios.get(`/api/discord/servers/${serverId}`),
        axios.get(`/api/discord/servers/${serverId}/channels`)
      ]);

      console.log('Server response:', serverResponse.data);
      console.log('Channels response:', channelsResponse.data);

      // Validate server response
      if (serverResponse.data?.status !== 'success' || !serverResponse.data?.data) {
        throw new Error('Invalid server response format');
      }

      // Validate channels response
      if (channelsResponse.data?.status !== 'success' || !channelsResponse.data?.data) {
        throw new Error('Invalid channels response format');
      }

      setServer(serverResponse.data.data);
      setChannels(channelsResponse.data.data.filter(channel => channel.type === 0));
    } catch (error) {
      console.error('Error fetching server details:', error);
      
      // Handle specific error cases
      if (error.response?.status === 401) {
        toast.error('Session expired. Please reconnect your Discord account.');
        navigate('/dashboard/discord');
      } else if (error.response?.status === 403) {
        toast.error('Bot needs access to this server. Please reinvite the bot with proper permissions.');
        navigate('/dashboard/discord');
      } else if (error.response?.status === 404) {
        toast.error('Server not found');
        navigate('/dashboard/discord');
      } else if (error.message === 'Invalid server response format' || error.message === 'Invalid channels response format') {
        console.error('Response data:', {
          server: error.serverData,
          channels: error.channelsData
        });
        toast.error('Received invalid data from server. Please try again.');
      } else if (error.message.includes('Discord connection not ready')) {
        toast.error('Discord connection initializing. Please wait a moment and try again.');
        // Retry after 3 seconds
        setTimeout(fetchServerDetails, 3000);
      } else {
        toast.error('Failed to load server details. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = () => {
    navigate(`/dashboard/discord/servers/${serverId}/report`);
  };

  const handleBack = () => {
    navigate('/dashboard/discord');
  };

  const paginatedChannels = channels.slice(
    (currentPage - 1) * CHANNELS_PER_PAGE,
    currentPage * CHANNELS_PER_PAGE
  );

  const totalPages = Math.ceil(channels.length / CHANNELS_PER_PAGE);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!server) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="text-red-500">Server not found</div>
        <button
          onClick={handleBack}
          className="mt-4 px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
        >
          Back to Servers
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Top Navigation Bar */}
      <div className="bg-dark-lighter p-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={handleBack}
            className="p-2 rounded-full hover:bg-dark-lightest"
            aria-label="Back to servers"
          >
            <ArrowLeftIcon className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-xl font-semibold">{server.name}</h1>
            <p className="text-sm text-gray-400">
              {channels.length} channels • {server.approximate_member_count || 'Unknown'} members
            </p>
          </div>
        </div>
        <div className="flex space-x-4">
          <button
            onClick={() => navigate(`/dashboard/discord/servers/${serverId}/priorities`)}
            className="px-4 py-2 bg-secondary text-white rounded hover:bg-secondary-dark"
          >
            Priorities
          </button>
          <button
            onClick={handleGenerateReport}
            className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
          >
            Generate Report
          </button>
        </div>
      </div>

      {/* Channels List */}
      <div className="flex-1 overflow-auto p-4">
        {channels.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <p>No text channels found in this server</p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {paginatedChannels.map(channel => (
              <div
                key={channel.id}
                className="bg-dark-lighter p-4 rounded-lg hover:bg-dark-lightest transition-colors cursor-pointer"
                onClick={() => navigate(`/dashboard/discord/servers/${serverId}/channels/${channel.id}`)}
              >
                <div className="flex items-center space-x-3">
                  <div className="text-xl">#</div>
                  <div>
                    <h3 className="font-semibold">{channel.name}</h3>
                    <p className="text-sm text-gray-400">
                      {channel.topic || 'No topic set'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center mt-4 space-x-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-full hover:bg-dark-lightest disabled:opacity-50"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <span className="text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-full hover:bg-dark-lightest disabled:opacity-50"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ServerDetailsView; 