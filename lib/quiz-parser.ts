export interface QuizQuestion {
    number: string;
    type: string; // 'MCQ' | 'Written' or empty
    question: string;
    subQuestions?: { question: string; answer: string }[];
    options: string[];
    correctAnswer: string;
    answer: string;
    topicSummary: string;
    lesson: string;
    explanations: Record<string, string>;
    matches?: { left: string; right: string; explanation?: string }[];
}

// Helper to strip markdown symbols (*, #) from start/end of string
const cleanHeader = (s: string) => s.replace(/^[\*\#\-\s]+|[\*\#\-\s]+$/g, '').trim();

export const parseQuizText = (text: string): QuizQuestion[] => {
    if (!text) return [];

    // Strip <thinking>...</thinking> blocks to prevent token waste artifacts from breaking the parser
    // Check for both standard and potential variations
    text = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();

    const questions: QuizQuestion[] = [];
    const questionBlocks = text.split(/\n\s*---\s*\n/).map((b) => b.trim()).filter(Boolean);

    for (const block of questionBlocks) {
        const lines = block.split('\n').map((l) => l.trim());
        if (lines.length === 0) continue;

        const questionObj: QuizQuestion = {
            number: '',
            type: '',
            question: '',
            subQuestions: [],
            options: [],
            correctAnswer: '',
            answer: '',
            topicSummary: '',
            lesson: '',
            explanations: {},
            matches: [],
        };

        let currentSection = '';
        let i = 0;

        // Regex Matchers for Headers
        // Regex Matchers for Headers - RELAXED to allow ###, ##, **, etc.
        const headerPatterns = {
            questionNum: /^(?:[\*\#]+)?\s*Question\s+(\d+)/i,
            type: /^(?:[\*\#]+)?\s*Type:\s*(.+)/i,
            questionBody: /^(?:[\*\#]+)?\s*Question$/i,
            options: /^(?:[\*\#]+)?\s*Options$/i,
            correctAnswer: /^(?:[\*\#]+)?\s*Correct Answer(?::\s*(.*))?$/i,
            explanation: /^(?:[\*\#]+)?\s*Explanation(?:-([^:]+))?(?::\s*(.*))?$/i,
            topicSummary: /^(?:[\*\#]+)?\s*Topic Summary(?::\s*(.*))?$/i,
            lesson: /^(?:[\*\#]+)?\s*Lesson(?::)?\s*(.*)$/i,
            answer: /^(?:[\*\#]+)?\s*Answer$/i,
            // New patterns for branching - HIGHLY PERMISSIVE
            subQuestion: /^\s*(?:[\*\-]\s*)?(?:[\*\#]+)?\s*SubQuestion(?::)?\s*([\d\w\.]+)(?::)?\s*(.*)$/i,
            subAnswer: /^\s*(?:[\*\-]\s*)?(?:[\*\#]+)?\s*Answer(?::)?\s*([\d\w\.]+)(?::)?\s*(.*)$/i,
            // Matching
            pairs: /^(?:[\*\#]+)?\s*Pairs$/i,
        };

        while (i < lines.length) {
            const line = lines[i];

            // Check for Section Headers
            let match;

            if ((match = line.match(headerPatterns.questionNum))) {
                questionObj.number = match[1];
                currentSection = '';
            }
            else if ((match = line.match(headerPatterns.type))) {
                let t = cleanHeader(match[1]);
                // Map 'Complete' to 'Written' for internal logic if we want them to behave similarly, 
                // BUT for Anki we might want to distinguish. Let's keep it as 'Complete' or 'Written'.
                // Ideally, 'Complete' acts like a Written question but with a short specific answer.
                if (t.toLowerCase().includes('complete') || t.toLowerCase().includes('fill')) {
                    t = 'Complete';
                }
                questionObj.type = t;
                currentSection = '';
            }
            else if (headerPatterns.questionBody.test(line)) {
                currentSection = 'question';
            }
            else if (headerPatterns.options.test(line)) {
                currentSection = 'options';
            }
            else if ((match = line.match(headerPatterns.correctAnswer))) {
                currentSection = 'correctAnswer';
                if (match[1] && match[1].trim()) {
                    questionObj.correctAnswer = match[1].trim().replace(/[\.\*]/g, '');
                }
            }
            else if ((match = line.match(headerPatterns.explanation))) {
                const suffix = match[1] ? match[1].trim() : 'General';
                const content = match[2] ? match[2].trim() : '';
                currentSection = `Explanation-${suffix}`;

                if (!questionObj.explanations[suffix]) {
                    questionObj.explanations[suffix] = '';
                }
                if (content) {
                    questionObj.explanations[suffix] = content;
                }
            }
            // Strict check for "Answer" to avoid confusion with "Answer 1"
            else if (line.match(/^(?:[\*\#]+)?\s*Answer(?::)?\s*$/i)) {
                currentSection = 'answer';
            }
            else if ((match = line.match(headerPatterns.subQuestion))) {
                const index = parseInt(match[1]) - 1;
                const trailing = match[2] ? match[2].trim() : '';

                // Ensure array exists up to this index
                if (!questionObj.subQuestions) questionObj.subQuestions = [];
                if (!questionObj.subQuestions[index]) questionObj.subQuestions[index] = { question: '', answer: '' };

                if (trailing) {
                    questionObj.subQuestions[index].question = trailing;
                }
                currentSection = `subQuestion-${index}`;
            }
            else if ((match = line.match(headerPatterns.subAnswer))) {
                const index = parseInt(match[1]) - 1;
                const trailing = match[2] ? match[2].trim() : '';

                if (!questionObj.subQuestions) questionObj.subQuestions = [];
                if (!questionObj.subQuestions[index]) questionObj.subQuestions[index] = { question: '', answer: '' };

                if (trailing) {
                    questionObj.subQuestions[index].answer = trailing;
                }
                currentSection = `subAnswer-${index}`;
            }
            else if ((match = line.match(headerPatterns.topicSummary))) {
                currentSection = 'topicSummary';
                if (match[1] && match[1].trim()) {
                    questionObj.topicSummary = match[1].trim();
                }
            }
            else if ((match = line.match(headerPatterns.lesson))) {
                currentSection = 'lesson';
                if (match[1] && match[1].trim()) {
                    questionObj.lesson = match[1].trim();
                }
            }
            else if (headerPatterns.pairs.test(line)) {
                currentSection = 'pairs';
            }
            else if (line === '' || line === '---') {
                // Skip
            }
            else if (currentSection) {
                // Content Handling
                switch (currentSection) {
                    case 'question':
                        questionObj.question += (questionObj.question ? '\n' : '') + line;
                        break;
                    case 'options':
                        // Fix for Clumped Options (e.g., "A. Option 1, B. Option 2")
                        // Valid separators: Start of line, OR comma/semicolon + whitespace
                        // Lookahead: Option Letter (A-E) + Dot
                        const parts = line.split(/(?:^|[,;]\s+)(?=[A-E]\.)/);
                        const cleanOpts = parts.map(s => s.trim()).filter(Boolean);

                        if (cleanOpts.length > 0) {
                            questionObj.options.push(...cleanOpts);
                        } else {
                            // Fallback if regex didn't trigger but line exists
                            questionObj.options.push(line);
                        }
                        break;
                    case 'correctAnswer':
                        if (!questionObj.correctAnswer) {
                            questionObj.correctAnswer = line.replace(/[\.\*]/g, '').trim();
                        }
                        break;
                    case 'answer':
                        questionObj.answer += (questionObj.answer ? '\n' : '') + line;
                        break;
                    case 'topicSummary':
                        questionObj.topicSummary += (questionObj.topicSummary ? '\n' : '') + line;
                        break;
                    case 'lesson':
                        questionObj.lesson += (questionObj.lesson ? '\n' : '') + line;
                        break;
                    default:
                        if (currentSection.startsWith('Explanation-')) {
                            const suffix = currentSection.split('Explanation-')[1];
                            if (!questionObj.explanations[suffix]) {
                                questionObj.explanations[suffix] = '';
                            }
                            questionObj.explanations[suffix] += (questionObj.explanations[suffix] ? '\n' : '') + line;
                        } else if (currentSection.startsWith('subQuestion-')) {
                            const idx = parseInt(currentSection.split('-')[1]);
                            if (questionObj.subQuestions && questionObj.subQuestions[idx]) {
                                questionObj.subQuestions[idx].question += (questionObj.subQuestions[idx].question ? '\n' : '') + line;
                            }
                        } else if (currentSection.startsWith('subAnswer-')) {
                            const idx = parseInt(currentSection.split('-')[1]);
                            if (questionObj.subQuestions && questionObj.subQuestions[idx]) {
                                questionObj.subQuestions[idx].answer += (questionObj.subQuestions[idx].answer ? '\n' : '') + line;
                            }
                        } else if (currentSection === 'pairs') {
                            if (line.includes('|||')) {
                                const [left, right] = line.split('|||').map(s => s.trim());
                                if (left && right) {
                                    if (!questionObj.matches) questionObj.matches = [];
                                    questionObj.matches.push({ left, right });
                                }
                            }
                        } else if (currentSection === 'explanation') {
                            // If it's a Matching explanation line "Item ||| Expl"
                            if (questionObj.type === 'Matching' && line.includes('|||')) {
                                const [leftKey, expl] = line.split('|||').map(s => s.trim());
                                if (leftKey && expl && questionObj.matches) {
                                    const matchItem = questionObj.matches.find(m => m.left === leftKey);
                                    if (matchItem) {
                                        matchItem.explanation = expl;
                                    }
                                }
                            } else {
                                // Fallback standard explanation handling if needed, or specific logic
                                const suffix = currentSection.split('Explanation-')[1]; // This might fail if section is just 'explanation'
                                // ... existing logic handles Explanation-Suffix well. 
                                // But here we might be in a generic "Explanation" block if we defined one?
                                // Actually, my prompt uses "Explanation" block for Matching.
                                // Let's check the headerMatcher for Explanation again.
                            }
                        }
                }
            }
            i++;
        }

        // --- Type Inference ---
        // Clean up sparse sub-questions first
        if (questionObj.subQuestions) {
            questionObj.subQuestions = questionObj.subQuestions.filter(sq => sq && (sq.question || sq.answer));
        }

        // FORCE MCQ if options exist, regardless of what the LLM said (it often mislabels as Written)
        // EXCEPTION: Do not force if it is explicitly 'Matching'
        if (questionObj.options.length > 0 && questionObj.type !== 'Matching') {
            questionObj.type = 'MCQ';
        }

        if (!questionObj.type) {
            if (questionObj.options.length > 0) {
                questionObj.type = 'MCQ';
            } else {
                questionObj.type = 'Written';
            }
        }

        // Clean up fields (trim)
        questionObj.question = questionObj.question.replace(/^\d+[\.\)\-\s]+\s*/, '').trim();
        questionObj.topicSummary = questionObj.topicSummary.trim();
        questionObj.lesson = questionObj.lesson.trim();

        // Push if valid
        if (questionObj.question) {
            questions.push(questionObj);
        }
    }
    return questions;
};
