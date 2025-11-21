import { useState } from "react";
import { Plus, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Block } from "@shared/schema";

interface BuilderSidebarProps {
  onAddBlock: (type: Block["type"]) => void;
}

const blockTypes: Array<{ type: Block["type"]; label: string; icon: string; description: string }> = [
  { type: "multiple_choice", label: "Multiple Choice", icon: "○", description: "Single-select question" },
  { type: "multi_select", label: "Multi-Select", icon: "☑", description: "Multiple selection question" },
  { type: "free_text", label: "Free Text", icon: "📝", description: "Text response question" },
  { type: "audio_response", label: "Audio Response", icon: "🎤", description: "Record audio answer" },
  { type: "video_response", label: "Video Response", icon: "📹", description: "Record video answer" },
  { type: "media_stimulus", label: "Media Stimulus", icon: "🖼️", description: "Image, video, or audio with questions" },
];

export default function BuilderSidebar({ onAddBlock }: BuilderSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="relative flex">
      {/* Collapsed State - Show button to reopen */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="absolute left-0 top-4 z-20 p-2 bg-white border border-gray-200 rounded-r-lg shadow-md hover:bg-gray-50 transition-all duration-300"
          title="Show Add Block sidebar"
        >
          <Menu className="w-5 h-5 text-gray-600" />
        </button>
      )}

      {/* Sidebar Content */}
      <div className={`${collapsed ? 'w-0' : 'w-64'} bg-white border-r border-gray-200 p-4 overflow-y-auto transition-all duration-300 flex flex-col h-screen relative`}>
        {!collapsed && (
          <>
            <div className="mb-6 flex-shrink-0 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Add Block</h2>
                <p className="text-sm text-gray-600">Drag or click to add blocks to your assessment</p>
              </div>
              <button
                onClick={() => setCollapsed(true)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                title="Hide sidebar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {blockTypes.map((blockType) => (
                <button
                  key={blockType.type}
                  onClick={() => onAddBlock(blockType.type)}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{blockType.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 group-hover:text-blue-700">
                        {blockType.label}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {blockType.description}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200 flex-shrink-0">
              <div className="text-xs text-gray-500">
                <p className="font-medium mb-2">Tips:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Click a block to configure it</li>
                  <li>Drag to reorder blocks</li>
                  <li>Set time limits per block</li>
                  <li>Add scoring rules</li>
                </ul>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

