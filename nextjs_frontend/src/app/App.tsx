'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, Loader2, X, Edit3, Plus, CheckCircle2, Camera, Award, Compass } from 'lucide-react';
import {
  generateDraftForBuild,
  getBuildStatus,
  orchestrationRunAll,
  updatePersona,
  type BuildStatus,
  type UUID,
} from '../lib/apiClient';

/**
 * Background image was previously referencing a non-existent asset, causing repeated 404s.
 * Keep the page background purely CSS-based to avoid network churn and potential UI slowdowns.
 */

type AppState = 'initial' | 'processing' | 'draft' | 'finalized';

interface Experience {
  id: string;
  role: string;
  company: string;
  date: string;
  description: string;
}

interface CareerHighlight {
  highlight: string;
  /**
   * Optional “where this came from” string shown under the highlight.
   * Examples: “Senior Product Manager, Acme (2021–2024)”, “Resume”, “Performance Review”, etc.
   */
  sourceExperience?: string;
}

/**
 * UI Persona shape (legacy from the integrated template).
 * Backend persona JSON is currently represented/stored as arbitrary JSON and/or as a strict PersonaDraft.
 *
 * NOTE:
 * - We intentionally keep `name` in the data model because it may exist in backend payloads,
 *   but per user request we DO NOT display user name under the "Career Navigator" headline.
 */
interface PersonaData {
  name: string;
  /**
   * For our UI, `title` is treated as the user's role/designation.
   * It is derived from documents/persona payloads (e.g., profile.headline) when possible.
   */
  title: string;
  summary: string;
  skills: string[];
  experiences: Experience[];
  education: string[];
  certifications: string[];
  tools: string[];
  industries: string[];
  yearsOfExperience: string;

  /**
   * Career highlights enriched with optional “source experience”.
   * NOTE: backend drafts may still return string arrays; we map them into objects.
   */
  careerHighlights: CareerHighlight[];

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

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.keys(value as any).length > 0;
}

/**
 * Returns initials for a display label to be shown in avatar chips.
 */
function getInitials(label: string): string {
  const base = label.trim();
  if (!base) return '•';
  const parts = base.split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return initials || '•';
}

function getNestedOrchestrationValue(root: any, path: Array<string | number>): { value: any; foundPath: string } | null {
  /**
   * Safe nested accessor that returns both the value and the dot-path used.
   * This supports debugging cases where orchestration responses evolve shape.
   */
  let cur: any = root;
  for (const seg of path) {
    if (cur === null || cur === undefined) return null;
    cur = cur[seg as any];
  }
  return { value: cur, foundPath: path.join('.') };
}

function logAvailableKeys(label: string, obj: any) {
  /**
   * Log keys (and top-level nested "artifacts" keys when present) to help debug
   * mismatched orchestration payload shapes without dumping huge JSON blobs.
   */
  try {
    const topKeys = isNonEmptyObject(obj) ? Object.keys(obj) : [];
    const artifactsKeys = isNonEmptyObject(obj?.artifacts) ? Object.keys(obj.artifacts as any) : [];
    const outputKeys = isNonEmptyObject(obj?.artifacts?.output) ? Object.keys((obj.artifacts as any).output) : [];
    // eslint-disable-next-line no-console
    console.log(`${label} available keys:`, {
      topKeys,
      artifactsKeys,
      outputKeys,
      hasArtifacts: Boolean(obj?.artifacts),
      hasArtifactsOutput: Boolean(obj?.artifacts?.output),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`${label} available keys logging failed`, e);
  }
}

function extractPersonaJsonFromOrchestrationRecord(orch: any): { personaJson: any | null; sourcePath: string | null } {
  /**
   * PUBLIC_INTERFACE
   * Extract persona JSON from the orchestration record.
   *
   * IMPORTANT:
   * Some orchestration envelopes contain non-persona objects early in the candidate list
   * (e.g. results.generate = { personaId: ... }), which are truthy and can incorrectly “win”.
   *
   * To prevent the UI from sticking on empty fallback persona, we:
   * 1) Prefer candidates that look like an actual persona payload (draft/final JSON)
   * 2) Fall back to the first non-null candidate only if no persona-shaped object exists
   *    (and log that scenario for debugging).
   *
   * Authoritative candidate priority:
   * - artifacts.draftPersona is often where live backend persona data resides.
   */
  const candidates: Array<Array<string>> = [
    // Draft variants
    ['artifacts', 'draftPersona'],
    ['artifacts', 'draftPersona', 'persona'],
    ['artifacts', 'draftPersona', 'draft'],
    ['artifacts', 'draftPersona', 'personaJson'],

    // Final variants
    ['artifacts', 'finalPersona'],
    ['artifacts', 'finalPersona', 'final'],
    ['artifacts', 'finalPersona', 'persona'],
    ['artifacts', 'finalPersona', 'personaJson'],

    // Other artifact envelopes
    ['artifacts', 'output'],
    ['artifacts', 'result'],
    ['artifacts', 'output', 'personaJson'],

    // Legacy/alternate locations
    ['artifacts', 'personaJson'],
    ['artifacts', 'final', 'personaJson'],
    ['artifacts', 'draft', 'personaJson'],
    ['artifacts', 'final'],
    ['artifacts', 'draft'],

    // Some scaffold/placeholder implementations store persona at top-level.
    ['draftPersona'],
    ['draftPersona', 'persona'],
    ['draftPersona', 'draft'],
    ['draftPersona', 'personaJson'],
    ['personaDraft'],
    ['personaDraft', 'persona'],
    ['personaDraft', 'draft'],
    ['personaDraft', 'personaJson'],
    ['draft'],
    ['draft', 'persona'],
    ['draft', 'personaJson'],
    ['persona'],
    ['persona', 'personaJson'],

    // Final variants at top-level (defensive)
    ['finalPersona'],
    ['finalPersona', 'final'],
    ['finalPersona', 'persona'],
    ['finalPersona', 'personaJson'],
    ['final'],
    ['final', 'personaJson'],

    // Orchestration run-all response "results" (some versions embed the persona here)
    ['results', 'generate', 'persona'],
    ['results', 'generate', 'draftPersona'],
    ['results', 'generate', 'personaDraft'],
    ['results', 'finalize', 'final'],
  ];

  const looksLikePersona = (value: any): boolean => {
    if (!isNonEmptyObject(value)) return false;

    // Reject common non-persona envelopes early.
    const keys = Object.keys(value);
    if (keys.length === 1 && (value as any).personaId) return false;

    // Observed “current state persona” format
    if (
      typeof (value as any).professional_summary === 'string' ||
      Array.isArray((value as any).core_competencies) ||
      Array.isArray((value as any).career_highlights) ||
      isNonEmptyObject((value as any).technical_stack)
    ) {
      return true;
    }

    // Backend PersonaDraft shape: require at least one meaningful field.
    const hasTitle = typeof (value as any).title === 'string' && (value as any).title.trim().length > 0;
    const hasSummary = typeof (value as any).summary === 'string' && (value as any).summary.trim().length > 0;
    const hasSkills = Array.isArray((value as any).skills) && (value as any).skills.length > 0;
    const hasProfileHeadline =
      typeof (value as any)?.profile?.headline === 'string' && (value as any).profile.headline.trim().length > 0;

    return hasTitle || hasSummary || hasSkills || hasProfileHeadline;
  };

  let firstNonNull: { personaJson: any; sourcePath: string } | null = null;

  for (const path of candidates) {
    const hit = getNestedOrchestrationValue(orch, path);
    if (hit?.value === undefined || hit?.value === null) continue;

    if (!firstNonNull) firstNonNull = { personaJson: hit.value, sourcePath: hit.foundPath };

    if (looksLikePersona(hit.value)) {
      return { personaJson: hit.value, sourcePath: hit.foundPath };
    }

    // eslint-disable-next-line no-console
    console.log('[persona][extract] rejected candidate (not persona-shaped)', {
      path: hit.foundPath,
      type: Array.isArray(hit.value) ? 'array' : typeof hit.value,
      keys: isNonEmptyObject(hit.value) ? Object.keys(hit.value) : [],
    });
  }

  if (firstNonNull) {
    // eslint-disable-next-line no-console
    console.warn('[persona][extract] no persona-shaped candidate found; falling back to first non-null candidate', {
      path: firstNonNull.sourcePath,
      type: Array.isArray(firstNonNull.personaJson) ? 'array' : typeof firstNonNull.personaJson,
      keys: isNonEmptyObject(firstNonNull.personaJson) ? Object.keys(firstNonNull.personaJson) : [],
    });
    return { personaJson: firstNonNull.personaJson, sourcePath: firstNonNull.sourcePath };
  }

  return { personaJson: null, sourcePath: null };
}

function coercePersonaDataFromBackendJson(personaJson: any, fallback: PersonaData): PersonaData {
  /**
   * Attempt to map backend persona JSON into this UI's legacy PersonaData fields.
   *
   * We support TWO common backend shapes:
   * 1) “Legacy/current state” persona JSON keys:
   *    - professional_summary (string)
   *    - core_competencies (string[])
   *    - career_highlights (string[] | {text:string, source_experience?: string}[])
   *
   * 2) OpenAPI PersonaDraft shape:
   *    - title (string)
   *    - summary (string)
   *    - profile.headline (string)  -> best candidate for role/designation
   *    - skills (string[])
   *    - experienceHighlights (string[])
   *
   * UI bindings:
   * - personaData.title is displayed as the role/designation line (header + persona sections).
   * - personaData.name may exist but is not shown under app headline per requirements.
   */
  // eslint-disable-next-line no-console
  console.log('[persona][coerce] raw personaJson:', personaJson);

  try {
    const coercedSkills = asStringArray(personaJson?.core_competencies ?? personaJson?.skills);

    const coerceHighlights = (value: unknown): CareerHighlight[] => {
      if (!Array.isArray(value)) return [];

      return (value as any[])
        .map((h) => {
          if (typeof h === 'string') {
            const highlight = h.trim();
            return highlight ? ({ highlight } satisfies CareerHighlight) : null;
          }

          if (typeof h === 'object' && h !== null) {
            const highlightRaw = (h as any).highlight ?? (h as any).text ?? (h as any).value ?? (h as any).career_highlight;
            const sourceRaw =
              (h as any).sourceExperience ??
              (h as any).source_experience ??
              (h as any).source ??
              (h as any).experience ??
              (h as any).role ??
              null;

            const highlight = typeof highlightRaw === 'string' ? highlightRaw.trim() : '';
            const sourceExperience = typeof sourceRaw === 'string' ? sourceRaw.trim() : undefined;

            if (!highlight) return null;

            return {
              highlight,
              sourceExperience: sourceExperience && sourceExperience.length > 0 ? sourceExperience : undefined,
            } satisfies CareerHighlight;
          }

          return null;
        })
        .filter(Boolean) as CareerHighlight[];
    };

    const coercedHighlights =
      coerceHighlights(personaJson?.career_highlights).length > 0
        ? coerceHighlights(personaJson?.career_highlights)
        : coerceHighlights(personaJson?.experienceHighlights);

    /**
     * Role/designation derivation:
     * - Prefer profile.headline (PersonaDraft).
     * - Then common role/headline fields.
     * - Finally fall back to existing UI fallback title.
     */
    const derivedTitle =
      personaJson?.profile?.headline ??
      personaJson?.role ??
      personaJson?.headline ??
      personaJson?.current_role ??
      personaJson?.currentRole ??
      personaJson?.title ?? // sometimes "title" is used as role; we accept as fallback
      fallback.title;

    const derivedName =
      personaJson?.name ??
      personaJson?.full_name ??
      personaJson?.fullName ??
      personaJson?.user_name ??
      personaJson?.userName ??
      fallback.name;

    const next: PersonaData = {
      ...fallback,
      name: typeof derivedName === 'string' ? derivedName : fallback.name,
      title: typeof derivedTitle === 'string' ? derivedTitle : fallback.title,
      summary: personaJson?.professional_summary ?? personaJson?.summary ?? fallback.summary,
      skills: coercedSkills.length > 0 ? coercedSkills : fallback.skills,
      careerHighlights: coercedHighlights.length > 0 ? coercedHighlights : fallback.careerHighlights,
    };

    return next;
  } catch {
    return fallback;
  }
}

export default function App() {
  /**
   * Mount guard: used to prevent setState after unmount and to stabilize any auto-trigger logic.
   */
  const isMountedRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Error guard:
   * When backend failures happen, we set hasError and stop any further background loops.
   */
  const [hasError, setHasError] = useState(false);

  const [state, setState] = useState<AppState>('initial');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileData[]>([]);
  const [uploadError, setUploadError] = useState<string>('');

  // Backend-driven workflow state
  const [backendError, setBackendError] = useState<string>('');
  const [buildId, setBuildId] = useState<UUID | null>(null);
  const [personaId, setPersonaId] = useState<UUID | null>(null);
  const [buildStatus, setBuildStatus] = useState<BuildStatus | null>(null);

  const [isEditable, setIsEditable] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isAddingSkill, setIsAddingSkill] = useState(false);
  const [newSkillValue, setNewSkillValue] = useState('');
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const additionalFileInputRef = useRef<HTMLInputElement>(null);
  const profileImageInputRef = useRef<HTMLInputElement>(null);
  const newSkillInputRef = useRef<HTMLInputElement>(null);

  /**
   * Guard against re-entrant file-picker triggering.
   */
  const isOpeningFilePickerRef = useRef(false);

  /**
   * Chrome freeze mitigation (dialog open + close).
   */
  const fileDialogActiveRef = useRef(false);
  const fileDialogCooldownUntilRef = useRef<number>(0);
  const FILE_DIALOG_COOLDOWN_MS = 650;

  /**
   * React state mirror of dialog activity so we can disable motion/hover via render-time conditionals.
   */
  const [isFileDialogActive, setIsFileDialogActive] = useState(false);

  const markFileDialogActive = useCallback(() => {
    fileDialogActiveRef.current = true;
    if (isMountedRef.current) setIsFileDialogActive(true);
  }, []);

  const markFileDialogInactive = useCallback(() => {
    fileDialogActiveRef.current = false;
    fileDialogCooldownUntilRef.current = Date.now() + FILE_DIALOG_COOLDOWN_MS;
    if (isMountedRef.current) setIsFileDialogActive(false);
  }, []);

  useEffect(() => {
    const onWindowFocus = () => {
      if (!fileDialogActiveRef.current) return;
      markFileDialogInactive();
    };

    window.addEventListener('focus', onWindowFocus);
    return () => {
      window.removeEventListener('focus', onWindowFocus);
    };
  }, [markFileDialogInactive]);

  const shouldAllowHoverEffects = useCallback((): boolean => {
    if (fileDialogActiveRef.current) return false;
    if (Date.now() < fileDialogCooldownUntilRef.current) return false;
    return true;
  }, []);

  const openHiddenFileInput = useCallback(
    (inputRef: React.RefObject<HTMLInputElement>, e?: React.SyntheticEvent) => {
      /**
       * Opens a hidden <input type="file"> in a safe, non-reentrant way.
       */
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      const nativeEvent = (e as any)?.nativeEvent as Event | undefined;
      if (nativeEvent && 'isTrusted' in nativeEvent && !(nativeEvent as any).isTrusted) return;

      if (isOpeningFilePickerRef.current) return;
      isOpeningFilePickerRef.current = true;

      markFileDialogActive();

      try {
        setTimeout(() => {
          inputRef.current?.click();
        }, 0);
      } finally {
        setTimeout(() => {
          isOpeningFilePickerRef.current = false;
        }, 1000);

        setTimeout(() => {
          if (fileDialogActiveRef.current) {
            markFileDialogInactive();
          }
        }, 4000);
      }
    },
    [markFileDialogActive, markFileDialogInactive]
  );

  // PUBLIC_INTERFACE
  const openFilePicker = useCallback(
    (e?: React.SyntheticEvent) => {
      /** Opens the hidden primary upload <input type="file"> in a safe, non-reentrant way. */
      openHiddenFileInput(fileInputRef, e);
    },
    [openHiddenFileInput]
  );

  // Helps correlate logs across multiple async flows; increments per draft generation.
  const generationIdRef = useRef<number>(0);

  // Track object URLs so we can revoke them (prevents memory leaks and long-term slowdowns/freezes).
  const profileImageObjectUrlRef = useRef<string | null>(null);

  const initialPersonaFallback = useMemo<PersonaData>(
    () => ({
      name: '',
      title: '',
      summary: '',
      skills: [],
      experiences: [],
      education: [],
      certifications: [],
      tools: [],
      industries: [],
      yearsOfExperience: '',
      careerHighlights: [],
    }),
    []
  );

  const [personaData, setPersonaData] = useState<PersonaData>(initialPersonaFallback);

  // Requested: we do not display user name under the app headline; role/designation is required.
  const personaName = personaData?.name ?? '';
  const personaTitle = personaData?.title ?? '';
  const personaSummary = personaData?.summary ?? '';

  const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt'];
  const MAX_FILES = 5;

  const validateFile = (file: File): boolean => {
    const fileName = file.name.toLowerCase();
    return ALLOWED_EXTENSIONS.some((ext) => fileName.endsWith(ext));
  };

  const addFiles = (files: File[]) => {
    setUploadError('');
    setBackendError('');

    const invalidFiles = files.filter((file) => !validateFile(file));
    if (invalidFiles.length > 0) {
      setUploadError('Unsupported file format. Please upload PDF, DOCX, or TXT.');
      return;
    }

    const currentCount = uploadedFiles.length;
    if (currentCount + files.length > MAX_FILES) {
      setUploadError(`Maximum ${MAX_FILES} documents allowed.`);
      return;
    }

    const newUploadedFiles = files.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
    }));

    setUploadedFiles((prev) => [...prev, ...newUploadedFiles]);
  };

  /**
   * Chrome crash/freeze mitigation:
   * - Keep the native file input `onChange` handler as lightweight as possible.
   * - Defer any non-trivial processing (validation + setState) to the next tick.
   *
   * Reliability hardening:
   * - ALWAYS materialize a real `File[]` synchronously inside the onChange handler.
   *   Some browsers can invalidate/empty the underlying FileList after the event loop tick,
   *   which caused the "Select Files" background upload to sometimes send 0 files.
   */
  const pendingFileSelectionTimerRef = useRef<number | null>(null);

  // Conservative safety cap to avoid pathological selections overwhelming the tab.
  // (This is separate from backend limits; it’s purely a frontend stability guard.)
  const MAX_TOTAL_UPLOAD_BYTES = 30 * 1024 * 1024; // 30MB across all currently selected + newly selected files

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();

    // Always mark the file dialog inactive as early as possible.
    if (fileDialogActiveRef.current) {
      fileDialogActiveRef.current = false;
      fileDialogCooldownUntilRef.current = Date.now() + FILE_DIALOG_COOLDOWN_MS;
      setIsFileDialogActive(false);
    }

    const list = e.target.files;
    // Ensure the input can trigger future selections of the same file.
    e.target.value = '';

    // Some browsers can fire a change event with a null/empty file list (e.g., cancel).
    if (!list || list.length === 0) return;

    // CRITICAL: snapshot as a real array NOW (do not retain FileList reference).
    const newFiles = Array.from(list);

    // Debounce bursts of change events, but DO NOT drop events entirely.
    if (pendingFileSelectionTimerRef.current) {
      window.clearTimeout(pendingFileSelectionTimerRef.current);
      pendingFileSelectionTimerRef.current = null;
    }

    pendingFileSelectionTimerRef.current = window.setTimeout(() => {
      // Total-size guard (existing + new).
      const existingBytes = uploadedFiles.reduce((sum, f) => sum + (f.file?.size ?? 0), 0);
      const newBytes = newFiles.reduce((sum, f) => sum + (f.size ?? 0), 0);
      if (existingBytes + newBytes > MAX_TOTAL_UPLOAD_BYTES) {
        setUploadError(
          `Selected files are too large for in-browser processing. Please keep total upload size under ${Math.round(
            MAX_TOTAL_UPLOAD_BYTES / (1024 * 1024)
          )}MB.`
        );
        pendingFileSelectionTimerRef.current = null;
        return;
      }

      addFiles(newFiles);

      // Make “Select Files” behave like a real upload action (same user expectation as drag/drop):
      // immediately upload the selected files in the background (best-effort).
      void (async () => {
        try {
          const { uploadDocuments } = await import('../lib/apiClient');
          await uploadDocuments({ files: newFiles });
        } catch (err) {
          // Best-effort only; keep UX non-blocking.
          // eslint-disable-next-line no-console
          console.warn('[upload][picker] background upload failed (best-effort)', err);
        }
      })();

      pendingFileSelectionTimerRef.current = null;
    }, 0);
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
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
    setUploadError('');
  };

  const handleGenerateDraft = async () => {
    const generationId = ++generationIdRef.current;

    // Reset artifact circuit-breakers so new uploads can apply new artifacts.
    lastAppliedPersonaArtifactFingerprintRef.current = {};
    lastAppliedPersonaUiFingerprintRef.current = {};

    // eslint-disable-next-line no-console
    console.log(`[draft][gen:${generationId}] handleGenerateDraft start`, {
      state,
      uploadedFilesCount: uploadedFiles.length,
      uploadedFilenames: uploadedFiles.map((f) => f.file.name),
      existingBuildId: buildId,
      existingPersonaId: personaId,
    });

    setHasError(false);

    setBackendError('');
    setIsEditable(false);
    setHasUnsavedChanges(false);

    try {
      setState('processing');

      const files = uploadedFiles.map((f) => f.file);

      // eslint-disable-next-line no-console
      console.log(`[draft][gen:${generationId}] uploading documents`, {
        fileCount: files.length,
        names: files.map((f) => f.name),
        sizes: files.map((f) => f.size),
        types: files.map((f) => f.type),
      });

      // Upload first (side effects: persists document rows + extracted text rows best-effort).
      await import('../lib/apiClient').then(async ({ uploadDocuments }) => {
        const uploadResp = await uploadDocuments({ files });
        // eslint-disable-next-line no-console
        console.log(`[draft][gen:${generationId}] uploadDocuments raw response:`, uploadResp);
      });

      // CRITICAL: Do NOT rely on backend “useLatestCategoryDocs” auto-selection for anonymous sessions,
      // because userId is typically null in this UI and the backend may pick up older anonymous docs
      // (e.g., an archived/stale persona source like “Rossini”).
      //
      // Instead, explicitly fetch the newest documents and pass their ids to orchestration.
      const { listDocuments } = await import('../lib/apiClient');
      const docs = await listDocuments({ limit: 50, offset: 0 });
      const newestDocIds = docs
        .slice()
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, files.length) // pick as many as we just uploaded
        .map((d) => d.id);

      if (newestDocIds.length === 0) {
        throw new Error('Upload succeeded but no documents are available for orchestration. Please retry.');
      }

      const runAllRequest = {
        mode: 'persona_build' as const,
        // We provide explicit documentIds to ensure newly uploaded docs drive extraction + generation.
        documentIds: newestDocIds,
        // Disable the anonymous “latest category docs” path; we want explicit selection.
        useLatestCategoryDocs: false,
        autoCreatePersona: true,
        generate: {
          saveDraft: true,
          createVersion: true,
        },
      };

      // eslint-disable-next-line no-console
      console.log(`[orchestrationRunAll][gen:${generationId}] request:`, runAllRequest);

      const runAll = await orchestrationRunAll(runAllRequest);

      // eslint-disable-next-line no-console
      console.log(`[orchestrationRunAll][gen:${generationId}] response:`, runAll);

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

      if (runAll.build.status === 'succeeded') {
        setState('draft');
      } else {
        setState('processing');
      }
    } catch (e: any) {
      const payloadMsg =
        e?.payload && typeof e.payload === 'object' && e.payload !== null ? e.payload?.message || e.payload?.error : null;

      const message = payloadMsg || e?.message || 'Failed to generate draft persona.';
      // eslint-disable-next-line no-console
      console.error(`[draft][gen:${generationId}] generate draft failed`, { message, error: e });

      setBackendError(message);
      setHasError(true);
      setState('processing');
    }
  };

  const handleSaveChanges = async () => {
    /**
     * Keep save behavior working, but we intentionally do NOT display any versions/history UI.
     * Backend may still version internally; that's fine.
     */
    try {
      setBackendError('');

      if (!personaId) {
        setHasUnsavedChanges(false);
        setShowSaveSuccess(true);
        setTimeout(() => setShowSaveSuccess(false), 3000);
        return;
      }

      if (!personaData) {
        setBackendError('Nothing to save yet (persona data not loaded).');
        return;
      }

      await updatePersona({
        personaId,
        title: personaData.title,
        personaJson: personaData as any,
      });

      setHasUnsavedChanges(false);
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 3000);
    } catch (e: any) {
      setBackendError(e?.message || 'Failed to save changes to backend.');
    }
  };

  const handleFinalize = () => {
    setState('finalized');
    setIsEditable(false);
  };

  // PUBLIC_INTERFACE
  const handleRegenerateDraft = useCallback(async () => {
    /**
     * Re-generates the draft persona for the current build.
     *
     * Note: no history/version UI is tracked in the frontend anymore.
     */
    if (!buildId) {
      setBackendError('No build available to regenerate. Please generate a draft persona first.');
      return;
    }

    const generationId = ++generationIdRef.current;

    lastAppliedPersonaArtifactFingerprintRef.current = {};
    lastAppliedPersonaUiFingerprintRef.current = {};

    setHasError(false);
    setBackendError('');
    setIsEditable(false);
    setHasUnsavedChanges(false);

    try {
      setState('processing');

      const resp = await generateDraftForBuild({
        buildId,
        personaId: personaId ?? undefined,
        saveDraft: true,
        createVersion: true,
      });

      // eslint-disable-next-line no-console
      console.log(`[draft][regen:${generationId}] generateDraftForBuild response:`, resp);

      setPersonaId(resp.personaId ?? null);

      if (buildStatus?.status === 'succeeded') {
        setState('draft');
      }
    } catch (e: any) {
      const payloadMsg =
        e?.payload && typeof e.payload === 'object' && e.payload !== null ? e.payload?.message || e.payload?.error : null;

      const message = payloadMsg || e?.message || 'Failed to regenerate the draft persona.';
      // eslint-disable-next-line no-console
      console.error(`[draft][regen:${generationId}] regenerate failed`, { message, error: e });

      setBackendError(message);
      setHasError(true);
      setState('processing');
    }
  }, [buildId, personaId, buildStatus?.status]);

  // Poll build progress while processing
  useEffect(() => {
    if (!buildId) return;
    if (state !== 'processing') return;
    if (hasError) return;

    const generationId = generationIdRef.current;
    let cancelled = false;

    const interval = setInterval(async () => {
      try {
        const status = await getBuildStatus(buildId);
        // eslint-disable-next-line no-console
        console.log(`[poll][gen:${generationId}] getBuildStatus raw response:`, status);

        if (cancelled || !isMountedRef.current) return;

        setBuildStatus(status);

        if (status.status === 'succeeded') {
          setState('draft');
        } else if (status.status === 'failed' || status.status === 'cancelled') {
          // eslint-disable-next-line no-console
          console.error(`[poll][gen:${generationId}] build ${status.status}; message=`, status.message, 'full status=', status);
          setBackendError(status.message || `Build ${status.status}.`);
          setHasError(true);
          setState('processing');
        }
      } catch (e: any) {
        if (cancelled || !isMountedRef.current) return;

        const payloadMsg =
          e?.payload && typeof e.payload === 'object' && e.payload !== null ? e.payload?.message || e.payload?.error : null;

        const message = payloadMsg || e?.message || 'Failed to poll build status.';
        // eslint-disable-next-line no-console
        console.error(`[poll][gen:${generationId}] polling error`, { message, error: e });

        setBackendError(message);
        setHasError(true);
        setState('processing');
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [buildId, state, hasError]);

  /**
   * Prevent render loops/freezes from repeated artifact fetches and heavy comparisons.
   */
  const lastAppliedPersonaArtifactFingerprintRef = useRef<Record<string, string>>({});
  const lastAppliedPersonaUiFingerprintRef = useRef<Record<string, string>>({});
  const isApplyingArtifactsRef = useRef<Record<string, boolean>>({});
  const lastAppliedPersonaSourcePathRef = useRef<Record<string, string>>({});

  const personaDataRef = useRef<PersonaData>(initialPersonaFallback);
  useEffect(() => {
    personaDataRef.current = personaData;
  }, [personaData]);

  function fingerprintPersonaData(p: PersonaData): string {
    return [
      p.name ?? '',
      p.title ?? '',
      p.summary ?? '',
      (p.skills ?? []).join('|'),
      (p.careerHighlights ?? []).map((h) => `${h.highlight ?? ''}@@${h.sourceExperience ?? ''}`).join('|'),
      String((p.experiences ?? []).length),
    ].join('::');
  }

  function fingerprintPersonaArtifact(personaJson: any): string {
    if (!isNonEmptyObject(personaJson)) return 'empty';
    const profileHeadline = typeof (personaJson as any)?.profile?.headline === 'string' ? (personaJson as any).profile.headline : '';
    const title = typeof (personaJson as any)?.title === 'string' ? (personaJson as any).title : '';
    const summary = typeof (personaJson as any)?.summary === 'string' ? (personaJson as any).summary : '';
    const professionalSummary =
      typeof (personaJson as any)?.professional_summary === 'string' ? (personaJson as any).professional_summary : '';

    const skillsLen = Array.isArray((personaJson as any)?.skills) ? (personaJson as any).skills.length : 0;
    const coreCompetenciesLen = Array.isArray((personaJson as any)?.core_competencies) ? (personaJson as any).core_competencies.length : 0;
    const highlightsLen = Array.isArray((personaJson as any)?.career_highlights) ? (personaJson as any).career_highlights.length : 0;

    const keysCount = Object.keys(personaJson).length;

    return [
      'k:' + String(keysCount),
      'h:' + String(profileHeadline.length),
      't:' + String(title.length),
      's:' + String(summary.length),
      'ps:' + String(professionalSummary.length),
      'skills:' + String(skillsLen),
      'cc:' + String(coreCompetenciesLen),
      'hl:' + String(highlightsLen),
    ].join('|');
  }

  // When we enter draft state, attempt to fetch orchestration artifacts and populate UI persona (best-effort).
  useEffect(() => {
    if (!buildId || state !== 'draft' || hasError) return;
    if (isApplyingArtifactsRef.current[buildId]) return;

    let isIgnore = false;
    const generationId = generationIdRef.current;

    const loadData = async () => {
      isApplyingArtifactsRef.current[buildId] = true;

      try {
        const { getOrchestrationByBuild } = await import('../lib/apiClient');
        const orch = await getOrchestrationByBuild(buildId);
        if (isIgnore) return;

        logAvailableKeys(`[artifacts][gen:${generationId}] orchestration`, orch);

        const { personaJson, sourcePath } = extractPersonaJsonFromOrchestrationRecord(orch);

        // eslint-disable-next-line no-console
        console.log(`[persona][extract][gen:${generationId}] selected`, {
          buildId,
          sourcePath,
          personaType: Array.isArray(personaJson) ? 'array' : typeof personaJson,
          personaKeys: isNonEmptyObject(personaJson) ? Object.keys(personaJson) : [],
        });

        if (!personaJson || typeof personaJson !== 'object' || Object.keys(personaJson).length === 0) {
          // eslint-disable-next-line no-console
          console.warn(`[persona][extract][gen:${generationId}] no persona payload found in orchestration record`, {
            buildId,
            sourcePath,
          });
          return;
        }

        const artifactFingerprint = fingerprintPersonaArtifact(personaJson);
        if (artifactFingerprint === lastAppliedPersonaArtifactFingerprintRef.current[buildId]) return;

        const baseline = personaDataRef.current;
        const next = coercePersonaDataFromBackendJson(personaJson, baseline);
        const nextUiFingerprint = fingerprintPersonaData(next);

        if (nextUiFingerprint === lastAppliedPersonaUiFingerprintRef.current[buildId]) {
          lastAppliedPersonaArtifactFingerprintRef.current[buildId] = artifactFingerprint;
          if (sourcePath) lastAppliedPersonaSourcePathRef.current[buildId] = sourcePath;
          return;
        }

        lastAppliedPersonaArtifactFingerprintRef.current[buildId] = artifactFingerprint;
        lastAppliedPersonaUiFingerprintRef.current[buildId] = nextUiFingerprint;
        if (sourcePath) lastAppliedPersonaSourcePathRef.current[buildId] = sourcePath;

        if (!isIgnore && isMountedRef.current) {
          setPersonaData(next);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[artifacts][gen:${generationId}] artifact fetch failed`, err);
      } finally {
        isApplyingArtifactsRef.current[buildId] = false;
      }
    };

    loadData();

    return () => {
      isIgnore = true;
    };
  }, [buildId, state, hasError]);

  /**
   * When we enter finalized state, attempt to apply the backend "final" persona if present.
   */
  useEffect(() => {
    if (!buildId || state !== 'finalized' || hasError) return;
    if (isApplyingArtifactsRef.current[buildId]) return;

    let isIgnore = false;
    const generationId = generationIdRef.current;

    const loadFinal = async () => {
      isApplyingArtifactsRef.current[buildId] = true;
      try {
        const { getOrchestrationByBuild } = await import('../lib/apiClient');
        const orch = await getOrchestrationByBuild(buildId);
        if (isIgnore) return;

        logAvailableKeys(`[final][gen:${generationId}] orchestration`, orch);

        const preferredFinalPaths: Array<Array<string>> = [
          ['artifacts', 'finalPersona'],
          ['artifacts', 'final'],
          ['results', 'finalize', 'final'],
        ];

        let finalHit: { personaJson: any; sourcePath: string } | null = null;
        for (const path of preferredFinalPaths) {
          const hit = getNestedOrchestrationValue(orch, path);
          if (hit?.value !== undefined && hit?.value !== null) {
            finalHit = { personaJson: hit.value, sourcePath: hit.foundPath };
            break;
          }
        }

        const extracted = finalHit ?? extractPersonaJsonFromOrchestrationRecord(orch);
        const personaJson = (extracted as any).personaJson;
        const sourcePath = (extracted as any).sourcePath ?? null;

        // eslint-disable-next-line no-console
        console.log(`[persona][final-extract][gen:${generationId}] selected`, {
          buildId,
          sourcePath,
          personaType: Array.isArray(personaJson) ? 'array' : typeof personaJson,
          personaKeys: isNonEmptyObject(personaJson) ? Object.keys(personaJson) : [],
        });

        if (!personaJson || typeof personaJson !== 'object' || Object.keys(personaJson).length === 0) return;

        const artifactFingerprint = fingerprintPersonaArtifact(personaJson);
        if (artifactFingerprint === lastAppliedPersonaArtifactFingerprintRef.current[buildId]) return;

        const baseline = personaDataRef.current;
        const next = coercePersonaDataFromBackendJson(personaJson, baseline);
        const nextUiFingerprint = fingerprintPersonaData(next);

        if (nextUiFingerprint === lastAppliedPersonaUiFingerprintRef.current[buildId]) {
          lastAppliedPersonaArtifactFingerprintRef.current[buildId] = artifactFingerprint;
          if (sourcePath) lastAppliedPersonaSourcePathRef.current[buildId] = sourcePath;
          return;
        }

        lastAppliedPersonaArtifactFingerprintRef.current[buildId] = artifactFingerprint;
        lastAppliedPersonaUiFingerprintRef.current[buildId] = nextUiFingerprint;
        if (sourcePath) lastAppliedPersonaSourcePathRef.current[buildId] = sourcePath;

        if (!isIgnore && isMountedRef.current) setPersonaData(next);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[final][gen:${generationId}] artifact fetch failed`, err);
      } finally {
        isApplyingArtifactsRef.current[buildId] = false;
      }
    };

    loadFinal();

    return () => {
      isIgnore = true;
    };
  }, [buildId, state, hasError]);

  const removeSkill = (skillToRemove: string) => {
    if (!personaData) return;
    setPersonaData({
      ...personaData,
      skills: personaData.skills.filter((s) => s !== skillToRemove),
    });
    setHasUnsavedChanges(true);
  };

  const addSkill = (skill: string) => {
    if (!personaData) return;
    if (skill.trim()) {
      setPersonaData({
        ...personaData,
        skills: [...personaData.skills, skill.trim()],
      });
      setHasUnsavedChanges(true);
    }
  };

  const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;

    const file = e.target.files[0];
    e.target.value = '';

    if (profileImageObjectUrlRef.current) {
      URL.revokeObjectURL(profileImageObjectUrlRef.current);
      profileImageObjectUrlRef.current = null;
    }

    const url = URL.createObjectURL(file);
    profileImageObjectUrlRef.current = url;

    setPersonaData((prev) => ({
      ...prev,
      profileImage: url,
    }));
    setHasUnsavedChanges(true);
  };

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isHoveringHeading, setIsHoveringHeading] = useState(false);

  useEffect(() => {
    return () => {
      if (profileImageObjectUrlRef.current) {
        URL.revokeObjectURL(profileImageObjectUrlRef.current);
        profileImageObjectUrlRef.current = null;
      }
    };
  }, []);

  const removeExperience = (id: string) => {
    setPersonaData((prev) => {
      return {
        ...prev,
        experiences: prev.experiences.filter((exp) => exp.id !== id),
      };
    });
    setHasUnsavedChanges(true);
  };

  /**
   * Header avatar initials:
   * - Prefer role/designation (personaTitle) since we are not exposing user name near the headline.
   * - Fall back to name if role not available (still safe; just initials).
   */
  const avatarInitials = useMemo(() => {
    return getInitials((personaTitle || personaName).trim());
  }, [personaTitle, personaName]);

  const personaCardInitials = useMemo(() => {
    return getInitials((personaTitle || personaName).trim());
  }, [personaTitle, personaName]);

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
        background: 'linear-gradient(180deg, rgba(79, 70, 229, 0.06) 0%, #F9FAFB 55%, #F9FAFB 100%)',
        fontFamily: 'Inter, sans-serif',
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
                boxShadow: '0 2px 4px rgba(20, 184, 166, 0.15)',
              }}
            >
              <Compass size={20} style={{ color: 'white' }} />
            </div>

            <div className="flex flex-col">
              <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1F2937', margin: 0 }}>Career Navigator</h1>

              {/* Per requirement: NOTHING under the "Career Navigator" headline */}
            </div>
          </div>

          {/* RIGHT - Profile Circle + role/designation */}
          <div className="relative flex items-center gap-3">
            {/* Role/Designation derived from persona/documents */}
            <div className="min-w-0 text-right">
              <div
                style={{
                  fontSize: '12px',
                  color: '#6B7280',
                  fontWeight: 600,
                  lineHeight: '1.1',
                }}
                className="truncate"
                title={personaTitle || ''}
              >
                {personaTitle || ''}
              </div>
            </div>

            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200"
              style={{
                backgroundColor: '#14B8A6',
                color: 'white',
                fontSize: '14px',
                fontWeight: 600,
              }}
              aria-label="Open profile menu"
              title={personaTitle || 'Your profile'}
            >
              {avatarInitials}
            </button>

            <AnimatePresence>
              {!isFileDialogActive && isProfileOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="absolute right-0 top-full mt-2 w-40 bg-white rounded-lg"
                  style={{
                    border: '1px solid #D1D5DB',
                    boxShadow: '0 8px 20px rgba(0, 0, 0, 0.08)',
                  }}
                >
                  <button className="w-full text-left px-4 py-2 hover:bg-gray-50">Profile Settings</button>
                  <button className="w-full text-left px-4 py-2 hover:bg-gray-50 text-red-600">Logout</button>
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
                backgroundColor: step1Complete ? '#14B8A6' : currentStep === 1 ? '#14B8A6' : 'transparent',
                border: step1Complete || currentStep === 1 ? 'none' : '2px solid #D1D5DB',
                color: step1Complete || currentStep === 1 ? 'white' : '#D1D5DB',
                fontSize: '16px',
                fontWeight: 600,
              }}
            >
              1
            </div>
            <span
              style={{
                fontSize: '14px',
                fontWeight: 500,
                color: step1Complete || currentStep === 1 ? '#1F2937' : '#6B7280',
              }}
            >
              Ingestion Hub
            </span>
          </div>

          <div className="h-0.5 w-12 transition-colors duration-300" style={{ backgroundColor: step1Complete ? '#14B8A6' : '#D1D5DB' }} />

          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300"
              style={{
                backgroundColor: step2Complete ? '#14B8A6' : currentStep === 2 ? '#14B8A6' : 'transparent',
                border: step2Complete || currentStep === 2 ? 'none' : '2px solid #D1D5DB',
                color: step2Complete || currentStep === 2 ? 'white' : '#D1D5DB',
                fontSize: '16px',
                fontWeight: 600,
              }}
            >
              2
            </div>
            <span
              style={{
                fontSize: '14px',
                fontWeight: 500,
                color: step2Complete || currentStep === 2 ? '#1F2937' : '#6B7280',
              }}
            >
              Persona Validation
            </span>
          </div>

          <div className="h-0.5 w-12 transition-colors duration-300" style={{ backgroundColor: step2Complete ? '#14B8A6' : '#D1D5DB' }} />

          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300"
              style={{
                backgroundColor: step3Complete ? '#14B8A6' : currentStep === 3 ? '#14B8A6' : 'transparent',
                border: step3Complete || currentStep === 3 ? 'none' : '2px solid #D1D5DB',
                color: step3Complete || currentStep === 3 ? 'white' : '#D1D5DB',
                fontSize: '16px',
                fontWeight: 600,
              }}
            >
              3
            </div>
            <span
              style={{
                fontSize: '14px',
                fontWeight: 500,
                color: step3Complete || currentStep === 3 ? '#1F2937' : '#6B7280',
              }}
            >
              Finalized Persona
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main style={{ padding: '48px 32px' }}>
        {/* Initial State */}
        {state === 'initial' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="max-w-2xl mx-auto text-center">
            <motion.h2
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="relative inline-block cursor-default"
              style={{
                fontSize: '36px',
                fontWeight: 700,
                color: '#14B8A6',
                marginBottom: '8px',
                transition: 'color 0.3s ease',
              }}
            >
              View Current State Persona
              <motion.span className="upload-heading-underline" initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 0.5, ease: 'easeOut' }} key="static-underline" />
            </motion.h2>
            <p style={{ fontSize: '16px', color: '#6B7280', marginBottom: '32px' }}>Upload your Professional Documents to generate your AI-powered Persona</p>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt"
              onChange={handleFileChange}
              style={{
                display: 'none',
                position: 'fixed',
                top: '-1000px',
                left: '-1000px',
              }}
              tabIndex={-1}
            />

            <div
              className="bg-white rounded-xl p-8 transition-all duration-300 group"
              style={{
                boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.05)',
                marginBottom: '24px',
                border: '1px solid rgba(20, 184, 166, 0.3)',
              }}
              onMouseEnter={(e) => {
                if (!shouldAllowHoverEffects()) return;
                e.currentTarget.style.border = '1px solid #14B8A6';
                e.currentTarget.style.boxShadow = '0px 6px 16px rgba(20, 184, 166, 0.15)';
              }}
              onMouseLeave={(e) => {
                if (!shouldAllowHoverEffects()) return;
                e.currentTarget.style.border = '1px solid rgba(20, 184, 166, 0.3)';
                e.currentTarget.style.boxShadow = '0px 4px 12px rgba(0, 0, 0, 0.05)';
              }}
            >
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className="border-2 border-dashed rounded-xl p-12 transition-colors hover:bg-gray-50"
                style={{
                  borderColor: '#D1D5DB',
                  backgroundColor: uploadedFiles.length > 0 ? 'rgba(20, 184, 166, 0.05)' : 'transparent',
                }}
                role="region"
                aria-label="Upload documents (drag and drop)"
              >
                <Upload className="mx-auto mb-4" size={48} style={{ color: '#14B8A6' }} />
                <p style={{ fontSize: '16px', fontWeight: 500, color: '#1F2937', marginBottom: '8px' }}>
                  {uploadedFiles.length > 0 ? `${uploadedFiles.length} file(s) uploaded` : 'Upload your Documents '}
                </p>
                <p style={{ fontSize: '14px', color: '#6B7280' }}>Resume, Job Description, Performance Review, Certifications</p>
                <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '12px' }}>Supported formats: PDF, DOCX, TXT (Max {MAX_FILES} files)</p>

                <button
                  type="button"
                  onClick={openFilePicker}
                  disabled={isFileDialogActive}
                  className="inline-flex items-center justify-center rounded-lg transition-all duration-200"
                  style={{
                    backgroundColor: '#14B8A6',
                    color: 'white',
                    padding: '10px 14px',
                    fontSize: '14px',
                    fontWeight: 600,
                    border: 'none',
                    cursor: isFileDialogActive ? 'not-allowed' : 'pointer',
                    opacity: isFileDialogActive ? 0.85 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!shouldAllowHoverEffects()) return;
                    e.currentTarget.style.backgroundColor = '#0FB9B1';
                  }}
                  onMouseLeave={(e) => {
                    if (!shouldAllowHoverEffects()) return;
                    e.currentTarget.style.backgroundColor = '#14B8A6';
                  }}
                >
                  Select Files
                </button>
              </div>

              {uploadError && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    fontSize: '14px',
                    color: '#DC2626',
                    marginTop: '12px',
                    textAlign: 'center',
                  }}
                >
                  {uploadError}
                </motion.p>
              )}

              {uploadedFiles.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mt-6 space-y-2">
                  {uploadedFiles.map((fileData) => (
                    <div
                      key={fileData.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: 'rgba(20, 184, 166, 0.1)', color: '#14B8A6' }}>
                          {getFileType(fileData.file.name)}
                        </span>
                        <span style={{ fontSize: '14px', color: '#1F2937', fontWeight: 500 }}>{fileData.file.name}</span>
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
                cursor: uploadedFiles.length > 0 ? 'pointer' : 'not-allowed',
              }}
              onMouseEnter={(e) => {
                if (uploadedFiles.length > 0) e.currentTarget.style.backgroundColor = '#0FB9B1';
              }}
              onMouseLeave={(e) => {
                if (uploadedFiles.length > 0) e.currentTarget.style.backgroundColor = '#14B8A6';
              }}
            >
              Generate Draft Persona
            </button>
          </motion.div>
        )}

        {/* Processing/Draft State - Two Column Layout */}
        {(state === 'processing' || state === 'draft') && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="max-w-7xl mx-auto" style={{ paddingBottom: '0' }}>
            <motion.h2
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              onMouseEnter={() => {
                if (isFileDialogActive) return;
                setIsHoveringHeading(true);
              }}
              onMouseLeave={() => {
                if (isFileDialogActive) return;
                setIsHoveringHeading(false);
              }}
              className="relative inline-block cursor-default mx-auto"
              style={{
                fontSize: state === 'draft' ? '36px' : '32px',
                fontWeight: 700,
                color: state === 'draft' ? '#14B8A6' : '#1F2937',
                marginBottom: '32px',
                display: 'block',
                textAlign: 'center',
                transition: 'all 0.3s ease',
              }}
            >
              {state === 'processing' ? 'View Current State Persona' : 'Draft Persona'}
              {state === 'draft' && isHoveringHeading && !isFileDialogActive && (
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
                    transformOrigin: 'left',
                  }}
                />
              )}
            </motion.h2>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
              {/* Left Column - Upload Status */}
              <motion.div initial={{ x: state === 'draft' ? 0 : -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.3, delay: 0.1, ease: 'easeInOut' }} className="lg:col-span-2">
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
                      cursor: 'pointer',
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
                    border: '1px solid rgba(20, 184, 166, 0.3)',
                  }}
                  onMouseEnter={(e) => {
                    if (!shouldAllowHoverEffects()) return;
                    e.currentTarget.style.border = '1px solid #14B8A6';
                    e.currentTarget.style.boxShadow = '0px 6px 16px rgba(20, 184, 166, 0.15)';
                  }}
                  onMouseLeave={(e) => {
                    if (!shouldAllowHoverEffects()) return;
                    e.currentTarget.style.border = '1px solid rgba(20, 184, 166, 0.3)';
                    e.currentTarget.style.boxShadow = '0px 4px 12px rgba(0, 0, 0, 0.05)';
                  }}
                >
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1F2937', marginBottom: '16px' }}>Uploaded Documents</h3>

                  <div className="space-y-3 mb-6">
                    {uploadedFiles.map((fileData) => (
                      <div key={fileData.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: 'rgba(20, 184, 166, 0.1)', color: '#14B8A6' }}>
                            {getFileType(fileData.file.name)}
                          </span>
                          <span style={{ fontSize: '14px', color: '#1F2937', fontWeight: 500 }}>{fileData.file.name}</span>
                        </div>
                        {state === 'draft' && (
                          <button onClick={() => removeFile(fileData.id)} className="p-1 rounded hover:bg-gray-200 transition-colors" style={{ color: '#6B7280' }}>
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

                  {/* Backend error banner */}
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

                  {state === 'draft' && (
                    <>
                      <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '16px' }}>Draft persona generated successfully.</p>

                      {uploadedFiles.length < MAX_FILES && (
                        <>
                          <input
                            ref={additionalFileInputRef}
                            type="file"
                            multiple
                            accept=".pdf,.docx,.txt"
                            onChange={handleFileChange}
                            style={{
                              display: 'none',
                              position: 'fixed',
                              top: '-1000px',
                              left: '-1000px',
                            }}
                            tabIndex={-1}
                          />
                          <button
                            onClick={(e) => openHiddenFileInput(additionalFileInputRef, e)}
                            className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-3 transition-colors hover:bg-gray-50"
                            style={{
                              borderColor: '#D1D5DB',
                              color: '#6B7280',
                              fontSize: '14px',
                              fontWeight: 500,
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
                <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.3, delay: 0.2 }} className="lg:col-span-3">
                  <div
                    className="bg-white rounded-xl transition-all duration-300"
                    style={{
                      boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.05)',
                      padding: '24px',
                      border: '1px solid rgba(20, 184, 166, 0.3)',
                    }}
                    onMouseEnter={(e) => {
                      if (!shouldAllowHoverEffects()) return;
                      e.currentTarget.style.border = '1px solid #14B8A6';
                      e.currentTarget.style.boxShadow = '0px 6px 16px rgba(20, 184, 166, 0.15)';
                    }}
                    onMouseLeave={(e) => {
                      if (!shouldAllowHoverEffects()) return;
                      e.currentTarget.style.border = '1px solid rgba(20, 184, 166, 0.3)';
                      e.currentTarget.style.boxShadow = '0px 4px 12px rgba(0, 0, 0, 0.05)';
                    }}
                  >
                    <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
                      <h3
                        style={{
                          fontSize: '20px',
                          fontWeight: 700,
                          color: '#14B8A6',
                          transition: 'filter 0.3s ease',
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

                      <div className="flex flex-wrap items-center gap-2 justify-end">
                        <button
                          onClick={handleRegenerateDraft}
                          className="rounded-lg transition-colors"
                          style={{
                            padding: '8px 14px',
                            backgroundColor: 'transparent',
                            color: '#6B7280',
                            border: '1px solid #D1D5DB',
                            fontSize: '14px',
                            fontWeight: 500,
                          }}
                        >
                          Regenerate Draft
                        </button>

                        <button
                          onClick={handleFinalize}
                          className="rounded-lg transition-all duration-200"
                          style={{
                            padding: '8px 14px',
                            backgroundColor: '#14B8A6',
                            color: 'white',
                            border: 'none',
                            fontSize: '14px',
                            fontWeight: 500,
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

                        {isEditable && (
                          <button
                            onClick={handleSaveChanges}
                            className="flex items-center gap-2 rounded-lg transition-all duration-200"
                            style={{
                              padding: '8px 14px',
                              backgroundColor: 'rgba(20, 184, 166, 0.10)',
                              color: '#0F766E',
                              border: '1px solid rgba(20, 184, 166, 0.35)',
                              fontSize: '14px',
                              fontWeight: 600,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(20, 184, 166, 0.16)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(20, 184, 166, 0.10)';
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
                                fontWeight: 500,
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
                            padding: '8px 14px',
                            backgroundColor: isEditable ? 'rgba(20, 184, 166, 0.1)' : 'transparent',
                            color: '#14B8A6',
                            border: '1px solid #14B8A6',
                            fontSize: '14px',
                            fontWeight: 500,
                          }}
                        >
                          <Edit3 size={16} />
                          {isEditable ? 'View Mode' : 'Editable View'}
                        </button>
                      </div>
                    </div>

                    {/* Persona Header: show role/designation; do not emphasize name in UI requirements */}
                    <div className="flex items-center gap-4 mb-6 pb-6" style={{ borderBottom: '1px solid #D1D5DB' }}>
                      <div className="relative group">
                        <input
                          ref={profileImageInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleProfileImageChange}
                          style={{
                            display: 'none',
                            position: 'fixed',
                            top: '-1000px',
                            left: '-1000px',
                          }}
                          tabIndex={-1}
                        />
                        {personaData?.profileImage ? (
                          <img src={personaData.profileImage} alt="Profile" className="w-16 h-16 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#14B8A6', color: 'white', fontSize: '24px', fontWeight: 600 }}>
                            {personaCardInitials}
                          </div>
                        )}
                        {isEditable && (
                          <button
                            onClick={(e) => openHiddenFileInput(profileImageInputRef, e)}
                            className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{
                              backgroundColor: 'rgba(0, 0, 0, 0.5)',
                            }}
                          >
                            <Camera size={20} style={{ color: 'white' }} />
                          </button>
                        )}
                      </div>

                      <div className="flex-1">
                        {isEditable ? (
                          <>
                            {/* Keep name editable for internal data, but UI requirement only mandates role/designation display. */}
                            <input
                              type="text"
                              value={personaData?.title ?? ''}
                              onChange={(e) => {
                                setPersonaData({ ...personaData, title: e.target.value });
                                setHasUnsavedChanges(true);
                              }}
                              className="w-full mb-2 rounded-lg border"
                              style={{
                                padding: '8px 12px',
                                borderColor: '#D1D5DB',
                                fontSize: '20px',
                                fontWeight: 700,
                                color: '#1F2937',
                              }}
                              placeholder="Role / Designation"
                            />
                            <input
                              type="text"
                              value={personaData?.name ?? ''}
                              onChange={(e) => {
                                setPersonaData({ ...personaData, name: e.target.value });
                                setHasUnsavedChanges(true);
                              }}
                              className="w-full rounded-lg border"
                              style={{
                                padding: '8px 12px',
                                borderColor: '#D1D5DB',
                                fontSize: '14px',
                                color: '#6B7280',
                              }}
                              placeholder="(Optional) Name"
                            />
                          </>
                        ) : (
                          <>
                            <h4 style={{ fontSize: '20px', fontWeight: 700, color: '#1F2937', marginBottom: '4px' }}>
                              {personaTitle || ''}
                            </h4>
                            {/* Name intentionally de-emphasized; keep as secondary if present */}
                            {personaName ? <p style={{ fontSize: '14px', color: '#6B7280' }}>{personaName}</p> : null}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Professional Summary */}
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-2">
                        <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937' }}>Professional Summary</h4>
                        <span
                          className="rounded-full px-2 py-1"
                          style={{
                            backgroundColor: 'rgba(20, 184, 166, 0.1)',
                            color: '#14B8A6',
                            fontSize: '12px',
                            fontWeight: 500,
                          }}
                        >
                          Draft
                        </span>
                      </div>
                      {isEditable ? (
                        <textarea
                          value={personaData?.summary ?? ''}
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
                            lineHeight: '1.6',
                          }}
                        />
                      ) : (
                        <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: '1.6' }}>{personaSummary}</p>
                      )}
                    </div>

                    {/* Skills */}
                    <div className="mb-6">
                      <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937', marginBottom: '12px' }}>Skills</h4>
                      <div className="flex flex-wrap gap-2">
                        {(personaData?.skills ?? []).map((skill, idx) => (
                          <span
                            key={idx}
                            className="rounded-full px-3 py-1.5 flex items-center gap-2 group"
                            style={{
                              backgroundColor: '#F3F4F6',
                              color: '#1F2937',
                              fontSize: '12px',
                              fontWeight: 500,
                            }}
                          >
                            {skill}
                            {isEditable && (
                              <button onClick={() => removeSkill(skill)} className="opacity-60 hover:opacity-100">
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
                              if (newSkillValue.trim()) addSkill(newSkillValue);
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
                              minWidth: '100px',
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
                              fontWeight: 500,
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
                      <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937', marginBottom: '12px' }}>Key Experiences</h4>
                      <div className="space-y-4">
                        {(personaData?.experiences ?? []).map((exp) => (
                          <div key={exp.id} className="pb-4 group" style={{ borderBottom: '1px solid #D1D5DB' }}>
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-1">
                                {isEditable ? (
                                  <>
                                    <input
                                      type="text"
                                      value={exp.role}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        const updated = personaData.experiences.map((item) => (item.id === exp.id ? { ...item, role: value } : item));
                                        setPersonaData({ ...personaData, experiences: updated });
                                        setHasUnsavedChanges(true);
                                      }}
                                      className="w-full mb-1 rounded border px-2 py-1"
                                      style={{
                                        fontSize: '14px',
                                        fontWeight: 600,
                                        color: '#1F2937',
                                        borderColor: '#D1D5DB',
                                      }}
                                    />
                                    <input
                                      type="text"
                                      value={exp.company}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        const updated = personaData.experiences.map((item) => (item.id === exp.id ? { ...item, company: value } : item));
                                        setPersonaData({ ...personaData, experiences: updated });
                                        setHasUnsavedChanges(true);
                                      }}
                                      className="w-full rounded border px-2 py-1"
                                      style={{
                                        fontSize: '14px',
                                        color: '#6B7280',
                                        borderColor: '#D1D5DB',
                                      }}
                                    />
                                  </>
                                ) : (
                                  <>
                                    <h5 style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937' }}>{exp.role}</h5>
                                    <p style={{ fontSize: '14px', color: '#6B7280' }}>{exp.company}</p>
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
                                      const updated = personaData.experiences.map((item) => (item.id === exp.id ? { ...item, date: value } : item));
                                      setPersonaData({ ...personaData, experiences: updated });
                                      setHasUnsavedChanges(true);
                                    }}
                                    className="rounded border px-2 py-1 text-right"
                                    style={{
                                      fontSize: '12px',
                                      color: '#6B7280',
                                      borderColor: '#D1D5DB',
                                      width: '110px',
                                    }}
                                  />
                                ) : (
                                  <span style={{ fontSize: '12px', color: '#6B7280' }}>{exp.date}</span>
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
                                  const updated = personaData.experiences.map((item) => (item.id === exp.id ? { ...item, description: value } : item));
                                  setPersonaData({ ...personaData, experiences: updated });
                                  setHasUnsavedChanges(true);
                                }}
                                rows={2}
                                className="w-full rounded border px-2 py-1"
                                style={{
                                  fontSize: '14px',
                                  color: '#6B7280',
                                  lineHeight: '1.6',
                                  borderColor: '#D1D5DB',
                                }}
                              />
                            ) : (
                              <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: '1.6' }}>{exp.description}</p>
                            )}
                          </div>
                        ))}
                      </div>

                      {isEditable && (
                        <button
                          onClick={() => {
                            const newExp: Experience = {
                              id: Math.random().toString(36).substr(2, 9),
                              role: 'New Role',
                              company: 'Company Name',
                              date: '2024 - Present',
                              description: 'Description of responsibilities and achievements.',
                            };
                            setPersonaData({
                              ...personaData,
                              experiences: [...personaData.experiences, newExp],
                            });
                            setHasUnsavedChanges(true);
                          }}
                          className="mt-4 flex items-center gap-2 rounded-lg border-2 border-dashed p-3 transition-colors hover:bg-gray-50 w-full justify-center"
                          style={{
                            borderColor: '#D1D5DB',
                            color: '#6B7280',
                            fontSize: '14px',
                            fontWeight: 500,
                          }}
                        >
                          <Plus size={16} />
                          Add Experience
                        </button>
                      )}
                    </div>

                    {/* Career Highlights */}
                    <div>
                      <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937', marginBottom: '12px' }}>Career Highlights</h4>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {(personaData?.careerHighlights ?? []).map((item, idx) => (
                          <div key={`${idx}-${item.highlight}`} className="p-3 rounded-lg border flex items-start gap-2" style={{ borderColor: '#D1D5DB', backgroundColor: '#FAFAFA' }}>
                            <Award size={16} style={{ color: '#14B8A6', marginTop: '2px', flexShrink: 0 }} />
                            <div className="min-w-0 w-full">
                              <p style={{ fontSize: '13px', color: '#1F2937', lineHeight: '1.5', marginBottom: item.sourceExperience ? '6px' : 0 }}>{item.highlight}</p>

                              {item.sourceExperience && (
                                <div
                                  className="flex items-start gap-2 rounded-md px-2 py-1 w-full max-w-full"
                                  style={{
                                    backgroundColor: 'rgba(20, 184, 166, 0.10)',
                                    border: '1px solid rgba(20, 184, 166, 0.25)',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: '12px',
                                      color: '#0F766E',
                                      fontWeight: 600,
                                      flexShrink: 0,
                                      lineHeight: '1.2',
                                      marginTop: '1px',
                                    }}
                                  >
                                    Source
                                  </span>
                                  <span
                                    style={{
                                      fontSize: '12px',
                                      color: '#0F766E',
                                      fontWeight: 500,
                                      lineHeight: '1.2',
                                      overflowWrap: 'anywhere',
                                      wordBreak: 'break-word',
                                    }}
                                    className="min-w-0"
                                  >
                                    {item.sourceExperience}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {(personaData?.careerHighlights ?? []).length === 0 && (
                        <p style={{ fontSize: '13px', color: '#6B7280', lineHeight: '1.5' }}>No career highlights found in the draft yet.</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {/* Finalized State */}
        {state === 'finalized' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="max-w-4xl mx-auto">
            <button
              onClick={() => setState('draft')}
              className="mb-6 flex items-center gap-2 transition-all duration-200 hover:opacity-80"
              style={{
                color: '#14B8A6',
                fontWeight: 500,
                fontSize: '14px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              ← Go Back
            </button>

            <h2
              onMouseEnter={(e) => {
                setIsHoveringHeading(true);
                e.currentTarget.style.filter = 'drop-shadow(0 0 8px rgba(20, 184, 166, 0.4))';
              }}
              onMouseLeave={(e) => {
                setIsHoveringHeading(false);
                e.currentTarget.style.filter = 'none';
              }}
              className="relative inline-block cursor-default mx-auto"
              style={{
                fontSize: '32px',
                fontWeight: 700,
                color: '#14B8A6',
                marginBottom: '32px',
                textAlign: 'center',
                display: 'block',
                transition: 'filter 0.3s ease',
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
                    transformOrigin: 'left',
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
                border: '1px solid rgba(20, 184, 166, 0.3)',
              }}
              onMouseEnter={(e) => {
                if (!shouldAllowHoverEffects()) return;
                e.currentTarget.style.boxShadow = '0px 8px 20px rgba(20, 184, 166, 0.2)';
              }}
              onMouseLeave={(e) => {
                if (!shouldAllowHoverEffects()) return;
                e.currentTarget.style.boxShadow = '0px 4px 12px rgba(0, 0, 0, 0.05)';
              }}
            >
              {/* Persona Header: role/designation first */}
              <div className="flex items-center gap-4 mb-8 pb-6" style={{ borderBottom: '1px solid #D1D5DB' }}>
                {personaData?.profileImage ? (
                  <img src={personaData.profileImage} alt="Profile" className="w-20 h-20 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-20 h-20 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#14B8A6', color: 'white', fontSize: '28px', fontWeight: 600 }}>
                    {personaCardInitials}
                  </div>
                )}

                <div>
                  <h3 style={{ fontSize: '24px', fontWeight: 700, color: '#1F2937', marginBottom: '4px' }}>{personaTitle}</h3>
                  {personaName ? <p style={{ fontSize: '16px', color: '#6B7280' }}>{personaName}</p> : null}
                </div>
              </div>

              {/* Professional Summary */}
              <div className="mb-8">
                <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#1F2937', marginBottom: '12px' }}>Professional Summary</h4>
                <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: '1.6' }}>{personaSummary}</p>
              </div>

              {/* Skills */}
              <div className="mb-8">
                <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#1F2937', marginBottom: '12px' }}>Skills</h4>
                <div className="flex flex-wrap gap-2">
                  {personaData.skills.map((skill, idx) => (
                    <span key={idx} className="rounded-full px-3 py-1.5" style={{ backgroundColor: '#F3F4F6', color: '#1F2937', fontSize: '12px', fontWeight: 500 }}>
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {/* Key Experiences */}
              <div className="mb-8">
                <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#1F2937', marginBottom: '12px' }}>Key Experiences</h4>
                <div className="space-y-6">
                  {personaData.experiences.map((exp) => (
                    <div key={exp.id}>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h5 style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937' }}>{exp.role}</h5>
                          <p style={{ fontSize: '14px', color: '#6B7280' }}>{exp.company}</p>
                        </div>
                        <span style={{ fontSize: '12px', color: '#6B7280' }}>{exp.date}</span>
                      </div>
                      <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: '1.6' }}>{exp.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Career Highlights */}
              <div className="mb-8">
                <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#1F2937', marginBottom: '12px' }}>Career Highlights</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {personaData.careerHighlights.map((item, idx) => (
                    <div key={`${idx}-${item.highlight}`} className="p-3 rounded-lg border flex items-start gap-2" style={{ borderColor: '#D1D5DB', backgroundColor: '#FAFAFA' }}>
                      <Award size={16} style={{ color: '#14B8A6', marginTop: '2px', flexShrink: 0 }} />
                      <div className="min-w-0 w-full">
                        <p style={{ fontSize: '13px', color: '#1F2937', lineHeight: '1.5', marginBottom: item.sourceExperience ? '6px' : 0 }}>{item.highlight}</p>

                        {item.sourceExperience && (
                          <div className="flex items-start gap-2 rounded-md px-2 py-1 w-full max-w-full" style={{ backgroundColor: 'rgba(20, 184, 166, 0.10)', border: '1px solid rgba(20, 184, 166, 0.25)' }}>
                            <span style={{ fontSize: '12px', color: '#0F766E', fontWeight: 600, flexShrink: 0, lineHeight: '1.2', marginTop: '1px' }}>Source</span>
                            <span style={{ fontSize: '12px', color: '#0F766E', fontWeight: 500, lineHeight: '1.2', overflowWrap: 'anywhere', wordBreak: 'break-word' }} className="min-w-0">
                              {item.sourceExperience}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Per requirement: no history/version tracking UI */}
            </motion.div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
