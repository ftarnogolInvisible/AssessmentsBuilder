import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, CheckCircle } from "lucide-react";
import type { Assessment } from "@shared/schema";

interface AssessmentSettingsModalProps {
  assessment: Assessment;
  onClose: () => void;
}

export default function AssessmentSettingsModal({ assessment, onClose }: AssessmentSettingsModalProps) {
  const [enableProctoring, setEnableProctoring] = useState(
    assessment.settings?.enableProctoring ?? true // Default to true for existing assessments
  );
  const [requireFullScreen, setRequireFullScreen] = useState(
    assessment.settings?.requireFullScreen ?? false // Default to false
  );
  const [requireSingleScreen, setRequireSingleScreen] = useState(
    assessment.settings?.requireSingleScreen ?? false // Default to false
  );
  const [showSuccess, setShowSuccess] = useState(false);

  const queryClient = useQueryClient();

  const updateSettings = useMutation({
    mutationFn: async (settings: Assessment["settings"]) => {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/assessments/${assessment.id}/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ settings }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Failed to update settings" }));
        throw new Error(errorData.error || `Failed to update settings: ${res.status}`);
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["assessment", assessment.id] });
      queryClient.invalidateQueries({ queryKey: ["assessment"] }); // Invalidate all assessment queries (including publicUrl queries)
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 1500);
    },
    onError: (error) => {
      console.error("Error updating settings:", error);
      alert(`Failed to save settings: ${error instanceof Error ? error.message : "Unknown error"}`);
    },
  });

  const handleSave = () => {
    updateSettings.mutate({
      ...assessment.settings,
      enableProctoring,
      requireFullScreen,
      requireSingleScreen,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Assessment Settings
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {showSuccess ? (
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm font-medium text-green-900">
              Settings saved successfully!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
                    <div>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={enableProctoring}
                          onChange={(e) => setEnableProctoring(e.target.checked)}
                          className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            Enable Video Proctoring
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                            When enabled, the assessment will use video proctoring with eye and face tracking to detect violations.
                          </p>
                        </div>
                      </label>
                    </div>
                    <div>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={requireFullScreen}
                          onChange={(e) => setRequireFullScreen(e.target.checked)}
                          className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            Require Full Screen Mode
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                            When enabled, the assessment will automatically enter full screen mode. Exiting full screen, switching tabs, or alt-tabbing will be flagged as a violation.
                          </p>
                        </div>
                      </label>
                    </div>
                    <div>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={requireSingleScreen}
                          onChange={(e) => setRequireSingleScreen(e.target.checked)}
                          className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            Require Single Screen
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                            When enabled, users must disconnect any secondary monitors before starting the assessment. Connecting a second screen during the assessment will be flagged as a violation.
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                )}

        <div className="flex gap-3 justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={updateSettings.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updateSettings.isPending ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

