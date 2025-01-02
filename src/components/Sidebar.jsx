import React from 'react';
import { FiMessageSquare, FiCompass, FiSettings, FiLogOut } from 'react-icons/fi';
import { useNavigate, useLocation } from 'react-router-dom';

const Sidebar = ({ accounts, selectedPlatform, onPlatformSelect }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handlePlatformClick = (platform) => {
    onPlatformSelect(platform);
    if (platform === 'discord') {
      navigate('/discord');
    }
  };

  return (
    <div className="w-64 bg-dark-darker flex flex-col h-full">
      <div className="p-6">
        <div className="flex items-center gap-2">
          <img className="h-8 w-8 rounded-full" src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTXDRBCQaRKYLLyQHrauxpyvSmWSfpfKzTVFA&s" alt="User" />
          <span className="text-xl font-semibold text-white">Your Daily Fix</span>
        </div>
      </div>
      <nav className="flex-1 px-4 space-y-2">
        <button
          onClick={() => {
            onPlatformSelect(null);
            navigate('/dashboard');
          }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${
            !selectedPlatform && location.pathname === '/dashboard'
              ? 'bg-primary text-white'
              : 'text-gray-400 hover:bg-dark-lighter hover:text-white'
          }`}
        >
          <span>Unified Inbox</span>
        </button>
        {accounts.map(account => (
          <button
            key={account.id}
            onClick={() => handlePlatformClick(account.platform)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${
              (selectedPlatform === account.platform || location.pathname.startsWith(`/${account.platform}`))
                ? 'bg-primary text-white'
                : 'text-gray-400 hover:bg-dark-lighter hover:text-white'
            }`}
          >
            <span>{account.platform.charAt(0).toUpperCase() + account.platform.slice(1)}</span>
          </button>
        ))}
      </nav>
      <div className="p-4 border-t border-dark-lighter space-y-2">
        <button
          onClick={() => {
            // TODO: Implement logout
            alert("Logout not implemented");
          }}
          className="w-full flex items-center gap-3 px-4 py-3 text-error hover:bg-dark-lighter rounded-lg"
        >
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;