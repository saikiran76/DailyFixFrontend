import React, { useState, useEffect, useRef } from 'react';
import { XMarkIcon, ArrowLeftIcon, MagnifyingGlassIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import api from '../../utils/api';

const ReportGenerationModal = ({ isOpen, onClose, serverId, serverName }) => {
  const [channels, setChannels] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [report, setReport] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [todayMessages, setTodayMessages] = useState([]);
  const modalRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      fetchChannels();
      // Focus search input when modal opens
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    } else {
      // Reset state when modal closes
      setSelectedChannel(null);
      setReport(null);
      setTodayMessages([]);
    }
  }, [isOpen, serverId]);

  const fetchChannels = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/connect/discord/servers/${serverId}/channels`);
      // Filter only text channels (type 0)
      const textChannels = response.data.data.filter(channel => channel.type === 0);
      setChannels(textChannels);
    } catch (error) {
      console.error('Error fetching channels:', error);
      toast.error('Failed to load channels');
    } finally {
      setLoading(false);
    }
  };

  const fetchTodayMessages = async (channelId) => {
    try {
      const response = await api.get(`/connect/discord/channels/${channelId}/messages/today`);
      setTodayMessages(response.data.data);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast.error('Failed to load messages');
      return [];
    }
  };

  const generateReport = async (channelId) => {
    try {
      setGeneratingReport(true);
      const response = await api.post(`/connect/discord/channels/${channelId}/report`);
      setReport(response.data.data);
      toast.success('Report generated successfully');
    } catch (error) {
      console.error('Error generating report:', error);
      toast.error('Failed to generate report');
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleChannelSelect = async (channel) => {
    setSelectedChannel(channel);
    const messages = await fetchTodayMessages(channel.id);
    if (messages.length > 0) {
      generateReport(channel.id);
    } else {
      toast.error('No messages found for today');
    }
  };

  const handleBackToChannels = () => {
    setSelectedChannel(null);
    setReport(null);
    setTodayMessages([]);
  };

  const filteredChannels = channels.filter(channel =>
    channel.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Close modal when clicking outside
  const handleClickOutside = (event) => {
    if (modalRef.current && !modalRef.current.contains(event.target)) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleClickOutside}
    >
      <div 
        ref={modalRef}
        className="bg-dark-lighter rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-xl"
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center">
            {selectedChannel ? (
              <button
                onClick={handleBackToChannels}
                className="mr-3 p-1 hover:bg-gray-700 rounded-full transition-colors"
              >
                <ArrowLeftIcon className="h-5 w-5 text-gray-400" />
              </button>
            ) : null}
            <h2 className="text-xl font-semibold text-white">
              {selectedChannel ? 
                `Generate Report - #${selectedChannel.name}` : 
                `Select Channel - ${serverName}`}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded-full transition-colors"
          >
            <XMarkIcon className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {!selectedChannel && (
            <>
              {/* Search Bar */}
              <div className="relative mb-4">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search channels..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-dark rounded border border-gray-700 text-white placeholder-gray-400 focus:outline-none focus:border-primary"
                />
              </div>

              {/* Channels List */}
              <div className="overflow-y-auto max-h-[calc(80vh-12rem)]">
                {loading ? (
                  <div className="flex justify-center items-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredChannels.map(channel => (
                      <button
                        key={channel.id}
                        onClick={() => handleChannelSelect(channel)}
                        className="w-full p-3 flex items-center space-x-3 rounded-lg hover:bg-dark transition-colors text-left"
                      >
                        <span className="text-xl text-gray-400">#</span>
                        <div>
                          <h3 className="font-medium text-white">{channel.name}</h3>
                          <p className="text-sm text-gray-400">
                            {channel.topic || 'No topic set'}
                          </p>
                        </div>
                      </button>
                    ))}
                    {filteredChannels.length === 0 && !loading && (
                      <div className="text-center py-8 text-gray-400">
                        No channels found
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Report Generation View */}
          {selectedChannel && (
            <div className="text-white">
              {generatingReport ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
                  <p>Generating report...</p>
                </div>
              ) : report ? (
                <div className="space-y-4">
                  <div className="bg-dark rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-semibold mb-2">Report Summary</h3>
                        <p className="text-sm text-gray-400">
                          Generated on {new Date(report.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <DocumentTextIcon className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                  
                  <div className="bg-dark rounded-lg p-4">
                    <h4 className="font-medium mb-2">Activity Overview</h4>
                    <div className="space-y-2">
                      <p>Total Messages: {report.report_data.messageCount}</p>
                      <p>Unique Users: {report.report_data.uniqueUsers}</p>
                    </div>
                  </div>

                  <div className="bg-dark rounded-lg p-4">
                    <h4 className="font-medium mb-2">Summary</h4>
                    <p className="text-gray-300">{report.report_data.summary}</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <p>No messages found for today</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportGenerationModal; 