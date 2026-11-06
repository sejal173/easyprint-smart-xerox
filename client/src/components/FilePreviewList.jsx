import React from 'react';
import { FileText, Image as ImageIcon, Trash2, CheckCircle2 } from 'lucide-react';

export default function FilePreviewList({ files = [], onRemoveFile, disabled = false }) {
  if (!files || files.length === 0) return null;

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const totalPages = files.reduce((sum, f) => sum + (f.pageCount || 1), 0);

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">Uploaded Documents</h3>
          <p className="text-xs text-slate-500">
            {files.length} document{files.length > 1 ? 's' : ''} ready ({totalPages} total detected pages)
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          Verified
        </span>
      </div>

      <div className="space-y-2.5">
        {files.map((file, idx) => {
          const isPdf = file.mimeType === 'application/pdf';

          return (
            <div
              key={file.fileId || idx}
              className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-slate-300 transition"
            >
              <div className="flex items-center gap-3 min-w-0 pr-2">
                {/* Thumbnail or File Icon */}
                <div className="w-11 h-11 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden shadow-xs">
                  {file.previewUrl ? (
                    <img
                      src={file.previewUrl}
                      alt="preview"
                      className="w-full h-full object-cover"
                    />
                  ) : isPdf ? (
                    <div className="text-rose-600 flex flex-col items-center">
                      <FileText className="w-5 h-5" />
                      <span className="text-[8px] font-extrabold uppercase">PDF</span>
                    </div>
                  ) : (
                    <ImageIcon className="w-5 h-5 text-brand-600" />
                  )}
                </div>

                {/* File info */}
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-semibold text-slate-800 truncate" title={file.originalName}>
                    {file.originalName}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                    <span className="font-semibold text-brand-700 bg-brand-50 px-1.5 py-0.2 rounded border border-brand-100">
                      {file.pageCount} {file.pageCount === 1 ? 'page' : 'pages'}
                    </span>
                    <span>•</span>
                    <span>{formatFileSize(file.sizeBytes)}</span>
                  </div>
                </div>
              </div>

              {/* Remove button */}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onRemoveFile(file.fileId || idx)}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition active:scale-95"
                  title="Remove file"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

