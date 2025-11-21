import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Block } from "@shared/schema";
import BlockConfigForm from "./BlockConfigForm";

interface BlockConfigModalProps {
  block: Block;
  allBlocks: Block[];
  onSave: (block: Block) => void;
  onClose: () => void;
}

export default function BlockConfigModal({ block, allBlocks, onSave, onClose }: BlockConfigModalProps) {
  const [editedBlock, setEditedBlock] = useState<Block>(block);

  useEffect(() => {
    setEditedBlock(block);
  }, [block]);

  const handleSave = () => {
    onSave(editedBlock);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            Configure Block
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <BlockConfigForm
            block={editedBlock}
            allBlocks={allBlocks}
            onChange={setEditedBlock}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

