"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UploadArea } from "@/components/UploadArea";
import { Compass, FileText, Briefcase, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";

export default function DocumentUploadPage() {
  const router = useRouter();
  const [resumeFiles, setResumeFiles] = useState<File[]>([]);
  const [feedbackFiles, setFeedbackFiles] = useState<File[]>([]);
  const [jobDescFiles, setJobDescFiles] = useState<File[]>([]);

  const handleGenerate = () => {
    if (
      resumeFiles.length === 0 &&
      feedbackFiles.length === 0 &&
      jobDescFiles.length === 0
    ) {
      alert("Please upload at least one document to continue.");
      return;
    }

    // For this subtask, we only integrate UI pages and routing (no new pages).
    // Navigation proceeds to the AI persona draft screen.
    router.push("/ai-persona-draft");
  };

  const handleResumeUpload = (files: FileList) => setResumeFiles(Array.from(files));
  const handleFeedbackUpload = (files: FileList) => setFeedbackFiles(Array.from(files));
  const handleJobDescUpload = (files: FileList) => setJobDescFiles(Array.from(files));

  const totalFiles = resumeFiles.length + feedbackFiles.length + jobDescFiles.length;

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
            Upload your professional documents to generate your AI-powered persona draft.
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
                <p className="text-sm text-gray-600">Upload your current resume or CV</p>
              </div>
            </div>
            <UploadArea
              label=""
              acceptedFormats="PDF, DOCX (Max 10MB)"
              multiple={true}
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
                <p className="text-sm text-gray-600">
                  Upload performance reviews or feedback documents
                </p>
              </div>
            </div>
            <UploadArea
              label=""
              acceptedFormats="PDF, DOCX (Max 10MB)"
              multiple={true}
              onFileSelect={handleFeedbackUpload}
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
                <p className="text-sm text-gray-600">
                  Upload your current or target job description
                </p>
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
                {totalFiles > 0 ? "✓ Ready" : "Upload documents"}
              </div>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={totalFiles === 0}
            className="w-full bg-[#0d9488] hover:bg-[#0f766e] text-white h-12 text-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Generate Persona
          </Button>

          {totalFiles === 0 && (
            <p className="text-xs text-center text-gray-500">
              Please upload at least one document to continue
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
