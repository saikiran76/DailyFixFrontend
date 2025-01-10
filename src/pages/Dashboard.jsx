import React from 'react';
import WhatsAppInvites from '../components/WhatsAppInvites';

const Dashboard = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <WhatsAppInvites />
        </div>
        {/* Add other dashboard components here */}
      </div>
    </div>
  );
};

export default Dashboard; 