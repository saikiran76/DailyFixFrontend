import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { useSocketConnection } from '../../hooks/useSocketConnection';
import api, { 
  validateResponse, 
  ResponseSchemas, 
  ErrorTypes,
  ResponseStatus 
} from '../../utils/api';
import { 
  SocketEvents, 
  validateEventData, 
  createEventHandler 
} from '../../utils/socketEvents';

const ITEMS_PER_PAGE = 9;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

const MainEntitiesContent = () => {
  const [servers, setServers] = useState([]);
  const [dms, setDms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [serverPage, setServerPage] = useState(1);
  const [dmPage, setDmPage] = useState(1);
  const [retryCount, setRetryCount] = useState(0);
  const [hasMoreServers, setHasMoreServers] = useState(true);
  const [hasMoreDms, setHasMoreDms] = useState(true);
  const [totalServers, setTotalServers] = useState(0);
  const [totalDms, setTotalDms] = useState(0);
  const retryTimeoutRef = useRef(null);
  const fetchInProgress = useRef(false);
  const rateLimitTimeoutRef = useRef(null);
  const navigate = useNavigate();
  const { socket, isConnected, connectionStatus } = useSocketConnection('discord');
  const mounted = useRef(true);

  const clearTimeouts = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (rateLimitTimeoutRef.current) {
      clearTimeout(rateLimitTimeoutRef.current);
      rateLimitTimeoutRef.current = null;
    }
  }, []);

  const handleError = useCallback(async (error) => {
    clearTimeouts();

    if (!mounted.current) return;

    // Handle specific error types
    switch (error.type) {
      case ErrorTypes.RATE_LIMIT:
        const retryAfter = error.retryAfter || 5000;
        toast.warning(`Rate limit reached. Retrying in ${retryAfter/1000}s`);
        rateLimitTimeoutRef.current = setTimeout(() => {
          if (mounted.current) fetchData();
        }, retryAfter);
        return;

      case ErrorTypes.TOKEN_EXPIRED:
      case ErrorTypes.TOKEN_INVALID:
        setError('Discord connection needs to be refreshed');
        toast.error('Discord connection needs to be refreshed. Redirecting...');
        navigate('/connect/discord', { replace: true });
        return;

      case ErrorTypes.SERVICE_UNAVAILABLE:
        setError('Discord service is currently unavailable');
        toast.error('Discord service is currently unavailable. Please try again later.');
        if (socket) {
          socket.disconnect();
        }
        return;

      case ErrorTypes.NETWORK_ERROR:
        setError('Network connection error');
        toast.error('Network connection error. Please check your internet connection.');
        return;

      case ErrorTypes.VALIDATION_ERROR:
        setError('Invalid data received from server');
        toast.error('Invalid data received from server. Please try again.');
        return;

      default:
        // For other errors, retry with backoff
        if (retryCount < MAX_RETRIES && mounted.current) {
          const nextRetry = retryCount + 1;
          setRetryCount(nextRetry);
          setError(`Failed to fetch data. Retrying... (${nextRetry}/${MAX_RETRIES})`);
          
          retryTimeoutRef.current = setTimeout(() => {
            if (mounted.current && !fetchInProgress.current) {
              fetchData();
            }
          }, RETRY_DELAY * Math.pow(2, nextRetry - 1));
        } else if (mounted.current) {
          setError('Failed to fetch data. Please try reconnecting to Discord.');
          toast.error('Failed to fetch data. Please try reconnecting to Discord.');
          navigate('/connect/discord', { replace: true });
        }
    }
  }, [navigate, retryCount, clearTimeouts, socket]);

  const fetchData = useCallback(async () => {
    if (!mounted.current || fetchInProgress.current) return;
    fetchInProgress.current = true;

      try {
        setLoading(true);
        setError(null);
        
      // First verify Discord connection is active
      const { data: statusResponse } = await api.get('/connect/discord/status');
      if (!mounted.current) {
        fetchInProgress.current = false;
        return;
      }

      if (!validateResponse(statusResponse, ResponseSchemas.status) || 
          statusResponse.status !== 'active') {
        throw { type: ErrorTypes.TOKEN_INVALID };
      }

      // Fetch paginated data
      const [serversResponse, dmsResponse] = await Promise.all([
        api.get('/connect/discord/servers', {
          params: {
            page: serverPage,
            limit: ITEMS_PER_PAGE
          }
        }),
        api.get('/connect/discord/direct-messages', {
          params: {
            page: dmPage,
            limit: ITEMS_PER_PAGE
          }
        })
      ]);

      if (!mounted.current) {
        fetchInProgress.current = false;
        return;
      }

      // Process servers
      const { data: serversData, meta: serversMeta } = serversResponse.data;
        if (!Array.isArray(serversData)) {
          throw new Error('Invalid servers data format');
        }
        
        const validatedServers = serversData
        .filter(server => validateResponse(server, ResponseSchemas.servers))
          .map(server => ({
            id: server.id,
            name: server.name,
            icon: server.icon
          }));
        
      // Process DMs
      const { data: dmsData, meta: dmsMeta } = dmsResponse.data;
      if (!Array.isArray(dmsData)) {
        throw new Error('Invalid DMs data format');
      }

      const validatedDms = dmsData
        .filter(dm => validateResponse(dm, ResponseSchemas.directMessages))
        .map(dm => ({
          id: dm.id,
          name: dm.recipients.map(r => r.username).join(', '),
          icon: dm.recipients[0]?.avatar,
          recipientId: dm.recipients[0]?.id
        }));

      if (!mounted.current) {
        fetchInProgress.current = false;
        return;
      }

      // Update state with new data and pagination info
      setServers(prev => serverPage === 1 ? validatedServers : [...prev, ...validatedServers]);
      setDms(prev => dmPage === 1 ? validatedDms : [...prev, ...validatedDms]);
      setHasMoreServers(serversMeta.hasMore);
      setHasMoreDms(dmsMeta.hasMore);
      setTotalServers(serversMeta.total);
      setTotalDms(dmsMeta.total);
      setError(null);
      setRetryCount(0);
      } catch (error) {
      if (!mounted.current) {
        fetchInProgress.current = false;
        return;
      }
      console.error('Error fetching data:', error);
      handleError(error);
      } finally {
      if (mounted.current) {
        setLoading(false);
      }
      fetchInProgress.current = false;
    }
  }, [navigate, handleError, serverPage, dmPage]);

  useEffect(() => {
    mounted.current = true;

    const initializeData = async () => {
      if (!mounted.current) return;
      await fetchData();
    };

    initializeData();

    return () => {
      mounted.current = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [fetchData]);

  useEffect(() => {
    if (!socket) return;

    // Create event handlers with validation
    const handleServerUpdate = createEventHandler(
      SocketEvents.DISCORD_SERVER_UPDATE,
      (data) => {
        if (!mounted.current) return;
        setServers(prev => {
          const index = prev.findIndex(s => s.id === data.id);
          if (index === -1) return [...prev, data];
          const newServers = [...prev];
          newServers[index] = { ...newServers[index], ...data };
          return newServers;
        });
      }
    );

    const handleServerRemove = createEventHandler(
      SocketEvents.DISCORD_SERVER_REMOVE,
      (serverId) => {
        if (!mounted.current || !serverId) return;
        setServers(prev => prev.filter(s => s.id !== serverId));
      }
    );

    const handleDMUpdate = createEventHandler(
      SocketEvents.DISCORD_DM_UPDATE,
      (data) => {
        if (!mounted.current) return;
        setDms(prev => {
          const index = prev.findIndex(dm => dm.id === data.id);
          if (index === -1) return [...prev, data];
          const newDms = [...prev];
          newDms[index] = { ...newDms[index], ...data };
          return newDms;
        });
      }
    );

    const handleRateLimit = createEventHandler(
      SocketEvents.RATE_LIMIT,
      (data) => {
        if (!mounted.current) return;
        const retryAfter = data.retryAfter;
        toast.warning(`Rate limit reached. Updates paused for ${retryAfter/1000}s`);
        
        setTimeout(() => {
          if (mounted.current) fetchData();
        }, retryAfter);
      }
    );

    // Set up event listeners using standardized event names
    socket.on(SocketEvents.DISCORD_SERVER_UPDATE, handleServerUpdate);
    socket.on(SocketEvents.DISCORD_SERVER_REMOVE, handleServerRemove);
    socket.on(SocketEvents.DISCORD_DM_UPDATE, handleDMUpdate);
    socket.on(SocketEvents.RATE_LIMIT, handleRateLimit);

    // Handle connection status changes
    socket.on(SocketEvents.CONNECT, () => {
      if (mounted.current) {
        console.debug('Socket connected, fetching initial data');
        fetchData();
      }
    });

    socket.on(SocketEvents.DISCONNECT, (reason) => {
      if (mounted.current) {
        console.debug('Socket disconnected:', reason);
        if (reason === 'io server disconnect' || reason === 'io client disconnect') {
          toast.error('Lost connection to server. Attempting to reconnect...');
        }
      }
    });

    // Process any queued messages
    if (socket.messageQueue?.length > 0) {
      socket.messageQueue.forEach(({ event, data }) => {
        switch (event) {
          case SocketEvents.DISCORD_SERVER_UPDATE:
            handleServerUpdate(data);
            break;
          case SocketEvents.DISCORD_SERVER_REMOVE:
            handleServerRemove(data);
            break;
          case SocketEvents.DISCORD_DM_UPDATE:
            handleDMUpdate(data);
            break;
          default:
            break;
        }
      });
    }

    return () => {
      socket.off(SocketEvents.DISCORD_SERVER_UPDATE, handleServerUpdate);
      socket.off(SocketEvents.DISCORD_SERVER_REMOVE, handleServerRemove);
      socket.off(SocketEvents.DISCORD_DM_UPDATE, handleDMUpdate);
      socket.off(SocketEvents.RATE_LIMIT, handleRateLimit);
      socket.off(SocketEvents.CONNECT);
      socket.off(SocketEvents.DISCONNECT);
    };
  }, [socket, mounted, fetchData]);

  const handleRetry = () => {
    fetchData();
  };

  const paginatedServers = servers.slice(
    (serverPage - 1) * ITEMS_PER_PAGE,
    serverPage * ITEMS_PER_PAGE
  );

  const paginatedDms = dms.slice(
    (dmPage - 1) * ITEMS_PER_PAGE,
    dmPage * ITEMS_PER_PAGE
  );

  const totalServerPages = Math.ceil(servers.length / ITEMS_PER_PAGE);
  const totalDmPages = Math.ceil(dms.length / ITEMS_PER_PAGE);

  const Pagination = ({ currentPage, totalPages, onPageChange }) => (
    <div className="flex items-center justify-center mt-4 space-x-2">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="p-2 rounded-full hover:bg-dark-lightest disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ChevronLeftIcon className="h-5 w-5" />
      </button>
      <span className="text-sm">
        Page {currentPage} of {totalPages}
      </span>
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="p-2 rounded-full hover:bg-dark-lightest disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ChevronRightIcon className="h-5 w-5" />
      </button>
    </div>
  );

  if (loading) {
  return (
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
        </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-500">
        <p>{error}</p>
        <button
          onClick={handleRetry}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      {/* DMs Section */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Direct Messages</h2>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {paginatedDms.map(dm => (
            <div
              key={dm.id}
              className="bg-dark-lighter p-4 rounded-lg hover:bg-dark-lightest transition-colors cursor-pointer"
              onClick={() => navigate(`/discord/dms/${dm.id}`)}
            >
              <div className="flex items-center space-x-3">
                {dm.icon ? (
                  <img
                    src={`https://cdn.discordapp.com/avatars/${dm.recipientId}/${dm.icon}.png`}
                    alt={dm.name}
                    className="w-12 h-12 rounded-full"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
                    {dm.name.charAt(0)}
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-lg">{dm.name}</h3>
                </div>
              </div>
            </div>
          ))}
        </div>
        {dms.length > ITEMS_PER_PAGE && (
          <Pagination
            currentPage={dmPage}
            totalPages={totalDmPages}
            onPageChange={setDmPage}
          />
        )}
      </div>

      {/* Servers Section */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Servers</h2>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {paginatedServers.map(server => (
            <div
              key={server.id}
              className="bg-dark-lighter p-4 rounded-lg hover:bg-dark-lightest transition-colors cursor-pointer"
              onClick={() => navigate(`/dashboard/discord/servers/${server.id}`)}
            >
              <div className="flex items-center space-x-3">
                {server.icon ? (
                  <img
                    src={`https://cdn.discordapp.com/icons/${server.id}/${server.icon}.png`}
                    alt={server.name}
                    className="w-12 h-12 rounded-full"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
                    {server.name.charAt(0)}
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-lg">{server.name}</h3>
                </div>
              </div>
            </div>
          ))}
        </div>
        {servers.length > ITEMS_PER_PAGE && (
          <Pagination
            currentPage={serverPage}
            totalPages={totalServerPages}
            onPageChange={setServerPage}
          />
        )}
      </div>
    </div>
  );
};

const MainEntitiesView = () => {
  return <MainEntitiesContent />;
};

export default MainEntitiesView; 