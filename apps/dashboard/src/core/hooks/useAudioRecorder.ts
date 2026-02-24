import { useState, useRef, useCallback, useEffect } from 'react';

export type RecordingState = 'idle' | 'recording' | 'processing';

export interface AudioDevice {
  deviceId: string;
  label: string;
}

interface UseAudioRecorderOptions {
  onRecordingComplete: (audioBase64: string) => void | Promise<void>;
  onError?: (error: Error) => void;
  deviceId?: string;
}

interface UseAudioRecorderReturn {
  recordingState: RecordingState;
  recordingTime: number;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  devices: AudioDevice[];
  refreshDevices: () => Promise<void>;
}

export function useAudioRecorder({
  onRecordingComplete,
  onError,
  deviceId,
}: UseAudioRecorderOptions): UseAudioRecorderReturn {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [devices, setDevices] = useState<AudioDevice[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const refreshDevices = useCallback(async () => {
    try {
      // Request permission first to get device labels
      await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices
        .filter((d) => d.kind === 'audioinput')
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `麦克风 ${d.deviceId.slice(0, 8)}`,
        }));
      setDevices(audioInputs);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }, [onError]);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const processRecording = useCallback(async () => {
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      const channelData = audioBuffer.getChannelData(0);
      const pcmData = new Int16Array(channelData.length);

      for (let i = 0; i < channelData.length; i++) {
        const s = Math.max(-1, Math.min(1, channelData[i]));
        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      const uint8Array = new Uint8Array(pcmData.buffer);
      let binary = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const audioBase64 = btoa(binary);

      await audioContext.close();
      await onRecordingComplete(audioBase64);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setRecordingState('idle');
    }
  }, [onRecordingComplete, onError]);

  const startRecording = useCallback(async () => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        cleanup();
        setRecordingState('processing');
        processRecording();
      };

      mediaRecorder.start();
      setRecordingState('recording');
      setRecordingTime(0);

      timerRef.current = window.setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch (err) {
      cleanup();
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }, [cleanup, processRecording, onError, deviceId]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && recordingState === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, [recordingState]);

  return {
    recordingState,
    recordingTime,
    startRecording,
    stopRecording,
    devices,
    refreshDevices,
  };
}
