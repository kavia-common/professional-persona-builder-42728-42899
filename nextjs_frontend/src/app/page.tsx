import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#ccfbf1]" />
            <span className="text-2xl font-semibold text-gray-900">
              Career Navigator
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-16 space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">
          UI Pages (Integrated)
        </h1>
        <p className="text-gray-600">
          Navigate to the provided workflow screens:
        </p>

        <div className="grid sm:grid-cols-2 gap-4">
          <Link
            href="/document-upload"
            className="rounded-2xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition"
          >
            <div className="font-semibold text-gray-900">Document Upload</div>
            <div className="text-sm text-gray-600 mt-1">
              Upload resume, feedback, and job description
            </div>
          </Link>

          <Link
            href="/ai-persona-draft"
            className="rounded-2xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition"
          >
            <div className="font-semibold text-gray-900">AI Persona Draft</div>
            <div className="text-sm text-gray-600 mt-1">
              Draft persona preview/loading state
            </div>
          </Link>

          <Link
            href="/manual-validation"
            className="rounded-2xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition"
          >
            <div className="font-semibold text-gray-900">
              Manual Validation Loop
            </div>
            <div className="text-sm text-gray-600 mt-1">
              Edit and confirm persona fields
            </div>
          </Link>

          <Link
            href="/career-recommendations"
            className="rounded-2xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition"
          >
            <div className="font-semibold text-gray-900">
              Career Recommendation
            </div>
            <div className="text-sm text-gray-600 mt-1">
              View recommended roles and skill gaps
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
