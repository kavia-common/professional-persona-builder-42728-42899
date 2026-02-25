'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getErrorMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.keys(value as any).length > 0;
}

/**
 * Returns initials for a display label (e.g., user name) to be shown in avatar chips.
 * Keeps behavior consistent between different avatar locations.
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

function getNestedOrchestrationValue(
  root: any,
  path: Array<string | number>
): { value: any; foundPath: string } | null {
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
   * Authoritative candidate priority (per user_input_ref):
   * - artifacts.draftPersona is often where live backend persona data resides.
   */
  const candidates: Array<Array<string>> = [
    // TOP PRIORITY (authoritative): live persona draft often stored here
    ['artifacts', 'draftPersona'],

    // Other artifact envelopes
    ['artifacts', 'output'],
    ['artifacts', 'result'],
    ['artifacts', 'output', 'personaJson'],
    ['artifacts', 'finalPersona'],

    // Legacy/alternate locations
    ['artifacts', 'personaJson'],
    ['artifacts', 'final', 'personaJson'],
    ['artifacts', 'draft', 'personaJson'],
    ['artifacts', 'final'],
    ['artifacts', 'draft'],
    ['finalPersona'],
    ['final'],
    ['draftPersona'],
    ['draft'],

    // Fallback (authoritative): may contain full persona, but can also be non-persona (personaId-only) in some shapes
    ['results', 'generate', 'persona'],

    // Other legacy fallbacks
    ['results', 'finalize', 'final'],
    ['persona'],
  ];

  const looksLikePersona = (value: any): boolean => {
    if (!isNonEmptyObject(value)) return false;

    // Observed “current state persona” format
    if (
      typeof (value as any).professional_summary === 'string' ||
      Array.isArray((value as any).core_competencies) ||
      Array.isArray((value as any).career_highlights) ||
      isNonEmptyObject((value as any).technical_stack)
    ) {
      return true;
    }

    // Backend PersonaDraft shape (from OpenAPI)
    if (
      typeof (value as any).title === 'string' ||
      typeof (value as any).summary === 'string' ||
      Array.isArray((value as any).skills) ||
      isNonEmptyObject((value as any).profile)
    ) {
      return true;
    }

    return false;
  };

  let firstNonNull: { personaJson: any; sourcePath: string } | null = null;

  for (const path of candidates) {
    const hit = getNestedOrchestrationValue(orch, path);
    if (hit?.value === undefined || hit?.value === null) continue;

    // Keep the first non-null in case nothing persona-shaped exists.
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
   * Authoritative mapping rules (per user_input_ref):
   * - name: personaJson.profile.headline OR personaJson.name OR fallback.name
   * - title: personaJson.title OR fallback.title
   * - summary: personaJson.professional_summary OR personaJson.summary OR fallback.summary
   * - skills: personaJson.core_competencies OR personaJson.skills (string[])
   * - careerHighlights: personaJson.career_highlights, handling both:
   *    - string entries
   *    - object entries shaped like { text: string }
   *   Fallback to fallback.careerHighlights when missing/empty.
   */
  // eslint-disable-next-line no-console
  console.log('[persona][coerce] raw personaJson:', personaJson);

  try {
    const next: PersonaData = {
      ...fallback,

      // Map live backend keys to UI state keys
      name: personaJson?.profile?.headline || personaJson?.name || fallback.name,
      title: personaJson?.title || fallback.title,
      summary: personaJson?.professional_summary ?? personaJson?.summary ?? fallback.summary,
      skills: asStringArray(personaJson?.core_competencies ?? personaJson?.skills),

      // Handle array of strings OR array of objects { text: string } for highlights
      careerHighlights: Array.isArray(personaJson?.career_highlights)
        ? (personaJson.career_highlights
            .map((h: any) => (typeof h === 'object' && h !== null ? h.text : h))
            .filter((v: any) => typeof v === 'string' && v.trim().length > 0) as string[])
        : fallback.careerHighlights,
    };

    return next;
  } catch (err) {
    return fallback;
  }
}

export default function App() {
  /**
   * Render-loop diagnostics:
   * - we keep a simple render counter and timestamp window
   * - if renders spike, log an actionable snapshot (state/buildId/personaId)
   *
   * This is intentionally low-overhead (no setState) and only logs to console.
   */
  const renderDiagRef = useRef<{ count: number; windowStartMs: number }>({
    count: 0,
    windowStartMs: Date.now(),
  });

  renderDiagRef.current.count += 1;
  const nowMs = Date.now();
  const windowMs = 1500;
  if (nowMs - renderDiagRef.current.windowStartMs > windowMs) {
    renderDiagRef.current.count = 1;
    renderDiagRef.current.windowStartMs = nowMs;
  }

  /**
   * Mount guard: used to prevent setState after unmount and to stabilize any auto-trigger logic.
   * This also helps prevent runaway render loops caused by async flows updating state after teardown.
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
   * When backend failures happen, we set hasError and stop any further background loops
   * (e.g. polling) instead of resetting app state back to "initial"/restarting flows.
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
  const [isPolling, setIsPolling] = useState(false);

  // Version history state
  const [versions, setVersions] = useState<PersonaVersion[]>([]);
  const [versionsError, setVersionsError] = useState<string>('');
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

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
   * In some browser/DOM combinations, calling input.click() can synchronously trigger focus/click
   * side-effects that re-enter handlers, producing an event storm that looks like a “freeze”.
   *
   * Important: we use ONE guard for all hidden file inputs so multiple buttons can't race.
   */
  const isOpeningFilePickerRef = useRef(false);

  const openHiddenFileInput = useCallback(
    (inputRef: React.RefObject<HTMLInputElement>, e?: React.SyntheticEvent) => {
      /**
       * Opens a hidden <input type="file"> in a safe, non-reentrant way.
       * This is shared across all file pickers (primary upload, add-more, profile image).
       */
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      // Only allow user-initiated events to open the picker (defensive).
      const nativeEvent = (e as any)?.nativeEvent as Event | undefined;
      if (nativeEvent && 'isTrusted' in nativeEvent && !(nativeEvent as any).isTrusted) return;

      // If we're already processing a click, ignore all subsequent ones for 1 full second
      if (isOpeningFilePickerRef.current) return;
      isOpeningFilePickerRef.current = true;

      try {
        inputRef.current?.click();
      } finally {
        // Increase lockout to 1000ms to allow the OS file dialog to "take over"
        setTimeout(() => {
          isOpeningFilePickerRef.current = false;
        }, 1000);
      }
    },
    []
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

  // NOTE: Do not use additional click-guard patterns beyond openFilePicker.

  // Track object URLs so we can revoke them (prevents memory leaks and long-term slowdowns/freezes).
  const profileImageObjectUrlRef = useRef<string | null>(null);

  const initialPersonaFallback = useMemo<PersonaData>(
    () => ({
      /**
       * IMPORTANT:
       * Previously this UI used a hardcoded demo persona ("Sarah Johnson").
       * We now keep ONLY an empty/safe fallback so all persona/profile fields are driven by:
       * - orchestration draft (generated) and/or
       * - orchestration final (when finalized)
       * - saved persona/version history (already wired via personaId + /versions)
       *
       * This fallback exists only to avoid undefined checks before the first successful orchestration run.
       */
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

  /**
   * personaData must be stable. Initialize with a stable fallback from useMemo.
   * This avoids a null state and an extra effect for initialization, reducing re-renders.
   */
  const [personaData, setPersonaData] = useState<PersonaData>(initialPersonaFallback);

  // Memoize commonly accessed persona fields to keep effect deps primitive & stable.
  const personaName = personaData?.name ?? '';
  const personaTitle = personaData?.title ?? '';
  const personaSummary = personaData?.summary ?? '';

  // Requested: top-of-component render log (helps diagnose loops + data churn)
  // Throttle so it doesn't spam the console and appear like an infinite loop.
  const lastRenderLogAtRef = useRef<number>(0);
  if (nowMs - lastRenderLogAtRef.current > 1200) {
    lastRenderLogAtRef.current = nowMs;
    // eslint-disable-next-line no-console
    console.log('Rendering with data:', personaData);
  }

  // Render-loop diagnostics logging (after primitives exist).
  if (renderDiagRef.current.count >= 30) {
    // eslint-disable-next-line no-console
    console.warn('[render-loop][suspected] high render rate', {
      rendersWithinWindow: renderDiagRef.current.count,
      windowMs,
      state,
      buildId,
      personaId,
      isPolling,
      hasError,
      personaNameLen: personaName.length,
      personaTitleLen: personaTitle.length,
      personaSummaryLen: personaSummary.length,
    });
  }

  const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt'];
  const MAX_FILES = 5;

  const validateFile = (file: File): boolean => {
    const fileName = file.name.toLowerCase();
    const isValid = ALLOWED_EXTENSIONS.some((ext) => fileName.endsWith(ext));
    return isValid;
  };

  const addFiles = (files: File[]) => {
    // Avoid calling setState from inside other state updaters (can create confusing re-entrancy patterns).
    setUploadError('');
    setBackendError('');

    // Validate all files first (cheap) before touching state
    const invalidFiles = files.filter((file) => !validateFile(file));
    if (invalidFiles.length > 0) {
      setUploadError('Unsupported file format. Please upload PDF, DOCX, or TXT.');
      return;
    }

    // Precompute based on current state to avoid side effects inside updater function.
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Prevent bubbling into any parent click handlers (and avoid any chance of recursive click loops/freezes).
    e.stopPropagation();

    if (!e.target.files) return;

    const newFiles = Array.from(e.target.files);

    // Important: reset the input so selecting the same file again still fires onChange.
    // This avoids users repeatedly clicking/dragging thinking nothing happened.
    e.target.value = '';

    addFiles(newFiles);
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

    // Reset the circuit-breaker memory so a retry/new upload can't be blocked by an old build's artifact hash.
    // (Authoritative instruction from user_input_ref)
    lastAppliedPersonaArtifactJsonRef.current = {};

    // eslint-disable-next-line no-console
    console.log(`[draft][gen:${generationId}] handleGenerateDraft start`, {
      state,
      uploadedFilesCount: uploadedFiles.length,
      uploadedFilenames: uploadedFiles.map((f) => f.file.name),
      existingBuildId: buildId,
      existingPersonaId: personaId,
    });

    // Clear prior error guard on explicit user action.
    setHasError(false);

    setBackendError('');
    setVersionsError('');
    setVersions([]);
    setIsEditable(false);
    setHasUnsavedChanges(false);

    // Start backend-driven orchestration, then poll /builds/{id}/status for progress.
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

      // We still need to upload to establish latest docs on the backend; orchestration can then pick them up.
      await import('../lib/apiClient').then(async ({ uploadDocuments }) => {
        const uploadResp = await uploadDocuments({ files });
        // eslint-disable-next-line no-console
        console.log(`[draft][gen:${generationId}] uploadDocuments raw response:`, uploadResp);
      });

      const runAllRequest = {
        mode: 'persona_build' as const,
        // Leave userId null for now; backend supports null userId in scaffold.
        useLatestCategoryDocs: true,
        autoCreatePersona: true,
        generate: {
          saveDraft: true,
          createVersion: true,
        },
      };

      // Requested explicit logging for the orchestration call.
      // eslint-disable-next-line no-console
      console.log(`[orchestrationRunAll][gen:${generationId}] request:`, runAllRequest);

      const runAll = await orchestrationRunAll(runAllRequest);

      // Requested explicit logging for the orchestration response.
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

      // If the backend already produced persona artifacts immediately, we can enter draft state.
      // Otherwise we keep "processing" and let polling transition us.
      if (runAll.build.status === 'succeeded') {
        // eslint-disable-next-line no-console
        console.log(`[draft][gen:${generationId}] build already succeeded; entering draft state`);
        setState('draft');
      } else {
        // eslint-disable-next-line no-console
        console.log(`[draft][gen:${generationId}] build not yet succeeded; remain processing`, {
          status: runAll.build.status,
          progress: runAll.build.progress,
          currentStep: runAll.build.currentStep,
        });
        setState('processing');
      }
    } catch (e: any) {
      // Surface backend errors in UI (including payload details) instead of silently resetting.
      const payloadMsg =
        e?.payload && typeof e.payload === 'object' && e.payload !== null ? e.payload?.message || e.payload?.error : null;

      const message = payloadMsg || e?.message || 'Failed to generate draft persona.';
      // eslint-disable-next-line no-console
      console.error(`[draft][gen:${generationId}] generate draft failed`, { message, error: e });

      setBackendError(message);
      setHasError(true);

      // Keep user in processing view so they can see the error banner in the left column.
      setState('processing');
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

      if (!personaData) {
        setBackendError('Nothing to save yet (persona data not loaded).');
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
      // eslint-disable-next-line no-console
      console.log('[versions] listPersonaVersions raw response:', resp);
      const sorted = [...resp.versions].sort((a, b) => b.version - a.version);
      setVersions(sorted);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('[versions] listPersonaVersions failed:', e);
      setVersionsError(e?.message || 'Failed to load version history.');
    } finally {
      setIsLoadingVersions(false);
    }
  }

  // Poll build progress while processing
  useEffect(() => {
    if (!buildId) return;
    if (state !== 'processing') return;
    if (hasError) return;

    const generationId = generationIdRef.current;
    let cancelled = false;

    if (isMountedRef.current) setIsPolling(true);

    // eslint-disable-next-line no-console
    console.log(`[poll][gen:${generationId}] starting polling`, { buildId, state });

    const interval = setInterval(async () => {
      try {
        const status = await getBuildStatus(buildId);
        // eslint-disable-next-line no-console
        console.log(`[poll][gen:${generationId}] getBuildStatus raw response:`, status);

        if (cancelled || !isMountedRef.current) return;

        setBuildStatus(status);

        if (status.status === 'succeeded') {
          // eslint-disable-next-line no-console
          console.log(`[poll][gen:${generationId}] build succeeded; transitioning state -> draft`, status);
          setState('draft');
        } else if (status.status === 'failed' || status.status === 'cancelled') {
          // IMPORTANT: do not fail silently; log message
          // eslint-disable-next-line no-console
          console.error(`[poll][gen:${generationId}] build ${status.status}; message=`, status.message, 'full status=', status);
          setBackendError(status.message || `Build ${status.status}.`);
          setHasError(true);

          // Keep the processing screen visible so the user sees the backend error banner.
          setState('processing');
        } else {
          // queued/running: stay in processing
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

        // Keep the processing screen visible so the user sees the backend error banner.
        setState('processing');
      }
    }, 2000); // Polling interval intentionally 2000ms (reduced churn vs 800ms; per stability instructions)

    return () => {
      cancelled = true;
      if (isMountedRef.current) setIsPolling(false);
      clearInterval(interval);
      // eslint-disable-next-line no-console
      console.log(`[poll][gen:${generationId}] stopped polling (cleanup)`, { buildId });
    };
    // IMPORTANT: keep dependencies primitive to avoid object-identity loops.
  }, [buildId, state, hasError]);

  /**
   * Prevent render loops from repeated artifact fetches:
   * - Some backends may return a fresh object identity on each call.
   * - Even with JSON diff against PersonaData, any subtle normalization differences can cause churn.
   *
   * We track a hash of the *raw extracted personaJson* per buildId and skip work if unchanged.
   */
  const lastAppliedPersonaArtifactJsonRef = useRef<Record<string, string>>({});

  // When we enter draft state, attempt to fetch orchestration artifacts and populate UI persona (best-effort).
  useEffect(() => {
    if (!buildId || state !== 'draft' || hasError) return;

    /**
     * Ignore/unmount guard:
     * - prevents setState after unmount
     * - prevents applying results from an older effect instance after deps change
     */
    let isIgnore = false;

    const generationId = generationIdRef.current;

    const loadData = async () => {
      try {
        const { getOrchestrationByBuild } = await import('../lib/apiClient');
        const orch = await getOrchestrationByBuild(buildId);
        if (isIgnore) return;

        const { personaJson } = extractPersonaJsonFromOrchestrationRecord(orch);

        // Only proceed if we have a real object with keys
        if (personaJson && typeof personaJson === 'object' && Object.keys(personaJson).length > 0) {
          const artifactJson = safeJsonStringify(personaJson);

          // Double-gate circuit breaker:
          // Gate 1: Only consider applying if artifact JSON differs from what we've already applied for this build.
          // Gate 2: Only commit state (and update the ref) if coercion actually changes UI-visible fields.
          if (artifactJson !== lastAppliedPersonaArtifactJsonRef.current[buildId]) {
            setPersonaData((prev) => {
              const next = coercePersonaDataFromBackendJson(personaJson, prev);

              // Check 1: Did the coercion actually change any visible UI fields?
              if (JSON.stringify(next) === JSON.stringify(prev)) {
                return prev;
              }

              // Check 2: Update the ref ONLY if we are actually committing the change to state.
              lastAppliedPersonaArtifactJsonRef.current[buildId] = artifactJson;
              return next;
            });
          }
        }
      } catch (err) {
        // best-effort only; ignore, but log for diagnostics
        // eslint-disable-next-line no-console
        console.error(`[artifacts][gen:${generationId}] artifact fetch failed`, err);
      }
    };

    loadData();

    return () => {
      isIgnore = true;
    };
  }, [buildId, state, hasError]);

  // Load versions whenever personaId becomes available.
  useEffect(() => {
    // Guard: avoid backend 400s from undefined/empty/"null" IDs.
    if (!personaId || personaId === 'null') return;
    refreshVersions(personaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId]);

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

    // Reset the input so selecting the same image again re-triggers onChange.
    e.target.value = '';

    // Revoke any previous object URL to prevent memory leaks.
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

  const avatarInitials = useMemo(() => {
    return getInitials((personaName || personaTitle).trim());
  }, [personaName, personaTitle]);

  const personaCardInitials = useMemo(() => {
    return getInitials(personaName);
  }, [personaName]);

  const currentStep = state === 'initial' || state === 'processing' ? 1 : state === 'draft' ? 2 : 3;
  const step1Complete = state === 'draft' || state === 'finalized';
  const step2Complete = state === 'finalized';
  const step3Complete = state === 'finalized';

  const getFileType = (fileName: string): string => {
    const extension = fileName.split('.').pop()?.toUpperCase();
    return extension || 'FILE';
  }

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
            <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1F2937', margin: 0 }}>Career Navigator</h1>
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
                fontWeight: 600,
              }}
              aria-label="Open profile menu"
              title={personaName || personaTitle || 'Profile'}
            >
              {avatarInitials}
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
      <main style={{ padding: state === 'finalized' ? '48px 32px' : '48px 32px' }}>
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
              <motion.span
                className="upload-heading-underline"
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                // Ensure it doesn't re-animate on every state change
                key="static-underline"
              >
                View Current State Persona
              </motion.span>
            </motion.h2>
            <p style={{ fontSize: '16px', color: '#6B7280', marginBottom: '32px' }}>Upload your Professional Documents to generate your AI-powered Persona</p>

            {/* Keep the file input OUTSIDE the clickable dropzone to avoid self-trigger loops */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt"
              onChange={handleFileChange}
              /* STYLES TO PREVENT LAYOUT SHIFT: */
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
              // Important: no onClick on this outer wrapper. Only the intended dropzone triggers the file picker.
              onMouseEnter={(e) => {
                e.currentTarget.style.border = '1px solid #14B8A6';
                e.currentTarget.style.boxShadow = '0px 6px 16px rgba(20, 184, 166, 0.15)';
              }}
              onMouseLeave={(e) => {
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
                // Drag/drop only: do NOT make this div clickable to avoid recursive click loops/freezes.
                role="region"
                aria-label="Upload documents (drag and drop)"
              >
                <Upload className="mx-auto mb-4" size={48} style={{ color: '#14B8A6' }} />
                <p style={{ fontSize: '16px', fontWeight: 500, color: '#1F2937', marginBottom: '8px' }}>
                  {uploadedFiles.length > 0 ? `${uploadedFiles.length} file(s) uploaded` : 'Upload your Documents '}
                </p>
                <p style={{ fontSize: '14px', color: '#6B7280' }}>Resume, Job Description, Performance Review, Certifications</p>
                <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '12px' }}>
                  Supported formats: PDF, DOCX, TXT (Max {MAX_FILES} files)
                </p>

                <button
                  type="button"
                  onClick={openFilePicker}
                  className="inline-flex items-center justify-center rounded-lg transition-all duration-200"
                  style={{
                    backgroundColor: '#14B8A6',
                    color: 'white',
                    padding: '10px 14px',
                    fontSize: '14px',
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#0FB9B1';
                  }}
                  onMouseLeave={(e) => {
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
                        // This row should not re-open the file picker if clicked.
                        e.stopPropagation();
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="px-2 py-1 rounded text-xs font-medium"
                          style={{
                            backgroundColor: 'rgba(20, 184, 166, 0.1)',
                            color: '#14B8A6',
                          }}
                        >
                          {getFileType(fileData.file.name)}
                        </span>
                        <span style={{ fontSize: '14px', color: '#1F2937', fontWeight: 500 }}>{fileData.file.name}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          // Critical: stop bubbling so the parent dropzone doesn't re-trigger file dialog.
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
                transition: 'all 0.3s ease',
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
                    transformOrigin: 'left',
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
                    e.currentTarget.style.border = '1px solid #14B8A6';
                    e.currentTarget.style.boxShadow = '0px 6px 16px rgba(20, 184, 166, 0.15)';
                  }}
                  onMouseLeave={(e) => {
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
                          {buildStatus ? `Processing (${buildStatus.progress}%)${buildStatus.currentStep ? ` · ${buildStatus.currentStep}` : ''}` : 'Processing...'}
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
                      <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937', marginBottom: '10px' }}>Version History</h4>

                      {isLoadingVersions ? (
                        <div className="flex items-center gap-2" style={{ color: '#6B7280', fontSize: '13px' }}>
                          <Loader2 className="animate-spin" size={14} />
                          Loading versions...
                        </div>
                      ) : versionsError ? (
                        <div style={{ color: '#DC2626', fontSize: '13px' }}>{versionsError}</div>
                      ) : versions.length === 0 ? (
                        <div style={{ color: '#6B7280', fontSize: '13px' }}>{personaId ? 'No versions found yet.' : 'No saved persona yet (versions available after save).'}</div>
                      ) : (
                        <div className="space-y-2">
                          {versions.slice(0, 5).map((v) => (
                            <div key={v.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                              <div style={{ fontSize: '13px', color: '#1F2937', fontWeight: 500 }}>v{v.version}</div>
                              <div style={{ fontSize: '12px', color: '#6B7280' }}>{new Date(v.createdAt).toLocaleString()}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {state === 'draft' && (
                    <>
                      <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '16px' }}>Draft persona generated successfully.</p>

                      {uploadedFiles.length < MAX_FILES && (
                        <>
                          <input ref={additionalFileInputRef} type="file" accept=".pdf,.docx,.txt" multiple onChange={handleFileChange} className="hidden" />
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
                              fontWeight: 500,
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
                            padding: '8px 16px',
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

                    {/* Persona Header */}
                    <div className="flex items-center gap-4 mb-6 pb-6" style={{ borderBottom: '1px solid #D1D5DB' }}>
                      <div className="relative group">
                        <input ref={profileImageInputRef} type="file" accept="image/*" onChange={handleProfileImageChange} className="hidden" />
                        {personaData?.profileImage ? (
                          <img src={personaData.profileImage} alt="Profile" className="w-16 h-16 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div
                            className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: '#14B8A6', color: 'white', fontSize: '24px', fontWeight: 600 }}
                          >
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
                            <input
                              type="text"
                              value={personaData?.name ?? ''}
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
                                color: '#1F2937',
                              }}
                            />
                            <input
                              type="text"
                              value={personaData?.title ?? ''}
                              onChange={(e) => {
                                setPersonaData({ ...personaData, title: e.target.value });
                                setHasUnsavedChanges(true);
                              }}
                              className="w-full rounded-lg border"
                              style={{
                                padding: '8px 12px',
                                borderColor: '#D1D5DB',
                                fontSize: '14px',
                                color: '#6B7280',
                              }}
                            />
                          </>
                        ) : (
                          <>
                            <h4 style={{ fontSize: '20px', fontWeight: 600, color: '#1F2937', marginBottom: '4px' }}>{personaData?.name ?? ''}</h4>
                            <p style={{ fontSize: '14px', color: '#6B7280' }}>{personaData?.title ?? ''}</p>
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
                          AI Generated
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
                        <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: '1.6' }}>{personaData?.summary ?? ''}</p>
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
                            // Add experience logic
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
                        {(personaData?.careerHighlights ?? []).map((highlight, idx) => (
                          <div key={idx} className="p-3 rounded-lg border flex items-start gap-2" style={{ borderColor: '#D1D5DB', backgroundColor: '#FAFAFA' }}>
                            <Award size={16} style={{ color: '#14B8A6', marginTop: '2px', flexShrink: 0 }} />
                            <p style={{ fontSize: '13px', color: '#1F2937', lineHeight: '1.5' }}>{highlight}</p>
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
                    boxShadow: '0px -4px 12px rgba(0, 0, 0, 0.05)',
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
                        fontWeight: 500,
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
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
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
                e.currentTarget.style.boxShadow = '0px 8px 20px rgba(20, 184, 166, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0px 4px 12px rgba(0, 0, 0, 0.05)';
              }}
            >
              {/* Persona Header */}
              <div className="flex items-center gap-4 mb-8 pb-6" style={{ borderBottom: '1px solid #D1D5DB' }}>
                {personaData?.profileImage ? (
                  <img src={personaData.profileImage} alt="Profile" className="w-20 h-20 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-20 h-20 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#14B8A6', color: 'white', fontSize: '28px', fontWeight: 600 }}>
                    {personaCardInitials}
                  </div>
                )}
                <div>
                  <h3 style={{ fontSize: '24px', fontWeight: 600, color: '#1F2937', marginBottom: '4px' }}>{personaName}</h3>
                  <p style={{ fontSize: '16px', color: '#6B7280' }}>{personaTitle}</p>
                </div>
              </div>

              {/* Professional Summary */}
              <div className="mb-8">
                <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#1F2937', marginBottom: '12px' }}>Professional Summary</h4>
                <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: '1.6' }}>{personaData.summary}</p>
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
                  {personaData.careerHighlights.map((highlight, idx) => (
                    <div key={idx} className="p-3 rounded-lg border flex items-start gap-2" style={{ borderColor: '#D1D5DB', backgroundColor: '#FAFAFA' }}>
                      <Award size={16} style={{ color: '#14B8A6', marginTop: '2px', flexShrink: 0 }} />
                      <p style={{ fontSize: '13px', color: '#1F2937', lineHeight: '1.5' }}>{highlight}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Version history (finalized) */}
              <div>
                <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#1F2937', marginBottom: '12px' }}>Version History</h4>

                {isLoadingVersions ? (
                  <div className="flex items-center gap-2" style={{ color: '#6B7280', fontSize: '13px' }}>
                    <Loader2 className="animate-spin" size={14} />
                    Loading versions...
                  </div>
                ) : versionsError ? (
                  <div style={{ color: '#DC2626', fontSize: '13px' }}>{versionsError}</div>
                ) : versions.length === 0 ? (
                  <div style={{ color: '#6B7280', fontSize: '13px' }}>{personaId ? 'No versions found yet.' : 'No saved persona yet (versions available after save).'}</div>
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
