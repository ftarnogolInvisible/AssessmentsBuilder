import { useRoute } from "wouter";
import AssessmentTaker from "@/components/assessment/AssessmentTaker";

export default function Assessment() {
  const [, params] = useRoute("/assessment/:publicUrl");
  const publicUrl = params?.publicUrl;

  if (!publicUrl) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Invalid assessment link</p>
        </div>
      </div>
    );
  }

  return <AssessmentTaker publicUrl={publicUrl} />;
}

