import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { OrbitControls, STLExporter, STLLoader } from 'three-stdlib';
import { Brush, Evaluator, SUBTRACTION, INTERSECTION, ADDITION } from 'three-bvh-csg';
import { ZeroGapState, WizardStep } from '../types';
import { StorageBridge } from '../lib/storageBridge';
import { validateTubeConfig, validatePanConfig } from '../lib/validators';
import { performanceOptimizer } from '../lib/performanceOptimizer';
import { ViewportGizmo } from './ViewportGizmo';
import { errorHandler } from '../lib/errorHandler';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Box, Focus, Cylinder } from 'lucide-react';


interface ThreeCanvasProps {
  config: ZeroGapState;
  gridVisible: boolean;
  wizardStep: WizardStep;
  onDimensionsChange?: (dimensions: {l: number, w: number, h: number} | null) => void;
  finalPartFromHandle?: THREE.Object3D | null;
  onResultComputed?: (obj: THREE.Object3D) => void;
}

export interface ThreeCanvasRef {
  exportSTL: () => Promise<string | null>;
}

const ThreeCanvas = forwardRef<ThreeCanvasRef, ThreeCanvasProps>(({ config, gridVisible, wizardStep, onDimensionsChange, finalPartFromHandle, onResultComputed }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const exportMeshRef = useRef<THREE.Object3D | null>(null);
  const hasAutoCentered = useRef<boolean>(false);
  const lastStlName = useRef<string | undefined>(config.tube.customStlName);
  const lastStep = useRef<WizardStep>(wizardStep);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── STL Export ──────────────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    exportSTL: async () => {
      if (!exportMeshRef.current) return null;
      const exporter = new STLExporter();
      
      const stlString = exporter.parse(exportMeshRef.current);
      return stlString;
    }
  }));

  // ─── Geometry Worker Initialization ──────────────────────────────────────────
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // تجهيز الـ Worker لمعالجة الحسابات المعقدة في مسار موازي (Background)
    workerRef.current = new Worker(new URL('../workers/geometry.worker.ts', import.meta.url));
    workerRef.current.onmessage = (e) => {
      const { status, data, message } = e.data;
      if (status === 'COMPLETE') {
        console.log('[Worker] تمت المعالجة بنجاح:', data);
        // في المستقبل، سيتم هنا استقبال الإحداثيات والـ Buffers المحدثة لرسمها فوراً
      } else if (status === 'ERROR') {
        console.error('[Worker] خطأ هندسي:', message);
      }
    };
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // ─── Scene Initialization (runs once) ────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    // WebGL check
    const checkWebGL = () => {
      try {
        const canvas = document.createElement('canvas');
        return !!(window.WebGLRenderingContext &&
          (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
      } catch {
        return false;
      }
    };
    if (!checkWebGL()) {
      setWebglError('يرجى تفعيل تسريع الأجهزة (Hardware Acceleration) في المتصفح.');
      return;
    }

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090A0C);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      2000
    );
    camera.position.set(200, 150, 250);
    cameraRef.current = camera;

    // Renderer (with safe-mode fallback)
    let renderer: THREE.WebGLRenderer;
    const initRenderer = (safe: boolean) => {
      const origErr = console.error;
      const origWarn = console.warn;
      console.error = () => {};
      console.warn = () => {};
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: !safe,
          alpha: true,
          powerPreference: safe ? 'default' : 'high-performance',
          precision: safe ? 'mediump' : 'highp',
        });
        renderer.domElement.style.display = 'block';
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        renderer.setSize(containerRef.current!.clientWidth, containerRef.current!.clientHeight);
        renderer.shadowMap.enabled = !safe;
        containerRef.current!.appendChild(renderer.domElement);
        return renderer;
      } finally {
        console.error = origErr;
        console.warn = origWarn;
      }
    };

    try { renderer = initRenderer(false); }
    catch { try { renderer = initRenderer(true); } catch { setWebglError('خطأ فادح في WebGL.'); return; } }
    rendererRef.current = renderer!;

    // OrbitControls
    const controls = new OrbitControls(camera, renderer!.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(100, 200, 100);
    scene.add(dirLight1);
    const dirLight2 = new THREE.DirectionalLight(0xaaccff, 0.8);
    dirLight2.position.set(-100, -50, -100);
    scene.add(dirLight2);

    // Grid & Axes
    const grid = new THREE.GridHelper(500, 50, 0x333333, 0x1a1a1a);
    grid.position.y = -0.1;
    scene.add(grid);
    scene.add(new THREE.AxesHelper(100));

    // Animation loop
    const timer = new (THREE as any).Timer();
    let animId: number;
    const animate = (timestamp: number) => {
      animId = requestAnimationFrame(animate);
      timer.update(timestamp);
      const time = timer.getElapsed() * 3;

      // Pulsing glow for green penetration zone
      const glowObj = scene.getObjectByName('zerogap_intersection_zone');
      if (glowObj && glowObj instanceof THREE.Mesh) {
        const mat = glowObj.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 1.0 + Math.sin(time) * 1.0;
        mat.opacity = 0.3 + Math.sin(time) * 0.15;
      }

      // Subtle pulse for the pan contact ring (now a Mesh, not LineSegments)
      const ringObj = scene.getObjectByName('zerogap_pan_ring');
      if (ringObj && ringObj instanceof THREE.Mesh) {
        const mat = ringObj.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.8 + Math.sin(time * 1.5) * 0.15;
      }

      // Laser point animation
      const laserPoint = scene.getObjectByName('zerogap_laser_dot');
      if (laserPoint && laserPoint.userData.points && laserPoint.userData.points.length > 0) {
        const pts = laserPoint.userData.points;
        const speed = 0.5;
        const index = Math.floor((timestamp * speed) % pts.length);
        const p = pts[index];
        
        laserPoint.position.set(p.x, p.y, p.z);
        
        // Add a small trail or light effect
        const laserLight = scene.getObjectByName('zerogap_laser_light') as THREE.PointLight;
        if (laserLight) {
          laserLight.position.copy(laserPoint.position);
          laserLight.intensity = 2.0 + Math.sin(time * 5) * 1.0;
        }
      }

      controls.update();
      renderer!.render(scene, camera);
      performanceOptimizer.measureFPS();
    };
    requestAnimationFrame(animate);

    // Resize observer
    const resizeObs = new ResizeObserver(entries => {
      window.requestAnimationFrame(() => {
        if (!entries.length) return;
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0 && renderer && camera) {
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height, false);
        }
      });
    });
    resizeObs.observe(containerRef.current);

    return () => {
      resizeObs.disconnect();
      cancelAnimationFrame(animId);
      if (renderer) {
        try {
          renderer.forceContextLoss();
        } catch(e) {
          console.warn('Failed to force context loss', e);
        }
        renderer.dispose();
        renderer.domElement.remove();
      }
    };
  }, []);

  // ─── Geometry Engine (debounced) ─────────────────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || webglError) return;

    // Cheap operations: apply immediately (no debounce)
    const grid = scene.children.find(c => c instanceof THREE.GridHelper);
    if (grid) grid.visible = gridVisible;

    // Debounce the expensive CSG rebuild
    if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      const scene = sceneRef.current; // Re-read inside timeout for safety
      if (!scene) return;

      // Early exit for final inspection or technical review (removed for live interaction in Step 6/7)
      
      // ── Validate inputs ──────────────────────────────────────────────────────
      const needsTube = wizardStep !== 'pan-design' && wizardStep !== 'handle-design';
      const needsPan  = wizardStep === 'pan-design' || wizardStep === 'pan-tube-cut' || wizardStep === 'tube-handle-cut' || wizardStep === 'technical-review' || wizardStep === 'final-inspect';
      const needsHandle = wizardStep === 'handle-design' || wizardStep === 'tube-handle-cut' || wizardStep === 'technical-review' || wizardStep === 'final-inspect';
      const needsCSG = wizardStep === 'pan-tube-cut' || wizardStep === 'tube-handle-cut' || wizardStep === 'technical-review' || wizardStep === 'final-inspect';

      try {
        if (needsTube) validateTubeConfig(config.tube);
        if (needsPan)  validatePanConfig(config.pan);

        // إرسال البيانات للمعالجة في مسار فرعي لتجنب تجميد الشاشة
        if (workerRef.current) {
          workerRef.current.postMessage({
            action: 'COMPUTE_GEOMETRY',
            payload: { tube: config.tube, pan: config.pan, handle: config.handle, assembly: config.assembly }
          });
        }
      } catch (err: any) {
        console.warn('Validation:', err.message);
        return;
      }

      // ── Dispose previous 'zerogap_' objects ─────────────────────────────────
      const disposeDeep = (obj: THREE.Object3D) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments || obj instanceof THREE.Line) {
          if (obj.geometry) obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else if (obj.material) (obj.material as THREE.Material).dispose();
        }
        obj.children.forEach(disposeDeep);
      };
      const toRemove = scene.children.filter(c => c.name.startsWith('zerogap_'));
      toRemove.forEach(obj => { scene.remove(obj); disposeDeep(obj); });
      exportMeshRef.current = null;

      try {
        // ── 1. Tube — 3-Part Logic (Head / Body / Tail) ─────────────────────
        const tw = config.tube.width;
        const th = config.tube.shape === 'دائري' ? tw : config.tube.height;
        const tl = config.tube.totalLength;
        let tubeGeom: THREE.BufferGeometry;

        const getHeadTailLengths = () => {
          const dPan = config.assembly.insertionDistance || 10;
          const dHandle = config.handle.insertionDepth || 10;
          return { headLength: Math.max(dPan, 10), tailLength: Math.max(dHandle, 10) };
        };

        const { headLength, tailLength } = getHeadTailLengths();
        let bodyLength = tl - headLength - tailLength;
        if (bodyLength < 1) bodyLength = 1;

        if (config.tube.shape === 'مخصص' && config.tube.customStlBuffer) {
          const loader = new STLLoader();
          tubeGeom = loader.parse(config.tube.customStlBuffer);
          tubeGeom.center();
          tubeGeom.computeVertexNormals();
        } else {
          const tt = config.tube.thickness;
          const tr = config.tube.shape === 'دائري' ? tw / 2 : config.tube.cornerRadius;
          const clearance = config.thermalClearance ? 0.1 : 0;

          const buildSection = (): THREE.Shape => {
            const outerShape = new THREE.Shape();
            const tx = -tw / 2, ty = -th / 2;
            if (tr > 0) {
              outerShape.moveTo(tx + tr, ty);
              outerShape.lineTo(tx + tw - tr, ty);
              outerShape.quadraticCurveTo(tx + tw, ty, tx + tw, ty + tr);
              outerShape.lineTo(tx + tw, ty + th - tr);
              outerShape.quadraticCurveTo(tx + tw, ty + th, tx + tw - tr, ty + th);
              outerShape.lineTo(tx + tr, ty + th);
              outerShape.quadraticCurveTo(tx, ty + th, tx, ty + th - tr);
              outerShape.lineTo(tx, ty + tr);
              outerShape.quadraticCurveTo(tx, ty, tx + tr, ty);
            } else {
              outerShape.moveTo(tx, ty);
              outerShape.lineTo(tx + tw, ty);
              outerShape.lineTo(tx + tw, ty + th);
              outerShape.lineTo(tx, ty + th);
              outerShape.lineTo(tx, ty);
            }
            const etl = tt - clearance;
            const itr = Math.max(0, tr - etl);
            const itx = tx + etl, ity = ty + etl;
            const itw = tw - 2 * etl, ith = th - 2 * etl;
            if (itw > 0 && ith > 0) {
              const hole = new THREE.Path();
              if (itr > 0) {
                hole.moveTo(itx + itr, ity);
                hole.lineTo(itx + itw - itr, ity);
                hole.quadraticCurveTo(itx + itw, ity, itx + itw, ity + itr);
                hole.lineTo(itx + itw, ity + ith - itr);
                hole.quadraticCurveTo(itx + itw, ity + ith, itx + itw - itr, ity + ith);
                hole.lineTo(itx + itr, ity + ith);
                hole.quadraticCurveTo(itx, ity + ith, itx, ity + ith - itr);
                hole.lineTo(itx, ity + itr);
                hole.quadraticCurveTo(itx, ity, itx + itr, ity);
              } else {
                hole.moveTo(itx, ity);
                hole.lineTo(itx + itw, ity);
                hole.lineTo(itx + itw, ity + ith);
                hole.lineTo(itx, ity + ith);
                hole.lineTo(itx, ity);
              }
              outerShape.holes.push(hole);
            }
            return outerShape;
          };

          // Use a single ExtrudeGeometry to avoid internal face artifacts in CSG
          tubeGeom = new THREE.ExtrudeGeometry(buildSection(), { depth: tl, bevelEnabled: false, curveSegments: 16 });
        }

        const tuParams = `${config.tube.shape}-${tw}-${th}-${tl}-${config.tube.thickness}`;
        const tubeMesh = new THREE.Mesh(tubeGeom, new THREE.MeshStandardMaterial({
          color: 0xcccccc, metalness: 0.5, roughness: 0.3
        }));
        tubeMesh.name = 'zerogap_tube_main'; 
        tubeGeom.center();
        tubeGeom.computeBoundingBox();

        // ── 2. Handle ──────────────────────────────────────────────
        let handleGeom: THREE.BufferGeometry | null = null;
        let handleMeshObj: THREE.Mesh | null = null;
        if (needsHandle) {
          const hCfg = config.handle;
          const isSolid = !!hCfg.solid;
          
          if (hCfg.shape === 'cylindrical') {
            if (isSolid) {
              handleGeom = new THREE.CylinderGeometry(hCfg.width / 2, hCfg.width / 2, hCfg.depth, 32, 1, false);
            } else {
              const outerR = hCfg.width / 2;
              const innerR = Math.max(0.1, outerR - hCfg.thickness);
              const outerCyl = new THREE.CylinderGeometry(outerR, outerR, hCfg.depth, 32, 1, true);
              const innerCyl = new THREE.CylinderGeometry(innerR, innerR, hCfg.depth, 32, 1, true);
              const topRing = new THREE.RingGeometry(innerR, outerR, 32);
              topRing.rotateX(-Math.PI / 2); topRing.translate(0, hCfg.depth / 2, 0);
              const bottomRing = new THREE.RingGeometry(innerR, outerR, 32);
              bottomRing.rotateX(Math.PI / 2); bottomRing.translate(0, -hCfg.depth / 2, 0);
              try { handleGeom = BufferGeometryUtils.mergeGeometries([outerCyl, innerCyl, topRing, bottomRing], false); }
              catch { handleGeom = outerCyl; }
            }
            handleGeom.rotateX(Math.PI / 2);
          } else {
            const hw = hCfg.width, hh = hCfg.height, hd = hCfg.depth;
            const hr = Math.min(hCfg.cornerRadius, hw / 2, hh / 2);
            const hShape = new THREE.Shape();
            const hx = -hw / 2, hy = -hh / 2;
            if (hr > 0) {
              hShape.moveTo(hx + hr, hy); hShape.lineTo(hx + hw - hr, hy);
              hShape.quadraticCurveTo(hx + hw, hy, hx + hw, hy + hr);
              hShape.lineTo(hx + hw, hy + hh - hr);
              hShape.quadraticCurveTo(hx + hw, hy + hh, hx + hw - hr, hy + hh);
              hShape.lineTo(hx + hr, hy + hh);
              hShape.quadraticCurveTo(hx, hy + hh, hx, hy + hh - hr);
              hShape.lineTo(hx, hy + hr);
              hShape.quadraticCurveTo(hx, hy, hx + hr, hy);
            } else {
              hShape.moveTo(hx, hy); hShape.lineTo(hx + hw, hy);
              hShape.lineTo(hx + hw, hy + hh); hShape.lineTo(hx, hy + hh); hShape.closePath();
            }
            if (!isSolid) {
              const it = hCfg.thickness;
              if (it > 0 && it < hw / 2 && it < hh / 2) {
                const ir = Math.max(0, hr - it);
                const ix = hx + it, iy = hy + it, iw = hw - 2 * it, ih = hh - 2 * it;
                const hole = new THREE.Path();
                if (ir > 0) {
                  hole.moveTo(ix + ir, iy); hole.lineTo(ix + iw - ir, iy);
                  hole.quadraticCurveTo(ix + iw, iy, ix + iw, iy + ir);
                  hole.lineTo(ix + iw, iy + ih - ir);
                  hole.quadraticCurveTo(ix + iw, iy + ih, ix + iw - ir, iy + ih);
                  hole.lineTo(ix + ir, iy + ih);
                  hole.quadraticCurveTo(ix, iy + ih, ix, iy + ih - ir);
                  hole.lineTo(ix, iy + ir);
                  hole.quadraticCurveTo(ix, iy, ix + ir, iy);
                } else {
                  hole.moveTo(ix, iy); hole.lineTo(ix + iw, iy);
                  hole.lineTo(ix + iw, iy + ih); hole.lineTo(ix, iy + ih); hole.closePath();
                }
                hShape.holes.push(hole);
              }
            }
            handleGeom = new THREE.ExtrudeGeometry(hShape, { depth: hd, bevelEnabled: false, curveSegments: 16 });
          }
          handleGeom.center();
          handleMeshObj = new THREE.Mesh(handleGeom, new THREE.MeshStandardMaterial({ color: 0x22c55e, metalness: 0.5, roughness: 0.3 }));
          handleMeshObj.name = 'zerogap_handle_main';
        }

        // ── 3. Pan ────────────────────────────────────────────────
        let panGeom: THREE.LatheGeometry | null = null;
        let panMesh: THREE.Mesh | null = null;
        let panInnerGeom: THREE.LatheGeometry | null = null;
        let panInnerMesh: THREE.Mesh | null = null;

        if (needsPan) {
          const wt = config.pan.wallThickness || 2.0;
          const rBottom = config.pan.innerMoldMode
            ? config.pan.bottomDiameter / 2 + wt
            : config.pan.bottomDiameter / 2;
          const rTop = config.pan.innerMoldMode
            ? config.pan.topDiameter / 2 + wt
            : config.pan.topDiameter / 2;
          const panH = config.pan.height;
          const rimThick = config.pan.rimThickness || 2.0;
          const curveRad = config.pan.curveRadius ?? 100.0;
          const filletR = config.pan.bottomFilletRadius || 8.0;
          const addRim = config.pan.addRim;
          const rimH = config.pan.rimHeight || 3.0;

          const buildPanProfile = (rOff: number): THREE.Vector2[] => {
            const rb = Math.max(1, rBottom - rOff);
            const rt = Math.max(1, rTop - rOff);
            const fR = Math.max(0, filletR - rOff);
            const p: THREE.Vector2[] = [];

            if (config.pan.removeBottom) {
              p.push(new THREE.Vector2(0, rOff > 0 ? wt : 0));
              p.push(new THREE.Vector2(rb, rOff > 0 ? wt : 0));
            } else {
              p.push(new THREE.Vector2(0, rOff > 0 ? wt : 0));
              if (fR > 0) {
                const segs = 16;
                for (let i = 0; i <= segs; i++) {
                  const theta = (Math.PI / 2) * (1 - i / segs);
                  p.push(new THREE.Vector2(rb - fR + fR * Math.cos(theta), (rOff > 0 ? wt : 0) + fR - fR * Math.sin(theta)));
                }
              } else {
                p.push(new THREE.Vector2(rb, rOff > 0 ? wt : 0));
              }
            }

            const startZ = (rOff > 0 ? wt : 0) + (config.pan.removeBottom ? 0 : fR);
            const bulgeReduction = rOff >= wt ? rOff * 0.3 : 0;
            const bulge = Math.max(1.0, Math.min(20.0, (200.0 / curveRad) * 4.0) - bulgeReduction);
            const rM = (rb + rt) / 2.0 + bulge;
            const zM = (startZ + panH) / 2.0;
            const cpx = 2 * rM - 0.5 * rb - 0.5 * rt;
            const cpy = 2 * zM - 0.5 * startZ - 0.5 * panH;
            const c = new THREE.QuadraticBezierCurve(
              new THREE.Vector2(rb, startZ), new THREE.Vector2(cpx, cpy), new THREE.Vector2(rt, panH)
            );
            p.push(...c.getPoints(32).slice(1));
            
            if (addRim && rOff === 0) {
              p.push(new THREE.Vector2(rt + rimThick, panH));
              p.push(new THREE.Vector2(rt + rimThick, panH + rimH));
              p.push(new THREE.Vector2(0, panH + rimH));
            } else {
              p.push(new THREE.Vector2(rt + (rOff === 0 ? rimThick : 0), panH));
              p.push(new THREE.Vector2(0, panH));
            }
            return p.filter((pt, i) => i === 0 || !pt.equals(p[i - 1]));
          };

          const outerPts = buildPanProfile(0);
          panGeom = new THREE.LatheGeometry(outerPts, 64);
          panMesh = new THREE.Mesh(panGeom, new THREE.MeshStandardMaterial({ 
            color: 0xff3333, 
            side: THREE.DoubleSide, 
            opacity: config.renderMode === 'boolean' ? 0.0 : 0.8, 
            transparent: true 
          }));
          panMesh.name = 'zerogap_pan';

          if (config.pan.useShellPreview) {
            const innerPts = buildPanProfile(wt);
            panInnerGeom = new THREE.LatheGeometry(innerPts, 64);
            panInnerMesh = new THREE.Mesh(panInnerGeom, new THREE.MeshStandardMaterial({ 
              color: 0xff3333, 
              side: THREE.DoubleSide, 
              opacity: 0.8, 
              transparent: true 
            }));
            panInnerMesh.name = 'zerogap_pan_inner';
          }
        }


        // ── TUBE-ONLY STEP ──────────────────────────────────────────────────
        if (wizardStep === 'tube-design') {
          tubeMesh.name = 'zerogap_tube_solo';
          try {
            const edges = new THREE.EdgesGeometry(tubeGeom);
            if (edges.attributes.position?.count > 0) {
              tubeMesh.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x333333 })));
            }
          } catch { /* edge gen failed */ }
          scene.add(tubeMesh);
          exportMeshRef.current = tubeMesh;
          setIsLoading(false);
          // Auto-frame: always reset camera in tube-design
          if (controlsRef.current && cameraRef.current) {
            const bb = new THREE.Box3().setFromObject(tubeMesh);
            const center = new THREE.Vector3(); bb.getCenter(center);
            controlsRef.current.target.set(0, 0, 0);
            const maxDim = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) || 100;
            const fov = cameraRef.current.fov * (Math.PI / 180);
            const dist = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;
            cameraRef.current.position.set(dist * 0.5, dist * 0.6, dist);
            controlsRef.current.update();
          }
          return;
        }


        // ── PAN-ONLY STEP ───────────────────────────────────────────────────
        if (wizardStep === 'pan-design' && panGeom && panMesh) {
          const panOuterWf = new THREE.Mesh(panGeom, new THREE.MeshBasicMaterial({ color: 0x00E5FF, wireframe: true, transparent: true, opacity: 0.35 }));
          panOuterWf.name = 'zerogap_pan_outer_wf';
          scene.add(panOuterWf);
          if (config.pan.useShellPreview && panInnerGeom) {
            const panInnerWf = new THREE.Mesh(panInnerGeom, new THREE.MeshBasicMaterial({ color: 0xFFA500, wireframe: true, transparent: true, opacity: 0.25 }));
            panInnerWf.name = 'zerogap_pan_inner_wf';
            scene.add(panInnerWf);
          }
          exportMeshRef.current = panOuterWf;
          setIsLoading(false);
          if (controlsRef.current && cameraRef.current) {
            const bb = new THREE.Box3().setFromObject(panOuterWf);
            const center = new THREE.Vector3(); bb.getCenter(center);
            controlsRef.current.target.set(0, 0, 0);
            const maxDim = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) || 100;
            const fov = cameraRef.current.fov * (Math.PI / 180);
            const dist = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;
            cameraRef.current.position.set(dist * 0.5, dist * 0.6, dist); // Centered
            controlsRef.current.update();
          }
          return;
        }

        // ── HANDLE-ONLY STEP ────────────────────────────────────────────────
        if (wizardStep === 'handle-design') {
          if (handleMeshObj && handleGeom) {
             const hEdges = new THREE.EdgesGeometry(handleGeom);
             handleMeshObj.add(new THREE.LineSegments(hEdges, new THREE.LineBasicMaterial({ color: 0x115533, transparent: true, opacity: 0.5 })));
             scene.add(handleMeshObj);
             exportMeshRef.current = handleMeshObj;
          }
          const bgTubeMesh = new THREE.Mesh(tubeGeom.clone(), new THREE.MeshBasicMaterial({
            color: 0xaaaaaa, wireframe: true, transparent: true, opacity: 0.15
          }));
          bgTubeMesh.name = 'zerogap_tube_bg_wf';
          scene.add(bgTubeMesh);
          
          setIsLoading(false);
          if (controlsRef.current && cameraRef.current && handleMeshObj) {
            controlsRef.current.target.set(0, 0, 0);
            const bb = new THREE.Box3().setFromObject(handleMeshObj);
            const maxDim = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) || 100;
            const fov = cameraRef.current.fov * (Math.PI / 180);
            const dist = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;
            cameraRef.current.position.set(dist * 0.5, dist * 0.6, dist); // Centered
            controlsRef.current.update();
          }
          return;
        }

        // ── 4. Apply assembly transforms ────────────────────────────────
        const angleRad = (90 + config.assembly.tiltAngle) * (Math.PI / 180);
        const tubeRoll = (config.assembly.handleAngleY || 0) * (Math.PI / 180);

        const effectiveRenderMode = (wizardStep === 'technical-review' || wizardStep === 'final-inspect') ? 'boolean' : config.renderMode;

        // Pan at partLength relative to the tube center (which is 0,0,0 initially)
        const panZOffset = config.tube.partLength - tl / 2;
        if (panMesh) {
          panMesh.position.set(0, 0, panZOffset);
          panMesh.updateMatrixWorld(true);
        }
        if (panInnerMesh) {
          panInnerMesh.position.set(0, 0, panZOffset);
          panInnerMesh.updateMatrixWorld(true);
        }

        // Tube tilt + offset — Apply inverse of insertion distance
        const maxInsertion = 150;
        const invertedInsertion = maxInsertion - (config.assembly.insertionDistance || 0);

        tubeMesh.position.set(0, config.assembly.heightOffset, -invertedInsertion);
        tubeMesh.rotation.set(angleRad, 0, tubeRoll);
        tubeMesh.updateMatrixWorld(true);

        // Handle at End B
        if (handleMeshObj) {
          const hCfg2 = config.handle;
          handleMeshObj.position.set(hCfg2.offsetZ || 0, 0, -tl / 2 + (150 - (hCfg2.insertionDepth || 0)));
          handleMeshObj.rotation.x = (hCfg2.angleX || 0) * (Math.PI / 180);
          handleMeshObj.rotation.y = (hCfg2.angleY || 0) * (Math.PI / 180);
          
          // Since we are restoring the old way, the handle must rotate with the tube!
          // BUT wait, in the old code handleMeshObj was a separate mesh, AND it was rotated individually?
          // No, if handleMeshObj is placed at z=tl/2, it must be subject to tubeMesh's rotation!
          // Ah, in the old code `handleMeshObj` was NOT added to tubeMesh until M5 step maybe?
          // Let's add handleMeshObj directly to tubeMesh!
          tubeMesh.add(handleMeshObj);
        }
        tubeMesh.updateMatrixWorld(true);

        // ── Render ──────────────────────────────────────────────────
        let finalResultMesh = tubeMesh;

        const getBrush = (mesh: THREE.Object3D, geom: THREE.BufferGeometry) => {
             const brush = new Brush(geom.clone());
             mesh.updateMatrixWorld(true);
             mesh.getWorldPosition(brush.position);
             mesh.getWorldQuaternion(brush.quaternion);
             mesh.getWorldScale(brush.scale);
             brush.updateMatrixWorld(true);
             return brush;
        };

        if (effectiveRenderMode === 'preview') {
          // Preview Mode: Show raw objects
          if (wizardStep === 'pan-tube-cut' || wizardStep === 'final-inspect' || wizardStep === 'technical-review' || wizardStep === 'tube-handle-cut') {
            scene.add(tubeMesh);
            exportMeshRef.current = tubeMesh;

            if (panMesh && (wizardStep === 'pan-tube-cut' || wizardStep === 'final-inspect' || wizardStep === 'technical-review' || wizardStep === 'tube-handle-cut')) {
              scene.add(panMesh);
              if (panInnerMesh && config.pan.useShellPreview) scene.add(panInnerMesh);
            }
          }
        } else {
          // Boolean Mode (Zero Cut)
          const centerObject = (mesh: THREE.Object3D) => {
            if (mesh instanceof THREE.Mesh && mesh.geometry && !mesh.userData.isCentered) {
              mesh.userData.isCentered = true;
              mesh.geometry.computeBoundingBox();
              const center = new THREE.Vector3();
              mesh.geometry.boundingBox?.getCenter(center);
              mesh.userData.centeredOffset = center.clone();
              mesh.geometry.translate(-center.x, -center.y, -center.z);
              mesh.position.set(0, 0, 0);
              mesh.updateMatrixWorld(true);
            }
          };

          if (wizardStep === 'final-inspect' && finalPartFromHandle) {
            finalResultMesh = finalPartFromHandle.clone() as any;
            finalResultMesh.name = 'zerogap_result';
            centerObject(finalResultMesh);
            scene.add(finalResultMesh);
            exportMeshRef.current = finalResultMesh;
            setIsLoading(false);
          } else {
            setIsLoading(true);
            const tBrush = getBrush(tubeMesh, tubeGeom);
            let resultBrush = tBrush;
            const boolEval = new Evaluator();

            if (panGeom && panMesh && (wizardStep === 'pan-tube-cut' || wizardStep === 'final-inspect' || wizardStep === 'technical-review' || wizardStep === 'tube-handle-cut')) {
               const pG = config.pan.applyThicknessToCut && panInnerGeom ? panInnerGeom : panGeom;
               const pBrush = getBrush(panMesh, pG);
               resultBrush = boolEval.evaluate(resultBrush, pBrush, SUBTRACTION);
            }

            if (handleGeom && handleMeshObj && (wizardStep === 'tube-handle-cut' || wizardStep === 'technical-review' || wizardStep === 'final-inspect')) {
               const hBrush = getBrush(handleMeshObj, handleGeom);
               resultBrush = boolEval.evaluate(resultBrush, hBrush, SUBTRACTION);
            }

            if (!resultBrush.geometry.attributes.position || resultBrush.geometry.attributes.position.count === 0) {
              resultBrush.geometry = new THREE.BoxGeometry(1, 1, 1);
            }

            // Prepare geometry normals
            resultBrush.geometry.computeVertexNormals();

            const resultMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2, side: THREE.DoubleSide });
            finalResultMesh = new THREE.Mesh(resultBrush.geometry, resultMat);
            finalResultMesh.name = 'zerogap_result';
            
            centerObject(finalResultMesh);

            if ((wizardStep === 'tube-handle-cut' || wizardStep === 'technical-review' || wizardStep === 'pan-tube-cut') && onResultComputed) {
              onResultComputed(finalResultMesh.clone() as any);
            }

            scene.add(finalResultMesh);
            exportMeshRef.current = finalResultMesh;

            // --- SEPARATE GHOST PIECES IN BOOLEAN MODE ---
            if (config.showGhostPart) {
               const tBrushGhost = getBrush(tubeMesh, tubeGeom);
               
               if (panGeom && panMesh) {
                  try {
                    const pGeomToCut = config.pan.applyThicknessToCut && panInnerGeom ? panInnerGeom : panGeom;
                    const pBrush = getBrush(panMesh, pGeomToCut);
                    const panWaste = boolEval.evaluate(tBrushGhost, pBrush, INTERSECTION);
                    if (panWaste.geometry.attributes.position && panWaste.geometry.attributes.position.count > 0) {
                       const wMat = new THREE.MeshStandardMaterial({
                          color: 0x00bfff, emissive: 0x004488, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide
                       });
                       const wasteObj = new THREE.Mesh(panWaste.geometry, wMat);
                       wasteObj.name = 'zerogap_ghost_pan';
                       const centerOffset = finalResultMesh?.userData.centeredOffset;
                       if (centerOffset) wasteObj.geometry.translate(-centerOffset.x, -centerOffset.y, -centerOffset.z);
                       scene.add(wasteObj);
                    }
                  } catch(e) {}
               }

               if (handleGeom && handleMeshObj) {
                  try {
                    const hBrush = getBrush(handleMeshObj, handleGeom);
                    const handleWaste = boolEval.evaluate(tBrushGhost, hBrush, INTERSECTION);
                    if (handleWaste.geometry.attributes.position && handleWaste.geometry.attributes.position.count > 0) {
                       const wMat = new THREE.MeshStandardMaterial({
                          color: 0x39ff14, emissive: 0x004400, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide
                       });
                       const wasteObj = new THREE.Mesh(handleWaste.geometry, wMat);
                       wasteObj.name = 'zerogap_ghost_handle';
                       const centerOffset = finalResultMesh?.userData.centeredOffset;
                       if (centerOffset) wasteObj.geometry.translate(-centerOffset.x, -centerOffset.y, -centerOffset.z);
                       scene.add(wasteObj);
                    }
                  } catch(e) {}
               }
            }

            setIsLoading(false);
          }
        } 

        const createVisualRing = (z: number, color: number, lineWidth: number = 2, ringName: string = 'zerogap_visual_ring') => {
           const points: THREE.Vector2[] = [];
           // Scale radius more dynamically to always be outside the tube
           const r = Math.max(tw / 2, th / 2) * 1.35; 
           for (let ang = 0; ang <= 2 * Math.PI; ang += 0.05) {
             points.push(new THREE.Vector2(r * Math.cos(ang), r * Math.sin(ang)));
           }

           if (points.length > 0) {
              const pts3 = points.map(p => new THREE.Vector3(p.x, p.y, z));
              // The ring should be in the object local space, and then moved by the parent if needed in boolean mode
              const geometry = new THREE.BufferGeometry().setFromPoints(pts3);
              const material = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9, linewidth: lineWidth });
              const ring = new THREE.LineLoop(geometry, material);
              ring.name = ringName;
              
              if (effectiveRenderMode === 'boolean') {
                 if (finalResultMesh?.userData.centeredOffset) {
                    const centerOffset = finalResultMesh.userData.centeredOffset;
                    ring.position.set(-centerOffset.x, -centerOffset.y, -centerOffset.z);
                 }
                 scene.add(ring);
              } else {
                 tubeMesh.add(ring);
              }
           }
        };

        // --- 4 RINGS SYSTEM IN STEP 6 ---
        let panBoundZ: number | null = null;
        let handleBoundZ: number | null = null;

        // Function to filter out tube cap edges, parallel edges, and inner thickness edges, keeping only outer intersection curves
        const filterCutPathEdges = (edgesGeom: THREE.EdgesGeometry, tubeLength: number, w: number, h: number, isRound: boolean) => {
          if (!edgesGeom.attributes.position) return edgesGeom;
          const positions = edgesGeom.attributes.position.array;
          const filtered = [];
          const v1 = new THREE.Vector3();
          const v2 = new THREE.Vector3();
          
          const isPointOnOuterSurface = (p: THREE.Vector3) => {
             if (isRound) {
                 const r = Math.sqrt(p.x * p.x + p.y * p.y);
                 return Math.abs(r - w/2) < 1.5;
             } else {
                 const onX = Math.abs(Math.abs(p.x) - w/2) < 1.5;
                 const onY = Math.abs(Math.abs(p.y) - h/2) < 1.5;
                 const withinX = Math.abs(p.x) <= w/2 + 1.5;
                 const withinY = Math.abs(p.y) <= h/2 + 1.5;
                 return (onX && withinY) || (onY && withinX);
             }
          };

          for (let i = 0; i < positions.length; i += 6) {
            v1.set(positions[i], positions[i+1], positions[i+2]);
            v2.set(positions[i+3], positions[i+4], positions[i+5]);
            
            const eps = 1.0; 
            const isStartCap = Math.abs(v1.z + tubeLength/2) < eps && Math.abs(v2.z + tubeLength/2) < eps;
            const isEndCap = Math.abs(v1.z - tubeLength/2) < eps && Math.abs(v2.z - tubeLength/2) < eps;
            
            const edgeDir = v2.clone().sub(v1).normalize();
            const isParallel = Math.abs(edgeDir.z) > 0.98;
            
            if (!isStartCap && !isEndCap && !isParallel) {
               if (isPointOnOuterSurface(v1) && isPointOnOuterSurface(v2)) {
                 filtered.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
               }
            }
          }
          const filteredGeom = new THREE.BufferGeometry();
          filteredGeom.setAttribute('position', new THREE.Float32BufferAttribute(filtered, 3));
          return filteredGeom;
        };

        // Add explicit saddle contact rings (Red Borders) for ALL render modes
        if ((config.showBorders || config.showToolpathPreview) && (wizardStep === 'pan-tube-cut' || wizardStep === 'final-inspect' || wizardStep === 'tube-handle-cut' || wizardStep === 'technical-review')) {
          const ev = new Evaluator();
          const tBrush = getBrush(tubeMesh, tubeGeom);

          if (panGeom && panMesh && (wizardStep === 'pan-tube-cut' || wizardStep === 'final-inspect' || wizardStep === 'tube-handle-cut' || wizardStep === 'technical-review')) {
            try {
              const pGeomToCut = config.pan.applyThicknessToCut && panInnerGeom ? panInnerGeom : panGeom;
              const pBrush = getBrush(panMesh, pGeomToCut);
              const contact = ev.evaluate(tBrush, pBrush, INTERSECTION);

              const outerBrush = getBrush(panMesh, panGeom);
              const contactForEdges = ev.evaluate(tBrush, outerBrush, INTERSECTION);

              if (contact && contact.geometry.attributes.position?.count > 0) {
                const localContact = contact.geometry.clone();
                localContact.computeBoundingBox();
                panBoundZ = localContact.boundingBox?.max.z || 0; 




                if (config.showBorders || config.showToolpathPreview) {
                   const edges = new THREE.EdgesGeometry(contactForEdges.geometry, 30);
                   const filteredEdges = filterCutPathEdges(edges, tl, config.tube.width, config.tube.height || config.tube.width, config.tube.shape === 'دائري');
                   
                   const saddle = new THREE.LineSegments(filteredEdges, new THREE.LineBasicMaterial({ 
                     color: 0x00ffff, linewidth: 2, depthTest: false, transparent: true, opacity: 0.9
                   }));
                   saddle.name = 'zerogap_pan_ring';
                   
                   if (effectiveRenderMode === 'boolean') {
                      const centerOffset = finalResultMesh?.userData.centeredOffset;
                      if (centerOffset) saddle.geometry.translate(-centerOffset.x, -centerOffset.y, -centerOffset.z);
                      scene.add(saddle);
                   } else {
                      tubeMesh.add(saddle);
                   }

                   // Add animated laser dot for Pan Cut
                   if (wizardStep === 'technical-review' || wizardStep === 'final-inspect') {
                     const dotGeom = new THREE.SphereGeometry(1.5, 8, 8);
                     const dotMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
                     const dot = new THREE.Mesh(dotGeom, dotMat);
                     dot.name = 'zerogap_laser_dot';
                     
                     const points: THREE.Vector3[] = [];
                     const pos = filteredEdges.attributes.position.array;
                     for (let i = 0; i < pos.length; i += 3) {
                       points.push(new THREE.Vector3(pos[i], pos[i + 1], pos[i + 2]));
                     }
                     const sorted: THREE.Vector3[] = [];
                     if (points.length > 0) {
                       let curr = points[0];
                       sorted.push(curr);
                       points.splice(0, 1);
                       while (points.length > 0) {
                         let minDist = Infinity;
                         let minIdx = -1;
                         for (let j = 0; j < points.length; j++) {
                           const d = curr.distanceToSquared(points[j]);
                           if (d < minDist) { minDist = d; minIdx = j; }
                         }
                         curr = points[minIdx];
                         sorted.push(curr);
                         points.splice(minIdx, 1);
                       }
                     }
                     dot.userData.points = sorted;
                     if (effectiveRenderMode === 'boolean') {
                       const centerOffset = finalResultMesh?.userData.centeredOffset;
                       if (centerOffset) dot.userData.offset = new THREE.Vector3(-centerOffset.x, -centerOffset.y, -centerOffset.z);
                       scene.add(dot);
                     } else {
                       tubeMesh.add(dot);
                     }

                     const lLight = new THREE.PointLight(0x00ffff, 5, 20);
                     lLight.name = 'zerogap_laser_light';
                     if (effectiveRenderMode === 'boolean') {
                       scene.add(lLight);
                     } else {
                       tubeMesh.add(lLight);
                     }
                   }
                }
              }
            } catch(e) {}
          }
          
          if (handleGeom && handleMeshObj && (wizardStep === 'tube-handle-cut' || wizardStep === 'technical-review' || wizardStep === 'final-inspect')) {
            try {
              const hBrush = getBrush(handleMeshObj, handleGeom);
              const contact = ev.evaluate(tBrush, hBrush, INTERSECTION);
              if (contact && contact.geometry.attributes.position?.count > 0) {
                const localContact = contact.geometry.clone();
                localContact.computeBoundingBox();
                handleBoundZ = localContact.boundingBox?.min.z || config.tube.partLength;



                if (config.showBorders || config.showToolpathPreview) {
                   const edges = new THREE.EdgesGeometry(contact.geometry, 30);
                   const filteredEdges = filterCutPathEdges(edges, tl, config.tube.width, config.tube.height || config.tube.width, config.tube.shape === 'دائري');
                   
                   const saddle = new THREE.LineSegments(filteredEdges, new THREE.LineBasicMaterial({
                     color: 0x39ff14, linewidth: 2, depthTest: false, transparent: true, opacity: 0.9
                   }));
                   saddle.name = 'zerogap_handle_ring';

                   if (effectiveRenderMode === 'boolean') {
                      const centerOffset = finalResultMesh?.userData.centeredOffset;
                      if (centerOffset) saddle.geometry.translate(-centerOffset.x, -centerOffset.y, -centerOffset.z);
                      scene.add(saddle);
                   } else {
                      tubeMesh.add(saddle);
                   }
                }
              }
            } catch(e) {}
          }
        }

        // ── 6. Cleanup & Auto-frame ──
        
        // --- Render the 4 defined rings once at the end ---
        if (wizardStep === 'technical-review' && config.showBodySlices) {
            const addRing = (z: number, color: number, name: string) => {
               createVisualRing(z, color, 3, name);
            }
            
            // End rings (Fixed)
            addRing(-tl / 2, 0xff6600, 'zerogap_visual_ring_end_a');
            addRing(tl / 2, 0xff6600, 'zerogap_visual_ring_end_b');
            
            // Intersection rings
            if (panBoundZ !== null) addRing(panBoundZ, 0xffaa33, 'zerogap_visual_ring_pan');
            if (handleBoundZ !== null) addRing(handleBoundZ, 0xffaa33, 'zerogap_visual_ring_handle');
        }

        tubeGeom.dispose();
        if (panGeom) panGeom.dispose();
        if (panInnerGeom) panInnerGeom.dispose();
        if (handleGeom) handleGeom.dispose();
        if (panMesh) (panMesh.material as THREE.Material).dispose();
        if (panInnerMesh) (panInnerMesh.material as THREE.Material).dispose();
        if (handleMeshObj) (handleMeshObj.material as THREE.Material).dispose();
        
        setIsLoading(false);

        // ── 6. Auto-frame camera (only on first load, STL change, or step change to inspection) ──────────
        if (controlsRef.current && cameraRef.current && exportMeshRef.current) {
          const bb = new THREE.Box3();
          if (config.renderMode === 'preview') {
            scene.children.forEach(c => { if (c.name.startsWith('zerogap_')) bb.expandByObject(c); });
          } else {
            bb.setFromObject(exportMeshRef.current);
          }

          if (isFinite(bb.min.x) && !isNaN(bb.min.x)) {
            if (onDimensionsChange) {
               const size = new THREE.Vector3();
               bb.getSize(size);
               onDimensionsChange({l: size.z, w: size.x, h: size.y}); 
            }

            const isInspectionStep = wizardStep === 'technical-review' || wizardStep === 'final-inspect';
            const shouldRecenter = !hasAutoCentered.current || 
                                  lastStlName.current !== config.tube.customStlName ||
                                  (isInspectionStep && lastStep.current !== wizardStep);

            if (shouldRecenter) {
              const worldCenter = new THREE.Vector3();
              bb.getCenter(worldCenter);

              // Set orbit pivot to part center
              controlsRef.current.target.copy(worldCenter);

              const maxDim = Math.max(
                bb.max.x - bb.min.x,
                bb.max.y - bb.min.y,
                bb.max.z - bb.min.z
              ) || 100;
              const fov = cameraRef.current.fov * (Math.PI / 180);
              const dist = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;
              cameraRef.current.position.set(
                worldCenter.x + dist * 0.5,
                worldCenter.y + dist * 0.8,
                worldCenter.z + dist
              );

              hasAutoCentered.current = true;
              lastStlName.current = config.tube.customStlName;
              lastStep.current = wizardStep;
              controlsRef.current.update();
            }
          }
        }

      } catch (e: any) {
        const errorMessage = errorHandler.handle(e, 'GeometryEngine');
        setEngineError(errorMessage);
        setTimeout(() => setEngineError(null), 5000);
      }
    }, wizardStep === 'tube-design' || wizardStep === 'pan-design' || wizardStep === 'handle-design' ? 80 : 150); // BVH-CSG is fast — 150ms debounce for CSG steps

    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [
    config.tube,
    config.pan,
    config.assembly,
    config.handle,
    config.thermalClearance,
    config.showBorders,
    config.showGhostPart,
    config.showToolpathPreview,
    config.renderMode,
    gridVisible,
    webglError,
    wizardStep
  ]);

  // ─── Snap View Handler ────────────────────────────────────────────────────────
  const handleSnapView = (view: string) => {
    if (!controlsRef.current || !cameraRef.current) return;
    const bb = new THREE.Box3();
    if (exportMeshRef.current) {
      if (config.renderMode === 'preview') {
        sceneRef.current?.children.forEach(c => { if (c.name.startsWith('zerogap_')) bb.expandByObject(c); });
      } else {
        bb.setFromObject(exportMeshRef.current);
      }
    }
    if (!isFinite(bb.min.x)) return;

    const center = new THREE.Vector3();
    bb.getCenter(center);
    const maxDim = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) || 100;
    const dist = maxDim * 1.5;

    const cam = cameraRef.current;
    switch (view) {
      case 'front':  cam.position.set(center.x, center.y, center.z + dist); break;
      case 'back':   cam.position.set(center.x, center.y, center.z - dist); break;
      case 'top':    cam.position.set(center.x, center.y + dist, center.z); break;
      case 'bottom': cam.position.set(center.x, center.y - dist, center.z); break;
      case 'left':   cam.position.set(center.x - dist, center.y, center.z); break;
      case 'right':  cam.position.set(center.x + dist, center.y, center.z); break;
      case 'iso':    cam.position.set(center.x + dist * 0.8, center.y + dist * 0.8, center.z + dist * 0.8); break;
    }
    controlsRef.current.target.copy(center);
    controlsRef.current.update();
  };

  // ─── Re-center button handler ─────────────────────────────────────────────────
  const handleRecenter = () => {
    if (!exportMeshRef.current || !controlsRef.current || !cameraRef.current) return;
    const b = new THREE.Box3().setFromObject(exportMeshRef.current);
    if (!b || !isFinite(b.min.x)) return;
    const center = new THREE.Vector3();
    b.getCenter(center);
    controlsRef.current.target.copy(center);
    const maxDim = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) || 100;
    const fov = cameraRef.current.fov * (Math.PI / 180);
    const cDist = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;
    cameraRef.current.position.set(center.x + cDist * 0.5, center.y + cDist * 0.8, center.z + cDist);
    controlsRef.current.update();
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[500px] bg-neutral-900 rounded-lg overflow-hidden relative flex items-center justify-center text-center"
      id="three-container"
    >
      {/* Camera HUD */}
      {!webglError && (
        <div
          className="absolute top-6 left-6 flex flex-col items-center gap-2 z-10 glass-panel p-3 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-md"
          onPointerDown={e => e.stopPropagation()}
        >
          <div className="text-[10px] text-[var(--text-dim)] font-bold tracking-widest text-center mb-1">توجيه</div>

          {/* D-Pad Design */}
          <div className="relative w-24 h-24 bg-black/40 rounded-full flex items-center justify-center border border-white/5 shadow-inner">
            <button onClick={() => handleSnapView('top')} title="أعلى (Y+)" className="absolute top-1 w-8 h-8 flex items-center justify-center text-[var(--text-dim)] hover:text-white hover:bg-white/10 rounded-full transition-all">
              <ArrowUp size={16} />
            </button>
            <button onClick={() => handleSnapView('left')} title="يسار (X-)" className="absolute left-1 w-8 h-8 flex items-center justify-center text-[var(--text-dim)] hover:text-white hover:bg-white/10 rounded-full transition-all">
              <ArrowLeft size={16} />
            </button>
            <button onClick={() => handleSnapView('front')} title="أمام (Z+)" className="w-10 h-10 flex items-center justify-center bg-white/5 text-[var(--accent)] hover:bg-[var(--accent)] hover:text-black border border-[var(--accent)]/30 hover:border-transparent rounded-full transition-all shadow-md z-10">
              <Box size={18} />
            </button>
            <button onClick={() => handleSnapView('right')} title="يمين (X+)" className="absolute right-1 w-8 h-8 flex items-center justify-center text-[var(--text-dim)] hover:text-white hover:bg-white/10 rounded-full transition-all">
              <ArrowRight size={16} />
            </button>
            <button onClick={() => handleSnapView('bottom')} title="أسفل (Y-)" className="absolute bottom-1 w-8 h-8 flex items-center justify-center text-[var(--text-dim)] hover:text-white hover:bg-white/10 rounded-full transition-all">
              <ArrowDown size={16} />
            </button>
          </div>

          <div className="flex gap-2 w-full mt-1">
            <button onClick={() => handleSnapView('iso')} className="flex-1 flex items-center justify-center gap-1 py-2 bg-gradient-to-r from-[var(--accent-blue)]/20 to-[var(--accent-blue)]/5 hover:from-[var(--accent-blue)] hover:to-[var(--accent-blue)] hover:text-black border border-[var(--accent-blue)]/30 rounded-xl text-[10px] font-bold transition-all uppercase text-[var(--accent-blue)] shadow-sm">
              <Cylinder size={14} className="opacity-80" /> 3D
            </button>
            <button onClick={handleRecenter} className="w-10 h-full bg-white/5 hover:bg-white hover:text-black border border-white/10 rounded-xl flex items-center justify-center transition-all shadow-sm" title="تمركز الكاميرا">
              <Focus size={16} />
            </button>
          </div>
        </div>
      )}

      {/* WebGL error */}
      {webglError && (
        <div className="max-w-md bg-red-500/10 border border-red-500/20 p-6 rounded-xl backdrop-blur-sm">
          <h3 className="text-red-500 font-bold mb-2 uppercase tracking-widest text-sm">خطأ في الرسومات</h3>
          <p className="text-xs text-[var(--text-dim)] leading-relaxed">{webglError}</p>
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-40">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            <span className="text-[var(--accent)] font-bold text-sm uppercase tracking-widest">جاري المعالجة...</span>
          </div>
        </div>
      )}

      {/* Engine error toast */}
      {engineError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500/90 text-white px-4 py-2 rounded-lg text-xs font-bold z-50 animate-pulse">
          {engineError}
        </div>
      )}
      {/* Orientation Gizmo — bottom-right corner */}
      {!webglError && (
        <ViewportGizmo cameraRef={cameraRef} />
      )}
    </div>
  );
});

export default React.memo(ThreeCanvas);
