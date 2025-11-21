import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Save, ChevronDown, ChevronRight, CheckCircle, XCircle } from "lucide-react";
import { AssessmentSubmission, BlockResponse, Block } from "@shared/schema";

interface ReviewerViewProps {
  submission: AssessmentSubmission;
  assessmentId: string;
  onClose: () => void;
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

