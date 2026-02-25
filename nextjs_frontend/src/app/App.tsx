'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, Loader2, X, Edit3, Plus, CheckCircle2, Camera, Award, Compass } from 'lucide-react';
import {
  getBuildStatus,
  listPersonaVersions,
  orchestrationRunAll,
  updatePersona,
  type BuildStatus,
  type PersonaVersion,
  type UUID,
} from '../lib/apiClient';

const bgImage = '/assets/24fa192a7a1db10ae3078a00cc00f09e2f26b6de.png';

type AppState = 'initial' | 'processing' | 'draft' | 'finalized';

interface Experience {
  id: string;
  role: string;
  company: string;
  date: string;
  description: string;
}

/**
 * UI Persona shape (legacy from the integrated template).
 * Backend persona JSON is currently represented/stored as arbitrary JSON and/or as a strict PersonaDraft.
 * We keep this UI model but now populate it from backend draft/final JSON when available.
 */
interface PersonaData {
  name: string;
  title: string;
  summary: string;
  skills: string[];
  experiences: Experience[];
  education: string[];
  certifications: string[];
  tools: string[];
  industries: string[];
  yearsOfExperience: string;
  careerHighlights: string[];
  profileImage?: string;
}

interface UploadedFileData {
  id: string;
  file: File;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === 'string' && v.trim().length > 0) as string[];
}

function coercePersonaDataFromBackendJson(personaJson: any, fallback: PersonaData): PersonaData {
  // Attempt to map the backend "PersonaDraft" into this UI's legacy PersonaData fields.
  // If fields aren't present, we keep the existing fallback.
  try {
    const title = typeof personaJson?.title === 'string' ? personaJson.title : fallback.title;

    const nameFromTitle =
      typeof personaJson?.profile?.headline === 'string' ? personaJson.profile.headline : fallback.name;

    const summary = typeof personaJson?.summary === 'string' ? personaJson.summary : fallback.summary;

    const skills = asStringArray(personaJson?.skills);
    const experienceHighlights = asStringArray(personaJson?.experienceHighlights);

    return {
      ...fallback,
      name: nameFromTitle,
      title,
      summary,
      skills: skills.length > 0 ? skills : fallback.skills,
      careerHighlights: experienceHighlights.length > 0 ? experienceHighlights : fallback.careerHighlights,
    };
  } catch {
    return fallback;
  }
}

export default function App() {
  const [state, setState] = useState<AppState>('initial');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileData[]>([]);
  const [uploadError, setUploadError] = useState<string>('');

  // Backend-driven workflow state
  const [backendError, setBackendError] = useState<string>('');
  const [buildId, setBuildId] = useState<UUID | null>(null);
  const [personaId, setPersonaId] = useState<UUID | null>(null);
  const [buildStatus, setBuildStatus] = useState<BuildStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Version history state
  const [versions, setVersions] = useState<PersonaVersion[]>([]);
  const [versionsError, setVersionsError] = useState<string>('');
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  const [isEditable, setIsEditable] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isHoveringHeading, setIsHoveringHeading] = useState(false);
  const [isAddingSkill, setIsAddingSkill] = useState(false);
  const [newSkillValue, setNewSkillValue] = useState('');
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profileImageInputRef = useRef<HTMLInputElement>(null);
  const newSkillInputRef = useRef<HTMLInputElement>(null);

  const initialPersonaFallback = useMemo<PersonaData>(
    () => ({
      name: 'Sarah Johnson',
      title: 'Senior Product Manager',
      summary:
        'Results-driven Product Manager with 8+ years of experience leading cross-functional teams to deliver innovative SaaS solutions. Proven track record in strategic planning, user-centered design, and data-driven decision making. Passionate about transforming complex business challenges into elegant product experiences.',
      skills: ['Product Strategy', 'Agile/Scrum', 'User Research', 'Data Analytics', 'Roadmap Planning', 'Stakeholder Management'],
      experiences: [
        {
          id: '1',
          role: 'Senior Product Manager',
          company: 'TechCorp Solutions',
          date: '2020 - Present',
          description:
            'Leading product development for enterprise SaaS platform serving 500K+ users. Increased user engagement by 45% through data-driven feature prioritization.',
        },
        {
          id: '2',
          role: 'Product Manager',
          company: 'Innovation Labs',
          date: '2017 - 2020',
          description:
            'Managed end-to-end product lifecycle for B2B marketplace. Successfully launched 3 major features that contributed to 30% revenue growth.',
        },
      ],
      education: ['MBA, Stanford University', 'BS Computer Science, UC Berkeley'],
      certifications: ['Certified Scrum Product Owner (CSPO)', 'Google Analytics Certified'],
      tools: ['Jira', 'Figma', 'Mixpanel', 'Tableau', 'Amplitude'],
      industries: ['SaaS', 'Enterprise Software', 'B2B Marketplace'],
      yearsOfExperience: '8+',
      careerHighlights: [
        'Drove 45% increase in user engagement across enterprise platform',
        'Led cross-functional team of 12 members to successful product launch',
        'Achieved 30% revenue growth through strategic feature prioritization',
        'Delivered 3 major product releases under budget and ahead of schedule',
      ],
    }),
    []
  );

  const [personaData, setPersonaData] = useState<PersonaData>(initialPersonaFallback);

  const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt'];
  const MAX_FILES = 5;

  const validateFile = (file: File): boolean => {
    const fileName = file.name.toLowerCase();
    const isValid = ALLOWED_EXTENSIONS.some((ext) => fileName.endsWith(ext));
    return isValid;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      addFiles(newFiles);
    }
  };

  const addFiles = (files: File[]) => {
    setUploadError('');
    setBackendError('');

    // Check if adding these files would exceed the limit
    if (uploadedFiles.length + files.length > MAX_FILES) {
      setUploadError(`Maximum ${MAX_FILES} documents allowed.`);
      return;
    }

    // Validate all files
    const invalidFiles = files.filter((file) => !validateFile(file));
    if (invalidFiles.length > 0) {
      setUploadError('Unsupported file format. Please upload PDF, DOCX, or TXT.');
      return;
    }

    // Add valid files
    const newUploadedFiles = files.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
    }));

    setUploadedFiles([...uploadedFiles, ...newUploadedFiles]);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      const newFiles = Array.from(e.dataTransfer.files);
      addFiles(newFiles);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const removeFile = (id: string) => {
    setUploadedFiles(uploadedFiles.filter((f) => f.id !== id));
    setUploadError('');
  };

  const handleGenerateDraft = async () => {
    setBackendError('');
    setVersionsError('');
    setVersions([]);
    setIsEditable(false);
    setHasUnsavedChanges(false);

    // Start backend-driven orchestration, then poll /builds/{id}/status for progress.
    try {
      setState('processing');

      const files = uploadedFiles.map((f) => f.file);

      // Use /orchestration/run-all (it will handle start + extract + draft generation).
      // It can also auto-select latest category docs in DB mode, but for this UI we always supply files.
      // NOTE: /uploads/documents side-effects persist + extract + normalize, but it doesn't return documentIds.
      // run-all can proceed without explicit documentIds if the backend supports category auto-selection.
      // For now, rely on backend's run-all flow (it can select latest category docs) while we just upload.
      //
      // We still need to upload to establish latest docs on the backend; orchestration can then pick them up.
      // To keep the UI simple, we do not require user to tag categories in this step.
      await import('../lib/apiClient').then(async ({ uploadDocuments }) => {
        await uploadDocuments({ files });
      });

      const runAll = await orchestrationRunAll({
        mode: 'persona_build',
        // Leave userId null for now; backend supports null userId in scaffold.
        useLatestCategoryDocs: true,
        autoCreatePersona: true,
        generate: {
          saveDraft: true,
          createVersion: true,
        },
      });

      setBuildId(runAll.build.id);
      setPersonaId(runAll.results.generate.personaId ?? null);
      setBuildStatus({
        id: runAll.build.id,
        status: runAll.build.status,
        progress: runAll.build.progress,
        message: runAll.build.message ?? null,
        currentStep: runAll.build.currentStep ?? null,
        updatedAt: runAll.build.updatedAt,
      });

      // If the backend already produced persona artifacts immediately, we can enter draft state.
      // Otherwise we keep "processing" and let polling transition us.
      if (runAll.build.status === 'succeeded') {
        setState('draft');
      } else {
        setState('processing');
      }
    } catch (e: any) {
      setState('initial');
      setBackendError(e?.message || 'Failed to generate draft persona.');
    }
  };

  const handleSaveChanges = async () => {
    // Persist edited persona JSON as a new version in backend (if persona exists).
    // In scaffold mode without DB, backend may return 503; we surface the error.
    try {
      setBackendError('');
      if (!personaId) {
        // If no personaId is available, we still show local "saved" behavior.
        setHasUnsavedChanges(false);
        setShowSaveSuccess(true);
        setTimeout(() => setShowSaveSuccess(false), 3000);
        return;
      }

      await updatePersona({
        personaId,
        title: personaData.title,
        // Store the whole UI persona as personaJson for now.
        personaJson: personaData as any,
      });

      setHasUnsavedChanges(false);
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 3000);

      // Refresh versions list after save
      await refreshVersions(personaId);
    } catch (e: any) {
      setBackendError(e?.message || 'Failed to save changes to backend.');
    }
  };

  const handleFinalize = () => {
    setState('finalized');
    setIsEditable(false);
  };

  async function refreshVersions(id: UUID) {
    setIsLoadingVersions(true);
    setVersionsError('');
    try {
      const resp = await listPersonaVersions(id);
      const sorted = [...resp.versions].sort((a, b) => b.version - a.version);
      setVersions(sorted);
    } catch (e: any) {
      setVersionsError(e?.message || 'Failed to load version history.');
    } finally {
      setIsLoadingVersions(false);
    }
  }

  // Poll build progress while processing
  useEffect(() => {
    if (!buildId) return;
    if (state !== 'processing') return;

    let cancelled = false;
    setIsPolling(true);

    const interval = setInterval(async () => {
      try {
        const status = await getBuildStatus(buildId);
        if (cancelled) return;
        setBuildStatus(status);

        if (status.status === 'succeeded') {
          setState('draft');
        } else if (status.status === 'failed' || status.status === 'cancelled') {
          setBackendError(status.message || `Build ${status.status}.`);
          setState('initial');
        }
      } catch (e: any) {
        if (cancelled) return;
        setBackendError(e?.message || 'Failed to poll build status.');
        setState('initial');
      }
    }, 800);

    return () => {
      cancelled = true;
      setIsPolling(false);
      clearInterval(interval);
    };
  }, [buildId, state]);

  // When we enter draft state, attempt to fetch orchestration artifacts and populate UI persona (best-effort).
  useEffect(() => {
    if (!buildId) return;
    if (state !== 'draft') return;

    let cancelled = false;
    (async () => {
      try {
        const { getOrchestrationByBuild } = await import('../lib/apiClient');
        const orch = await getOrchestrationByBuild(buildId);
        if (cancelled) return;

        // Try a few known locations; orchestration record shape is "additionalProperties: true".
        const maybeDraft =
          (orch as any)?.draftPersona ||
          (orch as any)?.draft ||
          (orch as any)?.artifacts?.draft ||
          (orch as any)?.artifacts?.personaDraft;

        if (maybeDraft) {
          setPersonaData((prev) => coercePersonaDataFromBackendJson(maybeDraft, prev));
        }
      } catch {
        // best-effort only; ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [buildId, state]);

  // Load versions whenever personaId becomes available.
  useEffect(() => {
    if (!personaId) return;
    refreshVersions(personaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId]);

  const removeSkill = (skillToRemove: string) => {
    setPersonaData({
      ...personaData,
      skills: personaData.skills.filter(s => s !== skillToRemove)
    });
    setHasUnsavedChanges(true);
  };

  const addSkill = (skill: string) => {
    if (skill.trim()) {
      setPersonaData({
        ...personaData,
        skills: [...personaData.skills, skill.trim()]
      });
      setHasUnsavedChanges(true);
    }
  };

  const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        setPersonaData({
          ...personaData,
          profileImage: reader.result as string
        });
        setHasUnsavedChanges(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const removeExperience = (id: string) => {
    setPersonaData({
      ...personaData,
      experiences: personaData.experiences.filter(exp => exp.id !== id)
    });
    setHasUnsavedChanges(true);
  };

  const currentStep = state === 'initial' || state === 'processing' ? 1 : state === 'draft' ? 2 : 3;
  const step1Complete = state === 'draft' || state === 'finalized';
  const step2Complete = state === 'finalized';
  const step3Complete = state === 'finalized';

  const getFileType = (fileName: string): string => {
    const extension = fileName.split('.').pop()?.toUpperCase();
    return extension || 'FILE';
  };

  return (
    <div 
      className="min-h-screen"
      style={{
        backgroundImage: `url(${bgImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        fontFamily: 'Inter, sans-serif'
      }}
    >
      {/* Header */}
      <header className="bg-white border-b" style={{ borderColor: '#D1D5DB' }}>
        <div style={{ padding: '16px 32px' }} className="flex items-center justify-between">
  
  {/* LEFT - Logo */}
  <div className="flex items-center gap-3">
    <div 
      className="w-9 h-9 rounded-lg flex items-center justify-center"
      style={{ 
        backgroundColor: '#14B8A6',
        boxShadow: '0 2px 4px rgba(20, 184, 166, 0.15)'
      }}
    >
      <Compass size={20} style={{ color: 'white' }} />
    </div>
    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1F2937', margin: 0 }}>
      Career Navigator
    </h1>
  </div>

  {/* RIGHT - Profile Circle */}
  <div className="relative">
    <button
      onClick={() => setIsProfileOpen(!isProfileOpen)}
      className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200"
      style={{
        backgroundColor: '#14B8A6',
        color: 'white',
        fontSize: '14px',
        fontWeight: 600
      }}
    >
      SJ
    </button>

    <AnimatePresence>
      {isProfileOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="absolute right-0 mt-2 w-40 bg-white rounded-lg"
          style={{
            border: '1px solid #D1D5DB',
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.08)'
          }}
        >
          <button className="w-full text-left px-4 py-2 hover:bg-gray-50">
            Profile Settings
          </button>
          <button className="w-full text-left px-4 py-2 hover:bg-gray-50 text-red-600">
            Logout
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  </div>

</div>
      </header>

      {/* Step Progress */}
      <div className="bg-white" style={{ padding: '24px 32px', borderBottom: '1px solid #D1D5DB' }}>
        <div className="flex items-center justify-center gap-4 max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300"
              style={{
                backgroundColor: step1Complete ? '#14B8A6' : (currentStep === 1 ? '#14B8A6' : 'transparent'),
                border: step1Complete || currentStep === 1 ? 'none' : '2px solid #D1D5DB',
                color: step1Complete || currentStep === 1 ? 'white' : '#D1D5DB',
                fontSize: '16px',
                fontWeight: 600
              }}
            >
              1
            </div>
            <span 
              style={{ 
                fontSize: '14px', 
                fontWeight: 500,
                color: step1Complete || currentStep === 1 ? '#1F2937' : '#6B7280'
              }}
            >
              Ingestion Hub
            </span>
          </div>
          
          <div 
            className="h-0.5 w-12 transition-colors duration-300"
            style={{ backgroundColor: step1Complete ? '#14B8A6' : '#D1D5DB' }}
          />

          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300"
              style={{
                backgroundColor: step2Complete ? '#14B8A6' : (currentStep === 2 ? '#14B8A6' : 'transparent'),
                border: step2Complete || currentStep === 2 ? 'none' : '2px solid #D1D5DB',
                color: step2Complete || currentStep === 2 ? 'white' : '#D1D5DB',
                fontSize: '16px',
                fontWeight: 600
              }}
            >
              2
            </div>
            <span 
              style={{ 
                fontSize: '14px', 
                fontWeight: 500,
                color: step2Complete || currentStep === 2 ? '#1F2937' : '#6B7280'
              }}
            >
              Persona Validation
            </span>
          </div>

          <div 
            className="h-0.5 w-12 transition-colors duration-300"
            style={{ backgroundColor: step2Complete ? '#14B8A6' : '#D1D5DB' }}
          />

          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300"
              style={{
                backgroundColor: step3Complete ? '#14B8A6' : (currentStep === 3 ? '#14B8A6' : 'transparent'),
                border: step3Complete || currentStep === 3 ? 'none' : '2px solid #D1D5DB',
                color: step3Complete || currentStep === 3 ? 'white' : '#D1D5DB',
                fontSize: '16px',
                fontWeight: 600
              }}
            >
              3
            </div>
            <span 
              style={{ 
                fontSize: '14px', 
                fontWeight: 500,
                color: step3Complete || currentStep === 3 ? '#1F2937' : '#6B7280'
              }}
            >
              Finalized Persona
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main style={{ padding: state === 'finalized' ? '48px 32px' : '48px 32px' }}>
        {/* Initial State */}
        {state === 'initial' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="max-w-2xl mx-auto text-center"
          >
            <motion.h2 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              onMouseEnter={() => setIsHoveringHeading(true)}
              onMouseLeave={() => setIsHoveringHeading(false)}
              className="relative inline-block cursor-default"
              style={{ 
                fontSize: '36px', 
                fontWeight: 700, 
                color: '#14B8A6', 
                marginBottom: '8px',
                transition: 'color 0.3s ease'
              }}
            >
              View Current State Persona
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: isHoveringHeading ? 1 : 0 }}
                transition={{ duration: 0.3 }}
                style={{
                  position: 'absolute',
                  bottom: '-4px',
                  left: 0,
                  right: 0,
                  height: '2px',
                  backgroundColor: '#14B8A6',
                  transformOrigin: 'left'
                }}
              />
            </motion.h2>
            <p style={{ fontSize: '16px', color: '#6B7280', marginBottom: '32px' }}>
              Upload your Professional Documents to generate your AI-powered Persona
            </p>

            <div 
              className="bg-white rounded-xl p-8 transition-all duration-300 group"
              style={{ 
                boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.05)',
                marginBottom: '24px',
                border: '1px solid rgba(20, 184, 166, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.border = '1px solid #14B8A6';
                e.currentTarget.style.boxShadow = '0px 6px 16px rgba(20, 184, 166, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.border = '1px solid rgba(20, 184, 166, 0.3)';
                e.currentTarget.style.boxShadow = '0px 4px 12px rgba(0, 0, 0, 0.05)';
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className="border-2 border-dashed rounded-xl p-12 cursor-pointer transition-colors hover:bg-gray-50"
                style={{ 
                  borderColor: '#D1D5DB',
                  backgroundColor: uploadedFiles.length > 0 ? 'rgba(20, 184, 166, 0.05)' : 'transparent'
                }}
              >
                <Upload 
                  className="mx-auto mb-4" 
                  size={48} 
                  style={{ color: '#14B8A6' }}
                />
                <p style={{ fontSize: '16px', fontWeight: 500, color: '#1F2937', marginBottom: '8px' }}>
                  {uploadedFiles.length > 0 
                    ? `${uploadedFiles.length} file(s) uploaded` 
                    : 'Upload your Documents '}
                </p>
                <p style={{ fontSize: '14px', color: '#6B7280' }}>
                  Resume, Job Description, Performance Review, Certifications
                </p>
                <p style={{ fontSize: '14px', color: '#6B7280' }}>
                  Supported formats: PDF, DOCX, TXT (Max {MAX_FILES} files)
                </p>
              </div>

              {uploadError && (
                <motion.p 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{ 
                    fontSize: '14px', 
                    color: '#DC2626', 
                    marginTop: '12px',
                    textAlign: 'center'
                  }}
                >
                  {uploadError}
                </motion.p>
              )}

              {uploadedFiles.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="mt-6 space-y-2"
                >
                  {uploadedFiles.map((fileData) => (
                    <div
                      key={fileData.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span 
                          className="px-2 py-1 rounded text-xs font-medium"
                          style={{ 
                            backgroundColor: 'rgba(20, 184, 166, 0.1)',
                            color: '#14B8A6'
                          }}
                        >
                          {getFileType(fileData.file.name)}
                        </span>
                        <span style={{ fontSize: '14px', color: '#1F2937', fontWeight: 500 }}>
                          {fileData.file.name}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(fileData.id);
                        }}
                        className="p-1 rounded hover:bg-gray-200 transition-colors"
                        style={{ color: '#6B7280' }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </div>

            <button
              onClick={handleGenerateDraft}
              disabled={uploadedFiles.length === 0}
              className="rounded-lg transition-all duration-200"
              style={{
                backgroundColor: uploadedFiles.length > 0 ? '#14B8A6' : '#D1D5DB',
                color: uploadedFiles.length > 0 ? 'white' : '#6B7280',
                padding: '12px 20px',
                fontSize: '14px',
                fontWeight: 500,
                border: 'none',
                cursor: uploadedFiles.length > 0 ? 'pointer' : 'not-allowed'
              }}
              onMouseEnter={(e) => {
                if (uploadedFiles.length > 0) {
                  e.currentTarget.style.backgroundColor = '#0FB9B1';
                }
              }}
              onMouseLeave={(e) => {
                if (uploadedFiles.length > 0) {
                  e.currentTarget.style.backgroundColor = '#14B8A6';
                }
              }}
            >
              Generate Draft Persona
            </button>
          </motion.div>
        )}

        {/* Processing/Draft State - Two Column Layout */}
        {(state === 'processing' || state === 'draft') && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="max-w-7xl mx-auto"
            style={{ paddingBottom: isEditable && state === 'draft' ? '100px' : '0' }}
          >
            <motion.h2 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              onMouseEnter={() => setIsHoveringHeading(true)}
              onMouseLeave={() => setIsHoveringHeading(false)}
              className="relative inline-block cursor-default mx-auto"
              style={{ 
                fontSize: state === 'draft' ? '36px' : '32px', 
                fontWeight: 700, 
                color: state === 'draft' ? '#14B8A6' : '#1F2937', 
                marginBottom: '32px',
                display: 'block',
                textAlign: 'center',
                transition: 'all 0.3s ease'
              }}
            >
              {state === 'processing' ? 'View Current State Persona' : 'Draft Persona'}
              {state === 'draft' && isHoveringHeading && (
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.3 }}
                  style={{
                    position: 'absolute',
                    bottom: '-4px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '100%',
                    height: '2px',
                    backgroundColor: '#14B8A6',
                    boxShadow: '0 0 8px rgba(20, 184, 166, 0.4)',
                    transformOrigin: 'left'
                  }}
                />
              )}
            </motion.h2>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
              {/* Left Column - Upload Status */}
              <motion.div
                initial={{ x: state === 'draft' ? 0 : -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.1, ease: 'easeInOut' }}
                className="lg:col-span-2"
              >
                {state === 'draft' && (
  <button
    onClick={() => setState('initial')}
    className="mb-4 flex items-center gap-2 transition-all duration-200 hover:opacity-80"
    style={{
      color: '#14B8A6',
      fontWeight: 500,
      fontSize: '14px',
      background: 'none',
      border: 'none',
      cursor: 'pointer'
    }}
  >
    ← Go Back
  </button>
)}
                <div 
                  className="bg-white rounded-xl transition-all duration-300"
                  style={{ 
                    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.05)',
                    padding: '24px',
                    border: '1px solid rgba(20, 184, 166, 0.3)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.border = '1px solid #14B8A6';
                    e.currentTarget.style.boxShadow = '0px 6px 16px rgba(20, 184, 166, 0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.border = '1px solid rgba(20, 184, 166, 0.3)';
                    e.currentTarget.style.boxShadow = '0px 4px 12px rgba(0, 0, 0, 0.05)';
                  }}
                >
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1F2937', marginBottom: '16px' }}>
                    Uploaded Documents
                  </h3>
                  
                  <div className="space-y-3 mb-6">
                    {uploadedFiles.map((fileData) => (
                      <div
                        key={fileData.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-gray-50"
                      >
                        <div className="flex items-center gap-3">
                          <span 
                            className="px-2 py-1 rounded text-xs font-medium"
                            style={{ 
                              backgroundColor: 'rgba(20, 184, 166, 0.1)',
                              color: '#14B8A6'
                            }}
                          >
                            {getFileType(fileData.file.name)}
                          </span>
                          <span style={{ fontSize: '14px', color: '#1F2937', fontWeight: 500 }}>
                            {fileData.file.name}
                          </span>
                        </div>
                        {state === 'draft' && (
                          <button
                            onClick={() => removeFile(fileData.id)}
                            className="p-1 rounded hover:bg-gray-200 transition-colors"
                            style={{ color: '#6B7280' }}
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 mb-3">
                    {state === 'processing' ? (
                      <>
                        <Loader2 className="animate-spin" size={16} style={{ color: '#14B8A6' }} />
                        <span
                          className="rounded-full px-3 py-1"
                          style={{
                            backgroundColor: 'rgba(20, 184, 166, 0.1)',
                            color: '#14B8A6',
                            fontSize: '12px',
                            fontWeight: 500,
                          }}
                        >
                          {buildStatus
                            ? `Processing (${buildStatus.progress}%)${buildStatus.currentStep ? ` · ${buildStatus.currentStep}` : ''}`
                            : 'Processing...'}
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} style={{ color: '#22C55E' }} />
                        <span
                          className="rounded-full px-3 py-1"
                          style={{
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            color: '#22C55E',
                            fontSize: '12px',
                            fontWeight: 500,
                          }}
                        >
                          Processed
                        </span>
                      </>
                    )}
                  </div>

                  {/* Backend error banner (best-effort; shown where user is looking) */}
                  {backendError && (
                    <div
                      className="mb-4 rounded-lg p-3"
                      style={{
                        backgroundColor: 'rgba(220, 38, 38, 0.08)',
                        border: '1px solid rgba(220, 38, 38, 0.25)',
                        color: '#DC2626',
                        fontSize: '13px',
                        lineHeight: '1.4',
                      }}
                    >
                      {backendError}
                    </div>
                  )}

                  {/* Version history (if persona exists / backend configured) */}
                  {state === 'draft' && (
                    <div className="mb-2">
                      <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937', marginBottom: '10px' }}>
                        Version History
                      </h4>

                      {isLoadingVersions ? (
                        <div className="flex items-center gap-2" style={{ color: '#6B7280', fontSize: '13px' }}>
                          <Loader2 className="animate-spin" size={14} />
                          Loading versions...
                        </div>
                      ) : versionsError ? (
                        <div style={{ color: '#DC2626', fontSize: '13px' }}>{versionsError}</div>
                      ) : versions.length === 0 ? (
                        <div style={{ color: '#6B7280', fontSize: '13px' }}>
                          {personaId ? 'No versions found yet.' : 'No saved persona yet (versions available after save).'}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {versions.slice(0, 5).map((v) => (
                            <div
                              key={v.id}
                              className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                            >
                              <div style={{ fontSize: '13px', color: '#1F2937', fontWeight: 500 }}>
                                v{v.version}
                              </div>
                              <div style={{ fontSize: '12px', color: '#6B7280' }}>
                                {new Date(v.createdAt).toLocaleString()}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {state === 'draft' && (
                    <>
                      <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '16px' }}>
                        Draft persona generated successfully.
                      </p>
                      
                      {uploadedFiles.length < MAX_FILES && (
                        <>
                          <input
                            type="file"
                            accept=".pdf,.docx,.txt"
                            multiple
                            onChange={handleFileChange}
                            className="hidden"
                            id="additional-upload"
                          />
                          <button
                            onClick={() => document.getElementById('additional-upload')?.click()}
                            className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-3 transition-colors hover:bg-gray-50"
                            style={{
                              borderColor: '#D1D5DB',
                              color: '#6B7280',
                              fontSize: '14px',
                              fontWeight: 500
                            }}
                          >
                            <Plus size={16} />
                            Add More Documents ({uploadedFiles.length}/{MAX_FILES})
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </motion.div>

              {/* Right Column - Draft Persona */}
              {state === 'draft' && (
                <motion.div
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.2 }}
                  className="lg:col-span-3"
                >
                  <div 
                    className="bg-white rounded-xl transition-all duration-300"
                    style={{ 
                      boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.05)',
                      padding: '24px',
                      border: '1px solid rgba(20, 184, 166, 0.3)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.border = '1px solid #14B8A6';
                      e.currentTarget.style.boxShadow = '0px 6px 16px rgba(20, 184, 166, 0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.border = '1px solid rgba(20, 184, 166, 0.3)';
                      e.currentTarget.style.boxShadow = '0px 4px 12px rgba(0, 0, 0, 0.05)';
                    }}
                  >
                    <div className="flex items-center justify-between mb-6">
                      <h3 
                        style={{ 
                          fontSize: '20px', 
                          fontWeight: 700, 
                          color: '#14B8A6',
                          transition: 'filter 0.3s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.filter = 'drop-shadow(0 0 8px rgba(20, 184, 166, 0.4))';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.filter = 'none';
                        }}
                      >
                        Draft Persona
                      </h3>
                      <div className="flex items-center gap-2">
                        {isEditable && (
                          <button
                            onClick={handleSaveChanges}
                            className="flex items-center gap-2 rounded-lg transition-all duration-200"
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#14B8A6',
                              color: 'white',
                              border: 'none',
                              fontSize: '14px',
                              fontWeight: 500
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#0FB9B1';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#14B8A6';
                            }}
                          >
                            Save Changes
                          </button>
                        )}
                        <AnimatePresence>
                          {showSaveSuccess && (
                            <motion.span
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -10 }}
                              transition={{ duration: 0.3 }}
                              className="flex items-center gap-1.5"
                              style={{
                                fontSize: '14px',
                                color: '#22C55E',
                                fontWeight: 500
                              }}
                            >
                              <CheckCircle2 size={16} />
                              Changes saved successfully.
                            </motion.span>
                          )}
                        </AnimatePresence>
                        <button
                          onClick={() => setIsEditable(!isEditable)}
                          className="flex items-center gap-2 rounded-lg transition-colors"
                          style={{
                            padding: '8px 16px',
                            backgroundColor: isEditable ? 'rgba(20, 184, 166, 0.1)' : 'transparent',
                            color: '#14B8A6',
                            border: '1px solid #14B8A6',
                            fontSize: '14px',
                            fontWeight: 500
                          }}
                        >
                          <Edit3 size={16} />
                          {isEditable ? 'View Mode' : 'Editable View'}
                        </button>
                      </div>
                    </div>

                    {/* Persona Header */}
                    <div className="flex items-center gap-4 mb-6 pb-6" style={{ borderBottom: '1px solid #D1D5DB' }}>
                      <div className="relative group">
                        <input
                          ref={profileImageInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleProfileImageChange}
                          className="hidden"
                        />
                        {personaData.profileImage ? (
                          <img
                            src={personaData.profileImage}
                            alt="Profile"
                            className="w-16 h-16 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div 
                            className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: '#14B8A6', color: 'white', fontSize: '24px', fontWeight: 600 }}
                          >
                            {personaData.name.split(' ').map(n => n[0]).join('')}
                          </div>
                        )}
                        {isEditable && (
                          <button
                            onClick={() => profileImageInputRef.current?.click()}
                            className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{
                              backgroundColor: 'rgba(0, 0, 0, 0.5)'
                            }}
                          >
                            <Camera size={20} style={{ color: 'white' }} />
                          </button>
                        )}
                      </div>
                      <div className="flex-1">
                        {isEditable ? (
                          <>
                            <input
                              type="text"
                              value={personaData.name}
                              onChange={(e) => {
                                setPersonaData({ ...personaData, name: e.target.value });
                                setHasUnsavedChanges(true);
                              }}
                              className="w-full mb-2 rounded-lg border"
                              style={{
                                padding: '8px 12px',
                                borderColor: '#D1D5DB',
                                fontSize: '20px',
                                fontWeight: 600,
                                color: '#1F2937'
                              }}
                            />
                            <input
                              type="text"
                              value={personaData.title}
                              onChange={(e) => {
                                setPersonaData({ ...personaData, title: e.target.value });
                                setHasUnsavedChanges(true);
                              }}
                              className="w-full rounded-lg border"
                              style={{
                                padding: '8px 12px',
                                borderColor: '#D1D5DB',
                                fontSize: '14px',
                                color: '#6B7280'
                              }}
                            />
                          </>
                        ) : (
                          <>
                            <h4 style={{ fontSize: '20px', fontWeight: 600, color: '#1F2937', marginBottom: '4px' }}>
                              {personaData.name}
                            </h4>
                            <p style={{ fontSize: '14px', color: '#6B7280' }}>
                              {personaData.title}
                            </p>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Professional Summary */}
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-2">
                        <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937' }}>
                          Professional Summary
                        </h4>
                        <span 
                          className="rounded-full px-2 py-1"
                          style={{ 
                            backgroundColor: 'rgba(20, 184, 166, 0.1)',
                            color: '#14B8A6',
                            fontSize: '12px',
                            fontWeight: 500
                          }}
                        >
                          AI Generated
                        </span>
                      </div>
                      {isEditable ? (
                        <textarea
                          value={personaData.summary}
                          onChange={(e) => {
                            setPersonaData({ ...personaData, summary: e.target.value });
                            setHasUnsavedChanges(true);
                          }}
                          rows={4}
                          className="w-full rounded-lg border"
                          style={{
                            padding: '10px 12px',
                            borderColor: '#D1D5DB',
                            fontSize: '14px',
                            color: '#6B7280',
                            lineHeight: '1.6'
                          }}
                        />
                      ) : (
                        <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: '1.6' }}>
                          {personaData.summary}
                        </p>
                      )}
                    </div>

                    {/* Skills */}
                    <div className="mb-6">
                      <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937', marginBottom: '12px' }}>
                        Skills
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {personaData.skills.map((skill, idx) => (
                          <span 
                            key={idx}
                            className="rounded-full px-3 py-1.5 flex items-center gap-2 group"
                            style={{ 
                              backgroundColor: '#F3F4F6',
                              color: '#1F2937',
                              fontSize: '12px',
                              fontWeight: 500
                            }}
                          >
                            {skill}
                            {isEditable && (
                              <button
                                onClick={() => removeSkill(skill)}
                                className="opacity-60 hover:opacity-100"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </span>
                        ))}
                        {isEditable && isAddingSkill && (
                          <input
                            ref={newSkillInputRef}
                            type="text"
                            value={newSkillValue}
                            onChange={(e) => setNewSkillValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && newSkillValue.trim()) {
                                addSkill(newSkillValue);
                                setNewSkillValue('');
                                setIsAddingSkill(false);
                              } else if (e.key === 'Escape') {
                                setNewSkillValue('');
                                setIsAddingSkill(false);
                              }
                            }}
                            onBlur={() => {
                              if (newSkillValue.trim()) {
                                addSkill(newSkillValue);
                              }
                              setNewSkillValue('');
                              setIsAddingSkill(false);
                            }}
                            autoFocus
                            className="rounded-full px-3 py-1.5 border"
                            style={{
                              borderColor: '#14B8A6',
                              fontSize: '12px',
                              fontWeight: 500,
                              outline: 'none',
                              minWidth: '100px'
                            }}
                            placeholder="Type skill..."
                          />
                        )}
                        {isEditable && !isAddingSkill && (
                          <button
                            onClick={() => {
                              setIsAddingSkill(true);
                              setTimeout(() => newSkillInputRef.current?.focus(), 0);
                            }}
                            className="rounded-full px-3 py-1.5 flex items-center gap-1 border-2 border-dashed hover:bg-gray-50"
                            style={{
                              borderColor: '#D1D5DB',
                              color: '#6B7280',
                              fontSize: '12px',
                              fontWeight: 500
                            }}
                          >
                            <Plus size={14} />
                            Add Skill
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Key Experiences */}
                    <div className="mb-6">
                      <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937', marginBottom: '12px' }}>
                        Key Experiences
                      </h4>
                      <div className="space-y-4">
                        {personaData.experiences.map((exp) => (
                          <div 
                            key={exp.id}
                            className="pb-4 group"
                            style={{ borderBottom: '1px solid #D1D5DB' }}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-1">
                                {isEditable ? (
                                  <>
                                    <input
                                      type="text"
                                      value={exp.role}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        const updated = personaData.experiences.map(item => 
                                          item.id === exp.id ? { ...item, role: value } : item
                                        );
                                        setPersonaData({ ...personaData, experiences: updated });
                                        setHasUnsavedChanges(true);
                                      }}
                                      className="w-full mb-1 rounded border px-2 py-1"
                                      style={{
                                        fontSize: '14px',
                                        fontWeight: 600,
                                        color: '#1F2937',
                                        borderColor: '#D1D5DB'
                                      }}
                                    />
                                    <input
                                      type="text"
                                      value={exp.company}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        const updated = personaData.experiences.map(item => 
                                          item.id === exp.id ? { ...item, company: value } : item
                                        );
                                        setPersonaData({ ...personaData, experiences: updated });
                                        setHasUnsavedChanges(true);
                                      }}
                                      className="w-full rounded border px-2 py-1"
                                      style={{
                                        fontSize: '14px',
                                        color: '#6B7280',
                                        borderColor: '#D1D5DB'
                                      }}
                                    />
                                  </>
                                ) : (
                                  <>
                                    <h5 style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937' }}>
                                      {exp.role}
                                    </h5>
                                    <p style={{ fontSize: '14px', color: '#6B7280' }}>
                                      {exp.company}
                                    </p>
                                  </>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {isEditable ? (
                                  <input
                                    type="text"
                                    value={exp.date}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      const updated = personaData.experiences.map(item => 
                                        item.id === exp.id ? { ...item, date: value } : item
                                      );
                                      setPersonaData({ ...personaData, experiences: updated });
                                      setHasUnsavedChanges(true);
                                    }}
                                    className="rounded border px-2 py-1 text-right"
                                    style={{
                                      fontSize: '12px',
                                      color: '#6B7280',
                                      borderColor: '#D1D5DB',
                                      width: '110px'
                                    }}
                                  />
                                ) : (
                                  <span style={{ fontSize: '12px', color: '#6B7280' }}>
                                    {exp.date}
                                  </span>
                                )}
                                {isEditable && (
                                  <button
                                    onClick={() => removeExperience(exp.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-100 transition-all"
                                    style={{ color: '#DC2626' }}
                                  >
                                    <X size={14} />
                                  </button>
                                )}
                              </div>
                            </div>
                            {isEditable ? (
                              <textarea
                                value={exp.description}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  const updated = personaData.experiences.map(item => 
                                    item.id === exp.id ? { ...item, description: value } : item
                                  );
                                  setPersonaData({ ...personaData, experiences: updated });
                                  setHasUnsavedChanges(true);
                                }}
                                rows={2}
                                className="w-full rounded border px-2 py-1"
                                style={{
                                  fontSize: '14px',
                                  color: '#6B7280',
                                  lineHeight: '1.6',
                                  borderColor: '#D1D5DB'
                                }}
                              />
                            ) : (
                              <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: '1.6' }}>
                                {exp.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                      {isEditable && (
                        <button
                          onClick={() => {
                            // Add experience logic
                            const newExp: Experience = {
                              id: Math.random().toString(36).substr(2, 9),
                              role: 'New Role',
                              company: 'Company Name',
                              date: '2024 - Present',
                              description: 'Description of responsibilities and achievements.'
                            };
                            setPersonaData({
                              ...personaData,
                              experiences: [...personaData.experiences, newExp]
                            });
                            setHasUnsavedChanges(true);
                          }}
                          className="mt-4 flex items-center gap-2 rounded-lg border-2 border-dashed p-3 transition-colors hover:bg-gray-50 w-full justify-center"
                          style={{
                            borderColor: '#D1D5DB',
                            color: '#6B7280',
                            fontSize: '14px',
                            fontWeight: 500
                          }}
                        >
                          <Plus size={16} />
                          Add Experience
                        </button>
                      )}
                    </div>

                    {/* Career Highlights */}
                    <div>
                      <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937', marginBottom: '12px' }}>
                        Career Highlights
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {personaData.careerHighlights.map((highlight, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-lg border flex items-start gap-2"
                            style={{ 
                              borderColor: '#D1D5DB',
                              backgroundColor: '#FAFAFA'
                            }}
                          >
                            <Award size={16} style={{ color: '#14B8A6', marginTop: '2px', flexShrink: 0 }} />
                            <p style={{ fontSize: '13px', color: '#1F2937', lineHeight: '1.5' }}>
                              {highlight}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Sticky Bottom Bar */}
            <AnimatePresence>
              {isEditable && state === 'draft' && (
                <motion.div
                  initial={{ y: 100, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 100, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="fixed bottom-0 left-0 right-0 bg-white border-t"
                  style={{ 
                    borderColor: '#D1D5DB',
                    padding: '16px 32px',
                    boxShadow: '0px -4px 12px rgba(0, 0, 0, 0.05)'
                  }}
                >
                  <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <button
                      onClick={() => setIsEditable(false)}
                      className="rounded-lg transition-colors"
                      style={{
                        padding: '12px 20px',
                        backgroundColor: 'transparent',
                        color: '#6B7280',
                        border: '1px solid #D1D5DB',
                        fontSize: '14px',
                        fontWeight: 500
                      }}
                    >
                      Discard Draft
                    </button>
                    <button
                      onClick={handleFinalize}
                      className="rounded-lg transition-all duration-200"
                      style={{
                        padding: '12px 20px',
                        backgroundColor: '#14B8A6',
                        color: 'white',
                        border: 'none',
                        fontSize: '14px',
                        fontWeight: 500
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#0FB9B1';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#14B8A6';
                      }}
                    >
                      Finalize Persona
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Finalized State */}
        {state === 'finalized' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="max-w-4xl mx-auto"
          >
            <button
  onClick={() => setState('draft')}
  className="mb-6 flex items-center gap-2 transition-all duration-200 hover:opacity-80"
  style={{
    color: '#14B8A6',
    fontWeight: 500,
    fontSize: '14px',
    background: 'none',
    border: 'none',
    cursor: 'pointer'
  }}
>
  ← Go Back
</button>
            <h2 
              onMouseEnter={() => setIsHoveringHeading(true)}
              onMouseLeave={() => setIsHoveringHeading(false)}
              className="relative inline-block cursor-default mx-auto"
              style={{ 
                fontSize: '32px', 
                fontWeight: 700, 
                color: '#14B8A6', 
                marginBottom: '32px', 
                textAlign: 'center',
                display: 'block',
                transition: 'filter 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'drop-shadow(0 0 8px rgba(20, 184, 166, 0.4))';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'none';
              }}
            >
              Finalized Persona
              {isHoveringHeading && (
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.3 }}
                  style={{
                    position: 'absolute',
                    bottom: '-4px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '100%',
                    height: '2px',
                    backgroundColor: '#14B8A6',
                    boxShadow: '0 0 8px rgba(20, 184, 166, 0.4)',
                    transformOrigin: 'left'
                  }}
                />
              )}
            </h2>

            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="bg-white rounded-xl transition-all duration-300"
              style={{ 
                boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.05)',
                padding: '32px',
                border: '1px solid rgba(20, 184, 166, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0px 8px 20px rgba(20, 184, 166, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0px 4px 12px rgba(0, 0, 0, 0.05)';
              }}
            >
              {/* Persona Header */}
              <div className="flex items-center gap-4 mb-8 pb-6" style={{ borderBottom: '1px solid #D1D5DB' }}>
                {personaData.profileImage ? (
                  <img
                    src={personaData.profileImage}
                    alt="Profile"
                    className="w-20 h-20 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div 
                    className="w-20 h-20 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#14B8A6', color: 'white', fontSize: '28px', fontWeight: 600 }}
                  >
                    {personaData.name.split(' ').map(n => n[0]).join('')}
                  </div>
                )}
                <div>
                  <h3 style={{ fontSize: '24px', fontWeight: 600, color: '#1F2937', marginBottom: '4px' }}>
                    {personaData.name}
                  </h3>
                  <p style={{ fontSize: '16px', color: '#6B7280' }}>
                    {personaData.title}
                  </p>
                </div>
              </div>

              {/* Professional Summary */}
              <div className="mb-8">
                <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#1F2937', marginBottom: '12px' }}>
                  Professional Summary
                </h4>
                <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: '1.6' }}>
                  {personaData.summary}
                </p>
              </div>

              {/* Skills */}
              <div className="mb-8">
                <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#1F2937', marginBottom: '12px' }}>
                  Skills
                </h4>
                <div className="flex flex-wrap gap-2">
                  {personaData.skills.map((skill, idx) => (
                    <span 
                      key={idx}
                      className="rounded-full px-3 py-1.5"
                      style={{ 
                        backgroundColor: '#F3F4F6',
                        color: '#1F2937',
                        fontSize: '12px',
                        fontWeight: 500
                      }}
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {/* Key Experiences */}
              <div className="mb-8">
                <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#1F2937', marginBottom: '12px' }}>
                  Key Experiences
                </h4>
                <div className="space-y-6">
                  {personaData.experiences.map((exp) => (
                    <div key={exp.id}>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h5 style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937' }}>
                            {exp.role}
                          </h5>
                          <p style={{ fontSize: '14px', color: '#6B7280' }}>
                            {exp.company}
                          </p>
                        </div>
                        <span style={{ fontSize: '12px', color: '#6B7280' }}>
                          {exp.date}
                        </span>
                      </div>
                      <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: '1.6' }}>
                        {exp.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Career Highlights */}
              <div className="mb-8">
                <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#1F2937', marginBottom: '12px' }}>
                  Career Highlights
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {personaData.careerHighlights.map((highlight, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg border flex items-start gap-2"
                      style={{
                        borderColor: '#D1D5DB',
                        backgroundColor: '#FAFAFA',
                      }}
                    >
                      <Award size={16} style={{ color: '#14B8A6', marginTop: '2px', flexShrink: 0 }} />
                      <p style={{ fontSize: '13px', color: '#1F2937', lineHeight: '1.5' }}>
                        {highlight}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Version history (finalized) */}
              <div>
                <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#1F2937', marginBottom: '12px' }}>
                  Version History
                </h4>

                {isLoadingVersions ? (
                  <div className="flex items-center gap-2" style={{ color: '#6B7280', fontSize: '13px' }}>
                    <Loader2 className="animate-spin" size={14} />
                    Loading versions...
                  </div>
                ) : versionsError ? (
                  <div style={{ color: '#DC2626', fontSize: '13px' }}>{versionsError}</div>
                ) : versions.length === 0 ? (
                  <div style={{ color: '#6B7280', fontSize: '13px' }}>
                    {personaId ? 'No versions found yet.' : 'No saved persona yet (versions available after save).'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {versions.slice(0, 10).map((v) => (
                      <div key={v.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                        <div style={{ fontSize: '13px', color: '#1F2937', fontWeight: 500 }}>v{v.version}</div>
                        <div style={{ fontSize: '12px', color: '#6B7280' }}>{new Date(v.createdAt).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </main>
    </div>
  );
}