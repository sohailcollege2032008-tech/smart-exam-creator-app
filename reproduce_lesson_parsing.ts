
import { parseQuizText } from './lib/quiz-parser';

const sampleText = `
**Question 1**
Type: MCQ
What is the capital of France?
A. London
B. Paris
C. Berlin
Correct Answer: B
Explanation: Paris is the capital.
Topic Summary: Geography basics.
Lesson: Chapter 1: European Capitals
Answer: Paris

---

**Question 2**
Type: MCQ
What is 2+2?
A. 3
B. 4
Correct Answer: B
**Lesson:** Math Basics (with colon)
`;

const questions = parseQuizText(sampleText);
console.log("Parsed questions count:", questions.length);
if (questions.length > 0) {
    console.log("Q1:", JSON.stringify(questions[0], null, 2));
    console.log("Q2:", JSON.stringify(questions[1], null, 2));
}

console.log("Question 1 Lesson:", questions[0]?.lesson);
console.log("Question 2 Lesson:", questions[1]?.lesson);

if (questions[0]?.lesson === "Chapter 1: European Capitals" && questions[1]?.lesson === "Math Basics (with colon)") {
    console.log("SUCCESS: Both lesson formats parsed correctly.");
} else {
    console.log("FAILURE: Parsing failed.");
}
