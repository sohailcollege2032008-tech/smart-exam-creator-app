
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// --- Types ---
export type SubjectType = 'standard' | 'math' | 'medical' | 'engineering' | 'law' | 'language';
export type ExplanationMode = 'standard' | 'deep' | 'simple' | 'concise' | 'detailed';

// --- CONSTANTS: The Canonical Formats ---
const MCQ_TEMPLATE = `
---
Question [Number]
Type: MCQ
Question
[The Question Text]
Options
A. [Option Text]
B. [Option Text]
C. [Option Text]
D. [Option Text]
E. [Option Text]
Correct Answer
[Option Letter ONLY, e.g., A]
Explanation-A
[Why A is correct/incorrect...]
Explanation-B
[Why B is correct/incorrect...]
Explanation-C
[Why C is correct/incorrect...]
Explanation-D
[Why D is correct/incorrect...]
Explanation-E
[Why E is correct/incorrect...]
Topic Summary
[Detailed background info...]
Lesson
[Subject/Chapter Name]
---
`;

const WRITTEN_TEMPLATE = `
---
Question [Number]
Type: Written
Question
[The Question Text]
Answer
[The Full Model Answer]
Topic Summary
[Detailed background info...]
Lesson
[Subject/Chapter Name]
---
`;

const MATCHING_TEMPLATE = `
---
Question [Number]
Type: Matching
Question
[Match the following items...]
Pairs
[Item 1] ||| [Match 1]
[Item 2] ||| [Match 2]
Explanation
[Item 1] ||| [Reasoning]
[Item 2] ||| [Reasoning]
Topic Summary
[Detailed background info...]
Lesson
[Subject/Chapter Name]
---
`;

// --- PEDAGOGICAL STYLES ---

const STANDARD_STYLE_INSTRUCTIONS = `
**EXPLANATION STYLE: STANDARD (Active Learning)**
1.  **For Each Option (A-E):**
    *   **Define:** Briefly define the term.
    *   **Reject:** Explain clearly why it is incorrect *in this specific context*.
    *   **Hypothetical (CRITICAL):** You MUST state: *"This option would be the correct answer if the question asked about [Condition]..."*
2.  **Topic Summary:**
    *   Keep it **Concise** (Max 3 lines).
    *   Focus on the core concept only.
`;

const DETAILED_STYLE_INSTRUCTIONS = `
**EXPLANATION STYLE: DETAILED (Mastery Mode)**
1.  **For Each Option (A-E):**
    *   **Define:** Provide a formal definition.
    *   **Reject:** detailed analysis of why it fails here.
    *   **Hypothetical:** State when it would be true.
    *   **Comparison:** Explicitly compare this option vs the Correct Answer (e.g., "Unlike X, Y involves...").
2.  **Topic Summary:**
    *   **Structure:**
        *   **Definition:** Fully define the principle/condition.
        *   **Comparisons:** Compare all related concepts (even those not in options). Use bullet points.
        *   **Examples:** Provide multiple clinical/practical examples.
        *   **Quotes:** If text is provided, include relevant quotes.
    *   **Length:** Comprehensive (No limit).
`;

const FORMAT_RULES = `
**CRITICAL FORMATTING RULES:**
1.  **NO JSON:** Output purely plaintext using the structure above.
2.  **Separators:** Use "---" between questions.
3.  **Headers:** Use the exact English headers shown.
4.  **Explanations:** 
    - For MCQs: Provide specific \`Explanation-A\`, \`Explanation-B\` etc.
    - For Written: Use the \`Answer\` header.
5.  **Types:**
    - \`Type: MCQ\` (Must have Options A-E)
    - \`Type: Written\` (Must have Answer)
    - \`Type: Matching\` (Must have Pairs)
`;

// --- 1. BASE FORMATTER PROMPT (Fallback) ---
export const formatterSystemPrompt = `You are an expert Educational Content Formatter.
Your goal is to organize questions into a strict machine-readable text format.

${FORMAT_RULES}

**HANDLING OPTIONS:**
- **Solver Mode:** If analyzing existing questions, preserve the *exact* number of options found.
- **Generator Mode:** If creating new questions, default to **5 Options (A-E)**.

**OUTPUT TEMPLATES (CHOOSE BASED ON TYPE):**

**For MCQs:**
${MCQ_TEMPLATE}

**For Written Questions:**
${WRITTEN_TEMPLATE}

**For Matching Questions:**
${MATCHING_TEMPLATE}
`;

// --- 2. CRITICAL / MATH PROMPT ---
export const criticalSystemPrompt = `You are a PhD-level exam creator specializing in high-stakes assessments.
Your task is to generate or solve complex questions with absolute precision, especially for Math, Engineering, and Medical fields.

**CORE REQUIREMENT:**
- **Step-by-Step Thinking:** Before outputting the formatted question, wrap your reasoning in <thinking>...</thinking> tags.
- **Math Formatting:** Use MathML (<math>...</math>) for ALL mathematical expressions.
- **Accuracy:** Zero tolerance for calculation errors.

${FORMAT_RULES}

**OUTPUT TEMPLATES:**
<thinking>
[Solve the problem step-by-step here to ensure accuracy...]
</thinking>

${MCQ_TEMPLATE}
OR
${WRITTEN_TEMPLATE}
`;

// --- 3. EXPANSION PROMPT (Generate NEW Questions) ---
export const getExpansionSystemPrompt = (startNumber: number, targetCount: number) => `
You are a Smart Question Expansion Engine. Your goal is to generate NEW questions based EXCLUSIVELY on the provided input text (Seed Data).

**CORE LOGIC:**
1.  **Explanation Mining:** Identify facts in the explanations of the input that weren't asked about.
2.  **Reverse Engineering:** Reverse cause-and-effect relationships found in the input.
3.  **Distractor Transformation:** Turn incorrect options from the input into correct answers for new questions.

**OUTPUT REQUIREMENTS:**
- Generate EXACTLY ${targetCount} NEW questions.
- Start numbering from: ${startNumber}.
- Use the **Canonical MCQ Format** defined below.

${FORMAT_RULES}

${STANDARD_STYLE_INSTRUCTIONS}

**OUTPUT TEMPLATE:**
${MCQ_TEMPLATE}
`;

// --- 4. ARABIZATION PROMPT ---
export const arabizationSystemPrompt = `You are a professional Translator (English <-> Arabic).
Task: Translate the *content* of the text while PRESERVING the *structure*.

**CRITICAL:**
- Keep the **English Headers** intact for the parser: "Question", "Type:", "Options", "Correct Answer", "Explanation-A", "Topic Summary", "Lesson".
- Translate the *values* (Question text, Option text, Explanation text) to Arabic.
- If the text is technical code or JSON, do NOT translate syntax.
- **MathML:** Do NOT touch <math> tags.
`;


// --- 5. GENERATOR PROMPT (The Creator) ---
export const getGeneratorSystemPrompt = (
  difficulty: number,
  topic: string | undefined,
  mcqCount: number,
  writtenCount: number,
  subjectType: string,
  explanationMode: string
) => {
  const isMedical = subjectType === 'medical';
  const isMath = subjectType === 'engineering' || subjectType === 'math';

  // SELECT STYLE INSTRUCTION
  const styleInstruction = (explanationMode === 'detailed' || explanationMode === 'deep')
    ? DETAILED_STYLE_INSTRUCTIONS
    : STANDARD_STYLE_INSTRUCTIONS;

  return `
You are a ${difficulty > 8 ? 'Distinguished Professor' : 'Professional Exam Creator'} in ${subjectType}.
Your task: Generate a high-quality quiz based on the provided content.

**CONFIGURATION:**
- **Difficulty:** ${difficulty}/10
- **Target Audience:** ${isMedical ? 'Medical Students' : isMath ? 'Engineering Students' : 'University Students'}
- **Quantity:** Exactly ${mcqCount} MCQs and ${writtenCount} Written questions.
- **Explanation Style:** ${explanationMode}

**GENERATION RULES (CRITICAL):**
1.  **Option Count:** Generate **5 Options (A, B, C, D, E)** for every MCQ. This is mandatory for robustness.
2.  **Split Explanations:** You MUST generate a separate explanation for EACH option (A, B, C, D, E) explaining exactly why it is correct or incorrect.
3.  **Parsable Format:** Strictly follow the standard format structure.
4.  **Math:** If the subject involves formulas, use MathML.
5.  **No Laziness:** Do not say "See above". Repeat context if needed for the standalone card.

${FORMAT_RULES}

${styleInstruction}

**OUTPUT TEMPLATES:**

**TEMPLATE 1: MCQ (Standard)**
${MCQ_TEMPLATE}

**TEMPLATE 2: Written (Short Answer / Fill in Blank)**
${WRITTEN_TEMPLATE}

**TEMPLATE 3: Matching**
${MATCHING_TEMPLATE}

${topic ? `\n**TOPIC FILTER:** Focus strictly on: "${topic}". Ignore irrelevant content.` : ''}
`;
};

// --- BASE SOLVER PROMPT ---
const _solverSystemPromptBase = `
You are an expert Exam Solver.
Your task: Analyze the provided Question File and Solve it using the Reference Material.

**SOLVER RULES:**
1.  **Adaptive Options:** Unlike the generator, you must **respect the original option count**.
    - If the image shows 3 options, output 3.
    - If 4, output 4.
    - If 5, output 5.
    - Do NOT Hallucinate extra options.
2.  **Accuracy:** Use the provided reference material to verify answers.
3.  **Split Explanations:** Even if the source doesn't have them, YOU must generate specific explanations for why each option is Right or Wrong based on the reference.
4.  **Format:** Use the Canonical Format below. No JSON.

${FORMAT_RULES}

**OUTPUT TEMPLATE:**
<thinking>
[Analyze the image/text. Identify how many options exist. Solve step-by-step.]
</thinking>

${MCQ_TEMPLATE}
OR
${WRITTEN_TEMPLATE}
OR
${MATCHING_TEMPLATE}
`;

// --- 6. SOLVER PROMPT FACTORY ---
export const getSolverSystemPrompt = (
  topic: string | undefined,
  subjectType: string,
  explanationMode: string,
  trustMarked: boolean,
  negativeLogic: boolean
) => {
  let base = _solverSystemPromptBase;

  // A. Topic Filter
  if (topic) {
    base = `**TOPICAL FOCUS: ${topic}**\nOnly solve questions related to this topic.\n\n` + base;
  }

  // A.5 Explanation Mode Injection
  const styleInstruction = (explanationMode === 'detailed' || explanationMode === 'deep')
    ? DETAILED_STYLE_INSTRUCTIONS
    : STANDARD_STYLE_INSTRUCTIONS;

  base = styleInstruction + "\n\n" + base;


  // B. Trust Marked Answers
  if (trustMarked) {
    base = `**MODE: EXPLAIN THE MARKED ANSWER**\n- Identify the answer marked in the image.\n- Set it as "Correct Answer".\n- Justify it using the Reference.\n\n` + base;
  } else {
    base = `**MODE: SOLVE FROM SCRATCH**\n- Ignore any handwritten marks.\n- Derive the answer independently from the Reference.\n\n` + base;
  }

  // C. Negative Logic
  if (negativeLogic) {
    base += `\n\n**NEGATIVE LOGIC ACTIVE:**\n- The question asks for the FALSE/EXCEPTION statement.\n- Select the option that is FALSE.`;
  }

  return base;
};

// Default export for backward compatibility if needed
export const solverSystemPrompt = _solverSystemPromptBase;


// --- API CALLING LOGIC (Preserved & Cleaned) ---

const MODEL_NAME = 'gemini-1.5-flash';

interface Part {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  fileData?: {
    mimeType: string;
    fileUri: string;
  };
}

export async function callGemini(
  apiKey: string,
  text: string,
  systemPrompt: string,
  modelName: string = MODEL_NAME,
  temperature: number = 0.3,
  files?: Part[] // Support for attaching files
) {
  if (!apiKey) throw new Error("API Key is required");

  // Create client
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
    ],
  });

  const parts: Part[] = [];

  // Add files first (images, audio, etc) - Order matters
  if (files && files.length > 0) {
    const validFiles = files.filter(f => f !== null && f !== undefined);
    parts.push(...validFiles);
  }

  // Add the text prompt
  if (text) {
    parts.push({ text });
  }

  if (parts.length === 0) {
    throw new Error("No content provided to Gemini");
  }

  // Sanity check for parts structure
  const cleanParts = parts.filter(p => p.text || (p.inlineData && p.inlineData.data) || (p.fileData && p.fileData.fileUri));

  if (cleanParts.length === 0) {
    throw new Error("Content payload is empty after sanitization.");
  }

  // Retry Logic for 503 Service Unavailable / Overloaded
  let attempt = 0;
  const maxRetries = 5;

  while (attempt < maxRetries) {
    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: cleanParts as any }],
        generationConfig: {
          temperature,
        },
      });

      const response = await result.response;
      let content = '';

      try {
        content = response.text();
      } catch (textError: any) {
        if (textError.message && (textError.message.includes('RECITATION') || textError.message.includes('Safety'))) {
          console.error("Gemini Blocked Content:", textError);
          throw new Error("Gemini blocked the response due to Copyright/Safety triggers (RECITATION). Please try rephrasing input.");
        }
        throw textError;
      }

      if (!content) {
        throw new Error('No content returned from Gemini.');
      }

      return content;

    } catch (error: any) {
      const isOverloaded = error.message?.includes('503') || error.message?.includes('overloaded');

      if (isOverloaded && attempt < maxRetries - 1) {
        const delay = 4000 * (attempt + 1);
        console.warn(`Gemini 503 Overloaded(Attempt ${attempt + 1}/${maxRetries}).Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
        continue;
      }

      if (error.message?.includes('429')) {
        if (error.message.includes('limit: 0')) {
          throw new Error("Access Denied: 'Gemini 3 Pro' is not available on your current plan (Limit is 0). Please use 'Gemini 3 Flash' instead.");
        }
        throw new Error("Rate Limited (429): You are sending requests too fast. Please wait a moment.");
      }

      console.error("Gemini API Error:", error);
      throw new Error(error.message || "Unknown Gemini API Error");
    }
  }

  throw new Error("Gemini API Overloaded after multiple retries. Please try again later.");
}
