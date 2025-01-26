import { useEffect, useRef, useState } from 'react';
import { useSocket } from './useSocket';
import { contactService } from '../services/contactService';
import { api } from '../services/api';

export function useContactSync() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncStatus, setSyncStatus] = useState('idle');
  const { socket, isConnected, emit } = useSocket();
  const retryAttemptsRef = useRef(new Map());
  const syncStateRef = useRef(new Map());
  const lastSyncRef = useRef(null);

  // Enhanced retry logic with exponential backoff
  const retryWithBackoff = async (operation, contactId, maxRetries = 3) => {
    const retryCount = retryAttemptsRef.current.get(contactId) || 0;
    
    if (retryCount >= maxRetries) {
      throw new Error(`Max retries reached for contact ${contactId}`);
    }
    
    const delay = Math.min(1000 * Math.pow(2, retryCount), 5000);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    retryAttemptsRef.current.set(contactId, retryCount + 1);
    return operation();
  };
  
  // Enhanced contact update with state tracking
  const handleContactUpdate = async (contact) => {
    try {
      const syncState = syncStateRef.current.get(contact.id) || {};
      
      // Prevent duplicate updates
      if (syncState.lastUpdate && Date.now() - syncState.lastUpdate < 1000) {
        return;
      }
      
      // Update contact in state
      setContacts(prev => {
        const index = prev.findIndex(c => c.id === contact.id);
        if (index === -1) {
          return [...prev, contact];
        }
        const newContacts = [...prev];
        newContacts[index] = { ...newContacts[index], ...contact };
        return newContacts;
      });
      
      // Acknowledge update to server
      await retryWithBackoff(
        () => emit('whatsapp:contact_update_ack', {
          contactId: contact.id,
          status: 'success'
        }),
        contact.id
      );
      
      // Update sync state
      syncStateRef.current.set(contact.id, {
        ...syncState,
        lastUpdate: Date.now(),
        status: 'success'
      });
      
      // Clear retry count on success
      retryAttemptsRef.current.delete(contact.id);
      
    } catch (error) {
      console.error('Contact update failed:', error);
      setError(`Failed to update contact ${contact.name}`);
      
      syncStateRef.current.set(contact.id, {
        lastUpdate: Date.now(),
        status: 'error',
        error: error.message
      });
    }
  };

  // Load contacts with cache check
  const loadContacts = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setSyncStatus('loading');

      // First try to get from cache if not forcing refresh
      if (!forceRefresh) {
        const cachedContacts = await contactService.getCachedContacts();
        if (cachedContacts?.length > 0) {
          setContacts(cachedContacts);
          setLoading(false);
          // Check if we need background sync
          const lastSync = lastSyncRef.current;
          if (!lastSync || Date.now() - lastSync > 5 * 60 * 1000) { // 5 minutes
            backgroundSync();
          }
          return;
        }
      }

      // If no cache or force refresh, load from API
      const response = await api.get('/api/whatsapp-entities/contacts');
      const data = await response.json();
      
      if (!data?.contacts) {
        throw new Error('Invalid response format');
      }

      setContacts(data.contacts);
      setError(null);
      lastSyncRef.current = Date.now();
      
      // Cache the results
      await contactService.cacheContacts(data.contacts);
      
    } catch (error) {
      console.error('Failed to load contacts:', error);
      setError('Failed to load contacts. Please try again.');
    } finally {
      setLoading(false);
      setSyncStatus('idle');
    }
  };

  // Background sync function
  const backgroundSync = async () => {
    if (syncStatus === 'syncing') return;
    
    try {
      setSyncStatus('syncing');
      await emit('whatsapp:request_sync');
      
      // Wait for sync to complete or timeout
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const status = await contactService.getSyncStatus();
        
        if (status === 'completed') {
          await loadContacts(true); // Reload contacts after sync
          break;
        }
        
        if (status === 'error') {
          throw new Error('Sync failed');
        }
        
        attempts++;
      }
      
      if (attempts >= maxAttempts) {
        throw new Error('Sync timed out');
      }
      
    } catch (error) {
      console.error('Background sync failed:', error);
      // Don't show error to user for background sync
    } finally {
      setSyncStatus('idle');
    }
  };

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Set up event listeners
    socket.on('whatsapp:contact_update', handleContactUpdate);
    socket.on('whatsapp:contacts_sync_complete', () => loadContacts(true));

    // Load initial contacts
    loadContacts();

    // Cleanup
    return () => {
      socket.off('whatsapp:contact_update', handleContactUpdate);
      socket.off('whatsapp:contacts_sync_complete');
      retryAttemptsRef.current.clear();
      syncStateRef.current.clear();
    };
  }, [socket, isConnected, emit]);

  const refreshContacts = async () => {
    try {
      setLoading(true);
      await emit('whatsapp:request_sync');
      setError(null);
    } catch (error) {
      console.error('Failed to request sync:', error);
      setError('Failed to refresh contacts. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return {
    contacts,
    loading,
    error,
    refreshContacts
  };
} 