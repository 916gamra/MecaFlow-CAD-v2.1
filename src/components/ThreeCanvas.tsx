import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { OrbitControls, STLExporter, STLLoader } from 'three-stdlib';
import { Brush, Evaluator, SUBTRACTION, INTERSECTION, ADDITION } from 'three-bvh-csg';
import { ZeroGapState, WizardStep } from '../types';
import { validateTubeConfig, validatePanConfig } from '../lib/validators';
import { performanceOptimizer } from '../lib/performanceOptimizer';
import { ViewportGizmo } from './ViewportGizmo';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Box, Focus, Cylinder } from 'lucide-react';


interface ThreeCanvasProps {
  config: ZeroGapState;
  gridVisible: boolean;
  wizardStep: WizardStep;
}

export interface ThreeCanvasRef {
  exportSTL: () => void;
}

const ThreeCanvas = forwardRef<ThreeCanvasRef, ThreeCanvasProps>(({ config, gridVisible, wizardStep }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const exportMeshRef = useRef<THREE.Object3D | null>(null);
  const hasAutoCentered = useRef<boolean>(false);
  const lastStlName = useRef<string | undefined>(config.tube.customStlName);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── STL Export ──────────────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    exportSTL: () => {
      if (!exportMeshRef.current) return;
      const exporter = new STLExporter();
      
      const stlString = exporter.parse(exportMeshRef.current);
      
      const blob = new Blob([stlString], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'zero_gap_laser_export.stl';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }));

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
    const clock = new THREE.Clock();
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const time = clock.getElapsedTime() * 3;

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

      controls.update();
      renderer!.render(scene, camera);
      performanceOptimizer.measureFPS();
    };
    animate();

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
      renderer?.dispose();
      renderer?.domElement.remove();
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

      // ── Validate inputs ──────────────────────────────────────────────────────
      const needsTube = wizardStep !== 'pan-design' && wizardStep !== 'handle-design';
      const needsPan  = wizardStep === 'pan-design' || wizardStep === 'pan-tube-cut' || wizardStep === 'tube-handle-cut' || wizardStep === 'final-inspect';
      const needsHandle = wizardStep === 'handle-design' || wizardStep === 'tube-handle-cut' || wizardStep === 'final-inspect';
      const needsCSG = wizardStep === 'pan-tube-cut' || wizardStep === 'tube-handle-cut' || wizardStep === 'final-inspect';

      try {
        if (needsTube) validateTubeConfig(config.tube);
        if (needsPan)  validatePanConfig(config.pan);
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

        if (config.tube.shape === 'مخصص' && config.tube.customStlBuffer) {
          const loader = new STLLoader();
          tubeGeom = loader.parse(config.tube.customStlBuffer);
          tubeGeom.center();
          tubeGeom.computeVertexNormals();
        } else {
          const HeadLen = Math.min(config.tube.partLength + 20, tl * 0.4);
          const TailLen = Math.min(30, tl * 0.2);
          const BodyLen = Math.max(1, tl - HeadLen - TailLen);
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

          const headGeom = new THREE.ExtrudeGeometry(buildSection(), { depth: HeadLen, bevelEnabled: false, curveSegments: 16 });
          const bodyGeom = new THREE.ExtrudeGeometry(buildSection(), { depth: BodyLen, bevelEnabled: false, curveSegments: 16 });
          bodyGeom.translate(0, 0, HeadLen);
          const tailGeom = new THREE.ExtrudeGeometry(buildSection(), { depth: TailLen, bevelEnabled: false, curveSegments: 16 });
          tailGeom.translate(0, 0, HeadLen + BodyLen);

          try {
            tubeGeom = BufferGeometryUtils.mergeGeometries([headGeom, bodyGeom, tailGeom], false);
          } catch {
            tubeGeom = new THREE.ExtrudeGeometry(buildSection(), { depth: tl, bevelEnabled: false, curveSegments: 16 });
          }
          headGeom.dispose();
          bodyGeom.dispose();
          tailGeom.dispose();
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
          if (hCfg.shape === 'cylindrical') {
            handleGeom = new THREE.CylinderGeometry(hCfg.width / 2, hCfg.width / 2, hCfg.depth, 32, 1, false);
            handleGeom.rotateX(Math.PI / 2);
          } else {
            handleGeom = new THREE.BoxGeometry(hCfg.width, hCfg.height, hCfg.depth);
          }
          handleGeom.center();
          handleMeshObj = new THREE.Mesh(handleGeom, new THREE.MeshStandardMaterial({ color: 0x22c55e, metalness: 0.5, roughness: 0.3 }));
          handleMeshObj.name = 'zerogap_handle_main';
        }

        // ── 3. Pan ────────────────────────────────────────────────
        let panGeom: THREE.CylinderGeometry | null = null;
        let panMesh: THREE.Mesh | null = null;
        let panInnerGeom: THREE.CylinderGeometry | null = null;
        let panInnerMesh: THREE.Mesh | null = null;

        if (needsPan) {
          const wt = config.pan.wallThickness || 2.0;
          const panH = config.pan.height;
          const rTopOut = config.pan.innerMoldMode ? config.pan.topDiameter / 2 + wt : config.pan.topDiameter / 2;
          const rBotOut = config.pan.innerMoldMode ? config.pan.bottomDiameter / 2 + wt : config.pan.bottomDiameter / 2;
          
          panGeom = new THREE.CylinderGeometry(Math.max(1, rTopOut), Math.max(1, rBotOut), panH, 64, 1, false);
          panGeom.translate(0, panH / 2, 0); // Put base at Y=0

          panMesh = new THREE.Mesh(panGeom, new THREE.MeshStandardMaterial({ 
            color: 0xff3333, 
            side: THREE.FrontSide, 
            opacity: config.renderMode === 'boolean' ? 0.0 : 0.8, 
            transparent: true 
          }));
          panMesh.name = 'zerogap_pan';

          if (config.pan.useShellPreview) {
            const rTopIn = Math.max(0.1, rTopOut - wt);
            const rBotIn = Math.max(0.1, rBotOut - wt);
            panInnerGeom = new THREE.CylinderGeometry(rTopIn, rBotIn, panH, 64, 1, false);
            panInnerGeom.translate(0, panH / 2 + wt, 0);
            panInnerMesh = new THREE.Mesh(panInnerGeom, new THREE.MeshStandardMaterial({ color: 0xff3333, side: THREE.FrontSide, opacity: 0.8, transparent: true }));
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
        const angleRad = (90 - config.assembly.tiltAngle) * (Math.PI / 180);
        const tubeRoll = (config.assembly.handleAngleY || 0) * (Math.PI / 180);

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

        // Tube tilt + offset
        tubeMesh.position.set(0, config.assembly.heightOffset, -config.assembly.insertionDistance);
        tubeMesh.rotation.set(angleRad, 0, tubeRoll);
        tubeMesh.updateMatrixWorld(true);

        // Handle at End B
        if (handleMeshObj) {
          const hCfg2 = config.handle;
          handleMeshObj.position.set(hCfg2.offsetZ || 0, 0, tl / 2 + (hCfg2.insertionDepth || 0));
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

        let shiftX = 0, shiftY = 0, shiftZ = 0;

        const getBrush = (mesh: THREE.Object3D, geom: THREE.BufferGeometry) => {
             const brush = new Brush(geom.clone());
             mesh.getWorldPosition(brush.position);
             mesh.getWorldQuaternion(brush.quaternion);
             mesh.getWorldScale(brush.scale);
             brush.updateMatrixWorld(true);
             return brush;
        };

        const filterTubeEdges = (geom: THREE.BufferGeometry, thresholdDot: number = 0.99) => {
          if (!geom.attributes.position) return geom;
          const positions = geom.attributes.position.array;
          const filtered = [];
          
          const v1 = new THREE.Vector3();
          const v2 = new THREE.Vector3();
          const edgeDir = new THREE.Vector3();
          const tubeDir = new THREE.Vector3(0, 0, 1);

          for (let i = 0; i < positions.length; i += 6) {
            v1.set(positions[i], positions[i+1], positions[i+2]);
            v2.set(positions[i+3], positions[i+4], positions[i+5]);
            edgeDir.subVectors(v2, v1).normalize();
            
            if (Math.abs(edgeDir.dot(tubeDir)) < thresholdDot) {
              filtered.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
            }
          }

          const filteredGeom = new THREE.BufferGeometry();
          filteredGeom.setAttribute('position', new THREE.Float32BufferAttribute(filtered, 3));
          return filteredGeom;
        };

        if (config.renderMode === 'preview') {
          // Preview Mode: Show raw objects
          if (wizardStep === 'pan-tube-cut' || wizardStep === 'final-inspect' || wizardStep === 'tube-handle-cut') {
            scene.add(tubeMesh);
            exportMeshRef.current = tubeMesh;

            if (panMesh && (wizardStep === 'pan-tube-cut' || wizardStep === 'final-inspect' || wizardStep === 'tube-handle-cut')) {
              scene.add(panMesh);
              if (panInnerMesh && config.pan.useShellPreview) scene.add(panInnerMesh);
            }
          }
        } else {
          // Boolean Mode (Zero Cut)
          setIsLoading(true);
          const tBrush = getBrush(tubeMesh, tubeGeom);

          let resultBrush = tBrush;
          const boolEval = new Evaluator();

          if (panGeom && panMesh && (wizardStep === 'pan-tube-cut' || wizardStep === 'final-inspect' || wizardStep === 'tube-handle-cut')) {
             const pG = config.pan.applyThicknessToCut && panInnerGeom ? panInnerGeom : panGeom;
             const pBrush = getBrush(panMesh, pG);
             resultBrush = boolEval.evaluate(resultBrush, pBrush, SUBTRACTION);
          }

          if (handleGeom && handleMeshObj && (wizardStep === 'tube-handle-cut' || wizardStep === 'final-inspect')) {
             const hBrush = getBrush(handleMeshObj, handleGeom);
             resultBrush = boolEval.evaluate(resultBrush, hBrush, SUBTRACTION);
          }

          if (!resultBrush.geometry.attributes.position || resultBrush.geometry.attributes.position.count === 0) {
            resultBrush.geometry = new THREE.BoxGeometry(1, 1, 1);
          }

          resultBrush.geometry.computeBoundingBox();
          const gb = resultBrush.geometry.boundingBox;
          if (gb && isFinite(gb.min.x)) {
            shiftX = -(gb.min.x+gb.max.x)/2;
            shiftY = -(gb.min.y+gb.max.y)/2;
            shiftZ = -(gb.min.z+gb.max.z)/2;
            resultBrush.geometry.translate(shiftX, shiftY, shiftZ);
          }
          resultBrush.geometry.computeVertexNormals();

          const resultMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2, side: THREE.DoubleSide });
          finalResultMesh = new THREE.Mesh(resultBrush.geometry, resultMat);
          finalResultMesh.name = 'zerogap_result';

          // Keep piece centered on 0,0,0 (user request)
          finalResultMesh.position.set(0, 0, 0);
          finalResultMesh.quaternion.copy(tubeMesh.quaternion);
          finalResultMesh.scale.copy(tubeMesh.scale);
          finalResultMesh.updateMatrixWorld(true);

          if (config.showBorders) {
            try {
              const edges = new THREE.EdgesGeometry(finalResultMesh.geometry);
              if (edges.attributes.position?.count > 0) {
                finalResultMesh.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x333333, opacity: 0.2, transparent: true })));
              }
            } catch { /* edge gen failed */ }
          }

          scene.add(finalResultMesh);
          exportMeshRef.current = finalResultMesh;
        }

        // Add explicit saddle contact rings (Red Borders) for ALL render modes
        if (config.showBorders && (wizardStep === 'pan-tube-cut' || wizardStep === 'final-inspect' || wizardStep === 'tube-handle-cut')) {
          const ev = new Evaluator();
          const tBrush = getBrush(tubeMesh, tubeGeom);

          if (panGeom && panMesh && (wizardStep === 'pan-tube-cut' || wizardStep === 'final-inspect' || wizardStep === 'tube-handle-cut')) {
            try {
              const pGeomToCut = config.pan.applyThicknessToCut && panInnerGeom ? panInnerGeom : panGeom;
              const pBrush = getBrush(panMesh, pGeomToCut);
              const contact = ev.evaluate(tBrush, pBrush, INTERSECTION);
              if (contact && contact.geometry.attributes.position?.count > 0) {
                const edges = new THREE.EdgesGeometry(contact.geometry, 5);
                const filteredEdgesGeom = filterTubeEdges(edges);
                const saddle = new THREE.LineSegments(filteredEdgesGeom, new THREE.LineBasicMaterial({ color: 0x0088ff, linewidth: 2 }));
                saddle.name = 'zerogap_pan_ring'; saddle.renderOrder = 2;
                
                if (config.renderMode === 'boolean' && exportMeshRef.current === finalResultMesh) {
                   saddle.geometry.translate(shiftX, shiftY, shiftZ);
                   finalResultMesh.add(saddle);
                } else {
                   saddle.position.copy(tubeMesh.position);
                   saddle.quaternion.copy(tubeMesh.quaternion);
                   scene.add(saddle);
                }
              }
            } catch(e) {}
          }
          
          if (handleGeom && handleMeshObj && (wizardStep === 'tube-handle-cut' || wizardStep === 'final-inspect')) {
            try {
              const hBrush = getBrush(handleMeshObj, handleGeom);
              const contact = ev.evaluate(tBrush, hBrush, INTERSECTION);
              if (contact && contact.geometry.attributes.position?.count > 0) {
                const edges = new THREE.EdgesGeometry(contact.geometry, 10);
                const filteredEdgesGeom = filterTubeEdges(edges);
                const saddle = new THREE.LineSegments(filteredEdgesGeom, new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 }));
                saddle.name = 'zerogap_handle_ring'; saddle.renderOrder = 2;
                if (config.renderMode === 'boolean' && exportMeshRef.current === finalResultMesh) {
                   saddle.geometry.translate(shiftX, shiftY, shiftZ);
                   finalResultMesh.add(saddle);
                } else {
                   saddle.position.copy(tubeMesh.position);
                   saddle.quaternion.copy(tubeMesh.quaternion);
                   scene.add(saddle);
                }
              }
            } catch(e) {}
          }
        }

        tubeGeom.dispose();
        if (panGeom) panGeom.dispose();
        if (panInnerGeom) panInnerGeom.dispose();
        if (handleGeom) handleGeom.dispose();
        if (panMesh) (panMesh.material as THREE.Material).dispose();
        if (panInnerMesh) (panInnerMesh.material as THREE.Material).dispose();
        if (handleMeshObj) (handleMeshObj.material as THREE.Material).dispose();
        
        setIsLoading(false);

        // ── 6. Auto-frame camera (only on first load or STL change) ──────────
        if (controlsRef.current && cameraRef.current && exportMeshRef.current) {
          const bb = new THREE.Box3();
          if (config.renderMode === 'preview') {
            scene.children.forEach(c => { if (c.name.startsWith('zerogap_')) bb.expandByObject(c); });
          } else {
            bb.setFromObject(exportMeshRef.current);
          }

          if (isFinite(bb.min.x) && !isNaN(bb.min.x)) {
            if (!hasAutoCentered.current || lastStlName.current !== config.tube.customStlName) {
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
              controlsRef.current.update();
            }
            // NOTE: we do NOT call target.copy() here on every param change —
            // that was the root cause of the sidebar-scrolling viewport shift.
          }
        }

      } catch (e: any) {
        console.error('Zero-Gap Engine Error:', e);
        const errorMessage = e?.message || 'فشل في إنشاء الشكل الهندسي';
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
  }, [config, gridVisible, webglError, wizardStep]);

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

export default ThreeCanvas;
