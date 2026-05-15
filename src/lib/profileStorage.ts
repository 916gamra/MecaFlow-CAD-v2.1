export interface SavedProfile {
  id: string;
  name: string;
  type: 'tube' | 'pan' | 'handle';
  data: any;
  createdAt: number;
}

const STORAGE_KEY = 'mecaflow_saved_profiles';

export const getProfiles = (): SavedProfile[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

export const saveProfile = (profile: SavedProfile) => {
  const profiles = getProfiles();
  profiles.push(profile);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
};

export const deleteProfile = (id: string) => {
  const profiles = getProfiles();
  const updated = profiles.filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};
