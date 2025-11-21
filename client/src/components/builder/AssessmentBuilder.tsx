import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import BuilderSidebar from "./BuilderSidebar";
import BuilderCanvas from "./BuilderCanvas";
import BlockConfigModal from "./BlockConfigModal";
import { Block, Assessment } from "@shared/schema";

interface AssessmentBuilderProps {
  assessment: Assessment | null;
  onClose?: () => void;
}

export default function AssessmentBuilder({ assessment, onClose }: AssessmentBuilderProps) {
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const queryClient = useQueryClient();

  // Load blocks for the assessment
  const { data: blocks = [], isLoading: blocksLoading } = useQuery<Block[]>({
    queryKey: ["blocks", assessment?.id],
    queryFn: async () => {
      if (!assessment?.id) return [];
      const token = localStorage.getItem("token");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`/api/admin/assessments/${assessment.id}/blocks`, { headers });
      if (!res.ok) throw new Error("Failed to fetch blocks");
      return res.json();
    },
    enabled: !!assessment?.id,
  });

  // Create block mutation
  const createBlock = useMutation({
    mutationFn: async (type: Block["type"]) => {
      if (!assessment?.id) throw new Error("No assessment selected");
      const token = localStorage.getItem("token");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`/api/admin/assessments/${assessment.id}/blocks`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          type,
          title: "",
          instructions: "",
          required: false,
          config: {},
        }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to create block" }));
        throw new Error(error.error || "Failed to create block");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocks", assessment?.id] });
    },
  });

  // Update block mutation
  const updateBlock = useMutation({
    mutationFn: async (updatedBlock: Block) => {
      const token = localStorage.getItem("token");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`/api/admin/blocks/${updatedBlock.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          title: updatedBlock.title,
          instructions: updatedBlock.instructions,
          required: updatedBlock.required,
          timeLimitSeconds: updatedBlock.timeLimitSeconds,
          config: updatedBlock.config,
          order: updatedBlock.order,
          groupId: updatedBlock.groupId,
        }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to update block" }));
        throw new Error(error.error || "Failed to update block");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocks", assessment?.id] });
      setIsConfigModalOpen(false);
      setSelectedBlock(null);
    },
  });

  // Update block order mutation
  const updateBlockOrder = useMutation({
    mutationFn: async (blockIds: string[]) => {
      if (!assessment?.id) throw new Error("No assessment selected");
      const token = localStorage.getItem("token");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`/api/admin/assessments/${assessment.id}/blocks/order`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ blockIds }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to update block order" }));
        throw new Error(error.error || "Failed to update block order");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["blocks", assessment?.id], data);
    },
  });

  // Delete block mutation
  const deleteBlock = useMutation({
    mutationFn: async (blockId: string) => {
      const token = localStorage.getItem("token");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`/api/admin/blocks/${blockId}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to delete block" }));
        throw new Error(error.error || "Failed to delete block");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocks", assessment?.id] });
    },
  });

  const handleAddBlock = (type: Block["type"]) => {
    createBlock.mutate(type);
  };

  const handleBlockClick = (block: Block) => {
    setSelectedBlock(block);
    setIsConfigModalOpen(true);
  };

  const handleSaveBlock = (updatedBlock: Block) => {
    updateBlock.mutate(updatedBlock);
  };

  const handleReorderBlocks = (newOrder: Block[]) => {
    const blockIds = newOrder.map(b => b.id);
    updateBlockOrder.mutate(blockIds);
  };

  const handleDeleteBlock = (blockId: string) => {
    deleteBlock.mutate(blockId);
  };

  if (!assessment) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500 text-lg">No assessment selected</p>
          <p className="text-gray-400 text-sm mt-2">Select an assessment from the sidebar to start building</p>
        </div>
      </div>
    );
  }

  if (blocksLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-gray-500">Loading blocks...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <BuilderSidebar onAddBlock={handleAddBlock} />
      <BuilderCanvas 
        blocks={blocks}
        onBlockClick={handleBlockClick}
        onReorderBlocks={handleReorderBlocks}
        onDeleteBlock={handleDeleteBlock}
        assessmentName={assessment.name}
        assessment={assessment}
      />
      {isConfigModalOpen && selectedBlock && (
        <BlockConfigModal
          block={selectedBlock}
          allBlocks={blocks}
          onSave={handleSaveBlock}
          onClose={() => {
            setIsConfigModalOpen(false);
            setSelectedBlock(null);
          }}
        />
      )}
    </div>
  );
}

