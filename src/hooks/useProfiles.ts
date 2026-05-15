import { useState, useEffect, useCallback } from 'react';
import { SavedProfile, getProfiles, saveProfile, deleteProfile as removeProfile } from '../lib/profileStorage';

export const useProfiles = () => {
  const [profiles, setProfiles] = useState<SavedProfile[]>([]);

  const refreshProfiles = useCallback(() => {
    setProfiles(getProfiles());
  }, []);

  useEffect(() => {
    refreshProfiles();
  }, [refreshProfiles]);

  const addProfile = useCallback((name: string, type: 'tube' | 'pan' | 'handle', data: any) => {
    const newProfile: SavedProfile = {
      id: Math.random().toString(36).substring(2, 9),
      name,
      type,
      data,
      createdAt: Date.now(),
    };
    saveProfile(newProfile);
    refreshProfiles();
  }, [refreshProfiles]);

  const deleteProfile = useCallback((id: string) => {
    removeProfile(id);
    refreshProfiles();
  }, [refreshProfiles]);

  return { profiles, addProfile, deleteProfile, refreshProfiles };
};
