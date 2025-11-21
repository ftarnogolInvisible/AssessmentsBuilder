import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AssessmentSubmission } from "@shared/schema";
import { Eye, Filter, Download } from "lucide-react";

interface SubmissionWithDetails extends AssessmentSubmission {
  assessment?: {
    id: string;
    name: string;
    project?: {
      id: string;
      name: string;
      campaign?: {
        id: string;
        name: string;
      };
    };
  };
}

interface SubmissionsTableProps {
  assessmentId?: string;
  onSelectSubmission: (submission: AssessmentSubmission) => void;
}

export default function SubmissionsTable({ assessmentId, onSelectSubmission }: SubmissionsTableProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [assessmentFilter, setAssessmentFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data: submissions = [], isLoading, refetch } = useQuery<SubmissionWithDetails[]>({
    queryKey: assessmentId ? ["submissions", assessmentId] : ["submissions", "all"],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const url = assessmentId 
        ? `/api/admin/assessments/${assessmentId}/submissions`
        : `/api/admin/submissions`;
      console.log(`[SubmissionsTable] Fetching submissions from: ${url}`);
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to fetch submissions" }));
        console.error(`[SubmissionsTable] Error fetching submissions:`, error);
        throw new Error(error.error || "Failed to fetch submissions");
      }
      const data = await res.json();
      console.log(`[SubmissionsTable] Fetched ${data.length} submissions`);
      if (data.length > 0) {
        console.log(`[SubmissionsTable] Sample submission:`, {
          id: data[0].id,
          assessmentId: data[0].assessmentId,
          hasAssessment: !!data[0].assessment,
          assessmentName: data[0].assessment?.name,
        });
      }
      return data;
    },
    refetchInterval: 5000, // Refetch every 5 seconds to catch new submissions
  });

  // Get unique campaigns, projects, and assessments for filters
  const campaignsMap = new Map<string, { id: string; name: string }>();
  const projectsMap = new Map<string, { id: string; name: string; campaignId?: string }>();
  const assessmentsMap = new Map<string, { id: string; name: string; projectId?: string }>();

  submissions.forEach(s => {
    const campaign = s.assessment?.project?.campaign;
    const project = s.assessment?.project;
    const assessment = s.assessment;

    if (campaign && !campaignsMap.has(campaign.id)) {
      campaignsMap.set(campaign.id, { id: campaign.id, name: campaign.name });
    }
    if (project && !projectsMap.has(project.id)) {
      projectsMap.set(project.id, { id: project.id, name: project.name, campaignId: project.campaign?.id });
    }
    if (assessment && !assessmentsMap.has(assessment.id)) {
      assessmentsMap.set(assessment.id, { id: assessment.id, name: assessment.name, projectId: assessment.project?.id });
    }
  });

  const campaigns = Array.from(campaignsMap.values());
  const projects = Array.from(projectsMap.values());
  const assessments = Array.from(assessmentsMap.values());

  const filteredSubmissions = submissions.filter(s => {
    // Status filter
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    
    // Campaign filter
    if (campaignFilter !== "all" && s.assessment?.project?.campaign?.id !== campaignFilter) return false;
    
    // Project filter
    if (projectFilter !== "all" && s.assessment?.project?.id !== projectFilter) return false;
    
    // Assessment filter
    if (assessmentFilter !== "all" && s.assessment?.id !== assessmentFilter) return false;
    
    return true;
  });

  const paginatedSubmissions = filteredSubmissions.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  const totalPages = Math.ceil(filteredSubmissions.length / pageSize);

  const handleExport = async () => {
    const token = localStorage.getItem("token");
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      // Fetch all submissions with responses
      const submissionsWithResponses = await Promise.all(
        filteredSubmissions.map(async (submission) => {
          const res = await fetch(`/api/admin/submissions/${submission.id}`, { headers });
          if (res.ok) {
            return res.json();
          }
          return submission;
        })
      );

      // Convert to CSV
      const csvRows = [
        ["Campaign", "Project", "Assessment", "First Name", "Last Name", "Email", "Status", "Score", "Max Score", "Submitted At", "Notes"].join(","),
        ...submissionsWithResponses.map((sub: any) => [
          sub.assessment?.project?.campaign?.name || "",
          sub.assessment?.project?.name || "",
          sub.assessment?.name || "",
          sub.firstName || "",
          sub.lastName || "",
          sub.email || "",
          sub.status === "to_review" ? "To Review" : sub.status === "reviewed" ? "Reviewed" : sub.status,
          sub.totalScore ?? "",
          sub.maxScore ?? "",
          sub.submittedAt ? new Date(sub.submittedAt).toISOString() : "",
          (sub.reviewerNotes || "").replace(/"/g, '""'),
        ].map(field => `"${field}"`).join(",")),
      ];

      const csvContent = csvRows.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `submissions-${assessmentId}-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export submissions");
    }
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Submissions ({filteredSubmissions.length})
            </h2>
            {assessmentId && (
              <p className="text-xs text-gray-500 mt-1">
                Showing submissions for this assessment only
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                value={campaignFilter}
                onChange={(e) => {
                  setCampaignFilter(e.target.value);
                  setProjectFilter("all");
                  setAssessmentFilter("all");
                  setPage(1);
                }}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">All Campaigns</option>
                {campaigns.map(campaign => (
                  <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                ))}
              </select>
            </div>
            <select
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.target.value);
                setAssessmentFilter("all");
                setPage(1);
              }}
              disabled={campaignFilter === "all"}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="all">All Projects</option>
              {projects
                .filter(p => campaignFilter === "all" || p.campaignId === campaignFilter)
                .map(project => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
            </select>
            <select
              value={assessmentFilter}
              onChange={(e) => {
                setAssessmentFilter(e.target.value);
                setPage(1);
              }}
              disabled={projectFilter === "all"}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="all">All Assessments</option>
              {assessments
                .filter(a => projectFilter === "all" || a.projectId === projectFilter)
                .map(assessment => (
                  <option key={assessment.id} value={assessment.id}>{assessment.name}</option>
                ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            >
              <option value="all">All Status</option>
              <option value="to_review">To Review</option>
              <option value="reviewed">Reviewed</option>
              <option value="in_progress">In Progress</option>
              <option value="abandoned">Abandoned</option>
            </select>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Campaign
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Project
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Assessment
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name / Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Score
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Submitted
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedSubmissions.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                  No submissions found
                </td>
              </tr>
            ) : (
              paginatedSubmissions.map((submission) => (
                <tr key={submission.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {submission.assessment?.project?.campaign?.name || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {submission.assessment?.project?.name || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {submission.assessment?.name || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {(submission as any).firstName && (submission as any).lastName
                        ? `${(submission as any).firstName} ${(submission as any).lastName}`
                        : submission.name || "Anonymous"}
                    </div>
                    {submission.email && (
                      <div className="text-sm text-gray-500">{submission.email}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      submission.status === "reviewed"
                        ? "bg-purple-100 text-purple-800"
                        : submission.status === "to_review"
                        ? "bg-yellow-100 text-yellow-800"
                        : submission.status === "in_progress"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-gray-100 text-gray-800"
                    }`}>
                      {submission.status === "to_review" ? "To Review" :
                       submission.status === "reviewed" ? "Reviewed" :
                       submission.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {submission.totalScore !== null && submission.maxScore !== null ? (
                      <span>
                        {submission.totalScore} / {submission.maxScore}
                      </span>
                    ) : (
                      <span className="text-gray-400">Not scored</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(submission.submittedAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => onSelectSubmission(submission)}
                      className="text-blue-600 hover:text-blue-900 flex items-center gap-1"
                    >
                      <Eye className="w-4 h-4" />
                      Review
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredSubmissions.length)} of {filteredSubmissions.length} submissions
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            <span className="px-3 py-1.5 text-sm text-gray-700">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

