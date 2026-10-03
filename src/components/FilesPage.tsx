import React, { useState } from 'react';
import { FolderOpen, FileText, Image as ImageIcon, Video, Music, Trash2, Download, MessageSquare, ArrowLeft, Search, Upload } from 'lucide-react';
import { FileRecord } from '../types';
import { motion } from 'motion/react';
import { getAuthMediaUrl } from '../lib/api';
import { useLanguage } from '../lib/LanguageContext';

interface FilesPageProps {
  files: FileRecord[];
  onDeleteFile: (id: string) => Promise<void>;
  onAskAboutFile: (file: FileRecord) => void;
  onBackToChat: () => void;
  onUploadFile: (file: File) => Promise<void>;
}

export const FilesPage: React.FC<FilesPageProps> = ({
  files,
  onDeleteFile,
  onAskAboutFile,
  onBackToChat,
  onUploadFile,
}) => {
  const { t } = useLanguage();
  const [activeType, setActiveType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const filteredFiles = files.filter((f) => {
    const matchesType = activeType === 'all' || f.type === activeType;
    const matchesSearch = f.originalName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesSearch;
  });

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (fileList && fileList.length > 0) {
      setIsUploading(true);
      try {
        await onUploadFile(fileList[0]);
      } finally {
        setIsUploading(false);
        e.target.value = '';
      }
    }
  };

  const getFileIcon = (type: FileRecord['type']) => {
    switch (type) {
      case 'pdf':
        return <FileText className="w-5 h-5 text-rose-400" />;
      case 'image':
        return <ImageIcon className="w-5 h-5 text-cyan-400" />;
      case 'video':
        return <Video className="w-5 h-5 text-purple-400" />;
      case 'audio':
        return <Music className="w-5 h-5 text-emerald-400" />;
      default:
        return <FolderOpen className="w-5 h-5 text-amber-400" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 overflow-y-auto z-10 relative transition-colors">
      {/* Top Header */}
      <div className="p-4 sm:p-8 border-b border-zinc-200 dark:border-white/10 bg-zinc-50/80 dark:bg-[#0a0a0a]/80 backdrop-blur-xl shrink-0">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={onBackToChat}
            className="flex items-center gap-2 text-xs text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white mb-4 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('backToChat')}
          </button>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 flex items-center justify-center text-zinc-900 dark:text-white shrink-0">
                  <FolderOpen className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-zinc-900 dark:text-white tracking-tight truncate">Multimodal Knowledge Files</h1>
                  <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">
                    Uploaded documents, PDFs, images, videos, and voice recordings securely stored for AI reasoning.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <label className="flex items-center gap-2 px-4 py-2 rounded-xl bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 text-xs font-semibold shadow-sm transition-all cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>{isUploading ? 'Uploading...' : 'Upload File'}</span>
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileInput}
                  disabled={isUploading}
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.mp4,.webm,.mp3,.wav,.txt,.json,.md"
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto w-full p-4 sm:p-8 flex-1 flex flex-col gap-6 min-h-0">
        {/* Search & Tabs */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80 shrink-0">
            <Search className="w-4 h-4 text-zinc-600 dark:text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search uploaded files..."
              className="w-full bg-zinc-100 dark:bg-[#0d0d14] border border-zinc-200 dark:border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-white/30 transition-colors"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full sm:w-auto pb-1 sm:pb-0">
            {[
              { id: 'all', label: 'All Files' },
              { id: 'pdf', label: 'PDF Documents' },
              { id: 'image', label: 'Images' },
              { id: 'video', label: 'Videos' },
              { id: 'audio', label: 'Voice Notes' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveType(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-colors cursor-pointer ${
                  activeType === tab.id
                    ? 'bg-black text-white dark:bg-white dark:text-black font-semibold shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Files Grid */}
        {filteredFiles.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center rounded-2xl bg-zinc-50 dark:bg-[#09090f] border border-zinc-200 dark:border-white/10">
            <FolderOpen className="w-12 h-12 text-zinc-500 dark:text-zinc-400 mb-3" />
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">No files found</h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-sm mt-1">
              Upload PDFs, images, code files, or voice notes to analyze and synthesize them with Aestific.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFiles.map((file) => (
              <motion.div
                key={file.id}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 rounded-2xl bg-zinc-50 dark:bg-[#0c0c14] border border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20 transition-all flex flex-col justify-between group shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-zinc-200/70 dark:bg-zinc-800/80 flex items-center justify-center border border-zinc-300 dark:border-white/10">
                      {getFileIcon(file.type)}
                    </div>
                    <div className="flex items-center gap-1">
                      <a
                        href={getAuthMediaUrl(file.url)}
                        download={file.originalName}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5 transition-colors"
                        title="Download file"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => onDeleteFile(file.id)}
                        className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Delete file"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {(file.type === 'image' || file.mimeType?.startsWith('image/')) && file.url && (
                    <div className="w-full h-32 rounded-xl overflow-hidden mb-3 bg-black/10 dark:bg-black/40 border border-zinc-200 dark:border-white/5">
                      <img
                        src={getAuthMediaUrl(file.url)}
                        alt={file.originalName}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  )}

                  <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate mb-1" title={file.originalName}>
                    {file.originalName}
                  </h4>

                  <div className="flex items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-400 mb-4">
                    <span className="uppercase">{file.type}</span>
                    <span>•</span>
                    <span>{formatFileSize(file.size)}</span>
                    <span>•</span>
                    <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                  </div>

                  {file.extractedText && (
                    <div className="p-2 rounded-lg bg-zinc-100 dark:bg-black/40 border border-zinc-200 dark:border-white/10 text-[11px] text-zinc-700 dark:text-zinc-300 line-clamp-2 mb-4 font-mono">
                      {file.extractedText}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => onAskAboutFile(file)}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-zinc-200/80 dark:bg-zinc-800/60 border border-zinc-300 dark:border-white/10 text-zinc-800 dark:text-zinc-200 hover:text-black dark:hover:text-white hover:bg-zinc-300 dark:hover:bg-zinc-700 text-xs font-medium transition-all cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />
                  Ask Aestific About This File
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
