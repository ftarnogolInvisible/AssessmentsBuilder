import { useState, useEffect, Component, ErrorInfo, ReactNode } from "react";
import { X, ArrowLeft, ArrowRight } from "lucide-react";
import { Block } from "@shared/schema";
import AudioRecorder, { type AudioRecording } from "./AudioRecorder";
import VideoRecorder from "./VideoRecorder";
import CodingBlock from "./CodingBlock";
import LaTeXBlock from "./LaTeXBlock";
import "katex/dist/katex.min.css";

// Error Boundary component
class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[PreviewMode] Error caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 font-medium">Error rendering component</p>
          <p className="text-red-600 text-sm mt-1">{this.state.error?.message || "Unknown error"}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// Safe wrapper for LaTeXBlock to catch rendering errors
function SafeLaTeXBlock(props: Parameters<typeof LaTeXBlock>[0]) {
  // Ensure value is always a string
  const safeProps = {
    ...props,
    value: props.value || "",
  };
  
  return (
    <ErrorBoundary fallback={
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-yellow-800 font-medium">LaTeX Block Error</p>
        <p className="text-yellow-600 text-sm mt-1">Unable to render LaTeX block. Please check the console for details.</p>
      </div>
    }>
      <LaTeXBlock {...safeProps} />
    </ErrorBoundary>
  );
}

interface PreviewModeProps {
  blocks: Block[];
  assessmentName?: string;
  onClose: () => void;
}

export default function PreviewMode({ blocks, assessmentName, onClose }: PreviewModeProps) {
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [timeRemaining, setTimeRemaining] = useState<Record<string, number>>({});

  // Group blocks by groupId for stacked display
  const getGroupedBlocks = (index: number): Block[] => {
    const block = blocks[index];
    if (!block || !block.groupId) {
      return [block];
    }
    // Return all blocks in the same group
    return blocks.filter(b => b.groupId === block.groupId);
  };

  // Get the current block group
  const currentBlockGroup = getGroupedBlocks(currentBlockIndex);
  const currentBlock = blocks[currentBlockIndex];
  
  // Calculate navigation - skip grouped blocks
  const getNextBlockIndex = (currentIdx: number): number => {
    if (currentIdx >= blocks.length - 1) return currentIdx;
    const current = blocks[currentIdx];
    if (current.groupId) {
      // Find the last block in this group
      const groupBlocks = blocks.filter(b => b.groupId === current.groupId);
      const lastInGroup = groupBlocks[groupBlocks.length - 1];
      const lastIndex = blocks.findIndex(b => b.id === lastInGroup.id);
      return lastIndex + 1 < blocks.length ? lastIndex + 1 : currentIdx;
    }
    return currentIdx + 1;
  };

  const getPreviousBlockIndex = (currentIdx: number): number => {
    if (currentIdx <= 0) return 0;
    const current = blocks[currentIdx];
    if (current.groupId) {
      // Find the first block in this group
      const groupBlocks = blocks.filter(b => b.groupId === current.groupId);
      const firstInGroup = groupBlocks[0];
      const firstIndex = blocks.findIndex(b => b.id === firstInGroup.id);
      return firstIndex > 0 ? firstIndex - 1 : 0;
    }
    return currentIdx - 1;
  };

  const isFirstBlock = currentBlockIndex === 0;
  const isLastBlock = getNextBlockIndex(currentBlockIndex) === currentBlockIndex;

  // Timer for blocks with time limits
  useEffect(() => {
    if (currentBlock?.timeLimitSeconds) {
      setTimeRemaining(prev => ({
        ...prev,
        [currentBlock.id || '']: currentBlock.timeLimitSeconds!
      }));

      const timer = setInterval(() => {
        setTimeRemaining(prev => {
          const remaining = (prev[currentBlock.id || ''] || currentBlock.timeLimitSeconds!) - 1;
          if (remaining <= 0) {
            clearInterval(timer);
            // Auto-advance or submit when time runs out
            const nextIdx = getNextBlockIndex(currentBlockIndex);
            if (nextIdx !== currentBlockIndex) {
              setCurrentBlockIndex(nextIdx);
            }
            return { ...prev, [currentBlock.id || '']: 0 };
          }
          return { ...prev, [currentBlock.id || '']: remaining };
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [currentBlockIndex, currentBlock]);

  const handleNext = () => {
    if (!isLastBlock) {
      const nextIdx = getNextBlockIndex(currentBlockIndex);
      setCurrentBlockIndex(nextIdx);
    }
  };

  const handlePrevious = () => {
    if (!isFirstBlock) {
      const prevIdx = getPreviousBlockIndex(currentBlockIndex);
      setCurrentBlockIndex(prevIdx);
    }
  };

  const updateResponse = (blockId: string, value: any) => {
    setResponses(prev => ({ ...prev, [blockId]: value }));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Render block content (questions, inputs, etc.)
  const renderBlockContent = (block: Block) => {
    if (!block) {
      return <div className="text-gray-500">No block content</div>;
    }
    
    try {
      return (
        <div className="space-y-4">
        {/* Multiple Choice */}
        {block.type === "multiple_choice" && (
          <div className="space-y-3">
            {block.config?.options?.map((option, index) => (
              <label
                key={index}
                className="flex items-center gap-3 p-4 border border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-colors"
              >
                <input
                  type="radio"
                  name={`block-${block.id}`}
                  value={option.value}
                  checked={responses[block.id || ''] === option.value}
                  onChange={() => updateResponse(block.id || '', option.value)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="flex-1">{option.label}</span>
              </label>
            ))}
          </div>
        )}

        {/* Multi-Select */}
        {block.type === "multi_select" && (
          <div className="space-y-3">
            {block.config?.options?.map((option, index) => (
              <label
                key={index}
                className="flex items-center gap-3 p-4 border border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={(responses[block.id || ''] || []).includes(option.value)}
                  onChange={(e) => {
                    const current = responses[block.id || ''] || [];
                    const updated = e.target.checked
                      ? [...current, option.value]
                      : current.filter((v: string) => v !== option.value);
                    updateResponse(block.id || '', updated);
                  }}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="flex-1">{option.label}</span>
              </label>
            ))}
          </div>
        )}

        {/* Free Text */}
        {block.type === "free_text" && (
          <textarea
            value={responses[block.id || ''] || ''}
            onChange={(e) => updateResponse(block.id || '', e.target.value)}
            placeholder={block.config?.placeholder || "Enter your response..."}
            rows={6}
            maxLength={block.config?.maxLength}
            minLength={block.config?.minLength}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        )}

        {/* Coding Block */}
        {block.type === "coding_block" && (
          <div className="space-y-4">
            {block.config?.example && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-900 mb-2">Example Code:</p>
                <pre className="text-xs text-blue-800 font-mono whitespace-pre-wrap overflow-x-auto">
                  {block.config.example}
                </pre>
              </div>
            )}
            <CodingBlock
              value={responses[block.id || ''] || ''}
              onChange={(value) => updateResponse(block.id || '', value)}
              language={block.config?.language || "javascript"}
              theme={block.config?.theme || "monokai"}
              fontSize={block.config?.fontSize || 14}
              showLineNumbers={block.config?.showLineNumbers !== false}
              readOnly={block.config?.readOnly || false}
              wrap={block.config?.wrap || false}
              height="400px"
            />
          </div>
        )}

        {/* LaTeX Block */}
        {block.type === "latex_block" && (
          <SafeLaTeXBlock
            value={responses[block.id || ''] || ''}
            onChange={(value) => updateResponse(block.id || '', value)}
            displayMode={block.config?.displayMode || false}
            height="300px"
          />
        )}

        {/* Audio Response */}
        {block.type === "audio_response" && (
          <div>
            {block.config?.scriptPdfUrl && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800 mb-2 block">
                  📄 Script Available
                </p>
                <a
                  href={block.config.scriptPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-700 underline"
                >
                  Open PDF script
                </a>
              </div>
            )}
            <AudioRecorder
              onRecordingComplete={(recording: AudioRecording) => {
                const url = URL.createObjectURL(recording.blob);
                updateResponse(block.id || '', { 
                  blob: recording.blob, 
                  url,
                  metadata: recording.metadata 
                });
              }}
              maxDurationSeconds={block.config?.maxDurationSeconds}
              minDurationSeconds={block.config?.minDurationSeconds}
            />
          </div>
        )}

        {/* Video Response */}
        {block.type === "video_response" && (
          <VideoRecorder
            onRecordingComplete={(blob) => {
              const url = URL.createObjectURL(blob);
              updateResponse(block.id || '', { blob, url });
            }}
            maxDurationSeconds={block.config?.maxDurationSeconds}
            minDurationSeconds={block.config?.minDurationSeconds}
          />
        )}
      </div>
      );
    } catch (error: any) {
      console.error("[PreviewMode] Error rendering block:", error);
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 font-medium">Error rendering block</p>
          <p className="text-red-600 text-sm mt-1">{error.message || "Unknown error"}</p>
        </div>
      );
    }
  };

  if (!currentBlock) {
    return (
      <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No blocks to preview</p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            Close Preview
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-50 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Preview Mode
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {assessmentName || "Assessment Preview"} • Block {currentBlockIndex + 1} of {blocks.length}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-2">
        <div className="flex items-center gap-2">
          {blocks.map((_, index) => (
            <div
              key={index}
              className={`flex-1 h-2 rounded-full ${
                index < currentBlockIndex
                  ? "bg-green-500"
                  : index === currentBlockIndex
                  ? "bg-blue-500"
                  : "bg-gray-200"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          {/* Time Limit Warning */}
          {currentBlock.timeLimitSeconds && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-amber-800">
                  ⏱️ Time Limit: {formatTime(currentBlock.timeLimitSeconds)}
                </span>
                {timeRemaining[currentBlock.id || ''] !== undefined && (
                  <span className="text-sm font-mono font-semibold text-amber-900">
                    {formatTime(timeRemaining[currentBlock.id || ''])}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Block Content - Show grouped blocks stacked vertically or single block */}
          {currentBlockGroup.length > 1 ? (
            // Render grouped blocks stacked vertically (one on top of the other)
            <div className="space-y-6">
              {currentBlockGroup.map((block) => (
                <div key={block.id} className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                  {block.title && (
                    <h3 className="text-xl font-semibold text-gray-900 mb-3">
                      {block.title}
                    </h3>
                  )}
                  {block.instructions && (
                    <p className="text-gray-700 mb-4 text-sm whitespace-pre-wrap">
                      {block.instructions}
                    </p>
                  )}
                  {/* Media Stimulus for grouped blocks */}
                  {block.type === "media_stimulus" && (
                    <div className="mb-6">
                      {(() => {
                        console.log("[PreviewMode] Grouped Media Stimulus block config:", block.config);
                        console.log("[PreviewMode] Grouped Media Items:", block.config?.mediaItems);
                        return null;
                      })()}
                      {block.config?.mediaItems && block.config.mediaItems.length > 0 ? (
                        <div className={`grid gap-4 ${
                          block.config.mediaItems.length === 1 ? 'grid-cols-1' :
                          block.config.mediaItems.length === 2 ? 'grid-cols-2' :
                          block.config.mediaItems.length === 3 ? 'grid-cols-3' :
                          'grid-cols-4'
                        }`}>
                          {block.config.mediaItems.map((item, idx) => (
                            <div key={item.id || idx} className="space-y-2">
                              {item.title && (
                                <h4 className="text-sm font-semibold text-gray-900 mb-1">
                                  {item.title}
                                </h4>
                              )}
                              {!item.mediaUrl ? (
                                <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg text-center text-gray-500 text-sm">
                                  No media uploaded for this item
                                </div>
                              ) : item.mediaType === "image" ? (
                                <img
                                  src={item.mediaUrl}
                                  alt={item.title || `Stimulus ${idx + 1}`}
                                  className="w-full rounded-lg border border-gray-300"
                                  onError={(e) => {
                                    console.error(`Failed to load image: ${item.mediaUrl}`, e);
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              ) : item.mediaType === "video" ? (
                                <video
                                  src={item.mediaUrl}
                                  controls
                                  className="w-full rounded-lg border border-gray-300"
                                  onError={(e) => {
                                    console.error(`Failed to load video: ${item.mediaUrl}`, e);
                                  }}
                                />
                              ) : item.mediaType === "audio" ? (
                                <audio
                                  src={item.mediaUrl}
                                  controls
                                  className="w-full"
                                  onError={(e) => {
                                    console.error(`Failed to load audio: ${item.mediaUrl}`, e);
                                  }}
                                />
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : block.config?.mediaUrl ? (
                        // Legacy single media support
                        <div>
                          {block.config.mediaType === "image" && (
                            <img
                              src={block.config.mediaUrl}
                              alt="Stimulus"
                              className="w-full rounded-lg border border-gray-300"
                            />
                          )}
                          {block.config.mediaType === "video" && (
                            <video
                              src={block.config.mediaUrl}
                              controls
                              className="w-full rounded-lg border border-gray-300"
                            />
                          )}
                          {block.config.mediaType === "audio" && (
                            <audio
                              src={block.config.mediaUrl}
                              controls
                              className="w-full"
                            />
                          )}
                        </div>
                      ) : (
                        <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg text-center text-gray-500 text-sm">
                          No media items configured
                        </div>
                      )}
                    </div>
                  )}
                  {renderBlockContent(block)}
                </div>
              ))}
            </div>
          ) : (
            // Render single block
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              {/* Block Title */}
              {currentBlock.title && (
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">
                  {currentBlock.title}
                </h3>
              )}

              {/* Instructions */}
              {currentBlock.instructions && (
                <p className="text-gray-700 mb-6 whitespace-pre-wrap">
                  {currentBlock.instructions}
                </p>
              )}

              {/* Required Badge */}
              {currentBlock.required && (
                <div className="mb-4">
                  <span className="inline-block px-3 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded">
                    Required
                  </span>
                </div>
              )}

              {/* Media Stimulus - Multiple Items */}
              {currentBlock.type === "media_stimulus" && (
                <div className="mb-6">
                  {(() => {
                    // Debug logging
                    console.log("[PreviewMode] Media Stimulus block config:", currentBlock.config);
                    console.log("[PreviewMode] Media Items:", currentBlock.config?.mediaItems);
                    return null;
                  })()}
                  {currentBlock.config?.mediaItems && currentBlock.config.mediaItems.length > 0 ? (
                    // Multiple media items side-by-side
                    <div className={`grid gap-4 ${
                      currentBlock.config.mediaItems.length === 1 ? 'grid-cols-1' :
                      currentBlock.config.mediaItems.length === 2 ? 'grid-cols-2' :
                      currentBlock.config.mediaItems.length === 3 ? 'grid-cols-3' :
                      'grid-cols-4'
                    }`}>
                      {currentBlock.config.mediaItems.map((item, idx) => (
                        <div key={item.id || idx} className="space-y-2">
                          {item.title && (
                            <h4 className="text-sm font-semibold text-gray-900 mb-1">
                              {item.title}
                            </h4>
                          )}
                          {!item.mediaUrl ? (
                            <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg text-center text-gray-500 text-sm">
                              No media uploaded for this item
                            </div>
                          ) : item.mediaType === "image" ? (
                            <img
                              src={item.mediaUrl}
                              alt={item.title || `Stimulus ${idx + 1}`}
                              className="w-full rounded-lg border border-gray-300"
                              onError={(e) => {
                                console.error(`Failed to load image: ${item.mediaUrl}`, e);
                                (e.target as HTMLImageElement).style.display = 'none';
                                const errorDiv = document.createElement('div');
                                errorDiv.className = 'p-4 border border-red-300 rounded-lg text-red-600 text-sm';
                                errorDiv.textContent = 'Failed to load image. The file may have been removed or the URL expired.';
                                (e.target as HTMLImageElement).parentElement?.appendChild(errorDiv);
                              }}
                            />
                          ) : item.mediaType === "video" ? (
                            <video
                              src={item.mediaUrl}
                              controls
                              className="w-full rounded-lg border border-gray-300"
                              onError={(e) => {
                                console.error(`Failed to load video: ${item.mediaUrl}`, e);
                                const video = e.target as HTMLVideoElement;
                                video.style.display = 'none';
                                const errorDiv = document.createElement('div');
                                errorDiv.className = 'p-4 border border-red-300 rounded-lg text-red-600 text-sm';
                                errorDiv.textContent = 'Failed to load video. The file may have been removed or the URL expired.';
                                video.parentElement?.appendChild(errorDiv);
                              }}
                            />
                          ) : item.mediaType === "audio" ? (
                            <audio
                              src={item.mediaUrl}
                              controls
                              className="w-full"
                              onError={(e) => {
                                console.error(`Failed to load audio: ${item.mediaUrl}`, e);
                                const audio = e.target as HTMLAudioElement;
                                audio.style.display = 'none';
                                const errorDiv = document.createElement('div');
                                errorDiv.className = 'p-4 border border-red-300 rounded-lg text-red-600 text-sm';
                                errorDiv.textContent = 'Failed to load audio. The file may have been removed or the URL expired.';
                                audio.parentElement?.appendChild(errorDiv);
                              }}
                            />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    // Legacy single media support
                    currentBlock.config?.mediaUrl && (
                      <div>
                        {currentBlock.config.mediaType === "image" && (
                          <img
                            src={currentBlock.config.mediaUrl}
                            alt="Stimulus"
                            className="w-full rounded-lg border border-gray-300"
                          />
                        )}
                        {currentBlock.config.mediaType === "video" && (
                          <video
                            src={currentBlock.config.mediaUrl}
                            controls
                            className="w-full rounded-lg border border-gray-300"
                          />
                        )}
                        {currentBlock.config.mediaType === "audio" && (
                          <audio
                            src={currentBlock.config.mediaUrl}
                            controls
                            className="w-full"
                          />
                        )}
                      </div>
                    )
                  )}
                </div>
              )}

              {renderBlockContent(currentBlock)}
            </div>
          )}
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button
            onClick={handlePrevious}
            disabled={isFirstBlock}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              isFirstBlock
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            Previous
          </button>

          <div className="text-sm text-gray-600">
            {currentBlockIndex + 1} / {blocks.length}
          </div>

          {isLastBlock ? (
            <button
              onClick={() => {
                console.log("Submit assessment:", responses);
                alert("Assessment submitted! (Preview mode - not actually saved)");
              }}
              className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Submit Assessment
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

