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
