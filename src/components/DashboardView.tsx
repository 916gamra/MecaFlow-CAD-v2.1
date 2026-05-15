import React, { useState } from 'react';
import { useProfiles } from '../hooks/useProfiles';
import { ProfileDetails } from './ProfileDetails';

interface DashboardViewProps {
  onNewPart: () => void;
  onLoadSTL: (buffer: ArrayBuffer, name: string) => void;
  onLoadConfig: () => void;
  hasSavedConfig: boolean;
}

const DashboardView: React.FC<DashboardViewProps> = ({
  onNewPart,
  onLoadSTL,
  onLoadConfig,
  hasSavedConfig,
}) => {
  const { profiles, deleteProfile } = useProfiles();
  const [showLibrary, setShowLibrary] = useState(false);
  const [selectedType, setSelectedType] = useState<'tube' | 'pan' | 'handle'>('tube');

  if (showLibrary) {
    const filteredProfiles = profiles.filter(p => p.type === selectedType);
    return (
      <div className="dashboard-view" style={{ justifyContent: 'flex-start', paddingTop: '4rem' }}>
        <div className="dashboard-glow" />
        
        <div className="max-w-4xl w-full mx-auto px-6 relative z-10">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-bold text-[var(--accent)] tracking-widest uppercase">النماذج المحفوظة</h2>
            <button 
              onClick={() => setShowLibrary(false)}
              className="px-4 py-2 border border-[var(--border)] rounded bg-black/40 text-[var(--text-dim)] hover:text-white transition-colors"
            >
              رجوع للرئيسية
            </button>
          </div>

          <div className="flex gap-2 mb-6 bg-[#0c0d10] p-1 border border-[var(--border)] rounded">
            <button
              onClick={() => setSelectedType('tube')}
              className={`flex-1 py-2 font-bold uppercase transition-colors rounded ${selectedType === 'tube' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-dim)] hover:text-[var(--accent)]'}`}
            >
              الأنابيب
            </button>
            <button
              onClick={() => setSelectedType('pan')}
              className={`flex-1 py-2 font-bold uppercase transition-colors rounded ${selectedType === 'pan' ? 'bg-amber-500 text-white' : 'text-[var(--text-dim)] hover:text-amber-500'}`}
            >
              المقالي
            </button>
            <button
              onClick={() => setSelectedType('handle')}
              className={`flex-1 py-2 font-bold uppercase transition-colors rounded ${selectedType === 'handle' ? 'bg-emerald-500 text-white' : 'text-[var(--text-dim)] hover:text-emerald-500'}`}
            >
              المقابض
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProfiles.length === 0 ? (
              <div className="col-span-full text-center text-[var(--text-dim)] py-12">
                لا توجد نماذج محفوظة في هذا القسم
              </div>
            ) : (
              filteredProfiles.map(p => (
                <div key={p.id} className="p-4 bg-white/5 border border-[var(--border)] rounded-lg hover:border-[var(--accent-blue)] transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg text-white">{p.name}</h3>
                    <button 
                      onClick={() => deleteProfile(p.id)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      حذف
                    </button>
                  </div>
                  <ProfileDetails profile={p} />
                  <div className="text-sm text-[var(--text-dim)] mt-4">
                    تم الحفظ: {new Date(p.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-view" id="dashboard-view">
      {/* Glow backdrop */}
      <div className="dashboard-glow" />

      {/* Logo */}
      <div className="dashboard-logo-section">
        <div className="dashboard-cube">
          <div className="dashboard-cube-inner" />
        </div>
        <h1 className="dashboard-title">MecaFlow-CAD</h1>
        <p className="dashboard-subtitle">نظام القطع بالليزر بتطابق صفري</p>
        <p className="dashboard-version">ZERO-GAP LASER SYSTEM v2.0</p>
      </div>

      {/* Cards */}
      <div className="dashboard-cards">
        {/* New Part */}
        <button className="dashboard-card card-new" onClick={onNewPart}>
          <div className="card-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <h3 className="card-title">قطعة جديدة</h3>
          <p className="card-desc">تصميم أنبوب ومقلاة ومقبض من الصفر</p>
        </button>

        {/* Load Saved */}
        <button
          className={`dashboard-card card-saved ${!hasSavedConfig ? 'disabled' : ''}`}
          onClick={onLoadConfig}
          disabled={!hasSavedConfig}
        >
          <div className="card-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <h3 className="card-title">العمل السابق</h3>
          <p className="card-desc">
            {hasSavedConfig
              ? 'متابعة آخر مساحة عمل'
              : 'لا يوجد عمل سابق'}
          </p>
        </button>

        {/* Profiles Library */}
        <button className="dashboard-card card-upload" onClick={() => setShowLibrary(true)}>
          <div className="card-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18" />
            </svg>
          </div>
          <h3 className="card-title">مكتبة النماذج</h3>
          <p className="card-desc">تصفح الأنابيب، المقالي، والمقابض المحفوظة</p>
        </button>
      </div>

      {/* Footer */}
      <div className="dashboard-footer">
        <span>CIOB Engineering</span>
        <span>·</span>
        <span>MecaFlow-CAD v2.0</span>
        <span>·</span>
        <span>Zero-Gap Laser Technology</span>
      </div>
    </div>
  );
};

export default DashboardView;
