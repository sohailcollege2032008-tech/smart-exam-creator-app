import { QuizQuestion } from './quiz-parser';

function escapeHTML(str: string) {
    if (!str) return '';
    // Regex matches <math>...</math> blocks, including attributes and newlines
    return str.split(/(<math[\s\S]*?<\/math>)/gi).map(function (part) {
        // If it starts with <math, assume it is a math block (case insensitive check already done by split)
        if (part.toLowerCase().startsWith('<math')) {
            return part;
        }
        // Escape non-math text
        return part.replace(/[&<>"']/g, function (match) {
            const map: Record<string, string> = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
            };
            return map[match];
        });
    }).join('');
}

function formatText(text: string) {
    return escapeHTML(text).replace(/\n/g, '<br />');
}

export function generateInteractiveHTML(
    quizData: QuizQuestion[],
    quizTitle: string,
    logo1Base64: string,
    logo2Base64: string,
    language: 'en' | 'ar' = 'en'
) {
    // Calculate total MCQs for scoring
    const mcqQuestions = quizData.filter((q) => q.type === 'MCQ');
    const totalMCQs = mcqQuestions.length;
    const dir = language === 'ar' ? 'rtl' : 'ltr';

    const vanillaJSCode = `
    document.addEventListener('DOMContentLoaded', () => {
      try {
        const quizContainer = document.getElementById('quiz-container');
        const quizData = JSON.parse(document.getElementById('quiz-data').textContent);
        const storageKey = 'quizState_${Date.now()}_' + document.title.replace(/\\s+/g, '_');
        let userState = JSON.parse(localStorage.getItem(storageKey)) || {};
        
        // Exam Mode State
        let examModeActive = false;
        let examStartTime = null;
        let timerInterval = null;

        const totalMCQs = ${totalMCQs};
        const finishBtn = document.getElementById('finish-quiz-btn');
        const resultsContainer = document.getElementById('results-container');
        const scoreDisplay = document.getElementById('score-display');
        const scoreDetails = document.getElementById('score-details');
        const resetBtn = document.getElementById('reset-quiz-btn');
        
        // Export Buttons
        const exportHtmlBtn = document.getElementById('export-html-btn');
        const exportCsvBtn = document.getElementById('export-csv-btn');

        const startExamBtn = document.getElementById('start-exam-btn');
        const timerDisplay = document.getElementById('timer-display');
        const examControls = document.getElementById('exam-controls');
        
        // Theme Toggle Logic
        const themeToggleBtn = document.getElementById('theme-toggle');
        const htmlElement = document.documentElement;
        const themeIcon = document.getElementById('theme-icon');

        // Check Saved Theme
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            htmlElement.classList.add('dark');
            if(themeIcon) updateIcon(true);
        } else {
            htmlElement.classList.remove('dark');
            if(themeIcon) updateIcon(false);
        }

        if(themeToggleBtn) {
            themeToggleBtn.addEventListener('click', () => {
                if (htmlElement.classList.contains('dark')) {
                    htmlElement.classList.remove('dark');
                    localStorage.setItem('theme', 'light');
                    updateIcon(false);
                } else {
                    htmlElement.classList.add('dark');
                    localStorage.setItem('theme', 'dark');
                    updateIcon(true);
                }
            });
        }

        function updateIcon(isDark) {
            if(!themeIcon) return;
            if(isDark) {
                themeIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />';
            } else {
                themeIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />';
            }
        }

        // --- EXAM MODE LOGIC ---
        if (startExamBtn) {
            startExamBtn.addEventListener('click', startExamMode);
        }

        function startExamMode() {
            if (confirm('هل أنت متأكد من بدء وضع الامتحان؟ سيتم مسح الإجابات الحالية وبدء العداد.')) {
                // Reset state
                userState = {};
                saveState();
                localStorage.removeItem(storageKey);
                
                examModeActive = true;
                examStartTime = Date.now();
                
                // UI Updates
                startExamBtn.classList.add('hidden');
                timerDisplay.classList.remove('hidden');
                resultsContainer.classList.add('hidden');
                if (finishBtn) finishBtn.classList.remove('hidden');
                if (finishBtn) finishBtn.textContent = 'إنهاء الامتحان وتصحيح الأوراق';
                
                // Clear container and Re-render
                quizContainer.innerHTML = '';
                renderQuiz();
                addListeners();
                
                // Start Timer
                clearInterval(timerInterval);
                timerInterval = setInterval(updateTimer, 1000);
            }
        }

        function updateTimer() {
            const diff = Math.floor((Date.now() - examStartTime) / 1000);
            const mins = Math.floor(diff / 60).toString().padStart(2, '0');
            const secs = (diff % 60).toString().padStart(2, '0');
            const timerVal = document.getElementById('timer-val');
            if(timerVal) timerVal.textContent = \`\${mins}:\${secs}\`;
        }

        function calculateAndShowResults() {
            let isExamFinish = examModeActive;
            
            // Stop everything first
            if (examModeActive) {
                clearInterval(timerInterval);
                examModeActive = false; // Disable mode so render shows results
                const timerVal = document.getElementById('timer-val');
                if(timerVal) timerVal.textContent += ' (انتهى)';
            }

            if (totalMCQs === 0 && !isExamFinish) {
                resultsContainer.classList.remove('hidden');
                scoreDisplay.textContent = 'N/A';
                scoreDetails.textContent = 'لا توجد أسئلة اختيار من متعدد لحساب النتيجة.';
                if (finishBtn) finishBtn.classList.add('hidden');
                resultsContainer.scrollIntoView({ behavior: 'smooth' });
                return;
            }

            // Re-render to show answers if we were in exam mode
            if (isExamFinish) {
                quizContainer.innerHTML = '';
                renderQuiz();
                addListeners(); // Re-add listeners (though they might be disabled visually)
            }

            let correctAnswers = 0;
            quizData.forEach((q, index) => {
            if (q.type === 'MCQ') {
                const questionState = userState[index];
                if (questionState && questionState.selected === q.correctAnswer) {
                correctAnswers++;
                }
            }
            });

            const percentage = Math.round((correctAnswers / totalMCQs) * 100);
            scoreDisplay.textContent = \`\${percentage}%\`;
            
            let detailsText = \`لقد أجبت بشكل صحيح على \${correctAnswers} من \${totalMCQs} أسئلة.\`;
            if (isExamFinish && examStartTime) {
                const diff = Math.floor((Date.now() - examStartTime) / 1000);
                const mins = Math.floor(diff / 60);
                const secs = diff % 60;
                detailsText += \` الوقت المستغرق: \${mins} دقيقة و \${secs} ثانية.\`;
            }
            
            scoreDetails.textContent = detailsText;
            
            resultsContainer.classList.remove('hidden');
            if (finishBtn) finishBtn.classList.add('hidden');
            resultsContainer.scrollIntoView({ behavior: 'smooth' });
        }

        // --- EXPORT FUNCTIONS ---
        
        // 1. Export Full Exam Report (HTML)
        if (exportHtmlBtn) {
            exportHtmlBtn.addEventListener('click', () => {
            let correctAnswers = 0;
            quizData.forEach((q, index) => {
                if (q.type === 'MCQ') {
                const questionState = userState[index];
                if (questionState && questionState.selected === q.correctAnswer) correctAnswers++;
                }
            });
            const percentage = totalMCQs > 0 ? Math.round((correctAnswers / totalMCQs) * 100) : 0;
            
            let reportContent = \`
            <html>
            <head>
                <meta charset="UTF-8">
                <title>تقرير الامتحان: ${escapeHTML(quizTitle)}</title>
                <style>
                    body { font-family: sans-serif; padding: 20px; direction: rtl; }
                    .header { text-align: center; border-bottom: 2px solid #ddd; padding-bottom: 20px; margin-bottom: 20px; }
                    .score { font-size: 2em; color: \${percentage >= 50 ? 'green' : 'red'}; font-weight: bold; }
                    .question-block { border: 1px solid #eee; padding: 15px; margin-bottom: 15px; border-radius: 8px; background: #fff; }
                    .q-title { font-weight: bold; margin-bottom: 10px; color: #333; }
                    .option { padding: 5px 10px; margin: 3px 0; border-radius: 4px; }
                    .correct-ans { background-color: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; font-weight: bold; } /* Green */
                    .user-wrong { background-color: #fee2e2; color: #991b1b; border: 1px solid #fecaca; text-decoration: line-through; } /* Red */
                    .explanation { margin-top: 10px; padding: 10px; background: #f8fafc; border-right: 4px solid #3b82f6; font-size: 0.9em; color: #555; }

                    /* Matching Game Styles */
                    .matching-container { display: flex; gap: 20px; justify-content: space-between; margin-bottom: 20px; }
                    .match-column { display: flex; flex-direction: column; gap: 10px; flex: 1; }
                    .match-item { 
                        padding: 15px; border: 2px solid #e5e7eb; border-radius: 12px; 
                        background: white; cursor: pointer; transition: all 0.2s; 
                        text-align: center; font-weight: 500; user-select: none;
                    }
                    .match-item:hover { border-color: #3b82f6; background: #eff6ff; }
                    .match-item.selected { border-color: #2563eb; background: #dbeafe; ring: 2px #2563eb; }
                    .match-item.matched { 
                        border-color: #86efac; background: #f0fdf4; color: #15803d; 
                        opacity: 0.5; pointer-events: none; transform: scale(0.98); 
                    }
                    .match-item.error { border-color: #fca5a5; background: #fef2f2; animation: shake 0.5s; }
                    
                    @keyframes shake {
                        0%, 100% { transform: translateX(0); }
                        25% { transform: translateX(-5px); }
                        75% { transform: translateX(5px); }
                    }
                    .match-explanation {
                        margin-top: 10px; padding: 10px; background-color: #f0fdf4; border: 1px solid #bbf7d0; 
                        color: #166534; border-radius: 8px; font-size: 0.9rem; animation: fadeIn 0.5s;
                    }
                    @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>تقرير نتيجة الامتحان</h1>
                    <h2>${escapeHTML(quizTitle)}</h2>
                    <div class="score">النتيجة: \${percentage}%</div>
                    <p>الإجابات الصحيحة: \${correctAnswers} من \${totalMCQs}</p>
                    <p>تاريخ التقرير: \${new Date().toLocaleString()}</p>
                </div>
            \`;
            
            quizData.forEach((q, index) => {
                const uState = userState[index] || {};
                const userSelected = uState.selected;
                
                reportContent += \`<div class="question-block"><div class="q-title">س\${q.number}: \${formatText(q.question)}</div>\`;
                
                if (q.type === 'MCQ') {
                    reportContent += '<ul>';
                    q.options.forEach(opt => {
                        const letter = opt.substring(0, 1);
                        const text = opt.substring(opt.indexOf(' ') + 1);
                        let className = 'option';
                        let suffix = '';
                        
                        if (letter === q.correctAnswer) {
                            className += ' correct-ans';
                            suffix = ' (الإجابة الصحيحة)';
                        } else if (letter === userSelected) {
                            className += ' user-wrong';
                            suffix = ' (إجابتك)';
                        } else {
                            // Just regular option
                            className += ' text-gray-700';
                        }
                        
                        // Mark user selection even if correct
                        if (letter === userSelected && letter === q.correctAnswer) {
                            suffix = ' (إجابتك ✔)';
                        }

                        reportContent += \`<li class="\${className}">\${letter}. \${formatText(text)} \${suffix}</li>\`;
                    });
                    reportContent += '</ul>';
                    
                    // Add explanations
                    if (q.explanations) {
                        reportContent += \`<div class="explanation"><strong>الشرح:</strong><br/>\`;
                        Object.keys(q.explanations).forEach(key => {
                            const expl = q.explanations[key];
                            const isCorr = key === q.correctAnswer;
                            const color = isCorr ? 'green' : 'red';
                            reportContent += \`<span style="color:\${color}">(\${key})</span> \${formatText(expl)}<br/>\`;
                        });
                        reportContent += \`</div>\`;
                    }
                } else {
                    reportContent += \`<div class="explanation"><strong>الإجابة النموذجية:</strong><br/>\${formatText(q.answer)}</div>\`;
                }
                reportContent += \`</div>\`;
            });
            
            reportContent += \`</body></html>\`;
            
            const blob = new Blob([reportContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'exam_report_\${new Date().getTime()}.html';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            });
        }

        // 2. Export Mistakes (CSV) for Anki - UPDATED HTML FORMAT & TAGS
        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', () => {
            let csvContent = '\uFEFF'; // BOM for Excel UTF-8
            // Header for Anki (Front, Back, Tags)
            csvContent += '"Front","Back","Tags"\\n';
            
            let exportCount = 0;

            quizData.forEach((q, index) => {
                const uState = userState[index] || {};
                const isWrong = q.type === 'MCQ' && uState.selected !== q.correctAnswer;
                const isStarred = uState.starred;

                // Export if Wrong OR Starred (OR Written Question if always exporting useful cards)
                // For Written: Export if Starred? Or generally? 
                // Let's stick to: Export if Starred, OR if it's MCQ and Wrong.
                // Actually, user might want to study Written questions in Anki. Let's export Written questions ALWAYS? Or only if Starred?
                // Default rule: MCQ Wrong or Any Starred.
                
                if (isWrong || isStarred) {
                    
                    if (q.type === 'Written' && q.subQuestions && q.subQuestions.length > 0) {
                        // --- BRANCHING WRITTEN: Flatten ---
                        q.subQuestions.forEach((sq, sqIdx) => {
                             exportCount++;
                             
                             // Front: Main Q + Sub Part
                             let frontHtml = \`<strong>Q\${q.number} (Part \${sqIdx+1}): \${escapeHTML(q.question)}</strong><br><br><em>\${escapeHTML(sq.question)}</em>\`;
                             
                             // Back: Answer
                             let backHtml = \`<div style='color:black;'>\${escapeHTML(sq.answer)}</div>\`;
                             if (q.topicSummary) backHtml += \`<br><strong>Summary:</strong> \${escapeHTML(q.topicSummary)}\`;
                             if (q.lesson) backHtml += \`<br><strong>Lesson:</strong> \${escapeHTML(q.lesson)}\`;
                             
                             const tagsStr = (isStarred ? 'marked ' : '') + 'written_part';
                             const safeFront = '"' + frontHtml.replace(/"/g, '""') + '"';
                             const safeBack = '"' + backHtml.replace(/"/g, '""') + '"';
                             const safeTags = '"' + tagsStr.trim() + '"';
                             
                             csvContent += \`\${safeFront},\${safeBack},\${safeTags}\\n\`;
                        });
                        
                    } else {
                        // Standard MCQ or Single Written
                        exportCount++;
                        
                        // --- Construct FRONT Card ---
                        let frontHtml = '';
                        if (q.type === 'MCQ') {
                            frontHtml = \`<strong>Q\${q.number}: \${escapeHTML(q.question)}</strong><br><br><ul>\`;
                            q.options.forEach(opt => {
                                frontHtml += \`<li>\${escapeHTML(opt)}</li>\`;
                            });
                            frontHtml += \`</ul>\`;
                        } else {
                            // Written Single
                            frontHtml = \`<strong>Q\${q.number}: \${escapeHTML(q.question)}</strong>\`;
                        }
    
                        // --- Construct BACK Card ---
                        let backHtml = '';
                        if (q.type === 'MCQ') {
                            const correctOptText = q.options.find(o => o.startsWith(q.correctAnswer)) || q.correctAnswer;
                            let correctExplanation = '';
                            if (q.explanations && q.explanations[q.correctAnswer]) {
                                correctExplanation = q.explanations[q.correctAnswer];
                            } else if (q.explanations) {
                                Object.keys(q.explanations).forEach(k => { correctExplanation += \`(\${k}): \${q.explanations[k]} \`; });
                            }
                            backHtml = \`<div style='color:green; font-weight:bold;'>Correct: \${escapeHTML(correctOptText)}</div><br>\`;
                            if (correctExplanation) backHtml += \`<em>Why?</em> \${escapeHTML(correctExplanation)}<br>\`;
                        } else {
                            // Written Back
                             backHtml = \`<div style='color:black;'>\${escapeHTML(q.answer)}</div>\`;
                        }
                        
                        if (q.topicSummary) backHtml += \`<br><strong>Summary:</strong> \${escapeHTML(q.topicSummary)}\`;
                        if (q.lesson) backHtml += \`<br><strong>Lesson:</strong> \${escapeHTML(q.lesson)}\`;
    
                        // --- Tags ---
                        const tags = [];
                        if (isWrong) tags.push('mistake');
                        if (isStarred) tags.push('marked');
                        if (q.type === 'Written') tags.push('written');
                        const tagsStr = tags.join(' ');
    
                        const safeFront = '"' + frontHtml.replace(/"/g, '""') + '"';
                        const safeBack = '"' + backHtml.replace(/"/g, '""') + '"';
                        const safeTags = '"' + tagsStr + '"';
    
                        csvContent += \`\${safeFront},\${safeBack},\${safeTags}\\n\`;
                    }
                }
            });
            
            if (exportCount === 0) {
                alert('لا توجد أسئلة مميزة بنجمة أو أخطاء لتصديرها.');
                return;
            }
            
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'anki_cards_\${new Date().getTime()}.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            });
        }


        function resetQuiz() {
            if(confirm('هل تريد حقاً إعادة الاختبار؟')) {
                userState = {};
                saveState();
                localStorage.removeItem(storageKey);
                location.reload();
            }
        }

        function saveState() {
            localStorage.setItem(storageKey, JSON.stringify(userState));
        }

        function escapeHTML(str) {
            if (!str) return '';
            return str.split(/(<math[\\s\\S]*?<\\/math>)/gi).map(function(part) {
                if (part.toLowerCase().startsWith('<math')) {
                    return part;
                }
                return part.replace(/[&<>"']/g, function(match) {
                     return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match];
                });
            }).join('');
        }
        
        function formatText(text) {
            if (!text) return '';
            let formatted = escapeHTML(text);
            
            // Quadruple escape for TS String -> HTML String -> JS String -> RegExp
            
            // Bold: **text** -> new RegExp('\\*\\*(.*?)\\*\\*', 'g') in JS -> needs \\\\* in TS
            var boldRegex = new RegExp('\\\\*\\\\*(.*?)\\\\*\\\\*', 'g');
            formatted = formatted.replace(boldRegex, '<b>$1</b>');
            
            // Italic: *text* -> new RegExp('\\*([^*]+)\\*', 'g')
            var italicRegex = new RegExp('\\\\*([^*]+)\\\\*', 'g');
            formatted = formatted.replace(italicRegex, '<i>$1</i>');

            var nlRegex = new RegExp('\\\\n', 'g');
            return formatted.replace(nlRegex, '<br />'); 
        }

        function handleStarClick(e, index) {
            e.stopPropagation(); // Prevent card click
            const btn = e.currentTarget;
            const isStarred = btn.classList.contains('text-yellow-400');
            
            // Toggle UI
            if (isStarred) {
                btn.classList.remove('text-yellow-400', 'fill-yellow-400');
                btn.classList.add('text-gray-300', 'dark:text-gray-600');
                if(!userState[index]) userState[index] = {};
                userState[index].starred = false;
            } else {
                btn.classList.remove('text-gray-300', 'dark:text-gray-600');
                btn.classList.add('text-yellow-400', 'fill-yellow-400');
                if(!userState[index]) userState[index] = {};
                userState[index].starred = true;
            }
            saveState();
        }

        function handleOptionClick(e, question, index) {
            // If not exam mode and already answered, do nothing
            if (!examModeActive && userState[index] && userState[index].selected) return;

            const selectedOption = e.currentTarget;
            const selectedLetter = selectedOption.dataset.letter;

            // Save state (preserve starred)
            if(!userState[index]) userState[index] = {};
            userState[index].selected = selectedLetter;
            saveState();
            
            const questionCard = selectedOption.closest('.question-card');
            const optionWrappers = questionCard.querySelectorAll('.option');

            // Logic split based on mode
            if (examModeActive) {
                // EXAM MODE: Just highlight selection, deselect others, no right/wrong
                optionWrappers.forEach(optWrapper => {
                    const letter = optWrapper.dataset.letter;
                    const innerDiv = optWrapper.querySelector('div:first-child');
                    
                    // Reset styling first
                    innerDiv.classList.remove('option-exam-selected', 'bg-blue-100', 'border-blue-500', 'dark:bg-blue-900', 'dark:border-blue-400');
                    innerDiv.classList.add('option-neutral', 'bg-white', 'dark:bg-gray-800', 'border-gray-300', 'dark:border-gray-600');
                    
                    if (letter === selectedLetter) {
                        innerDiv.classList.remove('option-neutral', 'bg-white', 'dark:bg-gray-800', 'border-gray-300', 'dark:border-gray-600');
                        innerDiv.classList.add('option-exam-selected'); // We will define this class in CSS
                    }
                });
                // Do NOT show explanation container
            } else {
                // PRACTICE MODE (Immediate Feedback)
                const explanationContainer = questionCard.querySelector('.explanations-container');
                if (explanationContainer) explanationContainer.classList.remove('hidden');

                optionWrappers.forEach(optWrapper => {
                    const letter = optWrapper.dataset.letter;
                    const innerDiv = optWrapper.querySelector('div:first-child');
                    
                    optWrapper.classList.add('disabled');
                    innerDiv.classList.remove('cursor-pointer', 'hover:bg-blue-50', 'dark:hover:bg-gray-700', 'hover:border-blue-400');
                    
                    const isCorrect = (letter === question.correctAnswer);
                    const isSelected = (letter === selectedLetter);
                    const iconWrapper = innerDiv.querySelector('div:first-child');

                    if (isCorrect) {
                        innerDiv.classList.add('option-correct');
                        innerDiv.classList.remove('border-gray-300', 'dark:border-gray-600', 'bg-white', 'dark:bg-gray-800');
                        if (iconWrapper) {
                            iconWrapper.innerHTML = \`<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>\`;
                            iconWrapper.className = 'flex-shrink-0 w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-green-700 dark:bg-green-900 dark:text-green-300';
                        }
                    } else if (isSelected) {
                        innerDiv.classList.add('option-incorrect');
                        innerDiv.classList.remove('border-gray-300', 'dark:border-gray-600', 'bg-white', 'dark:bg-gray-800');
                        if (iconWrapper) {
                            iconWrapper.innerHTML = \`<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>\`;
                            iconWrapper.className = 'flex-shrink-0 w-6 h-6 rounded-full bg-red-100 flex items-center justify-center text-red-700 dark:bg-red-900 dark:text-red-300';
                        }
                    } else {
                        innerDiv.classList.add('option-neutral');
                        optWrapper.classList.add('opacity-50');
                    }
                });
            }
        }

        function handleShowAnswer(e, index) {
            const button = e.currentTarget;
            const subIndex = button.dataset.subindex;
            
            if (subIndex !== undefined) {
                 // Sub-question handling
                 const key = \`\${index}_sub_\${subIndex}\`;
                 if (!userState[key]) userState[key] = {};
                 userState[key].revealed = true;
            } else {
                // Main question handling
                if (!userState[index]) userState[index] = {};
                userState[index].revealed = true;
            }
            saveState();
            
            const answerContainer = button.nextElementSibling;
            // Loop incase intermediate elements exist, but structure checks out
            // Actually in sub-question structure: button -> (exam msg?) -> answer-container. 
            // Safer to look for next .answer-container
            const container = button.parentElement.querySelector('.answer-container');
            if(container) container.classList.remove('hidden');
            
            button.classList.add('hidden');
        }

        function renderQuiz() {
            if(!quizContainer) return;
            quizData.forEach((q, index) => {
            const questionState = userState[index] || {};
            const card = document.createElement('div');
            card.className = 'question-card bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-6 border border-transparent dark:border-gray-700 transition-colors duration-300 relative group';

            // --- Star Button ---
            const isStarred = questionState.starred;
            const starClass = isStarred ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 dark:text-gray-600 hover:text-yellow-400';
            
            const starBtn = \`
                <button class="star-btn absolute top-6 right-6 p-2 transition-colors duration-200 \${starClass}" data-index="\${index}" title="Mark for Review">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 01-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                </button>
            \`;

            let content = starBtn + \`
                <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1 pr-10">Question \${q.number}</h3>
                <p class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">(\${q.type})</p>
                <div class="question-text text-gray-900 dark:text-gray-200 text-base leading-relaxed mb-4 whitespace-pre-wrap">\${formatText(q.question)}</div>
            \`;

            if (q.type === 'MCQ') {
                const { selected: selectedLetter } = questionState;
                content += \`<div class="options-container space-y-3 mb-4">\`;
                q.options.forEach(opt => {
                const letter = opt.substring(0, 1);
                const optionText = opt.substring(opt.indexOf(' ') + 1);
                
                let classes = 'option-inner p-4 border border-gray-300 dark:border-gray-600 rounded-lg flex items-center space-x-3 transition duration-150 bg-white dark:bg-gray-800 dark:text-gray-200';
                let icon = \`<div class="flex-shrink-0 w-6 h-6 rounded-full border-2 border-gray-400 dark:border-gray-500 flex items-center justify-center font-semibold text-gray-600 dark:text-gray-300">\${letter}</div>\`;
                
                if (selectedLetter && !examModeActive) {
                    // --- RENDER RESULT STATE (Standard Mode or Finished Exam) ---
                    const isCorrect = (letter === q.correctAnswer);
                    const isSelected = (letter === selectedLetter);
                    
                    if (isCorrect) {
                    classes += ' option-correct border-green-500 dark:border-green-500';
                    icon = \`<div class="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-green-700 dark:bg-green-900 dark:text-green-300"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg></div>\`;
                    } else if (isSelected) {
                    classes += ' option-incorrect border-red-500 dark:border-red-500';
                    icon = \`<div class="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 flex items-center justify-center text-red-700 dark:bg-red-900 dark:text-red-300"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg></div>\`;
                    } else {
                    classes += ' option-neutral opacity-50';
                    }
                } else if (selectedLetter && examModeActive) {
                    // --- RENDER EXAM ACTIVE STATE ---
                    // No red/green, just highlight the selected one
                    if (letter === selectedLetter) {
                        classes += ' option-exam-selected';
                    } else {
                        classes += ' option-neutral'; 
                    }
                } else {
                    // --- DEFAULT STATE ---
                    classes += ' cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700 hover:border-blue-400 dark:hover:border-blue-400';
                }
                
                let wrapperClass = 'option';
                // Disable clicking if answered and NOT in exam mode (In exam mode, we can change answers, so we keep clickable)
                // Actually, if we want to change answers in exam mode, we shouldn't add 'disabled' class if examModeActive is true
                if (selectedLetter && !examModeActive) wrapperClass += ' disabled';

                content += \`<div class="\${wrapperClass}" data-letter="\${letter}" data-index="\${index}"><div class="\${classes}">\${icon}<span class="flex-1">\${formatText(optionText)}</span></div></div>\`;
                });
                content += \`</div>\`;
                
                // Explanations: Hidden if Exam Mode is active or if no selection made
                let explanationClasses = 'explanations-container space-y-3 mt-4 border-t border-gray-200 dark:border-gray-700 pt-4';
                if (!selectedLetter || examModeActive) explanationClasses += ' hidden';
                
                content += \`<div class="\${explanationClasses}">\`;
                q.options.forEach(opt => {
                const letter = opt.substring(0, 1);
                if (q.explanations[letter]) {
                    const isCorrect = (letter === q.correctAnswer);
                    const explanationBorder = isCorrect ? 'border-l-4 border-green-500' : 'border-l-4 border-red-500';
                    content += \`<div class="explanation-item p-3 bg-gray-50 dark:bg-gray-700 rounded-lg \${explanationBorder}"><strong class="text-sm font-semibold text-gray-800 dark:text-gray-200">Explanation for \${letter}:</strong><p class="text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">\${formatText(q.explanations[letter])}</p></div>\`;
                }
                });
                content += \`</div>\`;
                
            } else if (q.type === 'Written' || q.type === 'Complete') {
                const { revealed } = questionState;
                const hasSubQuestions = q.subQuestions && q.subQuestions.length > 0;
                
                // Hide Show Answer button if Exam Mode Active
                const btnClass = (revealed || examModeActive) ? 'hidden' : '';

                if (hasSubQuestions) {
                     content += \`<div class="space-y-6">\`;
                     q.subQuestions.forEach((sq, idx) => {
                         if (!sq) return;
                         const subKey = \`\${index}_sub_\${idx}\`;
                         const subState = userState[subKey] || {};
                         const isSubRevealed = subState.revealed;
                         const subBtnClass = (isSubRevealed || examModeActive) ? 'hidden' : '';

                         content += \`<div class="sub-question-block bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-100 dark:border-gray-700">\`;
                         content += \`<h5 class="font-bold text-gray-700 dark:text-gray-200 mb-2">Part \${idx + 1}: \${formatText(sq.question)}</h5>\`;
                         
                         content += \`<button class="show-answer-btn px-3 py-1 bg-blue-600 text-white text-sm font-semibold rounded hover:bg-blue-700 \${subBtnClass}" data-index="\${index}" data-subindex="\${idx}">Show Answer</button>\`;
                         
                         if (examModeActive) {
                            content += \`<div class="mt-2 text-xs text-yellow-600 dark:text-yellow-400">Answer hidden in Exam Mode</div>\`;
                         }

                         content += \`<div class="answer-container mt-3 \${isSubRevealed ? '' : 'hidden'}"><div class="p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-gray-800 dark:text-gray-200 whitespace-pre-wrap">\${formatText(sq.answer)}</div></div>\`;
                         content += \`</div>\`;
                     });
                     content += \`</div>\`;

                } else {
                    // Standard Written
                    content += \`<button class="show-answer-btn px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 \${btnClass}" data-index="\${index}">Show Answer</button>\`;
                    
                    if (examModeActive) {
                        content += \`<div class="p-4 bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg text-sm text-yellow-800 dark:text-yellow-200">يتم إخفاء الإجابة النموذجية في وضع الامتحان.</div>\`;
                    }
                    
                    content += \`<div class="answer-container \${revealed ? '' : 'hidden'}"><h4 class="text-md font-semibold text-gray-800 dark:text-gray-200 mb-2">Full Answer</h4><div class="p-4 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg whitespace-pre-wrap text-gray-800 dark:text-gray-200">\${formatText(q.answer || q.correctAnswer)}</div>\`;
                    
                    // Add Explanation if exists
                    if (q.explanations && (q.explanations['General'] || q.explanations['Correct'])) {
                        const expl = q.explanations['General'] || q.explanations['Correct'];
                        content += \`<div class="mt-4 p-4 bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-500 rounded"><h5 class="text-sm font-bold text-blue-700 dark:text-blue-300 uppercase mb-1">Explanation</h5><p class="text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap">\${formatText(expl)}</p></div>\`;
}
                    content += \`</div>\`;
                }
            } else if (q.type === 'Matching') {
                content += \`<div id="match-game-\${index}" class="matching-game-wrapper">\`;
                
                // Shuffle logic for right column (only initially)
                const rightItems = q.matches.map((m, i) => ({ text: m.right, originalIndex: i }));
                // Fischer-Yates Shuffle
                for (let i = rightItems.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [rightItems[i], rightItems[j]] = [rightItems[j], rightItems[i]];
                }

                content += \`<div class="matching-container flex flex-row gap-4 justify-between select-none">\`;
                
                // Left Column
                content += \`<div class="match-column w-1/2 flex flex-col gap-3">\`;
                q.matches.forEach((m, i) => {
                     content += \`<button class="match-item match-left w-full p-4 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 hover:border-blue-400 dark:hover:border-blue-500 transition-all text-gray-800 dark:text-gray-200 font-medium shadow-sm" data-index="\${index}" data-side="left" data-id="\${i}">\${formatText(m.left)}</button>\`;
                });
                content += \`</div>\`;

                // Right Column
                content += \`<div class="match-column w-1/2 flex flex-col gap-3">\`;
                rightItems.forEach((item) => {
                     content += \`<button class="match-item match-right w-full p-4 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 hover:border-blue-400 dark:hover:border-blue-500 transition-all text-gray-800 dark:text-gray-200 font-medium shadow-sm" data-index="\${index}" data-side="right" data-id="\${item.originalIndex}">\${formatText(item.text)}</button>\`;
                });
                content += \`</div>\`;
                
                content += \`</div>\`; // End matching-container
                
                // Container for per-match explanations
                content += \`<div id="match-explanations-\${index}" class="space-y-2 mt-4"></div>\`;
                
                content += \`</div>\`;
            }


content += \`<div class="mt-6 border-t border-dashed border-gray-300 dark:border-gray-600 pt-4 space-y-4"><div><h5 class="font-semibold text-gray-700 dark:text-gray-300">Topic Summary</h5><p class="text-gray-600 dark:text-gray-400 text-sm mt-1 whitespace-pre-wrap">\${formatText(q.topicSummary)}</p></div><div><h5 class="font-semibold text-gray-700 dark:text-gray-300">Lesson</h5><p class="text-gray-600 dark:text-gray-400 text-sm mt-1 whitespace-pre-wrap">\${formatText(q.lesson)}</p></div></div>\`;
            card.innerHTML = content;
            quizContainer.appendChild(card);
            });
        }

        function addListeners() {
            document.querySelectorAll('.option').forEach(opt => {
            const index = parseInt(opt.dataset.index, 10);
            const question = quizData[index];
            opt.addEventListener('click', (e) => handleOptionClick(e, question, index));
            });
            document.querySelectorAll('.show-answer-btn').forEach(btn => {
            const index = parseInt(btn.dataset.index, 10);
            btn.addEventListener('click', (e) => handleShowAnswer(e, index));
            });
            document.querySelectorAll('.star-btn').forEach(btn => {
                const index = parseInt(btn.dataset.index, 10);
                btn.addEventListener('click', (e) => handleStarClick(e, index));
            });
            
            // Matching Listeners
            document.querySelectorAll('.match-item').forEach(btn => {
                btn.addEventListener('click', handleMatchItemClick);
            });
        }

        // --- RANDOMIZATION LOGIC ---

        const shuffleQuestionsBtn = document.getElementById('shuffle-questions-btn');
        const shuffleOptionsBtn = document.getElementById('shuffle-options-btn');
        const renumberCheckbox = document.getElementById('renumber-checkbox');

        if (shuffleQuestionsBtn) {
            shuffleQuestionsBtn.addEventListener('click', () => {
                if(confirm('هل أنت متأكد من إعادة ترتيب الأسئلة؟ سيتم مسح الإجابات الحالية.')) {
                     // 1. Shuffle quizData
                     for (let i = quizData.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [quizData[i], quizData[j]] = [quizData[j], quizData[i]];
                     }
                     
                     // 2. Handle Renumbering
                     const shouldRenumber = renumberCheckbox ? renumberCheckbox.checked : true;
                     if (shouldRenumber) {
                         quizData.forEach((q, idx) => {
                             q.number = idx + 1;
                         });
                     } else {
                         // Restore original numbers if we stored them? 
                         // Actually, random split usually implies re-numbering. 
                         // If user unchecks "Renumber", we show original numbers likely (e.g. Q5, Q2, Q10).
                         // We rely on the q.number property already in the object. 
                         // But wait, if we re-numbered previously, we lost the original number.
                         // We should restore from original index or store "originalNumber" on load.
                     }

                     // Reset State
                     userState = {};
                     saveState();
                     localStorage.removeItem(storageKey);
                     
                     // Re-render
                     quizContainer.innerHTML = '';
                     renderQuiz();
                     addListeners();
                }
            });
        }

        if (shuffleOptionsBtn) {
            shuffleOptionsBtn.addEventListener('click', () => {
                if(confirm('هل تريد خلط الاختيارات لجميع الأسئلة؟ سيتم مسح الإجابات الحالية.')) {
                    // Iterate and shuffle options
                    quizData.forEach(q => {
                        if (q.type === 'MCQ') {
                            // 1. Extract current correct text (or ID) to find it later
                            // q.correctAnswer is just "A", "B"... need the text.
                            const correctOptionLine = q.options.find(o => o.startsWith(q.correctAnswer + '.'));
                            const correctText = correctOptionLine ? correctOptionLine.substring(correctOptionLine.indexOf(' ') + 1) : '';

                            // 2. Extract Option Objects { text, explanationKey }
                            // We need to map explanations too (A -> explA).
                            // Complex: Explanations are keyed by A, B, C...
                            // Let's build a rich object list.
                            let richOptions = q.options.map(opt => {
                                const letter = opt.substring(0, 1); // "A"
                                const text = opt.substring(opt.indexOf(' ') + 1);
                                const expl = q.explanations ? q.explanations[letter] : null;
                                return { letter, text, expl, isCorrect: (letter === q.correctAnswer) };
                            });

                            // 3. Shuffle
                            for (let i = richOptions.length - 1; i > 0; i--) {
                                const j = Math.floor(Math.random() * (i + 1));
                                [richOptions[i], richOptions[j]] = [richOptions[j], richOptions[i]];
                            }

                            // 4. Re-assign Letters (A, B, C...)
                            const letters = ['A', 'B', 'C', 'D', 'E'].slice(0, richOptions.length);
                            const newOptions = [];
                            const newExplanations = {};
                            let newCorrectAnswer = '';

                            richOptions.forEach((item, idx) => {
                                const newLetter = letters[idx];
                                newOptions.push(newLetter + '. ' + item.text);
                                if (item.expl) newExplanations[newLetter] = item.expl;
                                if (item.isCorrect) newCorrectAnswer = newLetter;
                            });

                            // 5. Apply back to q
                            q.options = newOptions;
                            q.correctAnswer = newCorrectAnswer;
                            // Restore General/Correct explanations if they existed loosely
                            if (q.explanations && q.explanations['General']) newExplanations['General'] = q.explanations['General'];
                            if (q.explanations && q.explanations['Correct']) newExplanations['Correct'] = q.explanations['Correct'];
                            q.explanations = newExplanations;
                        }
                    });

                    // Reset State
                    userState = {};
                    saveState();
                    localStorage.removeItem(storageKey);

                    // Re-render
                    quizContainer.innerHTML = '';
                    renderQuiz();
                    addListeners();
                }
            });
        }

        // --- MATCHING GAME LOGIC ---
        let matchState = {
            selectedLeft: null, // { element, id }
            selectedRight: null // { element, id }
        };

        function handleMatchItemClick(e) {
            if (examModeActive) return; // Disable interaction in exam mode? Or allow solving? Let's allow solving but maybe not showing explanations?
            
            const btn = e.currentTarget;
            if (btn.classList.contains('matched')) return;

            const index = btn.dataset.index;
            const side = btn.dataset.side;
            const id = btn.dataset.id; // original index (0, 1, 2...)

            // Deselect if clicking same button
            if (btn.classList.contains('selected')) {
                btn.classList.remove('selected', 'border-blue-600', 'bg-blue-50', 'dark:bg-blue-900', 'ring-2', 'ring-blue-500');
                if (side === 'left') matchState.selectedLeft = null;
                else matchState.selectedRight = null;
                return;
            }

            // Select
            // Clear previous selection on SAME side
            if (side === 'left') {
                if (matchState.selectedLeft) {
                     matchState.selectedLeft.element.classList.remove('selected', 'border-blue-600', 'bg-blue-50', 'dark:bg-blue-900', 'ring-2', 'ring-blue-500');
                }
                matchState.selectedLeft = { element: btn, id: id };
            } else {
                 if (matchState.selectedRight) {
                     matchState.selectedRight.element.classList.remove('selected', 'border-blue-600', 'bg-blue-50', 'dark:bg-blue-900', 'ring-2', 'ring-blue-500');
                }
                matchState.selectedRight = { element: btn, id: id };
            }

            btn.classList.add('selected', 'border-blue-600', 'bg-blue-50', 'dark:bg-blue-900', 'ring-2', 'ring-blue-500');

            // Check Match
            if (matchState.selectedLeft && matchState.selectedRight) {
                const left = matchState.selectedLeft;
                const right = matchState.selectedRight;

                if (left.id === right.id) {
                    // CORRECT MATCH
                    left.element.classList.remove('selected', 'border-blue-600', 'bg-blue-50', 'dark:bg-blue-900', 'ring-2', 'ring-blue-500');
                    right.element.classList.remove('selected', 'border-blue-600', 'bg-blue-50', 'dark:bg-blue-900', 'ring-2', 'ring-blue-500');
                    
                    left.element.classList.add('matched', 'border-green-500', 'bg-green-50', 'dark:bg-green-900', 'text-green-700', 'dark:text-green-300', 'opacity-50', 'scale-95');
                    right.element.classList.add('matched', 'border-green-500', 'bg-green-50', 'dark:bg-green-900', 'text-green-700', 'dark:text-green-300', 'opacity-50', 'scale-95');
                    
                    // Show Explanation
                    const question = quizData[index];
                    const matchData = question.matches[left.id];
                    if (matchData.explanation) {
                        const explDiv = document.getElementById(\`match-explanations-\${index}\`);
                        if (explDiv) {
                            const p = document.createElement('div');
                            p.className = 'match-explanation p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-800 dark:text-green-200 animate-fade-in-down';
                            p.innerHTML = \`<strong>\${formatText(matchData.left)} = \${formatText(matchData.right)}</strong>: \${formatText(matchData.explanation)}\`;
                            explDiv.appendChild(p);
                        }
                    }

                    // Reset State
                    matchState.selectedLeft = null;
                    matchState.selectedRight = null;

                } else {
                    // INCORRECT MATCH
                    // 1. Remove "Selected" Blue Styling immediately so Red Error is visible
                    left.element.classList.remove('bg-blue-50', 'dark:bg-blue-900', 'border-blue-600', 'ring-2', 'ring-blue-500');
                    right.element.classList.remove('bg-blue-50', 'dark:bg-blue-900', 'border-blue-600', 'ring-2', 'ring-blue-500');

                    // 2. Add "Error" Red Styling
                    left.element.classList.add('error', 'border-red-500', 'bg-red-50', 'dark:bg-red-900', 'animate-shake');
                    right.element.classList.add('error', 'border-red-500', 'bg-red-50', 'dark:bg-red-900', 'animate-shake');
                    
                    setTimeout(() => {
                        // 3. Cleanup: Remove Error styling & reset logic
                        left.element.classList.remove('error', 'border-red-500', 'bg-red-50', 'dark:bg-red-900', 'animate-shake', 'selected');
                        right.element.classList.remove('error', 'border-red-500', 'bg-red-50', 'dark:bg-red-900', 'animate-shake', 'selected');
                        
                        matchState.selectedLeft = null;
                        matchState.selectedRight = null;
                    }, 1500);
                }
            }
        }

        // Store original numbers on load so we can restore if "renumber" is unchecked
        quizData.forEach((q, idx) => {
            if (!q.originalNumber) q.originalNumber = q.number;
        });

        // Hook up simple checkbox listener to trigger re-render if order didn't change? 
        // No, renumbering usually happens ON shuffle. 
        // But user might want to toggle visualization standard or original. 
        // Let's standardise: The check box controls the shuffle behavior.
        
        renderQuiz();
        addListeners();
        if (finishBtn) finishBtn.addEventListener('click', calculateAndShowResults);
        if (resetBtn) resetBtn.addEventListener('click', resetQuiz);
      } catch (e) {
        console.error("Quiz Error:", e);
        document.body.innerHTML = '<div style="color:red; text-align:center; padding:20px;">حدث خطأ أثناء تحميل الكويز. يرجى التأكد من الملف والمحاولة مرة أخرى.<br><br>Error: ' + e.message + '</div>';
      }
    });
  `;

    return `
<!DOCTYPE html>
<html lang="${language}" dir="${dir}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHTML(quizTitle)} - Interactive Quiz</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
          darkMode: 'class',
        }
    </script>
    <script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>
    <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
    <style>
        body { font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
        .question-text { white-space: pre-wrap; }
        
        /* Light Mode Specifics Override */
        .option-correct { border-color: #10B981 !important; background-color: #F0FDF4 !important; color: #064E3B !important; }
        .option-incorrect { border-color: #EF4444 !important; background-color: #FEF2F2 !important; color: #7F1D1D !important; }
        .option-neutral { border-color: #E5E7EB; background-color: #F9FAFB; }
        
        /* Exam Selection Style (Blue/Neutral) */
        .option-exam-selected { 
            border-color: #3B82F6 !important; 
            background-color: #EFF6FF !important; 
            color: #1E40AF !important; 
        }
        
        .option > div { margin-right: 0.75rem; }
        
        /* Dark Mode Overrides */
        html.dark .option-correct { background-color: #064e3b !important; color: #ecfdf5 !important; border-color: #059669 !important; }
        html.dark .option-incorrect { background-color: #7f1d1d !important; color: #fef2f2 !important; border-color: #dc2626 !important; }
        html.dark .option-neutral { border-color: #374151; background-color: #1f2937; }
        
        html.dark .option-exam-selected {
            background-color: #1e3a8a !important; 
            color: #bfdbfe !important; 
            border-color: #60a5fa !important;
        }

        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            75% { transform: translateX(5px); }
        }
        
        .animate-shake {
            animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both;
        }
    </style>
</head>
<body class="bg-gray-100 dark:bg-gray-900 transition-colors duration-300">
    <header class="bg-white dark:bg-gray-800 shadow-md transition-colors duration-300 sticky top-0 z-10">
        <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center relative">
            
            <!-- Logo Right -->
            ${logo1Base64
            ? `<img src="${logo1Base64}" alt="Logo 1" class="h-12 sm:h-16 w-auto object-contain">`
            : '<div class="w-8"></div>'
        }
            
            <div class="text-center mx-2 flex-1">
                <h1 class="text-lg sm:text-2xl font-bold text-gray-800 dark:text-white">${escapeHTML(quizTitle)}</h1>
            </div>

             <!-- Logo Left -->
            ${logo2Base64
            ? `<img src="${logo2Base64}" alt="Logo 2" class="h-12 sm:h-16 w-auto object-contain">`
            : '<div class="w-8"></div>'
        }

            <!-- Dark Mode Toggle -->
            <button id="theme-toggle" class="absolute left-4 top-1/2 transform -translate-y-1/2 p-2 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-yellow-300 focus:outline-none hover:bg-gray-300 dark:hover:bg-gray-600 transition">
                <svg id="theme-icon" xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <!-- Icon content loaded by JS -->
                </svg>
            </button>
        </div>
    </header>
    
    <main class="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        
        <!-- EXAM CONTROLS -->
        <div id="exam-controls" class="flex justify-center mb-6">
            <button id="start-exam-btn" class="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-full shadow transition flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                بدء وضع الامتحان (Start Exam Mode)
            </button>
            
            <div id="timer-display" class="hidden px-6 py-2 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 font-mono font-bold text-xl rounded-full border border-red-200 dark:border-red-700 flex items-center animate-pulse">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span id="timer-val">00:00</span>
            </div>
        </div>

        <!-- RANDOMIZATION CONTROLS -->
        <div id="randomization-controls" class="flex flex-wrap justify-center gap-3 mb-6">
            <button id="shuffle-questions-btn" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-full shadow transition flex items-center text-sm">
                <svg class="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                ترتيب عشوائي للأسئلة
            </button>
            <button id="shuffle-options-btn" class="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-full shadow transition flex items-center text-sm">
                <svg class="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                خلط الاختيارات
            </button>
             <div class="flex items-center bg-white dark:bg-gray-800 px-4 py-2 rounded-full border border-gray-200 dark:border-gray-700 shadow-sm">
                <input type="checkbox" id="renumber-checkbox" checked class="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer">
                <label for="renumber-checkbox" class="mr-2 text-sm text-gray-700 dark:text-gray-300 select-none cursor-pointer">إعادة ترقيم الأسئلة</label>
            </div>
        </div>

        <div id="quiz-container"></div>
        ${totalMCQs > 0
            ? `<div class="mt-8 text-center"><button id="finish-quiz-btn" class="px-8 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-lg hover:bg-green-700 transition duration-200">إنهاء وتصحيح</button></div>`
            : ''
        }
        
        <div id="results-container" class="hidden mt-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl text-center transition-colors duration-300">
            <h2 class="text-2xl font-bold text-gray-800 dark:text-white mb-4">النتيجة النهائية</h2>
            <div id="score-display" class="text-6xl font-bold text-blue-600 dark:text-blue-400 mb-2">0%</div>
            <div id="score-details" class="text-lg text-gray-600 dark:text-gray-300"></div>
            
            <!-- Export Buttons -->
            <div class="mt-6 flex flex-col sm:flex-row justify-center space-y-3 sm:space-y-0 sm:space-x-3 sm:space-x-reverse">
                <button id="export-html-btn" class="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg flex items-center justify-center transition">
                    <svg class="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    تحميل تقرير الامتحان (HTML)
                </button>
                <button id="export-csv-btn" class="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-lg flex items-center justify-center transition">
                    <svg class="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    تصدير الأخطاء للمراجعة (Anki CSV)
                </button>
            </div>

            <button id="reset-quiz-btn" class="mt-6 px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">إعادة الاختبار</button>
        </div>
    </main>
    <script type="application/json" id="quiz-data">${JSON.stringify(quizData)}</script>
    <script>${vanillaJSCode}</script>
</body>
</html>
  `;
}
