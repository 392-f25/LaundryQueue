import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (email: string) => void;
  machineId: string;
  machineLabel: string;
}

export const EmailModal: React.FC<EmailModalProps> = ({ 
  isOpen, 
  onClose, 
  onSubmit, 
  machineId, 
  machineLabel 
}) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const authContext = useContext(AuthContext);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    
    try {
      if (authContext) {
        // Update current user with email
        authContext.setCurrentUser({
          ...authContext.currentUser,
          email
        });
        // Store email in localStorage
        localStorage.setItem('userEmail', email);
      }
      await onSubmit(email);
      onClose();
    } catch (err) {
      setError('Failed to save email. Please try again.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">Enter Your Email</h2>
        <p className="text-gray-600 mb-4">
          To start using {machineLabel}, we need your email to send notifications when your laundry is done.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full p-2 border rounded mb-4"
            required
            autoFocus
          />
          {error && <p className="text-red-500 mb-4">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Start Machine
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};