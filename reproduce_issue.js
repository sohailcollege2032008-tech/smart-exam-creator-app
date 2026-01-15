
// Mocking the updated robust parser logic locally to verify it against the prompt
const cleanHeader = (s) => s.replace(/^[\*\#\-\s]+|[\*\#\-\s]+$/g, '').trim();

const parserLogic = (text) => {
    if (!text) return [];

    const questions = [];
    const questionBlocks = text.split(/\n\s*---\s*\n/).map((b) => b.trim()).filter(Boolean);

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

        const headerPatterns = {
            questionNum: /^(?:\*\*|##)?\s*Question\s+(\d+)/i,
            type: /^(?:\*\*|##)?\s*Type:\s*(.+)/i,
            questionBody: /^(?:\*\*|##)?\s*Question$/i,
            options: /^(?:\*\*|##)?\s*Options$/i,
            correctAnswer: /^(?:\*\*|##)?\s*Correct Answer$/i,
            explanation: /^(?:\*\*|##)?\s*Explanation(?:-(.+))?$/i,
            topicSummary: /^(?:\*\*|##)?\s*Topic Summary$/i,
            lesson: /^(?:\*\*|##)?\s*Lesson$/i,
            answer: /^(?:\*\*|##)?\s*Answer$/i,
        };

        while (i < lines.length) {
            const line = lines[i];
            let match;

            if ((match = line.match(headerPatterns.questionNum))) {
                questionObj.number = match[1];
                currentSection = '';
            } else if ((match = line.match(headerPatterns.type))) {
                questionObj.type = cleanHeader(match[1]);
                currentSection = '';
            } else if (headerPatterns.questionBody.test(line)) {
                currentSection = 'question';
            } else if (headerPatterns.options.test(line)) {
                currentSection = 'options';
            } else if (headerPatterns.correctAnswer.test(line)) {
                currentSection = 'correctAnswer';
            } else if ((match = line.match(headerPatterns.explanation))) {
                if (match[1]) {
                    currentSection = `Explanation-${match[1]}`;
                } else {
                    currentSection = 'Explanation-General';
                }
            } else if (headerPatterns.answer.test(line)) {
                currentSection = 'answer';
            } else if (headerPatterns.topicSummary.test(line)) {
                currentSection = 'topicSummary';
            } else if (headerPatterns.lesson.test(line)) {
                currentSection = 'lesson';
            } else if (line === '' || line === '---') {
                // Skip
            } else if (currentSection) {
                switch (currentSection) {
                    case 'question': questionObj.question += (questionObj.question ? '\n' : '') + line; break;
                    case 'options': questionObj.options.push(line); break;
                    case 'correctAnswer': questionObj.correctAnswer = line.replace(/[\.\*]/g, '').trim(); break;
                    case 'explanation': break; // handled in default
                    default:
                        if (currentSection.startsWith('Explanation-')) {
                            const suffix = currentSection.split('-')[1];
                            if (!questionObj.explanations[suffix]) questionObj.explanations[suffix] = '';
                            questionObj.explanations[suffix] += (questionObj.explanations[suffix] ? '\n' : '') + line;
                        }
                }
            }
            i++;
        }

        if (!questionObj.type) {
            if (questionObj.options.length > 0) questionObj.type = 'MCQ';
            else questionObj.type = 'Written';
        }

        if (questionObj.question) {
            questions.push(questionObj);
        }
    }
    return questions;
};

const problematicText = `
**Question 1**
In the sequence of cellular events...

**Options**
A. Activation
B. Resolution
C. Marchion
D. Phagome-Lysosome Fusion
E. Leukocytosis

**Correct Answer**
A.

**Explanation**
The correct answer is A because...

**Topic Summary**
The acute inflammatory process involves...

**Lesson**
Acute Inflammation: Cellular Events

---
**Question 2**
What is the primary function...

**Options**
A. Promoting vascular dilation...
B. Initiating cell-to-cell signaling...
C. Attacking and breaking down...
D. Facilitating adhesion molecules...
E. Inducing systemic fever...

**Correct Answer**
C.

**Explanation**
The correct answer is C...

**Topic Summary**
Following Emigration...

**Lesson**
Phagocytosis and Intracellular Killing
`;

const result = parserLogic(problematicText);
console.log("Parsed Questions Count:", result.length);
if (result.length > 0) {
    console.log("First Question Type:", result[0].type);
    console.log("First Question Correct Answer:", result[0].correctAnswer);
}
