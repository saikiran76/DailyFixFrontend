import React, { useState, useEffect } from 'react';
import WhatsAppInvites from '../components/WhatsAppInvites';
import Sidebar from '../components/Sidebar';
import WhatsAppContactList from '../components/WhatsAppContactList';
import TopNavPanel from '../components/TopNavPanel';
import ChatView from '../components/ChatView';
import api from '../utils/api';

const Dashboard = () => {
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);

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
        console.error('Error fetching WhatsApp status:', error);
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
    console.log('Contact selected:', contact);
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
          <div className="p-4 border-b border-dark-lighter">
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