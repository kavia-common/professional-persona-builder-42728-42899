"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Compass,
  User,
  Award,
  Target,
  Briefcase,
  TrendingUp,
  BookOpen,
  Loader2,
  Edit
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { PersonaData } from "@/lib/persona";

type BackendError = {
  error?: string;
  message?: string | null;
};

type OrchestrationRecord = Record<string, unknown> & {
  buildId?: string;
  personaDraft?: unknown;
  draftPersona?: unknown;
  persona?: unknown;
  results?: Record<string, unknown>;
};

type PersonaDraftV1 = {
  schemaVersion: string;
  title: string;
  summary: string;
  profile: {
    headline: string;
    seniority: string | null;
    industry: string | null;
    location: string | null;
  };
  strengths: string[];
  skills: string[];
  experienceHighlights: string[];
  provenance: {
    source: string;
    sourceTextLength: number;
  };
};

function getBackendBaseUrl() {
  // ENV (recommended): NEXT_PUBLIC_BACKEND_URL (e.g., http://localhost:3001)
  return process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
}

async function readError(res: Response): Promise<string> {
  let details: BackendError | null = null;
  try {
    details = (await res.json()) as BackendError;
  } catch (_) {
    // ignore
  }
  return (
    details?.message ||
    details?.error ||
    `Request failed with status ${res.status}`
  );
}

function isPersonaDraftV1(x: unknown): x is PersonaDraftV1 {
  if (!x || typeof x !== "object") return false;
  const o = x as any;
  return (
    typeof o.schemaVersion === "string" &&
    typeof o.title === "string" &&
    typeof o.summary === "string" &&
    o.profile &&
    typeof o.profile === "object" &&
    typeof o.profile.headline === "string" &&
    Array.isArray(o.skills) &&
    Array.isArray(o.strengths) &&
    Array.isArray(o.experienceHighlights)
  );
}

function coerceStringArray(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x.filter((v) => typeof v === "string" && v.trim().length > 0);
}

function personaDataFromDraft(draft: unknown): PersonaData | null {
  // Map backend PersonaDraft schema into the UI's existing PersonaData fields.
  if (isPersonaDraftV1(draft)) {
    const headline = draft.profile?.headline?.trim();
    const title = draft.title?.trim();
    const summary = draft.summary?.trim();

    const profileSummary =
      [title, headline, summary].filter(Boolean).join(" — ") || summary || title;

    return {
      profileSummary: profileSummary || "Persona summary unavailable.",
      skills: coerceStringArray(draft.skills),
      careerGoals:
        "Review and refine your goals in the manual validation step.", // backend draft doesn't currently include explicit goals
      workPreferences:
        "Review and refine your work preferences in the manual validation step.", // not present in draft
      strengthAreas: coerceStringArray(draft.strengths).join(", "),
      experienceOverview: coerceStringArray(draft.experienceHighlights).join("\n")
    };
  }

  // Fallback: attempt to map if backend returns something close to PersonaData already.
  const o = draft as any;
  if (
    o &&
    typeof o === "object" &&
    typeof o.profileSummary === "string" &&
    Array.isArray(o.skills)
  ) {
    return {
      profileSummary: o.profileSummary ?? "",
      skills: coerceStringArray(o.skills),
      careerGoals: o.careerGoals ?? "",
      workPreferences: o.workPreferences ?? "",
      strengthAreas: o.strengthAreas ?? "",
      experienceOverview: o.experienceOverview ?? ""
    };
  }

  return null;
}

function extractPersonaDraft(orchestration: OrchestrationRecord): unknown {
  // Backend orchestration record is intentionally flexible; try likely keys.
  const o: any = orchestration;
  return (
    o.personaDraft ||
    o.draftPersona ||
    o.persona ||
    (o.results && (o.results.personaDraft || o.results.persona))
  );
}

// PUBLIC_INTERFACE
export default function AIPersonaDraftPage() {
  /** AI Persona Draft: loads orchestration artifacts (persona draft) by buildId and renders the draft into the existing UI plus JSON preview. */
  const router = useRouter();
  const searchParams = useSearchParams();
  const buildId = searchParams.get("buildId");

  const [personaData, setPersonaData] = useState<PersonaData | null>(null);
  const [personaDraftJson, setPersonaDraftJson] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const hasBuildId = Boolean(buildId);

  const titleText = useMemo(() => {
    if (!hasBuildId) return "Missing buildId";
    if (error) return "Unable to load persona draft";
    if (!personaData) return "AI is building your professional persona...";
    return "Your AI-Generated Professional Persona";
  }, [error, hasBuildId, personaData]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!buildId) {
        setError(
          "No buildId was provided. Please start from Document Upload and generate a persona."
        );
        return;
      }

      setError(null);
      setPersonaData(null);
      setPersonaDraftJson(null);

      const baseUrl = getBackendBaseUrl();
      const res = await fetch(`${baseUrl}/orchestration/builds/${buildId}`, {
        method: "GET"
      });

      if (!res.ok) {
        const msg = await readError(res);
        if (!cancelled) setError(msg);
        return;
      }

      const orchestration: OrchestrationRecord = await res.json();
      const draft = extractPersonaDraft(orchestration);

      const mapped = personaDataFromDraft(draft);

      if (!cancelled) {
        setPersonaDraftJson(draft ?? orchestration);
        setPersonaData(mapped);
        if (!mapped) {
          setError(
            "Persona draft loaded, but it did not match the expected schema. Showing raw JSON below."
          );
        }
      }
    }

    load().catch((e) => {
      const msg = e instanceof Error ? e.message : "Failed to load persona draft.";
      if (!cancelled) setError(msg);
    });

    return () => {
      cancelled = true;
    };
  }, [buildId]);

  const isLoading = !personaData && !error;

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

      <div className="max-w-6xl mx-auto px-6 py-16">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-[#ccfbf1] flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-[#0d9488] animate-spin" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-gray-900">{titleText}</h2>
              <p className="text-gray-600">
                Fetching orchestration results from the backend...
              </p>
              {buildId && (
                <p className="text-xs text-gray-500">
                  buildId: <code className="font-mono">{buildId}</code>
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <div
                className="w-2 h-2 rounded-full bg-[#0d9488] animate-bounce"
                style={{ animationDelay: "0ms" }}
              />
              <div
                className="w-2 h-2 rounded-full bg-[#0d9488] animate-bounce"
                style={{ animationDelay: "150ms" }}
              />
              <div
                className="w-2 h-2 rounded-full bg-[#0d9488] animate-bounce"
                style={{ animationDelay: "300ms" }}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="text-center mb-12 space-y-4">
              <div className="inline-flex items-center gap-2 bg-[#ccfbf1] text-[#0d9488] px-4 py-2 rounded-full text-sm font-medium">
                ✓ Persona Generated
              </div>
              <h1 className="text-4xl font-bold text-gray-900">{titleText}</h1>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Review your automatically generated persona draft. You can edit any
                section to refine the details.
              </p>
              {buildId && (
                <p className="text-xs text-gray-500">
                  buildId: <code className="font-mono">{buildId}</code>
                </p>
              )}
              {error && (
                <div className="max-w-2xl mx-auto rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-left">
                  <div className="text-sm font-semibold text-orange-800">
                    Note
                  </div>
                  <div className="text-sm text-orange-700 mt-1">{error}</div>
                  <div className="text-sm text-orange-700 mt-3">
                    <Button
                      variant="outline"
                      className="border-[#0d9488] text-[#0d9488] hover:bg-[#f0fdfa]"
                      onClick={() => router.push("/document-upload")}
                    >
                      Go back to upload
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {personaData && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  <Card className="shadow-lg border-gray-200 lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <User className="w-5 h-5 text-[#0d9488]" />
                        Profile Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-700 leading-relaxed">
                        {personaData.profileSummary}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="shadow-lg border-gray-200">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Award className="w-5 h-5 text-[#0d9488]" />
                        Extracted Skills
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {personaData.skills.map((skill, index) => (
                          <div
                            key={index}
                            className="bg-[#ccfbf1] text-[#0d9488] px-3 py-1.5 rounded-lg text-sm font-medium"
                          >
                            {skill}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="shadow-lg border-gray-200">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Target className="w-5 h-5 text-[#0d9488]" />
                        Career Goals
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-700 leading-relaxed">
                        {personaData.careerGoals}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="shadow-lg border-gray-200">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Briefcase className="w-5 h-5 text-[#0d9488]" />
                        Work Preferences
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-700 leading-relaxed">
                        {personaData.workPreferences}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="shadow-lg border-gray-200">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <TrendingUp className="w-5 h-5 text-[#0d9488]" />
                        Strength Areas
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-700 leading-relaxed">
                        {personaData.strengthAreas}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="shadow-lg border-gray-200 lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <BookOpen className="w-5 h-5 text-[#0d9488]" />
                        Experience Overview
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                        {personaData.experienceOverview}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="flex justify-center mb-10">
                  <Button
                    onClick={() => router.push("/manual-validation")}
                    className="bg-[#0d9488] hover:bg-[#0f766e] text-white px-8 py-6 h-auto text-base"
                  >
                    <Edit className="w-5 h-5 mr-2" />
                    Edit Persona
                  </Button>
                </div>
              </>
            )}

            <Card className="shadow-lg border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg">Persona Draft (Raw JSON)</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-4 overflow-auto max-h-[480px]">
                  {JSON.stringify(personaDraftJson, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
