// Card P5: the 3D viewer (three.js 0.186.0, vendored by scripts/vendor-three.cjs, WebGLRenderer only: WebGPU crashes
// the operator's Edge on this laptop). Loads GLB from the media store, orbit/zoom camera, up to 3 lights, ground +
// shadows, skeleton display, FK bone rotation and an IK preview (CCDIKSolver = 預覽近似; the render bakes IK in
// Blender). Positions are three.js / glTF axes (Y up), the same numbers backend/blender/render.py receives.
// Light power differs between WebGL and Eevee: the viewer is a preview, the Blender render is the output.
import * as THREE from "three";
import { GLTFLoader } from "../vendor/three/0.186.0/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "../vendor/three/0.186.0/addons/controls/OrbitControls.js";
import { CCDIKSolver } from "../vendor/three/0.186.0/addons/animation/CCDIKSolver.js";

const LIGHT_SCALE = { point: 10, spot: 14, sun: 1 };

export function createViewer(canvas, { onCamera } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.25));
  const camera = new THREE.PerspectiveCamera(40, canvas.width / canvas.height, 0.01, 500);
  camera.position.set(0.5, 1.4, 4);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 1, 0);
  controls.addEventListener("change", () => {
    draw();
    onCamera?.(api.getCamera());
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.35 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.visible = false;
  scene.add(ground);
  const grid = new THREE.GridHelper(10, 20, 0x888888, 0x444444);
  scene.add(grid);
  const models = new Map(); // object id -> { root, skeleton, helper, mixer, clips, ik }
  let lights = [];
  const loader = new GLTFLoader();

  // controls.update() emits "change" (-> draw), so draw itself never calls it.
  function draw() {
    renderer.render(scene, camera);
  }
  function resize(width, height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    draw();
  }
  async function load(id, url, { position = [0, 0, 0], rotationY = 0, scale = 1 } = {}) {
    remove(id);
    const gltf = await loader.loadAsync(url);
    const root = gltf.scene;
    root.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    root.position.fromArray(position);
    root.rotation.y = THREE.MathUtils.degToRad(rotationY);
    root.scale.setScalar(scale);
    scene.add(root);
    let skeleton = null;
    root.traverse((o) => {
      if (o.isSkinnedMesh && !skeleton) skeleton = o.skeleton;
    });
    const helper = skeleton ? new THREE.SkeletonHelper(root) : null;
    if (helper) {
      helper.visible = false;
      scene.add(helper);
    }
    const mixer = gltf.animations.length ? new THREE.AnimationMixer(root) : null;
    if (mixer) mixer.clipAction(gltf.animations[0]).play();
    // GLTFLoader sanitizes node names ("forearm.L" -> "forearmL"); the API uses the file's names, as Blender does.
    const names = new Map(), byName = new Map(), rest = new Map();
    for (const b of skeleton?.bones || []) {
      const node = gltf.parser.associations.get(b)?.nodes;
      const name = (node !== undefined && gltf.parser.json.nodes[node]?.name) || b.name;
      names.set(b, name);
      byName.set(name, b);
      rest.set(b, b.quaternion.clone());
    }
    models.set(id, { root, skeleton, helper, mixer, clips: gltf.animations, rest, names, byName, ik: null });
    mixer?.setTime(0);
    draw();
    return { bones: skeleton ? skeleton.bones.map((b) => ({ name: names.get(b), parent: b.parent?.isBone ? names.get(b.parent) : null })) : [], animations: gltf.animations.map((c) => ({ name: c.name, duration: c.duration })) };
  }
  function remove(id) {
    const m = models.get(id);
    if (!m) return;
    scene.remove(m.root);
    if (m.helper) scene.remove(m.helper);
    models.delete(id);
  }
  function setTransform(id, { position, rotationY, scale }) {
    const m = models.get(id);
    if (!m) return;
    if (position) m.root.position.fromArray(position);
    if (rotationY !== undefined) m.root.rotation.y = THREE.MathUtils.degToRad(rotationY);
    if (scale) m.root.scale.setScalar(scale);
    draw();
  }
  function setCamera({ position, target, fov }) {
    if (position) camera.position.fromArray(position);
    if (target) controls.target.fromArray(target);
    if (fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    controls.update();
    draw();
  }
  const round = (v) => v.toArray().map((x) => Math.round(x * 1000) / 1000);
  function getCamera() {
    return { position: round(camera.position), target: round(controls.target), fov: camera.fov };
  }
  function setLights(list) {
    lights.forEach((l) => {
      scene.remove(l);
      if (l.target) scene.remove(l.target);
    });
    lights = list.slice(0, 3).map((l) => {
      const colour = new THREE.Color(l.color);
      const light = l.type === "sun" ? new THREE.DirectionalLight(colour, l.intensity * LIGHT_SCALE.sun) : l.type === "spot" ? new THREE.SpotLight(colour, l.intensity * LIGHT_SCALE.spot, 0, Math.PI / 5, 0.3, 2) : new THREE.PointLight(colour, l.intensity * LIGHT_SCALE.point, 0, 2);
      light.position.fromArray(l.position);
      light.castShadow = true;
      scene.add(light);
      if (light.target) {
        light.target.position.copy(controls.target);
        scene.add(light.target);
      }
      return light;
    });
    draw();
  }
  function setGround(on) {
    ground.visible = !!on;
    draw();
  }
  function showSkeleton(on) {
    models.forEach((m) => m.helper && (m.helper.visible = !!on));
    draw();
  }
  function setTime(seconds) {
    models.forEach((m) => m.mixer?.setTime(seconds));
    models.forEach((m) => m.ik?.update());
    draw();
  }
  const bone = (id, name) => models.get(id)?.byName.get(name) || null;
  // FK: euler degrees (bone-local XYZ) on top of the rest rotation. Stops the animation clip for that model.
  function setPose(id, pose) {
    const m = models.get(id);
    if (!m?.skeleton) return;
    m.mixer?.stopAllAction();
    for (const b of m.skeleton.bones) {
      if (!m.rest.has(b)) continue;
      const e = pose?.[m.names.get(b)];
      b.quaternion.copy(m.rest.get(b));
      if (e) b.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...e.map(THREE.MathUtils.degToRad))));
    }
    m.ik?.update();
    draw();
  }
  // IK preview: the end bone's head toward a world target, rotating `chain` parent bones (CCD, an approximation of
  // Blender's solver; backend/blender/render.py uses the same meaning).
  function setIk(id, list) {
    const m = models.get(id);
    if (!m?.skeleton) return;
    const mesh = [];
    m.root.traverse((o) => o.isSkinnedMesh && mesh.push(o));
    const targets = [];
    const iks = (list || []).flatMap((ik) => {
      const end = m.skeleton.bones.indexOf(bone(id, ik.bone));
      if (end < 0) return [];
      let target = m.skeleton.bones.find((b) => b.name === "__ik_" + ik.bone);
      if (!target) {
        target = new THREE.Bone();
        target.name = "__ik_" + ik.bone;
        m.root.add(target);
        m.skeleton.bones.push(target);
        m.skeleton.boneInverses.push(new THREE.Matrix4());
      }
      target.position.copy(m.root.worldToLocal(new THREE.Vector3(...ik.target)));
      targets.push(target);
      const links = [];
      let b = m.skeleton.bones[end].parent;
      for (let i = 0; i < (ik.chain || 2) && b?.isBone; i++, b = b.parent) links.push({ index: m.skeleton.bones.indexOf(b) });
      return [{ target: m.skeleton.bones.indexOf(target), effector: end, links, iteration: 20 }];
    });
    m.ik = iks.length && mesh[0] ? new CCDIKSolver(mesh[0], iks) : null;
    m.ik?.update();
    draw();
  }
  // World rotation of each bone relative to its rest pose, quaternion [w,x,y,z] in scene (glTF) axes: what the
  // Blender render applies (independent of each importer's bone-local axes).
  function poseDeltas(id) {
    const m = models.get(id);
    if (!m?.skeleton) return {};
    m.root.updateMatrixWorld(true);
    const out = {}, q = new THREE.Quaternion(), r = new THREE.Quaternion();
    const saved = m.skeleton.bones.map((b) => b.quaternion.clone());
    const posed = m.skeleton.bones.map((b) => b.getWorldQuaternion(new THREE.Quaternion()));
    m.skeleton.bones.forEach((b) => m.rest.has(b) && b.quaternion.copy(m.rest.get(b)));
    m.root.updateMatrixWorld(true);
    m.skeleton.bones.forEach((b, i) => {
      if (!m.rest.has(b)) return;
      b.getWorldQuaternion(r);
      q.copy(posed[i]).multiply(r.invert());
      if (Math.abs(q.w) < 0.99999) out[m.names.get(b)] = [q.w, q.x, q.y, q.z].map((x) => Math.round(x * 1e5) / 1e5);
    });
    m.skeleton.bones.forEach((b, i) => b.quaternion.copy(saved[i]));
    m.root.updateMatrixWorld(true);
    return out;
  }
  function boneWorld(id, name) {
    const b = bone(id, name);
    return b ? round(b.getWorldPosition(new THREE.Vector3())) : null;
  }
  function screenshot() {
    draw();
    return canvas.toDataURL("image/png");
  }
  function dispose() {
    controls.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
  }
  const api = { load, remove, setTransform, setCamera, getCamera, setLights, setGround, showSkeleton, setTime, setPose, setIk, poseDeltas, boneWorld, screenshot, resize, draw, dispose, renderer, scene, camera, controls, models };
  draw();
  return api;
}
