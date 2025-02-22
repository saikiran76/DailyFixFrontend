import React from 'react';
import PropTypes from 'prop-types';
import { useDispatch } from 'react-redux';
import { toast } from 'react-hot-toast';
import api from '../utils/api';
import logger from '../utils/logger';
import { updateContactMembership } from '../store/slices/contactSlice';

const InviteAcceptanceModal = ({ contact, onAccept, onClose }) => {
  const dispatch = useDispatch();

  const handleAccept = async (retryCount = 0) => {
    const MAX_RETRIES = 3;
    try {
      const result = await api.post(`api/whatsapp-entities/contacts/${contact.id}/accept`);
      
      if (result.data) {
        const updatedContact = {
          ...contact,
          ...result.data,
          metadata: {
            ...contact.metadata,
            ...result.data.metadata,
            membership: 'join'
          }
        };

        // Update Redux state
        dispatch(updateContactMembership({ 
          contactId: contact.id, 
          updatedContact 
        }));

        // Update parent component
        onAccept(updatedContact);
        onClose();

        // Show success message
        toast.success('Successfully joined the chat');
      }
    } catch (error) {
      logger.error('[InviteAcceptanceModal] Error accepting invite:', {
        error,
        contactId: contact.id,
        retryCount
      });
      
      if (retryCount < MAX_RETRIES) {
        // Exponential backoff for retries
        const delay = Math.min(1000 * Math.pow(2, retryCount), 5000);
        setTimeout(() => handleAccept(retryCount + 1), delay);
        
        if (retryCount > 0) {
          toast.loading(`Retrying... (${retryCount}/${MAX_RETRIES})`);
        }
      } else {
        const errorMessage = error.response?.data?.message || 'Failed to accept invite';
        toast.error(errorMessage);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50">
      <div className="bg-[#24283b] rounded-lg p-6 max-w-md w-full mx-4 space-y-6" onClick={e => e.stopPropagation()}>
        <div className="flex flex-col items-center space-y-4">
          {/* Contact Avatar */}
          <div className="w-16 h-16 bg-[#1e6853] rounded-full flex items-center justify-center">
            {contact.avatar_url ? (
              <img 
                src={contact.avatar_url} 
                alt={contact.display_name}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <span className="text-white text-2xl">
                {contact.is_group ? '👥' : contact.display_name[0].toUpperCase()}
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className="text-xl font-medium text-white text-center">
            Do you want to join {contact.display_name}?
          </h3>

          {/* Subtitle */}
          <p className="text-gray-400 text-center text-sm">
            Invited by WhatsApp bridge bot
            <br />
            <span className="text-xs">@whatsappbot:dfix-hsbridge.duckdns.org</span>
          </p>
        </div>

        {/* Buttons */}
        <div className="flex flex-col space-y-3">
          <button
            onClick={() => handleAccept(0)}
            className="w-full py-2 px-4 bg-[#1e6853] text-white rounded-lg hover:bg-[#1e6853]/90 transition-colors"
          >
            Accept
          </button>
          {/* <button
            onClick={onReject}
            className="w-full py-2 px-4 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
          >
            Reject & Ignore user
          </button> */}
          <button
            onClick={onClose}
            className="w-full py-2 px-4 bg-gray-700/50 text-gray-300 rounded-lg hover:bg-gray-700/70 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

InviteAcceptanceModal.propTypes = {
  contact: PropTypes.shape({
    id: PropTypes.number.isRequired,
    display_name: PropTypes.string.isRequired,
    avatar_url: PropTypes.string,
    is_group: PropTypes.bool,
    whatsapp_id: PropTypes.string.isRequired
  }).isRequired,
  onAccept: PropTypes.func.isRequired,
  onReject: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired
};

export default InviteAcceptanceModal; 