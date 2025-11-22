import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Folder, FolderPlus, FileText, Plus, ChevronRight, ChevronDown, Trash2, Edit2, Menu, X, Settings, Shield } from "lucide-react";
import type { Campaign, Project, Assessment } from "@shared/schema";
import AssessmentSettingsModal from "./AssessmentSettingsModal";
import PlatformSettingsModal from "./PlatformSettingsModal";
import UserManagementModal from "./UserManagementModal";

interface DeleteConfirmState {
  type: "campaign" | "project" | "assessment";
  id: string;
  name: string;
}

interface ProjectManagerProps {
  onSelectAssessment?: (assessment: Assessment) => void;
}

export default function ProjectManager({ onSelectAssessment }: ProjectManagerProps) {
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateAssessment, setShowCreateAssessment] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newAssessmentName, setNewAssessmentName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsAssessment, setSettingsAssessment] = useState<Assessment | null>(null);
  const [projectsSectionCollapsed, setProjectsSectionCollapsed] = useState(false);
  const [showPlatformSettings, setShowPlatformSettings] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);

  const queryClient = useQueryClient();

  // Fetch campaigns
  const { data: campaigns = [], error: campaignsError } = useQuery<Campaign[]>({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch("/api/admin/campaigns", { headers });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        const errorMessage = errorData.error || `Failed to fetch campaigns: ${res.status}`;
        console.error("[ProjectManager] Error fetching campaigns:", errorMessage);
        throw new Error(errorMessage);
      }
      return res.json();
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Fetch projects for a campaign
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["projects", selectedCampaign?.id],
    queryFn: async () => {
      if (!selectedCampaign) return [];
      const token = localStorage.getItem("token");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`/api/admin/projects?campaignId=${selectedCampaign.id}`, { headers });
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
    enabled: !!selectedCampaign,
  });

  // Fetch assessments for a project
  const { data: assessments = [] } = useQuery<Assessment[]>({
    queryKey: ["assessments", selectedProject?.id],
    queryFn: async () => {
      if (!selectedProject) return [];
      const token = localStorage.getItem("token");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`/api/admin/assessments?projectId=${selectedProject.id}`, { headers });
      if (!res.ok) throw new Error("Failed to fetch assessments");
      return res.json();
    },
    enabled: !!selectedProject,
  });

  // Create campaign mutation
  const createCampaign = useMutation({
    mutationFn: async (name: string) => {
      const token = localStorage.getItem("token");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers,
        body: JSON.stringify({ name, description: "" }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `Failed to create campaign: ${res.status} ${res.statusText}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      setShowCreateCampaign(false);
      setNewCampaignName("");
    },
    onError: (error) => {
      console.error("Error creating campaign:", error);
      alert(`Failed to create campaign: ${error instanceof Error ? error.message : "Unknown error"}`);
    },
  });

  // Create project mutation
  const createProject = useMutation({
    mutationFn: async (name: string) => {
      if (!selectedCampaign) throw new Error("No campaign selected");
      const token = localStorage.getItem("token");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch("/api/admin/projects", {
        method: "POST",
        headers,
        body: JSON.stringify({ 
          name, 
          description: "",
          campaignId: selectedCampaign.id 
        }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `Failed to create project: ${res.status} ${res.statusText}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", selectedCampaign?.id] });
      setShowCreateProject(false);
      setNewProjectName("");
    },
    onError: (error) => {
      console.error("Error creating project:", error);
      alert(`Failed to create project: ${error instanceof Error ? error.message : "Unknown error"}`);
    },
  });

  // Create assessment mutation
  const createAssessment = useMutation({
    mutationFn: async (name: string) => {
      if (!selectedProject) {
        throw new Error("No project selected. Please select a project first.");
      }
      
      console.log("[ProjectManager] Creating assessment:", {
        name,
        projectId: selectedProject.id,
        projectName: selectedProject.name
      });
      
      const token = localStorage.getItem("token");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      
      const res = await fetch("/api/admin/assessments", {
        method: "POST",
        headers,
        body: JSON.stringify({ 
          name, 
          description: "",
          projectId: selectedProject.id 
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `Failed to create assessment: ${res.status} ${res.statusText}`);
      }
      
      const assessment = await res.json();
      console.log("[ProjectManager] Assessment created:", assessment);
      return assessment;
    },
    onSuccess: (data) => {
      console.log("[ProjectManager] Assessment creation success, refreshing list");
      queryClient.invalidateQueries({ queryKey: ["assessments", selectedProject?.id] });
      setShowCreateAssessment(false);
      setNewAssessmentName("");
      // Don't auto-select the assessment - let user click on it
      // setSelectedAssessment(data);
      // if (onSelectAssessment) {
      //   onSelectAssessment(data);
      // }
    },
    onError: (error) => {
      console.error("[ProjectManager] Error creating assessment:", error);
      alert(`Failed to create assessment: ${error instanceof Error ? error.message : "Unknown error"}`);
    },
  });

  // Delete mutations
  const deleteCampaign = useMutation({
    mutationFn: async (id: string) => {
      const token = localStorage.getItem("token");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`/api/admin/campaigns/${id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}: ${res.statusText}` }));
        const errorMessage = errorData.error || errorData.details || `Failed to delete campaign: ${res.status}`;
        console.error("[ProjectManager] Delete campaign error:", errorData);
        throw new Error(errorMessage);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      setDeleteConfirm(null);
      setSelectedCampaign(null);
      setSelectedProject(null);
      setSelectedAssessment(null);
    },
    onError: (error) => {
      console.error("Error deleting campaign:", error);
      alert(`Failed to delete campaign: ${error instanceof Error ? error.message : "Unknown error"}`);
    },
  });

  const deleteProject = useMutation({
    mutationFn: async (id: string) => {
      const token = localStorage.getItem("token");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`/api/admin/projects/${id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}: ${res.statusText}` }));
        const errorMessage = errorData.error || errorData.details || `Failed to delete project: ${res.status}`;
        console.error("[ProjectManager] Delete project error:", errorData);
        throw new Error(errorMessage);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", selectedCampaign?.id] });
      setDeleteConfirm(null);
      setSelectedProject(null);
      setSelectedAssessment(null);
    },
    onError: (error) => {
      console.error("Error deleting project:", error);
      alert(`Failed to delete project: ${error instanceof Error ? error.message : "Unknown error"}`);
    },
  });

  const deleteAssessment = useMutation({
    mutationFn: async (id: string) => {
      const token = localStorage.getItem("token");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`/api/admin/assessments/${id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}: ${res.statusText}` }));
        const errorMessage = errorData.error || errorData.details || `Failed to delete assessment: ${res.status}`;
        console.error("[ProjectManager] Delete assessment error:", errorData);
        throw new Error(errorMessage);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessments", selectedProject?.id] });
      setDeleteConfirm(null);
      setSelectedAssessment(null);
    },
    onError: (error) => {
      console.error("Error deleting assessment:", error);
      alert(`Failed to delete assessment: ${error instanceof Error ? error.message : "Unknown error"}`);
    },
  });

  const handleDelete = () => {
    if (!deleteConfirm) return;
    
    if (deleteConfirm.type === "campaign") {
      deleteCampaign.mutate(deleteConfirm.id);
    } else if (deleteConfirm.type === "project") {
      deleteProject.mutate(deleteConfirm.id);
    } else if (deleteConfirm.type === "assessment") {
      deleteAssessment.mutate(deleteConfirm.id);
    }
  };

  const toggleCampaign = (campaignId: string) => {
    setExpandedCampaigns(prev => {
      const next = new Set(prev);
      if (next.has(campaignId)) {
        next.delete(campaignId);
        setSelectedCampaign(null);
        setSelectedProject(null);
        setSelectedAssessment(null);
      } else {
        next.add(campaignId);
        const campaign = campaigns.find(c => c.id === campaignId);
        if (campaign) setSelectedCampaign(campaign);
      }
      return next;
    });
  };

  const toggleProject = (projectId: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
        setSelectedProject(null);
        setSelectedAssessment(null);
      } else {
        next.add(projectId);
        const project = projects.find(p => p.id === projectId);
        if (project) setSelectedProject(project);
      }
      return next;
    });
  };

  const handleSelectAssessment = (assessment: Assessment) => {
    setSelectedAssessment(assessment);
    if (onSelectAssessment) {
      onSelectAssessment(assessment);
    }
  };

  return (
    <div className="h-screen flex relative">
      {/* Collapsed State - Show button to reopen */}
      {sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(false)}
          className="absolute left-0 top-4 z-20 p-2 bg-white border border-gray-200 rounded-r-lg shadow-md hover:bg-gray-50 transition-all duration-300"
          title="Show Projects sidebar"
        >
          <Menu className="w-5 h-5 text-gray-600" />
        </button>
      )}

      {/* Sidebar */}
      <div className={`${sidebarCollapsed ? 'w-0' : 'w-80'} bg-white border-r border-gray-200 flex flex-col transition-all duration-300 overflow-hidden relative`}>
        <div className="p-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            {!sidebarCollapsed && (
              <>
                <button
                  onClick={() => setProjectsSectionCollapsed(!projectsSectionCollapsed)}
                  className="flex items-center gap-2 flex-1 text-left hover:bg-gray-50 rounded-lg p-2 -ml-2 -mr-2"
                >
                  {projectsSectionCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                  <h2 className="text-lg font-semibold text-gray-900">Projects</h2>
                </button>
                <div className="flex items-center gap-2">
                  {!projectsSectionCollapsed && (
                    <button
                      onClick={() => setShowCreateCampaign(true)}
                      className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                      title="Create Campaign"
                    >
                      <FolderPlus className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    onClick={() => setSidebarCollapsed(true)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                    title="Hide sidebar"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
          
          {showCreateCampaign && (
            <div className="mb-3 p-2 bg-gray-50 rounded border border-gray-200">
              <input
                type="text"
                value={newCampaignName}
                onChange={(e) => setNewCampaignName(e.target.value)}
                placeholder="Campaign name..."
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded mb-2"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newCampaignName.trim()) {
                    createCampaign.mutate(newCampaignName.trim());
                  } else if (e.key === "Escape") {
                    setShowCreateCampaign(false);
                    setNewCampaignName("");
                  }
                }}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (newCampaignName.trim()) {
                      createCampaign.mutate(newCampaignName.trim());
                    }
                  }}
                  className="flex-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowCreateCampaign(false);
                    setNewCampaignName("");
                  }}
                  className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {!sidebarCollapsed && !projectsSectionCollapsed && (
          <div className="flex-1 overflow-y-auto p-2">
          {campaignsError ? (
            <div className="text-center text-gray-500 text-sm py-8 px-4">
              <Folder className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p className="text-red-600 mb-2">Error loading campaigns</p>
              <p className="text-xs">{campaignsError instanceof Error ? campaignsError.message : "Please check your connection"}</p>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-8">
              <Folder className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p>No campaigns yet</p>
              <p className="text-xs mt-1">Create a campaign to get started</p>
            </div>
          ) : (
            <div className="space-y-1">
              {campaigns.map((campaign) => (
                <div key={campaign.id}>
                  <div
                    className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer group"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('.delete-btn')) return;
                      toggleCampaign(campaign.id);
                    }}
                  >
                    {expandedCampaigns.has(campaign.id) ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                    <Folder className="w-4 h-4 text-gray-500" />
                    <span className="flex-1 text-sm text-gray-900">{campaign.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm({ type: "campaign", id: campaign.id, name: campaign.name });
                      }}
                      className="delete-btn opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded text-red-600 hover:text-red-700 transition-opacity"
                      title="Delete campaign"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {expandedCampaigns.has(campaign.id) && selectedCampaign?.id === campaign.id && (
                    <div className="ml-6 mt-1 space-y-1">
                      {showCreateProject && (
                            <div className="mb-2 p-2 bg-gray-50 rounded border border-gray-200">
                              <input
                                type="text"
                                value={newProjectName}
                                onChange={(e) => setNewProjectName(e.target.value)}
                                placeholder="Project name..."
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded mb-2"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && newProjectName.trim()) {
                                    createProject.mutate(newProjectName.trim());
                                  } else if (e.key === "Escape") {
                                    setShowCreateProject(false);
                                    setNewProjectName("");
                                  }
                                }}
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    if (newProjectName.trim()) {
                                      createProject.mutate(newProjectName.trim());
                                    }
                                  }}
                                  className="flex-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                                >
                                  Create
                                </button>
                                <button
                                  onClick={() => {
                                    setShowCreateProject(false);
                                    setNewProjectName("");
                                  }}
                                  className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                      {!showCreateProject && (
                        <button
                          onClick={() => setShowCreateProject(true)}
                          className="w-full flex items-center gap-2 p-2 text-sm text-gray-600 hover:bg-gray-50 rounded"
                        >
                          <Plus className="w-4 h-4" />
                          <span>New Project</span>
                        </button>
                      )}

                      {projects.map((project) => (
                        <div key={project.id}>
                          <div
                            className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer group"
                            onClick={(e) => {
                              if ((e.target as HTMLElement).closest('.delete-btn')) return;
                              toggleProject(project.id);
                            }}
                          >
                            {expandedProjects.has(project.id) ? (
                              <ChevronDown className="w-4 h-4 text-gray-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            )}
                            <Folder className="w-4 h-4 text-blue-500" />
                            <span className="flex-1 text-sm text-gray-700">{project.name}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirm({ type: "project", id: project.id, name: project.name });
                              }}
                              className="delete-btn opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded text-red-600 hover:text-red-700 transition-opacity"
                              title="Delete project"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {expandedProjects.has(project.id) && selectedProject?.id === project.id && (
                            <div className="ml-6 mt-1 space-y-1">
                              {showCreateAssessment && (
                                <div className="mb-2 p-2 bg-gray-50 rounded border border-gray-200">
                                  <input
                                    type="text"
                                    value={newAssessmentName}
                                    onChange={(e) => setNewAssessmentName(e.target.value)}
                                    placeholder="Assessment name..."
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded mb-2"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" && newAssessmentName.trim()) {
                                        createAssessment.mutate(newAssessmentName.trim());
                                      } else if (e.key === "Escape") {
                                        setShowCreateAssessment(false);
                                        setNewAssessmentName("");
                                      }
                                    }}
                                    autoFocus
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => {
                                        if (newAssessmentName.trim()) {
                                          createAssessment.mutate(newAssessmentName.trim());
                                        }
                                      }}
                                      className="flex-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                                    >
                                      Create
                                    </button>
                                    <button
                                      onClick={() => {
                                        setShowCreateAssessment(false);
                                        setNewAssessmentName("");
                                      }}
                                      className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )}
                              <button
                                onClick={() => setShowCreateAssessment(true)}
                                className="w-full flex items-center gap-2 p-2 text-sm text-gray-600 hover:bg-gray-50 rounded"
                              >
                                <Plus className="w-4 h-4" />
                                <span>New Assessment</span>
                              </button>

                              {assessments.map((assessment) => (
                                <div
                                  key={assessment.id}
                                  className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer group"
                                  onClick={(e) => {
                                    if ((e.target as HTMLElement).closest('.delete-btn')) return;
                                    handleSelectAssessment(assessment);
                                  }}
                                >
                                  <FileText className="w-4 h-4 text-gray-500" />
                                  <span className="flex-1 text-sm text-gray-700">{assessment.name}</span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                                    assessment.status === "published" ? "bg-green-100 text-green-700" :
                                    assessment.status === "draft" ? "bg-gray-100 text-gray-700" :
                                    "bg-yellow-100 text-yellow-700"
                                  }`}>
                                    {assessment.status}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSettingsAssessment(assessment);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-700 transition-opacity"
                                    title="Assessment settings"
                                  >
                                    <Settings className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteConfirm({ type: "assessment", id: assessment.id, name: assessment.name });
                                    }}
                                    className="delete-btn opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded text-red-600 hover:text-red-700 transition-opacity"
                                    title="Delete assessment"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          </div>
        )}

        {/* User Management & Platform Settings Section */}
        {!sidebarCollapsed && (
          <div className="border-t border-gray-200 p-4 flex-shrink-0 space-y-2">
            <button
              onClick={() => setShowUserManagement(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors"
            >
              <Shield className="w-5 h-5 text-gray-600" />
              <span>User Management</span>
            </button>
            <button
              onClick={() => setShowPlatformSettings(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors"
            >
              <Settings className="w-5 h-5 text-gray-600" />
              <span>Platform Settings</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area - Only show when no assessment is selected */}
      {!selectedAssessment && (
        <div className="flex-1 bg-gray-50 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <Folder className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-medium mb-2">Select a project or assessment</p>
            <p className="text-sm">Create campaigns, projects, and assessments to organize your work</p>
          </div>
        </div>
      )}

      {/* Assessment Settings Modal */}
      {settingsAssessment && (
        <AssessmentSettingsModal
          assessment={settingsAssessment}
          onClose={() => setSettingsAssessment(null)}
        />
      )}

      {/* User Management Modal */}
      {showUserManagement && (
        <UserManagementModal onClose={() => setShowUserManagement(false)} />
      )}

      {/* Platform Settings Modal */}
      {showPlatformSettings && (
        <PlatformSettingsModal onClose={() => setShowPlatformSettings(false)} />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Delete {deleteConfirm.type === "campaign" ? "Campaign" : deleteConfirm.type === "project" ? "Project" : "Assessment"}?
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete <strong>"{deleteConfirm.name}"</strong>? 
              {deleteConfirm.type === "campaign" && " This will also delete all projects and assessments within it."}
              {deleteConfirm.type === "project" && " This will also delete all assessments within it."}
              {" This action cannot be undone."}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteCampaign.isPending || deleteProject.isPending || deleteAssessment.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteCampaign.isPending || deleteProject.isPending || deleteAssessment.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

