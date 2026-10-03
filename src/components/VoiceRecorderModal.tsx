import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, Trash2, Send, Volume2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface VoiceRecorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendVoice: (audioBlob: Blob, duration: number) => Promise<void>;
  isProcessing?: boolean;
}

export const VoiceRecorderModal: React.FC<VoiceRecorderModalProps> = ({
  isOpen,
  onClose,
  onSendVoice,
  isProcessing = false,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Clean reset
  const resetRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setIsRecording(false);
    setIsPaused(false);
    setDuration(0);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setAudioBlob(null);
    setIsPlaying(false);
    setErrorMessage(null);
    audioChunksRef.current = [];
  };

  useEffect(() => {
    if (!isOpen) {
      resetRecording();
    }
  }, [isOpen]);

  const startRecording = async () => {
    try {
      setErrorMessage(null);

      // Check browser support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setErrorMessage('Microphone recording is not supported in this browser or environment.');
        return;
      }

      if (typeof MediaRecorder === 'undefined') {
        setErrorMessage('MediaRecorder API is not supported in this browser.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Audio Context for Live Waveform Visualizer
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const audioContext = new AudioContextClass();
          const analyser = audioContext.createAnalyser();
          const source = audioContext.createMediaStreamSource(stream);
          analyser.fftSize = 64;
          source.connect(analyser);
          audioContextRef.current = audioContext;
          analyserRef.current = analyser;
        }
      } catch (audioCtxErr) {
        console.warn('AudioContext visualizer initialization note:', audioCtxErr);
      }

      // Determine supported container MIME type
      let selectedMimeType = 'audio/webm';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          selectedMimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          selectedMimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          selectedMimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          selectedMimeType = 'audio/ogg';
        }
      }

      // MediaRecorder setup
      const mediaRecorder = new MediaRecorder(stream, { mimeType: selectedMimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (audioChunksRef.current.length > 0) {
          const blob = new Blob(audioChunksRef.current, { type: selectedMimeType });
          const url = URL.createObjectURL(blob);
          setAudioBlob(blob);
          setAudioUrl(url);
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setIsPaused(false);

      // Start duration timer
      const startTime = Date.now() - duration * 1000;
      timerRef.current = window.setInterval(() => {
        setDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      // Draw real-time audio wave
      drawLiveWave();
    } catch (err: any) {
      console.error('Microphone access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage('Microphone access was denied. Please allow microphone permissions in your browser to record audio.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMessage('No microphone device was found on this computer.');
      } else {
        setErrorMessage(err.message || 'Failed to initialize microphone recording.');
      }
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      const startTime = Date.now() - duration * 1000;
      timerRef.current = window.setInterval(() => {
        setDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (timerRef.current) clearInterval(timerRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    setIsRecording(false);
    setIsPaused(false);
  };

  const drawLiveWave = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animationFrameRef.current = requestAnimationFrame(render);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * (canvas.height * 0.85);

        // Signature Aestific Gradient for bars
        const grad = ctx.createLinearGradient(0, canvas.height, 0, 0);
        grad.addColorStop(0, '#FF1A8C');
        grad.addColorStop(0.5, '#9333EA');
        grad.addColorStop(1, '#00F0FF');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, (canvas.height - barHeight) / 2, Math.max(3, barWidth - 2), barHeight, 4);
        ctx.fill();

        x += barWidth + 2;
      }
    };

    render();
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const togglePlayback = () => {
    if (!audioPlayerRef.current) return;
    if (isPlaying) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
    } else {
      audioPlayerRef.current.play().catch((playErr) => {
        console.warn('Playback error:', playErr);
        setIsPlaying(false);
      });
      setIsPlaying(true);
    }
  };

  const handleSend = async () => {
    if (!audioBlob || audioBlob.size < 200 || duration === 0) {
      setErrorMessage('Audio recording is empty or too short. Please speak into your microphone and record again.');
      return;
    }
    setErrorMessage(null);
    try {
      await onSendVoice(audioBlob, duration);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to upload or transcribe audio recording.');
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xl">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="w-full max-w-lg bg-[#070712]/95 border border-white/12 rounded-3xl p-5 sm:p-7 shadow-2xl shadow-purple-950/30 relative overflow-hidden backdrop-blur-2xl max-h-[90dvh] overflow-y-auto"
        >
          {/* Subtle Ambient Glow */}
          <div className="absolute -top-24 -right-24 w-56 h-56 bg-gradient-to-br from-pink-500/25 via-purple-500/20 to-cyan-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-56 h-56 bg-gradient-to-tr from-cyan-500/20 via-purple-500/20 to-pink-500/20 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center justify-between mb-6 relative z-10">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-white/10 border border-zinc-200 dark:border-white/20 flex items-center justify-center text-zinc-900 dark:text-white shadow-sm shrink-0">
                <Mic className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-semibold text-zinc-900 dark:text-white truncate">Aestific Voice Studio</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">Record and transcribe speech into intelligent action</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white text-xs px-3 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/5 border border-zinc-200 dark:border-white/10 transition-colors cursor-pointer shrink-0"
            >
              Cancel
            </button>
          </div>

          {errorMessage && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {errorMessage}
            </div>
          )}

          {/* Visualizer Canvas & Status */}
          <div className="relative h-32 w-full bg-black/40 border border-white/5 rounded-xl flex items-center justify-center overflow-hidden mb-6">
            {isRecording ? (
              <canvas ref={canvasRef} width={400} height={120} className="w-full h-full" />
            ) : audioUrl ? (
              <div className="flex flex-col items-center gap-2">
                <Volume2 className="w-8 h-8 text-cyan-400 animate-pulse" />
                <span className="text-xs font-mono text-zinc-300">Recording captured ({formatTime(duration)})</span>
                <audio
                  ref={audioPlayerRef}
                  src={audioUrl}
                  onEnded={() => setIsPlaying(false)}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="text-center px-4">
                <p className="text-sm text-zinc-400">Click the microphone to start recording your voice note</p>
                <p className="text-xs text-zinc-600 mt-1">Groq Whisper neural transcription will convert audio to text</p>
              </div>
            )}

            {/* Timer Overlay */}
            {isRecording && (
              <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/60 border border-pink-500/30 flex items-center gap-2 text-xs font-mono text-pink-300">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                {formatTime(duration)}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between pt-2">
            {!isRecording && !audioUrl ? (
              <div className="w-full flex justify-center">
                <button
                  onClick={startRecording}
                  className="flex items-center gap-3 px-6 py-3.5 rounded-full aestific-gradient-bg text-white font-medium hover:opacity-95 active:scale-95 shadow-lg shadow-pink-500/25 transition-all cursor-pointer"
                >
                  <Mic className="w-5 h-5" />
                  Start Recording
                </button>
              </div>
            ) : isRecording ? (
              <div className="w-full flex items-center justify-center gap-4">
                <button
                  onClick={isPaused ? resumeRecording : pauseRecording}
                  className="p-3.5 rounded-full bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white hover:bg-zinc-700 active:scale-95 transition-all cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
                  title={isPaused ? 'Resume' : 'Pause'}
                  aria-label={isPaused ? 'Resume recording' : 'Pause recording'}
                >
                  {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                </button>

                <button
                  onClick={stopRecording}
                  className="px-6 py-3.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 font-medium hover:bg-rose-500/30 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Square className="w-4 h-4 fill-current" />
                  Stop & Review
                </button>
              </div>
            ) : (
              <div className="w-full flex items-center justify-between">
                <button
                  onClick={resetRecording}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 text-xs font-medium active:scale-95 transition-all cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  Discard
                </button>

                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePlayback}
                    className="p-3 rounded-full bg-zinc-800 border border-white/10 text-zinc-200 hover:bg-zinc-700 active:scale-95 transition-all cursor-pointer min-w-[40px] min-h-[40px] flex items-center justify-center"
                    title={isPlaying ? 'Pause' : 'Play'}
                    aria-label={isPlaying ? 'Pause playback' : 'Play recording'}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={handleSend}
                    disabled={isProcessing}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 text-sm font-semibold active:scale-95 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Transcribing...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Send Voice Note
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
