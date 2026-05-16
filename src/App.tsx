import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ThreeCanvas from './components/ThreeCanvas';
import { ErrorBoundary } from './components/ErrorBoundary';
import DraftingView from './components/DraftingView';
import CNCView from './components/CNCView';
import ZeroGapControlPanel from './components/ZeroGapControlPanel';
import WizardStepper from './components/WizardStepper';
import DashboardView from './components/DashboardView';
import { CADState, WizardStep, WIZARD_STEPS } from './types';
import { StorageBridge } from './lib/storageBridge';
import { useProjectHistory } from './hooks/useProjectHistory';

const defaultZeroGap: CADState['zeroGap'] = {
  pan: {
    bottomDiameter: 120, topDiameter: 280, height: 50, curveRadius: 100,
    rimThickness: 2, bottomFilletRadius: 8, removeBottom: false, addRim: true,
    rimHeight: 3, wallThickness: 2.0, useShellPreview: true,
    innerMoldMode: false, applyThicknessToCut: false,
  },
  tube: {
    width: 38, height: 25, thickness: 1.2, totalLength: 120, partLength: 70,
    cornerRadius: 5.75, shape: 'بيضاوي',
  },
  handle: {
    shape: 'rectangular', width: 30, height: 20, depth: 80, thickness: 1.5,
    cornerRadius: 3, angleX: 0, angleY: 0, offsetZ: 0, insertionDepth: 15,
  },
  assembly: {
    tiltAngle: 15, handleAngleX: 0, handleAngleY: 10, handleOffset: 0,
    insertionDistance: 50, heightOffset: 25, tiltAxis: 'X',
  },
  renderMode: 'boolean',
  addFillet: true,
  thermalClearance: false,
  markOrientation: false,
  showGlow: true,
  showBorders: true,
};

const defaultInitialState: CADState = {
  parts: [],
  selectedPartId: null,
  viewMode: '3d',
  gridVisible: true,
  units: 'mm',
  zeroGap: defaultZeroGap,
  wizardStep: 'dashboard',
};

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [hasSavedConfig, setHasSavedConfig] = useState(false);
  const [dbLoaded, setDbLoaded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  const [defaultProjectId, setDefaultProjectId] = useState<string | undefined>();
  const { currentGeometry, updateGeometry, undo, redo, exportManufacturingFile, isLoading, canUndo, canRedo } = useProjectHistory(defaultProjectId);
  
  useEffect(() => {
    StorageBridge.getLatestProject().then(project => {
       if (project && project.id) {
         setHasSavedConfig(true);
         setDefaultProjectId(project.id);
       }
       setDbLoaded(true);
    }).catch(err => {
      console.error('Failed to load project from Dexie:', err);
      setDbLoaded(true);
    });
  }, []);

  const state: CADState = useMemo(() => {
    if (!currentGeometry) return defaultInitialState;
    if (currentGeometry.zeroGap) return currentGeometry;
    return {
      ...defaultInitialState,
      zeroGap: { ...defaultZeroGap, ...currentGeometry }
    };
  }, [currentGeometry]);
  
  // Wrapper to update state
  const setState = (updater: (prev: CADState) => CADState) => {
    updateGeometry(updater(state));
  };

  const canvasRef = useRef<{ exportSTL: () => void }>(null);

  // ── Wizard navigation ─────────────────────────────────────────────────────
  const setWizardStep = (step: WizardStep) => {
    setState(prev => {
      let newRenderMode = prev.zeroGap.renderMode;
      if (step === 'pan-tube-cut' || step === 'tube-handle-cut') {
        newRenderMode = 'preview';
      } else if (step === 'final-inspect') {
        newRenderMode = 'boolean';
      }
      return { 
        ...prev, 
        wizardStep: step,
        zeroGap: {
          ...prev.zeroGap,
          renderMode: newRenderMode
        }
      };
    });
  };

  const currentStepIdx = WIZARD_STEPS.indexOf(state.wizardStep);
  const canGoNext = currentStepIdx < WIZARD_STEPS.length - 1;
  const canGoPrev = currentStepIdx > 0;
  const goNext = () => { if (canGoNext) setWizardStep(WIZARD_STEPS[currentStepIdx + 1]); };
  const goPrev = () => { if (canGoPrev) setWizardStep(WIZARD_STEPS[currentStepIdx - 1]); };

  const isDashboard = state.wizardStep === 'dashboard';
  const showCanvas = !isDashboard;
  const showSidebar = !isDashboard;

  // ── Overlay views (Drafting / CNC) triggered from final-inspect ────────
  const [overlayView, setOverlayView] = useState<'drafting' | 'cnc' | null>(null);

  return (
    <>
      {showSplash && (
        <div className="splash-screen">
          <div className="splash-logo-container">
            <div className="splash-logo-cube"></div>
          </div>
          <div className="neon-text-lux">MecaFlow-CAD</div>
          <div className="neon-sub-lux">ZERO-GAP LASER SYSTEM</div>
        </div>
      )}

      <div className={`h-screen overflow-hidden flex flex-col font-sans ${showSplash ? 'opacity-0' : 'opacity-100 transition-opacity duration-1000'}`}>
        {/* ── Header with Wizard Stepper ────────────────────────────────── */}
        <header className="flex items-center justify-between bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 shrink-0 z-20">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-zinc-950">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>
              </div>
              <h1 className="font-bold tracking-tight text-lg">MecaFlow <span className="text-zinc-500 font-medium">CAD V2</span></h1>
            </div>
          </div>

          <div className="flex-1 flex justify-center">
            <WizardStepper currentStep={state.wizardStep} onStepClick={setWizardStep} />
          </div>

          <div className="flex gap-3 items-center">
            <div className="px-3 py-1 bg-zinc-800 rounded text-[10px] border border-zinc-700 font-mono text-zinc-400">v2.0</div>
          </div>
        </header>

        {/* ── Main Layout ──────────────────────────────────────────────── */}
        <main className={isDashboard ? "flex-1 flex overflow-hidden relative" : "flex-1 grid grid-cols-12 grid-rows-6 gap-4 p-4 pt-0 overflow-hidden relative"}>
          <div className={isDashboard ? "flex-1 flex flex-col overflow-hidden" : "col-span-8 row-span-6 flex flex-col overflow-hidden bg-zinc-900 border border-zinc-800 rounded-2xl relative group"}>
            {/* View Container */}
            <div className={`flex-1 relative group overflow-hidden`} style={{ backgroundImage: isDashboard ? 'none' : 'radial-gradient(circle, #333 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
              {isDashboard && (
                <DashboardView
                  onNewPart={() => setWizardStep('tube-design')}
                  onLoadSTL={(buffer, name) => {
                    setState(prev => ({
                      ...prev,
                      wizardStep: 'tube-design',
                      zeroGap: {
                        ...prev.zeroGap,
                        tube: { ...prev.zeroGap.tube, shape: 'مخصص', customStlBuffer: buffer, customStlName: name },
                      },
                    }));
                  }}
                  onLoadConfig={() => setWizardStep('tube-design')}
                  hasSavedConfig={hasSavedConfig}
                />
              )}

              {showCanvas && (
                <ErrorBoundary fallback={<div className="absolute inset-0 flex items-center justify-center p-4 bg-zinc-950/90 text-red-400 text-sm font-bold text-center">خطأ في العرض ثلاثي الأبعاد</div>}>
                  <ThreeCanvas
                    ref={canvasRef}
                    config={state.zeroGap}
                    gridVisible={state.gridVisible}
                    wizardStep={state.wizardStep}
                  />
                </ErrorBoundary>
              )}

              {/* Overlay: DraftingView / CNCView */}
              {overlayView === 'drafting' && (
                <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm overflow-auto">
                  <button
                    className="absolute top-4 left-4 z-60 px-3 py-1 bg-red-600 text-white rounded text-xs font-bold"
                    onClick={() => setOverlayView(null)}
                  >✕ إغلاق</button>
                  <DraftingView config={state.zeroGap} />
                </div>
              )}
              {overlayView === 'cnc' && (
                <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm overflow-auto">
                  <button
                    className="absolute top-4 left-4 z-60 px-3 py-1 bg-red-600 text-white rounded text-xs font-bold"
                    onClick={() => setOverlayView(null)}
                  >✕ إغلاق</button>
                  <CNCView config={state.zeroGap} exportManufacturingFile={exportManufacturingFile} />
                </div>
              )}

              {/* View HUD (only in non-dashboard) */}
              {showCanvas && (
                <div className="absolute top-4 left-4 flex gap-2 z-10">
                  <div className="bg-zinc-950/80 backdrop-blur px-2 py-1 rounded border border-zinc-700 text-[10px] font-mono text-zinc-400">Perspective</div>
                  <div className="bg-zinc-950/80 backdrop-blur px-2 py-1 rounded border border-zinc-700 text-[10px] font-mono text-zinc-400">Shaded with Edges</div>
                </div>
              )}
            </div>

            {/* Bottom Status Bar */}
            <div className={`absolute ${isDashboard ? 'bottom-0 left-0 right-0 h-[24px] border-t border-zinc-800 bg-zinc-900/80' : 'bottom-4 left-4 rounded-lg border border-zinc-700 bg-zinc-950/80 backdrop-blur'} px-4 py-2 flex items-center gap-5 text-zinc-500 text-[10px] uppercase font-mono z-20`}>
              <span className="flex items-center gap-2 text-zinc-300">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse" />
                {isDashboard ? 'جاهز' : `المرحلة ${currentStepIdx} / 6`}
              </span>
              {!isDashboard && (
                <>
                  <span>السمك: {state.zeroGap.tube.thickness}mm</span>
                  <span>الزاوية: {state.zeroGap.assembly.tiltAngle}°</span>
                </>
              )}
              <div className="ml-auto flex gap-4 text-emerald-500/70">
                <span>ZERO-GAP ACTIVE</span>
              </div>
            </div>
          </div>

          {/* ── Sidebar (hidden on dashboard) ──────────────────────────── */}
          {showSidebar && (
            <div className="col-span-4 row-span-6 bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col relative w-full">
              <ZeroGapControlPanel
                config={state.zeroGap}
                onUpdate={(newConfig) => setState(prev => ({ ...prev, zeroGap: newConfig }))}
                onExport={async () => {
                  const stl = await canvasRef.current?.exportSTL();
                  if (stl) await exportManufacturingFile(stl, 'stl');
                }}
                exportManufacturingFile={exportManufacturingFile}
                wizardStep={state.wizardStep}
                onNext={goNext}
                onPrev={goPrev}
                canGoNext={canGoNext}
                canGoPrev={canGoPrev}
                onOpenDrafting={() => setOverlayView('drafting')}
                onOpenCNC={() => setOverlayView('cnc')}
                onUndo={undo}
                onRedo={redo}
              />
            </div>
          )}
        </main>
      </div>
    </>
  );
}
