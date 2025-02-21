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

const AcknowledgmentModal = ({ isOpen, onClose }) => {
  const modalRef = React.useRef();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50">
      <div 
        ref={modalRef}
        className="bg-[#24283b] rounded-lg p-6 max-w-md w-full mx-4"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-medium text-white">WhatsApp Sync Started</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors w-auto"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className='flex justify-center mt-4 mb-4'>
          <img className='size-12' src="https://media0.giphy.com/media/jU9PVpqUvR0aNc3nvX/giphy.gif?cid=6c09b952prsvlhpto7g95cgdkxbeyvjja133739m5398bj2o&ep=v1_stickers_search&rid=giphy.gif&ct=s" alt="whatsappLoad"/>
        </div>
        <p className="text-gray-300">
          Application started syncing your WhatsApp contacts. If there is a new message for any contact, it will be fetched automatically here.
        </p>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const dispatch = useDispatch();
  const { user } = useSelector(state => state.auth);
  const { items: contacts, loading: contactsLoading } = useSelector(state => state.contacts);
  const { connected: socketConnected } = useSelector(state => state.socket);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [showAcknowledgment, setShowAcknowledgment] = useState(true);

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
    <>
     <AcknowledgmentModal 
        isOpen={showAcknowledgment} 
        onClose={() => setShowAcknowledgment(false)} 
      />
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
          {/* <TopNavPanel /> */}

          {/* Chat View */}
          <div className="flex-1 overflow-hidden">
            <ChatView selectedContact={selectedContact} />
          </div>
        </div>
      </div>
    </>
  );
  
};

export default Dashboard; 