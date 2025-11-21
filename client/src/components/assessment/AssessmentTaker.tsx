import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle, AlertCircle } from "lucide-react";
import { Block, Assessment } from "@shared/schema";
import AudioRecorder, { type AudioRecording } from "../builder/AudioRecorder";
import VideoRecorder from "../builder/VideoRecorder";
import CodingBlock from "../builder/CodingBlock";
import LaTeXBlock from "../builder/LaTeXBlock";
import katex from "katex";
import "katex/dist/katex.min.css";
import ProctoringCamera from "./ProctoringCamera";

// Helper component for displaying LaTeX example preview
function LaTeXExamplePreview({ latex, displayMode }: { latex: string; displayMode: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!ref.current || !latex) {
      if (ref.current) {
        ref.current.innerHTML = '<div class="text-gray-400 italic">No example</div>';
      }
      return;
    }
    
    try {
      // Clean up LaTeX input - remove display mode delimiters if present
      let cleanedInput = latex.trim();
      
      // Remove \[ and \] delimiters
      cleanedInput = cleanedInput.replace(/^\\\[/, '').replace(/\\\]$/, '');
      // Remove $$ delimiters
      cleanedInput = cleanedInput.replace(/^\$\$/, '').replace(/\$\$$/, '');
      cleanedInput = cleanedInput.trim();
      
      // Determine display mode from delimiters if not explicitly set
      let actualDisplayMode = displayMode;
      if (latex.includes('\\[') || latex.includes('$$')) {
        actualDisplayMode = true;
      } else if (latex.includes('\\(') || (latex.includes('$') && !latex.startsWith('$$'))) {
        actualDisplayMode = false;
      }
      
      katex.render(cleanedInput, ref.current, {
        throwOnError: false,
        displayMode: actualDisplayMode,
        errorColor: "#cc0000",
      });
    } catch (error: any) {
      if (ref.current) {
        ref.current.innerHTML = `<span class="text-red-600 text-sm">Error: ${error.message || "Invalid LaTeX"}</span>`;
      }
    }
  }, [latex, displayMode]);
  
  return <div ref={ref} className={displayMode ? "text-center" : ""} />;
}

interface AssessmentTakerProps {
  publicUrl: string;
}

export default function AssessmentTaker({ publicUrl }: AssessmentTakerProps) {
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [timeRemaining, setTimeRemaining] = useState<Record<string, number>>({});
  const [expiredBlocks, setExpiredBlocks] = useState<Set<string>>(new Set()); // Track blocks that have expired
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [showStartScreen, setShowStartScreen] = useState(true);
  const [showConsentScreen, setShowConsentScreen] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [integrityViolations, setIntegrityViolations] = useState<{
    copyAttempts: number;
    pasteAttempts: Array<{ blockId: string; timestamp: string; attemptedContent: string }>;
  }>({
    copyAttempts: 0,
    pasteAttempts: [],
  });
  const [proctoringViolations, setProctoringViolations] = useState<{
    lookAway: Array<{ timestamp: string }>;
    multipleFaces: Array<{ timestamp: string }>;
  }>({
    lookAway: [],
    multipleFaces: [],
  });
  const [violationNotification, setViolationNotification] = useState<string | null>(null);
  const [showTimeUpModal, setShowTimeUpModal] = useState(false);
  const [timeUpIsLastBlock, setTimeUpIsLastBlock] = useState(false);

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
        } else if (block.type === "coding_block") {
          responseData.code = response;
        } else if (block.type === "latex_block") {
          responseData.latex = response;
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

      // Prepare integrity violations including proctoring
      const hasViolations = integrityViolations.copyAttempts > 0 || integrityViolations.pasteAttempts.length > 0;
      const hasProctoringViolations = proctoringViolations.lookAway.length > 0 || proctoringViolations.multipleFaces.length > 0;
      
      const integrityViolationsData: any = {};
      if (hasViolations) {
        integrityViolationsData.copyAttempts = integrityViolations.copyAttempts;
        integrityViolationsData.pasteAttempts = integrityViolations.pasteAttempts;
      }
      if (hasProctoringViolations) {
        integrityViolationsData.proctoring = proctoringViolations;
      }

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
          integrityViolations: (hasViolations || hasProctoringViolations) ? integrityViolationsData : undefined,
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
  
  // Check if previous block has expired
  const prevBlockIndex = !isFirstBlock ? getPreviousBlockIndex(currentBlockIndex) : -1;
  const prevBlock = prevBlockIndex >= 0 ? blocks[prevBlockIndex] : null;
  const isPreviousBlockExpired = prevBlock?.id ? expiredBlocks.has(prevBlock.id) : false;

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
            // Mark this block as expired
            if (currentBlock.id) {
              setExpiredBlocks(prev => new Set(prev).add(currentBlock.id!));
            }
            const nextIdx = getNextBlockIndex(currentBlockIndex);
            const isLast = nextIdx === currentBlockIndex;
            setTimeUpIsLastBlock(isLast);
            setShowTimeUpModal(true);
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
      const prevBlock = blocks[prevIdx];
      // Prevent going back to expired blocks
      if (prevBlock?.id && expiredBlocks.has(prevBlock.id)) {
        alert("You cannot go back to a question that has already expired.");
        return;
      }
      setCurrentBlockIndex(prevIdx);
    }
  };

  const updateResponse = (blockId: string, value: any) => {
    // Prevent updating responses for expired blocks
    if (expiredBlocks.has(blockId)) {
      console.warn("Attempted to update response for expired block:", blockId);
      return;
    }
    setResponses(prev => ({ ...prev, [blockId]: value }));
  };

  // Handle copy/paste prevention
  const handleCopyPrevention = (block: Block, e: ClipboardEvent) => {
    if (block.config?.preventCopyPaste) {
      e.preventDefault();
      e.clipboardData?.setData('text/plain', '');
      
      setIntegrityViolations(prev => ({
        ...prev,
        copyAttempts: prev.copyAttempts + 1,
      }));
      
      setViolationNotification("Copying is not allowed for this question.");
      setTimeout(() => setViolationNotification(null), 3000);
    }
  };

  const handlePastePrevention = async (block: Block, e: ClipboardEvent) => {
    if (block.config?.preventCopyPaste) {
      e.preventDefault();
      
      const pastedContent = e.clipboardData?.getData('text/plain') || '';
      
      setIntegrityViolations(prev => ({
        ...prev,
        pasteAttempts: [
          ...prev.pasteAttempts,
          {
            blockId: block.id || '',
            timestamp: new Date().toISOString(),
            attemptedContent: pastedContent,
          },
        ],
      }));
      
      setViolationNotification("Pasting is not allowed for this question.");
      setTimeout(() => setViolationNotification(null), 3000);
    }
  };

  // Set up copy/paste prevention for current block
  useEffect(() => {
    if (!currentBlock || showStartScreen) return;
    
    const block = currentBlock;
    if (!block.config?.preventCopyPaste) return;

    const handleCopy = (e: ClipboardEvent) => handleCopyPrevention(block, e);
    const handlePaste = (e: ClipboardEvent) => handlePastePrevention(block, e);
    const handleCut = (e: ClipboardEvent) => {
      // Treat cut as copy
      handleCopyPrevention(block, e);
    };

    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('cut', handleCut);

    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('cut', handleCut);
    };
  }, [currentBlock, showStartScreen]);

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
          <div 
            className="space-y-3"
            onCopy={(e) => {
              if (block.config?.preventCopyPaste) {
                e.preventDefault();
                handleCopyPrevention(block, e.nativeEvent as ClipboardEvent);
              }
            }}
            onPaste={(e) => {
              if (block.config?.preventCopyPaste) {
                e.preventDefault();
                handlePastePrevention(block, e.nativeEvent as ClipboardEvent);
              }
            }}
            onCut={(e) => {
              if (block.config?.preventCopyPaste) {
                e.preventDefault();
                handleCopyPrevention(block, e.nativeEvent as ClipboardEvent);
              }
            }}
          >
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
          <div 
            className="space-y-3"
            onCopy={(e) => {
              if (block.config?.preventCopyPaste) {
                e.preventDefault();
                handleCopyPrevention(block, e.nativeEvent as ClipboardEvent);
              }
            }}
            onPaste={(e) => {
              if (block.config?.preventCopyPaste) {
                e.preventDefault();
                handlePastePrevention(block, e.nativeEvent as ClipboardEvent);
              }
            }}
            onCut={(e) => {
              if (block.config?.preventCopyPaste) {
                e.preventDefault();
                handleCopyPrevention(block, e.nativeEvent as ClipboardEvent);
              }
            }}
          >
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
            onCopy={(e) => {
              if (block.config?.preventCopyPaste) {
                e.preventDefault();
                handleCopyPrevention(block, e.nativeEvent as ClipboardEvent);
              }
            }}
            onPaste={(e) => {
              if (block.config?.preventCopyPaste) {
                e.preventDefault();
                handlePastePrevention(block, e.nativeEvent as ClipboardEvent);
              }
            }}
            onCut={(e) => {
              if (block.config?.preventCopyPaste) {
                e.preventDefault();
                handleCopyPrevention(block, e.nativeEvent as ClipboardEvent);
              }
            }}
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
              onCopy={block.config?.preventCopyPaste ? (e) => handleCopyPrevention(block, e) : undefined}
              onPaste={block.config?.preventCopyPaste ? (e) => handlePastePrevention(block, e) : undefined}
              onCut={block.config?.preventCopyPaste ? (e) => handleCopyPrevention(block, e) : undefined}
            />
          </div>
        )}

        {/* LaTeX Block */}
        {block.type === "latex_block" && (
          <div className="space-y-4">
            {block.config?.latexExample && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-900 mb-2">Example LaTeX:</p>
                <div className="text-sm text-blue-800 font-mono mb-2">{block.config.latexExample}</div>
                <div className="text-xs text-blue-700 italic mb-2">Preview:</div>
                <div className="p-3 bg-white rounded border border-blue-200">
                  <LaTeXExamplePreview latex={block.config.latexExample} displayMode={block.config?.displayMode || false} />
                </div>
              </div>
            )}
            <LaTeXBlock
              value={responses[block.id || ''] || ''}
              onChange={(value) => updateResponse(block.id || '', value)}
              displayMode={block.config?.displayMode || false}
              height="300px"
              onCopy={block.config?.preventCopyPaste ? (e) => handleCopyPrevention(block, e) : undefined}
              onPaste={block.config?.preventCopyPaste ? (e) => handlePastePrevention(block, e) : undefined}
              onCut={block.config?.preventCopyPaste ? (e) => handleCopyPrevention(block, e) : undefined}
            />
          </div>
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
              setShowConsentScreen(true);
            }}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (showConsentScreen) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-2xl w-full">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Proctoring Consent</h1>
          
          <div className="space-y-4 mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800 mb-3">
                <strong>Important:</strong> This assessment uses proctoring technology to ensure assessment integrity.
              </p>
              <div className="space-y-2 text-sm text-blue-800">
                <p>• Your video feed will be monitored during the assessment for proctoring purposes</p>
                <p>• Your audio feed may also be monitored during the assessment</p>
                <p>• Your video and/or audio may be stored for fraud prevention purposes</p>
              </div>
            </div>

            <div className="border border-gray-300 rounded-lg p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentGiven}
                  onChange={(e) => setConsentGiven(e.target.checked)}
                  className="mt-1 w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    I acknowledge and authorize Invisible Technologies to record video and/or audio during this assessment for proctoring and fraud prevention purposes.
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    By checking this box, you consent to the recording and storage of your video and/or audio feed as described above.
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowConsentScreen(false);
                setShowStartScreen(true);
              }}
              className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
            >
              Back
            </button>
            <button
              onClick={() => {
                if (!consentGiven) {
                  alert("Please acknowledge and authorize the recording by checking the consent box");
                  return;
                }
                setShowConsentScreen(false);
              }}
              disabled={!consentGiven}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Start Assessment
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentBlock) {
    return null;
  }

  // Handle time up modal actions
  const handleTimeUpContinue = () => {
    setShowTimeUpModal(false);
    const nextIdx = getNextBlockIndex(currentBlockIndex);
    if (nextIdx !== currentBlockIndex) {
      setCurrentBlockIndex(nextIdx);
    }
  };

  const handleTimeUpSubmit = () => {
    setShowTimeUpModal(false);
    submitAssessment.mutate();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Time Up Modal */}
      {showTimeUpModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-md mx-4">
            <div className="text-center">
              <div className="text-6xl mb-4">⏱️</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Time's Up!</h2>
              {timeUpIsLastBlock ? (
                <>
                  <p className="text-gray-600 mb-6">
                    Your time for this question has expired. The assessment will now be submitted.
                  </p>
                  <button
                    onClick={handleTimeUpSubmit}
                    className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                  >
                    Submit Assessment
                  </button>
                </>
              ) : (
                <>
                  <p className="text-gray-600 mb-6">
                    Your time for this question has expired. We'll now move to the next question.
                  </p>
                  <button
                    onClick={handleTimeUpContinue}
                    className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                  >
                    Continue to Next Question
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
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

      {/* Violation Notification */}
      {violationNotification && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle className="w-5 h-5" />
              <span className="text-sm font-medium">{violationNotification}</span>
            </div>
          </div>
        </div>
      )}

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
            disabled={isFirstBlock || isPreviousBlockExpired}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              isFirstBlock || isPreviousBlockExpired
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

      {/* Proctoring Camera */}
      {!showStartScreen && !showConsentScreen && !submitted && currentBlock?.type !== "video_response" && (
        <ProctoringCamera
          key={`camera-${consentGiven ? 'active' : 'inactive'}-${currentBlock?.id}`}
          isActive={!showStartScreen && !showConsentScreen && !submitted && currentBlock?.type !== "video_response"}
          blockId={currentBlock?.id}
          consentGiven={consentGiven}
          onViolation={(type, timestamp) => {
            if (type === "lookAway") {
              setProctoringViolations((prev) => ({
                ...prev,
                lookAway: [...prev.lookAway, { timestamp: timestamp.toISOString() }],
              }));
            } else if (type === "multipleFaces") {
              setProctoringViolations((prev) => ({
                ...prev,
                multipleFaces: [...prev.multipleFaces, { timestamp: timestamp.toISOString() }],
              }));
            }
          }}
        />
      )}
    </div>
  );
}

