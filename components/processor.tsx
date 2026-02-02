'use client';

import React, { useState, useEffect } from 'react';
import {
    Wand2,
    BrainCircuit,
    Globe2,
    Trash2,
    Download,
    FileDown,
    ChevronRight,
    Loader2,
    Sparkles,
    FileText,
    UploadCloud,
    Youtube,
    Save
} from 'lucide-react';
import { ApiKeyManager, incrementKeyUsage } from '@/components/internal/api-key-manager';
import { cn } from '@/lib/utils';
import {
    callGemini,
    formatterSystemPrompt,
    getExpansionSystemPrompt,
    arabizationSystemPrompt,
    solverSystemPrompt,
    getSolverSystemPrompt,
    getGeneratorSystemPrompt,
    SubjectType,
    ExplanationMode, // NEW
} from '@/lib/gemini';
import { PdfSplitterDialog } from '@/components/pdf-splitter-dialog';
import { Scissors } from 'lucide-react';
import { FileUploader } from './file-uploader';
import { initGeminiUpload, uploadGeminiChunk, getFileStatus } from '@/app/actions/upload-manager';
// ... other imports

// ... inside Processor component ...


// C. Solve
// ... (Rest of logic remains same)
import { processYoutubeVideo } from '@/app/actions/youtube-manager';
import { saveJob } from '@/app/actions/job-manager';
import { BatchResult } from '@/lib/types';
import { compressImage, compressPDF } from '@/lib/compression';
import { FileState } from "@google/generative-ai/server";

interface ProcessorProps {
    apiKey: string;
    setApiKey: (key: string) => void;
    onOutputChange: (text: string) => void;
    onJobNameChange?: (name: string) => void;
}



export function Processor({ apiKey, setApiKey, onOutputChange, onJobNameChange }: ProcessorProps) {
    // --- Helper: Clean AI Output ---
    const cleanAIOutput = (text: string) => {
        if (!text) return "";

        let clean = text;

        // 1. Remove markdown code blocks (```json ... ``` or just ``` ... ```)
        // Sometimes AI wraps the output in code blocks despite being told not to.
        const codeBlockRegex = /```(?:json|txt|markdown|)?\s*([\s\S]*?)\s*```/i;
        const matchCode = clean.match(codeBlockRegex);
        if (matchCode && matchCode[1]) {
            clean = matchCode[1].trim(); // Extract content inside the block
        }

        // 2. Remove <thinking> blocks
        clean = clean.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();

        // 3. Remove "Here is the..." conversational prefixes
        // Strategy: Find the first occurrence of "Question 1" or "Question [1]" or "---"
        // If found, strip everything before it.
        const match = clean.match(/(Question\s+\[?\d+\]?|---)/i);
        if (match && match.index && match.index > 0) {
            console.log("Cleaning conversational filler:", clean.substring(0, match.index));
            clean = clean.substring(match.index);
        }

        return clean;
    };

    // --- ROBUST CHUNKED UPLOAD HELPER ---
    const uploadFileInChunks = async (file: File, typeLabel: string) => {
        const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB Chunks (Required by Gemini API)
        const totalBytes = file.size;
        let offset = 0;

        setLoadingMessage(`Initializing upload for ${typeLabel}: ${file.name}...`);
        const initRes = await initGeminiUpload(apiKey, file.type || 'application/octet-stream', file.name, totalBytes);

        if (!initRes.success || !initRes.uploadUrl) {
            throw new Error(`Init failed: ${initRes.error}`);
        }

        const uploadUrl = initRes.uploadUrl;
        let fileResult = null;

        // Chunk Loop
        while (offset < totalBytes) {
            const end = Math.min(offset + CHUNK_SIZE, totalBytes);
            const isLast = end >= totalBytes;
            const chunkBlob = file.slice(offset, end);

            setLoadingMessage(`Uploading ${typeLabel}: ${file.name} (${Math.round((offset / totalBytes) * 100)}%)...`);

            const chunkFormData = new FormData();
            chunkFormData.append('chunk', chunkBlob);

            const chunkRes = await uploadGeminiChunk(uploadUrl, chunkFormData, offset, isLast);

            if (!chunkRes.success) {
                throw new Error(`Chunk failed: ${chunkRes.error}`);
            }

            if (isLast && chunkRes.file) {
                fileResult = chunkRes.file;
            }

            offset = end;
        }

        if (!fileResult) throw new Error("Upload finished but no file result returned.");

        // Poll for Active Status
        let state = fileResult.state;
        if (state === FileState.PROCESSING) {
            setLoadingMessage(`Processing ${file.name}...`);
            let attempts = 0;
            while (state === FileState.PROCESSING && attempts < 40) {
                await new Promise(r => setTimeout(r, 2000));
                const status = await getFileStatus(apiKey, fileResult.name);
                if (status.success && status.state) state = status.state;
                else if (!status.success) console.warn("Poll warning:", status.error);

                if (state === FileState.FAILED) throw new Error("Processing failed on Google Server");
                attempts++;
            }
        }
        return { mimeType: fileResult.mimeType, fileUri: fileResult.uri, name: fileResult.name };
    };

    // --- Input States (Generator) ---
    const [inputMode, setInputMode] = useState<'text' | 'file' | 'youtube'>('text');
    const [rawText, setRawText] = useState('');
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [fileMetadata, setFileMetadata] = useState<Map<string, { topic: string }>>(new Map()); // Filename -> Metadata

    // --- Input States (Solver) ---
    const [mode, setMode] = useState<'generator' | 'solver' | 'arabizer'>('generator');
    const [solverQuestionsFiles, setSolverQuestionsFiles] = useState<File[]>([]);
    const [solverReferenceFiles, setSolverReferenceFiles] = useState<File[]>([]);

    // --- Splitter State ---
    const [isSplitterOpen, setIsSplitterOpen] = useState(false);

    // --- Output States ---
    const [formattedText, setFormattedText] = useState('');
    const [expandedText, setExpandedText] = useState('');
    const [arabizedText, setArabizedText] = useState('');

    // --- Batch Mode State ---
    const [isBatchMode, setIsBatchMode] = useState(false);
    const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
    const [activeBatchIndex, setActiveBatchIndex] = useState(0);

    // --- UI/Loading States ---
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [currentAction, setCurrentAction] = useState<string | null>(null); // 'format', 'expand', 'arabize', 'process-files', 'solve'
    const [error, setError] = useState<string | null>(null);

    // --- Settings ---
    const [selectedModel, setSelectedModel] = useState('gemini-3-flash-preview');

    const [mcqCount, setMcqCount] = useState(10);
    const [writtenQuestionCount, setWrittenQuestionCount] = useState(2);
    const [expansionCount, setExpansionCount] = useState(5);
    const [difficulty, setDifficulty] = useState(5); // 1-10 Slider
    const [subjectType, setSubjectType] = useState<SubjectType>('standard');
    const [explanationMode, setExplanationMode] = useState<ExplanationMode>('standard');
    const [trustMarkedAnswers, setTrustMarkedAnswers] = useState(false); // NEW
    const [negativeLogic, setNegativeLogic] = useState(false); // NEW: Global Exception Logic
    const [autoCompress, setAutoCompress] = useState(true); // NEW: Smart Compression
    const [jobName, setJobName] = useState('');

    // --- Sync Job Name to Parent ---
    useEffect(() => {
        if (!onJobNameChange) return;

        if (isBatchMode && batchResults.length > 0) {
            const currentFn = batchResults[activeBatchIndex]?.fileName;
            if (currentFn) {
                const cleanName = currentFn.replace(/\.[^/.]+$/, "");
                onJobNameChange(cleanName);
            }
        } else if (jobName) {
            onJobNameChange(jobName);
        }
    }, [jobName, isBatchMode, batchResults, activeBatchIndex, onJobNameChange]);

    // --- View State ---
    const [viewMode, setViewMode] = useState<'formatted' | 'expanded' | 'arabized'>('formatted');

    // Sync output to parent whenever view or content changes
    useEffect(() => {
        let currentText = '';
        if (viewMode === 'formatted') {
            currentText = isBatchMode && batchResults[activeBatchIndex] ? batchResults[activeBatchIndex].formatted : formattedText;
        }
        else if (viewMode === 'expanded') {
            currentText = isBatchMode && batchResults[activeBatchIndex] ? batchResults[activeBatchIndex].expanded : expandedText;
        }
        else if (viewMode === 'arabized') {
            currentText = isBatchMode && batchResults[activeBatchIndex] ? batchResults[activeBatchIndex].arabized : arabizedText;
        }

        if (!currentText && formattedText) currentText = formattedText; // Fallback

        onOutputChange(currentText);
        onOutputChange(currentText);
    }, [formattedText, expandedText, arabizedText, viewMode, onOutputChange, isBatchMode, batchResults, activeBatchIndex]);

    const [splitterMode, setSplitterMode] = useState<'none' | 'primary' | 'reference'>('none');

    // --- Handlers ---



    const handleSplitComplete = (files: { file: File; topic: string; originalName: string }[]) => {
        console.log("Splitting complete, received files:", files.length, "Current Mode:", mode, "Splitter Mode:", splitterMode);

        // Merge with existing selectedFiles
        const newFiles = files.map(f => f.file);

        // Update Metadata
        setFileMetadata(prev => {
            const newMap = new Map(prev);
            files.forEach(f => {
                if (f.topic) {
                    newMap.set(f.file.name, { topic: f.topic });
                }
            });
            return newMap;
        });

        // Add to main list based on mode
        if (splitterMode === 'reference') {
            console.log("Adding to Solver Reference");
            setSolverReferenceFiles(prev => [...prev, ...newFiles]);
        } else if (mode === 'solver') {
            console.log("Adding to Solver Questions");
            setSolverQuestionsFiles(prev => [...prev, ...newFiles]);
            setIsBatchMode(true);
        } else {
            // generator or others
            console.log("Adding to Generator/Inputs");
            setSelectedFiles(prev => [...prev, ...newFiles]);
            setIsBatchMode(true); // Auto-enable batch mode for multiple splits
        }

        // Force view refresh if needed (usually automatic by state change)
        setLoadingMessage('Files split and added!');
        setTimeout(() => setLoadingMessage(''), 2000);
        setSplitterMode('none');
    };

    const handleSaveJob = async () => {
        const hasContent = formattedText || expandedText || arabizedText || (isBatchMode && batchResults.length > 0);
        if (!hasContent) return;

        setIsLoading(true);
        setLoadingMessage('Saving Job...');

        // Default name if empty
        const nameToSave = jobName.trim() || `Job ${new Date().toLocaleString()}`;

        try {
            const result = await saveJob({
                name: nameToSave,
                type: mode as any, // 'generator' | 'solver' | 'arabizer'
                data: {
                    formattedText: formattedText || undefined,
                    expandedText: expandedText || undefined,
                    arabizedText: arabizedText || undefined
                },
                isBatch: isBatchMode,
                batchItems: isBatchMode ? batchResults.map(r => ({
                    id: r.id,
                    fileName: r.fileName,
                    status: r.status,
                    data: {
                        formattedText: r.formatted,
                        expandedText: r.expanded,
                        arabizedText: r.arabized
                    }
                })) : undefined,
                metadata: {
                    model: selectedModel,
                    difficulty: mode === 'generator' ? difficulty : undefined,
                    mcqCount: mode === 'generator' ? mcqCount : undefined,
                    writtenCount: mode === 'generator' ? writtenQuestionCount : undefined,
                    subjectType,
                    explanationMode // NEW
                },
            });

            if (result.success) {
                setLoadingMessage('Saved!');
                setTimeout(() => setLoadingMessage(''), 1500);
            } else {
                setError(result.error || 'Failed to save job');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
            if (loadingMessage !== 'Saved!') setLoadingMessage('');
        }
    };

    const handleArabizeDirectly = async () => {
        if (!apiKey) {
            setError('Please enter API Key');
            return;
        }
        if (!rawText.trim()) {
            setError('Please enter text to Arabize');
            return;
        }

        setIsLoading(true);
        setCurrentAction('arabize');
        setLoadingMessage('Arabizing content...');
        setError(null);

        try {
            const result = await callGemini(
                apiKey,
                rawText,
                arabizationSystemPrompt,
                selectedModel
            );
            incrementKeyUsage(apiKey, selectedModel);
            setArabizedText(result);
            setViewMode('arabized');
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Arabization failed');
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
            setCurrentAction(null);
        }
    };

    const handleFormatText = async () => {
        if (!apiKey) {
            setError('Please enter API Key first');
            return;
        }
        if (!rawText) return;

        setIsLoading(true);
        setLoadingMessage('Formatting text...');
        setCurrentAction('format');
        setError(null);
        setFormattedText('');

        try {
            setLoadingMessage('Processing & Formatting Text...');

            // USER INSTRUCTION: Explicitly tell AI to format EVERYTHING and ignore limits.
            const instruction = `Analyze the provided text.
            1. **Identification:** Identify ALL questions (MCQs, Written, Complete) present in the text.
            2. **Zero Data Loss:** You must output EVERY single question found. Do NOT skip any. Do NOT summarize.
            3. **Formatting:** Convert them to the strict output format provided in system instructions.
            4. **Math:** Ensure all math is in MathML.
            
            If the text is just topics/notes (not questions), then generate high-quality questions covering the ENTIRITY of the content.`;

            // PASS 0 COUNTS to getGeneratorSystemPrompt so it doesn't inject "Generate Exactly X questions" constraints.
            // This forces it to rely on the "Zero Data Loss" rule in the base formatter prompt.
            const systemPrompt = getGeneratorSystemPrompt(difficulty, undefined, 0, 0, subjectType, explanationMode);

            const text = await callGemini(apiKey, instruction + "\n\nINPUT TEXT:\n" + rawText, systemPrompt, selectedModel);
            incrementKeyUsage(apiKey, selectedModel);

            // Clean up internal thinking blocks & conversational filler
            const cleanText = cleanAIOutput(text);

            setFormattedText(cleanText);
            setViewMode('formatted');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
            setCurrentAction(null);
        }
    };

    const handleProcessFiles = async () => {
        if (!apiKey) {
            setError('Please enter API Key first');
            return;
        }
        if (selectedFiles.length === 0) {
            setError('No files selected.');
            return;
        }

        setIsLoading(true);
        setCurrentAction('process-files');
        setError(null);
        setFormattedText('');

        try {
            // 2. Generate content
            setLoadingMessage('Analyzing content and generating questions...');



            // 2. Generate content
            if (isBatchMode) {
                // Initialize placeholders
                const initResults: BatchResult[] = selectedFiles.map((f, idx) => ({
                    id: `${Date.now()}-${idx}`,
                    fileName: f.name,
                    topic: fileMetadata.get(f.name)?.topic,
                    formatted: '',
                    expanded: '',
                    arabized: '',
                    status: 'idle'
                }));
                setBatchResults(initResults);
                setActiveBatchIndex(0);

                // Process individually
                for (let i = 0; i < selectedFiles.length; i++) {
                    let file = selectedFiles[i]; // Mutable for compression
                    const resultIndex = i;

                    // Update status to processing
                    setBatchResults(prev => prev.map((r, idx) => idx === resultIndex ? { ...r, status: 'processing' } : r));
                    setLoadingMessage(`Processing file ${i + 1}/${selectedFiles.length}: ${file.name}...`);

                    // --- SMART COMPRESSION LOGIC (BATCH) ---
                    if (autoCompress && file.size > 12 * 1024 * 1024) {
                        try {
                            setBatchResults(prev => prev.map((r, idx) => idx === resultIndex ? { ...r, status: 'processing' } : r)); // Ensure status
                            setLoadingMessage(`Compressing ${file.name} (Original: ${(file.size / 1024 / 1024).toFixed(1)}MB)...`);

                            if (file.type === 'application/pdf') {
                                file = await compressPDF(file, (curr, total) => {
                                    setLoadingMessage(`Compressing PDF Page ${curr}/${total}...`);
                                });
                            } else if (file.type.startsWith('image/')) {
                                file = await compressImage(file);
                            }
                            console.log(`Compressed batch file to: ${file.size}`);
                        } catch (compErr) {
                            console.error("Batch compression failed", compErr);
                        }
                    }
                    // ---------------------------------------



                    // Upload
                    let uploadResult;
                    try {
                        uploadResult = await uploadFileInChunks(file, "Batch File");
                    } catch (e: any) {
                        setBatchResults(prev => prev.map((r, idx) => idx === resultIndex ? { ...r, status: 'error', error: e.message || 'Upload failed' } : r));
                        continue;
                    }

                    // Generate
                    const filePart = {
                        fileData: { mimeType: uploadResult.mimeType, fileUri: uploadResult.fileUri }
                    };

                    const generationInstruction = isBatchMode && selectedFiles.length > 0
                        ? `Analyze the attached file and generate a quiz with: ${mcqCount} MCQs and ${writtenQuestionCount} Written Questions (${difficulty >= 9 ? 'CRITICAL' : 'Standard'} Level). Format EXACTLY as requested.`
                        : `Analyze the attached file and generate a quiz with: ${mcqCount} MCQs and ${writtenQuestionCount} Written Questions.`; // Fallback

                    // Inject TOPIC if available
                    const topic = fileMetadata.get(file.name)?.topic;
                    const systemPrompt = getGeneratorSystemPrompt(difficulty, topic, mcqCount, writtenQuestionCount, subjectType, explanationMode); // Pass SubjectType

                    try {
                        const text = await callGemini(apiKey, generationInstruction, systemPrompt, selectedModel, 0.3, [filePart]);
                        incrementKeyUsage(apiKey, selectedModel);

                        // Clean up internal thinking blocks & conversational filler
                        const cleanText = cleanAIOutput(text);

                        setBatchResults(prev => prev.map((r, idx) => idx === resultIndex ? { ...r, status: 'completed', formatted: cleanText } : r));
                    } catch (err: any) {
                        setBatchResults(prev => prev.map((r, idx) => idx === resultIndex ? { ...r, status: 'error', error: err.message } : r));
                    }
                }
                setViewMode('formatted');

            } else {
                // LEGACY: Combine all files
                const fileParts = [];

                // 1. Upload each file
                for (let i = 0; i < selectedFiles.length; i++) {
                    let file = selectedFiles[i]; // Mutable let, so we can swap it with compressed version

                    // --- SMART COMPRESSION LOGIC ---
                    if (autoCompress && file.size > 12 * 1024 * 1024) { // 12MB limit
                        try {
                            setLoadingMessage(`Compressing large file: ${file.name} (Original: ${(file.size / 1024 / 1024).toFixed(1)}MB)...`);
                            console.log(`Initial size: ${file.size}`);

                            if (file.type === 'application/pdf') {
                                file = await compressPDF(file, (curr, total) => {
                                    setLoadingMessage(`Compressing PDF Page ${curr}/${total}...`);
                                });
                            } else if (file.type.startsWith('image/')) {
                                file = await compressImage(file);
                            }
                            console.log(`Compressed size: ${file.size}`);
                            setLoadingMessage(`Compressed to ${(file.size / 1024 / 1024).toFixed(1)}MB. Uploading...`);
                        } catch (compErr) {
                            console.error("Compression failed, continuing with original", compErr);
                            // Fallback to original
                        }
                    }
                    // -------------------------------

                    // Chunked Upload
                    const uploadResult = await uploadFileInChunks(file, `File ${i + 1}/${selectedFiles.length}`);

                    fileParts.push({
                        fileData: { mimeType: uploadResult.mimeType, fileUri: uploadResult.fileUri }
                    });
                }

                setLoadingMessage('Analyzing content and generating questions...');
                const generationInstruction = `Analyze the attached files and generate a quiz with: ${mcqCount} MCQs and ${writtenQuestionCount} Written Questions (${difficulty >= 9 ? 'CRITICAL' : 'Standard'} Level). Format EXACTLY as requested.`;
                const systemPrompt = getGeneratorSystemPrompt(difficulty, undefined, mcqCount, writtenQuestionCount, subjectType, explanationMode); // Pass SubjectType

                const text = await callGemini(
                    apiKey,
                    generationInstruction,
                    systemPrompt,
                    selectedModel,
                    0.3,
                    fileParts
                );
                incrementKeyUsage(apiKey, selectedModel);

                // Clean up internal thinking blocks
                const cleanText = cleanAIOutput(text);

                setFormattedText(cleanText);
                setViewMode('formatted');
            }

        } catch (err: any) {
            console.error(err);
            setError(err.message || "Failed to process files");
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
            setCurrentAction(null);
        }
    };



    const handleYoutubeProcess = async () => {
        if (!apiKey) {
            setError('Please enter API Key first');
            return;
        }
        if (!youtubeUrl) {
            setError('Please enter a YouTube URL');
            return;
        }

        setIsLoading(true);
        setCurrentAction('process-youtube');
        setError(null);
        setFormattedText('');

        try {
            setLoadingMessage('Fetching Video Data (API + Transcript)...');

            const result = await processYoutubeVideo(youtubeUrl, apiKey);

            if (!result.success) {
                throw new Error(result.error || "Failed to process YouTube video");
            }

            if (result.type === 'text' && result.content) {
                // STRATEGY A: Text / Transcript
                setLoadingMessage('Optimizing Content (Transcript Mode)...');
                const systemPrompt = `You are an expert Educational Content Creator.
                TASK: Generate a high-quality quiz from the provided VIDEO CONTEXT (Title, Description, Transcript).
                - Use the Title/Description to understand the core topic if transcript is sparse.
                - If transcript is available, use it for detailed questions.
                ${formatterSystemPrompt}`;

                const generatedContent = await callGemini(apiKey, result.content, systemPrompt);
                incrementKeyUsage(apiKey, selectedModel);
                setFormattedText(generatedContent);
                setViewMode('formatted');

            } else if (result.type === 'audio' && result.fileUri) {
                // STRATEGY B: Audio Fallback
                setLoadingMessage('Processing Audio (Listening Mode)...');

                const fileParts = [{
                    fileData: {
                        mimeType: result.mimeType || 'audio/mp4',
                        fileUri: result.fileUri
                    }
                }];
                // Add Context if title exists
                const context = result.title ? `Video Title: "${result.title}".` : "";
                const prompt = `${context} Listen to this audio carefully. Generate a comprehensive quiz based on its content. Return valid JSON only.`;

                const generatedContent = await callGemini(apiKey, prompt, formatterSystemPrompt, undefined, undefined, fileParts);
                incrementKeyUsage(apiKey, selectedModel);
                setFormattedText(generatedContent);
                setViewMode('formatted');
            } else {
                throw new Error("Unexpected result type from server.");
            }



        } catch (err: any) {
            console.error(err);
            setError(err.message || "YouTube processing failed");
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
            setCurrentAction(null);
        }
    };

    const handleSolverMode = async () => {
        if (!apiKey) {
            setError('Please enter API Key first');
            return;
        }
        if (solverQuestionsFiles.length === 0 || solverReferenceFiles.length === 0) {
            setError('Please upload files for both Questions and Reference.');
            return;
        }

        setIsLoading(true);
        setCurrentAction('solve');
        setError(null);
        setFormattedText('');

        try {
            const fileParts = [];

            // A. Upload Question Files
            for (let i = 0; i < solverQuestionsFiles.length; i++) {
                let file = solverQuestionsFiles[i];
                // --- Compression Logic (Questions) ---
                if (autoCompress && file.size > 12 * 1024 * 1024) {
                    try {
                        setLoadingMessage(`Compressing Question: ${file.name}...`);
                        if (file.type === 'application/pdf') file = await compressPDF(file, () => { });
                        else if (file.type.startsWith('image/')) file = await compressImage(file);
                    } catch (e) { console.error(e); }
                }

                const fileData = await uploadFileInChunks(file, "Questions");
                fileParts.push({ fileData });
            }

            // B. Upload Reference Files
            for (let i = 0; i < solverReferenceFiles.length; i++) {
                let file = solverReferenceFiles[i];
                // --- Compression Logic (Reference) ---
                if (autoCompress && file.size > 12 * 1024 * 1024) {
                    try {
                        setLoadingMessage(`Compressing Ref: ${file.name}...`);
                        if (file.type === 'application/pdf') file = await compressPDF(file, () => { });
                        else if (file.type.startsWith('image/')) file = await compressImage(file);
                    } catch (e) { console.error(e); }
                }

                const fileData = await uploadFileInChunks(file, "Reference");
                fileParts.push({ fileData });
            }

            // C. Solve
            if (isBatchMode) {
                // Initialize Results
                const initResults: BatchResult[] = solverQuestionsFiles.map((f, idx) => ({
                    id: `${Date.now()}-${idx}`,
                    fileName: f.name,
                    topic: fileMetadata.get(f.name)?.topic,
                    formatted: '',
                    expanded: '',
                    arabized: '',
                    status: 'idle'
                }));
                setBatchResults(initResults);
                setActiveBatchIndex(0);

                // Strategy: Solve each question file individually using ALL reference files
                for (let i = 0; i < solverQuestionsFiles.length; i++) {
                    const qFile = solverQuestionsFiles[i];
                    const resultIndex = i;

                    setBatchResults(prev => prev.map((r, idx) => idx === resultIndex ? { ...r, status: 'processing' } : r));
                    setLoadingMessage(`Solving ${qFile.name} (${i + 1}/${solverQuestionsFiles.length})...`);

                    // Helper: We need to build the list of files for *this* request
                    // Questions: [Current], Reference: [All]

                    // Re-upload question file (or reuse logic if complex). 
                    // For simplicity/robustness, we just re-upload or ensure we have the URI.
                    // The loop above stored all in 'fileParts', but 'fileParts' combines them all.
                    // We need to isolate this Question file + All Reference files.

                    const currentQPart = fileParts[i]; // Questions are first in fileParts array (0..N-1)

                    if (!currentQPart) {
                        setBatchResults(prev => prev.map((r, idx) => idx === resultIndex ? { ...r, status: 'error', error: "Failed to retrieve uploaded question file reference." } : r));
                        continue;
                    }

                    const refParts = fileParts.slice(solverQuestionsFiles.length); // References are rest
                    const requestParts = [currentQPart, ...refParts];

                    let instruction = `The first file is the Question File. The remaining ${refParts.length} files are the Reference Material.\n\n`;

                    if (trustMarkedAnswers) {
                        instruction += `TASK: You are an EXPLANATION GENERATOR for the ALREADY SOLVED questions.
                        - **CRITICAL:** Identify the answer marked in the image/text.
                        - **CRITICAL:** DO NOT SOLVE. Justify WHY the marked answer is correct based on the Reference.
                        - **CRITICAL:** Output a <thinking> block first, explaining: "I see Q1 has marks on option X. The Header says Y..."
                        `;
                    } else {
                        instruction += `TASK: SOLVE every question found in the Question File using the Reference Material.
                         - **CRITICAL:** Output a <thinking> block first, explaining your reasoning step-by-step.
                         `;
                    }

                    if (negativeLogic) {
                        instruction += `\n- **GLOBAL RULE:** "Select the Exception". If 3 options are True, the Answer is the False one. If 3 are False, the Answer is the True one.`;
                    }

                    instruction += `\n- Output the solution for ALL questions found, in order.`;

                    try {
                        const topic = fileMetadata.get(qFile.name)?.topic;
                        const systemPrompt = getSolverSystemPrompt(topic, subjectType, explanationMode, trustMarkedAnswers, negativeLogic); // Pass negativeLogic

                        const text = await callGemini(apiKey, instruction, systemPrompt, selectedModel, 0.2, requestParts);
                        incrementKeyUsage(apiKey, selectedModel);

                        // Clean
                        const cleanText = cleanAIOutput(text);

                        setBatchResults(prev => prev.map((r, idx) => idx === resultIndex ? { ...r, status: 'completed', formatted: cleanText } : r));
                    } catch (e: any) {
                        setBatchResults(prev => prev.map((r, idx) => idx === resultIndex ? { ...r, status: 'error', error: e.message } : r));
                    }
                }
                setViewMode('formatted');

            } else {
                setLoadingMessage('Solving ALL questions found in the files...');

                let instruction = `The first ${solverQuestionsFiles.length} files are the Questions. The remaining ${solverReferenceFiles.length} files are the Reference Material.\n\n`;

                if (trustMarkedAnswers) {
                    instruction += `TASK: You are an EXPLANATION GENERATOR for the ALREADY SOLVED questions.
                    - **CRITICAL:** Identify the answer marked in the image/text.
                    - **CRITICAL:** DO NOT SOLVE. Justify WHY the marked answer is correct based on the Reference.
                    - **CRITICAL:** Output a <thinking> block first, explaining: "I see Q1 has marks on option X. The Header says Y..."
                    `;
                } else {
                    instruction += `TASK: SOLVE every question found in the "Questions" files using the Reference Material.
                     - **CRITICAL:** Output a <thinking> block first, explaining your reasoning step-by-step.
                     `;
                }

                if (negativeLogic) {
                    instruction += `\n- **GLOBAL RULE:** "Select the Exception". If 3 options are True, the Answer is the False one. If 3 are False, the Answer is the True one.`;
                }

                instruction += `\n- Output the solution for ALL questions found, in order.
                - Do NOT generate *new* questions.`;

                const text = await callGemini(
                    apiKey,
                    instruction,
                    getSolverSystemPrompt(undefined, subjectType, explanationMode, trustMarkedAnswers, negativeLogic),
                    selectedModel,
                    0.2, // Lower temp for factual solving
                    fileParts
                );
                incrementKeyUsage(apiKey, selectedModel);

                setFormattedText(text);
                setViewMode('formatted');
            }

        } catch (err: any) {
            console.error(err);
            setError(err.message || "Solver failed");
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
            setCurrentAction(null);
        }
    };

    const handleSmartExpansion = async () => {
        if (!apiKey) {
            setError('Please enter API Key first');
            return;
        }
        const seedData = formattedText || rawText;
        if (!seedData && (!isBatchMode || batchResults.length === 0)) {
            setError('No text to analyze. Please format text first.');
            return;
        }

        setIsLoading(true);
        setLoadingMessage('Generating new questions...');
        setCurrentAction('expand');
        setError(null);
        setExpandedText('');

        setExpandedText('');

        try {
            // Determine next number logic (simplified for batch)

            if (isBatchMode) {
                // Process in parallel for speed and robust state update
                const newResults = await Promise.all(batchResults.map(async (result, i) => {
                    if (!result.formatted) return result; // Skip empty

                    // Only update loading message for the first/general execution or use a generic one
                    if (i === 0) setLoadingMessage(`Expanding ${batchResults.length} files...`);

                    try {
                        let nextNum = 1;
                        try {
                            const matches = result.formatted.match(/Question\\s+(\\d+)/g);
                            if (matches && matches.length > 0) {
                                const lastNumStr = matches[matches.length - 1].match(/\\d+/)?.[0];
                                if (lastNumStr) nextNum = parseInt(lastNumStr, 10) + 1;
                            }
                        } catch (e) { console.warn('Could not determine question number', e); }

                        const generatedContent = await callGemini(
                            apiKey,
                            result.formatted,
                            getExpansionSystemPrompt(nextNum, expansionCount),
                            selectedModel
                        );
                        incrementKeyUsage(apiKey, selectedModel);

                        const formattedExpand = await callGemini(apiKey, generatedContent, formatterSystemPrompt, selectedModel);
                        incrementKeyUsage(apiKey, selectedModel);

                        return { ...result, expanded: formattedExpand };
                    } catch (e) {
                        console.error(`Failed to expand file ${result.fileName}`, e);
                        return result; // Return original on error
                    }
                }));

                setBatchResults(newResults);
                setViewMode('expanded');

            } else {
                let nextNum = 1;
                try {
                    const matches = seedData.match(/Question\\s+(\\d+)/g);
                    if (matches && matches.length > 0) {
                        const lastNumStr = matches[matches.length - 1].match(/\\d+/)?.[0];
                        if (lastNumStr) nextNum = parseInt(lastNumStr, 10) + 1;
                    }
                } catch (e) {
                    console.warn('Could not determine question number', e);
                }

                const generatedContent = await callGemini(
                    apiKey,
                    seedData,
                    getExpansionSystemPrompt(nextNum, expansionCount),
                    selectedModel
                );
                incrementKeyUsage(apiKey, selectedModel);

                const formattedExpand = await callGemini(apiKey, generatedContent, formatterSystemPrompt, selectedModel);
                incrementKeyUsage(apiKey, selectedModel);

                setExpandedText(formattedExpand);
                setViewMode('expanded');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
            setCurrentAction(null);
        }
    };

    const handleArabization = async () => {
        if (!apiKey) {
            setError('Please enter API Key first');
            return;
        }
        const sourceData = formattedText || rawText;
        if (!sourceData && (!isBatchMode || batchResults.length === 0)) {
            setError('No text to process.');
            return;
        }

        setIsLoading(true);
        setLoadingMessage('Translating to Arabic...');
        setCurrentAction('arabize');
        setError(null);
        setArabizedText('');

        try {
            if (isBatchMode) {
                setLoadingMessage(`Translating ${batchResults.length} files...`);

                const newResults = await Promise.all(batchResults.map(async (result) => {
                    if (!result.formatted) return result;
                    try {
                        const text = await callGemini(apiKey, result.formatted, arabizationSystemPrompt, selectedModel);
                        incrementKeyUsage(apiKey, selectedModel);
                        return { ...result, arabized: text };
                    } catch (e) {
                        console.error(`Failed to arabize ${result.fileName}`, e);
                        return result;
                    }
                }));

                setBatchResults(newResults);
                setViewMode('arabized');
            } else {
                const text = await callGemini(apiKey, sourceData, arabizationSystemPrompt, selectedModel);
                incrementKeyUsage(apiKey, selectedModel);
                setArabizedText(text);
                setViewMode('arabized');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
            setCurrentAction(null);
        }
    };

    const downloadText = (text: string, filename: string) => {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const getCurrentViewInfo = () => {
        if (isBatchMode) {
            const result = batchResults[activeBatchIndex];
            if (!result) return null;

            switch (viewMode) {
                case 'formatted':
                    return { text: result.formatted, label: 'Formatted', filename: `${result.fileName}_formatted.txt` };
                case 'expanded':
                    return { text: result.expanded, label: 'Expanded', filename: `${result.fileName}_expanded.txt` };
                case 'arabized':
                    return { text: result.arabized, label: 'Arabized', filename: `${result.fileName}_arabized.txt` };
                default: return null;
            }
        } else {
            switch (viewMode) {
                case 'formatted':
                    return { text: formattedText, label: 'Formatted', filename: 'quiz_formatted.txt' };
                case 'expanded':
                    return { text: expandedText, label: 'Expanded', filename: 'quiz_expanded.txt' };
                case 'arabized':
                    return { text: arabizedText, label: 'Arabized', filename: 'quiz_arabized.txt' };
                default:
                    return null;
            }
        }
    };

    const currentView = getCurrentViewInfo();

    return (
        <div className="flex flex-col h-[calc(100vh-100px)] lg:flex-row relative bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">

            {/* 1. Input Column */}
            <div className="w-full lg:w-1/4 min-w-[350px] flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">

                {/* Mode Selector (Generator vs Solver) */}
                <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950">
                    <button
                        onClick={() => setMode('generator')}
                        className={cn(
                            "flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-r border-slate-200 dark:border-slate-800",
                            mode === 'generator'
                                ? "bg-white dark:bg-slate-900 text-blue-600 border-b-2 border-b-blue-600"
                                : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        Generator Mode
                    </button>
                    <button
                        onClick={() => setMode('solver')}
                        className={cn(
                            "flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors",
                            mode === 'solver'
                                ? "bg-white dark:bg-slate-900 text-purple-600 border-b-2 border-b-purple-600"
                                : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        Solver Mode
                    </button>
                </div>

                {/* Content based on Mode */}
                {mode === 'generator' ? (
                    <>
                        <div className="flex border-b border-slate-200 dark:border-slate-800">
                            <button
                                onClick={() => setInputMode('text')}
                                className={cn(
                                    "flex-1 py-2 text-[10px] font-medium flex items-center justify-center gap-2 transition-colors",
                                    inputMode === 'text'
                                        ? "text-blue-600 bg-blue-50/50 dark:bg-slate-800"
                                        : "text-slate-500 hover:bg-slate-50"
                                )}
                            >
                                <FileText className="w-3 h-3" /> Raw Text
                            </button>
                            <button
                                onClick={() => setInputMode('file')}
                                className={cn(
                                    "flex-1 py-2 text-[10px] font-medium flex items-center justify-center gap-2 transition-colors",
                                    inputMode === 'file'
                                        ? "text-indigo-600 bg-indigo-50/50 dark:bg-slate-800"
                                        : "text-slate-500 hover:bg-slate-50"
                                )}
                            >
                                <UploadCloud className="w-3 h-3" /> Upload Files
                            </button>
                            <button
                                onClick={() => setInputMode('youtube')}
                                className={cn(
                                    "flex-1 py-2 text-[10px] font-medium flex items-center justify-center gap-2 transition-colors",
                                    inputMode === 'youtube'
                                        ? "text-red-600 bg-red-50/50 dark:bg-slate-800"
                                        : "text-slate-500 hover:bg-slate-50"
                                )}
                            >
                                <Youtube className="w-3 h-3" /> YouTube
                            </button>
                        </div>

                        <div className="flex-grow flex flex-col overflow-hidden">
                            {inputMode === 'text' ? (
                                <div className="flex flex-col h-full">
                                    <div className="p-2 flex justify-between items-center bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                                        <span className="text-[10px] text-slate-500 uppercase">Input Text</span>
                                        <button onClick={() => setRawText('')} className="text-slate-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                                    </div>
                                    <textarea
                                        className="flex-grow w-full p-4 resize-none text-sm leading-relaxed outline-none bg-transparent text-slate-800 dark:text-slate-100 placeholder-slate-400"
                                        placeholder="Paste content here..."
                                        value={rawText}
                                        onChange={(e) => setRawText(e.target.value)}
                                        dir="auto"
                                    />
                                </div>
                            ) : inputMode === 'file' ? (
                                <div className="h-full p-4 overflow-y-auto">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Source Files</h3>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] uppercase font-bold text-slate-500">Batch Mode</span>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={isBatchMode}
                                                    onChange={(e) => setIsBatchMode(e.target.checked)}
                                                />
                                                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                                            </label>
                                        </div>
                                    </div>
                                    <FileUploader
                                        files={selectedFiles}
                                        onFilesSelected={setSelectedFiles}
                                        maxFiles={20}
                                    />

                                    {/* Smart Compression Toggle */}
                                    <div className="flex items-center gap-2 p-2 mt-2 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-800">
                                        <input
                                            type="checkbox"
                                            id="autoCompress"
                                            checked={autoCompress}
                                            onChange={(e) => setAutoCompress(e.target.checked)}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                                        />
                                        <label htmlFor="autoCompress" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none flex items-center gap-2">
                                            <div className="p-1 bg-blue-100 dark:bg-blue-900 rounded-full">
                                                <Sparkles className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                            </div>
                                            Smart Compression (Files &gt; 12MB)
                                        </label>
                                    </div>

                                    <button
                                        onClick={() => setSplitterMode('primary')}
                                        className="mt-3 w-full py-2 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 rounded-lg flex items-center justify-center gap-2 text-xs font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
                                    >
                                        <Scissors className="w-4 h-4" /> Split PDF by Range / Topic
                                    </button>

                                    <p className="text-[10px] text-slate-400 mt-2">PDF, Images, MP3, MP4 supported.</p>



                                    {/* Info Box */}
                                    <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900/50">
                                        <h4 className="text-xs font-bold text-blue-700 dark:text-blue-300 mb-2 flex items-center gap-2">
                                            <Sparkles className="w-3 h-3" />
                                            Multimodal Capabilities
                                        </h4>
                                        <ul className="text-[10px] text-blue-600 dark:text-blue-400 space-y-1 list-disc list-inside">
                                            <li>Upload <b>Lecture Videos</b> to generate quizzes from audio.</li>
                                            <li>Upload <b>PDF Textbooks</b> or Notes.</li>
                                            <li>Upload <b>Audio Recordings</b> of meetings or classes.</li>
                                        </ul>
                                    </div>
                                </div>
                            ) : ( // inputMode === 'youtube'
                                <div className="h-full p-4 overflow-y-auto flex flex-col">
                                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">YouTube URL</h3>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="Paste YouTube Link here..."
                                            className="w-full p-2 border rounded text-xs border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 placeholder-slate-400"
                                            value={youtubeUrl}
                                            onChange={(e) => setYoutubeUrl(e.target.value)}
                                        />
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-2 mb-4">
                                        The AI will download the audio, listen to it, and generate questions.
                                        <br />Support for long lectures (~1-2 hours).
                                    </p>
                                    <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded border border-red-100 dark:border-red-900/50 flex items-center justify-center text-red-400">
                                        <Youtube className="w-12 h-12 opacity-50" />
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    // SOLVER MODE UI
                    <div className="flex-grow flex flex-col h-full overflow-y-auto bg-slate-50/50 dark:bg-slate-900/50">
                        <div className="flex-1 p-4 border-b border-slate-200 dark:border-slate-800">
                            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-2 flex items-center gap-2">
                                <span className="w-4 h-4 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-[10px]">1</span>
                                Questions Source
                            </h3>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] uppercase font-bold text-slate-500">Batch Mode</span>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={isBatchMode}
                                        onChange={(e) => setIsBatchMode(e.target.checked)}
                                    />
                                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
                                </label>
                            </div>
                            <FileUploader
                                files={solverQuestionsFiles}
                                onFilesSelected={setSolverQuestionsFiles}
                                maxFiles={20}
                                acceptedFileTypes={{
                                    'image/*': ['.png', '.jpg', '.webp'],
                                    'application/pdf': ['.pdf'],
                                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
                                    'application/msword': ['.doc']
                                }}
                            />

                            {/* Smart Compression Toggle (Solver) */}
                            <div className="flex items-center gap-2 p-1.5 mt-2 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-800">
                                <input
                                    type="checkbox"
                                    id="autoCompressSolver"
                                    checked={autoCompress}
                                    onChange={(e) => setAutoCompress(e.target.checked)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                                />
                                <label htmlFor="autoCompressSolver" className="text-xs font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none flex items-center gap-1.5">
                                    <Sparkles className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                    Smart Compress (&gt;12MB)
                                </label>
                            </div>
                            <button
                                onClick={() => setSplitterMode('primary')}
                                className="mt-2 w-full py-1.5 bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 rounded-lg flex items-center justify-center gap-2 text-[10px] font-medium hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                            >
                                <Scissors className="w-3 h-3" /> Split PDF
                            </button>
                            <p className="text-[10px] text-slate-400 mt-1">Upload screenshots or PDFs of the questions.</p>
                        </div>
                        <div className="flex-1 p-4">
                            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-2 flex items-center gap-2">
                                <span className="w-4 h-4 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-[10px]">2</span>
                                Reference Material
                            </h3>
                            <FileUploader
                                files={solverReferenceFiles}
                                onFilesSelected={setSolverReferenceFiles}
                                maxFiles={5}
                            />
                            <button
                                onClick={() => setSplitterMode('reference')}
                                className="mt-2 w-full py-1.5 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 rounded-lg flex items-center justify-center gap-2 text-[10px] font-medium hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                            >
                                <Scissors className="w-3 h-3" /> Split PDF
                            </button>
                            <p className="text-[10px] text-slate-400 mt-1">Upload the textbook, notes, or explanation source.</p>
                        </div>
                    </div>
                )}
            </div>

            {/* 2. Controls Column */}
            <div className="w-full lg:w-64 flex flex-col bg-slate-100 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 overflow-y-auto">
                <div className="p-3 border-b border-slate-200 dark:border-slate-800">
                    <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                        {mode === 'generator' ? 'Generator Tools' : 'Solver Tools'}
                    </h2>
                </div>

                <div className="p-4 flex flex-col gap-4">

                    {/* Action: Model Selector */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-slate-500">AI Model</label>
                        <select
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                            className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 outline-none focus:ring-1 focus:ring-blue-500"
                        >
                            <option value="gemini-3-flash-preview">Gemini 3 Flash Preview (Recommended)</option>
                            <option value="gemini-3-pro-preview">Gemini 3 Pro Preview (High Tier/Limited)</option>
                            <option value="gemini-exp-1206">Gemini Exp 1206</option>
                            <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash Exp</option>
                            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                            <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                        </select>
                    </div>

                    {/* Solver Specific Options */}
                    {mode === 'solver' && (
                        <div className="mt-4 p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <BrainCircuit className="w-5 h-5 text-purple-400" />
                                <h3 className="font-semibold text-purple-100">Solver Settings</h3>
                            </div>

                            <label className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-800/80 transition-colors border border-gray-700">
                                <input
                                    type="checkbox"
                                    checked={trustMarkedAnswers}
                                    onChange={(e) => setTrustMarkedAnswers(e.target.checked)}
                                    className="w-5 h-5 rounded border-gray-600 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900 bg-gray-700"
                                />
                                <div className="flex flex-col">
                                    <span className="text-gray-200 font-medium">Trust Marked Answers (Solved Sheet)</span>
                                    <span className="text-xs text-gray-400">
                                        Forces AI to respect the answer circled/marked in the file. Useful for pre-solved sheets.
                                    </span>
                                </div>
                            </label>

                            <label className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-800/80 transition-colors border border-gray-700">
                                <input
                                    type="checkbox"
                                    checked={negativeLogic}
                                    onChange={(e) => setNegativeLogic(e.target.checked)}
                                    className="w-5 h-5 rounded border-gray-600 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900 bg-gray-700"
                                />
                                <div className="flex flex-col">
                                    <span className="text-gray-200 font-medium">Global Negative Logic (Select Exception)</span>
                                    <span className="text-xs text-gray-400">
                                        Use if exam header says "All are true except one". Forces selection of the 'Exception' even if not stated in Q.
                                    </span>
                                </div>
                            </label>
                        </div>
                    )}

                    {/* Advanced Settings Layout */}
                    <div className="flex flex-col gap-4 mb-8">


                        {/* API Key Manager */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-slate-500">Gemini API Key</label>
                            <ApiKeyManager
                                currentKey={apiKey}
                                onKeySelect={setApiKey}
                                className="mb-2"
                            />
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                placeholder="Current API Key..."
                            />
                        </div>

                        {/* Settings: Question Counts (Generator Only) */}
                        {mode === 'generator' && (
                            <>
                                {/* Difficulty Slider (Generator) */}
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex justify-between">
                                        <label className="text-xs font-medium text-slate-500">Difficulty</label>
                                        <span className={cn(
                                            "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                            difficulty >= 9 ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" :
                                                difficulty >= 5 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" :
                                                    "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                                        )}>
                                            {difficulty}/10
                                        </span>
                                    </div>
                                    <input
                                        type="range" min="1" max="10" step="1"
                                        value={difficulty}
                                        onChange={(e) => setDifficulty(parseInt(e.target.value))}
                                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                    />
                                </div>

                                {/* MCQ Slider */}
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex justify-between">
                                        <label className="text-xs font-medium text-slate-500">MCQ Count</label>
                                        <span className="text-xs font-mono text-slate-700 dark:text-slate-300">{mcqCount}</span>
                                    </div>
                                    <input
                                        type="range" min="0" max="50" step="1"
                                        value={mcqCount}
                                        onChange={(e) => setMcqCount(parseInt(e.target.value))}
                                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                    />
                                </div>

                                {/* Written Slider */}
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex justify-between">
                                        <label className="text-xs font-medium text-slate-500">Written Questions</label>
                                        <span className="text-xs font-mono text-slate-700 dark:text-slate-300">{writtenQuestionCount}</span>
                                    </div>
                                    <input
                                        type="range" min="0" max="20" step="1"
                                        value={writtenQuestionCount}
                                        onChange={(e) => setWrittenQuestionCount(parseInt(e.target.value))}
                                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
                                    />
                                </div>

                                <p className="text-[10px] text-slate-400 text-center">
                                    Total: {mcqCount + writtenQuestionCount} Questions
                                </p>
                            </>
                        )}

                        {/* Settings: Written Question Count (Generator Only) */}


                        {/* Global: Subject Type Selector */}
                        <div className="flex flex-col gap-1.5 mt-2">
                            <label className="text-xs font-medium text-slate-500">Subject / Logic</label>
                            <div className="flex bg-slate-200 dark:bg-slate-800 p-0.5 rounded-md">
                                <button
                                    onClick={() => setSubjectType('standard')}
                                    className={cn(
                                        "flex-1 py-1.5 text-xs font-medium rounded transition-all",
                                        subjectType === 'standard'
                                            ? "bg-white dark:bg-slate-600 text-indigo-600 dark:text-indigo-300 shadow-sm"
                                            : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
                                    )}
                                >
                                    Standard (Medical)
                                </button>
                                <button
                                    onClick={() => setSubjectType('math')}
                                    className={cn(
                                        "flex-1 py-1.5 text-xs font-medium rounded transition-all",
                                        subjectType === 'math'
                                            ? "bg-white dark:bg-slate-600 text-indigo-600 dark:text-indigo-300 shadow-sm"
                                            : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
                                    )}
                                >
                                    Math / Physics
                                </button>
                            </div>
                        </div>

                        {/* Global: Explanation Mode Selector (NEW) */}
                        <div className="flex flex-col gap-1.5 mt-2">
                            <label className="text-xs font-medium text-slate-500">Explanation Depth</label>
                            <div className="flex bg-slate-200 dark:bg-slate-800 p-0.5 rounded-md">
                                <button
                                    onClick={() => setExplanationMode('standard')}
                                    className={cn(
                                        "flex-1 py-1.5 text-xs font-medium rounded transition-all",
                                        explanationMode === 'standard'
                                            ? "bg-white dark:bg-slate-600 text-teal-600 dark:text-teal-300 shadow-sm"
                                            : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
                                    )}
                                >
                                    Standard
                                </button>
                                <button
                                    onClick={() => setExplanationMode('detailed')}
                                    className={cn(
                                        "flex-1 py-1.5 text-xs font-medium rounded transition-all",
                                        explanationMode === 'detailed'
                                            ? "bg-white dark:bg-slate-600 text-teal-600 dark:text-teal-300 shadow-sm"
                                            : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
                                    )}
                                >
                                    Detailed (Study Mode)
                                </button>
                            </div>
                        </div>

                        <div className="h-px bg-slate-200 dark:bg-slate-800 my-3" />

                        {/* Primary Action Button */}
                        <div className="bg-white dark:bg-slate-900 p-3 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-2 mb-2 text-blue-600 dark:text-blue-400">
                                <Wand2 className="w-4 h-4" />
                                <span className="font-bold text-sm">
                                    {mode === 'generator' ? '1. Process / Generate' : '1. Solve Questions'}
                                </span>
                            </div>

                            {mode === 'generator' ? (
                                <>
                                    {inputMode === 'text' ? (
                                        <div className="flex flex-col gap-2">
                                            {rawText.length > 5 && (
                                                <button
                                                    onClick={handleArabizeDirectly}
                                                    disabled={isLoading}
                                                    className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-md flex items-center justify-center gap-2 text-xs font-bold transition-all shadow-sm disabled:opacity-50"
                                                >
                                                    {isLoading && currentAction === 'arabize' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe2 className="w-3 h-3" />}
                                                    Arabize Raw Text
                                                </button>
                                            )}
                                            <button
                                                onClick={handleFormatText}
                                                disabled={isLoading || !rawText}
                                                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                            >
                                                {currentAction === 'format' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Generate from Text'}
                                            </button>
                                        </div>
                                    ) : inputMode === 'file' ? (
                                        <button
                                            onClick={handleProcessFiles}
                                            disabled={isLoading || selectedFiles.length === 0}
                                            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {currentAction === 'process-files' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Generate from Files'}
                                        </button>
                                    ) : ( // inputMode === 'youtube'
                                        <button
                                            onClick={handleYoutubeProcess}
                                            disabled={isLoading || !youtubeUrl}
                                            className="w-full py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {currentAction === 'process-youtube' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Start YouTube Processing'}
                                        </button>
                                    )}
                                    {inputMode === 'file' && (
                                        <p className="text-[10px] text-slate-400 mt-2 text-center">
                                            Uploads to Gemini, analyzes context, and generates formatted questions.
                                        </p>
                                    )}
                                </>
                            ) : (
                                <button
                                    onClick={handleSolverMode}
                                    disabled={isLoading || solverQuestionsFiles.length === 0 || solverReferenceFiles.length === 0}
                                    className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {currentAction === 'solve' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Solve with AI'}
                                </button>
                            )}
                        </div>

                        {/* Action: 2. Smart Expand */}
                        <div className="bg-white dark:bg-slate-900 p-3 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-2 mb-2 text-purple-600 dark:text-purple-400">
                                <BrainCircuit className="w-4 h-4" />
                                <span className="font-bold text-sm">2. Smart Expand</span>
                            </div>
                            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                                <span>New Questions:</span>
                                <span className="font-mono">{expansionCount}</span>
                            </div>
                            <input
                                type="range" min="1" max="20"
                                value={expansionCount}
                                onChange={(e) => setExpansionCount(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600 mb-3"
                            />
                            <button
                                onClick={handleSmartExpansion}
                                disabled={isLoading || (!formattedText && (!isBatchMode || batchResults.length === 0))}
                                className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {currentAction === 'expand' ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                Generate
                            </button>
                        </div>

                        {/* Action: 3. Arabize */}
                        <div className="bg-white dark:bg-slate-900 p-3 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-2 mb-2 text-emerald-600 dark:text-emerald-400">
                                <Globe2 className="w-4 h-4" />
                                <span className="font-bold text-sm">3. Arabize</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mb-3 leading-tight">Translates explanations to Arabic while keeping medical terms in English.</p>
                            <button
                                onClick={handleArabization}
                                disabled={isLoading || (!formattedText && (!isBatchMode || batchResults.length === 0))}
                                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {currentAction === 'arabize' ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                Arabize
                            </button>
                        </div>

                        {error && (
                            <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs rounded border border-red-100 dark:border-red-900/50">
                                {error}
                            </div>
                        )}

                        {isLoading && loadingMessage && (
                            <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs rounded border border-blue-100 dark:border-blue-900/50 flex items-center gap-2 justify-center">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                {loadingMessage}
                            </div>
                        )}

                    </div>
                </div>
            </div>

            {/* 3. Preview Column */}
            <div className="flex-grow flex flex-col bg-white dark:bg-slate-900 min-h-0">
                <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white dark:bg-slate-900 z-10">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Live Preview</h2>

                        {/* Batch File Selector */}
                        {isBatchMode && batchResults.length > 0 && (
                            <div className="ml-4 flex gap-1 overflow-x-auto max-w-[300px] scrollbar-hide">
                                {batchResults.map((result, idx) => (
                                    <button
                                        key={result.id}
                                        onClick={() => setActiveBatchIndex(idx)}
                                        className={cn(
                                            "px-2 py-1 text-[10px] whitespace-nowrap rounded border transition-colors",
                                            activeBatchIndex === idx
                                                ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300"
                                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400"
                                        )}
                                        title={result.fileName}
                                    >
                                        {result.fileName.length > 15 ? result.fileName.substring(0, 12) + '...' : result.fileName}
                                        {result.status === 'processing' && <Loader2 className="inline w-2 h-2 ml-1 animate-spin" />}
                                        {result.status === 'completed' && <span className="text-green-500 ml-1">●</span>}
                                        {result.status === 'error' && <span className="text-red-500 ml-1">!</span>}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg ml-4">
                            {(['formatted', 'expanded', 'arabized'] as const).map((mode) => (
                                <button
                                    key={mode}
                                    onClick={() => setViewMode(mode)}
                                    disabled={
                                        (mode === 'formatted' && !formattedText && (!isBatchMode || batchResults.length === 0)) ||
                                        (mode === 'expanded' && !expandedText && (!isBatchMode || batchResults.length === 0)) ||
                                        (mode === 'arabized' && !arabizedText && (!isBatchMode || batchResults.length === 0))
                                    }
                                    className={cn(
                                        "px-3 py-1 text-xs rounded-md font-medium transition-all",
                                        viewMode === mode
                                            ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-sm"
                                            : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200",
                                        {
                                            "opacity-50 cursor-not-allowed":
                                                (mode === 'formatted' && !formattedText && (!isBatchMode || batchResults.length === 0)) ||
                                                (mode === 'expanded' && !expandedText && (!isBatchMode || batchResults.length === 0)) ||
                                                (mode === 'arabized' && !arabizedText && (!isBatchMode || batchResults.length === 0))
                                        }
                                    )}
                                >
                                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                                </button>
                            ))}
                        </div>

                        {/* Save Job Input - Only show if there is content */}
                        {(formattedText || expandedText || arabizedText || (isBatchMode && batchResults.length > 0)) && (
                            <div className="hidden md:flex ml-2 items-center gap-2 flex-grow max-w-xs">
                                <input
                                    type="text"
                                    value={jobName}
                                    onChange={(e) => setJobName(e.target.value)}
                                    placeholder="Enter Job Name..."
                                    className="w-full px-2 py-1 text-xs border rounded bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-gray-100"
                                />
                                <button
                                    onClick={handleSaveJob}
                                    disabled={isLoading}
                                    className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded flex items-center gap-1 min-w-fit"
                                >
                                    <Save className="w-3 h-3" />
                                    Save
                                </button>
                            </div>
                        )}
                    </div>

                    {currentView && currentView.text && (
                        <div className="flex gap-2">
                            {/* Mobile Save Button (Icon only) */}
                            <button
                                onClick={handleSaveJob}
                                className="md:hidden p-1.5 bg-green-600 text-white rounded hover:bg-green-700"
                                title="Save Job"
                            >
                                <Save className="w-3.5 h-3.5" />
                            </button>

                            <button
                                onClick={() => downloadText(currentView.text, currentView.filename)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 dark:bg-slate-700 text-white text-xs font-medium rounded hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
                            >
                                <Download className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Download .txt</span>
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex-grow overflow-auto p-6 bg-slate-50 dark:bg-black/20">
                    {currentView && currentView.text ? (
                        <div
                            className={cn(
                                "font-mono text-sm leading-relaxed whitespace-pre-wrap text-slate-800 dark:text-slate-300 max-w-4xl mx-auto",
                                // RTL Logic if Arabized
                                currentView.label === 'Arabized' ? "text-right" : "text-left"
                            )}
                            dir={currentView.label === 'Arabized' ? "rtl" : "ltr"}
                        >
                            {currentView.text}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-600 select-none">
                            <Sparkles className="w-12 h-12 mb-4 opacity-20" />
                            <p>Start by pasting text or uploading a file</p>
                        </div>
                    )}
                </div>
            </div>

            {splitterMode !== 'none' && (
                <PdfSplitterDialog
                    onClose={() => setSplitterMode('none')}
                    onSplitComplete={handleSplitComplete}
                />
            )}
        </div>
    );
}
