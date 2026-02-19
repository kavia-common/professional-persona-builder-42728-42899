"use client";

import { Upload } from "lucide-react";
import { useState } from "react";

interface UploadAreaProps {
  label: string;
  acceptedFormats?: string;
  onFileSelect?: (files: FileList) => void;
  multiple?: boolean;
}

// PUBLIC_INTERFACE
export function UploadArea({
  label,
  acceptedFormats = "PDF, DOCX",
  onFileSelect,
  multiple = false
}: UploadAreaProps) {
  /** Drag/drop file upload area (client component). */
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<string[]>([]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = (fileList: FileList) => {
    onFileSelect?.(fileList);
    const fileNames = Array.from(fileList).map((f) => f.name);
    setFiles((prev) => (multiple ? [...prev, ...fileNames] : fileNames));
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm text-gray-700">{label}</label>
      <div
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
          dragActive
            ? "border-[#0d9488] bg-[#f0fdfa]"
            : "border-gray-300 hover:border-[#0d9488] bg-gray-50"
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          multiple={multiple}
          onChange={handleChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#ccfbf1] flex items-center justify-center">
            <Upload className="w-6 h-6 text-[#0d9488]" />
          </div>
          <div>
            <p className="text-sm text-gray-700">
              <span className="text-[#0d9488] font-medium">Click to upload</span>{" "}
              or drag and drop
            </p>
            <p className="text-xs text-gray-500 mt-1">{acceptedFormats}</p>
          </div>
        </div>
      </div>
      {files.length > 0 && (
        <div className="mt-2 space-y-1">
          {files.map((fileName, index) => (
            <div
              key={index}
              className="text-sm text-gray-600 flex items-center gap-2"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[#0d9488]" />
              {fileName}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
