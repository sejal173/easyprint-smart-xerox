import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, AlertCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { uploadPrintFiles } from '../services/api';

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export default function FileUploader({ onFilesUploaded, disabled = false }) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const onDrop = async (acceptedFiles, rejectedFiles) => {
    if (disabled) return;

    if (rejectedFiles && rejectedFiles.length > 0) {
      const errorMsg = rejectedFiles[0].errors[0]?.message || 'File rejected';
      toast.error(`Upload error: ${errorMsg}`);
      return;
    }

    if (!acceptedFiles || acceptedFiles.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const result = await uploadPrintFiles(acceptedFiles, (percent) => {
        setUploadProgress(percent);
      });

      if (result.success && result.files) {
        toast.success(`Successfully uploaded ${result.files.length} document(s)!`);
        onFilesUploaded(result.files);
      }
    } catch (err) {
      console.error('Upload failed:', err);
      const msg = err.response?.data?.message || err.message || 'File upload failed';
      toast.error(msg);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: disabled || isUploading,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
    },
    maxSize: MAX_SIZE_BYTES,
    multiple: true,
  });

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <FileText className="w-4 h-4 text-brand-600" />
          <span>Upload Files to Print</span>
        </h2>
        <span className="text-xs text-slate-400 font-medium">Max 20MB per file</span>
      </div>

      <div
        {...getRootProps()}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
          disabled
            ? 'opacity-50 cursor-not-allowed border-slate-200 bg-slate-50'
            : isDragActive
            ? 'border-brand-500 bg-brand-50/50 scale-[0.99]'
            : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50/80 bg-slate-50/40'
        }`}
      >
        <input {...getInputProps()} />

        {isUploading ? (
          <div className="py-4 flex flex-col items-center">
            <Loader2 className="w-10 h-10 text-brand-600 animate-spin mb-3" />
            <p className="text-sm font-semibold text-slate-800">
              Verifying and inspecting documents... {uploadProgress}%
            </p>
            <div className="w-full max-w-xs bg-slate-200 h-2 rounded-full mt-3 overflow-hidden">
              <div
                className="bg-brand-600 h-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-3 shadow-inner">
              <UploadCloud className="w-7 h-7" />
            </div>
            <p className="text-sm font-bold text-slate-800">
              {isDragActive ? 'Drop your files here' : 'Tap to select or drag & drop files'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Supports <span className="font-semibold text-slate-700">PDF</span> documents and{' '}
              <span className="font-semibold text-slate-700">JPG, PNG</span> images
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-400 bg-white px-2.5 py-1 rounded-md border border-slate-200">
              <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
              Verified with true byte signatures & automatic page counting
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

