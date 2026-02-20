"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { UploadArea } from "@/components/UploadArea";
import { Compass, FileText, Briefcase, MessageSquare, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

type BuildStatusResponse = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  progress: number;
  message?: string | null;
  currentStep?: string | null;
  updatedAt: string;
};

type UploadResponse = {
  uploadId: string;
  receivedFiles: Array<{
    fieldname: string;
    originalname: string;
    mimetype: string;
    size: number;
  }>;
  message: string;
};

type OrchestrationRunAllResponse = {
  build: { id: string; status: string; progress: number };
  orchestration: Record<string, unknown>;
  results?: Record<string, unknown>;
};

function getBackendBaseUrl() {
  // Prefer same-origin proxy routes if added later; fallback to localhost during dev.
  // ENV (recommended): NEXT_PUBLIC_BACKEND_URL (e.g., http://localhost:3001)
  return process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
}

async function assertOk(res: Response) {
  if (res.ok) return;

  let details: unknown = null;
  try {
    details = await res.json();
  } catch (_) {
    // ignore
  }

  const message =
    (details as any)?.message ||
    (details as any)?.error ||
    `Request failed with ${res.status}`;

  throw new Error(message);
}

// PUBLIC_INTERFACE
export default function DocumentUploadPage() {
  /** Document upload page: requires Resume + Performance Review + Job Description; uploads and runs orchestration before navigating. */
  const router = useRouter();

  // Enforce one file per category to keep UX simple and align with orchestration's 3 primary categories.
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [performanceReviewFile, setPerformanceReviewFile] = useState<File | null>(
    null
  );
  const [jobDescriptionFile, setJobDescriptionFile] = useState<File | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [progressText, setProgressText] = useState<string>("");

  const canGenerate = Boolean(resumeFile && performanceReviewFile && jobDescriptionFile);

  const totalFiles = useMemo(() => {
    let n = 0;
    if (resumeFile) n += 1;
    if (performanceReviewFile) n += 1;
    if (jobDescriptionFile) n += 1;
    return n;
  }, [resumeFile, performanceReviewFile, jobDescriptionFile]);

  const handleResumeUpload = (files: FileList) =>
    setResumeFile(files && files[0] ? files[0] : null);

  const handlePerformanceReviewUpload = (files: FileList) =>
    setPerformanceReviewFile(files && files[0] ? files[0] : null);

  const handleJobDescUpload = (files: FileList) =>
    setJobDescriptionFile(files && files[0] ? files[0] : null);

  const pollBuildStatus = async (buildId: string) => {
    const baseUrl = getBackendBaseUrl();

    // Poll up to ~2 minutes (240 * 500ms) before timing out.
    const maxAttempts = 240;
    const delayMs = 500;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(`${baseUrl}/builds/${buildId}/status`, {
        method: "GET"
      });
      // eslint-disable-next-line no-await-in-loop
      await assertOk(res);

      // eslint-disable-next-line no-await-in-loop
      const status: BuildStatusResponse = await res.json();

      setProgress(status.progress);
      setProgressText(status.currentStep || status.message || status.status);

      if (
        status.status === "succeeded" ||
        status.status === "failed" ||
        status.status === "cancelled"
      ) {
        return status;
      }

      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, delayMs));
    }

    throw new Error("Timed out waiting for build to complete. Please try again.");
  };

  const uploadCategorizedDocuments = async () => {
    const baseUrl = getBackendBaseUrl();

    if (!resumeFile || !performanceReviewFile || !jobDescriptionFile) {
      throw new Error("Missing required documents.");
    }

    const form = new FormData();

    // Backend expects: multipart field "files" (array)
    form.append("files", resumeFile);
    form.append("files", performanceReviewFile);
    form.append("files", jobDescriptionFile);

    // Require all categories on the backend too (additive validation).
    form.append("requireCategories", "true");

    // Provide per-file categories using index mapping to avoid filename collisions.
    // Categories are canonical per backend: resume | job_description | performance_review
    const categoryByIndex = {
      "0": "resume",
      "1": "performance_review",
      "2": "job_description"
    };
    form.append("categoryByIndexJson", JSON.stringify(categoryByIndex));

    setProgress(null);
    setProgressText("Uploading documents...");

    const res = await fetch(`${baseUrl}/uploads/documents`, {
      method: "POST",
      body: form
    });
    await assertOk(res);

    const upload: UploadResponse = await res.json();
    return upload;
  };

  const handleGenerate = async () => {
    if (!canGenerate) {
      alert("Please upload all required documents (Resume, Job Description, Performance Review).");
      return;
    }

    setIsSubmitting(true);
    try {
      await uploadCategorizedDocuments();

      // Run orchestration end-to-end.
      // We intentionally rely on backend default: useLatestCategoryDocs=true,
      // so it will pick the latest docs for the 3 primary categories.
      setProgressText("Starting AI persona build...");
      const baseUrl = getBackendBaseUrl();

      const runAllRes = await fetch(`${baseUrl}/orchestration/run-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "workflow",
          useLatestCategoryDocs: true,
          autoCreatePersona: true
        })
      });
      await assertOk(runAllRes);

      const runAll: OrchestrationRunAllResponse = await runAllRes.json();
      const buildId = runAll.build?.id;

      if (!buildId) {
        throw new Error("Backend did not return a build id.");
      }

      setProgressText("Processing documents and generating persona...");
      const finalStatus = await pollBuildStatus(buildId);

      if (finalStatus.status !== "succeeded") {
        throw new Error(
          finalStatus.message ||
            `Build did not succeed (status=${finalStatus.status}).`
        );
      }

      // Navigate only after the workflow has completed. Pass buildId so the draft page
      // can fetch the orchestration artifacts (personaDraft, etc).
      router.push(`/ai-persona-draft?buildId=${encodeURIComponent(buildId)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      alert(msg);
    } finally {
      setIsSubmitting(false);
      setProgress(null);
      setProgressText("");
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <Compass className="w-8 h-8 text-[#0d9488]" />
            <span className="text-2xl font-semibold text-gray-900">
              Career Navigator
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="text-center mb-12 space-y-4">
          <h1 className="text-4xl font-bold text-gray-900">
            Build Your Professional Persona
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Upload your resume, job description, and a performance review to generate
            your AI-powered persona draft.
          </p>
        </div>

        <div className="space-y-6 mb-8">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-[#ccfbf1] flex items-center justify-center flex-shrink-0">
                <FileText className="w-6 h-6 text-[#0d9488]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Resume Upload</h3>
                <p className="text-sm text-gray-600">Required</p>
              </div>
            </div>
            <UploadArea
              label=""
              acceptedFormats="PDF, DOCX (Max 10MB)"
              multiple={false}
              onFileSelect={handleResumeUpload}
            />
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-[#ccfbf1] flex items-center justify-center flex-shrink-0">
                <MessageSquare className="w-6 h-6 text-[#0d9488]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Performance Review / 360 Feedback
                </h3>
                <p className="text-sm text-gray-600">Required</p>
              </div>
            </div>
            <UploadArea
              label=""
              acceptedFormats="PDF, DOCX (Max 10MB)"
              multiple={false}
              onFileSelect={handlePerformanceReviewUpload}
            />
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-[#ccfbf1] flex items-center justify-center flex-shrink-0">
                <Briefcase className="w-6 h-6 text-[#0d9488]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Current Job Description
                </h3>
                <p className="text-sm text-gray-600">Required</p>
              </div>
            </div>
            <UploadArea
              label=""
              acceptedFormats="PDF, DOCX, TXT (Max 5MB)"
              multiple={false}
              onFileSelect={handleJobDescUpload}
            />
          </div>
        </div>

        <div className="bg-gray-50 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600">Documents Uploaded</div>
              <div className="text-2xl font-bold text-gray-900">{totalFiles}</div>
            </div>

            <div className="text-right">
              <div className="text-sm text-gray-600">Ready to generate</div>
              <div className="text-sm font-medium text-[#0d9488]">
                {canGenerate ? "✓ Ready" : "Upload all 3 required documents"}
              </div>
            </div>
          </div>

          {isSubmitting && (
            <div className="rounded-xl bg-white border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-[#0d9488] animate-spin" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">
                    {progressText || "Working..."}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {typeof progress === "number"
                      ? `Progress: ${progress}%`
                      : "Preparing..."}
                  </div>
                  {typeof progress === "number" && (
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden mt-2">
                      <div
                        className="h-full bg-[#0d9488] transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <Button
            onClick={handleGenerate}
            disabled={!canGenerate || isSubmitting}
            className="w-full bg-[#0d9488] hover:bg-[#0f766e] text-white h-12 text-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Generating..." : "Generate Persona"}
          </Button>

          {!canGenerate && (
            <p className="text-xs text-center text-gray-500">
              Please upload Resume, Performance Review, and Job Description to continue
            </p>
          )}
        </div>

        <p className="text-xs text-gray-500 mt-4">
          Note: Configure <code className="font-mono">NEXT_PUBLIC_BACKEND_URL</code> to
          point to the Express backend (default: http://localhost:3001).
        </p>
      </div>
    </div>
  );
}
