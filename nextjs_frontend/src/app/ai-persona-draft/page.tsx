"use client";

import { useEffect, useState } from "react";
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
import { useRouter } from "next/navigation";
import type { PersonaData } from "@/lib/persona";

export default function AIPersonaDraftPage() {
  const router = useRouter();
  const [personaData, setPersonaData] = useState<PersonaData | null>(null);

  // Simulate async persona generation so the loading state matches the provided UI.
  useEffect(() => {
    const t = setTimeout(() => {
      setPersonaData({
        profileSummary:
          "Product leader with a strong track record of shipping customer-centric experiences and aligning cross-functional teams.",
        skills: [
          "Product Strategy",
          "Stakeholder Management",
          "Data Analysis",
          "User Research",
          "Leadership",
          "Agile Methodologies"
        ],
        careerGoals:
          "Grow into a senior product leadership role driving strategy and outcomes across multiple product lines.",
        workPreferences:
          "Collaborative, outcomes-driven teams with clear ownership and fast iteration cycles.",
        strengthAreas:
          "Strategic thinking, communication, and translating ambiguity into execution plans.",
        experienceOverview:
          "10+ years across product management and technology roles, leading discovery, delivery, and go-to-market."
      });
    }, 1200);

    return () => clearTimeout(t);
  }, []);

  const isLoading = !personaData;

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
              <h2 className="text-2xl font-bold text-gray-900">
                AI is building your professional persona...
              </h2>
              <p className="text-gray-600">
                Analyzing your documents and extracting key insights
              </p>
            </div>
            <div className="flex gap-2">
              <div className="w-2 h-2 rounded-full bg-[#0d9488] animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-2 h-2 rounded-full bg-[#0d9488] animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-2 h-2 rounded-full bg-[#0d9488] animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        ) : (
          <>
            <div className="text-center mb-12 space-y-4">
              <div className="inline-flex items-center gap-2 bg-[#ccfbf1] text-[#0d9488] px-4 py-2 rounded-full text-sm font-medium">
                ✓ Persona Generated
              </div>
              <h1 className="text-4xl font-bold text-gray-900">
                Your AI-Generated Professional Persona
              </h1>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Review your automatically generated persona draft. You can edit any section to refine the details.
              </p>
            </div>

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
                  <p className="text-gray-700 leading-relaxed">
                    {personaData.experienceOverview}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-center">
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
      </div>
    </div>
  );
}
