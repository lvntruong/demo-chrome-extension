// components/VideoRecorder.tsx - Video Recording Interface
import React, { useState, useEffect, useRef } from "react";
import {
  videoService,
  VideoOptions,
  VideoResult,
  RecordingState,
  RecordingControls,
} from "../services/videoService";

interface VideoRecorderProps {
  caseId: string;
  onVideoCapture?: (result: VideoResult) => void;
  onClose?: () => void;
}

export default function VideoRecorder({
  caseId,
  onVideoCapture,
  onClose,
}: VideoRecorderProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>(
    videoService.getCurrentState()
  );
  const [recordingControls, setRecordingControls] =
    useState<RecordingControls | null>(null);
  const [videoOptions, setVideoOptions] = useState<VideoOptions>({
    type: "tab",
    format: "webm",
    quality: "medium",
    maxDuration: 300, // 5 minutes default
    includeAudio: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Check if video recording is supported
    setIsSupported(videoService.isSupported());
  }, []);

  const handleStartRecording = async () => {
    try {
      setError(null);

      const controls = await videoService.startRecording(videoOptions, {
        onStateChange: (state) => {
          setRecordingState(state);

          // Auto-handle completion
          if (state.status === "completed") {
            setRecordingControls(null);
          }
        },
        onProgress: (progress) => {
          // Progress updates are handled in state
        },
      });

      setRecordingControls(controls);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to start recording"
      );
      console.error("Recording start failed:", error);
    }
  };

  const handleStopRecording = async () => {
    if (!recordingControls) return;

    try {
      const result = await recordingControls.stop();

      if (result.success) {
        // Show preview
        if (videoPreviewRef.current && result.dataUrl) {
          videoPreviewRef.current.src = result.dataUrl;
        }

        // Call callback
        onVideoCapture?.(result);
      } else {
        setError(result.error || "Recording failed");
      }

      setRecordingControls(null);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to stop recording"
      );
    }
  };

  const handlePauseRecording = () => {
    if (!recordingControls) return;
    recordingControls.pause();
  };

  const handleResumeRecording = () => {
    if (!recordingControls) return;
    recordingControls.resume();
  };

  const handleCancelRecording = () => {
    if (!recordingControls) return;
    recordingControls.cancel();
    setRecordingControls(null);
    setError(null);
  };

  const handleOptionsChange = (updates: Partial<VideoOptions>) => {
    if (recordingState.isRecording) return; // Can't change options during recording
    setVideoOptions((prev) => ({ ...prev, ...updates }));
  };

  if (!isSupported) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <div className="text-red-600 text-4xl mb-4">⚠️</div>
        <h3 className="text-lg font-medium text-red-900 mb-2">
          Video Recording Not Supported
        </h3>
        <p className="text-red-700 mb-4">
          Video recording requires Chrome extension permissions and modern
          browser features.
        </p>
        <button
          onClick={onClose}
          className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Video Recording</h3>
          <p className="text-sm text-gray-600">Case: {caseId}</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="text-red-500 mr-3">❌</div>
            <div>
              <h4 className="font-medium text-red-900">Recording Error</h4>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Recording Options */}
      {!recordingState.isRecording && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">Recording Options</h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Recording Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Recording Type
              </label>
              <select
                value={videoOptions.type}
                onChange={(e) =>
                  handleOptionsChange({ type: e.target.value as any })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="tab">Current Tab</option>
                <option value="desktop">Desktop/Window</option>
              </select>
            </div>

            {/* Quality */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quality
              </label>
              <select
                value={videoOptions.quality}
                onChange={(e) =>
                  handleOptionsChange({ quality: e.target.value as any })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="low">Low (720p)</option>
                <option value="medium">Medium (1080p)</option>
                <option value="high">High (1080p+)</option>
              </select>
            </div>

            {/* Max Duration */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Max Duration (minutes)
              </label>
              <select
                value={
                  videoOptions.maxDuration ? videoOptions.maxDuration / 60 : 5
                }
                onChange={(e) =>
                  handleOptionsChange({
                    maxDuration: parseInt(e.target.value) * 60,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={1}>1 minute</option>
                <option value={5}>5 minutes</option>
                <option value={10}>10 minutes</option>
                <option value={30}>30 minutes</option>
              </select>
            </div>

            {/* Include Audio */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="includeAudio"
                checked={videoOptions.includeAudio}
                onChange={(e) =>
                  handleOptionsChange({ includeAudio: e.target.checked })
                }
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label
                htmlFor="includeAudio"
                className="ml-2 text-sm text-gray-700"
              >
                Include Audio
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Recording Status */}
      {recordingState.isRecording && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div
                className={`w-3 h-3 rounded-full mr-3 ${
                  recordingState.isPaused
                    ? "bg-yellow-500"
                    : "bg-red-500 animate-pulse"
                }`}
              ></div>
              <div>
                <div className="font-medium text-blue-900">
                  {recordingState.isPaused
                    ? "Recording Paused"
                    : "Recording..."}
                </div>
                <div className="text-sm text-blue-700">
                  Duration:{" "}
                  {videoService.formatDuration(recordingState.duration)} | Size:{" "}
                  {videoService.formatFileSize(recordingState.size)}
                </div>
              </div>
            </div>

            <div className="text-2xl text-blue-600">
              {recordingState.isPaused ? "⏸️" : "🎥"}
            </div>
          </div>
        </div>
      )}

      {/* Control Buttons */}
      <div className="flex flex-wrap gap-3">
        {!recordingState.isRecording ? (
          <button
            onClick={handleStartRecording}
            disabled={recordingState.status === "starting"}
            className="flex items-center px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span className="mr-2">🎥</span>
            {recordingState.status === "starting"
              ? "Starting..."
              : "Start Recording"}
          </button>
        ) : (
          <>
            <button
              onClick={handleStopRecording}
              disabled={recordingState.status === "stopping"}
              className="flex items-center px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              <span className="mr-2">⏹️</span>
              {recordingState.status === "stopping"
                ? "Stopping..."
                : "Stop Recording"}
            </button>

            {recordingState.isPaused ? (
              <button
                onClick={handleResumeRecording}
                className="flex items-center px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
              >
                <span className="mr-2">▶️</span>
                Resume
              </button>
            ) : (
              <button
                onClick={handlePauseRecording}
                className="flex items-center px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 transition-colors"
              >
                <span className="mr-2">⏸️</span>
                Pause
              </button>
            )}

            <button
              onClick={handleCancelRecording}
              className="flex items-center px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
            >
              <span className="mr-2">❌</span>
              Cancel
            </button>
          </>
        )}
      </div>

      {/* Video Preview */}
      {recordingState.status === "completed" && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">Recording Preview</h4>
          <div className="bg-black rounded-lg overflow-hidden">
            <video
              ref={videoPreviewRef}
              controls
              className="w-full h-auto max-h-96"
              preload="metadata"
            >
              Your browser does not support video playback.
            </video>
          </div>

          <div className="mt-3 text-sm text-gray-600">
            Duration: {videoService.formatDuration(recordingState.duration)} |
            Size: {videoService.formatFileSize(recordingState.size)}
          </div>
        </div>
      )}

      {/* Recording Tips */}
      {!recordingState.isRecording && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">💡 Recording Tips</h4>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>
              • <strong>Tab Recording:</strong> Records only the current browser
              tab
            </li>
            <li>
              • <strong>Desktop Recording:</strong> Records entire screen or
              selected window
            </li>
            <li>
              • <strong>Audio:</strong> May require additional permissions
            </li>
            <li>
              • <strong>Performance:</strong> Lower quality settings use less
              resources
            </li>
            <li>
              • <strong>Storage:</strong> Videos will be uploaded to S3 after
              recording
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
