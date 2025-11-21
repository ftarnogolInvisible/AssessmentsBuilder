import { useState, useRef, useEffect } from "react";
import { Video, Square, Trash2 } from "lucide-react";

interface VideoRecorderProps {
  onRecordingComplete: (videoBlob: Blob) => void;
  maxDurationSeconds?: number;
  minDurationSeconds?: number;
}

export default function VideoRecorder({ 
  onRecordingComplete, 
  maxDurationSeconds,
  minDurationSeconds 
}: VideoRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (recordedVideo) {
        URL.revokeObjectURL(recordedVideo);
      }
    };
  }, [stream, recordedVideo]);

  // Ensure video plays when stream is set
  useEffect(() => {
    if (stream && videoRef.current && !recordedVideo) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(err => {
        console.error("Error playing video stream:", err);
      });
    }
  }, [stream, recordedVideo]);

  const startRecording = async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }, 
        audio: true 
      });
      
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        // Ensure video plays and is visible
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play().catch(err => {
              console.error("Error playing video:", err);
            });
          }
        };
        // Also try playing immediately
        videoRef.current.play().catch(err => {
          console.error("Error playing video:", err);
        });
      }

      const mediaRecorder = new MediaRecorder(mediaStream, {
        mimeType: 'video/webm;codecs=vp8,opus',
        videoBitsPerSecond: 2500000 // 2.5 Mbps for 720p
      });
      mediaRecorderRef.current = mediaRecorder;
      videoChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          videoChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const videoBlob = new Blob(videoChunksRef.current, { type: 'video/webm' });
        const videoUrl = URL.createObjectURL(videoBlob);
        setRecordedVideo(videoUrl);
        onRecordingComplete(videoBlob);
        
        // Stop all tracks
        if (mediaStream) {
          mediaStream.getTracks().forEach(track => track.stop());
        }
        setStream(null);
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setDuration(0);

      // Update duration every second
      intervalRef.current = window.setInterval(() => {
        setDuration(prev => {
          const newDuration = prev + 1;
          // Auto-stop if max duration reached
          if (maxDurationSeconds && newDuration >= maxDurationSeconds) {
            stopRecording();
          }
          return newDuration;
        });
      }, 1000);
    } catch (err) {
      setError("Failed to access camera/microphone. Please check permissions.");
      console.error("Error accessing media devices:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  };

  const deleteRecording = () => {
    if (recordedVideo) {
      URL.revokeObjectURL(recordedVideo);
      setRecordedVideo(null);
      setDuration(0);
      videoChunksRef.current = [];
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

      {!recordedVideo ? (
        <div className="space-y-3">
          {!isRecording ? (
            <button
              onClick={startRecording}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
            >
              <Video className="w-5 h-5" />
              Start Recording (720p)
            </button>
          ) : (
            <div className="space-y-3">
              <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                  style={{ minHeight: '400px' }}
                />
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-black bg-opacity-50 text-white px-3 py-1 rounded z-10">
                  <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
                  <span className="font-mono font-semibold">
                    {formatDuration(duration)}
                  </span>
                  {maxDurationSeconds && (
                    <span className="text-gray-300">
                      / {formatDuration(maxDurationSeconds)}
                    </span>
                  )}
                </div>
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
          <video src={recordedVideo} controls className="w-full rounded-lg" />
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
            Duration: {formatDuration(duration)} | Resolution: 720p
          </p>
        </div>
      )}
    </div>
  );
}

