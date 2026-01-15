'use client';

import React, { useEffect, useState } from 'react';
import { Job } from '@/lib/types';
import { getJobs, deleteJob } from '@/app/actions/job-manager';
import {
    Trash2,
    Calendar,
    Wand2,
    BrainCircuit,
    ArrowRight,
    Loader2,
    Search,
    FileText,
    MonitorPlay,
    Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SavedJobsProps {
    onLoadToExporter: (text: string, title?: string) => void;
}

export function SavedJobs({ onLoadToExporter }: SavedJobsProps) {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewingJob, setViewingJob] = useState<Job | null>(null);
    const [activeBatchItem, setActiveBatchItem] = useState<string | null>(null); // For folder view

    const fetchJobs = async () => {
        setIsLoading(true);
        try {
            const res = await getJobs();
            if (res.success) {
                setJobs(res.jobs);
            } else {
                setError(res.error || 'Failed to fetch jobs');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchJobs();
    }, []);

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this job?')) return;

        try {
            const res = await deleteJob(id);
            if (res.success) {
                setJobs(prev => prev.filter(j => j.id !== id));
                if (viewingJob?.id === id) setViewingJob(null);
            } else {
                alert('Failed to delete: ' + res.error);
            }
        } catch (err: any) {
            alert('Error deleting: ' + err.message);
        }
    };

    const handleSendToExporter = (e: React.MouseEvent, job: Job, batchItemId?: string) => {
        e.stopPropagation();

        // Batch Mode Export
        if (job.isBatch && job.batchItems) {
            if (batchItemId) {
                // Export Single File from Batch
                const item = job.batchItems.find(i => i.id === batchItemId);
                if (item) {
                    const text = item.data.arabizedText || item.data.formattedText || item.data.expandedText || '';
                    if (text) onLoadToExporter(text, item.fileName.replace(/\.[^/.]+$/, ""));
                    else alert('This file has no text content.');
                }
            } else {
                // Export ALL files (User asked for folder save, but export might strip context if combined? 
                // For now, let's just alert the user or export the first one/combine. 
                // Better approach: Prompt user or export combined text for now to keep it simple.)
                const combinedText = job.batchItems.map(item =>
                    `--- FILE: ${item.fileName} ---\n${item.data.arabizedText || item.data.formattedText || item.data.expandedText || ''}`
                ).join('\n\n');
                if (combinedText) onLoadToExporter(combinedText, job.name);
                else alert('Batch has no content.');
            }
            return;
        }

        // Single Job Export
        const text = job.data.arabizedText || job.data.formattedText || job.data.expandedText || '';
        if (text) {
            onLoadToExporter(text, job.name);
        } else {
            alert('This job has no text content to export.');
        }
    };

    const filteredJobs = jobs.filter(job =>
        job.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.metadata.model?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const [editContent, setEditContent] = useState('');

    const handleDuplicate = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm('Duplicate this job?')) return;
        try {
            const res = await import('@/app/actions/job-manager').then(m => m.duplicateJob(id));
            if (res.success && res.newJob) {
                setJobs(prev => [res.newJob!, ...prev]);
                alert('Job duplicated successfully');
            } else {
                alert('Failed to duplicate: ' + res.error);
            }
        } catch (err: any) {
            alert('Error: ' + err.message);
        }
    };

    const startEditing = () => {
        if (!viewingJob) return;
        setEditName(viewingJob.name);

        // Load content
        if (viewingJob.isBatch && viewingJob.batchItems) {
            const targetId = activeBatchItem || viewingJob.batchItems[0]?.id;
            const item = viewingJob.batchItems.find(i => i.id === targetId);
            if (item) {
                setEditContent(item.data.arabizedText || item.data.formattedText || item.data.expandedText || '');
            }
        } else {
            setEditContent(viewingJob.data.arabizedText || viewingJob.data.formattedText || viewingJob.data.expandedText || '');
        }
        setIsEditing(true);
    };

    const saveChanges = async () => {
        if (!viewingJob) return;

        try {
            await import('@/app/actions/job-manager').then(m => {
                const updates: any = { name: editName };

                if (viewingJob.isBatch && viewingJob.batchItems) {
                    const targetId = activeBatchItem || viewingJob.batchItems[0]?.id;
                    const updatedItems = viewingJob.batchItems.map(item => {
                        if (item.id === targetId) {
                            // Determine which field to update based on what exists, or default to formatted if all empty
                            const newData = { ...item.data };
                            if (item.data.arabizedText) newData.arabizedText = editContent;
                            else if (item.data.expandedText) newData.expandedText = editContent;
                            else newData.formattedText = editContent; // Default
                            return { ...item, data: newData };
                        }
                        return item;
                    });
                    updates.batchItems = updatedItems;
                } else {
                    const newData = { ...viewingJob.data };
                    if (viewingJob.data.arabizedText) newData.arabizedText = editContent;
                    else if (viewingJob.data.expandedText) newData.expandedText = editContent;
                    else newData.formattedText = editContent;
                    updates.data = newData;
                }

                return m.updateJob(viewingJob.id, updates).then(res => {
                    if (res.success) {
                        // Update local state
                        const updatedJob = { ...viewingJob, ...updates };
                        setJobs(prev => prev.map(j => j.id === viewingJob.id ? updatedJob : j));
                        setViewingJob(updatedJob);
                        setIsEditing(false);
                        alert('Saved changes!');
                    } else {
                        alert('Failed to save: ' + res.error);
                    }
                });
            });
        } catch (err: any) {
            alert('Error saving: ' + err.message);
        }
    };

    // Reset editing when switching files in batch
    useEffect(() => {
        if (isEditing && viewingJob?.isBatch) {
            const targetId = activeBatchItem || viewingJob.batchItems?.[0]?.id;
            const item = viewingJob.batchItems?.find(i => i.id === targetId);
            if (item) {
                setEditContent(item.data.arabizedText || item.data.formattedText || item.data.expandedText || '');
            }
        }
    }, [activeBatchItem]);

    const ViewingModal = viewingJob ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950/50 rounded-t-xl">
                    <div className="flex-grow mr-4">
                        {isEditing ? (
                            <input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-full text-lg font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                                placeholder="Job Name"
                            />
                        ) : (
                            <>
                                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{viewingJob.name}</h2>
                                <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                    <span className="uppercase font-bold tracking-wider">{viewingJob.type}</span>
                                    <span>•</span>
                                    {new Date(viewingJob.createdAt).toLocaleString()}
                                </div>
                            </>
                        )}
                    </div>
                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                        {!isEditing && (
                            <>
                                <button
                                    onClick={(e) => handleDuplicate(e, viewingJob.id)}
                                    className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-500 transition-colors text-xs font-medium flex items-center gap-1"
                                    title="Duplicate Job"
                                >
                                    Duplicate
                                </button>
                                <button
                                    onClick={startEditing}
                                    className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 rounded-lg transition-colors text-xs font-bold"
                                >
                                    Edit
                                </button>
                            </>
                        )}

                        {isEditing && (
                            <button
                                onClick={saveChanges}
                                className="p-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors text-xs font-bold"
                            >
                                Save
                            </button>
                        )}

                        <button
                            onClick={() => { setViewingJob(null); setIsEditing(false); }}
                            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                <div className="flex-grow overflow-auto p-6 bg-slate-50 dark:bg-black/20 flex flex-col md:flex-row gap-4">
                    {/* Batch Folder Sidebar */}
                    {viewingJob.isBatch && viewingJob.batchItems && (
                        <div className="w-full md:w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden flex-shrink-0">
                            <div className="p-3 bg-slate-100 dark:bg-slate-800 font-bold text-xs text-slate-500 uppercase">
                                Files ({viewingJob.batchItems.length})
                            </div>
                            <div className="max-h-[200px] md:max-h-none overflow-y-auto">
                                {viewingJob.batchItems.map((item, idx) => (
                                    <button
                                        key={item.id}
                                        onClick={() => setActiveBatchItem(item.id)}
                                        className={cn(
                                            "w-full text-left px-4 py-3 text-sm border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between group",
                                            activeBatchItem === item.id || (!activeBatchItem && idx === 0)
                                                ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-l-4 border-l-indigo-600"
                                                : "text-slate-600 dark:text-slate-400 border-l-4 border-l-transparent"
                                        )}
                                    >
                                        <span className="truncate">{item.fileName}</span>
                                        <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Content Viewer */}
                    <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 overflow-hidden flex flex-col shadow-sm">
                        {viewingJob.isBatch && viewingJob.batchItems ? (
                            (() => {
                                const targetId = activeBatchItem || viewingJob.batchItems[0]?.id;
                                const item = viewingJob.batchItems.find(i => i.id === targetId);
                                if (!item) return <div className="text-slate-400 italic">No file selected</div>;
                                return (
                                    <>
                                        <div className="flex justify-between items-center mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
                                            <h3 className="font-bold text-slate-700 dark:text-slate-200">{item.fileName}</h3>
                                            {!isEditing && (
                                                <button
                                                    onClick={(e) => handleSendToExporter(e, viewingJob, item.id)}
                                                    className="text-xs bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white px-2 py-1 rounded transition-colors"
                                                >
                                                    Export This File
                                                </button>
                                            )}
                                        </div>
                                        {isEditing ? (
                                            <textarea
                                                value={editContent}
                                                onChange={(e) => setEditContent(e.target.value)}
                                                className="w-full h-full min-h-[400px] p-4 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg font-mono text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
                                            />
                                        ) : (
                                            <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap text-slate-800 dark:text-slate-300 overflow-auto h-full">
                                                {item.data.arabizedText || item.data.formattedText || item.data.expandedText || "No content."}
                                            </div>
                                        )}
                                    </>
                                );
                            })()
                        ) : (
                            <>
                                {isEditing ? (
                                    <textarea
                                        value={editContent}
                                        onChange={(e) => setEditContent(e.target.value)}
                                        className="w-full h-full min-h-[400px] p-4 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg font-mono text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                ) : (
                                    <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap text-slate-800 dark:text-slate-300 overflow-auto h-full">
                                        {viewingJob.data.arabizedText || viewingJob.data.formattedText || viewingJob.data.expandedText || "No content."}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3 rounded-b-xl">
                    <button
                        onClick={(e) => handleDelete(e, viewingJob.id)}
                        className="px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                        <Trash2 className="w-4 h-4" /> Delete Job
                    </button>
                    <button
                        onClick={(e) => handleSendToExporter(e, viewingJob)}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
                    >
                        Send to Exporter <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    return (
        <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900 p-6 md:p-8 overflow-hidden relative">
            {ViewingModal}

            <div className="max-w-6xl mx-auto w-full flex flex-col h-full">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 flex-shrink-0">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Saved Jobs</h1>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">Review previous generations and export them.</p>
                    </div>

                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search jobs..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        />
                    </div>
                </div>

                {/* Content */}
                {isLoading ? (
                    <div className="flex-grow flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                    </div>
                ) : error ? (
                    <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-200">
                        {error}
                    </div>
                ) : jobs.length === 0 ? (
                    <div className="flex-grow flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/50 p-12">
                        <FileText className="w-16 h-16 mb-4 opacity-20" />
                        <h3 className="text-lg font-semibold text-slate-600 dark:text-slate-300">No Saved Jobs Yet</h3>
                        <p className="text-sm">Generate content in the Processor and click "Save"</p>
                    </div>
                ) : (
                    <div className="flex-grow overflow-y-auto pr-2 pb-10">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredJobs.map((job) => (
                                <div
                                    key={job.id}
                                    onClick={() => setViewingJob(job)}
                                    className="group bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all cursor-pointer relative overflow-hidden flex flex-col"
                                >
                                    <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                        <button
                                            onClick={(e) => handleDelete(e, job.id)}
                                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <div className="mb-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            {job.type === 'generator' ? (
                                                <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-md">
                                                    <Wand2 className="w-4 h-4" />
                                                </div>
                                            ) : (
                                                <div className="p-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-md">
                                                    <BrainCircuit className="w-4 h-4" />
                                                </div>
                                            )}
                                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{job.type}</span>
                                        </div>
                                        <h3 className="font-bold text-slate-800 dark:text-slate-100 line-clamp-1 text-lg mb-1">{job.name}</h3>
                                        <div className="flex items-center gap-2 text-xs text-slate-400">
                                            <Calendar className="w-3 h-3" />
                                            {new Date(job.createdAt).toLocaleDateString()}
                                            {job.isBatch && job.batchItems && (
                                                <div className="ml-2 flex items-center gap-1 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">
                                                    <span className="font-bold">{job.batchItems.length}</span> Files
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">

                                        <div className="text-xs text-slate-400">
                                            {job.metadata.model}
                                        </div>

                                        <button
                                            onClick={(e) => handleSendToExporter(e, job)}
                                            className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 text-slate-600 dark:text-slate-300 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5"
                                        >
                                            Export <ArrowRight className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
