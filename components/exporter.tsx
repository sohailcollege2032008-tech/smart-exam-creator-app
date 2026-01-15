'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Upload,
    Image as ImageIcon,
    FileText,
    Layers,
    Globe,
    MonitorPlay,
    FileBadge,
    CheckCircle2,
    AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseQuizText, QuizQuestion } from '@/lib/quiz-parser';
import { generateInteractiveHTML } from '@/lib/interactive-quiz-generator';
import {
    generateStudySheetHTML,
    generateQuestionSheetHTML,
    generateTeacherSheetHTML,
    generateAnswerKeyHTML,
    SheetStyle,
    SheetLanguage
} from '@/lib/sheet-generators';
import { generateAnkiDeck } from '@/lib/anki-generator';

interface ExporterProps {
    initialText: string;
    defaultTitle?: string;
}

export function Exporter({ initialText, defaultTitle }: ExporterProps) {
    // --- State ---
    const [text, setText] = useState(initialText);
    const [parsedQuestions, setParsedQuestions] = useState<QuizQuestion[]>([]);

    // Configuration
    const [quizTitle, setQuizTitle] = useState('New Quiz');
    const [logo1, setLogo1] = useState<string>('');
    const [logo2, setLogo2] = useState<string>('');
    const [styleName, setStyleName] = useState<SheetStyle>('classic');
    const [language, setLanguage] = useState<SheetLanguage>('en');
    const [isRandomized, setIsRandomized] = useState(false);
    const [isGeneratingAnki, setIsGeneratingAnki] = useState(false);

    // --- Effects ---
    useEffect(() => {
        if (initialText) {
            setText(initialText);
        }
        if (defaultTitle) {
            setQuizTitle(defaultTitle);
        }
    }, [initialText, defaultTitle]);

    useEffect(() => {
        const questions = parseQuizText(text);
        setParsedQuestions(questions);

        // Auto-detect title if possible (e.g. first line?) - keeping simple default for now
    }, [text]);

    // --- Derived State (Randomization & Re-numbering) ---
    const finalQuestions = React.useMemo(() => {
        let qs = [...parsedQuestions];

        if (isRandomized) {
            // Fisher-Yates Shuffle
            for (let i = qs.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [qs[i], qs[j]] = [qs[j], qs[i]];
            }
        }

        // Always re-number sequentially 1, 2, 3... based on current order
        // This ensures that "Question 1" in the output is truly the first question shown, even if it was originally "Question 50"
        return qs.map((q, index) => ({
            ...q,
            number: (index + 1).toString()
        }));
    }, [parsedQuestions, isRandomized]);

    // --- Handlers ---

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            if (content) setText(content);
        };
        reader.readAsText(file);
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, setLogo: (s: string) => void) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const result = event.target?.result as string;
            if (result) setLogo(result);
        };
        reader.readAsDataURL(file);
    };

    const downloadFile = (content: string, filename: string, type: 'html' | 'txt' | 'json' = 'html') => {
        const mime = type === 'html' ? 'text/html' : type === 'json' ? 'application/json' : 'text/plain';
        const blob = new Blob([content], { type: `${mime};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // GEN HANDLERS
    const handleExportInteractive = () => {
        const html = generateInteractiveHTML(finalQuestions, quizTitle, logo1, logo2, language);
        downloadFile(html, `${quizTitle.replace(/\s+/g, '_')}_Interactive.html`);
    };

    const handleExportStudySheet = () => {
        const html = generateStudySheetHTML(finalQuestions, quizTitle, logo1, logo2, styleName, language);
        downloadFile(html, `${quizTitle.replace(/\s+/g, '_')}_StudySheet.html`);
    };

    const handleExportQuestionSheet = () => {
        const html = generateQuestionSheetHTML(finalQuestions, quizTitle, logo1, logo2, styleName, language);
        downloadFile(html, `${quizTitle.replace(/\s+/g, '_')}_Questions.html`);
    };

    const handleExportTeacherSheet = () => {
        const html = generateTeacherSheetHTML(finalQuestions, quizTitle, logo1, logo2, styleName, language);
        downloadFile(html, `${quizTitle.replace(/\s+/g, '_')}_Teacher_Answered.html`);
    };

    const handleExportAnswerKey = () => {
        const html = generateAnswerKeyHTML(finalQuestions, quizTitle, logo1, logo2, styleName, language);
        downloadFile(html, `${quizTitle.replace(/\s+/g, '_')}_Answers.html`);
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-slate-900 p-6 md:p-8">

            <div className="max-w-6xl mx-auto w-full space-y-8">

                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Renderer & Exporter</h1>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">Configure your quiz output and generate offline files.</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition">
                            <Upload className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Upload Data File</span>
                            <input type="file" className="hidden" accept=".txt" onChange={handleFileUpload} />
                        </label>
                    </div>
                </div>

                {/* Configuration Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Left: Settings */}
                    <div className="lg:col-span-1 space-y-6">

                        {/* Box 1: General Info */}
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                            <h3 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-blue-500" /> Quiz Details
                            </h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs font-medium text-slate-500 mb-1 block">Quiz Title</label>
                                    <input
                                        type="text"
                                        value={quizTitle}
                                        onChange={(e) => setQuizTitle(e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Box 2: Branding */}
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                            <h3 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                                <ImageIcon className="w-4 h-4 text-purple-500" /> Branding
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-medium text-slate-500 mb-1 block">Left Logo</label>
                                    <label className="block w-full h-20 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg flex items-center justify-center cursor-pointer hover:border-blue-500 transition relative overflow-hidden bg-slate-50 dark:bg-slate-900">
                                        {logo1 ? (
                                            <img src={logo1} className="h-full object-contain" alt="Logo 1" />
                                        ) : (
                                            <span className="text-[10px] text-slate-400">Upload</span>
                                        )}
                                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleLogoUpload(e, setLogo1)} />
                                    </label>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-slate-500 mb-1 block">Right Logo</label>
                                    <label className="block w-full h-20 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg flex items-center justify-center cursor-pointer hover:border-blue-500 transition relative overflow-hidden bg-slate-50 dark:bg-slate-900">
                                        {logo2 ? (
                                            <img src={logo2} className="h-full object-contain" alt="Logo 2" />
                                        ) : (
                                            <span className="text-[10px] text-slate-400">Upload</span>
                                        )}
                                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleLogoUpload(e, setLogo2)} />
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* Box 3: Style & Lang */}
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                            <h3 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                                <Layers className="w-4 h-4 text-emerald-500" /> Appearance
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-medium text-slate-500 mb-2 block">Theme Style</label>
                                    <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
                                        {(['classic', 'modern', 'warm'] as SheetStyle[]).map(s => (
                                            <button
                                                key={s}
                                                onClick={() => setStyleName(s)}
                                                className={cn(
                                                    "flex-1 py-1.5 text-xs font-medium rounded-md capitalize transition-all",
                                                    styleName === s
                                                        ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                                                        : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                                                )}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                                    <div className="flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-medium text-slate-700 dark:text-slate-200">Randomize Order</span>
                                            <span className="text-[10px] text-slate-500">Shuffle questions & re-number</span>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={isRandomized}
                                                onChange={(e) => setIsRandomized(e.target.checked)}
                                            />
                                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-2 block">Language</label>
                            <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
                                {(['en', 'ar'] as SheetLanguage[]).map(l => (
                                    <button
                                        key={l}
                                        onClick={() => setLanguage(l)}
                                        className={cn(
                                            "flex-1 py-1.5 text-xs font-medium rounded-md capitalize transition-all",
                                            language === l
                                                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                                                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                                        )}
                                    >
                                        {l === 'en' ? 'English' : 'Arabic (RTL)'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>


                    {/* Right: Preview Stats & Actions */}
                    <div className="lg:col-span-2 space-y-6">

                        {/* Stats Card */}
                        <div className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900 p-6 rounded-xl flex items-center justify-between">
                            <div>
                                <h4 className="text-indigo-900 dark:text-indigo-200 font-bold text-lg mb-1">Parsed Questions</h4>
                                <p className="text-indigo-600 dark:text-indigo-400 text-sm">Review your data before exporting.</p>
                            </div>
                            <div className="text-4xl font-black text-indigo-500 dark:text-indigo-400">
                                {parsedQuestions.length}
                            </div>
                        </div>

                        {parsedQuestions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-400">
                                <AlertCircle className="w-12 h-12 mb-3 opacity-20" />
                                <p>No valid questions found in data.</p>
                                <p className="text-xs mt-2 text-slate-500">Ensure text format is correct or upload a file.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Interactive Quiz */}
                                <button
                                    onClick={handleExportInteractive}
                                    className="group relative p-6 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] text-left overflow-hidden col-span-1 sm:col-span-2"
                                >
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
                                    <div className="relative z-10 flex items-center justify-between">
                                        <div>
                                            <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                                                <MonitorPlay className="w-6 h-6" /> Interactive Quiz HTML
                                            </h3>
                                            <p className="text-indigo-100 text-sm">Standalone file. Stats, Timer, Anki Mode & more.</p>
                                        </div>
                                        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Upload className="w-5 h-5 text-white transform rotate-180" />
                                        </div>
                                    </div>
                                </button>

                                {/* Study Sheet */}
                                <button
                                    onClick={handleExportStudySheet}
                                    className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between group"
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
                                            <FileBadge className="w-6 h-6" />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">Study Sheets</h3>
                                        <p className="text-xs text-slate-500 mt-1">Full questions with explanations, nice layout.</p>
                                    </div>
                                </button>

                                {/* Question Sheet */}
                                <button
                                    onClick={handleExportQuestionSheet}
                                    className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between group"
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                                            <FileText className="w-6 h-6" />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Question Paper</h3>
                                        <p className="text-xs text-slate-500 mt-1">Clean questions for printing. Key at the end.</p>
                                    </div>
                                </button>

                                {/* Teacher Version (New) */}
                                <button
                                    onClick={handleExportTeacherSheet}
                                    className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-red-500 dark:hover:border-red-500 rounded-xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between group"
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="p-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg">
                                            <FileBadge className="w-6 h-6" />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 dark:text-white group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">Teacher Version</h3>
                                        <p className="text-xs text-slate-500 mt-1">Full paper with embedded red answers.</p>
                                    </div>
                                </button>

                                {/* Answer Key */}
                                <button
                                    onClick={handleExportAnswerKey}
                                    className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-orange-500 dark:hover:border-orange-500 rounded-xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between group col-span-1 sm:col-span-2 lg:col-span-1"
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="p-2 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-lg">
                                            <CheckCircle2 className="w-6 h-6" />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">Answer Key</h3>
                                        <p className="text-xs text-slate-500 mt-1">Grid view of correct answers only.</p>
                                    </div>
                                </button>

                                {/* Anki Export */}
                                <button
                                    disabled={isGeneratingAnki}
                                    onClick={async () => {
                                        setIsGeneratingAnki(true);
                                        try {
                                            await generateAnkiDeck(finalQuestions, quizTitle, language);
                                        } finally {
                                            setIsGeneratingAnki(false);
                                        }
                                    }}
                                    className={cn(
                                        "p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-pink-500 dark:hover:border-pink-500 rounded-xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between group",
                                        isGeneratingAnki && "opacity-70 cursor-wait"
                                    )}
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="p-2 bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 rounded-lg">
                                            <Layers className="w-6 h-6" />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 dark:text-white group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors">
                                            {isGeneratingAnki ? "Generating..." : "Export to Anki"}
                                        </h3>
                                        <p className="text-xs text-slate-500 mt-1">Interactive Flashcards (.apkg)</p>
                                    </div>
                                </button>
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}
