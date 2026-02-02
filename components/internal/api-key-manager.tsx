'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Key, BarChart3, RotateCcw, Check, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ApiKeyData {
    id: string;
    name: string;
    key: string;
    usage: Record<string, number>; // model -> count
}

interface ApiKeyManagerProps {
    currentKey: string;
    onKeySelect: (key: string) => void;
    className?: string;
}

export function ApiKeyManager({ currentKey, onKeySelect, className }: ApiKeyManagerProps) {
    const [keys, setKeys] = useState<ApiKeyData[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [newKeyValue, setNewKeyValue] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);

    // Model Checking State
    const [availableModels, setAvailableModels] = useState<string[] | null>(null);
    const [checkingModels, setCheckingModels] = useState(false);
    const [modelCheckError, setModelCheckError] = useState<string | null>(null);

    // Load keys from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('gemini_api_keys_v2');
        if (saved) {
            try {
                setKeys(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to parse keys", e);
            }
        }
    }, []);

    // Listen for storage events
    useEffect(() => {
        const handleStorageChange = () => {
            const saved = localStorage.getItem('gemini_api_keys_v2');
            if (saved) setKeys(JSON.parse(saved));
        };
        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('api_usage_updated', handleStorageChange);
        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('api_usage_updated', handleStorageChange);
        };
    }, []);

    const saveKeys = (newKeys: ApiKeyData[]) => {
        setKeys(newKeys);
        localStorage.setItem('gemini_api_keys_v2', JSON.stringify(newKeys));
    };

    const handleAddKey = () => {
        if (!newKeyName.trim() || !newKeyValue.trim()) return;
        const newKey: ApiKeyData = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: newKeyName.trim(),
            key: newKeyValue.trim(),
            usage: {}
        };
        saveKeys([...keys, newKey]);
        setNewKeyName('');
        setNewKeyValue('');
        setShowAddForm(false);
    };

    const handleDeleteKey = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Delete this API Key?')) return;
        saveKeys(keys.filter(k => k.id !== id));
    };

    const resetUsage = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Reset usage stats for this key?')) return;
        const newKeys = keys.map(k => k.id === id ? { ...k, usage: {} } : k);
        saveKeys(newKeys);
    };

    const incrementUsageManual = (id: string, model: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newKeys = keys.map(k => {
            if (k.id === id) {
                const current = k.usage[model] || 0;
                return { ...k, usage: { ...k.usage, [model]: current + 1 } };
            }
            return k;
        });
        saveKeys(newKeys);
    }

    const checkModels = async () => {
        if (!currentKey) return;
        setCheckingModels(true);
        setModelCheckError(null);
        setAvailableModels(null);
        try {
            // Fetch directly from API to see what's truly allowed for this key
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${currentKey}`);
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error?.message || 'Failed to fetch models');
            }
            const data = await res.json();
            // Filter for 'generateContent' supported models and just get names
            const names = data.models
                ?.filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
                .map((m: any) => m.name.replace('models/', '')) // Remove prefix for cleaner view
                .sort() || [];

            setAvailableModels(names);
        } catch (e: any) {
            setModelCheckError(e.message);
        } finally {
            setCheckingModels(false);
        }
    };

    const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);

    // Sync internal selection with external currentKey
    useEffect(() => {
        if (currentKey) {
            // 1. If we already have a selected ID and it matches the current key, keep it (stabilizes selection)
            const currentMatch = keys.find(k => k.id === internalSelectedId);
            if (currentMatch && currentMatch.key === currentKey) return;

            // 2. Otherwise find the first match
            const match = keys.find(k => k.key === currentKey);
            if (match) setInternalSelectedId(match.id);
        } else {
            setInternalSelectedId(null);
        }
    }, [currentKey, keys, internalSelectedId]);

    return (
        <div className={cn("border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden", className)}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            >
                <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                    <Key className="w-4 h-4 text-indigo-500" />
                    <span>API Key Manager</span>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {isOpen && (
                <div className="p-3 bg-white dark:bg-slate-950">
                    {/* Add New Key Form */}
                    {showAddForm ? (
                        <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800">
                            <h4 className="text-xs font-bold mb-2 uppercase text-slate-500">Add New Key</h4>
                            <div className="space-y-2">
                                <input
                                    placeholder="Name (e.g. Personal Key)"
                                    className="w-full p-2 text-xs border rounded dark:bg-slate-950 dark:border-slate-700"
                                    value={newKeyName}
                                    onChange={e => setNewKeyName(e.target.value)}
                                />
                                <input
                                    type="password"
                                    placeholder="sk-..."
                                    className="w-full p-2 text-xs border rounded dark:bg-slate-950 dark:border-slate-700"
                                    value={newKeyValue}
                                    onChange={e => setNewKeyValue(e.target.value)}
                                />
                                <div className="flex gap-2 justify-end">
                                    <button
                                        onClick={() => setShowAddForm(false)}
                                        className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleAddKey}
                                        disabled={!newKeyName || !newKeyValue}
                                        className="text-xs bg-indigo-600 text-white px-3 py-1 rounded disabled:opacity-50"
                                    >
                                        Save
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2 mb-3">
                            <button
                                onClick={() => setShowAddForm(true)}
                                className="w-full py-2 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded flex items-center justify-center gap-2 text-xs font-bold text-slate-500 hover:border-indigo-400 hover:text-indigo-500 transition-all"
                            >
                                <Plus className="w-3 h-3" /> Add Saved Key
                            </button>

                            {/* Check Availability Button */}
                            <button
                                onClick={checkModels}
                                disabled={!currentKey || checkingModels}
                                className="w-full py-1.5 bg-slate-100 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800 flex items-center justify-center gap-2 text-[10px] font-bold text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all"
                            >
                                {checkingModels ? <span className="animate-spin">⌛</span> : <RefreshCw className="w-3 h-3" />}
                                Check Available Models (Debug)
                            </button>

                            {/* Available Models List */}
                            {modelCheckError && (
                                <div className="p-2 bg-red-50 text-red-600 text-[10px] rounded border border-red-100">
                                    Error: {modelCheckError}
                                </div>
                            )}
                            {availableModels && (
                                <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-100 dark:border-green-900/30">
                                    <h5 className="text-[10px] font-bold text-green-700 dark:text-green-400 mb-1">Authenticated Models:</h5>
                                    <div className="flex flex-wrap gap-1">
                                        {availableModels.map(m => (
                                            <span key={m} className={`px-1.5 py-0.5 rounded text-[9px] font-mono border ${m.includes('gemini-3') || m.includes('exp') ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-white dark:bg-black/20 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800/50'}`}>
                                                {m}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Keys List */}
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {keys.map(keyData => {
                            const isSelected = keyData.id === internalSelectedId;
                            const totalUsage = Object.values(keyData.usage).reduce((a, b) => a + b, 0);

                            return (
                                <div
                                    key={keyData.id}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        console.log("Selecting Key:", keyData.name);
                                        setInternalSelectedId(keyData.id); // Force visual update immediately
                                        onKeySelect(keyData.key);
                                    }}
                                    className={cn(
                                        "p-3 rounded border transition-all cursor-pointer relative group",
                                        isSelected
                                            ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500 dark:border-indigo-500"
                                            : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-300"
                                    )}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">{keyData.name}</h4>
                                                {isSelected && <Check className="w-3 h-3 text-indigo-600 font-bold" />}
                                            </div>
                                            <p className="text-[10px] text-slate-400 font-mono">
                                                {keyData.key.substring(0, 8)}...
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={(e) => resetUsage(keyData.id, e)}
                                                className="p-1.5 hover:bg-orange-100 text-slate-400 hover:text-orange-600 rounded"
                                                title="Reset Usage Stats"
                                            >
                                                <RotateCcw className="w-3 h-3" />
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteKey(keyData.id, e)}
                                                className="p-1.5 hover:bg-red-100 text-slate-400 hover:text-red-600 rounded"
                                                title="Delete Key"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Usage Stats */}
                                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800/50 mt-2">
                                        <div className="flex items-center gap-1 mb-1">
                                            <BarChart3 className="w-3 h-3 text-slate-400" />
                                            <span className="text-[10px] font-bold text-slate-500 uppercase">Usage Stats</span>
                                        </div>
                                        <div className="space-y-1">
                                            {Object.entries(keyData.usage).map(([model, count]) => (
                                                <div key={model} className="flex justify-between items-center text-[10px] text-slate-600 dark:text-slate-400">
                                                    <span>{model}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono bg-slate-200 dark:bg-slate-800 px-1 rounded">{count}</span>
                                                        <button
                                                            onClick={(e) => incrementUsageManual(keyData.id, model, e)}
                                                            className="text-indigo-500 hover:text-indigo-700 px-1 font-bold"
                                                            title="+1 Manual Usage"
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            {totalUsage === 0 && <span className="text-[10px] text-slate-400 italic">No usage recorded</span>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

// Helper to increment usage from anywhere (e.g. Processor)
export function incrementKeyUsage(keyString: string, model: string) {
    if (!keyString) return;
    try {
        const saved = localStorage.getItem('gemini_api_keys_v2');
        if (saved) {
            const keys: ApiKeyData[] = JSON.parse(saved);
            const targetIndex = keys.findIndex(k => k.key === keyString);

            if (targetIndex !== -1) {
                const target = keys[targetIndex];
                const currentCount = target.usage[model] || 0;

                keys[targetIndex] = {
                    ...target,
                    usage: {
                        ...target.usage,
                        [model]: currentCount + 1
                    }
                };

                localStorage.setItem('gemini_api_keys_v2', JSON.stringify(keys));
                // Dispatch event so UI updates
                window.dispatchEvent(new Event('api_usage_updated'));
            }
        }
    } catch (e) {
        console.error("Failed to update key usage", e);
    }
}
