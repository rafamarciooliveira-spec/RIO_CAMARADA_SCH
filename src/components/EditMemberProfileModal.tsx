import React from 'react';
import { Member } from '../types/index.ts';
import { UserProfileModal } from './UserProfileModal.tsx';

interface EditModalProps {
  isOpen: boolean;
  onClose: () => void;
  member?: Member;
  onSuccess?: () => void;
}

export const EditMemberProfileModal: React.FC<EditModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  return (
    <UserProfileModal
      isOpen={isOpen}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
};
