import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Settings, Trash2 } from "lucide-react";
import { Block } from "@shared/schema";

interface DraggableBlockProps {
  block: Block;
  onClick: () => void;
  onDelete?: () => void;
}

const blockTypeLabels: Record<Block["type"], string> = {
  multiple_choice: "Multiple Choice",
  multi_select: "Multi-Select",
  free_text: "Free Text",
  audio_response: "Audio Response",
  video_response: "Video Response",
  media_stimulus: "Media Stimulus",
};

export default function DraggableBlock({ block, onClick, onDelete }: DraggableBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id || `block-${block.order}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white rounded-lg border-2 border-gray-200 hover:border-blue-400 transition-colors shadow-sm"
    >
      <div className="flex items-start gap-3 p-4">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="mt-1 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-5 h-5" />
        </button>

        {/* Block Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
                {blockTypeLabels[block.type]}
              </span>
              {block.required && (
                <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded">
                  Required
                </span>
              )}
              {block.timeLimitSeconds && (
                <span className="text-xs text-gray-500">
                  ⏱️ {block.timeLimitSeconds}s limit
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={onClick}
                className="text-gray-400 hover:text-gray-600 p-1"
                title="Configure block"
              >
                <Settings className="w-4 h-4" />
              </button>
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Are you sure you want to delete this block? This action cannot be undone.`)) {
                      onDelete();
                    }
                  }}
                  className="text-gray-400 hover:text-red-600 p-1"
                  title="Delete block"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {block.title ? (
            <h3 className="font-medium text-gray-900 mb-1">{block.title}</h3>
          ) : (
            <h3 className="font-medium text-gray-400 italic mb-1">Untitled Block</h3>
          )}

          {block.instructions && (
            <p className="text-sm text-gray-600 mt-1">{block.instructions}</p>
          )}

          {/* Block-specific preview */}
          <div className="mt-3 text-xs text-gray-500">
            {block.type === "multiple_choice" && block.config?.options && (
              <div className="space-y-1">
                {block.config.options.slice(0, 3).map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span>• {opt.label}</span>
                    {opt.correct && (
                      <span className="text-green-600 font-medium">✓ Correct</span>
                    )}
                  </div>
                ))}
                {block.config.options.length > 3 && (
                  <div>+ {block.config.options.length - 3} more options</div>
                )}
                {block.config.options.some(opt => opt.correct) && (
                  <div className="mt-1 text-green-600 font-medium">
                    ✓ Correct answer marked
                  </div>
                )}
              </div>
            )}
            {block.type === "multi_select" && block.config?.options && (
              <div className="space-y-1">
                {block.config.options.slice(0, 3).map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span>☑ {opt.label}</span>
                    {opt.correct && (
                      <span className="text-green-600 font-medium">✓</span>
                    )}
                  </div>
                ))}
                {block.config.options.length > 3 && (
                  <div>+ {block.config.options.length - 3} more options</div>
                )}
                {block.config.options.filter(opt => opt.correct).length > 0 && (
                  <div className="mt-1 text-green-600 font-medium">
                    ✓ {block.config.options.filter(opt => opt.correct).length} correct answer(s) marked
                  </div>
                )}
              </div>
            )}
            {block.type === "free_text" && (
              <div className="text-gray-400 italic">
                {block.config?.placeholder ? `Suggested Response: "${block.config.placeholder.substring(0, 50)}${block.config.placeholder.length > 50 ? '...' : ''}"` : "Text response field"}
                {block.config?.minLength && ` | Min: ${block.config.minLength} chars`}
                {block.config?.maxLength && ` | Max: ${block.config.maxLength} chars`}
              </div>
            )}
            {block.type === "media_stimulus" && (
              <div>
                {block.config?.mediaItems && block.config.mediaItems.length > 0 ? (
                  <div className="space-y-1">
                    <div className="font-medium text-gray-700">
                      {block.config.mediaItems.length} media item{block.config.mediaItems.length !== 1 ? 's' : ''}
                    </div>
                    {block.config.mediaItems.map((item, idx) => (
                      <div key={item.id || idx} className="text-xs text-gray-600">
                        • {item.title || `Item ${idx + 1}`} ({item.mediaType})
                        {item.mediaUrl && <span className="text-green-600 ml-1">✓</span>}
                      </div>
                    ))}
                  </div>
                ) : block.config?.mediaUrl ? (
                  // Legacy single media support
                  <div>
                    <span className="font-medium">Media Type: {block.config.mediaType}</span>
                    <div className="mt-1 text-green-600">✓ Media uploaded</div>
                  </div>
                ) : (
                  <div className="text-amber-600">⚠ No media items added</div>
                )}
              </div>
            )}
            {block.type === "audio_response" && (
              <div>
                🎤 Audio recording
                {block.config?.minDurationSeconds && ` | Min: ${block.config.minDurationSeconds}s`}
                {block.config?.maxDurationSeconds && ` | Max: ${block.config.maxDurationSeconds}s`}
                {block.config?.scriptPdfUrl && <div className="text-green-600 mt-1">✓ PDF script attached</div>}
              </div>
            )}
            {block.type === "video_response" && (
              <div>
                📹 Video recording (720p)
                {block.config?.minDurationSeconds && ` | Min: ${block.config.minDurationSeconds}s`}
                {block.config?.maxDurationSeconds && ` | Max: ${block.config.maxDurationSeconds}s`}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

