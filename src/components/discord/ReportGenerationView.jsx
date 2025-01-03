import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';

const CHANNELS_PER_PAGE = 10;

const ReportGenerationView = () => {
  const { serverId } = useParams();
  const navigate = useNavigate();
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [server, setServer] = useState(null);

  useEffect(() => {
    fetchServerAndChannels();
  }, [serverId]);

  const fetchServerAndChannels = async () => {
    try {
      setLoading(true);
      const [serverResponse, channelsResponse] = await Promise.all([
        axios.get(`/connect/discord/servers/${serverId}`),
        axios.get(`/connect/discord/servers/${serverId}/channels`)
      ]);

      setServer(serverResponse.data);
      setChannels(channelsResponse.data.filter(channel => channel.type === 'GUILD_TEXT'));
    } catch (error) {
      console.error('Error fetching server data:', error);
      toast.error('Failed to fetch server data');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate(`/dashboard/discord/servers/${serverId}`);
  };

  const handleGenerateReport = async (channelId) => {
    try {
      setGenerating(true);
      const response = await axios.post(
        `/connect/discord/servers/${serverId}/channels/${channelId}/report`,
        { model: 'gemini' }
      );

      setSelectedChannel({
        ...channels.find(c => c.id === channelId),
        report: response.data
      });

      toast.success('Report generated successfully');
    } catch (error) {
      console.error('Error generating report:', error);
      toast.error('Failed to generate report');
    } finally {
      setGenerating(false);
    }
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

  return (
    <div className="h-full flex flex-col">
      {/* Top Navigation Bar */}
      <div className="bg-dark-lighter p-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={handleBack}
            className="p-2 rounded-full hover:bg-dark-lightest"
            aria-label="Back to server"
          >
            <ArrowLeftIcon className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-xl font-semibold">Generate Report</h1>
            <p className="text-sm text-gray-400">
              {server?.name} • {channels.length} channels
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {paginatedChannels.map(channel => (
            <div
              key={channel.id}
              className="bg-dark-lighter p-4 rounded-lg hover:bg-dark-lightest transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="text-xl">#</div>
                  <div>
                    <h3 className="font-semibold">{channel.name}</h3>
                    <p className="text-sm text-gray-400">
                      {channel.topic || 'No topic set'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleGenerateReport(channel.id)}
                  disabled={generating}
                  className="px-3 py-1.5 bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-50"
                >
                  {generating && selectedChannel?.id === channel.id ? 'Generating...' : 'Generate'}
                </button>
              </div>
              
              {selectedChannel?.id === channel.id && selectedChannel.report && (
                <div className="mt-4 p-3 bg-dark rounded">
                  <h4 className="font-semibold mb-2">Report Summary</h4>
                  <p className="text-sm text-gray-300">{selectedChannel.report.summary}</p>
                </div>
              )}
            </div>
          ))}
        </div>

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

export default ReportGenerationView; 