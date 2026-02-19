"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Compass,
  Target,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Bookmark,
  TrendingUp,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import type { PersonaData } from "@/lib/persona";

interface CareerRole {
  id: string;
  roleName: string;
  matchPercentage: number;
  description: string;
  requiredSkills: string[];
}

const seedPersona: PersonaData = {
  profileSummary:
    "Validated persona summary used for recommendations.",
  skills: ["Product Strategy", "Leadership", "Data Analysis", "User Research"],
  careerGoals:
    "Move into senior product leadership roles with strategic scope.",
  workPreferences:
    "Collaborative, outcome-driven teams and iterative delivery.",
  strengthAreas:
    "Strategic thinking, communication, and execution planning.",
  experienceOverview:
    "Experience leading discovery, delivery, and stakeholder alignment."
};

export default function CareerRecommendationsPage() {
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);

  const personaData = seedPersona;

  const careerRoles: CareerRole[] = [
    {
      id: "1",
      roleName: "Senior Product Manager",
      matchPercentage: 92,
      description: "Matches your product strategy skills and leadership experience",
      requiredSkills: [
        "Product Strategy",
        "Agile Methodologies",
        "Data Analysis",
        "User Research",
        "Leadership",
        "Stakeholder Management",
        "Strategic Planning",
        "Product Roadmap",
        "Market Research"
      ]
    },
    {
      id: "2",
      roleName: "VP of Product",
      matchPercentage: 78,
      description: "Aligns with your career goals and strategic planning capabilities",
      requiredSkills: [
        "Product Strategy",
        "Leadership",
        "Strategic Planning",
        "Stakeholder Management",
        "Executive Presence",
        "Team Building",
        "Budget Management",
        "Organizational Design",
        "Vision Setting"
      ]
    },
    {
      id: "3",
      roleName: "Principal Product Manager",
      matchPercentage: 85,
      description: "Leverages your technical background and cross-functional leadership",
      requiredSkills: [
        "Product Strategy",
        "Technical Architecture",
        "Leadership",
        "Data Analysis",
        "Innovation",
        "Mentorship",
        "System Design",
        "API Design",
        "Agile Methodologies"
      ]
    },
    {
      id: "4",
      roleName: "Director of Product Management",
      matchPercentage: 81,
      description: "Fits your management experience and team leadership strengths",
      requiredSkills: [
        "Product Strategy",
        "Leadership",
        "Team Management",
        "Strategic Planning",
        "Stakeholder Management",
        "Hiring",
        "Performance Management",
        "Cross-functional Collaboration",
        "Data Analysis"
      ]
    }
  ];

  const handleToggleRoadmap = (roleId: string) => {
    setExpandedRoleId(expandedRoleId === roleId ? null : roleId);
  };

  const getSkillMatch = (role: CareerRole) => {
    const userSkills = personaData.skills.map((s) => s.toLowerCase());

    const matchedSkills = role.requiredSkills.filter((skill) =>
      userSkills.some(
        (userSkill) =>
          userSkill.includes(skill.toLowerCase()) ||
          skill.toLowerCase().includes(userSkill)
      )
    );

    const unmatchedSkills = role.requiredSkills.filter(
      (skill) =>
        !userSkills.some(
          (userSkill) =>
            userSkill.includes(skill.toLowerCase()) ||
            skill.toLowerCase().includes(userSkill)
        )
    );

    const matchPercentage = Math.round(
      (matchedSkills.length / role.requiredSkills.length) * 100
    );

    return { matchedSkills, unmatchedSkills, matchPercentage };
  };

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
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Your Career Path Recommendations
          </h1>
          <p className="text-gray-600 mt-2">
            AI-powered career suggestions based on your validated professional persona
          </p>
        </div>

        <Card className="shadow-lg border-gray-200 mb-8">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-xl">
              <div className="w-10 h-10 rounded-lg bg-[#ccfbf1] flex items-center justify-center">
                <Target className="w-5 h-5 text-[#0d9488]" />
              </div>
              Your Finalized Professional Persona
            </CardTitle>
            <p className="text-sm text-gray-600 mt-2">
              Recommendations are based on your validated professional persona
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Extracted Skills
              </h3>
              <div className="flex flex-wrap gap-2">
                {personaData.skills.map((skill, index) => (
                  <Badge
                    key={index}
                    className="bg-[#ccfbf1] text-[#0d9488] border-[#0d9488] px-3 py-1.5 text-sm font-medium"
                  >
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Career Interests
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                {personaData.careerGoals}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Strength Areas
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                {personaData.strengthAreas}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Work Preferences
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                {personaData.workPreferences}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Recommended Career Roles
          </h2>
        </div>

        <div className="space-y-4">
          {careerRoles.map((role) => {
            const isExpanded = expandedRoleId === role.id;
            const { matchedSkills, unmatchedSkills, matchPercentage } =
              getSkillMatch(role);

            return (
              <Card key={role.id} className="shadow-lg border-gray-200">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold text-gray-900">
                          {role.roleName}
                        </h3>
                        <div className="flex items-center gap-2">
                          <div className="px-3 py-1 bg-[#ccfbf1] rounded-lg">
                            <span className="text-[#0d9488] font-bold text-lg">
                              {role.matchPercentage}%
                            </span>
                          </div>
                          <span className="text-sm text-gray-600">AI Match</span>
                        </div>
                      </div>
                      <p className="text-gray-600 text-sm">{role.description}</p>
                    </div>
                  </div>

                  <Button
                    onClick={() => handleToggleRoadmap(role.id)}
                    variant="outline"
                    className="border-[#0d9488] text-[#0d9488] hover:bg-[#f0fdfa] w-full sm:w-auto"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="w-4 h-4 mr-2" />
                        Hide Career Roadmap
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4 mr-2" />
                        View Career Roadmap
                      </>
                    )}
                  </Button>

                  {isExpanded && (
                    <div className="mt-6 pt-6 border-t border-gray-200 space-y-6">
                      <div className="bg-[#f0fdfa] border border-[#0d9488] rounded-lg p-4">
                        <div className="flex items-center gap-3">
                          <TrendingUp className="w-6 h-6 text-[#0d9488]" />
                          <div>
                            <p className="text-gray-900 font-semibold">
                              You currently match {matchPercentage}% of the required skills for this role.
                            </p>
                            <p className="text-sm text-gray-600 mt-1">
                              {matchedSkills.length} of {role.requiredSkills.length} skills aligned
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <div className="flex items-center gap-2 mb-4">
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                            <h4 className="font-semibold text-gray-900">
                              Skills You Already Have
                            </h4>
                          </div>
                          <div className="space-y-2">
                            {matchedSkills.length > 0 ? (
                              matchedSkills.map((skill, index) => (
                                <div
                                  key={index}
                                  className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg"
                                >
                                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                                  <span className="text-sm text-gray-700">
                                    {skill}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-gray-500 italic">
                                No matching skills found
                              </p>
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center gap-2 mb-4">
                            <AlertCircle className="w-5 h-5 text-orange-600" />
                            <h4 className="font-semibold text-gray-900">
                              Skills You Need to Develop
                            </h4>
                          </div>
                          <div className="space-y-2">
                            {unmatchedSkills.length > 0 ? (
                              unmatchedSkills.map((skill, index) => (
                                <div
                                  key={index}
                                  className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg"
                                >
                                  <AlertCircle className="w-4 h-4 text-orange-600 shrink-0" />
                                  <span className="text-sm text-gray-700">
                                    {skill}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-gray-500 italic">
                                You have all required skills!
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 pt-4">
                        <Button className="bg-[#0d9488] hover:bg-[#0f766e] text-white flex-1">
                          <BookOpen className="w-4 h-4 mr-2" />
                          Explore Learning Path
                        </Button>
                        <Button
                          variant="outline"
                          className="border-[#0d9488] text-[#0d9488] hover:bg-[#f0fdfa] flex-1"
                        >
                          <Bookmark className="w-4 h-4 mr-2" />
                          Save Career Path
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
