import React, { useState, useEffect } from 'react';
import axios from '../utils/axios';
import { FiUser, FiTag, FiEdit3 } from 'react-icons/fi';

const CustomerDetails = ({ roomId }) => {
  // Add loading state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [customer, setCustomer] = useState({
    userId: '',
    displayName: '',
    notes: '',
    tags: [],
    customFields: {}
  });

  useEffect(() => {
    const fetchCustomerDetails = async () => {
      try {
        setIsLoading(true); // Changed from loading to isLoading
        const response = await axios.get(`/rooms/${roomId}/customer`);
        if (response.data) {
          setCustomer(response.data);
        }
        setError(null);
      } catch (error) {
        console.error('Error fetching customer details:', error);
        setError('Failed to load customer details');
      } finally {
        setIsLoading(false); // Changed from loading to isLoading
      }
    };

    if (roomId) {
      fetchCustomerDetails();
    }
  }, [roomId]);

  if (isLoading) { // Changed from loading to isLoading
    return (
      <div className="card space-y-6">
        <div className="animate-pulse">
          <div className="h-4 bg-dark-lighter rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-dark-lighter rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-dark-lighter rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card space-y-6">
        <div className="text-error text-center">{error}</div>
      </div>
    );
  }

  return (
    <div className="card space-y-6">
      {/* Customer Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-dark-lighter rounded-full flex items-center justify-center">
            <FiUser className="text-2xl text-gray-400" />
          </div>
          <div>
            <h3 className="text-lg font-medium">{customer.displayName}</h3>
            <p className="text-sm text-gray-400">{customer.userId}</p>
          </div>
        </div>
      </div>

      {/* Customer Notes */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-gray-400">
          <FiEdit3 className="text-lg" />
          Notes
        </label>
        <textarea
          className="w-full bg-dark-lighter rounded-lg p-3 text-sm"
          placeholder="Add notes about this customer..."
          value={customer.notes}
          readOnly
        />
      </div>

      {/* Customer Tags */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-gray-400">
          <FiTag className="text-lg" />
          Tags
        </label>
        <div className="flex flex-wrap gap-2">
          {customer.tags.map((tag, index) => (
            <span 
              key={index}
              className="px-2 py-1 bg-dark rounded-full text-sm text-gray-400"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Custom Fields */}
      {Object.entries(customer.customFields).length > 0 && (
        <div className="space-y-2">
          <label className="text-gray-400">Custom Fields</label>
          <div className="space-y-2">
            {Object.entries(customer.customFields).map(([key, value]) => (
              <div key={key} className="flex justify-between text-sm">
                <span className="text-gray-400">{key}</span>
                <span>{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerDetails;