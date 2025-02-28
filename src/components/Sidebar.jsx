import React, { useState, useEffect, useRef } from 'react';
import { FiMessageSquare, FiCompass, FiSettings, FiLogOut, FiX } from 'react-icons/fi';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { initiateWhatsAppRelogin } from '../store/slices/onboardingSlice';
import { toast } from 'react-hot-toast';
import ReloginConfirmationModal from './ReloginConfirmationModal';
import summaryImage from '../images/summary.png'
import dropImage from '../images/Drop.png'
import priorityImage from '../images/priority.png'

const TutorialModal = ({ isOpen, onClose }) => {
  const modalRef = useRef();

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

  const features = [
    {
      description: "For each contact, you can get your daily report of your chat with our personalized AI.",
      imageSrc: summaryImage   // To be added later
    },
    {
      description: "Prioritize your chats by setting the priority in the dropdown available when you open your chat on the top-left.",
      imageSrc: dropImage // To be added later
    },
    {
      description: "Based on your selected priority, a colored indicator appears next to the contact name in the contacts list - red for high priority!",
      imageSrc: priorityImage // To be added later
    }
  ];

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50">
      <div 
        ref={modalRef}
        className="bg-[#24283b] rounded-lg p-6 max-w-2xl w-full mx-4 space-y-6"
      >
        <div className="flex justify-between items-center border-b border-gray-700 pb-4">
          <h3 className="text-xl font-medium text-white">Features & Tutorial</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        
        <div className="space-y-6">
          {features.map((feature, index) => (
            <div 
              key={index}
              className="flex items-center gap-4 text-gray-200 p-4 rounded-lg bg-[#1a1b26] hover:bg-[#1e2132] transition-colors"
            >
              <div className="flex-1 text-sm">
                {feature.description}
              </div>
              {feature.imageSrc && (
                <img 
                  src={feature.imageSrc} 
                  alt={`Feature ${index + 1}`}
                  className="h-[2.8em] object-contain"
                />
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-gray-700 pt-4 text-gray-400 text-sm">
          <p className="animate-pulse">New features ahead! Stay tuned!</p>
        </div>
      </div>
    </div>
  );
};

const Sidebar = ({ accounts, selectedPlatform, onPlatformSelect }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const [showTutorial, setShowTutorial] = useState(false);
  const [showReloginModal, setShowReloginModal] = useState(false);

  const handleReloginConfirm = async () => {  
    try {  
      // Wait for 7 seconds before closing the modal  
      await new Promise(resolve => setTimeout(resolve, 7000));  
      setShowReloginModal(false);  
    } catch (error) {  
      toast.error('Failed to initiate reconnection');  
    }  
  };  

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
        <button
          onClick={() => setShowTutorial(true)}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${
            !selectedPlatform && location.pathname === '/dashboard'
              ? 'bg-primary text-white'
              : 'text-gray-400 hover:bg-dark-lighter hover:text-white'
          }`}
        >
          <span>Help/Tutorial</span>
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
            onClick={() => setShowReloginModal(true)}
            className="w-full flex items-center gap-3 px-4 py-3 text-yellow-500 hover:bg-dark-lighter rounded-lg"
          >
            <span>Reconnect WhatsApp</span>
          </button>        
        {/* <button
          onClick={() => {
            // TODO: Implement logout
            alert("Logout not implemented");
          }}
          className="w-full flex items-center gap-3 px-4 py-3 text-error hover:bg-dark-lighter rounded-lg"
        >
          <span>Logout</span>
        </button> */}
      </div>

      <TutorialModal 
        isOpen={showTutorial} 
        onClose={() => setShowTutorial(false)} 
      />

      <ReloginConfirmationModal 
        isOpen={showReloginModal}
        onClose={() => setShowReloginModal(false)}
        onConfirm={handleReloginConfirm}
      />
    </div>
  );
};

export default Sidebar;