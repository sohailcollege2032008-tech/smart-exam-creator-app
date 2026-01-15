'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import { UploadCloud, File, X, FileAudio, FileVideo, FileText, Youtube, FileImage } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploaderProps {
    onFilesSelected: (files: File[]) => void;
    maxFiles?: number;
    acceptedFileTypes?: Record<string, string[]>;
    disabled?: boolean;
    files?: File[]; // Controlled state support
}

export function FileUploader({
    onFilesSelected,
    maxFiles = 20,
    acceptedFileTypes = {
        'application/pdf': ['.pdf'],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
        'application/msword': ['.doc'],
        'text/plain': ['.txt', '.md'],
        'audio/*': ['.mp3', '.wav', '.m4a'],
        'video/*': ['.mp4', '.mov'],
        'image/*': ['.png', '.jpg', '.jpeg', '.webp']
    },
    disabled = false,
    files: externalFiles // Alias for clarity
}: FileUploaderProps) {
    const [internalFiles, setInternalFiles] = useState<File[]>([]);

    // Sync with external files if provided
    React.useEffect(() => {
        if (externalFiles !== undefined) {
            setInternalFiles(externalFiles);
        }
    }, [externalFiles]);

    const files = externalFiles !== undefined ? externalFiles : internalFiles;

    const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
        if (disabled) return;

        // Filter duplicates
        const newFiles = acceptedFiles.filter(
            newFile => !files.some(existingFile => existingFile.name === newFile.name && existingFile.size === newFile.size)
        );

        if (newFiles.length > 0) {
            const updated = [...files, ...newFiles].slice(0, maxFiles);
            // If uncontrolled, update internal state
            if (externalFiles === undefined) setInternalFiles(updated);
            // Always notify parent
            onFilesSelected(updated);
        }

        if (rejectedFiles.length > 0) {
            // Simple alert for now, could be better UI
            alert(`Some files were rejected: ${rejectedFiles.map(f => f.file.name).join(', ')}`);
        }
    }, [files, maxFiles, onFilesSelected, disabled, externalFiles]);

    const removeFile = (index: number) => {
        const updated = files.filter((_, i) => i !== index);
        if (externalFiles === undefined) setInternalFiles(updated);
        onFilesSelected(updated);
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: acceptedFileTypes,
        maxFiles,
        disabled
    });

    const getFileIcon = (file: File) => {
        if (file.type.startsWith('audio/')) return <FileAudio className="w-5 h-5 text-purple-500" />;
        if (file.type.startsWith('video/')) return <FileVideo className="w-5 h-5 text-rose-500" />;
        if (file.type.startsWith('image/')) return <FileImage className="w-5 h-5 text-orange-500" />;
        if (file.type === 'application/pdf' ||
            file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            file.type === 'application/msword') return <FileText className="w-5 h-5 text-blue-500" />;
        return <File className="w-5 h-5 text-slate-500" />;
    };

    return (
        <div className="w-full space-y-4">
            <div
                {...getRootProps()}
                className={cn(
                    "border-2 border-dashed rounded-xl p-8 transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-3",
                    isDragActive
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-slate-300 dark:border-slate-700 hover:border-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800/50",
                    disabled && "opacity-60 cursor-not-allowed bg-slate-100 dark:bg-slate-800"
                )}
            >
                <input {...getInputProps()} />
                <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-full">
                    <UploadCloud className="w-6 h-6 text-slate-500 dark:text-slate-400" />
                </div>
                <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        {isDragActive ? "Drop the files here" : "Click to upload or drag & drop"}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                        PDF, TXT, MP3, MP4 (Max {maxFiles} files)
                    </p>
                </div>
            </div>

            {files.length > 0 && (
                <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Selected Files</h4>
                    <div className="grid gap-2">
                        {files.map((file, idx) => (
                            <div key={`${file.name}-${idx}`} className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    {getFileIcon(file)}
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{file.name}</span>
                                        <span className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                                    className="p-1 hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 rounded transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
