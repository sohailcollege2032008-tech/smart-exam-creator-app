'use client';

import React, { useState, useEffect } from 'react';
import { Processor } from '@/components/processor';
import { Exporter } from '@/components/exporter';
import { SavedJobs } from '@/components/saved-jobs';
import { UserAuthButton } from '@/components/user-auth-button';
import { LayoutDashboard, FileOutput, Moon, Sun, Laptop, FolderCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'processor' | 'exporter' | 'saved-jobs'>('processor');
  const [apiKey, setApiKey] = useState('');
  const [currentOutput, setCurrentOutput] = useState('');
  const [currentJobName, setCurrentJobName] = useState('New Quiz');

  // Theme State
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    // Load persisted state from LocalStorage AND Supabase
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) setApiKey(savedKey);

    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    }

    // Sync with Server (Supabase)
    import('@/app/actions/user-settings').then(({ getUserSettings }) => {
      getUserSettings().then(res => {
        if (res.success && res.settings) {
          if (res.settings.gemini_api_key) {
            setApiKey(res.settings.gemini_api_key);
            localStorage.setItem('gemini_api_key', res.settings.gemini_api_key);
          }
          if (res.settings.theme) {
            setTheme(res.settings.theme);
            localStorage.setItem('theme', res.settings.theme);
            document.documentElement.classList.toggle('dark', res.settings.theme === 'dark');
          }
        }
      });
    });
  }, []);

  const handleSetApiKey = async (key: string) => {
    setApiKey(key);
    localStorage.setItem('gemini_api_key', key);
    // Sync to Server
    const { updateUserSettings } = await import('@/app/actions/user-settings');
    await updateUserSettings({ gemini_api_key: key });
  };

  const toggleTheme = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');

    // Sync to Server
    const { updateUserSettings } = await import('@/app/actions/user-settings');
    await updateUserSettings({ theme: newTheme });
  };

  const handleLoadJobForExporter = (text: string, title?: string) => {
    setCurrentOutput(text);
    if (title) setCurrentJobName(title);
    setActiveTab('exporter');
  };

  return (
    <main className="flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300">

      {/* Top Navigation Bar */}
      <header className="flex-shrink-0 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 z-20 shadow-sm relative">

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center transform rotate-3 shadow-lg shadow-indigo-500/30">
            <Laptop className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400">
            Quiz Or Sheet <span className="text-xs font-mono text-slate-400 font-normal ml-1">v4.1</span>
          </h1>
        </div>

        {/* Tab Switcher */}
        <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          <button
            onClick={() => setActiveTab('processor')}
            className={cn(
              "flex items-center gap-2 px-4 md:px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-200",
              activeTab === 'processor'
                ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
            )}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="hidden md:inline">Processor</span>
          </button>
          <button
            onClick={() => setActiveTab('saved-jobs')}
            className={cn(
              "flex items-center gap-2 px-4 md:px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-200",
              activeTab === 'saved-jobs'
                ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
            )}
          >
            <FolderCheck className="w-4 h-4" />
            <span className="hidden md:inline">Saved Jobs</span>
          </button>
          <button
            onClick={() => setActiveTab('exporter')}
            className={cn(
              "flex items-center gap-2 px-4 md:px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-200",
              activeTab === 'exporter'
                ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
            )}
          >
            <FileOutput className="w-4 h-4" />
            <span className="hidden md:inline">Exporter</span>
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-4">
          <UserAuthButton />

          {/* API Key Status Indicator */}
          <div className={cn(
            "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border",
            apiKey ? "bg-green-50 text-green-600 border-green-200 dark:bg-green-900/20 dark:border-green-800" : "bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:border-red-800"
          )}>
            {apiKey ? "API Connected" : "No Key"}
          </div>

          <button
            onClick={toggleTheme}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-400"
          >
            {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-grow overflow-hidden relative">
        <div className={cn("absolute inset-0 w-full h-full transition-opacity duration-300 bg-white dark:bg-slate-900", activeTab === 'processor' ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none")}>
          <Processor
            apiKey={apiKey}
            setApiKey={handleSetApiKey}
            onOutputChange={setCurrentOutput}
            onJobNameChange={setCurrentJobName}
          />
        </div>
        <div className={cn("absolute inset-0 w-full h-full transition-opacity duration-300 bg-white dark:bg-slate-900", activeTab === 'saved-jobs' ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none")}>
          {activeTab === 'saved-jobs' && <SavedJobs onLoadToExporter={handleLoadJobForExporter} />}
        </div>
        <div className={cn("absolute inset-0 w-full h-full transition-opacity duration-300 bg-white dark:bg-slate-900", activeTab === 'exporter' ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none")}>
          <Exporter initialText={currentOutput} defaultTitle={currentJobName} />
        </div>
      </div>

    </main>
  );
}
