
// Paste the logic from the corrected parser here to verify it works in isolation
function parseQuizTest(text) {
    if (!text) return [];

    const questions = [];
    const questionBlocks = text.split(/\n\s*---\s*\n/).map((b) => b.trim()).filter(Boolean);
    const cleanHeader = (s) => s.replace(/^[\*\#\-\s]+|[\*\#\-\s]+$/g, '').trim();

    for (const block of questionBlocks) {
        const lines = block.split('\n').map((l) => l.trim());
        if (lines.length === 0) continue;

        const questionObj = {
            number: '',
            type: '',
            question: '',
            options: [],
            correctAnswer: '',
            answer: '',
            topicSummary: '',
            lesson: '',
            explanations: {},
        };

        let currentSection = '';
        let i = 0;

        // Regex Matchers (The fixed versions)
        const headerPatterns = {
            questionNum: /^(?:\*\*|##)?\s*Question\s+(\d+)/i,
            type: /^(?:\*\*|##)?\s*Type:\s*(.+)/i,
            questionBody: /^(?:\*\*|##)?\s*Question$/i,
            options: /^(?:\*\*|##)?\s*Options$/i,
            correctAnswer: /^(?:\*\*|##)?\s*Correct Answer(?::\s*(.*))?$/i,
            explanation: /^(?:\*\*|##)?\s*Explanation(?:-([^:]+))?(?::\s*(.*))?$/i,
            topicSummary: /^(?:\*\*|##)?\s*Topic Summary(?::\s*(.*))?$/i,
            lesson: /^(?:\*\*|##)?\s*Lesson(?::)?\s*(.*)$/i,
            answer: /^(?:\*\*|##)?\s*Answer$/i,
        };

        while (i < lines.length) {
            const line = lines[i];
            let match;

            if ((match = line.match(headerPatterns.questionNum))) {
                questionObj.number = match[1];
                currentSection = '';
            }
            else if ((match = line.match(headerPatterns.type))) {
                questionObj.type = cleanHeader(match[1]);
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
            else if (headerPatterns.answer.test(line)) {
                currentSection = 'answer';
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
            else if (line === '' || line === '---') {
                // Skip
            }
            else if (currentSection) {
                switch (currentSection) {
                    case 'question':
                        questionObj.question += (questionObj.question ? '\n' : '') + line;
                        break;
                    case 'options':
                        questionObj.options.push(line);
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
                        }
                }
            }
            i++;
        }

        // Infer type
        if (!questionObj.type) {
            if (questionObj.options.length > 0) questionObj.type = 'MCQ';
            else questionObj.type = 'Written';
        }

        if (questionObj.question) questions.push(questionObj);
    }
    return questions;
}

const sampleText = `
Question 1
Type: MCQ
Question
Body question
Options
A. Option A
B. Option B
Correct Answer: A
Explanation-A: This is explanation A.
Explanation-B: This is explanation B.
Topic Summary: This is the topic summary.
Lesson: The Lesson
`;

const result = parseQuizTest(sampleText);
const q1 = result[0];

console.log('Explanations:', JSON.stringify(q1.explanations));
console.log('Topic Summary:', q1.topicSummary);
console.log('Lesson:', q1.lesson);
console.log('Correct Answer:', q1.correctAnswer);

if (q1.explanations['A'] === 'This is explanation A.' &&
    q1.explanations['B'] === 'This is explanation B.' &&
    q1.topicSummary === 'This is the topic summary.' &&
    q1.lesson === 'The Lesson' &&
    q1.correctAnswer === 'A') {
    console.log('VERIFICATION PASSED');
} else {
    console.log('VERIFICATION FAILED');
}
