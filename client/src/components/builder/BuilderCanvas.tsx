import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import DraggableBlock from "./DraggableBlock";
import PreviewMode from "./PreviewMode";
import ShareLinkModal from "./ShareLinkModal";
import ReviewPage from "../review/ReviewPage";
import { Block, Assessment } from "@shared/schema";

interface BuilderCanvasProps {
  blocks: Block[];
  onBlockClick: (block: Block) => void;
  onReorderBlocks: (blocks: Block[]) => void;
  onDeleteBlock?: (blockId: string) => void;
  assessmentName?: string;
  assessment?: Assessment | null;
}

export default function BuilderCanvas({ blocks, onBlockClick, onReorderBlocks, onDeleteBlock, assessmentName, assessment }: BuilderCanvasProps) {
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const queryClient = useQueryClient();
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const publishAssessment = useMutation({
    mutationFn: async () => {
      if (!assessment?.id) throw new Error("No assessment selected");
      const token = localStorage.getItem("token");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      console.log(`[BuilderCanvas] Publishing assessment: ${assessment.id}`);
      const res = await fetch(`/api/admin/assessments/${assessment.id}/publish`, {
        method: "POST",
        headers,
      });
      console.log(`[BuilderCanvas] Publish response status: ${res.status}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `Failed to publish assessment: ${res.status} ${res.statusText}` }));
        console.error("[BuilderCanvas] Publish error:", errorData);
        throw new Error(errorData.error || errorData.details || `Failed to publish assessment: ${res.status}`);
      }
      const result = await res.json();
      console.log("[BuilderCanvas] Publish successful:", result);
      return result;
    },
    onSuccess: (publishedAssessment) => {
      console.log("[BuilderCanvas] Publish success callback:", publishedAssessment);
      queryClient.invalidateQueries({ queryKey: ["assessments"] });
      queryClient.invalidateQueries({ queryKey: ["assessment", assessment?.id] });
      if (publishedAssessment.publicUrl) {
        setShowShareModal(true);
      } else {
        alert("Assessment published but no public URL was generated. Please try again.");
      }
    },
    onError: (error) => {
      console.error("[BuilderCanvas] Publish mutation error:", error);
      alert(`Failed to publish assessment: ${error instanceof Error ? error.message : "Unknown error"}`);
    },
  });

  const unpublishAssessment = useMutation({
    mutationFn: async () => {
      if (!assessment?.id) throw new Error("No assessment selected");
      const token = localStorage.getItem("token");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      console.log(`[BuilderCanvas] Unpublishing assessment: ${assessment.id}`);
      const res = await fetch(`/api/admin/assessments/${assessment.id}/unpublish`, {
        method: "POST",
        headers,
      });
      console.log(`[BuilderCanvas] Unpublish response status: ${res.status}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `Failed to unpublish assessment: ${res.status} ${res.statusText}` }));
        console.error("[BuilderCanvas] Unpublish error:", errorData);
        throw new Error(errorData.error || errorData.details || `Failed to unpublish assessment: ${res.status}`);
      }
      const result = await res.json();
      console.log("[BuilderCanvas] Unpublish successful:", result);
      return result;
    },
    onSuccess: () => {
      console.log("[BuilderCanvas] Unpublish success callback");
      queryClient.invalidateQueries({ queryKey: ["assessments"] });
      queryClient.invalidateQueries({ queryKey: ["assessment", assessment?.id] });
      alert("Assessment has been unpublished. The public link is no longer available.");
    },
    onError: (error) => {
      console.error("[BuilderCanvas] Unpublish mutation error:", error);
      alert(`Failed to unpublish assessment: ${error instanceof Error ? error.message : "Unknown error"}`);
    },
  });

  const handlePublish = () => {
    if (assessment?.status === "published" && assessment.publicUrl) {
      setShowShareModal(true);
    } else {
      publishAssessment.mutate();
    }
  };

  const handleUnpublish = () => {
    if (confirm("Are you sure you want to unpublish this assessment? The public link will no longer be available.")) {
      unpublishAssessment.mutate();
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex((block) => block.id === active.id);
      const newIndex = blocks.findIndex((block) => block.id === over.id);

      const newBlocks = arrayMove(blocks, oldIndex, newIndex);
      // Update order property
      const reorderedBlocks = newBlocks.map((block, index) => ({
        ...block,
        order: index,
      }));
      onReorderBlocks(reorderedBlocks);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Assessment Builder</h1>
            <p className="text-sm text-gray-600 mt-1">
              {blocks.length} {blocks.length === 1 ? "block" : "blocks"}
            </p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowReview(true)}
              className="px-4 py-2 text-sm font-medium rounded-lg text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
              Review
            </button>
            <button 
              onClick={() => setIsPreviewMode(true)}
              disabled={blocks.length === 0}
              className={`px-4 py-2 text-sm font-medium rounded-lg ${
                blocks.length === 0
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
              }`}
            >
              Preview
            </button>
            {assessment?.status === "published" ? (
              <>
                <button 
                  onClick={handlePublish}
                  disabled={blocks.length === 0}
                  className={`px-4 py-2 text-sm font-medium rounded-lg ${
                    blocks.length === 0
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "text-white bg-green-600 hover:bg-green-700"
                  }`}
                >
                  Share Link
                </button>
                <button 
                  onClick={handleUnpublish}
                  disabled={unpublishAssessment.isPending}
                  className={`px-4 py-2 text-sm font-medium rounded-lg ${
                    unpublishAssessment.isPending
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "text-white bg-red-600 hover:bg-red-700"
                  }`}
                >
                  {unpublishAssessment.isPending ? "Unpublishing..." : "Unpublish"}
                </button>
              </>
            ) : (
              <button 
                onClick={handlePublish}
                disabled={blocks.length === 0 || publishAssessment.isPending}
                className={`px-4 py-2 text-sm font-medium rounded-lg ${
                  blocks.length === 0 || publishAssessment.isPending
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "text-white bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {publishAssessment.isPending ? "Publishing..." : "Publish"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-y-auto p-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={blocks.map(b => b.id || "")} strategy={verticalListSortingStrategy}>
            <div className="max-w-4xl mx-auto space-y-4">
              {blocks.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-gray-400 text-6xl mb-4">📝</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No blocks yet</h3>
                  <p className="text-gray-600 mb-4">
                    Add blocks from the sidebar to start building your assessment
                  </p>
                </div>
              ) : (
                blocks.map((block) => (
                  <DraggableBlock
                    key={block.id || `block-${block.order}`}
                    block={block}
                    onClick={() => onBlockClick(block)}
                    onDelete={onDeleteBlock && block.id ? () => onDeleteBlock(block.id!) : undefined}
                  />
                ))
              )}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* Preview Mode */}
      {isPreviewMode && (
        <PreviewMode
          blocks={blocks}
          assessmentName={assessmentName}
          onClose={() => setIsPreviewMode(false)}
        />
      )}

      {/* Share Link Modal */}
      {showShareModal && assessment?.publicUrl && (
        <ShareLinkModal
          publicUrl={assessment.publicUrl}
          assessmentName={assessmentName || assessment.name}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* Review Page Overlay */}
      {showReview && assessment?.id && (
        <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
          <div className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Review Submissions</h2>
              <button
                onClick={() => setShowReview(false)}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Back to Builder
              </button>
            </div>
            <ReviewPage />
          </div>
        </div>
      )}
    </div>
  );
}

