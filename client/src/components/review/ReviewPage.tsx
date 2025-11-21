import { useState } from "react";
import { AssessmentSubmission } from "@shared/schema";
import SubmissionsTable from "./SubmissionsTable";
import ReviewerView from "./ReviewerView";

interface ReviewPageProps {
  assessmentId?: string;
}

export default function ReviewPage({ assessmentId }: ReviewPageProps) {
  const [selectedSubmission, setSelectedSubmission] = useState<AssessmentSubmission | null>(null);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Review Submissions</h1>
        <p className="text-gray-600 mt-1">Review and score assessment submissions</p>
      </div>

      <SubmissionsTable
        assessmentId={assessmentId}
        onSelectSubmission={setSelectedSubmission}
      />

      {selectedSubmission && (
        <ReviewerView
          submission={selectedSubmission}
          assessmentId={selectedSubmission.assessmentId}
          onClose={() => setSelectedSubmission(null)}
        />
      )}
    </div>
  );
}

