import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Square, Play, Trash2, Volume2 } from "lucide-react";

export interface AudioMetadata {
  micName: string;
  micDeviceId?: string;
  sampleRate: number;
  bitDepth: number;
  channels: number;
  durationSec: number;
  truePeak: number; // dBFS
  integratedLoudness: number; // LUFS
}

export interface AudioRecording {
  blob: Blob;
  metadata: AudioMetadata;
}

interface AudioRecorderProps {
  onRecordingComplete: (recording: AudioRecording) => void;
  maxDurationSeconds?: number;
  minDurationSeconds?: number;
}

interface AudioDevice {
  deviceId: string;
  label: string;
  groupId?: string;
}

export default function AudioRecorder({ 
  onRecordingComplete, 
  maxDurationSeconds,
  minDurationSeconds 
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [currentDb, setCurrentDb] = useState(-120);
  const [waveformData, setWaveformData] = useState<Float32Array | null>(null);
  const [audioMetadata, setAudioMetadata] = useState<AudioMetadata | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const meterRAFRef = useRef<number | null>(null);
  const waveRAFRef = useRef<number | null>(null);
  const playerRef = useRef<HTMLAudioElement | null>(null);
  const meterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wavePeaksRef = useRef<Float32Array | null>(null);
  const isRecordingRef = useRef<boolean>(false);
  const emaMSRef = useRef<number>(0);
  const waveformDataRef = useRef<Float32Array | null>(null);
  const waveformUpdateTimerRef = useRef<number | null>(null);

  const DPR = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  const desiredSampleRate = 48000;

  // Get available audio devices
  useEffect(() => {
    async function getDevices() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices
          .filter(device => device.kind === 'audioinput')
          .map(device => ({
            deviceId: device.deviceId,
            label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
            groupId: device.groupId
          }));
        setAudioDevices(audioInputs);
        if (audioInputs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(audioInputs[0].deviceId);
        }
      } catch (err) {
        console.error("Error getting audio devices:", err);
      }
    }
    getDevices();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
        if (scriptProcessorRef.current) scriptProcessorRef.current.disconnect();
      } catch {}
      audioContextRef.current.close();
    }
    if (meterRAFRef.current) {
      cancelAnimationFrame(meterRAFRef.current);
    }
    if (waveRAFRef.current) {
      cancelAnimationFrame(waveRAFRef.current);
    }
  }, []);

  const getMicStream = async (): Promise<MediaStream> => {
    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
        channelCount: { ideal: 2 },
        sampleRate: { ideal: 48000 },
        sampleSize: { ideal: 24 },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    streamRef.current = stream;

    const track = stream.getAudioTracks()[0];
    const micName = track?.label || audioDevices.find(d => d.deviceId === selectedDeviceId)?.label || 'Unknown Microphone';

    setAudioMetadata(prev => ({
      ...prev,
      micName,
      micDeviceId: selectedDeviceId,
      bitDepth: 16,
      channels: 1
    } as AudioMetadata));

    return stream;
  };

  const toDbFSRealtime = (x: number): number => {
    return Number.isFinite(x) && x > 0 ? 20 * Math.log10(x) : -120;
  };

  const clampDb = (db: number): number => Math.max(-120, Math.min(0, db));

  const downmixToMono = (buffers: Float32Array[]): Float32Array => {
    if (!buffers || !buffers.length) return new Float32Array(0);
    const total = buffers.reduce((a, b) => a + (b ? b.length : 0), 0);
    const out = new Float32Array(total);
    let o = 0;
    for (const b of buffers) {
      if (!b) continue;
      out.set(b, o);
      o += b.length;
    }
    return out;
  };

  const buildPeaks = (mono: Float32Array, width: number): Float32Array => {
    const per = Math.max(1, Math.floor(mono.length / width));
    const p = new Float32Array(width * 2);
    for (let x = 0; x < width; x++) {
      let s = x * per;
      let e = Math.min(mono.length, s + per);
      let mn = 1, mx = -1;
      for (let i = s; i < e; i++) {
        const v = mono[i];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      p[x * 2] = mn;
      p[x * 2 + 1] = mx;
    }
    return p;
  };

  const drawMeter = useCallback(() => {
    const canvas = meterCanvasRef.current;
    if (!canvas) {
      console.warn("[AudioRecorder] Meter canvas not available");
      return;
    }
    const g = canvas.getContext('2d');
    if (!g) {
      console.warn("[AudioRecorder] Could not get 2d context for meter");
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const W = Math.max(1, Math.floor(rect.width * DPR));
    const H = Math.max(1, Math.floor(rect.height * DPR));

    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }

    g.clearRect(0, 0, W, H);
    g.fillStyle = '#f8fafc';
    g.fillRect(0, 0, W, H);

    const topDb = 0;
    const bottomDb = -60;

    const dbToY = (db: number): number => {
      db = Math.max(bottomDb, Math.min(topDb, db));
      const t = (db - bottomDb) / (topDb - bottomDb);
      return H - Math.round(t * H);
    };

    g.strokeStyle = '#cbd5e1';
    g.fillStyle = '#64748b';
    g.lineWidth = 1;
    g.font = `${12 * DPR}px system-ui, sans-serif`;
    g.textBaseline = 'middle';

    const ticks = [0, -5, -10, -20, -30, -40, -50, -60];
    for (const db of ticks) {
      const y = dbToY(db);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
      g.fillText(`${db}`, 6 * DPR, y);
    }

    const barWidth = Math.max(10, Math.floor(W * 0.6));
    const x0 = W - barWidth - 8 * DPR;
    const levelDb = clampDb(currentDb);
    const yLevel = dbToY(levelDb);

    let color = '#22c55e';
    if (levelDb > -10 && levelDb <= -5) color = '#f59e0b';
    if (levelDb > -5) color = '#ef4444';

    g.fillStyle = color;
    g.fillRect(x0, yLevel, barWidth, H - yLevel);
    g.strokeStyle = '#94a3b8';
    g.strokeRect(x0, 0, barWidth, H);

    g.fillStyle = '#1e293b';
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    g.fillText(`${levelDb.toFixed(1)} dBFS`, Math.floor(x0 + barWidth / 2), H - 6 * DPR);
    
    // Debug: log occasionally to verify meter is drawing
    if (Math.random() < 0.01) { // ~1% of the time
      console.log("[AudioRecorder] Meter drawing:", { levelDb, currentDb, yLevel, H });
    }
  }, [currentDb, DPR]);

  const startMeter = useCallback(() => {
    stopMeter(); // Ensure we stop any existing animation first
    console.log("[AudioRecorder] Starting meter animation loop");
    const step = () => {
      drawMeter();
      meterRAFRef.current = requestAnimationFrame(step);
    };
    meterRAFRef.current = requestAnimationFrame(step);
  }, [drawMeter]);

  const stopMeter = useCallback(() => {
    if (meterRAFRef.current) {
      cancelAnimationFrame(meterRAFRef.current);
      meterRAFRef.current = null;
    }
  }, []);

  // Start/stop meter animation when monitoring or recording changes
  useEffect(() => {
    if (isMonitoring || isRecording) {
      console.log("[AudioRecorder] Starting meter animation");
      startMeter();
    } else {
      console.log("[AudioRecorder] Stopping meter animation");
      stopMeter();
    }
    return () => {
      stopMeter();
    };
  }, [isMonitoring, isRecording, startMeter, stopMeter]);

  // Handle audio element src when recordedAudio changes
  useEffect(() => {
    if (!recordedAudio) {
      // Clear audio src if no recording
      const player = playerRef.current;
      if (player && player.src) {
        player.src = '';
        player.load();
      }
      return;
    }
    
    // Use a small delay to ensure the audio element is rendered
    const timer = setTimeout(() => {
      const player = playerRef.current;
      if (player) {
        console.log("[AudioRecorder] Setting audio src from useEffect:", recordedAudio);
        // Always set src and load to ensure audio is ready
        player.src = recordedAudio;
        player.load();
        console.log("[AudioRecorder] Audio src set, readyState:", player.readyState);
        
        // Verify the blob URL is still valid
        fetch(recordedAudio, { method: 'HEAD' })
          .then(() => console.log("[AudioRecorder] Blob URL is valid"))
          .catch(err => console.error("[AudioRecorder] Blob URL check failed:", err));
      } else {
        console.warn("[AudioRecorder] Audio element not found when trying to set src");
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [recordedAudio]);

  const drawWave = useCallback(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;

    const rect = canvas.getBoundingClientRect();
    const W = Math.max(1, Math.floor(rect.width * DPR));
    const H = Math.max(1, Math.floor(rect.height * DPR));

    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
      wavePeaksRef.current = null;
    }

    g.clearRect(0, 0, W, H);
    g.fillStyle = '#f8fafc';
    g.fillRect(0, 0, W, H);

    // Get current waveform data - prefer ref for real-time updates during recording
    const currentWaveform = isRecordingRef.current ? waveformDataRef.current : waveformData;
    
    if (!currentWaveform || currentWaveform.length === 0) {
      // Draw a placeholder message
      g.fillStyle = '#cbd5e1';
      g.font = `${12 * DPR}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const message = isRecordingRef.current ? 'Recording... (waiting for audio)' : 'No waveform data';
      g.fillText(message, W / 2, H / 2);
      
      // Draw a simple indicator line when recording
      if (isRecordingRef.current) {
        g.strokeStyle = '#ef4444';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(W * 0.1, H / 2);
        g.lineTo(W * 0.9, H / 2);
        g.stroke();
      }
      return;
    }

    // Rebuild peaks if needed or if waveform changed
    // During recording, rebuild peaks more frequently to show real-time updates
    const shouldRebuild = !wavePeaksRef.current || 
                         wavePeaksRef.current.length !== W * 2 ||
                         (isRecordingRef.current && currentWaveform.length > 0);
    
    if (shouldRebuild) {
      wavePeaksRef.current = buildPeaks(currentWaveform, W);
    }

    const peaks = wavePeaksRef.current;
    if (!peaks) {
      return; // Safety check - should not happen after rebuild
    }
    
    const mid = (H / 2) | 0;
    g.strokeStyle = isRecordingRef.current ? '#ef4444' : '#3b82f6';
    g.lineWidth = 1;

    for (let x = 0; x < W; x++) {
      const mn = peaks[x * 2];
      const mx = peaks[x * 2 + 1];
      const y1 = mid + ((mn * mid) | 0);
      const y2 = mid + ((mx * mid) | 0);
      g.beginPath();
      g.moveTo(x, y1);
      g.lineTo(x, y2);
      g.stroke();
    }

    const player = playerRef.current;
    if (player && Number.isFinite(player.duration) && player.duration > 0) {
      const px = ((player.currentTime / player.duration) * W) | 0;
      g.fillStyle = '#ef4444';
      g.fillRect(px, 0, 2, H);
    }
  }, [waveformData, DPR]);

  const startWave = useCallback(() => {
    stopWave(); // Ensure we stop any existing animation first
    console.log("[AudioRecorder] Starting waveform animation loop");
    const step = () => {
      drawWave();
      waveRAFRef.current = requestAnimationFrame(step);
    };
    waveRAFRef.current = requestAnimationFrame(step);
  }, [drawWave]);

  const stopWave = useCallback(() => {
    if (waveRAFRef.current) {
      cancelAnimationFrame(waveRAFRef.current);
      waveRAFRef.current = null;
    }
  }, []);

  const analyzeTruePeakDb = (mono: Float32Array, oversample: number = 4): number => {
    if (!mono || mono.length === 0) return -120;

    let maxA = 0;
    const N = mono.length;

    for (let i = 0; i < N; i++) {
      const a = Math.abs(mono[i]);
      if (a > maxA) maxA = a;
    }

    const cr = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
      const t2 = t * t;
      const t3 = t2 * t;
      return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    };

    for (let i = 1; i < N - 2; i++) {
      const p0 = mono[i - 1];
      const p1 = mono[i];
      const p2 = mono[i + 1];
      const p3 = mono[i + 2];
      for (let k = 1; k < oversample; k++) {
        const t = k / oversample;
        const y = cr(p0, p1, p2, p3, t);
        const a = Math.abs(y);
        if (a > maxA) maxA = a;
      }
    }

    return 20 * Math.log10(Math.max(1e-8, maxA));
  };

  const encodeWav16Mono = (mono: Float32Array, sampleRate: number): Blob => {
    const length = mono.length;
    const buffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(buffer);
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM format (1 = PCM, not 3 which is IEEE float)
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate = sampleRate * channels * bytesPerSample
    view.setUint16(32, 2, true); // block align = channels * bytesPerSample
    view.setUint16(34, 16, true); // bits per sample
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);

    let offset = 44;
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, mono[i]));
      const intSample = Math.floor(sample * 32767);
      view.setInt16(offset, intSample, true); // little-endian 16-bit signed integer
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  };

  const ensureMonitorGraph = async () => {
    if (isMonitoring && audioContextRef.current && scriptProcessorRef.current) {
      console.log("[AudioRecorder] Monitor graph already exists");
      return;
    }

    console.log("[AudioRecorder] Setting up monitor graph...");
    const media = await getMicStream();
    console.log("[AudioRecorder] Got media stream:", {
      id: media.id,
      active: media.active,
      tracks: media.getTracks().map(t => ({ id: t.id, kind: t.kind, enabled: t.enabled, readyState: t.readyState }))
    });

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: desiredSampleRate });
    audioContextRef.current = ctx;
    console.log("[AudioRecorder] AudioContext created:", {
      state: ctx.state,
      sampleRate: ctx.sampleRate
    });

    const actualSampleRate = ctx.sampleRate;
    setAudioMetadata(prev => ({
      ...prev,
      sampleRate: actualSampleRate
    } as AudioMetadata));

    const src = ctx.createMediaStreamSource(media);
    sourceNodeRef.current = src;
    console.log("[AudioRecorder] MediaStreamSource created:", {
      channelCount: src.channelCount,
      numberOfInputs: src.numberOfInputs,
      numberOfOutputs: src.numberOfOutputs
    });

    const size = 2048;
    const sp = ctx.createScriptProcessor(size, src.channelCount || 2, 1);
    console.log("[AudioRecorder] ScriptProcessor created:", {
      bufferSize: sp.bufferSize,
      numberOfInputs: sp.numberOfInputs,
      numberOfOutputs: sp.numberOfOutputs
    });
    
    let chunkCount = 0;
    sp.onaudioprocess = (e) => {
      chunkCount++;
      const L = e.inputBuffer.getChannelData(0);
      const R = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : null;
      const len = L.length;
      const m = new Float32Array(len);

      if (R) {
        for (let i = 0; i < len; i++) m[i] = 0.5 * (L[i] + R[i]);
      } else {
        m.set(L);
      }

      // Check if we're actually getting audio data
      let maxAmplitude = 0;
      for (let i = 0; i < len; i++) {
        const abs = Math.abs(m[i]);
        if (abs > maxAmplitude) maxAmplitude = abs;
      }

      let sum = 0;
      for (let i = 0; i < len; i++) {
        const s = m[i];
        sum += s * s;
      }

      const ms = sum / len;
      const chunkDur = len / actualSampleRate;
      const beta = Math.exp(-chunkDur / 0.4);
      emaMSRef.current = (1 - beta) * ms + beta * emaMSRef.current;
      const db = toDbFSRealtime(Math.sqrt(emaMSRef.current));
      
      // Always update currentDb, not just when recording
      setCurrentDb(db);

      // Log every 100 chunks to verify audio is being processed
      if (chunkCount % 100 === 0) {
        console.log("[AudioRecorder] Processing audio chunks:", {
          chunkCount,
          isRecording: isRecordingRef.current,
          maxAmplitude: maxAmplitude.toFixed(4),
          db: db.toFixed(2),
          chunksCollected: chunksRef.current.length
        });
      }

      if (isRecordingRef.current) {
        chunksRef.current.push(m);
        // Update waveform data ref immediately for real-time rendering
        const mono = downmixToMono(chunksRef.current);
        waveformDataRef.current = mono;
        // Force rebuild peaks on next draw for real-time updates
        wavePeaksRef.current = null;
        
        // Update state periodically for React re-renders (every ~100ms)
        // The ref is used directly in drawWave for real-time rendering
        if (!waveformUpdateTimerRef.current) {
          waveformUpdateTimerRef.current = window.setTimeout(() => {
            if (waveformDataRef.current) {
              setWaveformData(new Float32Array(waveformDataRef.current));
            }
            waveformUpdateTimerRef.current = null;
          }, 100);
        }
      }
    };

    src.connect(sp);
    sp.connect(ctx.destination);
    scriptProcessorRef.current = sp;
    console.log("[AudioRecorder] Nodes connected, ScriptProcessor should now process audio");

    setIsMonitoring(true);
    startMeter();
    startWave(); // Start waveform rendering immediately
  };

  const startMonitoring = async () => {
    try {
      setError(null);
      await ensureMonitorGraph();
    } catch (err: any) {
      setError("Failed to access microphone. Please check permissions.");
      console.error("Error accessing microphone:", err);
    }
  };

  const stopMonitoring = () => {
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
        if (scriptProcessorRef.current) scriptProcessorRef.current.disconnect();
      } catch {}
      audioContextRef.current.close();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    stopMeter();
    setCurrentDb(-120);
    emaMSRef.current = 0;
    setIsMonitoring(false);
  };

  const startTimer = () => {
    startTimeRef.current = performance.now();
    timerRef.current = window.setInterval(() => {
      const t = ((performance.now() - startTimeRef.current) / 1000) | 0;
      setDuration(t);
      if (maxDurationSeconds && t >= maxDurationSeconds) {
        stopRecording();
      }
    }, 200);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = async () => {
    try {
      setError(null);
      console.log("[AudioRecorder] Starting recording...");
      
      if (!isMonitoring) {
        console.log("[AudioRecorder] Monitor not active, setting up graph...");
        await ensureMonitorGraph();
      }

      // Ensure we have a valid audio context
      if (!audioContextRef.current || !scriptProcessorRef.current) {
        console.error("[AudioRecorder] No audio context or processor available!");
        await ensureMonitorGraph();
      }

      chunksRef.current = [];
      emaMSRef.current = 0;
      startTimeRef.current = 0;
      wavePeaksRef.current = null;
      waveformDataRef.current = new Float32Array(0);
      setWaveformData(new Float32Array(0)); // Initialize with empty array so canvas shows
      setRecordedAudio(null);
      if (waveformUpdateTimerRef.current) {
        clearTimeout(waveformUpdateTimerRef.current);
        waveformUpdateTimerRef.current = null;
      }

      console.log("[AudioRecorder] Setting isRecordingRef to true");
      isRecordingRef.current = true;
      setIsRecording(true);
      startTimer();
      startWave(); // Start waveform rendering immediately

      console.log("[AudioRecorder] Recording started, chunks should now be collected");

      if (maxDurationSeconds) {
        setTimeout(() => {
          if (isRecordingRef.current) {
            stopRecording();
          }
        }, maxDurationSeconds * 1000);
      }
    } catch (err: any) {
      setError("Failed to start recording. Please check permissions.");
      console.error("[AudioRecorder] Error starting recording:", err);
    }
  };

  const stopRecording = () => {
    console.log("[AudioRecorder] Stopping recording...");
    stopTimer();
    isRecordingRef.current = false;
    setIsRecording(false);

    console.log("[AudioRecorder] Collected chunks:", chunksRef.current.length);
    const mono = downmixToMono(chunksRef.current);
    console.log("[AudioRecorder] Downmixed mono length:", mono.length);
    
    // Check if we actually captured audio
    let maxSample = 0;
    for (let i = 0; i < Math.min(mono.length, 1000); i++) {
      const abs = Math.abs(mono[i]);
      if (abs > maxSample) maxSample = abs;
    }
    console.log("[AudioRecorder] Max sample amplitude:", maxSample);

    chunksRef.current = [];

    if (!mono.length) {
      console.error("[AudioRecorder] No audio captured - chunks array was empty!");
      setError("No audio captured. Please check your microphone permissions and try again.");
      return;
    }

    if (maxSample < 0.001) {
      console.warn("[AudioRecorder] Audio captured but amplitude is very low:", maxSample);
      setError("Audio captured but volume is very low. Please check your microphone.");
    }

    const sampleRate = audioMetadata?.sampleRate || desiredSampleRate;
    const durationSec = mono.length / sampleRate;

    const tpDb = analyzeTruePeakDb(mono, 4);
    const sum = mono.reduce((a, b) => a + b * b, 0);
    const rms = Math.sqrt(sum / mono.length);
    const lufsInt = 20 * Math.log10(Math.max(1e-8, rms));

    const wav = encodeWav16Mono(mono, sampleRate);
    console.log("[AudioRecorder] WAV blob created:", {
      size: wav.size,
      type: wav.type,
      durationSec
    });
    
    const url = URL.createObjectURL(wav);
    console.log("[AudioRecorder] Blob URL created:", url);
    
    // Set waveform data first
    waveformDataRef.current = mono;
    setWaveformData(new Float32Array(mono)); // Create new array reference
    wavePeaksRef.current = null;
    
    // Set recorded audio - this will trigger the useEffect to set the audio src
    setRecordedAudio(url);
    
    // Ensure waveform is rendering
    startWave();

    const metadata: AudioMetadata = {
      ...audioMetadata!,
      durationSec: Number(durationSec.toFixed(2)),
      truePeak: Number(tpDb.toFixed(2)),
      integratedLoudness: Number(lufsInt.toFixed(2))
    };
    setAudioMetadata(metadata);

    console.log("[AudioRecorder] Metadata:", metadata);

    onRecordingComplete({
      blob: wav,
      metadata
    });
  };

  const deleteRecording = () => {
    if (recordedAudio) {
      URL.revokeObjectURL(recordedAudio);
      setRecordedAudio(null);
      setDuration(0);
      setWaveformData(null);
      wavePeaksRef.current = null;
      stopWave();
      chunksRef.current = [];
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Microphone Selection */}
      {audioDevices.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Microphone
          </label>
          <select
            value={selectedDeviceId}
            onChange={(e) => {
              setSelectedDeviceId(e.target.value);
              if (isMonitoring || isRecording) {
                stopMonitoring();
              }
            }}
            disabled={isRecording || isMonitoring}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white disabled:bg-gray-50"
          >
            {audioDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Meter and Waveform - Side by side */}
      {(isMonitoring || isRecording) && (
        <div>
          <div className="flex gap-2 mb-2">
            <label className="flex-1 text-sm font-medium text-gray-700">
              Waveform {isRecording && <span className="text-red-600">(Recording...)</span>}
            </label>
            {(isMonitoring || isRecording) && (
              <label className="w-20 flex-shrink-0 text-xs font-medium text-gray-600 text-center">
                Level
              </label>
            )}
          </div>
          <div className="flex gap-2 items-start">
            {/* Waveform - Takes most of the space */}
            <div className="flex-1">
              <canvas
                ref={waveCanvasRef}
                className="w-full border border-gray-300 rounded-lg bg-gray-50 cursor-pointer"
                style={{ height: '96px' }}
                onClick={(e) => {
                  const player = playerRef.current;
                  if (!player || !player.duration) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const ratio = Math.max(0, Math.min(1, x / rect.width));
                  player.currentTime = ratio * player.duration;
                }}
              />
            </div>
            {/* Input Level Meter - Smaller, on the side */}
            {(isMonitoring || isRecording) && (
              <div className="w-20 flex-shrink-0">
                <canvas
                  ref={meterCanvasRef}
                  className="w-full border border-gray-300 rounded-lg bg-gray-50"
                  style={{ height: '96px' }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Audio Metadata Display */}
      {audioMetadata && recordedAudio && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs space-y-1">
          <div><strong>Microphone:</strong> {audioMetadata.micName}</div>
          <div><strong>Sample Rate:</strong> {audioMetadata.sampleRate} Hz</div>
          <div><strong>Bit Depth:</strong> {audioMetadata.bitDepth}-bit</div>
          <div><strong>True Peak:</strong> {audioMetadata.truePeak.toFixed(2)} dBFS</div>
          <div><strong>Integrated Loudness:</strong> {audioMetadata.integratedLoudness.toFixed(2)} LUFS</div>
        </div>
      )}

      {!recordedAudio ? (
        <div className="space-y-3">
          {!isRecording ? (
            <>
              {!isMonitoring ? (
                <button
                  onClick={startMonitoring}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  <Volume2 className="w-5 h-5" />
                  Enable Meter
                </button>
              ) : (
                <button
                  onClick={stopMonitoring}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium"
                >
                  Disable Meter
                </button>
              )}
              {isMonitoring && (
                <button
                  onClick={startRecording}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
                >
                  <Mic className="w-5 h-5" />
                  Start Recording
                </button>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
                  <span className="font-mono text-lg font-semibold">
                    {formatDuration(duration)}
                  </span>
                </div>
                {maxDurationSeconds && (
                  <span className="text-sm text-gray-500">
                    / {formatDuration(maxDurationSeconds)} max
                  </span>
                )}
              </div>
              <button
                onClick={stopRecording}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 font-medium"
              >
                <Square className="w-5 h-5" />
                Stop Recording
              </button>
              {minDurationSeconds && duration < minDurationSeconds && (
                <p className="text-sm text-amber-600 text-center">
                  Minimum duration: {formatDuration(minDurationSeconds)}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {recordedAudio ? (
            <audio 
              key={recordedAudio} // Force re-render when URL changes
              ref={playerRef}
              src={recordedAudio}
              controls 
              className="w-full"
              preload="auto"
              crossOrigin="anonymous"
              onTimeUpdate={() => {
                drawWave();
              }}
              onEnded={() => {
                drawWave();
              }}
              onLoadedMetadata={() => {
                const player = playerRef.current;
                console.log("[AudioRecorder] Player metadata loaded:", {
                  duration: player?.duration,
                  readyState: player?.readyState,
                  src: player?.src,
                  networkState: player?.networkState
                });
              }}
              onCanPlay={() => {
                const player = playerRef.current;
                console.log("[AudioRecorder] Audio can play:", {
                  readyState: player?.readyState,
                  networkState: player?.networkState
                });
              }}
              onCanPlayThrough={() => {
                console.log("[AudioRecorder] Audio can play through");
              }}
              onError={(e) => {
                console.error("[AudioRecorder] Audio element error:", e);
                const player = e.currentTarget;
                console.error("[AudioRecorder] Error details:", {
                  code: player.error?.code,
                  message: player.error?.message,
                  networkState: player.networkState,
                  readyState: player.readyState,
                  src: player.src
                });
                setError(`Audio playback error: ${player.error?.message || 'Unknown error'} (code: ${player.error?.code})`);
              }}
            />
          ) : (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center text-gray-500">
              No recording available
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={deleteRecording}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100"
            >
              <Trash2 className="w-4 h-4" />
              Delete & Re-record
            </button>
          </div>
          <p className="text-xs text-gray-500 text-center">
            Duration: {formatDuration(duration)}
          </p>
        </div>
      )}
    </div>
  );
}
