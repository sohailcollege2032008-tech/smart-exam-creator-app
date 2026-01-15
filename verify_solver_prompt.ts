
import { _solverSystemPromptBase, arabizationSystemPrompt } from './lib/gemini';

console.log("Checking Solver Prompt...");
const hasExpA = _solverSystemPromptBase.includes('Explanation-A');
const hasExpE = _solverSystemPromptBase.includes('Explanation-E');
const hasZeroDataLossSolver = _solverSystemPromptBase.includes('ZERO DATA LOSS');

if (hasExpA && hasExpE && hasZeroDataLossSolver) {
    console.log("SUCCESS: Solver prompt includes split explanations and ZERO DATA LOSS policy.");
} else {
    console.error("FAILURE: Solver prompt missing keys.");
    console.log("Has ExpA:", hasExpA, "Has ExpE:", hasExpE, "Has ZeroDataLoss:", hasZeroDataLossSolver);
}

console.log("Checking Arabization Prompt...");
const hasZeroDataLossArab = arabizationSystemPrompt.includes('ZERO DATA LOSS');
const hasBatchInstr = arabizationSystemPrompt.includes('PROCESS EVERY SINGLE QUESTION');

if (hasZeroDataLossArab && hasBatchInstr) {
    console.log("SUCCESS: Arabization prompt includes Batch Integrity instructions.");
} else {
    console.error("FAILURE: Arabization prompt missing keys.");
    console.log("Has ZeroDataLoss:", hasZeroDataLossArab, "Has BatchInstr:", hasBatchInstr);
}
