
// import initSqlJs from 'sql.js'; // Removed top-level import
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { QuizQuestion } from './quiz-parser';

// ==========================================
// 1. Constants & Templates
// ==========================================

const TARGET_DECK_NAME = "Smart Exam Creator Export";
const MODEL_NAME = "Interactive_MCQ_v3"; // Version bump to force update if re-imported

// Helper: Markdown Stripper - Enhanced
const cleanMarkdown = (text: string) => {
    if (!text) return "";
    let t = text;
    // Bold: **text**
    t = t.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    // Italic: *text* (careful with bullet points, but standard markdown uses *)
    t = t.replace(/\*([^\s][^*]*?)\*/g, '<i>$1</i>');
    // Underline: __text__
    t = t.replace(/__(.*?)__/g, '<u>$1</u>');
    // Strip remaining ** or __ or *
    t = t.replace(/\*\*/g, '').replace(/__/g, '');
    return t;
};

// CSS Styling
const CSS = `
.card {
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 16px;
    text-align: left;
    color: #333;
    background-color: white;
    padding: 20px;
    line-height: 1.5;
}

/* RTL Support */
.card.rtl {
    direction: rtl;
    text-align: right;
}

/* Night Mode */
.nightMode .card {
    background-color: #2f2f31;
    color: #f0f0f0;
}

.question-text {
    font-size: 1.2em;
    font-weight: 600;
    margin-bottom: 20px;
    color: #2c3e50;
}
.nightMode .question-text { color: #e1e1e1; }

/* Options & Buttons */
.options-container {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.option-btn, .reveal-btn {
    appearance: none;
    background: #f8f9fa;
    border: 2px solid #e9ecef;
    border-radius: 12px;
    padding: 12px 16px;
    font-size: 1em;
    color: #495057;
    cursor: pointer;
    text-align: inherit; 
    transition: all 0.2s ease;
    user-select: none;
    position: relative;
    display: block;
    width: 100%;
}

.nightMode .option-btn, .nightMode .reveal-btn {
    background: #3a3a3c;
    border-color: #4a4a4c;
    color: #d1d1d6;
}

.option-btn:hover, .reveal-btn:hover {
    border-color: #adb5bd;
    transform: translateY(-1px);
}

/* Selection State */
.option-btn.selected {
    border-color: #007bff;
    background-color: #e7f1ff;
    color: #0056b3;
}
.nightMode .option-btn.selected {
    border-color: #4da3ff;
    background-color: #1a3a5e;
    color: #aaddff;
}

/* Correct/Incorrect States */
.option-btn.correct-answer {
    background-color: #d4edda !important;
    border-color: #c3e6cb !important;
    color: #155724 !important;
}
.nightMode .option-btn.correct-answer {
    background-color: #1c4426 !important;
    border-color: #265e34 !important;
    color: #85e09f !important;
}

.option-btn.wrong-selected {
    background-color: #f8d7da !important;
    border-color: #f5c6cb !important;
    color: #721c24 !important;
}
.nightMode .option-btn.wrong-selected {
    background-color: #4c2225 !important;
    border-color: #6e2f34 !important;
    color: #e68d95 !important;
}

/* Fill-in-the-blank Interactive */
.cloze-placeholder {
    font-weight: bold;
    color: #007bff;
    cursor: pointer;
    border-bottom: 2px dashed #007bff;
    padding: 0 4px;
    background: rgba(0, 123, 255, 0.1);
    border-radius: 4px;
}
.nightMode .cloze-placeholder { color: #4da3ff; border-bottom-color: #4da3ff; background: rgba(77, 163, 255, 0.1); }

.cloze-revealed {
    font-weight: bold;
    color: #28a745;
    animation: fadeIn 0.3s ease;
    border-bottom: none;
    background: transparent;
}
.nightMode .cloze-revealed { color: #50c878; }

/* SubQuestions */
.sub-question-block {
    margin-bottom: 15px;
    padding: 10px;
    border: 1px solid #eee;
    border-radius: 8px;
}
.nightMode .sub-question-block { border-color: #444; }

.sub-q-text { font-weight: 600; margin-bottom: 5px; }

.sub-q-answer {
    margin-top: 8px;
    padding: 8px;
    background: #f1f3f5;
    border-radius: 4px;
    color: #333;
    display: none; 
}
.nightMode .sub-q-answer { background: #333; color: #eee; }
.sub-q-answer.visible { display: block; }

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

/* Back Side Details */
.answer-section {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #dee2e6;
}
.nightMode .answer-section { border-top-color: #4a4a4c; }

.correct-label {
    font-weight: bold;
    color: #28a745;
    margin-bottom: 8px;
    display: block;
}
.nightMode .correct-label { color: #50c878; }

.explanation-block {
    margin-top: 10px;
    padding: 10px;
    border-radius: 6px;
    background: #f8f9fa;
    border-left: 3px solid #6c757d;
}
.nightMode .explanation-block {
    background: #2d2d2d;
    border-left-color: #555;
    color: #ddd;
}

.exp-title {
    font-weight: bold;
    font-size: 0.85em;
    text-transform: uppercase;
    color: #666;
    margin-bottom: 4px;
}
.nightMode .exp-title { color: #aaa; }

.topic-summary {
    margin-top: 20px;
    padding: 15px;
    background-color: #fff3cd;
    border-left: 4px solid #ffc107;
    color: #856404;
    border-radius: 6px;
}
.nightMode .topic-summary {
    background-color: #3e3725;
    border-left-color: #bfa141;
    color: #eaddb6;
}
`;

// Front Template
const FRONT_TEMPLATE = `
<div class="card {{#Question}}test{{/Question}} {{#RTL}}rtl{{/RTL}}">
    <!-- Hidden Data Storage -->
    <div id="data-correct-answer" style="display:none">{{CorrectAnswer}}</div>
    <div id="data-subquestions" style="display:none">{{SubQuestions}}</div>
    <div id="data-question-type" style="display:none">{{QuestionType}}</div>
    
    <div class="question-text" id="question-text">{{Question}}</div>

    {{#Option1}}
    <div class="options-container" id="options"></div>
    {{/Option1}}

    <!-- Container for SubQuestions if any -->
    <div id="sub-questions-container"></div>
    <!-- Fallback Reveal Button (e.g. for Complete if no dots found) -->
    <div id="fallback-reveal-container" style="margin-top:20px; display:none;">
         <button class="reveal-btn" id="fallback-btn">Show Answer</button>
         <div id="fallback-answer" class="sub-q-answer" style="margin-top:10px;">{{CorrectAnswer}}</div>
    </div>

    <script>
    (function(){
        var qType = document.getElementById('data-question-type') ? document.getElementById('data-question-type').innerText.trim() : '';
        var correctAnswer = document.getElementById('data-correct-answer') ? document.getElementById('data-correct-answer').innerText : '';
        
        // 1. MCQ OPTIONS LOGIC
        var container = document.getElementById('options');
        if (container) {
            container.innerHTML = '';
            var options = [
                { text: "{{Option1}}", id: "A" },
                { text: "{{Option2}}", id: "B" },
                { text: "{{Option3}}", id: "C" },
                { text: "{{Option4}}", id: "D" },
                { text: "{{Option5}}", id: "E" }
            ];
            var validOptions = 0;
            options.forEach(function(opt){
                if(!opt.text) return; 
                validOptions++;
                var btn = document.createElement('div');
                btn.className = 'option-btn';
                btn.innerHTML = opt.text;
                btn.onclick = function(){
                   var all = container.children;
                   for(var i=0; i<all.length; i++) all[i].classList.remove('selected');
                   btn.classList.add('selected');
                   if (window.sessionStorage) window.sessionStorage.setItem('anki_selected_id', opt.id);
                };
                container.appendChild(btn);
            });
            // If no valid options, hide container (Written/Complete)
            if (validOptions === 0) container.style.display = 'none';
        }

        // 2. COMPLETE / FILL-IN-THE-BLANK LOGIC
        var qText = document.getElementById('question-text');
        var foundDots = false;
        
        // Regex for dots (..), underscores (__), or ellipsis (…) 
        // We use innerHTML to modify the rendered text
        if (qText) {
             var originalHTML = qText.innerHTML;
             var newHTML = originalHTML.replace(/(\\.\\.|_{2,}|…)+/g, function(match){
                 foundDots = true;
                 // Escape single quotes in answer for the JS string
                 var safeAns = correctAnswer.replace(/'/g, "\\\\'");
                 return '<span class="cloze-placeholder" onclick="this.innerHTML = \\'' + safeAns + '\\'; this.className=\\'cloze-revealed\\'">[ ' + match + ' ]</span>';
             });
             
             if (foundDots) {
                 qText.innerHTML = newHTML;
             }
        }

        // If Type is 'Complete' or 'Written' and NO dots were found, show Fallback button
        // Check if qType contains Complete or Fill
        if (!foundDots && (qType === 'Complete' || qType === 'Written' || qType.toLowerCase().indexOf('complete') !== -1)) {
            // Only if valid answer exists
             if (correctAnswer && correctAnswer.trim().length > 0) {
                 var fb = document.getElementById('fallback-reveal-container');
                 if(fb) {
                     fb.style.display = 'block';
                     var fbBtn = document.getElementById('fallback-btn');
                     var fbAns = document.getElementById('fallback-answer');
                     fbBtn.onclick = function() {
                         fbAns.classList.toggle('visible');
                         fbBtn.innerText = fbAns.classList.contains('visible') ? 'Hide Answer' : 'Show Answer';
                     }
                 }
             }
        }

        // 3. SUB-QUESTIONS LOGIC (Branching)
        // Check if we have standard SubQuestions or user just wants "Part 1 / Part 2" manual buttons
        var subDataEl = document.getElementById('data-subquestions');
        var subContainer = document.getElementById('sub-questions-container');
        
        if (subDataEl && subContainer) {
            var subData = subDataEl.innerText;
            if (subData && subData !== "{}" && subData.length > 5) {
                try {
                    var subs = JSON.parse(subData);
                    if (Array.isArray(subs) && subs.length > 0) {
                        subs.forEach(function(sq, idx) {
                            var block = document.createElement('div');
                            block.className = 'sub-question-block';
                            
                            var title = document.createElement('div');
                            title.className = 'sub-q-text';
                            title.innerHTML = 'Part ' + (idx + 1) + ': ' + sq.question;
                            
                            var btn = document.createElement('button');
                            btn.className = 'reveal-btn';
                            btn.innerText = 'Show Answer';
                            btn.style.marginTop = '5px';
                            btn.style.width = 'auto';
                            btn.style.padding = '5px 10px';
                            btn.style.fontSize = '0.9em';
                            
                            var ansDiv = document.createElement('div');
                            ansDiv.className = 'sub-q-answer';
                            ansDiv.innerHTML = sq.answer;
                            
                            btn.onclick = function() {
                                ansDiv.classList.toggle('visible');
                                btn.innerText = ansDiv.classList.contains('visible') ? 'Hide Answer' : 'Show Answer';
                            };
                            
                            block.appendChild(title);
                            block.appendChild(btn);
                            block.appendChild(ansDiv);
                            subContainer.appendChild(block);
                        });
                    }
                } catch(e) { console.error('SubQ parsing error', e); }
            }
        }

    })();
    </script>
</div>
`;

// Back Template
const BACK_TEMPLATE = `
<div class="card {{#RTL}}rtl{{/RTL}}">
    <div class="question-text">{{Question}}</div>

    {{#Option1}}
    <div class="options-container" id="options-back"></div>
    <script>
    (function(){
        var container = document.getElementById('options-back');
        if(container){
            container.innerHTML = '';
            var options = [
                 { text: "{{Option1}}", id: "A" },
                 { text: "{{Option2}}", id: "B" },
                 { text: "{{Option3}}", id: "C" },
                 { text: "{{Option4}}", id: "D" },
                 { text: "{{Option5}}", id: "E" }
            ];
            var rawCorrect = "{{CorrectAnswer}}".replace(/<[^>]*>/g, "").trim(); 
            var correctId = rawCorrect.charAt(0).toUpperCase();
            var userSelected = null;
            if (window.sessionStorage) userSelected = window.sessionStorage.getItem('anki_selected_id');
            var validOptions = 0;
            options.forEach(function(opt){
                if(!opt.text) return;
                validOptions++;
                var btn = document.createElement('div');
                btn.className = 'option-btn';
                btn.innerHTML = opt.text;
                if (opt.id === correctId) btn.classList.add('correct-answer');
                if (userSelected && userSelected === opt.id && userSelected !== correctId) btn.classList.add('wrong-selected');
                container.appendChild(btn);
            });
            if (validOptions === 0) container.style.display = 'none';
        }
    })();
    </script>
    {{/Option1}}
    
    <!-- SubQuestions Back View -->
    <div id="sub-questions-back"></div>
    <div id="data-subquestions-back" style="display:none">{{SubQuestions}}</div>
    <script>
    (function(){
       var subData = document.getElementById('data-subquestions-back').innerText;
       var subContainer = document.getElementById('sub-questions-back');
       if (subData && subData.length > 5 && subContainer) {
           try {
               var subs = JSON.parse(subData);
               if (Array.isArray(subs)) {
                   subs.forEach(function(sq, idx) {
                       var block = document.createElement('div');
                       block.className = 'sub-question-block';
                       block.innerHTML = '<div class="sub-q-text">Part '+(idx+1)+': '+sq.question+'</div><div class="sub-q-answer visible" style="display:block">'+sq.answer+'</div>';
                       subContainer.appendChild(block);
                   });
               }
           } catch(e){}
       }
    })();
    </script>

    <div class="answer-section">
        <span class="correct-label">Correct Answer: {{CorrectAnswer}}</span>
        
        {{#Explanation_A}}
        <div class="explanation-block">
            <div class="exp-title">Explanation A</div>
            {{Explanation_A}}
        </div>
        {{/Explanation_A}}

        {{#Explanation_B}}
        <div class="explanation-block">
            <div class="exp-title">Explanation B</div>
            {{Explanation_B}}
        </div>
        {{/Explanation_B}}

        {{#Explanation_C}}
        <div class="explanation-block">
            <div class="exp-title">Explanation C</div>
            {{Explanation_C}}
        </div>
        {{/Explanation_C}}

        {{#Explanation_D}}
        <div class="explanation-block">
            <div class="exp-title">Explanation D</div>
            {{Explanation_D}}
        </div>
        {{/Explanation_D}}

        {{#Explanation_E}}
        <div class="explanation-block">
            <div class="exp-title">Explanation E</div>
            {{Explanation_E}}
        </div>
        {{/Explanation_E}}

        {{#General_Explanation}}
        <div class="explanation-block">
            <div class="exp-title">General Explanation</div>
            {{General_Explanation}}
        </div>
        {{/General_Explanation}}

        {{#Topic_Summary}}
        <div class="topic-summary">
            <strong>Topic Summary:</strong><br/>
            {{Topic_Summary}}
        </div>
        {{/Topic_Summary}}
    </div>
</div>
`;

// ==========================================
// 2. Generator Utility
// ==========================================

export const generateAnkiDeck = async (questions: QuizQuestion[], deckName: string = TARGET_DECK_NAME, language: string = 'en') => {
    try {
        console.log("Initializing SQL.js...");
        const sqlModule = await import('sql.js');
        const initSqlJs = sqlModule.default || sqlModule;
        const SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' });
        const db = new SQL.Database();

        // Standard Schema
        db.run(`
        CREATE TABLE col (
            id integer primary key, crt integer not null, mod integer not null, scm integer not null,
            ver integer not null, dty integer not null, usn integer not null, ls integer not null,
            conf text not null, models text not null, decks text not null, dconf text not null, tags text not null
        );
        CREATE TABLE notes (
            id integer primary key, guid text not null, mid integer not null, mod integer not null,
            usn integer not null, tags text not null, flds text not null, sfld integer not null,
            csum integer not null, flags integer not null, data text not null
        );
        CREATE TABLE cards (
            id integer primary key, nid integer not null, did integer not null, ord integer not null,
            mod integer not null, usn integer not null, type integer not null, queue integer not null,
            due integer not null, ivl integer not null, factor integer not null, reps integer not null,
            lapses integer not null, left integer not null, odue integer not null, odid integer not null,
            flags integer not null, data text not null
        );
        CREATE TABLE revlog (
            id integer primary key, cid integer not null, usn integer not null, ease integer not null,
            ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null,
            type integer not null
        );
        CREATE TABLE graves ( usn integer not null, oid integer not null, type integer not null );
        `);

        // Model & Deck IDs
        const now = Date.now();
        const id_deck = now;
        const id_model = now + 1;
        const isRtl = (language === 'ar');

        // Model Definition
        const model = {
            id: id_model,
            name: MODEL_NAME,
            type: 0,
            mod: Math.floor(now / 1000),
            usn: -1,
            sortf: 0,
            did: id_deck,
            tmpls: [{ name: "Interactive Card", ord: 0, qfmt: FRONT_TEMPLATE, afmt: BACK_TEMPLATE, bqfmt: "", bafmt: "", did: null }],
            // Updated Fields
            flds: [
                { name: "Question", ord: 0, sticky: false, rtl: isRtl, font: "Arial", size: 20 },
                { name: "Option1", ord: 1, sticky: false, rtl: isRtl, font: "Arial", size: 20 },
                { name: "Option2", ord: 2, sticky: false, rtl: isRtl, font: "Arial", size: 20 },
                { name: "Option3", ord: 3, sticky: false, rtl: isRtl, font: "Arial", size: 20 },
                { name: "Option4", ord: 4, sticky: false, rtl: isRtl, font: "Arial", size: 20 },
                { name: "Option5", ord: 5, sticky: false, rtl: isRtl, font: "Arial", size: 20 }, // New: Option E
                { name: "CorrectAnswer", ord: 6, sticky: false, rtl: isRtl, font: "Arial", size: 20 },
                { name: "General_Explanation", ord: 7, sticky: false, rtl: isRtl, font: "Arial", size: 20 },
                { name: "Explanation_A", ord: 8, sticky: false, rtl: isRtl, font: "Arial", size: 20 },
                { name: "Explanation_B", ord: 9, sticky: false, rtl: isRtl, font: "Arial", size: 20 },
                { name: "Explanation_C", ord: 10, sticky: false, rtl: isRtl, font: "Arial", size: 20 },
                { name: "Explanation_D", ord: 11, sticky: false, rtl: isRtl, font: "Arial", size: 20 },
                { name: "Explanation_E", ord: 12, sticky: false, rtl: isRtl, font: "Arial", size: 20 }, // New: Explanation E
                { name: "Topic_Summary", ord: 13, sticky: false, rtl: isRtl, font: "Arial", size: 20 },
                { name: "RTL", ord: 14, sticky: false, rtl: false, font: "Arial", size: 10 },
                { name: "SubQuestions", ord: 15, sticky: false, rtl: isRtl, font: "Arial", size: 14 },
                { name: "QuestionType", ord: 16, sticky: false, rtl: false, font: "Arial", size: 10 }
            ],
            css: CSS,
            req: [[0, "all", [0]]]
        };

        const models: any = {}; models[id_model] = model;
        const deck = { id: id_deck, mod: Math.floor(now / 1000), name: deckName, usn: -1, lrnToday: [0, 0], revToday: [0, 0], newToday: [0, 0], timeToday: [0, 0], collapsed: false, browserCollapsed: false, desc: "Smart Exam Creator", dyn: 0, conf: 1, extendNew: 10, extendRev: 50 };
        const decks: any = {}; decks[id_deck] = deck;
        const dconf = { 1: { id: 1, mod: Math.floor(now / 1000), name: "Default", usn: 0, maxTaken: 60, autoplay: true, timer: 0, replayq: true, new: { bury: false, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 7], order: 1, perDay: 20 }, rev: { bury: false, ease4: 1.3, fuzz: 0.05, ivlFct: 1, maxIvl: 36500, minSpace: 1, perDay: 200 }, lapse: { delays: [10], leechAction: 0, leechFails: 8, minInt: 1, mult: 0 } } };
        const conf = JSON.stringify({ nextPos: 1, estTimes: true, activeDecks: [1], sortType: "noteFld", timeLim: 0, sortBackwards: false, addToCur: true, curDeck: 1, newBury: true, newSpread: 0, dueCounts: true, curModel: id_model, collapseTime: 1200 });

        db.run(`INSERT INTO col VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [1, Math.floor(now / 1000), Math.floor(now / 1000), Math.floor(now / 1000), 11, 0, 0, 0, conf, JSON.stringify(models), JSON.stringify(decks), JSON.stringify(dconf), '{}']);

        const stmt_note = db.prepare("INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        const stmt_card = db.prepare("INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

        questions.forEach((q, idx) => {
            const note_id = now + 100 + idx;
            const guid = (Date.now().toString(36) + Math.random().toString(36).substr(2, 5)).substring(0, 10);
            const ts = Math.floor(Date.now() / 1000);

            let finalCorrectAnswer = cleanMarkdown(q.correctAnswer || "");
            let finalGeneralExp = cleanMarkdown(q.explanations?.['General'] || "");
            let qType = q.type || 'MCQ';

            if (q.type === 'Mcq' || q.type === 'MCQ') {
                if (!finalGeneralExp && !q.explanations?.['A']) finalGeneralExp = cleanMarkdown(q.answer || "");
            }
            else if (q.type === 'Written') {
                finalCorrectAnswer = cleanMarkdown(q.answer || q.correctAnswer || "");
                if (!finalGeneralExp) finalGeneralExp = cleanMarkdown(q.explanations?.['General'] || "");
            }
            else if (q.type === 'Complete') {
                finalCorrectAnswer = cleanMarkdown(q.answer || q.correctAnswer || "");
                if (!finalGeneralExp) finalGeneralExp = cleanMarkdown(q.explanations?.['General'] || "");
            }
            else if (q.type === 'Matching') {
                // Formatting for Matching Questions
                // Front: Show Left items and Right items (maybe shuffled or just listed)
                // Back: Show Correct Pairs

                // Front: "Match the following:\n\nLeft:\n1. A\n2. B\n\nRight:\na. X\nb. Y"
                let frontText = cleanMarkdown(q.question) + "\n\n<b>Pairs to Match:</b><br>";
                q.matches?.forEach(m => {
                    frontText += `• ${cleanMarkdown(m.left)}  <-->  ???<br>`;
                });

                // We could also list the right side options randomly if we wanted, but standard "Match" often implies just knowing them.
                // Let's list the right side options shuffled to help user?
                if (q.matches) {
                    const rightSide = q.matches.map(m => cleanMarkdown(m.right));
                    // Simple shuffle for display
                    for (let i = rightSide.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [rightSide[i], rightSide[j]] = [rightSide[j], rightSide[i]];
                    }
                    frontText += `<br><b>Options:</b><br>${rightSide.join(' | ')}`;
                }

                // Back: Correct Pairs
                let backText = "<b>Correct Matches:</b><br>";
                q.matches?.forEach(m => {
                    backText += `• ${cleanMarkdown(m.left)}  ➔  <b>${cleanMarkdown(m.right)}</b>`;
                    if (m.explanation) backText += ` <i>(${cleanMarkdown(m.explanation)})</i>`;
                    backText += `<br>`;
                });

                finalCorrectAnswer = backText;
                // We override the question text for the card to include the "Match layout"
                // Actually, we can't easily override q.question in the loop without affecting others.
                // We'll append to the question field in the 'fields' array construction below? 
                // No, 'fields' construction uses 'cleanMarkdown(q.question)'.
                // Strategy: We will temporarily modifying 'q.question' or just leverage the 'General_Explanation' for the answer.
                // Better: Let's assign our formatted frontText to a variable we use in the fields construction.
                // BUT the fields construction lines 613+ uses 'cleanMarkdown(q.question)'.
                // We should modify the logic slightly to allow custom Front Text.
            }
            else {
                finalCorrectAnswer = cleanMarkdown(q.answer || q.correctAnswer || "");
            }

            const cleanSubQuestions = q.subQuestions ? q.subQuestions.map(sq => ({
                question: cleanMarkdown(sq.question),
                answer: cleanMarkdown(sq.answer)
            })) : [];

            // Determine Front Text
            let frontCardText = cleanMarkdown(q.question);
            if (q.type === 'Matching') {
                frontCardText += "<br><br><b>Pairs to Match:</b><br>";
                q.matches?.forEach(m => {
                    frontCardText += `• ${cleanMarkdown(m.left)}  <-->  ???<br>`;
                });
                if (q.matches) {
                    const rightSide = q.matches.map(m => cleanMarkdown(m.right));
                    // Simple shuffle for display
                    for (let i = rightSide.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [rightSide[i], rightSide[j]] = [rightSide[j], rightSide[i]];
                    }
                    frontCardText += `<br><b>Options:</b><br>${rightSide.join(' | ')}`;
                }
            }

            // Combine fields. Order must match Model "flds" EXACTLY
            const fields = [
                frontCardText,
                cleanMarkdown(q.options?.[0] || ""),
                cleanMarkdown(q.options?.[1] || ""),
                cleanMarkdown(q.options?.[2] || ""),
                cleanMarkdown(q.options?.[3] || ""),
                cleanMarkdown(q.options?.[4] || ""), // Option 5
                finalCorrectAnswer,
                finalGeneralExp,
                cleanMarkdown(q.explanations?.['A'] || ""),
                cleanMarkdown(q.explanations?.['B'] || ""),
                cleanMarkdown(q.explanations?.['C'] || ""),
                cleanMarkdown(q.explanations?.['D'] || ""),
                cleanMarkdown(q.explanations?.['E'] || ""), // Explanation E
                cleanMarkdown(q.topicSummary || ""),
                isRtl ? "true" : "",
                JSON.stringify(cleanSubQuestions), // Field 15
                qType // Field 16: QuestionType
            ].join("\x1f");

            stmt_note.run([note_id, guid, id_model, ts, -1, "", fields, q.question, 0, 0, ""]);
            stmt_card.run([now + 500 + idx, note_id, id_deck, 0, ts, -1, 0, 0, idx, 0, 0, 0, 0, 0, 0, 0, 0, ""]);
        });

        stmt_note.free();
        stmt_card.free();
        const data = db.export();
        const zip = new JSZip();
        zip.file("collection.anki21", data);
        zip.file("collection.anki2", data);
        zip.file("media", "{}");
        saveAs(await zip.generateAsync({ type: "blob" }), `${deckName}.apkg`);
        console.log("Export complete.");

    } catch (err: any) {
        console.error("Anki Export Error:", err);
        alert(`Failed to export Anki deck: ${err.message || err}`);
        throw err;
    }
};
