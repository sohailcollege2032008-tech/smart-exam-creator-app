
import { parseQuizText } from './lib/quiz-parser';

const sampleText = `
Question 1
Type: MCQ
Question
According to the principles of pathology...
Options
A. Facotrs...
B. Series...
C. Direct causes...
Correct Answer
C
Explanation-C: This is the correct explanation.
Topic Summary: This is the topic summary.
Lesson: General Pathology

---

Question 2
Type: MCQ
Question
Test Question 2
Options
A. One
B. Two
Correct Answer: B
Explanation-A: Wrong answer explanation.
Explanation-B: Correct answer explanation.
Topic Summary: Summary content
Lesson: Math
`;

const questions = parseQuizText(sampleText);
console.log("Parsed questions count:", questions.length);

const q1 = questions[0];
console.log("Q1 Explanation-C:", q1.explanations['C']);
console.log("Q1 Topic Summary:", q1.topicSummary);
console.log("Q1 Correct Answer:", q1.correctAnswer);

let q1Success = false;
if (q1.explanations['C'] === 'This is the correct explanation.' &&
    q1.topicSummary === 'This is the topic summary.') {
    console.log("SUCCESS: Q1 parsed correctly.");
    q1Success = true;
} else {
    console.log("FAILURE: Q1 parsing failed.");
    console.log("Expected Expl-C: 'This is the correct explanation.'");
    console.log("Actual Expl-C:", q1.explanations['C']);
    console.log("Expected Summary: 'This is the topic summary.'");
    console.log("Actual Summary:", q1.topicSummary);
}

const q2 = questions[1];
console.log("Q2 Correct Answer:", q2.correctAnswer);
console.log("Q2 Expl-A:", q2.explanations['A']);
console.log("Q2 Expl-B:", q2.explanations['B']);
console.log("Q2 Summary:", q2.topicSummary);

let q2Success = false;
if (q2.correctAnswer === 'B' &&
    q2.explanations['A'] === 'Wrong answer explanation.' &&
    q2.explanations['B'] === 'Correct answer explanation.' &&
    q2.topicSummary === 'Summary content') {
    console.log("SUCCESS: Q2 parsed correctly.");
    q2Success = true;
} else {
    console.log("FAILURE: Q2 parsing failed.");
}

if (!q1Success || !q2Success) {
    process.exit(1);
}
