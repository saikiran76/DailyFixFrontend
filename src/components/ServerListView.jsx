import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiChevronLeft, FiChevronRight } from 'react-icons/fi';

const SERVERS_PER_PAGE = 10;

const ServerListView = () => {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchServers = async () => {
      try {
        setLoading(true);
        const response = await axios.get('http://localhost:3001/discord/servers');
        setServers(response.data);
        setError(null);
      } catch (err) {
        console.error('Error fetching Discord servers:', err);
        setError('Failed to load servers. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchServers();
  }, []);

  const totalPages = Math.ceil(servers.length / SERVERS_PER_PAGE);
  const startIndex = (currentPage - 1) * SERVERS_PER_PAGE;
  const endIndex = startIndex + SERVERS_PER_PAGE;
  const currentServers = servers.slice(startIndex, endIndex);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-error text-center">
          <p className="text-xl font-semibold mb-2">Error</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-dark p-6">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/discord/main-entities')}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <FiArrowLeft className="text-xl" />
          <span>Back</span>
        </button>
        <h1 className="text-2xl font-bold text-white">Discord Servers</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid gap-4">
          {currentServers.map(server => (
            <button
              key={server.id}
              onClick={() => navigate(`/discord/servers/${server.id}`)}
              className="w-full flex items-center gap-4 p-4 bg-dark-lighter rounded-lg text-gray-400 hover:bg-dark-lightest hover:text-white transition-colors"
            >
              {server.icon && (
                <img
                  src={`https://cdn.discordapp.com/icons/${server.id}/${server.icon}.png`}
                  alt={server.name}
                  className="w-12 h-12 rounded-full"
                />
              )}
              <div className="flex-1 text-left">
                <h3 className="font-semibold">{server.name}</h3>
                {server.description && (
                  <p className="text-sm text-gray-500">{server.description}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-6">
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className={`p-2 rounded-full ${
              currentPage === 1
                ? 'text-gray-600'
                : 'text-gray-400 hover:text-white hover:bg-dark-lighter'
            }`}
          >
            <FiChevronLeft className="text-xl" />
          </button>
          <span className="text-gray-400">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className={`p-2 rounded-full ${
              currentPage === totalPages
                ? 'text-gray-600'
                : 'text-gray-400 hover:text-white hover:bg-dark-lighter'
            }`}
          >
            <FiChevronRight className="text-xl" />
          </button>
        </div>
      )}
    </div>
  );
};

export default ServerListView; 