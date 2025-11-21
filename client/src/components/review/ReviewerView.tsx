import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Save, ChevronDown, ChevronRight, CheckCircle, XCircle } from "lucide-react";
import { AssessmentSubmission, BlockResponse, Block } from "@shared/schema";
// @ts-ignore - katex types
import * as katex from "katex";
import "katex/dist/katex.min.css";

interface ReviewerViewProps {
  submission: AssessmentSubmission;
  assessmentId: string;
  onClose: () => void;
}

// Helper component to render LaTeX
function LaTeXRenderer({ latex, displayMode }: { latex: string; displayMode: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!ref.current || !latex) {
      if (ref.current) {
        ref.current.innerHTML = '<span class="text-gray-400 italic">No LaTeX</span>';
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

export default function ReviewerView({ submission, assessmentId, onClose }: ReviewerViewProps) {
  const [notes, setNotes] = useState(submission.reviewerNotes || "");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const queryClient = useQueryClient();
  
  const toggleSection = (blockId: string) => {
    setExpandedSections(prev => ({ ...prev, [blockId]: !prev[blockId] }));
  };

  // Fetch submission with responses
  const { data: submissionData, isLoading } = useQuery<AssessmentSubmission & { responses: BlockResponse[] }>({
    queryKey: ["submission", submission.id],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`/api/admin/submissions/${submission.id}`, { headers });
      if (!res.ok) throw new Error("Failed to fetch submission");
      return res.json();
    },
  });

  // Fetch blocks to get question details
  const { data: blocks = [] } = useQuery<Block[]>({
    queryKey: ["blocks", assessmentId],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`/api/admin/assessments/${assessmentId}/blocks`, { headers });
      if (!res.ok) throw new Error("Failed to fetch blocks");
      return res.json();
    },
  });

  // Initialize scores and feedback from existing responses
  useEffect(() => {
    if (submissionData?.responses) {
      const initialScores: Record<string, number> = {};
      const initialFeedback: Record<string, string> = {};
      submissionData.responses.forEach((response) => {
        if (response.score !== null) {
          initialScores[response.blockId] = response.score;
        }
        if (response.reviewerFeedback) {
          initialFeedback[response.blockId] = response.reviewerFeedback;
        }
      });
      setScores(initialScores);
      setFeedback(initialFeedback);
    }
  }, [submissionData]);

  // Update submission mutation
  const updateSubmission = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("token");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      // Calculate total score
      const totalScore = Object.values(scores).reduce((sum, score) => sum + (score || 0), 0);

      // Update submission - change status to "reviewed"
      await fetch(`/api/admin/submissions/${submission.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          reviewerNotes: notes,
          totalScore,
          status: "reviewed",
        }),
      });

      // Update each block response
      for (const [blockId, score] of Object.entries(scores)) {
        await fetch(`/api/admin/block-responses/${submissionData?.responses.find(r => r.blockId === blockId)?.id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({
            score,
            reviewerFeedback: feedback[blockId] || null,
          }),
        });
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["submissions", assessmentId] });
      queryClient.invalidateQueries({ queryKey: ["submission", submission.id] });
      alert("Review saved successfully!");
    },
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  if (!submissionData) {
    return null;
  }

  const getBlock = (blockId: string) => blocks.find(b => b.id === blockId);
  
  const isExpanded = (blockId: string) => expandedSections[blockId] !== false; // Default to expanded

  const renderResponse = (response: BlockResponse) => {
    const block = getBlock(response.blockId);
    if (!block) return null;

    const responseData = response.responseData as any;
    const isExpandedState = isExpanded(response.blockId);
    const blockIndex = blocks.findIndex(b => b.id === block.id) + 1;

    // Check if answer is correct (for multiple choice/multi-select)
    const getCorrectAnswer = () => {
      if (block.type === "multiple_choice") {
        const correctOption = block.config?.options?.find((opt: any) => opt.correct);
        const selectedOption = block.config?.options?.find((opt: any) => opt.value === responseData.selectedOptionId);
        return {
          isCorrect: correctOption?.value === responseData.selectedOptionId,
          correctAnswer: correctOption,
          selectedAnswer: selectedOption,
        };
      } else if (block.type === "multi_select") {
        const correctOptions = block.config?.options?.filter((opt: any) => opt.correct) || [];
        const selectedIds = responseData.selectedOptionIds || [];
        const correctIds = correctOptions.map((opt: any) => opt.value);
        const isCorrect = correctIds.length === selectedIds.length && 
          correctIds.every(id => selectedIds.includes(id)) &&
          selectedIds.every(id => correctIds.includes(id));
        return {
          isCorrect,
          correctAnswers: correctOptions,
          selectedAnswers: block.config?.options?.filter((opt: any) => selectedIds.includes(opt.value)) || [],
        };
      }
      return null;
    };

    const correctness = getCorrectAnswer();

    return (
      <div key={response.id} className="bg-white rounded-lg border border-gray-200 mb-4">
        {/* Collapsible Header */}
        <button
          onClick={() => toggleSection(response.blockId)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3 flex-1 text-left">
            {isExpandedState ? (
              <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
            )}
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">
                {block.title || `Question ${blockIndex}`}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                {correctness && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full ${
                    correctness.isCorrect 
                      ? "bg-green-100 text-green-800" 
                      : "bg-red-100 text-red-800"
                  }`}>
                    {correctness.isCorrect ? (
                      <CheckCircle className="w-3 h-3" />
                    ) : (
                      <XCircle className="w-3 h-3" />
                    )}
                    {correctness.isCorrect ? "Correct" : "Incorrect"}
                  </span>
                )}
                {block.config?.points && (
                  <span className="text-xs text-gray-500">
                    {scores[response.blockId] ?? response.score ?? 0} / {block.config.points} points
                  </span>
                )}
              </div>
            </div>
          </div>
        </button>

        {/* Collapsible Content */}
        {isExpandedState && (
          <div className="px-6 pb-6 space-y-4">
            {/* Question Details */}
            {block.instructions && (
              <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                {block.instructions}
              </div>
            )}

            {/* Response Content */}
            <div className="space-y-3">
              {block.type === "multiple_choice" && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Selected Answer:</p>
                  <div className={`p-3 rounded-lg border-2 ${
                    correctness?.isCorrect 
                      ? "bg-green-50 border-green-200" 
                      : "bg-red-50 border-red-200"
                  }`}>
                    <div className="flex items-center gap-2">
                      {correctness?.isCorrect ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                      <span className="text-sm font-medium text-gray-900">
                        {correctness?.selectedAnswer?.label || responseData.selectedOptionId}
                      </span>
                    </div>
                  </div>
                  {correctness && !correctness.isCorrect && correctness.correctAnswer && (
                    <div className="p-3 bg-green-50 border-2 border-green-200 rounded-lg">
                      <p className="text-xs text-gray-600 mb-1">Correct Answer:</p>
                      <p className="text-sm font-medium text-green-800">
                        {correctness.correctAnswer.label}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {block.type === "multi_select" && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Selected Answers:</p>
                  <div className="space-y-2">
                    {correctness?.selectedAnswers.map((opt: any) => {
                      const isCorrect = correctness.correctAnswers.some((c: any) => c.value === opt.value);
                      return (
                        <div
                          key={opt.value}
                          className={`p-3 rounded-lg border-2 flex items-center gap-2 ${
                            isCorrect 
                              ? "bg-green-50 border-green-200" 
                              : "bg-red-50 border-red-200"
                          }`}
                        >
                          {isCorrect ? (
                            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                          )}
                          <span className="text-sm text-gray-900">{opt.label}</span>
                        </div>
                      );
                    })}
                  </div>
                  {correctness && correctness.correctAnswers.length > 0 && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-xs text-gray-600 mb-2">All Correct Answers:</p>
                      <div className="space-y-1">
                        {correctness.correctAnswers.map((opt: any) => (
                          <p key={opt.value} className="text-sm text-blue-800">
                            • {opt.label}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {block.type === "free_text" && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium text-gray-700 mb-2">Response:</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {responseData.text || "No response"}
                  </p>
                </div>
              )}

              {block.type === "coding_block" && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-700">Code Response:</p>
                  <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                    <pre className="text-sm text-gray-100 font-mono whitespace-pre">
                      <code>{responseData.code || "No code submitted"}</code>
                    </pre>
                  </div>
                  {block.config?.example && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-xs font-medium text-blue-900 mb-2">Example Code (shown to test taker):</p>
                      <pre className="text-xs text-blue-800 font-mono whitespace-pre-wrap overflow-x-auto">
                        {block.config.example}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {block.type === "latex_block" && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-700">LaTeX Response:</p>
                  {responseData.latex ? (
                    <>
                      <div className="p-4 bg-gray-50 border border-gray-300 rounded-lg">
                        <LaTeXRenderer latex={responseData.latex} displayMode={block.config?.displayMode || false} />
                      </div>
                      <div className="mt-2 p-3 bg-gray-100 rounded-lg">
                        <p className="text-xs font-medium text-gray-600 mb-1">Raw LaTeX Code:</p>
                        <pre className="text-xs text-gray-800 font-mono whitespace-pre-wrap break-words">
                          {responseData.latex}
                        </pre>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500 italic">No LaTeX submitted</p>
                  )}
                  {block.config?.latexExample && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-xs font-medium text-blue-900 mb-2">Example LaTeX (shown to test taker):</p>
                      <div className="text-xs text-blue-800 font-mono mb-2">{block.config.latexExample}</div>
                      <div className="p-2 bg-white rounded border border-blue-200">
                        <LaTeXRenderer latex={block.config.latexExample} displayMode={block.config?.displayMode || false} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(block.type === "audio_response" || block.type === "video_response") && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-700">Recording:</p>
                  {responseData.mediaDataUrl ? (
                    <div className="space-y-2">
                      {block.type === "audio_response" ? (
                        <audio
                          src={responseData.mediaDataUrl}
                          controls
                          className="w-full"
                        />
                      ) : (
                        <video
                          src={responseData.mediaDataUrl}
                          controls
                          className="w-full max-w-2xl rounded-lg"
                        />
                      )}
                      {/* Metadata */}
                      <div className="bg-gray-50 p-3 rounded-lg space-y-1">
                        {responseData.duration && (
                          <p className="text-xs text-gray-600">
                            <span className="font-medium">Duration:</span> {Math.round(responseData.duration)}s
                          </p>
                        )}
                        {responseData.metadata && (
                          <div className="text-xs text-gray-600 space-y-1">
                            {responseData.metadata.sampleRate && (
                              <p><span className="font-medium">Sample Rate:</span> {responseData.metadata.sampleRate} Hz</p>
                            )}
                            {responseData.metadata.bitDepth && (
                              <p><span className="font-medium">Bit Depth:</span> {responseData.metadata.bitDepth}-bit</p>
                            )}
                            {responseData.metadata.truePeak !== undefined && (
                              <p><span className="font-medium">True Peak:</span> {responseData.metadata.truePeak.toFixed(2)} dBFS</p>
                            )}
                            {responseData.metadata.integratedLoudness !== undefined && (
                              <p><span className="font-medium">Loudness:</span> {responseData.metadata.integratedLoudness.toFixed(2)} LUFS</p>
                            )}
                            {responseData.metadata.micName && (
                              <p><span className="font-medium">Microphone:</span> {responseData.metadata.micName}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : responseData.mediaUrl ? (
                    <div className="space-y-2">
                      {block.type === "audio_response" ? (
                        <audio
                          src={responseData.mediaUrl}
                          controls
                          className="w-full"
                        />
                      ) : (
                        <video
                          src={responseData.mediaUrl}
                          controls
                          className="w-full max-w-2xl rounded-lg"
                        />
                      )}
                      {responseData.duration && (
                        <p className="text-xs text-gray-500">
                          Duration: {Math.round(responseData.duration)}s
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No recording available</p>
                  )}
                </div>
              )}
            </div>

            {/* Scoring */}
            {block.config?.points && (
              <div className="space-y-2 border-t pt-4">
                <label className="block text-sm font-medium text-gray-700">
                  Score (out of {block.config.points})
                </label>
                <input
                  type="number"
                  min={0}
                  max={block.config.points}
                  value={scores[response.blockId] ?? response.score ?? 0}
                  onChange={(e) => {
                    const score = parseInt(e.target.value) || 0;
                    setScores(prev => ({ ...prev, [response.blockId]: score }));
                  }}
                  className="w-32 px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            )}

            {/* Feedback */}
            <div className="space-y-2 border-t pt-4">
              <label className="block text-sm font-medium text-gray-700">
                Reviewer Feedback
              </label>
              <textarea
                value={feedback[response.blockId] ?? response.reviewerFeedback ?? ""}
                onChange={(e) => {
                  setFeedback(prev => ({ ...prev, [response.blockId]: e.target.value }));
                }}
                rows={3}
                placeholder="Add feedback for this response..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Review Submission</h2>
              <p className="text-sm text-gray-600 mt-1">
                {(submission as any).firstName && (submission as any).lastName 
                  ? `${(submission as any).firstName} ${(submission as any).lastName}`
                  : submission.name || "Anonymous"
                } {submission.email && `• ${submission.email}`}
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Submission Info */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-700">Status:</span>{" "}
                <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                  submission.status === "reviewed"
                    ? "bg-purple-100 text-purple-800"
                    : submission.status === "to_review"
                    ? "bg-yellow-100 text-yellow-800"
                    : submission.status === "in_progress"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-gray-100 text-gray-800"
                }`}>
                  {submission.status === "to_review" ? "To Review" : 
                   submission.status === "reviewed" ? "Reviewed" :
                   submission.status}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Submitted:</span>{" "}
                <span className="text-gray-600">
                  {submission.submittedAt 
                    ? new Date(submission.submittedAt).toLocaleString()
                    : "Not submitted"}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Current Score:</span>{" "}
                <span className="text-gray-600">
                  {submission.totalScore !== null && submission.maxScore !== null
                    ? `${submission.totalScore} / ${submission.maxScore}`
                    : "Not scored"}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Progress:</span>{" "}
                <span className="text-gray-600">{submission.progress}%</span>
              </div>
            </div>
          </div>

          {/* Responses */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Responses</h3>
            {submissionData.responses.length === 0 ? (
              <p className="text-gray-500">No responses yet</p>
            ) : (
              submissionData.responses.map(renderResponse)
            )}
          </div>

          {/* Integrity Violations */}
          {(() => {
            const violations = submissionData.integrityViolations;
            const hasCopyAttempts = violations && (violations.copyAttempts ?? 0) > 0;
            const hasPasteAttempts = violations && violations.pasteAttempts && Array.isArray(violations.pasteAttempts) && violations.pasteAttempts.length > 0;
            const hasProctoringViolations = violations && violations.proctoring && (
              (violations.proctoring.lookAway && violations.proctoring.lookAway.length > 0) ||
              (violations.proctoring.multipleFaces && violations.proctoring.multipleFaces.length > 0)
            );
            const hasViolations = hasCopyAttempts || hasPasteAttempts || hasProctoringViolations;
            const hasViolationsData = violations !== null && violations !== undefined;
            
            // Debug: Log violations data
            console.log('[ReviewerView] Integrity violations data:', violations);
            console.log('[ReviewerView] Has violations:', hasViolations);
            console.log('[ReviewerView] Has violations data:', hasViolationsData);
            console.log('[ReviewerView] Full submission data:', submissionData);
            
            // Always show the section
            return (
              <div className="mt-6 border-t border-gray-200 pt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  {hasViolations ? (
                    <XCircle className="w-5 h-5 text-red-600" />
                  ) : (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  )}
                  Integrity Violations
                </h3>
                
                <div className="space-y-4">
                  {/* Copy Attempts */}
                  {hasCopyAttempts && violations && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <XCircle className="w-5 h-5 text-red-600" />
                        <span className="font-medium text-red-900">Copy Attempts</span>
                      </div>
                      <p className="text-sm text-red-800">
                        User attempted to copy content <strong>{violations.copyAttempts}</strong> time{(violations.copyAttempts ?? 0) !== 1 ? 's' : ''}.
                      </p>
                    </div>
                  )}

                  {/* Paste Attempts */}
                  {hasPasteAttempts && violations && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <XCircle className="w-5 h-5 text-red-600" />
                        <span className="font-medium text-red-900">Paste Attempts</span>
                        <span className="text-sm text-red-700">
                          ({violations.pasteAttempts.length} attempt{violations.pasteAttempts.length !== 1 ? 's' : ''})
                        </span>
                      </div>
                      <div className="space-y-3">
                        {violations.pasteAttempts.map((attempt: any, index: number) => {
                          const block = getBlock(attempt.blockId);
                          return (
                            <div key={index} className="bg-white border border-red-300 rounded p-3">
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <p className="text-xs font-medium text-gray-600">
                                    Block: {block?.title || `Block ${blocks.findIndex(b => b.id === attempt.blockId) + 1}`}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {new Date(attempt.timestamp).toLocaleString()}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-2">
                                <p className="text-xs font-medium text-gray-700 mb-1">Attempted to paste:</p>
                                <div className="bg-gray-50 border border-gray-200 rounded p-2">
                                  <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                                    {attempt.attemptedContent || "(empty)"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Proctoring Violations */}
                  {violations && violations.proctoring && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <XCircle className="w-5 h-5 text-amber-600" />
                        <span className="font-medium text-amber-900">Proctoring Violations</span>
                      </div>
                      {violations.proctoring.lookAway && violations.proctoring.lookAway.length > 0 && (
                        <div className="mb-3">
                          <p className="text-sm font-medium text-amber-800 mb-2">
                            Look Away Violations: {violations.proctoring.lookAway.length}
                          </p>
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {violations.proctoring.lookAway.map((violation: any, idx: number) => (
                              <div key={idx} className="text-xs text-amber-700 pl-2">
                                {new Date(violation.timestamp).toLocaleString()}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {violations.proctoring.multipleFaces && violations.proctoring.multipleFaces.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-red-800 mb-2">
                            Multiple Faces Detected: {violations.proctoring.multipleFaces.length}
                          </p>
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {violations.proctoring.multipleFaces.map((violation: any, idx: number) => (
                              <div key={idx} className="text-xs text-red-700 pl-2">
                                {new Date(violation.timestamp).toLocaleString()}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* No Violations Message */}
                  {!hasViolations && hasViolationsData && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <span className="text-sm font-medium text-green-900">
                          No integrity violations detected
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {/* No Tracking Data (Old Submissions) */}
                  {!hasViolationsData && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">
                          Integrity tracking was not enabled for this submission.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Internal Notes */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Internal Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Add internal notes about this submission..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex-shrink-0 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Total Score: {Object.values(scores).reduce((sum, score) => sum + (score || 0), 0)} / {
              blocks.reduce((sum, block) => sum + (block.config?.points || 0), 0)
            }
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => updateSubmission.mutate()}
              disabled={updateSubmission.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {updateSubmission.isPending ? "Saving..." : "Save Review"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

