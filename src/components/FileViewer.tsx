import React, { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { STLLoader, OrbitControls } from 'three-stdlib';

interface FileViewerProps {
  onClose: () => void;
}

export const FileViewer: React.FC<FileViewerProps> = ({ onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelInfo, setModelInfo] = useState<{
    triangles: number;
    dimensions: { x: number; y: number; z: number };
  } | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(true);

  // Scene refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const axesHelperRef = useRef<THREE.AxesHelper | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize Three.js scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#121212');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 10000);
    camera.position.set(100, 100, 100);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(100, 200, 100);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight2.position.set(-100, -200, -100);
    scene.add(dirLight2);

    // Helpers
    const gridHelper = new THREE.GridHelper(500, 50, 0x444444, 0x222222);
    scene.add(gridHelper);
    gridHelperRef.current = gridHelper;

    const axesHelper = new THREE.AxesHelper(100);
    scene.add(axesHelper);
    axesHelperRef.current = axesHelper;

    // Animation loop
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  // Sync helpers with state
  useEffect(() => {
    if (gridHelperRef.current) gridHelperRef.current.visible = showGrid;
    if (axesHelperRef.current) axesHelperRef.current.visible = showAxes;
  }, [showGrid, showAxes]);

  const fitCameraToMesh = (mesh: THREE.Mesh) => {
    if (!cameraRef.current || !controlsRef.current) return;
    const boundingBox = new THREE.Box3().setFromObject(mesh);
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);

    const size = new THREE.Vector3();
    boundingBox.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = cameraRef.current.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;

    cameraRef.current.position.set(center.x + cameraZ * 0.5, center.y + cameraZ * 0.5, center.z + cameraZ);
    controlsRef.current.target.copy(center);
    controlsRef.current.update();
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const filename = file.name.toLowerCase();
    
    // STEP file check
    if (filename.endsWith('.step') || filename.endsWith('.stp')) {
      setError('STEP .step أو .stp غير مدعوم حالياً في المعاينة المباشرة. جاري العمل على دعمه لاحقاً.');
      return;
    }

    if (!filename.endsWith('.stl')) {
      setError('يرجى رفع ملف بصيغة STL');
      return;
    }

    setError(null);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const contents = e.target?.result;
        if (!contents || !sceneRef.current) return;

        const loader = new STLLoader();
        const geometry = loader.parse(contents as ArrayBuffer);
        
        geometry.center(); // Center the geometry
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
          color: 0xcccccc,
          metalness: 0.5,
          roughness: 0.5,
          side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);

        // Remove old mesh if exists
        if (meshRef.current) {
          sceneRef.current.remove(meshRef.current);
          meshRef.current.geometry.dispose();
          (meshRef.current.material as THREE.Material).dispose();
        }

        sceneRef.current.add(mesh);
        meshRef.current = mesh;

        // Calculate metadata
        const triangles = geometry.attributes.position.count / 3;
        const boundingBox = new THREE.Box3().setFromObject(mesh);
        const size = new THREE.Vector3();
        boundingBox.getSize(size);

        setModelInfo({
          triangles,
          dimensions: { x: size.x, y: size.y, z: size.z }
        });

        fitCameraToMesh(mesh);
      } catch (err) {
        console.error(err);
        setError('حدث خطأ أثناء قراءة ملف STL.');
      }
    };

    reader.onerror = () => {
      setError('حدث خطأ أثناء محاولة قراءة الملف.');
    };

    // Read as ArrayBuffer for binary/ascii STL loader.
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="absolute inset-0 z-[100] bg-black text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <h2 className="text-lg font-bold text-[var(--accent)] tracking-widest uppercase flex items-center gap-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="12" y1="18" x2="12" y2="12"></line>
            <line x1="9" y1="15" x2="15" y2="15"></line>
          </svg>
          معاينة ملفات 3D
        </h2>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-red-600/20 text-red-400 border border-red-600/50 hover:bg-red-600 hover:text-white rounded transition-colors text-sm font-bold"
        >
          ✕ إغلاق
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex relative">
        {/* Canvas Container */}
        <div ref={containerRef} className="flex-1 w-full h-full relative" />

        {/* Sidebar Controls */}
        <div className="w-80 border-l border-zinc-800 bg-zinc-900/50 p-4 flex flex-col gap-6 overflow-y-auto">
          {error && (
            <div className="bg-red-900/20 text-red-400 border border-red-900 p-3 rounded text-sm mb-2">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">رفع نموذج 3D</label>
            <input
              type="file"
              accept=".stl,.step,.stp"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold rounded flex items-center justify-center gap-2 transition-colors shadow-lg shadow-[var(--accent)]/20"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              اختر ملف STL / STEP
            </button>
            <span className="text-[10px] text-zinc-500 text-center mt-1">الامتدادات المدعومة حالياً: .STL فقط</span>
          </div>

          <div className="border-t border-zinc-800 pt-4 flex flex-col gap-3">
            <label className="block text-xs font-bold text-zinc-400 uppercase">خصائص العرض</label>
            
            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} className="rounded border-zinc-700 bg-zinc-800 text-[var(--accent)]" />
              إظهار الشبكة الأرضية
            </label>
            
            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input type="checkbox" checked={showAxes} onChange={e => setShowAxes(e.target.checked)} className="rounded border-zinc-700 bg-zinc-800 text-[var(--accent)]" />
              إظهار المحاور (X, Y, Z)
            </label>

            <button
              onClick={() => { if (meshRef.current) fitCameraToMesh(meshRef.current); }}
              className="mt-2 w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs uppercase tracking-wider rounded border border-zinc-700 transition-colors"
            >
              توسيط الكاميرا
            </button>
          </div>

          {modelInfo && (
            <div className="border-t border-zinc-800 pt-4 flex flex-col gap-3">
              <label className="block text-xs font-bold text-[var(--accent)] uppercase drop-shadow-md">معلومات النموذج</label>
              
              <div className="bg-zinc-950 p-3 rounded border border-zinc-800 flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">عدد المثلثات (Triangles):</span>
                  <span className="font-mono text-zinc-300">
                    {new Intl.NumberFormat('en-US').format(modelInfo.triangles)}
                  </span>
                </div>
                
                <div className="mt-2">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">الأبعاد (Dimensions):</span>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-black/40 border border-zinc-800 rounded p-1.5 text-center">
                      <span className="block text-[8px] text-red-400 mb-0.5">X (عرض)</span>
                      <span className="font-mono text-xs text-white">{modelInfo.dimensions.x.toFixed(2)}</span>
                    </div>
                    <div className="bg-black/40 border border-zinc-800 rounded p-1.5 text-center">
                      <span className="block text-[8px] text-green-400 mb-0.5">Y (ارتفاع)</span>
                      <span className="font-mono text-xs text-white">{modelInfo.dimensions.y.toFixed(2)}</span>
                    </div>
                    <div className="bg-black/40 border border-zinc-800 rounded p-1.5 text-center">
                      <span className="block text-[8px] text-blue-400 mb-0.5">Z (طول)</span>
                      <span className="font-mono text-xs text-white">{modelInfo.dimensions.z.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
