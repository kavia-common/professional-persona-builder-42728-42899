"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Compass,
  Award,
  Target,
  Briefcase,
  TrendingUp,
  BookOpen,
  Save,
  Check,
  Plus,
  X
} from "lucide-react";
import type { PersonaData } from "@/lib/persona";
import { useRouter } from "next/navigation";

const seedPersona: PersonaData = {
  profileSummary:
    "Product leader with experience driving discovery and execution across cross-functional teams.",
  skills: ["Product Strategy", "Leadership", "Data Analysis", "User Research"],
  careerGoals:
    "Advance into a senior product leadership role with broader strategic ownership.",
  workPreferences:
    "Collaborative environment, clear goals, autonomy with accountability, and fast learning cycles.",
  strengthAreas:
    "Structured problem solving, stakeholder alignment, and turning ambiguity into plans.",
  experienceOverview:
    "Background spanning product management and engineering, delivering multiple customer-facing products end-to-end."
};

export default function ManualValidationPage() {
  const router = useRouter();

  const [editedData, setEditedData] = useState<PersonaData>(seedPersona);
  const [newSkill, setNewSkill] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const handleFieldChange = (field: keyof PersonaData, value: string) => {
    setEditedData((prev) => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
  };

  const handleAddSkill = () => {
    if (newSkill.trim()) {
      setEditedData((prev) => ({
        ...prev,
        skills: [...prev.skills, newSkill.trim()]
      }));
      setNewSkill("");
      setHasUnsavedChanges(true);
    }
  };

  const handleRemoveSkill = (index: number) => {
    setEditedData((prev) => ({
      ...prev,
      skills: prev.skills.filter((_, i) => i !== index)
    }));
    setHasUnsavedChanges(true);
  };

  const handleSaveChanges = () => {
    // UI integration only: treat "save" as local state confirmation.
    setHasUnsavedChanges(false);
  };

  const handleConfirm = () => {
    if (hasUnsavedChanges) {
      alert("Please save your changes before confirming.");
      return;
    }
    router.push("/career-recommendations");
  };

  const calculateCompletion = () => {
    const totalFields = 6;
    let completedFields = 0;

    if (editedData.profileSummary.trim()) completedFields++;
    if (editedData.skills.length > 0) completedFields++;
    if (editedData.careerGoals.trim()) completedFields++;
    if (editedData.workPreferences.trim()) completedFields++;
    if (editedData.strengthAreas.trim()) completedFields++;
    if (editedData.experienceOverview.trim()) completedFields++;

    return Math.round((completedFields / totalFields) * 100);
  };

  const completionPercentage = calculateCompletion();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Compass className="w-8 h-8 text-[#0d9488]" />
              <span className="text-2xl font-semibold text-gray-900">
                Career Navigator
              </span>
            </div>
            <div className="flex items-center gap-4">
              {hasUnsavedChanges && (
                <span className="text-sm text-orange-600 font-medium">
                  Unsaved changes
                </span>
              )}
              <Button
                onClick={handleSaveChanges}
                variant="outline"
                className="border-[#0d9488] text-[#0d9488] hover:bg-[#f0fdfa]"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-8 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Manual Validation & Editing
              </h1>
              <p className="text-gray-600 mt-1">
                Review and refine your AI-generated persona
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-[#0d9488]">
                {completionPercentage}%
              </div>
              <div className="text-sm text-gray-600">Complete</div>
            </div>
          </div>

          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#0d9488] transition-all duration-300"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        </div>

        <div className="space-y-6">
          <Card className="shadow-lg border-gray-200">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="w-10 h-10 rounded-lg bg-[#ccfbf1] flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-[#0d9488]" />
                </div>
                Profile Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={editedData.profileSummary}
                onChange={(e) => handleFieldChange("profileSummary", e.target.value)}
                className="min-h-[120px] resize-none text-gray-700"
                placeholder="Enter your profile summary..."
              />
              <p className="text-xs text-gray-500 mt-2">
                Provide a comprehensive overview of your professional background
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-gray-200">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="w-10 h-10 rounded-lg bg-[#ccfbf1] flex items-center justify-center">
                  <Award className="w-5 h-5 text-[#0d9488]" />
                </div>
                Skills
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {editedData.skills.map((skill, index) => (
                  <div
                    key={index}
                    className="bg-[#ccfbf1] text-[#0d9488] px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 group"
                  >
                    {skill}
                    <button
                      onClick={() => handleRemoveSkill(index)}
                      className="hover:text-[#0f766e] opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Add a skill (e.g., Python, Leadership)"
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddSkill();
                    }
                  }}
                  className="flex-1 h-10"
                />
                <Button
                  type="button"
                  onClick={handleAddSkill}
                  className="bg-[#0d9488] hover:bg-[#0f766e] text-white"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Add or remove skills to accurately reflect your capabilities
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-gray-200">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="w-10 h-10 rounded-lg bg-[#ccfbf1] flex items-center justify-center">
                  <Target className="w-5 h-5 text-[#0d9488]" />
                </div>
                Career Goals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={editedData.careerGoals}
                onChange={(e) => handleFieldChange("careerGoals", e.target.value)}
                className="min-h-[100px] resize-none text-gray-700"
                placeholder="Describe your career aspirations and goals..."
              />
              <p className="text-xs text-gray-500 mt-2">
                Define your short-term and long-term career objectives
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-gray-200">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="w-10 h-10 rounded-lg bg-[#ccfbf1] flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-[#0d9488]" />
                </div>
                Work Preferences
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={editedData.workPreferences}
                onChange={(e) => handleFieldChange("workPreferences", e.target.value)}
                className="min-h-[100px] resize-none text-gray-700"
                placeholder="Describe your ideal work environment and preferences..."
              />
              <p className="text-xs text-gray-500 mt-2">
                Explain your preferred work style, environment, and collaboration approach
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-gray-200">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="w-10 h-10 rounded-lg bg-[#ccfbf1] flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-[#0d9488]" />
                </div>
                Strength Areas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={editedData.strengthAreas}
                onChange={(e) => handleFieldChange("strengthAreas", e.target.value)}
                className="min-h-[100px] resize-none text-gray-700"
                placeholder="List your key strengths and areas of excellence..."
              />
              <p className="text-xs text-gray-500 mt-2">
                Highlight what you excel at and what colleagues praise you for
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-gray-200">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="w-10 h-10 rounded-lg bg-[#ccfbf1] flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-[#0d9488]" />
                </div>
                Experience Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={editedData.experienceOverview}
                onChange={(e) => handleFieldChange("experienceOverview", e.target.value)}
                className="min-h-[120px] resize-none text-gray-700"
                placeholder="Summarize your professional experience..."
              />
              <p className="text-xs text-gray-500 mt-2">
                Provide a chronological summary of your work experience
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">
                Ready to finalize your persona?
              </h3>
              <p className="text-sm text-gray-600">
                {hasUnsavedChanges
                  ? "Save your changes before confirming your final persona."
                  : "Confirm your persona to complete the process."}
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={handleSaveChanges}
                variant="outline"
                className="border-[#0d9488] text-[#0d9488] hover:bg-[#f0fdfa]"
                disabled={!hasUnsavedChanges}
              >
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
              <Button
                onClick={handleConfirm}
                className="bg-[#0d9488] hover:bg-[#0f766e] text-white"
                disabled={hasUnsavedChanges}
              >
                <Check className="w-4 h-4 mr-2" />
                Confirm Final Persona
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
