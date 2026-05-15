import React from 'react';
import { SavedProfile } from '../lib/profileStorage';

export const ProfileDetails: React.FC<{ profile: SavedProfile }> = ({ profile }) => {
  const { type, data } = profile;

  if (type === 'tube') {
    return (
      <div className="flex flex-wrap gap-1 mt-2 mb-2">
        <span className="px-1.5 py-0.5 bg-black/40 border border-[var(--border)] rounded text-[9px] text-[var(--accent)]">
          الشكل: {data.shape === 'oval' ? 'بيضاوي' : 'مستطيل'}
        </span>
        <span className="px-1.5 py-0.5 bg-black/40 border border-[var(--border)] rounded text-[9px] text-[var(--text-main)]">
          العرض: {data.width}mm
        </span>
        <span className="px-1.5 py-0.5 bg-black/40 border border-[var(--border)] rounded text-[9px] text-[var(--text-main)]">
          الارتفاع: {data.height}mm
        </span>
        <span className="px-1.5 py-0.5 bg-black/40 border border-[var(--border)] rounded text-[9px] text-[var(--text-main)]">
          السمك: {data.thickness}mm
        </span>
        <span className="px-1.5 py-0.5 bg-black/40 border border-[var(--border)] rounded text-[9px] text-[var(--text-dim)]">
          طول: {data.totalLength}mm
        </span>
      </div>
    );
  }

  if (type === 'pan') {
    return (
      <div className="flex flex-wrap gap-1 mt-2 mb-2">
        <span className="px-1.5 py-0.5 bg-black/40 border border-[var(--border)] rounded text-[9px] text-amber-400">
          قاع: {data.bottomDiameter}mm
        </span>
        <span className="px-1.5 py-0.5 bg-black/40 border border-[var(--border)] rounded text-[9px] text-[var(--text-main)]">
          قمة: {data.topDiameter}mm
        </span>
        <span className="px-1.5 py-0.5 bg-black/40 border border-[var(--border)] rounded text-[9px] text-[var(--text-main)]">
          ارتفاع: {data.height}mm
        </span>
      </div>
    );
  }

  if (type === 'handle') {
    return (
      <div className="flex flex-wrap gap-1 mt-2 mb-2">
        <span className="px-1.5 py-0.5 bg-black/40 border border-[var(--border)] rounded text-[9px] text-emerald-400">
          الشكل: {data.shape === 'rectangular' ? 'مستطيل' : 'اسطواني'}
        </span>
        <span className="px-1.5 py-0.5 bg-black/40 border border-[var(--border)] rounded text-[9px] text-[var(--text-main)]">
          طول: {data.totalLength}mm
        </span>
        <span className="px-1.5 py-0.5 bg-black/40 border border-[var(--border)] rounded text-[9px] text-[var(--text-main)]">
          عرض القاعدة: {data.baseWidth}mm
        </span>
      </div>
    );
  }

  return null;
};
