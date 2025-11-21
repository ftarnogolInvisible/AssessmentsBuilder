import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ProjectManager from "@/components/admin/ProjectManager";
import AssessmentBuilder from "@/components/builder/AssessmentBuilder";
import type { Assessment } from "@shared/schema";

export default function Admin() {
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);

  // Initialize dev client in development
  useQuery({
    queryKey: ["dev-init"],
    queryFn: async () => {
      // In development mode, initialize dev client
      try {
        const res = await fetch("/api/dev/init", { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          console.log("Dev client initialized:", data);
        }
      } catch (error) {
        // Silently fail if endpoint doesn't exist (production)
        console.debug("Dev init endpoint not available (expected in production)");
      }
      return null;
    },
  });

  // Clear all data function (for development)
  const clearAllData = async () => {
    if (confirm("Are you sure you want to delete ALL campaigns, projects, and assessments? This cannot be undone!")) {
      try {
        const res = await fetch("/api/dev/clear-all", { method: "POST" });
        if (res.ok) {
          alert("All data cleared successfully!");
          window.location.reload();
        } else {
          const error = await res.json();
          alert(`Failed to clear data: ${error.error || "Unknown error"}`);
        }
      } catch (error) {
        alert(`Failed to clear data: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  };

  // Test API connection
  useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await fetch("/api/health");
      const data = await res.json();
      return data;
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 flex relative">
      {process.env.NODE_ENV === "development" && (
        <div className="fixed bottom-4 right-4 z-50">
          <button
            onClick={clearAllData}
            className="px-4 py-2 bg-red-600 text-white rounded-lg shadow-lg hover:bg-red-700 text-sm font-medium"
            title="Clear all data (dev only)"
          >
            🗑️ Clear All Data
          </button>
        </div>
      )}
      <ProjectManager onSelectAssessment={setSelectedAssessment} />
      {selectedAssessment && (
        <div className="flex-1">
          <AssessmentBuilder 
            assessment={selectedAssessment} 
            onClose={() => setSelectedAssessment(null)}
          />
        </div>
      )}
    </div>
  );
}
