import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAudioRecorder } from './useAudioRecorder';

// Mock MediaRecorder
class MockMediaRecorder {
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  state = 'inactive';

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(['test'], { type: 'audio/webm' }) });
    }
    if (this.onstop) {
      this.onstop();
    }
  }
}

// Mock AudioContext
class MockAudioContext {
  sampleRate = 16000;

  async decodeAudioData(): Promise<AudioBuffer> {
    return {
      getChannelData: () => new Float32Array([0.1, 0.2, -0.1, -0.2]),
      length: 4,
      sampleRate: 16000,
      duration: 0.00025,
      numberOfChannels: 1,
    } as unknown as AudioBuffer;
  }

  async close() {}
}

describe('useAudioRecorder', () => {
  let mockStream: MediaStream;
  let mockTrack: MediaStreamTrack;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTrack = {
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;

    mockStream = {
      getTracks: () => [mockTrack],
    } as unknown as MediaStream;

    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: 'audioinput', deviceId: 'default', label: 'Default Mic' },
        ]),
      },
    });
  });

  it('starts in idle state', () => {
    const onRecordingComplete = vi.fn();
    const { result } = renderHook(() =>
      useAudioRecorder({ onRecordingComplete })
    );

    expect(result.current.recordingState).toBe('idle');
    expect(result.current.recordingTime).toBe(0);
  });

  it('transitions to recording state when started', async () => {
    const onRecordingComplete = vi.fn();
    const { result } = renderHook(() =>
      useAudioRecorder({ onRecordingComplete })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.recordingState).toBe('recording');
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: true,
    });
  });

  it('calls onError when microphone access fails', async () => {
    const onRecordingComplete = vi.fn();
    const onError = vi.fn();
    const error = new Error('Permission denied');

    // First call succeeds (for refreshDevices on mount), second call fails (for startRecording)
    vi.mocked(navigator.mediaDevices.getUserMedia)
      .mockResolvedValueOnce(mockStream)
      .mockRejectedValueOnce(error);

    const { result } = renderHook(() =>
      useAudioRecorder({ onRecordingComplete, onError })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    expect(onError).toHaveBeenCalledWith(error);
    expect(result.current.recordingState).toBe('idle');
  });

  it('provides stopRecording function', () => {
    const onRecordingComplete = vi.fn();
    const { result } = renderHook(() =>
      useAudioRecorder({ onRecordingComplete })
    );

    expect(typeof result.current.stopRecording).toBe('function');
  });
});
