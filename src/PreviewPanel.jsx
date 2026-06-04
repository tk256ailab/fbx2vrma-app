import { useEffect, useRef, useState } from 'react';
import { Box, Pause, Play, RefreshCw, Upload } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import {
  VRMAnimationLoaderPlugin,
  createVRMAnimationClip,
} from '@pixiv/three-vrm-animation';

const SAMPLE_VRM_URL = '/vrm/Sample.vrm';

export default function PreviewPanel({ t, vrmaPreview }) {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const stateRef = useRef({
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    vrm: null,
    mixer: null,
    animationAction: null,
    frameId: null,
    resizeObserver: null,
    loadToken: 0,
    animationToken: 0,
    lastFrameTime: 0,
    customVrmUrl: null,
    currentVrmaUrl: null,
    currentVrmaName: null,
  });

  const [status, setStatus] = useState(t.modelLoading);
  const [modelName, setModelName] = useState(t.sampleModel);
  const [animationName, setAnimationName] = useState('');
  const [isPlaying, setIsPlaying] = useState(true);
  const [hasAnimation, setHasAnimation] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf6f3ed);

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 1.35, 4.5);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 1.25, 0);
    controls.enableDamping = true;
    controls.minDistance = 1.8;
    controls.maxDistance = 7;

    const hemi = new THREE.HemisphereLight(0xffffff, 0xc7b89f, 2.6);
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2.4, 4.5, 3);
    const rim = new THREE.DirectionalLight(0xf1b36d, 0.8);
    rim.position.set(-3, 2, -2);
    const grid = new THREE.GridHelper(4, 16, 0xc9bba7, 0xded6c8);
    grid.position.y = 0;

    scene.add(hemi, key, rim, grid);

    const state = stateRef.current;
    Object.assign(state, {
      scene,
      camera,
      renderer,
      controls,
      lastFrameTime: performance.now(),
    });

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;

      const width = parent.clientWidth;
      const height = parent.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas.parentElement);
    state.resizeObserver = resizeObserver;
    resize();

    const tick = () => {
      const now = performance.now();
      const delta = Math.min((now - state.lastFrameTime) / 1000, 0.1);
      state.lastFrameTime = now;
      state.mixer?.update(delta);
      state.vrm?.update(delta);
      controls.update();
      renderer.render(scene, camera);
      state.frameId = requestAnimationFrame(tick);
    };

    state.frameId = requestAnimationFrame(tick);
    loadVrm(SAMPLE_VRM_URL, t.sampleModel);

    return () => {
      cancelAnimationFrame(state.frameId);
      resizeObserver.disconnect();
      clearAnimation();
      clearVrm();
      controls.dispose();
      renderer.dispose();
      if (state.customVrmUrl) {
        URL.revokeObjectURL(state.customVrmUrl);
      }
    };
  }, []);

  useEffect(() => {
    if (!vrmaPreview?.url) {
      setHasAnimation(false);
      setAnimationName('');
      setStatus(t.animationWaiting);
      clearAnimation();
      return;
    }

    const state = stateRef.current;
    state.currentVrmaUrl = vrmaPreview.url;
    state.currentVrmaName = vrmaPreview.name;
    if (state.vrm) {
      loadAnimation(vrmaPreview.url, vrmaPreview.name);
    }
  }, [vrmaPreview?.url]);

  function clearAnimation() {
    const state = stateRef.current;
    if (state.mixer && state.vrm) {
      state.mixer.stopAllAction();
      state.mixer.uncacheRoot(state.vrm.scene);
    }
    state.mixer = null;
    state.animationAction = null;
  }

  function clearVrm() {
    const state = stateRef.current;
    clearAnimation();
    if (state.vrm) {
      state.scene.remove(state.vrm.scene);
      VRMUtils.deepDispose(state.vrm.scene);
      state.vrm = null;
    }
  }

  function frameObject(object) {
    const state = stateRef.current;
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 1);

    state.controls.target.set(center.x, center.y + size.y * 0.05, center.z);
    state.camera.position.set(center.x, center.y + size.y * 0.2, center.z + radius * 1.9);
    state.camera.near = Math.max(radius / 100, 0.01);
    state.camera.far = radius * 12;
    state.camera.updateProjectionMatrix();
    state.controls.update();
  }

  async function loadVrm(url, label) {
    const state = stateRef.current;
    const token = ++state.loadToken;
    setStatus(t.modelLoading);
    setHasAnimation(false);

    try {
      const loader = new GLTFLoader();
      loader.crossOrigin = 'anonymous';
      loader.register((parser) => new VRMLoaderPlugin(parser));
      const gltf = await loader.loadAsync(url);

      if (token !== state.loadToken) return;

      const vrm = gltf.userData.vrm;
      if (!vrm) {
        throw new Error('VRM data was not found.');
      }

      clearVrm();
      VRMUtils.rotateVRM0(vrm);
      state.scene.add(vrm.scene);
      state.vrm = vrm;
      frameObject(vrm.scene);
      setModelName(label);
      setStatus(t.modelReady);

      if (state.currentVrmaUrl) {
        await loadAnimation(state.currentVrmaUrl, state.currentVrmaName);
      }
    } catch (error) {
      console.error(error);
      setStatus(t.previewError);
    }
  }

  async function loadAnimation(url, label) {
    const state = stateRef.current;
    const token = ++state.animationToken;
    if (!state.vrm) return;

    setStatus(t.animationLoading);
    setHasAnimation(false);
    clearAnimation();

    try {
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
      const gltf = await loader.loadAsync(url);

      if (token !== state.animationToken) return;

      const vrmAnimation = gltf.userData.vrmAnimations?.[0];
      if (!vrmAnimation) {
        throw new Error('VRMA animation data was not found.');
      }

      const clip = createVRMAnimationClip(vrmAnimation, state.vrm);
      const mixer = new THREE.AnimationMixer(state.vrm.scene);
      const action = mixer.clipAction(clip);
      action.reset().play();
      mixer.timeScale = isPlaying ? 1 : 0;

      state.mixer = mixer;
      state.animationAction = action;
      setAnimationName(label || clip.name);
      setHasAnimation(true);
      setStatus(t.animationReady);
    } catch (error) {
      console.error(error);
      setStatus(t.previewError);
    }
  }

  function onCustomVrmChange(event) {
    const [file] = event.target.files || [];
    if (!file) return;

    const state = stateRef.current;
    if (state.customVrmUrl) {
      URL.revokeObjectURL(state.customVrmUrl);
    }

    const nextUrl = URL.createObjectURL(file);
    state.customVrmUrl = nextUrl;
    loadVrm(nextUrl, file.name);
    event.target.value = '';
  }

  function togglePlayback() {
    const next = !isPlaying;
    setIsPlaying(next);
    const state = stateRef.current;
    if (state.mixer) {
      state.mixer.timeScale = next ? 1 : 0;
    }
  }

  function resetAnimation() {
    const state = stateRef.current;
    state.animationAction?.reset().play();
    state.mixer?.setTime(0);
  }

  return (
    <section className="panel preview-panel" aria-label={t.preview}>
      <div className="panel-heading">
        <div>
          <span className="eyebrow">
            <Box size={15} aria-hidden="true" />
            {t.preview}
          </span>
          <h2>{modelName}</h2>
        </div>
        <div className="preview-actions">
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept=".vrm,.glb"
            onChange={onCustomVrmChange}
          />
          <button className="icon-button text-button" type="button" onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} aria-hidden="true" />
            {t.loadVrm}
          </button>
        </div>
      </div>

      <div className="viewer-shell">
        <canvas ref={canvasRef} className="viewer-canvas" />
      </div>

      <div className="preview-footer">
        <div className="status-stack">
          <span className="status-dot" />
          <span>{status}</span>
          {animationName && <strong>{animationName}</strong>}
        </div>
        <div className="transport">
          <button className="icon-button" type="button" onClick={togglePlayback} disabled={!hasAnimation} title={isPlaying ? t.pause : t.play}>
            {isPlaying ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
          </button>
          <button className="icon-button" type="button" onClick={resetAnimation} disabled={!hasAnimation} title={t.reset}>
            <RefreshCw size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
