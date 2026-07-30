window.startJumper3D = function startJumper3D(THREE, GLTFLoader, DRACOLoader) {
  const canvas = document.querySelector("#gameCanvas");
  const scoreValue = document.querySelector("#scoreValue");
  const highScoreValue = document.querySelector("#highScoreValue");
  const statusText = document.querySelector("#statusText");
  const restartPanel = document.querySelector("#restartPanel");
  const restartButton = document.querySelector("#restartButton");
  const finalScoreValue = document.querySelector("#finalScoreValue");
  const soundToggle = document.querySelector("#soundToggle");
  const fpsMeter = document.querySelector("#fpsMeter");
  const lowGraphicsButton = document.querySelector("#lowGraphics");
  const highGraphicsButton = document.querySelector("#highGraphics");
  const loaderScreen = document.querySelector("#loaderScreen");
  const guideToggle = document.querySelector("#guideToggle");
  const gameGuide = document.querySelector("#gameGuide");
  const guideClose = document.querySelector("#guideClose");
  const guidePlay = document.querySelector("#guidePlay");
  const runnerSelect = document.querySelector("#runnerSelect");
  const runnerLoading = document.querySelector("#runnerLoading");
  const runnerOptions = [...document.querySelectorAll(".runner-option")];
  const runnerToggle = document.querySelector("#runnerToggle");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030706);
  scene.fog = new THREE.FogExp2(0x07100c, 0.028);

  const camera = new THREE.PerspectiveCamera(
    52,
    window.innerWidth / window.innerHeight,
    0.1,
    120,
  );
  let cameraBaseY = 5.1;

  function setCameraView() {
    const portrait = window.innerWidth / window.innerHeight < 0.8;
    cameraBaseY = portrait ? 5.6 : 5.1;
    camera.position.set(
      portrait ? 2.8 : 4.6,
      cameraBaseY,
      portrait ? 15.5 : 13.2,
    );
    camera.lookAt(-0.8, 1.55, -1.2);
    camera.rotation.z = 0;
  }

  setCameraView();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  const renderPixelRatio = () => Math.min(window.devicePixelRatio || 1, 1.25);
  renderer.setPixelRatio(renderPixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const state = {
    running: false,
    playerReady: false,
    obstaclesReady: false,
    gameOver: false,
    score: 0,
    highScore: 0,
    scoreClock: 0,
    survivalTime: 0,
    spawnTimer: 5,
    hasSpawned: false,
    jumping: false,
    jumpTime: 0,
    jumpBoosted: false,
    ducking: false,
    obstacles: [],
  };

  const clock = new THREE.Clock();
  const playerBox = new THREE.Box3();
  const obstacleBox = new THREE.Box3();
  const neonMaterials = [];
  const roadMarkers = [];
  const cityBlocks = [];
  const obstacleTemplates = [];
  let speedParticles = null;
  let runnerSpeedLines = null;
  let superJumpLines = null;
  let playerMixer = null;
  let idleAction = null;
  let runAction = null;
  let rollAction = null;
  let jumpAction = null;
  let activePlayerAction = null;
  let audioContext = null;
  let audioMaster = null;
  let musicTimer = null;
  let musicStep = 0;
  let soundEnabled = false;
  let displayedScore = 0;
  let scoreDatabasePromise = null;
  let highScoreLoaded = false;
  let fpsFrameCount = 0;
  let fpsSampleStarted = performance.now();
  let graphicsQuality = "high";
  let adaptivePixelRatio = 0.82;
  let lastResolutionAdjustment = 0;
  const loaderStartedAt = performance.now();
  let loadingCompleteScheduled = false;
  let guideWasRunning = false;
  let runnerSelectionShown = false;
  let selectedRunner = "tron";
  let playerModel = null;

  function openGameGuide() {
    if (!gameGuide.hidden) return;
    guideWasRunning = state.running;
    state.running = false;
    setDuck(false);
    playPlayerAction(idleAction || runAction);
    gameGuide.hidden = false;
    guideToggle.setAttribute("aria-expanded", "true");
    guidePlay.textContent = guideWasRunning ? "Continue running" : "Start running";
    window.requestAnimationFrame(() => guidePlay.focus());
  }

  function closeGameGuide() {
    if (gameGuide.hidden) return;
    gameGuide.hidden = true;
    guideToggle.setAttribute("aria-expanded", "false");
    if (!runnerSelectionShown && !state.gameOver) {
      runnerSelectionShown = true;
      openRunnerSelect();
      return;
    }
    if (!state.gameOver && state.playerReady && state.obstaclesReady) {
      state.running = true;
      playPlayerAction(runAction || idleAction);
      clock.getDelta();
    }
    guideToggle.focus();
  }

  function openRunnerSelect() {
    if (!runnerSelect.hidden) return;
    state.running = false;
    playPlayerAction(idleAction || runAction);
    runnerSelect.hidden = false;
    runnerToggle.setAttribute("aria-expanded", "true");
    runnerLoading.textContent = "";
    window.requestAnimationFrame(() => {
      runnerOptions.find((option) => option.dataset.runner === selectedRunner)?.focus();
    });
  }

  function closeRunnerSelect() {
    runnerSelect.hidden = true;
    runnerToggle.setAttribute("aria-expanded", "false");
    if (!state.gameOver && state.playerReady && state.obstaclesReady) {
      state.running = true;
      playPlayerAction(runAction || idleAction);
      clock.getDelta();
    }
  }

  function finishLoadingIfReady() {
    if (
      loadingCompleteScheduled ||
      !state.playerReady ||
      !state.obstaclesReady
    ) {
      return;
    }
    loadingCompleteScheduled = true;
    const remaining = Math.max(0, 700 - (performance.now() - loaderStartedAt));
    window.setTimeout(() => {
      loaderScreen.classList.add("is-hidden");
      loaderScreen.setAttribute("aria-hidden", "true");
      if (!state.gameOver) {
        state.running = false;
        playPlayerAction(idleAction || runAction);
        statusText.textContent = "First obstacle in 5 seconds";
        clock.getDelta();
        openGameGuide();
      }
    }, remaining);
  }

  function openScoreDatabase() {
    if (scoreDatabasePromise) return scoreDatabasePromise;
    scoreDatabasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open("jumper-game", 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("scores")) {
          database.createObjectStore("scores");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return scoreDatabasePromise;
  }

  async function loadHighScore() {
    try {
      const database = await openScoreDatabase();
      const value = await new Promise((resolve, reject) => {
        const transaction = database.transaction("scores", "readonly");
        const request = transaction.objectStore("scores").get("highest");
        request.onsuccess = () => resolve(Number(request.result) || 0);
        request.onerror = () => reject(request.error);
      });
      state.highScore = value;
      highScoreLoaded = true;
      highScoreValue.textContent = String(state.highScore);
      if (state.score > value) storeHighScore(state.score);
    } catch (error) {
      console.warn("Unable to load high score from IndexedDB", error);
    }
  }

  async function storeHighScore(value) {
    if (!highScoreLoaded || value <= state.highScore) return;
    state.highScore = value;
    highScoreValue.textContent = String(value);
    try {
      const database = await openScoreDatabase();
      await new Promise((resolve, reject) => {
        const transaction = database.transaction("scores", "readwrite");
        transaction.objectStore("scores").put(value, "highest");
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (error) {
      console.warn("Unable to save high score to IndexedDB", error);
    }
  }

  function ensureAudio() {
    if (!soundEnabled) return;
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioMaster = audioContext.createGain();
      audioMaster.gain.value = 0.18;
      audioMaster.connect(audioContext.destination);
      musicTimer = window.setInterval(playMusicStep, 150);
    }
    if (audioContext.state === "suspended") audioContext.resume();
  }

  function synthTone(
    frequency,
    duration,
    volume = 0.12,
    type = "sawtooth",
    endFrequency = frequency,
    delay = 0,
  ) {
    if (!soundEnabled || !audioContext || !audioMaster) return;
    const now = audioContext.currentTime + delay;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(20, endFrequency),
      now + duration,
    );
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(audioMaster);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  function noiseBurst(duration = 0.16, volume = 0.16) {
    if (!soundEnabled || !audioContext || !audioMaster) return;
    const frameCount = Math.ceil(audioContext.sampleRate * duration);
    const buffer = audioContext.createBuffer(
      1,
      frameCount,
      audioContext.sampleRate,
    );
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) {
      channel[index] = (Math.random() * 2 - 1) * (1 - index / frameCount);
    }
    const source = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();
    filter.type = "bandpass";
    filter.frequency.value = 440;
    filter.Q.value = 0.8;
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioMaster);
    source.start();
  }

  function playMusicStep() {
    if (!soundEnabled || !audioContext || !state.running) return;
    const bassPattern = [55, 55, 65.41, 55, 73.42, 65.41, 82.41, 73.42];
    const leadPattern = [220, 261.63, 329.63, 293.66, 220, 329.63, 392, 329.63];
    const step = musicStep % bassPattern.length;
    synthTone(bassPattern[step], 0.13, 0.095, "sawtooth");
    if (step % 2 === 0) {
      synthTone(leadPattern[step], 0.1, 0.035, "square", leadPattern[step] * 1.01);
    }
    if (step === 0 || step === 4) {
      synthTone(42, 0.1, 0.13, "sine", 28);
    }
    musicStep += 1;
  }

  function playJumpSound(boosted = false) {
    synthTone(boosted ? 420 : 310, 0.18, 0.16, "square", boosted ? 880 : 620);
  }

  function playDuckSound() {
    synthTone(240, 0.14, 0.13, "sawtooth", 75);
  }

  function playImpactSound() {
    noiseBurst(0.22, 0.28);
    synthTone(105, 0.28, 0.2, "square", 38);
  }

  function playGameOverSound() {
    [330, 247, 196, 123].forEach((frequency, index) => {
      synthTone(frequency, 0.28, 0.11, "triangle", frequency * 0.72, index * 0.13);
    });
  }

  function updateScoreDisplay(value, force = false) {
    if (!force && value === displayedScore) return;
    displayedScore = value;
    scoreValue.textContent = String(value);
    scoreValue.classList.remove("score-spin");
    void scoreValue.offsetWidth;
    scoreValue.classList.add("score-spin");
    storeHighScore(value);
  }

  function animateFinalScore(target) {
    const counter = { value: 0 };
    finalScoreValue.textContent = "0";
    gsap.to(counter, {
      value: target,
      duration: Math.min(2.2, 0.8 + target * 0.018),
      ease: "power3.out",
      onUpdate: () => {
        finalScoreValue.textContent = String(Math.round(counter.value));
      },
    });
  }

  scene.add(new THREE.HemisphereLight(0x7ac69a, 0x050807, 1.15));

  const moonLight = new THREE.DirectionalLight(0xb8ffd5, 2.4);
  moonLight.position.set(-7, 12, 8);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  moonLight.shadow.camera.left = -18;
  moonLight.shadow.camera.right = 18;
  moonLight.shadow.camera.top = 16;
  moonLight.shadow.camera.bottom = -8;
  scene.add(moonLight);

  const rimLight = new THREE.PointLight(0x32d976, 20, 18, 2);
  rimLight.position.set(-4.5, 3.5, 4);
  scene.add(rimLight);

  const cityGlow = new THREE.PointLight(0x32a967, 25, 36, 2);
  cityGlow.position.set(5, 6, -10);
  scene.add(cityGlow);

  function initialGraphicsQuality() {
    const saved = localStorage.getItem("night-runner-graphics");
    if (saved === "low" || saved === "high") return saved;
    return window.matchMedia("(max-width: 680px), (pointer: coarse)").matches
      ? "low"
      : "high";
  }

  function setGraphicsQuality(mode, persist = true) {
    graphicsQuality = mode === "low" ? "low" : "high";
    const high = graphicsQuality === "high";
    if (persist) localStorage.setItem("night-runner-graphics", graphicsQuality);

    lowGraphicsButton.setAttribute("aria-pressed", String(!high));
    highGraphicsButton.setAttribute("aria-pressed", String(high));

    adaptivePixelRatio = 0.82;
    lastResolutionAdjustment = performance.now();
    renderer.setPixelRatio(
      high
        ? Math.min(window.devicePixelRatio || 1, 1.5)
        : Math.min(window.devicePixelRatio || 1, adaptivePixelRatio),
    );
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    moonLight.castShadow = true;

    if (speedParticles) speedParticles.visible = true;
    if (runnerSpeedLines) runnerSpeedLines.visible = state.running;
    if (superJumpLines) {
      superJumpLines.visible = state.jumping && state.jumpBoosted;
    }
    const stars = scene.getObjectByName("stars");
    if (stars) stars.visible = true;

    cityBlocks.forEach((block) => {
      block.visible = true;
      block.traverse((object) => {
        if (object.userData.highQualityOnly) object.visible = true;
        if (object.userData.buildingMesh) {
          object.material = high
            ? object.userData.litMaterial
            : object.userData.flatMaterial;
        }
      });
    });
    applyObstacleTextureQuality(high);
  }

  function applyAdaptiveResolution(fps, now) {
    if (
      graphicsQuality !== "low" ||
      now - lastResolutionAdjustment < 1500
    ) {
      return;
    }
    const previousRatio = adaptivePixelRatio;
    if (fps < 54) {
      adaptivePixelRatio = Math.max(0.55, adaptivePixelRatio - 0.08);
    } else if (fps >= 59) {
      adaptivePixelRatio = Math.min(0.9, adaptivePixelRatio + 0.04);
    }
    if (adaptivePixelRatio !== previousRatio) {
      renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, adaptivePixelRatio),
      );
      renderer.setSize(window.innerWidth, window.innerHeight);
      lastResolutionAdjustment = now;
    }
  }

  function prepareObstacleTextures(root) {
    const textureSlots = [
      "map",
      "normalMap",
      "roughnessMap",
      "metalnessMap",
      "emissiveMap",
    ];
    const visited = new Set();
    root.traverse((object) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((objectMaterial) => {
        textureSlots.forEach((slot) => {
          const texture = objectMaterial?.[slot];
          const image = texture?.image;
          if (!texture || !image || visited.has(texture)) return;
          visited.add(texture);
          texture.userData.fullImage = image;
          const width = image.naturalWidth || image.videoWidth || image.width;
          const height =
            image.naturalHeight || image.videoHeight || image.height;
          if (!width || !height || Math.max(width, height) <= 512) return;
          const scale = 512 / Math.max(width, height);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));
          canvas
            .getContext("2d", { alpha: true })
            .drawImage(image, 0, 0, canvas.width, canvas.height);
          texture.userData.lowImage = canvas;
        });
      });
    });
  }

  function applyObstacleTextureQuality(high) {
    obstacleTemplates.forEach((template) => {
      template.scene.traverse((object) => {
        if (!object.isMesh) return;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((objectMaterial) => {
          [
            "map",
            "normalMap",
            "roughnessMap",
            "metalnessMap",
            "emissiveMap",
          ].forEach((slot) => {
            const texture = objectMaterial?.[slot];
            if (!texture?.userData.fullImage) return;
            texture.image =
              high || !texture.userData.lowImage
                ? texture.userData.fullImage
                : texture.userData.lowImage;
            texture.needsUpdate = true;
          });
        });
      });
    });
  }

  function material(color, roughness = 0.35, metalness = 0.4) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }

  function mesh(geometry, meshMaterial, cast = true, receive = true) {
    const object = new THREE.Mesh(geometry, meshMaterial);
    object.castShadow = cast;
    object.receiveShadow = receive;
    return object;
  }

  function createWorld() {
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x070d0a,
      roughness: 0.72,
      metalness: 0.35,
    });
    const road = mesh(new THREE.PlaneGeometry(90, 20), roadMaterial, false, true);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, -0.02, 0);
    scene.add(road);

    const curbMaterial = material(0x123326, 0.48, 0.58);
    [-2.4, 2.4].forEach((z) => {
      const curb = mesh(new THREE.BoxGeometry(90, 0.16, 0.16), curbMaterial);
      curb.position.set(0, 0.05, z);
      scene.add(curb);
    });

    const laneMaterial = new THREE.MeshBasicMaterial({ color: 0x63c98c });
    for (let x = -42; x < 43; x += 3.2) {
      const lane = mesh(
        new THREE.BoxGeometry(1.45, 0.025, 0.035),
        laneMaterial,
        false,
        false,
      );
      lane.position.set(x, 0.018, 1.35);
      scene.add(lane);
      roadMarkers.push(lane);
    }

    const particleCount = 220;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleVelocity = new Float32Array(particleCount);
    for (let index = 0; index < particleCount; index += 1) {
      particlePositions[index * 3] = -38 + Math.random() * 76;
      particlePositions[index * 3 + 1] = 0.25 + Math.random() * 6.5;
      particlePositions[index * 3 + 2] = 1.5 - Math.random() * 8;
      particleVelocity[index] = 0.55 + Math.random() * 0.85;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(particlePositions, 3),
    );
    speedParticles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        color: 0x9effbd,
        size: 0.14,
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    speedParticles.userData.velocity = particleVelocity;
    scene.add(speedParticles);

    const runnerLinePositions = new Float32Array(28 * 6);
    for (let index = 0; index < 28; index += 1) {
      const offset = index * 6;
      const startX = -11 + Math.random() * 5.5;
      const lineLength = 0.35 + Math.random() * 0.9;
      const y = 0.35 + Math.random() * 2.45;
      const z = -0.9 + Math.random() * 1.8;
      runnerLinePositions.set(
        [startX, y, z, startX + lineLength, y, z],
        offset,
      );
    }
    const runnerLineGeometry = new THREE.BufferGeometry();
    runnerLineGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(runnerLinePositions, 3),
    );
    runnerSpeedLines = new THREE.LineSegments(
      runnerLineGeometry,
      new THREE.LineBasicMaterial({
        color: 0x8effb4,
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    runnerSpeedLines.visible = false;
    scene.add(runnerSpeedLines);

    const jumpLinePositions = new Float32Array(18 * 6);
    for (let index = 0; index < 18; index += 1) {
      const offset = index * 6;
      const startX = -9.5 + Math.random() * 6.5;
      const lineLength = 0.5 + Math.random() * 1.4;
      const z = -2 + Math.random() * 4;
      jumpLinePositions.set(
        [startX, 0.045, z, startX + lineLength, 0.045, z],
        offset,
      );
    }
    const jumpLineGeometry = new THREE.BufferGeometry();
    jumpLineGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(jumpLinePositions, 3),
    );
    superJumpLines = new THREE.LineSegments(
      jumpLineGeometry,
      new THREE.LineBasicMaterial({
        color: 0xb6ffcc,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    superJumpLines.visible = false;
    scene.add(superJumpLines);

    const starCount = 320;
    const starPositions = new Float32Array(starCount * 3);
    for (let index = 0; index < starCount; index += 1) {
      starPositions[index * 3] = (Math.random() - 0.5) * 95;
      starPositions[index * 3 + 1] = 5 + Math.random() * 34;
      starPositions[index * 3 + 2] = -12 - Math.random() * 55;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(starPositions, 3),
    );
    const stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({
        color: 0xa8ffd0,
        size: 0.095,
        transparent: true,
        opacity: 0.9,
      }),
    );
    stars.name = "stars";
    scene.add(stars);

    const moon = mesh(
      new THREE.SphereGeometry(1.7, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xcaffdf }),
      false,
      false,
    );
    moon.position.set(-13, 12, -28);
    scene.add(moon);

    const moonHalo = mesh(
      new THREE.SphereGeometry(2.2, 20, 20),
      new THREE.MeshBasicMaterial({
        color: 0x38ff8b,
        transparent: true,
        opacity: 0.08,
      }),
      false,
      false,
    );
    moonHalo.position.copy(moon.position);
    scene.add(moonHalo);

    createCity();
  }

  function createCity() {
    const windowGeometry = new THREE.PlaneGeometry(0.2, 0.3);
    const windowColors = [0x43c878, 0x82d9a3, 0x35ad76, 0xb1dfc2];

    for (let index = 0; index < 24; index += 1) {
      const width = 1.2 + Math.random() * 2.6;
      const depth = 1.4 + Math.random() * 2.8;
      const height = 3 + Math.random() * 11;
      const x = -31 + index * 2.7 + (Math.random() - 0.5) * 1.2;
      const z = -11 - Math.random() * 15;
      const cityBlock = new THREE.Group();
      cityBlock.position.set(x, 0, z);
      cityBlock.userData.parallax = THREE.MathUtils.mapLinear(
        z,
        -26,
        -11,
        0.48,
        0.95,
      );
      scene.add(cityBlock);
      cityBlocks.push(cityBlock);

      const buildingMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(
          0.39 + Math.random() * 0.05,
          0.08,
          0.012 + Math.random() * 0.018,
        ),
        roughness: 0.96,
        metalness: 0.04,
      });
      const building = mesh(
        new THREE.BoxGeometry(width, height, depth),
        buildingMaterial,
        false,
        false,
      );
      building.userData.buildingMesh = true;
      building.userData.litMaterial = buildingMaterial;
      building.userData.flatMaterial = new THREE.MeshBasicMaterial({
        color: buildingMaterial.color.clone(),
      });
      building.position.set(0, height / 2, 0);
      cityBlock.add(building);

      const windowColor =
        windowColors[Math.floor(Math.random() * windowColors.length)];
      const windowMaterial = new THREE.MeshBasicMaterial({
        color: windowColor,
        transparent: true,
        opacity: 0.5 + Math.random() * 0.28,
      });
      if (index % 4 === 0) neonMaterials.push(windowMaterial);

      const columns = Math.max(1, Math.floor(width / 0.7));
      const rows = Math.max(2, Math.floor(height / 1.05));
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          if (Math.random() < 0.48) continue;
          const windowPane = mesh(
            windowGeometry,
            windowMaterial,
            false,
            false,
          );
          windowPane.userData.highQualityOnly = true;
          windowPane.position.set(
            -width * 0.34 + column * 0.45,
            0.55 + row * 0.68,
            depth / 2 + 0.011,
          );
          cityBlock.add(windowPane);
        }
      }

      if (index % 8 === 0) {
        const antenna = mesh(
          new THREE.CylinderGeometry(0.025, 0.025, 1.8, 6),
          material(0x16804a, 0.4, 0.7),
        );
        antenna.userData.highQualityOnly = true;
        antenna.position.set(0, height + 0.9, 0);
        cityBlock.add(antenna);
        const beacon = new THREE.PointLight(0x00ff66, 2.8, 6);
        beacon.userData.highQualityOnly = true;
        beacon.position.set(0, height + 1.8, 0);
        cityBlock.add(beacon);
      }
    }
  }

  function createPlayer() {
    const root = new THREE.Group();
    root.position.set(-4.2, 0, 0);
    root.rotation.y = Math.PI / 2;
    root.name = "player";
    scene.add(root);
    return root;
  }

  function playPlayerAction(action, fade = 0.22) {
    if (!action || action === activePlayerAction) return;
    action.reset().fadeIn(fade).play();
    activePlayerAction?.fadeOut(fade);
    activePlayerAction = action;
  }

  function loadPlayerModel(
    source = "players/neon_runner_animations_set/scene.gltf",
    runnerId = "tron",
    onComplete = null,
  ) {
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(
      "https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/libs/draco/",
    );
    loader.setDRACOLoader(dracoLoader);
    const handleLoad = (gltf) => {
        const model = gltf.scene;
        if (runnerId === "nicky") model.rotation.y += Math.PI;
        model.traverse((object) => {
          if (!object.isMesh) return;
          object.castShadow = true;
          object.receiveShadow = true;
        });

        const rawBounds = new THREE.Box3().setFromObject(model);
        const rawHeight = Math.max(rawBounds.max.y - rawBounds.min.y, 0.01);
        const modelScale = 3 / rawHeight;
        model.scale.setScalar(modelScale);
        model.updateMatrixWorld(true);
        const scaledBounds = new THREE.Box3().setFromObject(model);
        model.position.y -= scaledBounds.min.y;

        playerMixer?.stopAllAction();
        if (playerModel) player.remove(playerModel);
        playerModel = model;
        player.add(model);

        playerMixer = new THREE.AnimationMixer(model);
        const findClip = (...names) =>
          gltf.animations.find(
            (clip) =>
              names.some((name) =>
                clip.name.toLowerCase().includes(name.toLowerCase()),
              ),
          );
        let idleClip;
        let runClip;
        let rollClip;
        let jumpClip;
        if (["nicky", "chacha", "zombie"].includes(runnerId)) {
          idleClip = null;
          runClip = gltf.animations[0] || null;
          rollClip = null;
          jumpClip = null;
        } else if (runnerId === "tails") {
          idleClip = null;
          runClip = findClip("tl_run_loop", "tl_boost_loop");
          rollClip = findClip("tl_jump_cannonball_loop");
          jumpClip = findClip("tl_jump_fall_loop");
        } else if (runnerId === "sonic") {
          idleClip = null;
          runClip = findClip("sn_run_loop", "sn_boost_loop");
          rollClip = findClip("sn_ball_loop", "sn_ph_spin_start");
          jumpClip = findClip(
            "sn_springjump_loop",
            "sn_jump_fall_loop",
            "sn_jump",
          );
        } else {
          idleClip = findClip("Idle");
          runClip = findClip("Sprint", "Run", "Walk");
          rollClip = findClip("Roll");
          jumpClip = findClip("Jump");
        }
        activePlayerAction = null;
        idleAction = idleClip ? playerMixer.clipAction(idleClip) : null;
        runAction = runClip ? playerMixer.clipAction(runClip) : null;
        rollAction = rollClip ? playerMixer.clipAction(rollClip) : null;
        jumpAction = jumpClip ? playerMixer.clipAction(jumpClip) : null;
        if (jumpAction) {
          jumpAction.setLoop(THREE.LoopOnce, 1);
          jumpAction.clampWhenFinished = true;
        }

        playPlayerAction(idleAction || runAction, 0);
        selectedRunner = runnerId;
        state.playerReady = true;
        statusText.textContent = "Get ready";
        finishLoadingIfReady();
        onComplete?.(true);
      };
    const handleError = (error) => {
      console.error(`Unable to load ${runnerId} runner`, error);
      statusText.textContent = `Could not load ${runnerId} runner`;
      state.playerReady = true;
      finishLoadingIfReady();
      onComplete?.(false);
    };

    loader.load(source, handleLoad, undefined, handleError);
  }

  async function loadObstacleModels() {
    const loader = new GLTFLoader();
    const sources = [
      ["pubg_crate", "obstacles/pubg_crate/scene.gltf"],
      ["low_polly_wooden_fence", "obstacles/low_polly_wooden_fence/scene.gltf"],
      ["psx_style_crash_fence", "obstacles/psx_style_crash_fence/scene.gltf"],
      ["spaceship", "obstacles/spaceship/scene.gltf"],
      ["ufospaceship", "obstacles/ufospaceship/scene.gltf"],
    ];
    try {
      const loaded = await Promise.all(
        sources.map(
          ([name, url]) =>
            new Promise((resolve, reject) => {
              loader.load(
                url,
                (gltf) =>
                  resolve({
                    name,
                    scene: gltf.scene,
                    animations: gltf.animations,
                  }),
                undefined,
                reject,
              );
            }),
        ),
      );
      loaded.forEach((template) => prepareObstacleTextures(template.scene));
      obstacleTemplates.push(...loaded);
      applyObstacleTextureQuality(graphicsQuality === "high");
      state.obstaclesReady = true;
      finishLoadingIfReady();
    } catch (error) {
      console.error("Unable to load obstacle models", error);
      state.obstaclesReady = true;
      finishLoadingIfReady();
    }
  }

  function createModelObstacle() {
    const group = new THREE.Group();
    const floatingTemplates = obstacleTemplates.filter(
      (item) => item.name === "spaceship" || item.name === "ufospaceship",
    );
    const groundTemplates = obstacleTemplates.filter(
      (item) => !floatingTemplates.includes(item),
    );
    const raised = floatingTemplates.length > 0 && Math.random() < 0.28;
    const availableTemplates = raised
      ? floatingTemplates
      : groundTemplates.length
        ? groundTemplates
        : obstacleTemplates;
    const template =
      availableTemplates[Math.floor(Math.random() * availableTemplates.length)];
    const model = template.scene.clone(true);
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });

    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const largestDimension = Math.max(size.x, size.y, size.z, 0.01);
    const targetSize = raised ? 1.7 : 1.45 + Math.random() * 0.3;
    const uniformScale = targetSize / largestDimension;
    model.scale.multiplyScalar(uniformScale);
    model.updateMatrixWorld(true);

    const scaledBounds = new THREE.Box3().setFromObject(model);
    const center = scaledBounds.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= scaledBounds.min.y;
    group.add(model);
    group.position.y = raised ? 2.02 : 0;
    group.userData.type = raised ? "overhead" : "ground";
    group.userData.modelName = template.name;
    if (raised && template.animations?.length) {
      const mixer = new THREE.AnimationMixer(model);
      mixer.clipAction(template.animations[0]).play();
      group.userData.mixer = mixer;
    }
    return group;
  }

  function nextSpawnDelay() {
    const factor = Math.max(0.38, 1 - state.survivalTime / 115);
    return Math.max(0.7, (2.2 + Math.random() * 2.7) * factor);
  }

  function gameSpeed() {
    return 5.8 + Math.min(7.5, state.survivalTime * 0.09);
  }

  function spawnObstacle() {
    if (!obstacleTemplates.length) {
      state.spawnTimer = 0.4;
      return;
    }
    const object = createModelObstacle();
    object.position.x = 14;
    object.position.z = 0;
    object.userData.speedVariance = Math.random() * 1.2;
    object.userData.scored = false;
    scene.add(object);
    state.obstacles.push(object);
    state.hasSpawned = true;
    state.spawnTimer = nextSpawnDelay();
  }

  const player = createPlayer();
  createWorld();
  setGraphicsQuality(initialGraphicsQuality(), false);
  loadObstacleModels();
  loadPlayerModel();

  function killPlayerTweens() {
    gsap.killTweensOf(player.position);
    gsap.killTweensOf(player.scale);
  }

  function jump() {
    if (!state.running) return;
    if (state.jumping) {
      if (!state.jumpBoosted && state.jumpTime <= 0.28) {
        state.jumpBoosted = true;
        playJumpSound(true);
      }
      return;
    }
    killPlayerTweens();
    state.ducking = false;
    state.jumping = true;
    state.jumpTime = 0;
    state.jumpBoosted = false;
    playJumpSound(false);
    playPlayerAction(jumpAction || runAction || idleAction, 0.1);
    player.scale.y = 1;
    player.position.y = 0.08;
    gsap
      .timeline()
      .to(player.scale, {
        x: 0.96,
        y: 1.06,
        z: 0.96,
        duration: 0.11,
        ease: "power2.out",
      })
      .to(player.scale, {
        x: 1,
        y: 1,
        z: 1,
        duration: 0.16,
        ease: "power2.inOut",
      });
  }

  function setDuck(pressed) {
    if (!state.running || state.jumping) return;
    if (pressed === state.ducking) return;
    state.ducking = pressed;
    if (pressed) playDuckSound();
    playPlayerAction(
      pressed ? rollAction || runAction || idleAction : runAction || idleAction,
      0.12,
    );
    gsap.to(player.scale, {
      x: pressed ? 1.12 : 1,
      y: pressed ? 0.5 : 1,
      z: pressed ? 1.12 : 1,
      duration: pressed ? 0.16 : 0.24,
      ease: pressed ? "power3.out" : "back.out(1.8)",
      overwrite: "auto",
    });
  }

  function collide() {
    state.running = false;
    state.gameOver = true;
    state.jumping = false;
    state.jumpTime = 0;
    state.jumpBoosted = false;
    state.ducking = false;
    if (runnerSpeedLines) runnerSpeedLines.visible = false;
    if (superJumpLines) superJumpLines.visible = false;
    playImpactSound();
    window.setTimeout(playGameOverSound, 170);
    killPlayerTweens();
    playPlayerAction(idleAction || runAction);
    gsap.to(player.scale, {
      x: 0.94,
      y: 0.94,
      z: 0.94,
      duration: 0.14,
      ease: "power2.out",
    });
    animateFinalScore(state.score);
    restartPanel.hidden = false;
    statusText.textContent = "Collision — press ↑ or restart";
    gsap.fromTo(
      restartButton,
      { opacity: 0, scale: 0.78, y: 20 },
      { opacity: 1, scale: 1, y: 0, duration: 0.45, ease: "back.out(1.8)" },
    );
  }

  function clearObstacles() {
    state.obstacles.forEach((obstacle) => scene.remove(obstacle));
    state.obstacles.length = 0;
  }

  function restart() {
    killPlayerTweens();
    clearObstacles();
    Object.assign(state, {
      running: true,
      playerReady: true,
      gameOver: false,
      score: 0,
      scoreClock: 0,
      survivalTime: 0,
      spawnTimer: 5,
      hasSpawned: false,
      jumping: false,
      jumpTime: 0,
      jumpBoosted: false,
      ducking: false,
    });
    player.position.y = 0;
    player.scale.set(1, 1, 1);
    restartPanel.hidden = true;
    updateScoreDisplay(0, true);
    statusText.textContent = "First obstacle in 5 seconds";
    playPlayerAction(runAction || idleAction);
    clock.getDelta();
  }

  function updateGame(delta, elapsed) {
    if (!state.running) return;

    state.survivalTime += delta;
    state.scoreClock += delta;

    if (state.jumping) {
      const ascentDuration = state.jumpBoosted ? 0.39 : 0.28;
      const fallDuration = state.jumpBoosted ? 0.58 : 0.46;
      const jumpHeight = state.jumpBoosted ? 3.05 : 1.85;
      state.jumpTime += delta;

      if (state.jumpTime <= ascentDuration) {
        const progress = state.jumpTime / ascentDuration;
        player.position.y =
          jumpHeight * (1 - Math.pow(1 - progress, 2.35));
      } else {
        const progress = Math.min(
          1,
          (state.jumpTime - ascentDuration) / fallDuration,
        );
        player.position.y = jumpHeight * (1 - progress * progress);
        if (progress >= 1) {
          state.jumping = false;
          state.jumpTime = 0;
          state.jumpBoosted = false;
          player.position.y = 0;
          playPlayerAction(runAction || idleAction, 0.12);
          gsap
            .timeline()
            .to(player.scale, {
              x: 1.07,
              y: 0.91,
              z: 1.07,
              duration: 0.09,
              ease: "power2.out",
            })
            .to(player.scale, {
              x: 1,
              y: 1,
              z: 1,
              duration: 0.18,
              ease: "back.out(1.5)",
            });
        }
      }
    }

    while (state.scoreClock >= 1) {
      state.score += 1;
      state.scoreClock -= 1;
    }

    state.spawnTimer -= delta;
    if (state.spawnTimer <= 0) spawnObstacle();

    const worldSpeed = gameSpeed();
    roadMarkers.forEach((marker) => {
      marker.position.x -= worldSpeed * delta;
      if (marker.position.x < -44) marker.position.x += 88;
    });
    cityBlocks.forEach((block) => {
      block.position.x -= worldSpeed * block.userData.parallax * delta;
      if (block.position.x < -34) block.position.x += 68;
    });
    if (speedParticles) {
      const positions = speedParticles.geometry.attributes.position;
      const velocity = speedParticles.userData.velocity;
      for (let index = 0; index < velocity.length; index += 1) {
        const xIndex = index * 3;
        positions.array[xIndex] -= worldSpeed * velocity[index] * delta;
        if (positions.array[xIndex] < -38) {
          positions.array[xIndex] = 38 + Math.random() * 4;
        }
      }
      positions.needsUpdate = true;
    }
    if (runnerSpeedLines) {
      runnerSpeedLines.visible = state.running;
      const positions = runnerSpeedLines.geometry.attributes.position;
      for (let index = 0; index < positions.array.length; index += 6) {
        positions.array[index] -= worldSpeed * delta * 1.35;
        positions.array[index + 3] -= worldSpeed * delta * 1.35;
        if (positions.array[index + 3] < -11.5) {
          const lineLength = 0.35 + Math.random() * 0.9;
          positions.array[index] = -5.8 + Math.random() * 0.6;
          positions.array[index + 3] = positions.array[index] + lineLength;
        }
      }
      positions.needsUpdate = true;
    }
    if (superJumpLines) {
      superJumpLines.visible = state.jumping && state.jumpBoosted;
      if (superJumpLines.visible) {
        const positions = superJumpLines.geometry.attributes.position;
        for (let index = 0; index < positions.array.length; index += 6) {
          positions.array[index] -= worldSpeed * delta * 2.15;
          positions.array[index + 3] -= worldSpeed * delta * 2.15;
          if (positions.array[index + 3] < -10) {
            const lineLength = 0.5 + Math.random() * 1.4;
            positions.array[index] = -3 + Math.random() * 0.8;
            positions.array[index + 3] = positions.array[index] + lineLength;
          }
        }
        positions.needsUpdate = true;
      }
    }

    player.updateMatrixWorld(true);
    playerBox.setFromObject(player);

    for (let index = state.obstacles.length - 1; index >= 0; index -= 1) {
      const obstacle = state.obstacles[index];
      obstacle.userData.speed =
        worldSpeed + obstacle.userData.speedVariance;
      obstacle.position.x -= obstacle.userData.speed * delta;
      obstacle.userData.mixer?.update(delta);
      obstacle.userData.rotors?.forEach((rotor, rotorIndex) => {
        rotor.rotation.y += delta * (rotorIndex ? -15 : 15);
      });
      obstacle.updateMatrixWorld(true);
      obstacleBox.setFromObject(obstacle);

      if (playerBox.intersectsBox(obstacleBox)) {
        collide();
        return;
      }

      if (!obstacle.userData.scored && obstacleBox.max.x < playerBox.min.x) {
        obstacle.userData.scored = true;
        state.score += 10;
      }

      if (obstacle.position.x < -13) {
        scene.remove(obstacle);
        state.obstacles.splice(index, 1);
      }
    }

    updateScoreDisplay(state.score);
    if (state.jumping) {
      statusText.textContent = "Jump";
    } else if (state.ducking) {
      statusText.textContent = "Duck";
    } else if (!state.hasSpawned) {
      statusText.textContent = `First obstacle in ${Math.max(
        0,
        Math.ceil(state.spawnTimer),
      )} seconds`;
    } else {
      statusText.textContent = "Keep moving";
    }
  }

  function animate() {
    fpsFrameCount += 1;
    const fpsNow = performance.now();
    const fpsSampleDuration = fpsNow - fpsSampleStarted;
    if (fpsSampleDuration >= 500) {
      const measuredFps = Math.round(
        (fpsFrameCount * 1000) / fpsSampleDuration,
      );
      fpsMeter.textContent = `FPS ${measuredFps}`;
      applyAdaptiveResolution(measuredFps, fpsNow);
      fpsFrameCount = 0;
      fpsSampleStarted = fpsNow;
    }

    const delta = Math.min(clock.getDelta(), 0.04);
    const elapsed = clock.elapsedTime;
    updateGame(delta, elapsed);

    if (runAction && activePlayerAction === runAction && state.running) {
      runAction.timeScale = Math.min(2.3, gameSpeed() / 5.8);
    }
    if (playerMixer) {
      playerMixer.timeScale = 1;
      playerMixer.update(delta);
    }

    const stars = scene.getObjectByName("stars");
    if (stars?.visible) stars.rotation.y = elapsed * 0.003;
    neonMaterials.forEach((neon, index) => {
      neon.opacity = 0.42 + Math.sin(elapsed * 1.5 + index) * 0.12;
    });
    rimLight.intensity = 16 + Math.sin(elapsed * 1.7) * 2;
    camera.position.y = cameraBaseY + Math.sin(elapsed * 0.45) * 0.06;
    camera.lookAt(-0.8, 1.55, -1.2);
    camera.rotation.z = 0;
    renderer.render(scene, camera);
  }

  document.addEventListener(
    "keydown",
    (event) => {
      ensureAudio();
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (event.repeat) return;
        if (state.gameOver) restart();
        else if (state.running) jump();
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setDuck(true);
      }
    },
    true,
  );

  document.addEventListener(
    "keyup",
    (event) => {
      if (event.key === "ArrowDown") setDuck(false);
    },
    true,
  );

  window.addEventListener("blur", () => setDuck(false));
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    setCameraView();
    renderer.setPixelRatio(
      graphicsQuality === "high"
        ? Math.min(window.devicePixelRatio || 1, 1.5)
        : Math.min(window.devicePixelRatio || 1, adaptivePixelRatio),
    );
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  restartButton.addEventListener("click", () => {
    ensureAudio();
    restart();
  });
  guideToggle.addEventListener("click", () => {
    if (gameGuide.hidden) openGameGuide();
    else closeGameGuide();
  });
  guideClose.addEventListener("click", closeGameGuide);
  guidePlay.addEventListener("click", closeGameGuide);
  gameGuide.addEventListener("click", (event) => {
    if (event.target === gameGuide) closeGameGuide();
  });
  runnerToggle.addEventListener("click", openRunnerSelect);
  runnerOptions.forEach((option) => {
    option.addEventListener("click", () => {
      const runnerId = option.dataset.runner;
      if (runnerId === selectedRunner) {
        closeRunnerSelect();
        return;
      }

      runnerOptions.forEach((button) => {
        button.disabled = true;
      });
      const runnerNames = {
        tron: "Tron Legend",
        sonic: "Sonic Blue",
        tails: "Sonic Yellow",
        nicky: "Nicky",
        chacha: "Cha Cha",
        zombie: "Diaper Zombie",
      };
      const runnerSources = {
        tron: "players/neon_runner_animations_set/scene.gltf",
        sonic:
          "players/animations_sonic_-_sonic_runners_adventure_model/scene.gltf",
        tails: "players/animations_tails_-_sonic_runners_adventure/scene.gltf",
        nicky: "players/nicky/scene.gltf",
        chacha: "players/cha_cha/scene.gltf",
        zombie: "players/diaper_zombie/scene.gltf",
      };
      runnerLoading.textContent = `Loading ${runnerNames[runnerId]}…`;
      const source = runnerSources[runnerId];
      loadPlayerModel(source, runnerId, (loaded) => {
        runnerOptions.forEach((button) => {
          button.disabled = false;
          const active = button.dataset.runner === selectedRunner;
          button.classList.toggle("is-selected", active);
          button.setAttribute("aria-pressed", String(active));
          button.querySelector(".runner-check").textContent = active
            ? "Selected"
            : "Select";
        });
        if (loaded) {
          runnerLoading.textContent = "";
          closeRunnerSelect();
        } else {
          runnerLoading.textContent = "Runner could not be loaded. Choose another.";
        }
      });
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !gameGuide.hidden) {
      event.preventDefault();
      closeGameGuide();
    }
  });
  soundToggle.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    soundToggle.setAttribute("aria-pressed", String(soundEnabled));
    soundToggle.setAttribute(
      "aria-label",
      soundEnabled ? "Mute sound" : "Enable sound",
    );
    if (soundEnabled) {
      ensureAudio();
      if (audioMaster) audioMaster.gain.setTargetAtTime(0.18, audioContext.currentTime, 0.03);
      synthTone(440, 0.09, 0.1, "sine", 660);
    } else if (audioMaster && audioContext) {
      audioMaster.gain.setTargetAtTime(0.0001, audioContext.currentTime, 0.03);
    }
  });
  lowGraphicsButton.addEventListener("click", () => {
    setGraphicsQuality("low");
  });
  highGraphicsButton.addEventListener("click", () => {
    setGraphicsQuality("high");
  });

  loadHighScore();
  renderer.setAnimationLoop(animate);
};
