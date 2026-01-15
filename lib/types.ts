
export interface BatchItem {
    id: string;
    fileName: string;
    topic?: string;
    data: {
        formattedText?: string;
        expandedText?: string;
        arabizedText?: string;
    };
    status?: 'idle' | 'processing' | 'completed' | 'error';
    error?: string;
}

// Working state interface (flat structure for easier binding in Processor)
export interface BatchResult {
    id: string;
    fileName: string;
    topic?: string;
    formatted: string;
    expanded: string;
    arabized: string;
    status: 'idle' | 'processing' | 'completed' | 'error';
    error?: string;
}

export interface Job {
    id: string;
    name: string;
    createdAt: string; // ISO string
    type: 'generator' | 'solver';
    isBatch?: boolean;
    batchItems?: BatchItem[];
    data: {
        formattedText?: string;
        expandedText?: string;
        arabizedText?: string;
    };
    metadata: {
        model?: string;
        difficulty?: number; // Added
        questionCount?: number; // Kept for backward compatibility
        mcqCount?: number;
        writtenCount?: number;
        subjectType?: 'standard' | 'math';
        explanationMode?: 'standard' | 'detailed'; // NEW
    };
}
