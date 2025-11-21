import { useEffect, useRef, useState } from "react";

// Declare global types for MediaPipe
declare global {
  interface Window {
    FaceMesh: any;
    Camera: any;
    drawConnectors: any;
    FACEMESH_TESSELATION: any;
    FACEMESH_FACE_OVAL: any;
    FACEMESH_RIGHT_EYE: any;
    FACEMESH_LEFT_EYE: any;
    FACEMESH_LIPS: any;
    eyePointsMesh: any;
    THREE: any;
  }
}

interface ProctoringCameraProps {
  isActive?: boolean;
  blockId?: string; // Block ID to trigger re-initialization when block changes
  consentGiven?: boolean; // Whether user has given consent (triggers initialization)
  onViolation?: (type: "lookAway" | "multipleFaces", timestamp: Date, screenshot?: string) => void;
}

export default function ProctoringCamera({ isActive: propIsActive = true, blockId, consentGiven, onViolation }: ProctoringCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const meshCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Initializing...");
  const [violationCount, setViolationCount] = useState({ lookAway: 0, multipleFaces: 0 });
  const [showAlert, setShowAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const screenshotCountRef = useRef(0); // Track number of screenshots taken (max 6)
  const isAlertActiveRef = useRef(false);
  const alertEndTimeRef = useRef(0);
  
  const onViolationRef = useRef(onViolation);
  const cameraUtilsRef = useRef<any>(null);
  const faceMeshRef = useRef<any>(null);
  const shouldCleanupRef = useRef(false);
  const previousBlockIdRef = useRef<string | undefined>(undefined);
  const previousConsentGivenRef = useRef<boolean | undefined>(undefined);
  
  // Keep onViolation ref updated without causing re-renders
  useEffect(() => {
    onViolationRef.current = onViolation;
  }, [onViolation]);

  // Load MediaPipe scripts
  useEffect(() => {
    const loadScript = (src: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve();
          return;
        }
        const script = document.createElement("script");
        script.src = src;
        script.crossOrigin = "anonymous";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
      });
    };

    const loadThreeJS = (): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (window.THREE) {
          resolve();
          return;
        }
        const script = document.createElement("script");
        script.src = "https://unpkg.com/three@0.128.0/build/three.min.js";
        script.crossOrigin = "anonymous";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Three.js"));
        document.head.appendChild(script);
      });
    };

    Promise.all([
      loadThreeJS(),
      loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js"),
      loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"),
      loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js"),
    ]).then(() => {
      setStatus("Ready");
    }).catch((error) => {
      console.error("Failed to load libraries:", error);
      setStatus("Error loading libraries");
    });
  }, []);

  useEffect(() => {
    // Mark that we should cleanup if propIsActive becomes false
    shouldCleanupRef.current = !propIsActive;
    
    // Reset camera when block changes OR when consent is first given (to force re-initialization)
    const blockChanged = blockId && blockId !== previousBlockIdRef.current;
    // Check if consent was just given (transition from false/undefined to true)
    const consentJustGiven = consentGiven && (previousConsentGivenRef.current === false || previousConsentGivenRef.current === undefined);
    
    // If consent was just given or block changed, reset any existing camera
    if ((blockChanged || consentJustGiven) && cameraUtilsRef.current) {
      console.log("[ProctoringCamera] Block changed or consent given, resetting camera for re-initialization", { 
        previousBlockId: previousBlockIdRef.current, 
        newBlockId: blockId,
        previousConsentGiven: previousConsentGivenRef.current,
        consentGiven: consentGiven
      });
      try {
        cameraUtilsRef.current.stop();
        cameraUtilsRef.current = null;
      } catch (e) {
        console.error("Error stopping camera on block change/consent:", e);
      }
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
    }
    
    // IMPORTANT: If consent was just given OR this is the first block after consent, we MUST initialize
    // This ensures the camera starts on the first block after consent
    // Also initialize if block changed (for subsequent blocks)
    // CRITICAL: If we're active and consent is given but no camera exists, we MUST initialize
    const shouldInitialize = consentJustGiven || 
                            (blockChanged && propIsActive) || 
                            (!cameraUtilsRef.current && consentGiven && propIsActive);
    
    console.log("[ProctoringCamera] useEffect run", {
      propIsActive,
      consentGiven,
      blockId,
      previousConsentGiven: previousConsentGivenRef.current,
      previousBlockId: previousBlockIdRef.current,
      consentJustGiven,
      blockChanged,
      hasCamera: !!cameraUtilsRef.current,
      shouldInitialize
    });
    
    // Update refs AFTER determining shouldInitialize
    previousBlockIdRef.current = blockId;
    previousConsentGivenRef.current = consentGiven;
    
    if (!propIsActive) {
      // Cleanup when becoming inactive
      if (cameraUtilsRef.current) {
        try {
          cameraUtilsRef.current.stop();
          cameraUtilsRef.current = null;
        } catch (e) {
          console.error("Error stopping camera:", e);
        }
      }
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
      return;
    }
    
    // CRITICAL: Skip initialization if camera is already running and we're not forcing a re-init
    if (cameraUtilsRef.current && videoRef.current && videoRef.current.readyState >= 2 && !shouldInitialize) {
      console.log("[ProctoringCamera] Camera already running, skipping initialization");
      return;
    }
    
    // Log when we're forcing initialization
    if (shouldInitialize) {
      console.log("[ProctoringCamera] Forcing initialization", { 
        consentJustGiven, 
        blockChanged, 
        hasCamera: !!cameraUtilsRef.current,
        propIsActive,
        consentGiven
      });
    }
    
    // CRITICAL: If we should initialize, we MUST proceed even if libraries/refs aren't ready yet
    // The setTimeout will handle retries until everything is ready
    if (!shouldInitialize && !propIsActive) {
      return;
    }
    
    // Wait for libraries to be ready - but don't return if we should initialize
    if (!window.FaceMesh || !window.Camera || !window.THREE) {
      console.log("[ProctoringCamera] Waiting for libraries...", {
        FaceMesh: !!window.FaceMesh,
        Camera: !!window.Camera,
        THREE: !!window.THREE,
        shouldInitialize
      });
      // If we should initialize, continue to setTimeout which will retry
      if (!shouldInitialize) {
        return;
      }
    }
    
    // Wait for refs to be ready (especially on first mount)
    if (!videoRef.current || !canvasRef.current || !meshCanvasRef.current) {
      console.log("[ProctoringCamera] Waiting for refs...", {
        video: !!videoRef.current,
        canvas: !!canvasRef.current,
        meshCanvas: !!meshCanvasRef.current,
        shouldInitialize
      });
      // Don't return early - let the setTimeout below handle initialization with retries
    }

    // All initialization happens in setTimeout to ensure refs are ready
    // Logic Variables (shared across functions)
    let lookAwayStartTime = 0;
    let multipleFaceAlertEndTime = 0;
    const LOOK_AWAY_THRESHOLD = 2000;
    const ALERT_DURATION = 2000;
    let audioCtx: AudioContext | null = null;

    function initAudio() {
      if (!audioCtx) {
        try {
          audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        } catch (e) {
          console.error("[ProctoringCamera] Failed to create audio context:", e);
        }
      }
    }

    function playAlertSound() {
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = "sine";
        
        gainNode.gain.setValueAtTime(0.8, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
        
        setTimeout(() => {
          const oscillator2 = audioContext.createOscillator();
          const gainNode2 = audioContext.createGain();
          
          oscillator2.connect(gainNode2);
          gainNode2.connect(audioContext.destination);
          
          oscillator2.frequency.value = 800;
          oscillator2.type = "sine";
          
          gainNode2.gain.setValueAtTime(0.8, audioContext.currentTime);
          gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
          
          oscillator2.start(audioContext.currentTime);
          oscillator2.stop(audioContext.currentTime + 0.2);
        }, 200);
      } catch (e) {
        console.error("Error playing alert sound:", e);
      }
    }

    // Initialize MediaPipe - now takes refs as parameters
    async function init(videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement, meshCanvasElement: HTMLCanvasElement) {
      // Don't re-initialize if already running UNLESS we're forcing initialization
      if (cameraUtilsRef.current && videoElement.readyState >= 2 && !shouldInitialize) {
        console.log("[ProctoringCamera] Camera already running, skipping init", { shouldInitialize });
        return;
      }
      
      console.log("[ProctoringCamera] Init called", { 
        hasCamera: !!cameraUtilsRef.current, 
        videoReady: videoElement.readyState, 
        shouldInitialize 
      });
      
      console.log("[ProctoringCamera] Starting initialization...");
      
      // Initialize Three.js first
      const THREE = window.THREE;
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
      camera.position.z = 5;
      const renderer = new THREE.WebGLRenderer({ canvas: canvasElement, alpha: true });
      renderer.setSize(150, 150);
      renderer.setPixelRatio(window.devicePixelRatio);

      const eyeGeometry = new THREE.BufferGeometry();
      const eyePositions = new Float32Array(2 * 3);
      eyePositions[0] = -0.2; eyePositions[1] = 0; eyePositions[2] = 0;
      eyePositions[3] = 0.2; eyePositions[4] = 0; eyePositions[5] = 0;
      eyeGeometry.setAttribute("position", new THREE.BufferAttribute(eyePositions, 3));
      const eyeMaterial = new THREE.PointsMaterial({ 
        color: 0x00ffff,
        size: 4,
        sizeAttenuation: false 
      });
      const eyePointsMesh = new THREE.Points(eyeGeometry, eyeMaterial);
      scene.add(eyePointsMesh);

      const meshCtx = meshCanvasElement.getContext("2d");
      if (!meshCtx) {
        console.error("[ProctoringCamera] Failed to get mesh canvas context");
        return;
      }

      // Function to capture screenshot from video feed (max 640p resolution)
      function captureScreenshot(): string | null {
        if (screenshotCountRef.current >= 6) {
          console.log("[ProctoringCamera] Maximum screenshot limit reached (6)");
          return null;
        }
        
        if (!videoElement || videoElement.readyState < 2) {
          console.log("[ProctoringCamera] Video not ready for screenshot");
          return null;
        }

        try {
          // Create a canvas to capture the video frame
          const captureCanvas = document.createElement("canvas");
          const videoWidth = videoElement.videoWidth;
          const videoHeight = videoElement.videoHeight;
          
          if (!videoWidth || !videoHeight) {
            console.log("[ProctoringCamera] Video dimensions not available");
            return null;
          }

          // Calculate dimensions (max 640p - maintain aspect ratio)
          const maxWidth = 640;
          const maxHeight = 640;
          let width = videoWidth;
          let height = videoHeight;
          
          // Scale down if needed while maintaining aspect ratio
          if (width > maxWidth || height > maxHeight) {
            const aspectRatio = width / height;
            if (width > height) {
              width = maxWidth;
              height = Math.round(maxWidth / aspectRatio);
            } else {
              height = maxHeight;
              width = Math.round(maxHeight * aspectRatio);
            }
          }

          captureCanvas.width = width;
          captureCanvas.height = height;
          const ctx = captureCanvas.getContext("2d");
          
          if (!ctx) {
            console.error("[ProctoringCamera] Failed to get canvas context for screenshot");
            return null;
          }

          // Draw video frame to canvas
          ctx.drawImage(videoElement, 0, 0, width, height);
          
          // Convert to base64 data URL
          const screenshot = captureCanvas.toDataURL("image/jpeg", 0.85); // JPEG with 85% quality
          screenshotCountRef.current += 1;
          console.log(`[ProctoringCamera] Screenshot captured (${screenshotCountRef.current}/6)`);
          return screenshot;
        } catch (error) {
          console.error("[ProctoringCamera] Error capturing screenshot:", error);
          return null;
        }
      }

      // Define onResults function with access to all needed variables
      function onResults(results: any) {
        if (!meshCtx) return;
        setStatus("Tracking");

        meshCtx.clearRect(0, 0, meshCanvasElement.width, meshCanvasElement.height);

        let faceCount = 0;
        if (results.multiFaceLandmarks) {
          faceCount = results.multiFaceLandmarks.length;
        }

        if (faceCount > 1) {
          multipleFaceAlertEndTime = Date.now() + 2000;
          if (!isAlertActiveRef.current) {
            setTimeout(() => {
              try {
                playAlertSound();
              } catch (e) {
                console.error("Error playing alert sound:", e);
              }
            }, 0);
            setShowAlert(true);
            setAlertMessage("Multiple faces detected!");
            setViolationCount((prev) => ({ ...prev, multipleFaces: prev.multipleFaces + 1 }));
            
            // Capture screenshot if we haven't reached the limit
            const screenshot = captureScreenshot();
            const violationTimestamp = new Date();
            onViolationRef.current?.("multipleFaces", violationTimestamp, screenshot || undefined);
            
            isAlertActiveRef.current = true;
            alertEndTimeRef.current = Date.now() + 2000;
          }
        }

        if (Date.now() < multipleFaceAlertEndTime) {
          isAlertActiveRef.current = true;
          alertEndTimeRef.current = Date.now() + 200;
          if (!showAlert) {
            setShowAlert(true);
            setAlertMessage("Multiple faces detected!");
          }
        }

        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
          const landmarks = results.multiFaceLandmarks[0];
          const eyePositionsArray = eyePointsMesh.geometry.attributes.position.array;

          if (meshCtx && window.drawConnectors && window.FACEMESH_FACE_OVAL && window.FACEMESH_RIGHT_EYE && window.FACEMESH_LEFT_EYE && window.FACEMESH_LIPS) {
            try {
              meshCtx.save();
              meshCtx.strokeStyle = "rgba(59, 130, 246, 0.8)";
              meshCtx.lineWidth = 1.5;
              meshCtx.globalAlpha = 0.8;
              
              window.drawConnectors(meshCtx, landmarks, window.FACEMESH_FACE_OVAL, {
                color: "rgba(59, 130, 246, 0.8)",
                lineWidth: 1.5,
              });
              
              window.drawConnectors(meshCtx, landmarks, window.FACEMESH_LEFT_EYE, {
                color: "rgba(59, 130, 246, 0.8)",
                lineWidth: 1.5,
              });
              
              window.drawConnectors(meshCtx, landmarks, window.FACEMESH_RIGHT_EYE, {
                color: "rgba(59, 130, 246, 0.8)",
                lineWidth: 1.5,
              });
              
              window.drawConnectors(meshCtx, landmarks, window.FACEMESH_LIPS, {
                color: "rgba(59, 130, 246, 0.8)",
                lineWidth: 1.5,
              });
              
              meshCtx.restore();
            } catch (e) {
              console.error("[ProctoringCamera] Error drawing mesh:", e);
            }
          }

          const videoWidth = videoElement.videoWidth;
          const videoHeight = videoElement.videoHeight;
          const canvasWidth = canvasElement.width;
          const canvasHeight = canvasElement.height;

          if (videoWidth && videoHeight) {
            const videoAspect = videoWidth / videoHeight;
            const canvasAspect = canvasWidth / canvasHeight;
            let scale = 1;

            if (canvasAspect > videoAspect) {
              scale = canvasWidth / videoWidth;
            } else {
              scale = canvasHeight / videoHeight;
            }

            const drawnWidth = videoWidth * scale;
            const drawnHeight = videoHeight * scale;
            const scaleX = drawnWidth / canvasWidth;
            const scaleY = drawnHeight / canvasHeight;

            if (landmarks.length > 473) {
              const leftIris = landmarks[468];
              const rightIris = landmarks[473];

              eyePositionsArray[0] = (leftIris.x - 0.5) * 2 * scaleX;
              eyePositionsArray[1] = -(leftIris.y - 0.5) * 2 * scaleY;
              eyePositionsArray[2] = -leftIris.z;

              eyePositionsArray[3] = (rightIris.x - 0.5) * 2 * scaleX;
              eyePositionsArray[4] = -(rightIris.y - 0.5) * 2 * scaleY;
              eyePositionsArray[5] = -rightIris.z;

              eyePointsMesh.geometry.attributes.position.needsUpdate = true;
              renderer.render(scene, camera);
            }
          }

          const noseTip = landmarks[1];
          const leftEyeInner = landmarks[33];
          const rightEyeInner = landmarks[263];
          const eyesMidX = (leftEyeInner.x + rightEyeInner.x) / 2;
          const deviation = noseTip.x - eyesMidX;
          const YAW_THRESHOLD = 0.025;

          const isLookingAway = Math.abs(deviation) > YAW_THRESHOLD;

          if (isLookingAway) {
            if (lookAwayStartTime === 0) {
              lookAwayStartTime = Date.now();
            } else if (Date.now() - lookAwayStartTime > LOOK_AWAY_THRESHOLD) {
              if (!isAlertActiveRef.current) {
                setTimeout(() => {
                  try {
                    playAlertSound();
                  } catch (e) {
                    console.error("Error playing alert sound:", e);
                  }
                }, 0);
                setShowAlert(true);
                setAlertMessage("Please do not look away from the screen");
                setViolationCount((prev) => ({ ...prev, lookAway: prev.lookAway + 1 }));
                
                // Capture screenshot if we haven't reached the limit
                const screenshot = captureScreenshot();
                const violationTimestamp = new Date();
                onViolationRef.current?.("lookAway", violationTimestamp, screenshot || undefined);
              }
              isAlertActiveRef.current = true;
              alertEndTimeRef.current = Date.now() + ALERT_DURATION;
              lookAwayStartTime = 0;
            }
          } else {
            lookAwayStartTime = 0;
          }
        } else {
          setStatus("No face detected");
        }

        if (isAlertActiveRef.current) {
          if (Date.now() > alertEndTimeRef.current) {
            isAlertActiveRef.current = false;
            setShowAlert(false);
          } else {
            if (!showAlert) {
              setShowAlert(true);
            }
          }
        }
      }
      
      try {
        initAudio();
        setStatus("Initializing...");

        setStatus("Loading FaceMesh...");
        faceMeshRef.current = new window.FaceMesh({
          locateFile: (file: string) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
          },
        });

        faceMeshRef.current.setOptions({
          maxNumFaces: 2,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        faceMeshRef.current.onResults(onResults);

        setStatus("Requesting camera...");
        console.log("[ProctoringCamera] Creating camera...", { 
          hasExistingCamera: !!cameraUtilsRef.current,
          shouldInitialize 
        });

        // Stop any existing camera before creating a new one
        if (cameraUtilsRef.current) {
          try {
            console.log("[ProctoringCamera] Stopping existing camera before re-initialization");
            cameraUtilsRef.current.stop();
            cameraUtilsRef.current = null;
          } catch (e) {
            console.error("[ProctoringCamera] Error stopping existing camera:", e);
          }
        }
        
        // Clear any existing video stream
        if (videoElement.srcObject) {
          const stream = videoElement.srcObject as MediaStream;
          stream.getTracks().forEach((track) => track.stop());
          videoElement.srcObject = null;
        }

        cameraUtilsRef.current = new window.Camera(videoElement, {
          onFrame: async () => {
            try {
              if (faceMeshRef.current && videoElement.readyState >= 2) {
                await faceMeshRef.current.send({ image: videoElement });
              }
            } catch (e) {
              console.error("Frame error:", e);
            }
          },
          width: 640,
          height: 480,
        });

        console.log("[ProctoringCamera] Starting camera...");
        await cameraUtilsRef.current.start();
        console.log("[ProctoringCamera] Camera started successfully!");
        
        if (audioCtx && audioCtx.state === "suspended") {
          try {
            await audioCtx.resume();
          } catch (e) {
            console.error("[ProctoringCamera] Failed to resume audio context:", e);
          }
        }
        
        setStatus("Active");
      } catch (e: any) {
        console.error("Camera init error:", e);
        if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
          setStatus("Camera permission denied");
        } else if (e.name === "NotFoundError") {
          setStatus("No camera found");
        } else {
          setStatus(`Error: ${e.message || e.name}`);
        }
      }
    }

    // Add a delay to ensure refs are attached (especially on first mount)
    // All initialization happens here to ensure refs are ready
    const initTimeout = setTimeout(() => {
      // Check if we're still active
      if (!propIsActive) {
        console.log("[ProctoringCamera] No longer active, skipping initialization");
        return;
      }
      
      const videoElement = videoRef.current;
      const canvasElement = canvasRef.current;
      const meshCanvasElement = meshCanvasRef.current;
      
      // Check libraries again
      if (!window.FaceMesh || !window.Camera || !window.THREE) {
        console.log("[ProctoringCamera] Libraries still not ready, retrying...", {
          FaceMesh: !!window.FaceMesh,
          Camera: !!window.Camera,
          THREE: !!window.THREE,
        });
        // Retry after a longer delay
        setTimeout(() => {
          if (propIsActive && window.FaceMesh && window.Camera && window.THREE) {
            const videoEl = videoRef.current;
            const canvasEl = canvasRef.current;
            const meshCanvasEl = meshCanvasRef.current;
            if (videoEl && canvasEl && meshCanvasEl) {
              init(videoEl, canvasEl, meshCanvasEl);
            }
          }
        }, 500);
        return;
      }
      
      if (!videoElement || !canvasElement || !meshCanvasElement) {
        console.log("[ProctoringCamera] Refs still not ready after delay, retrying...");
        // Retry with exponential backoff
        setTimeout(() => {
          if (!propIsActive) return;
          const videoEl = videoRef.current;
          const canvasEl = canvasRef.current;
          const meshCanvasEl = meshCanvasRef.current;
          if (videoEl && canvasEl && meshCanvasEl && window.FaceMesh && window.Camera && window.THREE) {
            console.log("[ProctoringCamera] Retry successful, initializing...");
            init(videoEl, canvasEl, meshCanvasEl);
          } else {
            console.error("[ProctoringCamera] Failed to initialize: refs or libraries not ready", {
              video: !!videoEl,
              canvas: !!canvasEl,
              meshCanvas: !!meshCanvasEl,
              FaceMesh: !!window.FaceMesh,
              Camera: !!window.Camera,
              THREE: !!window.THREE,
            });
            setStatus("Error: Failed to initialize camera");
          }
        }, 300);
        return;
      }
      
      console.log("[ProctoringCamera] All conditions met, calling init...", {
        hasVideo: !!videoElement,
        hasCanvas: !!canvasElement,
        hasMeshCanvas: !!meshCanvasElement,
        shouldInitialize
      });
      init(videoElement, canvasElement, meshCanvasElement);
    }, shouldInitialize ? 50 : 100); // Faster initialization if we're forcing it

    return () => {
      clearTimeout(initTimeout);
      
      // Only cleanup if we're actually becoming inactive
      if (shouldCleanupRef.current) {
        console.log("[ProctoringCamera] Cleanup called", { hasCameraUtils: !!cameraUtilsRef.current });
        
        if (cameraUtilsRef.current) {
          try {
            console.log("[ProctoringCamera] Stopping camera...");
            cameraUtilsRef.current.stop();
            cameraUtilsRef.current = null;
          } catch (e) {
            console.error("Error stopping camera:", e);
          }
        }
        if (videoRef.current && videoRef.current.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach((track) => track.stop());
          videoRef.current.srcObject = null;
        }
        if (audioCtx) {
          audioCtx.close();
        }
      } else {
        console.log("[ProctoringCamera] Cleanup skipped (still active)");
      }
    };
  }, [propIsActive, blockId, consentGiven]); // Add blockId and consentGiven to dependencies to trigger re-initialization

  // Keep alert visible for the full duration
  useEffect(() => {
    if (!propIsActive) return;
    
    const checkAlert = () => {
      if (isAlertActiveRef.current) {
        if (Date.now() > alertEndTimeRef.current) {
          isAlertActiveRef.current = false;
          setShowAlert(false);
        } else {
          if (!showAlert) {
            setShowAlert(true);
          }
        }
      }
    };
    
    const interval = setInterval(checkAlert, 100);
    return () => clearInterval(interval);
  }, [propIsActive, showAlert]);

  return (
    <div
      ref={containerRef}
      className="fixed bottom-4 right-4 z-50"
      style={{ width: "150px", height: "150px" }}
    >
      <div className="relative w-full h-full rounded-lg overflow-hidden border-2 border-gray-300 shadow-lg bg-black">
        <video
          ref={videoRef}
          className="absolute top-0 left-0 w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
          playsInline
          autoPlay
          muted
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
          style={{ transform: "scaleX(-1)" }}
          width={150}
          height={150}
        />
        <canvas
          ref={meshCanvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
          style={{ transform: "scaleX(-1)" }}
          width={150}
          height={150}
        />
        {/* Alert Overlay */}
        {showAlert && (
          <div className="absolute inset-0 bg-red-600 bg-opacity-70 flex items-center justify-center pointer-events-none z-[100] transition-opacity duration-200">
            <div className="text-white text-xs font-bold text-center px-2 bg-black bg-opacity-70 rounded p-2">
              {alertMessage}
            </div>
          </div>
        )}
        {/* Status Badge */}
        <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-xs px-1 py-0.5 text-center">
          {status}
        </div>
      </div>
    </div>
  );
}
