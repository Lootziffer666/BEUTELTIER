import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { materials } from './materials/KoelnmesseMaterials.js';
import { ArchitectureGenerator } from './generators/ArchitectureGenerator.js';
import { OutdoorGenerator } from './generators/OutdoorGenerator.js';
import { CrowdControlGenerator } from './generators/CrowdControlGenerator.js';
import { FurnitureGenerator } from './generators/FurnitureGenerator.js';
import { SafetyGenerator } from './generators/SafetyGenerator.js';
import { TechGenerator } from './generators/TechGenerator.js';
import { BoothGenerator } from './generators/BoothGenerator.js';
import { FnbGenerator } from './generators/FnbGenerator.js';
import { AtmosphereSystem } from './systems/AtmosphereSystem.js';
import { LightingRig } from './systems/LightingRig.js';
import { CollisionSystem } from './systems/CollisionSystem.js';
import { PostProcessingStack } from './systems/PostProcessingStack.js';
import { NavMeshGenerator } from './systems/NavMeshGenerator.js';
import { PressKitLoader } from './data/PressKitLoader.js';

// === NEU: Behavior Tree + Absurde Messe ===
import { CrowdBehaviorSystem } from './integration/CrowdBehavior.js';
import { PlayerObserver } from './systems/PlayerObserver.js';
import { NarratorSystem } from './systems/NarratorSystem.js';
import * as AbsurdStands from './behavior/AbsurdStands.js';

export async function initGamescomScene({ container = document.body } = {}) {
  const scene = new THREE.Scene();
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 300);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.domElement.classList.add('procedural-messe__canvas');
  container.appendChild(renderer.domElement);

  // === ATMOSPHÄRE ===
  const atmo = new AtmosphereSystem(scene, renderer);
  atmo.initFog(0.025);

  // === BELEUCHTUNG ===
  const lighting = new LightingRig(scene);
  lighting.addTrussGrid(60, 40, 10, 13);
  lighting.addZoneLight(0x0088ff, 35, -15, 5, -10, 20);
  lighting.addZoneLight(0xff0000, 30, 15, 5, -10, 20);
  lighting.addZoneLight(0x00ff44, 25, 0, 5, 10, 20);
  lighting.addZoneLight(0xffaa00, 20, -20, 4, 15, 15);

  // === POST-PROCESSING ===
  const post = new PostProcessingStack(renderer, scene, camera);

  // === KOLLISIONS-SYSTEM ===
  const collision = new CollisionSystem();

  // === HALLEN-GLB LADEN ===
  const loader = new GLTFLoader();
  let hall;

  try {
    hall = await loader.loadAsync('/models/koelnmesse_halle10.glb');
    scene.add(hall.scene);

    hall.scene.traverse(child => {
      if (!child.isMesh) return;
      const n = child.name.toLowerCase();
      if (n.includes('boden') || n.includes('floor') || n.includes('ground')) {
        child.material = materials.get('floor');
        child.receiveShadow = true;
      }
      else if (n.includes('wand') || n.includes('wall')) {
        child.material = materials.get('wall');
        child.receiveShadow = true;
      }
      else if (n.includes('decke') || n.includes('ceiling') || n.includes('truss') || n.includes('roof')) {
        child.material = materials.get('truss');
        child.castShadow = true;
      }
      else if (n.includes('fenster') || n.includes('glas') || n.includes('window')) {
        child.material = materials.get('windowGlass');
      }
      else if (n.includes('fassade') || n.includes('facade')) {
        child.material = materials.get('facade');
      }
      else if (n.includes('saeule') || n.includes('pillar') || n.includes('column')) {
        child.material = materials.get('concrete');
        child.castShadow = true;
      }
      child.castShadow = true;
      child.receiveShadow = true;
    });

    collision.extractFromGroup(hall.scene);
  } catch (error) {
    console.warn('GLB nicht gefunden, generiere prozedurale Halle', error);
    const floor = ArchitectureGenerator.createHalleFloor(60, 40);
    scene.add(floor);
    const ceiling = ArchitectureGenerator.createCeilingTruss(60, 40, 10, 13.5);
    scene.add(ceiling);
  }

  // === ARCHITEKTUR ===
  const facade = ArchitectureGenerator.createGlassFacade(40, 8, 16, 0.3);
  facade.position.set(0, 0, -20);
  scene.add(facade);

  // === OUTDOOR ===
  for (let i = 0; i < 12; i++) {
    const tree = OutdoorGenerator.createTree(
      (Math.random() - 0.5) * 60,
      25 + Math.random() * 20,
      0.8 + Math.random() * 0.6
    );
    scene.add(tree);
  }

  const grass = OutdoorGenerator.createGrassField(4000, 80, 40);
  grass.position.set(0, 0, 35);
  scene.add(grass);

  const fence1 = OutdoorGenerator.createFence(30, 'mesh', 2.2);
  fence1.position.set(-25, 0, 30);
  scene.add(fence1);

  const fence2 = OutdoorGenerator.createFence(20, 'solid', 2);
  fence2.position.set(20, 0, 30);
  scene.add(fence2);

  const leitplanke = OutdoorGenerator.createLeitplanke(50);
  leitplanke.position.set(0, 0, 45);
  scene.add(leitplanke);

  // === CROWD CONTROL ===
  for (let i = -2; i <= 2; i++) {
    const turnstile = CrowdControlGenerator.createTurnstile();
    turnstile.position.set(i * 2.5, 0, -18);
    scene.add(turnstile);
    collision.extractFromGroup(turnstile);
  }

  const scanner = CrowdControlGenerator.createTicketScanner();
  scanner.position.set(-8, 0, -16);
  scene.add(scanner);

  const wristband = CrowdControlGenerator.createWristbandDispenser('GAMESCOM 2026');
  wristband.position.set(8, 0, -16);
  scene.add(wristband);

  for (let i = 0; i < 6; i++) {
    const tape = CrowdControlGenerator.createBarrierTape(4, 1.2);
    tape.position.set(-15 + i * 5, 0, -14);
    scene.add(tape);
  }

  // === MÖBLIERUNG ===
  for (let i = 0; i < 8; i++) {
    const bench = FurnitureGenerator.createBench(2.5);
    bench.position.set(-20 + i * 6, 0, 5 + (i % 2) * 2);
    bench.rotation.y = (i % 2) * 0.2;
    scene.add(bench);
    collision.extractFromGroup(bench);
  }

  for (let i = 0; i < 4; i++) {
    const toilet = FurnitureGenerator.createToiletStall(i < 2 ? 'male' : 'female');
    toilet.position.set(-28, 0, -5 + i * 1.5);
    scene.add(toilet);
    collision.extractFromGroup(toilet);
  }

  for (let i = 0; i < 3; i++) {
    const sink = FurnitureGenerator.createSink();
    sink.position.set(-26, 0, -3 + i * 1.2);
    scene.add(sink);
  }

  // === SICHERHEIT ===
  for (let i = 0; i < 6; i++) {
    const extinguisher = SafetyGenerator.createFireExtinguisher();
    extinguisher.position.set(
      (Math.random() - 0.5) * 50,
      0,
      (Math.random() - 0.5) * 30
    );
    scene.add(extinguisher);
    collision.extractFromGroup(extinguisher);
  }

  const exit1 = SafetyGenerator.createExitSign();
  exit1.position.set(-20, 0, -19);
  scene.add(exit1);

  const exit2 = SafetyGenerator.createExitSign();
  exit2.position.set(20, 0, -19);
  scene.add(exit2);

  // === TECH ===
  for (let x = -20; x <= 20; x += 10) {
    for (let z = -15; z <= 15; z += 10) {
      const spot = TechGenerator.createSpotlight(x, 12.5, z, 0);
      scene.add(spot);
    }
  }

  const screen1 = TechGenerator.createLEDWall(8, 4.5, 'CYBERPUNK 2077');
  screen1.position.set(-10, 5, -10);
  scene.add(screen1);
  collision.extractFromGroup(screen1);

  const screen2 = TechGenerator.createLEDWall(6, 3.5, 'STARFIELD');
  screen2.position.set(10, 4, -8);
  scene.add(screen2);

  const banner1 = TechGenerator.createHangingBanner('HALO', -5, 10, 0);
  scene.add(banner1);

  const banner2 = TechGenerator.createHangingBanner('GTA VI', 5, 10, 0);
  scene.add(banner2);

  // === MESSESTÄNDE ===
  const psBooth = BoothGenerator.createInfoCounter(5, 0x0033cc);
  psBooth.position.set(-15, 0, -5);
  scene.add(psBooth);
  collision.extractFromGroup(psBooth);

  const cardboard1 = BoothGenerator.createCardboardFigure('Master Chief', 'Halo Infinite', -13, -3);
  scene.add(cardboard1);
  collision.extractFromGroup(cardboard1);

  const cardboard2 = BoothGenerator.createCardboardFigure('Kratos', 'God of War', 12, -3);
  scene.add(cardboard2);

  const pressKit = new PressKitLoader();
  const demoGames = [
    { title: 'Elden Ring 2', color: 0x880000, hasTrailer: true, protagonist: 'Tarnished' },
    { title: 'Hollow Knight: Silksong', color: 0x440088, hasTrailer: true, protagonist: 'Hornet' },
    { title: 'GTA VI', color: 0x008844, hasTrailer: true, protagonist: 'Lucia' }
  ];

  demoGames.forEach((game, i) => {
    const booth = pressKit.createBoothFromData(game, -20 + i * 12, 8);
    scene.add(booth);
    collision.extractFromGroup(booth);
  });

  // === FNB ===
  const redbull = FnbGenerator.createRedBullContainer();
  redbull.position.set(25, 0, 10);
  scene.add(redbull);
  collision.extractFromGroup(redbull);

  const catering = FnbGenerator.createCateringTable(6);
  catering.position.set(22, 0, 15);
  scene.add(catering);

  const coffee = FnbGenerator.createCoffeeStation();
  coffee.position.set(20, 0, 12);
  scene.add(coffee);

  // === ABSURDE STÄNDE (der lustige Teil) ===
  scene.add(AbsurdStands.createPatchnotesStand(-8, -8));
  scene.add(AbsurdStands.createLoadingStand(-12, 5));
  scene.add(AbsurdStands.createLootboxToilet(15, -10));
  scene.add(AbsurdStands.createAGBBossStand(-15, -15));
  scene.add(AbsurdStands.createNPCPettingZoo(12, 8));
  scene.add(AbsurdStands.createExitSimulator(8, -12));
  scene.add(AbsurdStands.createAIStand(-5, 12));
  scene.add(AbsurdStands.createRatingStand(5, 5));

  // === NAVMESH ===
  const navmesh = new NavMeshGenerator(scene, 0.5);
  navmesh.scanStaticObstacles();
  navmesh.buildWalkableGrid();

  // === CROWD MIT BEHAVIOR TREES ===
  const behaviorCrowd = new CrowdBehaviorSystem(scene, navmesh);
  for (let i = 0; i < 500; i++) {
    behaviorCrowd.createAgent(
      (Math.random() - 0.5) * 40,
      (Math.random() - 0.5) * 30
    );
  }

  // Crowd-InstancedMesh (sichtbare Agenten)
  const crowdGeom = new THREE.CapsuleGeometry(0.25, 0.6, 4, 8);
  const crowdMat = new THREE.MeshStandardMaterial({ color: 0x6688cc, roughness: 0.7 });
  const crowdMesh = new THREE.InstancedMesh(crowdGeom, crowdMat, 500);
  crowdMesh.castShadow = true;
  crowdMesh.receiveShadow = true;
  scene.add(crowdMesh);

  // === NARRATOR + PLAYER OBSERVER ===
  const narrator = new NarratorSystem();
  const observer = new PlayerObserver(camera, narrator);

  // === KAMERA & CONTROLS ===
  camera.position.set(0, 1.7, 20);

  const keys = {};
  const onKeyDown = e => keys[e.code] = true;
  const onKeyUp = e => keys[e.code] = false;
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  let yaw = 0, pitch = 0;
  const onMouseMove = e => {
    if (document.pointerLockElement === renderer.domElement) {
      yaw -= e.movementX * 0.002;
      pitch -= e.movementY * 0.002;
      pitch = Math.max(-1.5, Math.min(1.5, pitch));
    }
  };
  document.addEventListener('mousemove', onMouseMove);

  const onCanvasClick = () => {
    renderer.domElement.requestPointerLock();
    observer.onPlayerClick();
  };
  renderer.domElement.addEventListener('click', onCanvasClick);

  // === ANIMATION LOOP ===
  const clock = new THREE.Clock();

  let animationFrame = 0;
  function animate() {
    animationFrame = requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    atmo.update(time, delta);

    scene.traverse(child => {
      if (child.userData?.update) child.userData.update(time);
    });

    behaviorCrowd.update(delta, time);

    const matrices = behaviorCrowd.getAgentMatrices();
    matrices.forEach((mat, i) => crowdMesh.setMatrixAt(i, mat));
    crowdMesh.instanceMatrix.needsUpdate = true;

    observer.update(delta, behaviorCrowd.world);

    const speed = 4 * delta;
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

    const nextPos = camera.position.clone();
    if (keys['KeyW']) nextPos.addScaledVector(forward, speed);
    if (keys['KeyS']) nextPos.addScaledVector(forward, -speed);
    if (keys['KeyA']) nextPos.addScaledVector(right, -speed);
    if (keys['KeyD']) nextPos.addScaledVector(right, speed);

    const playerBox = new THREE.Box3().setFromCenterAndSize(nextPos, new THREE.Vector3(0.6, 1.7, 0.6));
    const collisions = collision.checkIntersection(playerBox);

    if (collisions.length === 0) {
      camera.position.copy(nextPos);
    }

    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;

    post.render();
  }

  animate();

  const onResize = () => {
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    post.resize(width, height);
  };
  window.addEventListener('resize', onResize);

  const dispose = () => {
    cancelAnimationFrame(animationFrame);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('resize', onResize);
    renderer.domElement.removeEventListener('click', onCanvasClick);
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
    renderer.dispose();
    renderer.domElement.remove();
  };

  return { scene, camera, renderer, collision, navmesh, post, behaviorCrowd, narrator, observer, dispose };
}
