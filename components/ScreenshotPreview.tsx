// components/ScreenshotPreview.tsx - Pure React popup with proper event handling
import React, { useState, useEffect } from "react";
import { s3Service, UploadProgress, UploadResult } from "../services/s3Service";
import { caseService } from "../services/caseService";

export interface ScreenshotData {
  dataUrl: string;
  filename: string;
  timestamp: string;
  type: string;
  caseId: string;
  blob?: Blob;
}

interface ScreenshotPreviewProps {
  screenshot: ScreenshotData;
  onSave: () => void;
  onDownload: () => void;
  onRetake: () => void;
  onClose: () => void;
  isUploading?: boolean;
}

// Mock cases for dropdown
const mockCases = [
  { id: "Case-120320240830", title: "Website Bug Investigation" },
  { id: "Case-120320240829", title: "Performance Issue Analysis" },
  { id: "Case-120320240828", title: "User Experience Review" },
];

export default function ScreenshotPreview({
  screenshot,
  onSave,
  onDownload,
  onRetake,
  onClose,
  isUploading = false,
}: ScreenshotPreviewProps) {
  const [formData, setFormData] = useState({
    name: screenshot.filename.replace(/\.[^/.]+$/, ""),
    description: "",
    url: "",
    selectedCase: screenshot.caseId,
  });

  const [uploadState, setUploadState] = useState<{
    isUploading: boolean;
    progress: UploadProgress | null;
    result: UploadResult | null;
    error: string | null;
  }>({
    isUploading: false,
    progress: null,
    result: null,
    error: null,
  });

  // Auto-detect current page URL
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.url) {
          setFormData(prev => ({ ...prev, url: tabs[0].url! }));
        }
      });
    }
  }, []);

  // Generate unique snapshot ID
  const snapshotId = `Snapshot ${Math.floor(Math.random() * 100000000)}`;

  const handleCloseClick = () => {
    onClose();
  };

  const handleCancelClick = () => {
    onClose();
  };

  const handleAddToCaseClick = async () => {
    if (!formData.name.trim()) {
      alert('Please enter a name for the screenshot');
      return;
    }

    if (uploadState.isUploading) return;

    setUploadState({
      isUploading: true,
      progress: null,
      result: null,
      error: null,
    });

    try {
      let blob = screenshot.blob;
      if (!blob) {
        // Convert dataUrl to blob if not available
        const response = await fetch(screenshot.dataUrl);
        blob = await response.blob();
      }

      const result = await s3Service.uploadFile(
        blob,
        screenshot.filename,
        formData.selectedCase,
        "screenshot",
        {
          onProgress: (progress) => {
            setUploadState((prev) => ({
              ...prev,
              progress,
            }));
          },
          onSuccess: (result) => {
            setUploadState((prev) => ({
              ...prev,
              isUploading: false,
              result,
            }));
          },
          onError: (error) => {
            setUploadState((prev) => ({
              ...prev,
              isUploading: false,
              error,
            }));
          },
          tags: ["screenshot", "capture", formData.name],
          metadata: {
            capturedAt: screenshot.timestamp,
            originalFilename: screenshot.filename,
            description: formData.description,
            sourceUrl: formData.url,
            captureType: screenshot.type,
            caseName: formData.name,
          },
        }
      );

      if (result.success) {
        // Update case metadata
        try {
          const caseData = await caseService.getCaseById(formData.selectedCase);
          if (caseData && caseData.metadata) {
            await caseService.updateCaseMetadata(formData.selectedCase, {
              totalScreenshots: (caseData.metadata.totalScreenshots || 0) + 1,
              totalFileSize: (caseData.metadata.totalFileSize || 0) + blob.size,
              lastActivity: new Date().toISOString(),
            });
          }
        } catch (error) {
          console.error("Failed to update case metadata:", error);
        }

        alert(`Screenshot "${formData.name}" added to case ${formData.selectedCase} successfully!`);
        onSave();
      }
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadState((prev) => ({
        ...prev,
        isUploading: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      }));
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, name: e.target.value }));
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, description: e.target.value }));
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, url: e.target.value }));
  };

  const handleCaseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, selectedCase: e.target.value }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">{snapshotId}</h2>
          
          <button
            onClick={handleCloseClick}
            disabled={uploadState.isUploading}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 hover:bg-gray-100 rounded"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Upload Progress */}
        {uploadState.isUploading && uploadState.progress && (
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-200">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-blue-700 font-medium">
                Uploading to S3... {uploadState.progress.percentage}%
              </span>
              {uploadState.progress.speed && (
                <span className="text-blue-600">
                  {Math.round(uploadState.progress.speed / 1024)} KB/s
                </span>
              )}
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadState.progress.percentage}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Success/Error Messages */}
        {uploadState.result && (
          <div className="px-4 py-3 bg-green-50 border-b border-green-200">
            <div className="flex items-center text-sm text-green-700">
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">Successfully uploaded to S3</span>
            </div>
          </div>
        )}

        {uploadState.error && (
          <div className="px-4 py-3 bg-red-50 border-b border-red-200">
            <div className="flex items-center text-sm text-red-700">
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>Upload failed: {uploadState.error}</span>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Side - Screenshot */}
          <div className="flex-1 p-4 bg-gray-100 flex items-center justify-center">
            <div className="max-w-full max-h-full">
              <img
                src={screenshot.dataUrl}
                alt="Screenshot preview"
                className="max-w-full max-h-full object-contain rounded border border-gray-300 bg-white shadow-sm"
                style={{ maxHeight: 'calc(90vh - 200px)' }}
              />
            </div>
          </div>

          {/* Right Side - Details Form */}
          <div className="w-80 bg-white border-l border-gray-200 flex flex-col">
            {/* Details Header */}
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Details</h3>
            </div>

            {/* Form */}
            <div className="flex-1 p-4 space-y-4">
              {/* Name Field */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  id="name"
                  value={formData.name}
                  onChange={handleNameChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter name"
                  disabled={uploadState.isUploading}
                />
              </div>

              {/* Description Field */}
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={handleDescriptionChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter description"
                  disabled={uploadState.isUploading}
                />
              </div>

              {/* URL Field */}
              <div>
                <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-1">
                  URL
                </label>
                <input
                  type="url"
                  id="url"
                  value={formData.url}
                  onChange={handleUrlChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter URL"
                  disabled={uploadState.isUploading}
                />
              </div>

              {/* Case Dropdown */}
              <div>
                <label htmlFor="case" className="block text-sm font-medium text-gray-700 mb-1">
                  Case
                </label>
                <select
                  id="case"
                  value={formData.selectedCase}
                  onChange={handleCaseChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  disabled={uploadState.isUploading}
                >
                  {mockCases.map((case_) => (
                    <option key={case_.id} value={case_.id}>
                      {case_.id} - {case_.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-4 border-t border-gray-200 flex space-x-3">
              <button
                onClick={handleCancelClick}
                disabled={uploadState.isUploading}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded-md text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={handleAddToCaseClick}
                disabled={!formData.name.trim() || uploadState.isUploading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                {uploadState.isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Adding...
                  </>
                ) : uploadState.result ? (
                  <>
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Added
                  </>
                ) : (
                  'Add to case'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}