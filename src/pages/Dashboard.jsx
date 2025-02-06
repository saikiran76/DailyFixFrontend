import React, { useState, useEffect } from 'react';
import WhatsAppInvites from '../components/WhatsAppInvites';
import Sidebar from '../components/Sidebar';
import WhatsAppContactList from '../components/WhatsAppContactList';
import TopNavPanel from '../components/TopNavPanel';
import ChatView from '../components/ChatView';
import api from '../utils/api';
import { useDispatch, useSelector } from 'react-redux';
import { fetchContacts } from '../store/slices/contactSlice';
import { connect as connectSocket } from '../store/slices/socketSlice';
import logger from '../utils/logger';

const Dashboard = () => {
  const dispatch = useDispatch();
  const { user } = useSelector(state => state.auth);
  const { items: contacts, loading: contactsLoading } = useSelector(state => state.contacts);
  const { connected: socketConnected } = useSelector(state => state.socket);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);

  useEffect(() => {
    const initializeDashboard = async () => {
      logger.info('[Dashboard] Starting dashboard initialization');

      // Initialize socket connection
      if (!socketConnected) {
        logger.info('[Dashboard] Initializing socket connection');
        try {
          await dispatch(connectSocket());
          logger.info('[Dashboard] Socket connection established');
        } catch (error) {
          logger.error('[Dashboard] Socket connection failed:', error);
        }
      }

      // Fetch contacts
      if (!contacts.length) {
        logger.info('[Dashboard] Fetching contacts');
        try {
          await dispatch(fetchContacts(user.id)).unwrap();
        } catch (error) {
          logger.error('[Dashboard] Failed to fetch contacts:', error);
        }
      }
    };

    initializeDashboard();
  }, [dispatch, user, socketConnected, contacts.length]);

  useEffect(() => {
    // Initialize with WhatsApp account if connected
    const initializeAccounts = async () => {
      try {
        const response = await api.get('/matrix/whatsapp/status');
        if (response.data.status === 'connected') {
          setAccounts([
            {
              id: 'whatsapp',
              platform: 'whatsapp',
              name: 'WhatsApp'
            }
          ]);
          setSelectedPlatform('whatsapp');
        }
      } catch (error) {
        logger.error('[Dashboard] Error fetching WhatsApp status:', error);
      }
    };

    initializeAccounts();
  }, []);

  const handlePlatformSelect = (platform) => {
    setSelectedPlatform(platform);
    // Reset selected contact when platform changes
    setSelectedContact(null);
  };

  const handleContactSelect = (contact) => {
    logger.info('[Dashboard] Contact selected:', contact);
    setSelectedContact(contact);
  };

  return (
    <div className="flex h-screen bg-dark">
      {/* Sidebar */}
      <div className="w-64 bg-dark-darker border-r border-dark-lighter">
        <Sidebar 
          accounts={accounts}
          selectedPlatform={selectedPlatform}
          onPlatformSelect={handlePlatformSelect}
        />
      </div>

      {/* Contact List Panel */}
      <div className="w-80 bg-dark-darker border-r border-dark-lighter">
        <div className="h-full flex flex-col">
          <div className="p-4 border-b border-dark-lighter flex gap-3 items-center justify-center">
            <img src="https://png.pngtree.com/element_our/sm/20180626/sm_5b321c99945a2.jpg" className='size-10 rounded-xl object-fill' alt="logo"/>
            <h2 className="text-lg font-semibold text-white">Contacts</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            <WhatsAppContactList 
              onContactSelect={handleContactSelect}
              selectedContactId={selectedContact?.id}
            />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-dark">
        {/* Top Navigation Panel */}
        <TopNavPanel />

        {/* Chat View */}
        <div className="flex-1 overflow-hidden">
          <ChatView selectedContact={selectedContact} />
        </div>
      </div>
    </div>
  );
};

export default Dashboard; 