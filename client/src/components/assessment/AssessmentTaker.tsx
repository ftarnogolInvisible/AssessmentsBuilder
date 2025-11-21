import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle, AlertCircle } from "lucide-react";
import { Block, Assessment } from "@shared/schema";
import AudioRecorder, { type AudioRecording } from "../builder/AudioRecorder";
import VideoRecorder from "../builder/VideoRecorder";

interface AssessmentTakerProps {
  publicUrl: string;
}

export default function AssessmentTaker({ publicUrl }: AssessmentTakerProps) {
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [timeRemaining, setTimeRemaining] = useState<Record<string, number>>({});
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [showStartScreen, setShowStartScreen] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  // Fetch assessment by public URL
  const { data: assessmentData, isLoading, error } = useQuery<Assessment & { blocks: Block[] }>({
    queryKey: ["assessment", publicUrl],
    queryFn: async () => {
      const res = await fetch(`/api/assessment/${publicUrl}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Assessment not found");
        if (res.status === 403) throw new Error("Assessment is not published");
        throw new Error("Failed to load assessment");
      }
      return res.json();
    },
  });

  // Helper function to convert blob to base64 data URL
  const blobToDataURL = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Submit assessment mutation
  const submitAssessment = useMutation({
    mutationFn: async () => {
      if (!assessmentData) throw new Error("Assessment not loaded");
      
      console.log("[AssessmentTaker] Preparing submission with responses:", responses);
      
      // Prepare responses for submission
      const responsePromises = assessmentData.blocks.map(async (block) => {
        const response = responses[block.id || ''];
        if (!response) {
          console.log(`[AssessmentTaker] No response for block ${block.id} (${block.type})`);
          return null;
        }

        let responseData: any = {};
        
        if (block.type === "multiple_choice") {
          responseData.selectedOptionId = response;
        } else if (block.type === "multi_select") {
          responseData.selectedOptionIds = Array.isArray(response) ? response : [];
        } else if (block.type === "audio_response" || block.type === "video_response") {
          // Convert blob to base64 data URL for JSON serialization
          if (response.blob) {
            try {
              const dataUrl = await blobToDataURL(response.blob);
              responseData.mediaDataUrl = dataUrl; // Store as base64 data URL
              responseData.mediaType = block.type === "audio_response" ? "audio" : "video";
              if (response.metadata?.durationSec) {
                responseData.duration = response.metadata.durationSec;
              }
            } catch (error) {
              console.error(`[AssessmentTaker] Failed to convert blob for block ${block.id}:`, error);
              // Fallback: try to use URL if available
              if (response.url) {
                responseData.mediaUrl = response.url;
                responseData.mediaType = block.type === "audio_response" ? "audio" : "video";
              }
            }
          } else if (response.url) {
            // Fallback to URL if blob not available
            responseData.mediaUrl = response.url;
            responseData.mediaType = block.type === "audio_response" ? "audio" : "video";
            if (response.metadata?.durationSec) {
              responseData.duration = response.metadata.durationSec;
            }
          }
        } else if (block.type === "free_text") {
          responseData.text = response;
        }

        return {
          blockId: block.id,
          responseData,
          score: null, // Will be calculated server-side for auto-graded questions
          maxScore: block.config?.points || null,
        };
      });

      const responseData = (await Promise.all(responsePromises)).filter(Boolean);
      
      console.log(`[AssessmentTaker] Submitting ${responseData.length} responses`);

      const res = await fetch(`/api/assessment/${publicUrl}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email || null,
          firstName: firstName || null,
          lastName: lastName || null,
          name: firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || null, // Legacy field
          responses: responseData,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Failed to submit assessment" }));
        console.error("[AssessmentTaker] Submission error:", errorData);
        throw new Error(errorData.error || `Failed to submit assessment: ${res.status}`);
      }

      const result = await res.json();
      console.log("[AssessmentTaker] Submission successful:", result);
      return result;
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (error) => {
      console.error("[AssessmentTaker] Submission failed:", error);
      alert(`Failed to submit assessment: ${error instanceof Error ? error.message : "Unknown error"}`);
    },
  });

  const blocks = assessmentData?.blocks || [];
  const currentBlock = blocks[currentBlockIndex];

  // Group blocks by groupId for stacked display
  const getGroupedBlocks = (index: number): Block[] => {
    const block = blocks[index];
    if (!block || !block.groupId) {
      return [block];
    }
    return blocks.filter(b => b.groupId === block.groupId);
  };

  const currentBlockGroup = getGroupedBlocks(currentBlockIndex);

  // Calculate navigation
  const getNextBlockIndex = (currentIdx: number): number => {
    if (currentIdx >= blocks.length - 1) return currentIdx;
    const current = blocks[currentIdx];
    if (current.groupId) {
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
    if (currentBlock?.timeLimitSeconds && !showStartScreen) {
      setTimeRemaining(prev => ({
        ...prev,
        [currentBlock.id || '']: currentBlock.timeLimitSeconds!
      }));

      const timer = setInterval(() => {
        setTimeRemaining(prev => {
          const remaining = (prev[currentBlock.id || ''] || currentBlock.timeLimitSeconds!) - 1;
          if (remaining <= 0) {
            clearInterval(timer);
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
  }, [currentBlockIndex, currentBlock, showStartScreen]);

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

  const canProceed = () => {
    if (!currentBlock) return false;
    if (!currentBlock.required) return true;
    return responses[currentBlock.id || ''] !== undefined && responses[currentBlock.id || ''] !== null && responses[currentBlock.id || ''] !== '';
  };

  const renderBlockContent = (block: Block) => {
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
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading assessment...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2 text-center">Error</h2>
          <p className="text-gray-600 text-center">
            {error instanceof Error ? error.message : "Failed to load assessment"}
          </p>
        </div>
      </div>
    );
  }

  if (!assessmentData) {
    return null;
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Thank You!</h2>
          <p className="text-gray-600">
            Your assessment has been submitted successfully.
          </p>
        </div>
      </div>
    );
  }

  if (showStartScreen) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-2xl w-full">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{assessmentData.name}</h1>
          {assessmentData.description && (
            <p className="text-gray-600 mb-6">{assessmentData.description}</p>
          )}
          
          <div className="space-y-4 mb-6">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>Instructions:</strong> This assessment contains {blocks.length} {blocks.length === 1 ? 'question' : 'questions'}. 
                Please answer all required questions before submitting.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              if (!email) {
                alert("Please enter your email address");
                return;
              }
              if (!firstName) {
                alert("Please enter your first name");
                return;
              }
              if (!lastName) {
                alert("Please enter your last name");
                return;
              }
              setShowStartScreen(false);
            }}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Start Assessment
          </button>
        </div>
      </div>
    );
  }

  if (!currentBlock) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-xl font-semibold text-gray-900">{assessmentData.name}</h1>
          <p className="text-sm text-gray-600 mt-1">
            Question {currentBlockIndex + 1} of {blocks.length}
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-2">
        <div className="max-w-4xl mx-auto">
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
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

          {/* Block Content */}
          {currentBlockGroup.length > 1 ? (
            <div className="space-y-6">
              {currentBlockGroup.map((block) => (
                <div key={block.id} className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                  {block.title && (
                    <h3 className="text-xl font-semibold text-gray-900 mb-3">{block.title}</h3>
                  )}
                  {block.instructions && (
                    <p className="text-gray-700 mb-4 text-sm whitespace-pre-wrap">{block.instructions}</p>
                  )}
                  {block.type === "media_stimulus" && block.config?.mediaItems && (
                    <div className="mb-6">
                      <div className={`grid gap-4 ${
                        block.config.mediaItems.length === 1 ? 'grid-cols-1' :
                        block.config.mediaItems.length === 2 ? 'grid-cols-2' :
                        block.config.mediaItems.length === 3 ? 'grid-cols-3' :
                        'grid-cols-4'
                      }`}>
                        {block.config.mediaItems.map((item, idx) => (
                          <div key={item.id || idx} className="space-y-2">
                            {item.title && (
                              <h4 className="text-sm font-semibold text-gray-900">{item.title}</h4>
                            )}
                            {item.mediaUrl && (
                              <>
                                {item.mediaType === "image" && (
                                  <img src={item.mediaUrl} alt={item.title || `Stimulus ${idx + 1}`} className="w-full rounded-lg border border-gray-300" />
                                )}
                                {item.mediaType === "video" && (
                                  <video src={item.mediaUrl} controls className="w-full rounded-lg border border-gray-300" />
                                )}
                                {item.mediaType === "audio" && (
                                  <audio src={item.mediaUrl} controls className="w-full" />
                                )}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {renderBlockContent(block)}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              {currentBlock.title && (
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">{currentBlock.title}</h3>
              )}
              {currentBlock.instructions && (
                <p className="text-gray-700 mb-6 whitespace-pre-wrap">{currentBlock.instructions}</p>
              )}
              {currentBlock.required && (
                <div className="mb-4">
                  <span className="inline-block px-3 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded">
                    Required
                  </span>
                </div>
              )}
              {currentBlock.type === "media_stimulus" && currentBlock.config?.mediaItems && (
                <div className="mb-6">
                  <div className={`grid gap-4 ${
                    currentBlock.config.mediaItems.length === 1 ? 'grid-cols-1' :
                    currentBlock.config.mediaItems.length === 2 ? 'grid-cols-2' :
                    currentBlock.config.mediaItems.length === 3 ? 'grid-cols-3' :
                    'grid-cols-4'
                  }`}>
                    {currentBlock.config.mediaItems.map((item, idx) => (
                      <div key={item.id || idx} className="space-y-2">
                        {item.title && (
                          <h4 className="text-sm font-semibold text-gray-900">{item.title}</h4>
                        )}
                        {item.mediaUrl && (
                          <>
                            {item.mediaType === "image" && (
                              <img src={item.mediaUrl} alt={item.title || `Stimulus ${idx + 1}`} className="w-full rounded-lg border border-gray-300" />
                            )}
                            {item.mediaType === "video" && (
                              <video src={item.mediaUrl} controls className="w-full rounded-lg border border-gray-300" />
                            )}
                            {item.mediaType === "audio" && (
                              <audio src={item.mediaUrl} controls className="w-full" />
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {renderBlockContent(currentBlock)}
            </div>
          )}
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
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
                // Validate required fields
                const missingRequired = blocks.filter(block => 
                  block.required && (!responses[block.id || ''] || responses[block.id || ''] === '')
                );
                if (missingRequired.length > 0) {
                  alert(`Please complete all required questions: ${missingRequired.map(b => b.title || 'Question').join(', ')}`);
                  return;
                }
                
                // Check if we have any responses at all
                const responseCount = Object.keys(responses).filter(key => {
                  const response = responses[key];
                  return response !== null && response !== undefined && response !== '';
                }).length;
                
                if (responseCount === 0) {
                  alert("Please answer at least one question before submitting.");
                  return;
                }
                
                console.log(`[AssessmentTaker] Submitting with ${responseCount} responses`);
                submitAssessment.mutate();
              }}
              disabled={submitAssessment.isPending}
              className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitAssessment.isPending ? "Submitting..." : "Submit Assessment"}
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                canProceed()
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
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

