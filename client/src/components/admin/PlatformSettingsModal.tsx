import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, CheckCircle, Eye, EyeOff, Key } from "lucide-react";
import type { PlatformSettings } from "@shared/schema";

interface PlatformSettingsModalProps {
  onClose: () => void;
}

interface LLMConfig {
  openai: {
    apiKey?: string;
    enabled: boolean;
    model: string;
  };
  googleGemini: {
    apiKey?: string;
    enabled: boolean;
    model: string;
  };
  openRouter: {
    apiKey?: string;
    enabled: boolean;
    defaultModel: string;
  };
}

export default function PlatformSettingsModal({ onClose }: PlatformSettingsModalProps) {
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    openai: { apiKey: "", enabled: false, model: "gpt-4" },
    googleGemini: { apiKey: "", enabled: false, model: "gemini-pro" },
    openRouter: { apiKey: "", enabled: false, defaultModel: "openai/gpt-4" },
  });
  const [showKeys, setShowKeys] = useState({
    openai: false,
    googleGemini: false,
    openRouter: false,
  });
  const [showSuccess, setShowSuccess] = useState(false);

  const queryClient = useQueryClient();

  // Fetch current settings
  const { data: settings, isLoading } = useQuery<PlatformSettings>({
    queryKey: ["platform-settings"],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/platform-settings", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
  });

  // Update settings when loaded
  useEffect(() => {
    if (settings?.llmConfig) {
      setLlmConfig({
        openai: {
          apiKey: "", // Don't show existing keys for security
          enabled: settings.llmConfig.openai?.enabled || false,
          model: (settings.llmConfig.openai?.model || "gpt-4") as string,
        },
        googleGemini: {
          apiKey: "",
          enabled: settings.llmConfig.googleGemini?.enabled || false,
          model: (settings.llmConfig.googleGemini?.model || "gemini-pro") as string,
        },
        openRouter: {
          apiKey: "",
          enabled: settings.llmConfig.openRouter?.enabled || false,
          defaultModel: (settings.llmConfig.openRouter?.defaultModel || "openai/gpt-4") as string,
        },
      });
    }
  }, [settings]);

  const updateSettings = useMutation({
    mutationFn: async (config: LLMConfig) => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/platform-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ llmConfig: config }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Failed to update settings" }));
        throw new Error(errorData.error || `Failed to update settings: ${res.status}`);
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
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
    // Only send API keys if they were changed (not empty)
    const configToSave: LLMConfig = {
      openai: {
        ...llmConfig.openai,
        apiKey: llmConfig.openai.apiKey || undefined,
      },
      googleGemini: {
        ...llmConfig.googleGemini,
        apiKey: llmConfig.googleGemini.apiKey || undefined,
      },
      openRouter: {
        ...llmConfig.openRouter,
        apiKey: llmConfig.openRouter.apiKey || undefined,
      },
    };
    updateSettings.mutate(configToSave);
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl p-6">
          <p>Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Platform Settings</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {showSuccess ? (
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm font-medium text-green-900">Settings saved successfully!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* LLM API Keys Section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Key className="w-5 h-5 text-gray-600" />
                <h4 className="text-md font-semibold text-gray-900">LLM API Keys</h4>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Configure API keys for AI features. Keys are encrypted and stored securely. 
                Leave API key field empty to keep the existing key unchanged.
              </p>

              {/* OpenAI */}
              <div className="mb-4 p-4 border border-gray-200 rounded-lg">
                <label className="flex items-center gap-3 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={llmConfig.openai.enabled}
                    onChange={(e) =>
                      setLlmConfig({
                        ...llmConfig,
                        openai: { ...llmConfig.openai, enabled: e.target.checked },
                      })
                    }
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                  />
                  <span className="font-medium text-gray-900">OpenAI</span>
                </label>
                {llmConfig.openai.enabled && (
                  <div className="space-y-3 mt-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        API Key
                      </label>
                      <div className="relative">
                        <input
                          type={showKeys.openai ? "text" : "password"}
                          value={llmConfig.openai.apiKey}
                          onChange={(e) =>
                            setLlmConfig({
                              ...llmConfig,
                              openai: { ...llmConfig.openai, apiKey: e.target.value },
                            })
                          }
                          placeholder="sk-..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg pr-10"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowKeys({ ...showKeys, openai: !showKeys.openai })
                          }
                          className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                        >
                          {showKeys.openai ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Leave empty to keep existing key. Enter new key to update.
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Model
                      </label>
                      <select
                        value={llmConfig.openai.model}
                        onChange={(e) =>
                          setLlmConfig({
                            ...llmConfig,
                            openai: { ...llmConfig.openai, model: e.target.value },
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="gpt-4">GPT-4</option>
                        <option value="gpt-4-turbo">GPT-4 Turbo</option>
                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Google Gemini */}
              <div className="mb-4 p-4 border border-gray-200 rounded-lg">
                <label className="flex items-center gap-3 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={llmConfig.googleGemini.enabled}
                    onChange={(e) =>
                      setLlmConfig({
                        ...llmConfig,
                        googleGemini: { ...llmConfig.googleGemini, enabled: e.target.checked },
                      })
                    }
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                  />
                  <span className="font-medium text-gray-900">Google Gemini</span>
                </label>
                {llmConfig.googleGemini.enabled && (
                  <div className="space-y-3 mt-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        API Key
                      </label>
                      <div className="relative">
                        <input
                          type={showKeys.googleGemini ? "text" : "password"}
                          value={llmConfig.googleGemini.apiKey}
                          onChange={(e) =>
                            setLlmConfig({
                              ...llmConfig,
                              googleGemini: { ...llmConfig.googleGemini, apiKey: e.target.value },
                            })
                          }
                          placeholder="AIza..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg pr-10"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowKeys({ ...showKeys, googleGemini: !showKeys.googleGemini })
                          }
                          className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                        >
                          {showKeys.googleGemini ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Leave empty to keep existing key. Enter new key to update.
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Model
                      </label>
                      <select
                        value={llmConfig.googleGemini.model}
                        onChange={(e) =>
                          setLlmConfig({
                            ...llmConfig,
                            googleGemini: { ...llmConfig.googleGemini, model: e.target.value },
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="gemini-pro">Gemini Pro</option>
                        <option value="gemini-pro-vision">Gemini Pro Vision</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* OpenRouter */}
              <div className="mb-4 p-4 border border-gray-200 rounded-lg">
                <label className="flex items-center gap-3 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={llmConfig.openRouter.enabled}
                    onChange={(e) =>
                      setLlmConfig({
                        ...llmConfig,
                        openRouter: { ...llmConfig.openRouter, enabled: e.target.checked },
                      })
                    }
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                  />
                  <span className="font-medium text-gray-900">OpenRouter</span>
                </label>
                {llmConfig.openRouter.enabled && (
                  <div className="space-y-3 mt-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        API Key
                      </label>
                      <div className="relative">
                        <input
                          type={showKeys.openRouter ? "text" : "password"}
                          value={llmConfig.openRouter.apiKey}
                          onChange={(e) =>
                            setLlmConfig({
                              ...llmConfig,
                              openRouter: { ...llmConfig.openRouter, apiKey: e.target.value },
                            })
                          }
                          placeholder="sk-or-..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg pr-10"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowKeys({ ...showKeys, openRouter: !showKeys.openRouter })
                          }
                          className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                        >
                          {showKeys.openRouter ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Leave empty to keep existing key. Enter new key to update.
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Default Model
                      </label>
                      <input
                        type="text"
                        value={llmConfig.openRouter.defaultModel}
                        onChange={(e) =>
                          setLlmConfig({
                            ...llmConfig,
                            openRouter: { ...llmConfig.openRouter, defaultModel: e.target.value },
                          })
                        }
                        placeholder="openai/gpt-4"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Format: provider/model (e.g., openai/gpt-4, anthropic/claude-3)
                      </p>
                    </div>
                  </div>
                )}
              </div>
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

