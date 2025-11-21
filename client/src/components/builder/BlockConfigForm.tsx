import { useState } from "react";
import { Block } from "@shared/schema";

interface BlockConfigFormProps {
  block: Block;
  allBlocks: Block[];
  onChange: (block: Block) => void;
}

export default function BlockConfigForm({ block, allBlocks, onChange }: BlockConfigFormProps) {
  const updateBlock = (updates: Partial<Block>) => {
    onChange({ ...block, ...updates });
  };

  const updateConfig = (configUpdates: Partial<Block["config"]>) => {
    onChange({
      ...block,
      config: { ...block.config, ...configUpdates },
    });
  };

  // Get available blocks for grouping (exclude current block)
  const availableBlocksForGrouping = allBlocks.filter(b => b.id !== block.id);
  
  // Find blocks in the same group
  const groupedBlocks = block.groupId 
    ? allBlocks.filter(b => b.groupId === block.groupId && b.id !== block.id)
    : [];

  return (
    <div className="space-y-6">
      {/* Block Grouping */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <label className="block text-sm font-medium text-blue-900 mb-2">
          Group with Other Blocks
        </label>
        <p className="text-xs text-blue-700 mb-3">
          Grouped blocks will appear side-by-side in the preview. Select another block to group with this one.
        </p>
        <select
          value={block.groupId || ""}
          onChange={(e) => {
            const targetBlockId = e.target.value;
            if (targetBlockId) {
              // Find the target block and use its groupId, or create a new groupId
              const targetBlock = allBlocks.find(b => b.id === targetBlockId);
              const groupId = targetBlock?.groupId || targetBlockId; // Use existing group or create new
              updateBlock({ groupId });
            } else {
              updateBlock({ groupId: undefined });
            }
          }}
          className="w-full px-3 py-2 border border-blue-300 rounded-lg bg-white text-sm"
        >
          <option value="">No grouping (show separately)</option>
          {availableBlocksForGrouping.map(b => (
            <option key={b.id} value={b.id}>
              {b.title || `Block ${b.order + 1} (${b.type.replace('_', ' ')})`}
            </option>
          ))}
        </select>
        {groupedBlocks.length > 0 && (
          <div className="mt-3 p-2 bg-white rounded border border-blue-200">
            <p className="text-xs font-medium text-blue-800 mb-1">Grouped with:</p>
            <ul className="text-xs text-blue-700 space-y-1">
              {groupedBlocks.map(b => (
                <li key={b.id}>• {b.title || `Block ${b.order + 1} (${b.type.replace('_', ' ')})`}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Basic Settings */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Block Title
        </label>
        <input
          type="text"
          value={block.title || ""}
          onChange={(e) => updateBlock({ title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Enter block title..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Instructions
        </label>
        <textarea
          value={block.instructions || ""}
          onChange={(e) => updateBlock({ instructions: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Enter instructions for this block..."
        />
      </div>

      {/* Required Toggle */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="required"
          checked={block.required}
          onChange={(e) => updateBlock({ required: e.target.checked })}
          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
        <label htmlFor="required" className="text-sm font-medium text-gray-700">
          Required - User must complete this block
        </label>
      </div>

      {/* Prevent Copy/Paste Toggle - Only for text-based blocks */}
      {(block.type === "free_text" || block.type === "multiple_choice" || block.type === "multi_select" || block.type === "coding_block" || block.type === "latex_block") && (
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="preventCopyPaste"
            checked={block.config?.preventCopyPaste || false}
            onChange={(e) => updateConfig({ preventCopyPaste: e.target.checked })}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="preventCopyPaste" className="text-sm font-medium text-gray-700">
            Prevent Copy/Paste - Block copying from and pasting into this block
          </label>
        </div>
      )}

      {/* Time Limit */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Time Limit (seconds) - Optional
        </label>
        <input
          type="number"
          value={block.timeLimitSeconds || ""}
          onChange={(e) =>
            updateBlock({
              timeLimitSeconds: e.target.value ? parseInt(e.target.value) : undefined,
            })
          }
          min={1}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="No time limit"
        />
        <p className="mt-1 text-xs text-gray-500">
          Set a time limit for users to complete this block
        </p>
      </div>

      {/* Block Type Specific Configuration */}
      {(block.type === "multiple_choice" || block.type === "multi_select") && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Options {block.type === "multiple_choice" && "(select one correct)"} {block.type === "multi_select" && "(select one or more correct)"}
          </label>
          <div className="space-y-2">
            {(block.config?.options || []).map((option, index) => (
              <div key={index} className="flex gap-2 items-center">
                <input
                  type="checkbox"
                  checked={option.correct || false}
                  onChange={(e) => {
                    const options = [...(block.config?.options || [])];
                    if (block.type === "multiple_choice") {
                      // For multiple choice, only one can be correct
                      options.forEach((opt, i) => {
                        opt.correct = i === index ? e.target.checked : false;
                      });
                    } else {
                      // For multi-select, multiple can be correct
                      options[index] = { ...option, correct: e.target.checked };
                    }
                    updateConfig({ options });
                  }}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  title={block.type === "multiple_choice" ? "Mark as correct answer" : "Mark as correct"}
                />
                <input
                  type="text"
                  value={option.label}
                  onChange={(e) => {
                    const options = [...(block.config?.options || [])];
                    options[index] = { ...option, label: e.target.value, value: e.target.value.toLowerCase().replace(/\s+/g, '_') };
                    updateConfig({ options });
                  }}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Option label"
                />
                <button
                  onClick={() => {
                    const options = block.config?.options?.filter((_, i) => i !== index) || [];
                    updateConfig({ options });
                  }}
                  className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                const options = [...(block.config?.options || []), { 
                  id: Date.now().toString(), 
                  label: "", 
                  value: "",
                  correct: false
                }];
                updateConfig({ options });
              }}
              className="w-full px-4 py-2 text-sm text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50"
            >
              + Add Option
            </button>
          </div>
        </div>
      )}

      {/* Free Text Configuration */}
      {block.type === "free_text" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Suggested Response
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Enter a correct or example response. This will be used for LLM-based review and grading.
            </p>
            <textarea
              value={block.config?.placeholder || ""}
              onChange={(e) => updateConfig({ placeholder: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter suggested response text..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Length (characters)
              </label>
              <input
                type="number"
                value={block.config?.minLength || ""}
                onChange={(e) => updateConfig({ minLength: e.target.value ? parseInt(e.target.value) : undefined })}
                min={0}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="No minimum"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Maximum Length (characters)
              </label>
              <input
                type="number"
                value={block.config?.maxLength || ""}
                onChange={(e) => updateConfig({ maxLength: e.target.value ? parseInt(e.target.value) : undefined })}
                min={1}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="No maximum"
              />
            </div>
          </div>
        </div>
      )}

      {/* Audio Response Configuration */}
      {block.type === "audio_response" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Duration (seconds)
              </label>
              <input
                type="number"
                value={block.config?.minDurationSeconds || ""}
                onChange={(e) => updateConfig({ minDurationSeconds: e.target.value ? parseInt(e.target.value) : undefined })}
                min={1}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="No minimum"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Maximum Duration (seconds)
              </label>
              <input
                type="number"
                value={block.config?.maxDurationSeconds || ""}
                onChange={(e) => updateConfig({ maxDurationSeconds: e.target.value ? parseInt(e.target.value) : undefined })}
                min={1}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="No maximum"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              PDF Script (Optional)
            </label>
            <div className="flex gap-2">
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    // TODO: Upload PDF and get URL/S3 key
                    console.log("PDF file selected:", file.name);
                  }
                }}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Upload a PDF script for users to read while recording
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm font-medium text-gray-700 mb-2">Test Recording</p>
            <p className="text-xs text-gray-600 mb-3">
              Test the audio recording functionality (this is for testing only)
            </p>
            {/* Audio recorder will be integrated in the actual assessment view */}
            <p className="text-xs text-gray-500 italic">
              Recording functionality will be available in the assessment preview and delivery view
            </p>
          </div>
        </div>
      )}

      {/* Video Response Configuration */}
      {block.type === "video_response" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Duration (seconds)
              </label>
              <input
                type="number"
                value={block.config?.minDurationSeconds || ""}
                onChange={(e) => updateConfig({ minDurationSeconds: e.target.value ? parseInt(e.target.value) : undefined })}
                min={1}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="No minimum"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Maximum Duration (seconds)
              </label>
              <input
                type="number"
                value={block.config?.maxDurationSeconds || ""}
                onChange={(e) => updateConfig({ maxDurationSeconds: e.target.value ? parseInt(e.target.value) : undefined })}
                min={1}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="No maximum"
              />
            </div>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800 font-medium">
              📹 Video Recording Settings
            </p>
            <ul className="mt-2 text-xs text-blue-700 space-y-1">
              <li>• Resolution: 720p (1280x720)</li>
              <li>• Format: WebM (VP8 + Opus)</li>
              <li>• Bitrate: 2.5 Mbps</li>
            </ul>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm font-medium text-gray-700 mb-2">Test Recording</p>
            <p className="text-xs text-gray-600 mb-3">
              Test the video recording functionality (this is for testing only)
            </p>
            {/* Video recorder will be integrated in the actual assessment view */}
            <p className="text-xs text-gray-500 italic">
              Recording functionality will be available in the assessment preview and delivery view
            </p>
          </div>
        </div>
      )}

      {/* Media Stimulus Configuration */}
      {block.type === "media_stimulus" && (
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800 font-medium mb-1">💡 Multiple Media Items</p>
            <p className="text-xs text-blue-700">
              Add up to 4 media items (images, videos, or audio) that will be displayed side-by-side in the preview.
            </p>
          </div>

          {/* Media Items List */}
          <div className="space-y-3">
            {(block.config?.mediaItems || []).map((item, index) => (
              <div key={item.id} className="p-4 border border-gray-300 rounded-lg bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">Media Item {index + 1}</span>
                  <button
                    onClick={() => {
                      const updatedItems = (block.config?.mediaItems || []).filter(i => i.id !== item.id);
                      updateConfig({ mediaItems: updatedItems });
                      // Clean up blob URL if exists
                      if (item.mediaUrl?.startsWith('blob:')) {
                        URL.revokeObjectURL(item.mediaUrl);
                      }
                    }}
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
                
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Title (Optional)
                    </label>
                    <input
                      type="text"
                      value={item.title || ""}
                      onChange={(e) => {
                        const updatedItems = [...(block.config?.mediaItems || [])];
                        updatedItems[index] = {
                          ...item,
                          title: e.target.value || undefined
                        };
                        updateConfig({ mediaItems: updatedItems });
                      }}
                      placeholder="Enter title for this media item..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                    />
                  </div>
                  <select
                    value={item.mediaType}
                    onChange={(e) => {
                      const updatedItems = [...(block.config?.mediaItems || [])];
                      updatedItems[index] = {
                        ...item,
                        mediaType: e.target.value as "video" | "image" | "audio",
                        mediaUrl: undefined, // Clear URL when type changes
                        mediaS3Key: undefined
                      };
                      updateConfig({ mediaItems: updatedItems });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  >
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                    <option value="audio">Audio</option>
                  </select>
                  
                  <input
                    type="file"
                    accept={
                      item.mediaType === "image" ? "image/*" :
                      item.mediaType === "video" ? "video/*" :
                      "audio/*"
                    }
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const previewUrl = URL.createObjectURL(file);
                        const updatedItems = [...(block.config?.mediaItems || [])];
                        updatedItems[index] = {
                          ...item,
                          mediaUrl: previewUrl,
                          // TODO: Upload to S3 and get key
                        };
                        updateConfig({ mediaItems: updatedItems });
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  />
                  
                  {item.mediaUrl && (
                    <div className="mt-2">
                      {item.mediaType === "image" && (
                        <img 
                          src={item.mediaUrl} 
                          alt={`Stimulus ${index + 1}`} 
                          className="max-w-full h-auto max-h-48 rounded border border-gray-300" 
                        />
                      )}
                      {item.mediaType === "video" && (
                        <video 
                          src={item.mediaUrl} 
                          controls 
                          className="max-w-full max-h-48 rounded border border-gray-300" 
                        />
                      )}
                      {item.mediaType === "audio" && (
                        <audio 
                          src={item.mediaUrl} 
                          controls 
                          className="w-full" 
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Add Media Button */}
          {(block.config?.mediaItems?.length || 0) < 4 && (
            <button
              onClick={() => {
                const newItem = {
                  id: `media-${Date.now()}-${Math.random()}`,
                  title: undefined,
                  mediaType: "image" as const,
                  mediaUrl: undefined,
                  mediaS3Key: undefined
                };
                const currentItems = block.config?.mediaItems || [];
                updateConfig({ mediaItems: [...currentItems, newItem] });
              }}
              className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            >
              + Add Media Item ({(block.config?.mediaItems?.length || 0)}/4)
            </button>
          )}

          {(block.config?.mediaItems?.length || 0) >= 4 && (
            <p className="text-xs text-gray-500 text-center">
              Maximum of 4 media items reached
            </p>
          )}
        </div>
      )}

      {/* Coding Block Configuration */}
      {block.type === "coding_block" && (
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800 font-medium mb-1">💻 Code Editor Settings</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Programming Language
            </label>
            <select
              value={block.config?.language || "javascript"}
              onChange={(e) => updateConfig({ language: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="java">Java</option>
              <option value="c_cpp">C/C++</option>
              <option value="typescript">TypeScript</option>
              <option value="html">HTML</option>
              <option value="css">CSS</option>
              <option value="json">JSON</option>
              <option value="sql">SQL</option>
              <option value="ruby">Ruby</option>
              <option value="php">PHP</option>
              <option value="golang">Go</option>
              <option value="rust">Rust</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Editor Theme
            </label>
            <select
              value={block.config?.theme || "monokai"}
              onChange={(e) => updateConfig({ theme: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="monokai">Monokai</option>
              <option value="twilight">Twilight</option>
              <option value="github">GitHub</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Example Code (Optional)
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Provide example code that test takers can see as a reference.
            </p>
            <textarea
              value={block.config?.example || ""}
              onChange={(e) => updateConfig({ example: e.target.value })}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              placeholder="function example() {&#10;  return 'Hello, World!';&#10;}"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Font Size
              </label>
              <input
                type="number"
                value={block.config?.fontSize || 14}
                onChange={(e) => updateConfig({ fontSize: e.target.value ? parseInt(e.target.value) : 14 })}
                min={10}
                max={24}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={block.config?.showLineNumbers !== false}
                  onChange={(e) => updateConfig({ showLineNumbers: e.target.checked })}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Show Line Numbers</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={block.config?.wrap || false}
                onChange={(e) => updateConfig({ wrap: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Enable Word Wrap</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={block.config?.readOnly || false}
                onChange={(e) => updateConfig({ readOnly: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Read Only</span>
            </div>
          </div>
        </div>
      )}

      {/* LaTeX Block Configuration */}
      {block.type === "latex_block" && (
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800 font-medium mb-1">📐 LaTeX Editor Settings</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Example LaTeX (Optional)
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Provide example LaTeX code that test takers can see as a reference.
            </p>
            <textarea
              value={block.config?.latexExample || ""}
              onChange={(e) => updateConfig({ latexExample: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              placeholder="E = mc^2 or \\frac{a}{b}"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={block.config?.displayMode || false}
              onChange={(e) => updateConfig({ displayMode: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label className="text-sm text-gray-700">
              Display Mode - Render LaTeX in centered, larger format (for equations)
            </label>
          </div>
        </div>
      )}

      {/* Scoring */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Points
        </label>
        <input
          type="number"
          value={block.config?.points || ""}
          onChange={(e) =>
            updateConfig({
              points: e.target.value ? parseInt(e.target.value) : undefined,
            })
          }
          min={0}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="0"
        />
        <p className="mt-1 text-xs text-gray-500">
          Points awarded for this block (if scoring is enabled)
        </p>
      </div>
    </div>
  );
}

