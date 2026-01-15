'use client';

import React, { useState, useCallback } from 'react';
import { PDFDocument } from 'pdf-lib';
import { FileText, Split, Plus, Trash2, X, Archive, Scissors, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils'; // Assuming you have utility class merger

interface SplitRange {
    id: string;
    startPage: number;
    endPage: number;
    topic: string;
}

interface PdfSplitterDialogProps {
    onClose: () => void;
    onSplitComplete: (files: { file: File; topic: string; originalName: string }[]) => void;
}

export function PdfSplitterDialog({ onClose, onSplitComplete }: PdfSplitterDialogProps) {
    const [file, setFile] = useState<File | null>(null);
    const [pageCount, setPageCount] = useState<number>(0);
    const [ranges, setRanges] = useState<SplitRange[]>([
        { id: '1', startPage: 1, endPage: 1, topic: '' }
    ]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        if (selectedFile.type !== 'application/pdf') {
            setError('Please upload a valid PDF file.');
            return;
        }

        try {
            const arrayBuffer = await selectedFile.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const pages = pdfDoc.getPageCount();

            setFile(selectedFile);
            setPageCount(pages);
            setRanges([{ id: Date.now().toString(), startPage: 1, endPage: pages, topic: '' }]); // Default full range
            setError(null);
        } catch (err) {
            console.error(err);
            setError('Failed to load PDF. It might be encrypted or corrupted.');
        }
    };

    const addRange = () => {
        const lastRange = ranges[ranges.length - 1];
        const newStart = lastRange ? Math.min(lastRange.endPage + 1, pageCount) : 1;
        setRanges([
            ...ranges,
            { id: Date.now().toString(), startPage: newStart, endPage: pageCount, topic: '' },
        ]);
    };

    const removeRange = (id: string) => {
        setRanges(ranges.filter((r) => r.id !== id));
    };

    const updateRange = (id: string, field: keyof SplitRange, value: any) => {
        setRanges(
            ranges.map((r) => {
                if (r.id === id) {
                    return { ...r, [field]: value };
                }
                return r;
            })
        );
    };

    const processSplit = async () => {
        if (!file) return;
        setIsProcessing(true);
        setError(null);

        try {
            const arrayBuffer = await file.arrayBuffer();
            const srcDoc = await PDFDocument.load(arrayBuffer);
            const resultFiles: { file: File; topic: string; originalName: string }[] = [];

            for (const range of ranges) {
                // Validate
                if (range.startPage < 1 || range.endPage > pageCount || range.startPage > range.endPage) {
                    throw new Error(`Invalid range: ${range.startPage}-${range.endPage}`);
                }

                // Create new PDF
                const subDoc = await PDFDocument.create();
                // Pages are 0-indexed in pdf-lib
                const pageIndices = [];
                for (let i = range.startPage - 1; i < range.endPage; i++) {
                    pageIndices.push(i);
                }

                const copiedPages = await subDoc.copyPages(srcDoc, pageIndices);
                copiedPages.forEach((page) => subDoc.addPage(page));

                const pdfBytes = await subDoc.save();
                const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });

                // Naming convention: "Topic_File.pdf" or "Part_X_File.pdf"
                const cleanTopic = range.topic.trim().replace(/[^a-zA-Z0-9\u0600-\u06FF\s-_]/g, '');
                const fileName = cleanTopic
                    ? `${cleanTopic}.pdf`
                    : `${file.name.replace('.pdf', '')}_Part_${range.startPage}-${range.endPage}.pdf`;

                const splitFile = new File([blob], fileName, { type: 'application/pdf' });

                resultFiles.push({
                    file: splitFile,
                    topic: range.topic, // Pass the raw topic for AI prompting
                    originalName: fileName
                });
            }

            onSplitComplete(resultFiles);
            onClose();

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Error occurred while splitting PDF.');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950/50 rounded-t-xl">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                            <Scissors className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800 dark:text-white">Smart PDF Splitter</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Extract chapters & filtering contexts.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-grow overflow-y-auto p-6 space-y-6">

                    {/* 1. File Upload */}
                    {!file ? (
                        <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors bg-slate-50/50 dark:bg-slate-900/50">
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <Archive className="w-10 h-10 mb-3 text-slate-400" />
                                <p className="mb-2 text-sm text-slate-500 dark:text-slate-400"><span className="font-semibold">Click to upload PDF</span> or drag and drop</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">PDFs only</p>
                            </div>
                            <input type="file" className="hidden" accept=".pdf" onChange={handleFileChange} />
                        </label>
                    ) : (
                        <div className="flex items-center justify-between p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 rounded-lg">
                            <div className="flex items-center gap-3">
                                <FileText className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                                <div>
                                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{file.name}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{pageCount} pages • {(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                </div>
                            </div>
                            <button
                                onClick={() => { setFile(null); setRanges([]); }}
                                className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 font-medium px-3 py-1 bg-white dark:bg-slate-800 rounded border border-red-200 dark:border-red-900 shadow-sm"
                            >
                                Change File
                            </button>
                        </div>
                    )}

                    {/* 2. Ranges */}
                    {file && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Split Ranges</h4>
                                <button
                                    onClick={addRange}
                                    className="text-xs flex items-center gap-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 px-3 py-1.5 rounded-md transition-colors text-slate-600 dark:text-slate-200"
                                >
                                    <Plus className="w-3 h-3" /> Add Range
                                </button>
                            </div>

                            <div className="space-y-3">
                                {ranges.map((range, index) => (
                                    <div key={range.id} className="flex flex-col sm:flex-row gap-3 p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm items-start sm:items-center">
                                        <span className="bg-slate-100 dark:bg-slate-700 text-slate-500 text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full shrink-0">
                                            {index + 1}
                                        </span>

                                        <div className="flex items-center gap-2 w-full sm:w-auto">
                                            <div className="flex flex-col">
                                                <label className="text-[10px] text-slate-400 uppercase font-bold pl-1">Starts</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max={pageCount}
                                                    value={range.startPage || ''}
                                                    onChange={(e) => {
                                                        const val = parseInt(e.target.value);
                                                        updateRange(range.id, 'startPage', isNaN(val) ? 0 : val);
                                                    }}
                                                    className="w-20 p-2 text-sm border border-slate-300 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:ring-1 focus:ring-indigo-500"
                                                />
                                            </div>
                                            <span className="text-slate-400 mt-4">-</span>
                                            <div className="flex flex-col">
                                                <label className="text-[10px] text-slate-400 uppercase font-bold pl-1">Ends</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max={pageCount}
                                                    value={range.endPage || ''}
                                                    onChange={(e) => {
                                                        const val = parseInt(e.target.value);
                                                        updateRange(range.id, 'endPage', isNaN(val) ? 0 : val);
                                                    }}
                                                    className="w-20 p-2 text-sm border border-slate-300 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:ring-1 focus:ring-indigo-500"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex-1 w-full">
                                            <div className="flex flex-col">
                                                <label className="text-[10px] text-slate-400 uppercase font-bold pl-1">Topic / Context Name (Optional)</label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. Acute Inflammation (Filters irrelevant content)"
                                                    value={range.topic}
                                                    onChange={(e) => updateRange(range.id, 'topic', e.target.value)}
                                                    className="w-full p-2 text-sm border border-slate-300 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-400"
                                                />
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => removeRange(range.id)}
                                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors mt-2 sm:mt-0"
                                            title="Remove Range"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 text-sm rounded-lg flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 rounded-b-xl flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-slate-600 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
                        disabled={isProcessing}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={processSplit}
                        disabled={isProcessing || !file || ranges.length === 0}
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg shadow-sm transition-transform active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex items-center gap-2"
                    >
                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Split className="w-4 h-4" />}
                        Split & Add to Batch
                    </button>
                </div>
            </div>
        </div>
    );
}
