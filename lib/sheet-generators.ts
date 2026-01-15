import { QuizQuestion } from './quiz-parser';

function escapeHTML(str: string) {
    if (!str) return '';
    return str.split(/(<math[\s\S]*?<\/math>)/gi).map(function (part) {
        if (part.toLowerCase().startsWith('<math')) {
            return part;
        }
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
    if (!text) return '';
    // Strip or format markdown bold
    let formatted = escapeHTML(text);
    // Replace **text** with <b>text</b>
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    return formatted.replace(/\n/g, '<br />');
}

export type SheetStyle = 'classic' | 'modern' | 'warm';
export type SheetLanguage = 'en' | 'ar';

const getThemes = (styleName: SheetStyle, isAr: boolean) => {
    const themes = {
        classic: {
            primary: '#005a9c',
            headerBg: 'white',
            headerText: '#005a9c',
            correctBg: '#e8f5e9',
            correctBorder: '#c8e6c9',
            correctText: '#2e7d32',
            explBg: '#e3f2fd',
            explTitle: '#0277bd',
            summaryBg: '#fffde7',
            summaryBorder: '#fff9c4',
            summaryTitle: '#f57f17',
            font: isAr ? "'Cairo', sans-serif" : "'Inter', sans-serif",
            bg: '#f8fafc',
        },
        modern: {
            primary: '#111827',
            headerBg: '#f9fafb',
            headerText: '#111827',
            correctBg: '#f3f4f6',
            correctBorder: '#e5e7eb',
            correctText: '#111827',
            explBg: '#ffffff',
            explTitle: '#374151',
            summaryBg: '#f9fafb',
            summaryBorder: '#e5e7eb',
            summaryTitle: '#111827',
            font: isAr ? "'Cairo', sans-serif" : "'Segoe UI', Roboto, sans-serif",
            bg: '#ffffff',
        },
        warm: {
            primary: '#7c2d12',
            headerBg: '#fffaf0',
            headerText: '#9a3412',
            correctBg: '#f0fdf4',
            correctBorder: '#bbf7d0',
            correctText: '#166534',
            explBg: '#fff7ed',
            explTitle: '#ea580c',
            summaryBg: '#fef3c7',
            summaryBorder: '#fde68a',
            summaryTitle: '#d97706',
            font: isAr ? "'Cairo', serif" : "'Georgia', serif",
            bg: '#fffaf0',
        },
    };
    return themes[styleName] || themes.classic;
};

// --- 1. GENERATE STUDY SHEETS HTML ---
export function generateStudySheetHTML(
    quizData: QuizQuestion[],
    quizTitle: string,
    logo1Base64: string,
    logo2Base64: string,
    styleName: SheetStyle = 'classic',
    language: SheetLanguage = 'en'
) {
    const isAr = language === 'ar';
    const labels = {
        q: isAr ? 'س' : 'Q',
        explHeader: isAr ? 'الشرح' : 'Explanation',
        whyCorrect: isAr ? 'لماذا هذه الإجابة صحيحة؟' : 'Why is this correct?',
        whyWrong: isAr ? 'لماذا الإجابات الأخرى خاطئة؟' : 'Why are others incorrect?',
        correctAns: isAr ? 'الإجابة الصحيحة' : 'Correct Answer',
        summary: isAr ? 'ملخص' : 'Summary',
        lesson: isAr ? 'الدرس' : 'Lesson',
        modelAnswer: isAr ? 'الإجابة النموذجية' : 'Model Answer',
        answerKey: isAr ? 'نموذج الإجابة' : 'Answer Key',
        pageTitle: isAr ? 'أوراق المذاكرة' : 'Study Sheets',
    };

    const dir = isAr ? 'rtl' : 'ltr';
    const theme = getThemes(styleName, isAr);

    const questionsContent = quizData
        .map((q, index) => {
            // -- MCQ Layout --
            if (q.type === 'MCQ') {
                const correctAnswerText = q.options.find((opt) => opt.startsWith(q.correctAnswer)) || 'N/A';

                let whyCorrectHTML = '';
                let whyWrongHTML = '';

                Object.keys(q.explanations).forEach((key) => {
                    let text = q.explanations[key];

                    // Localize 'Correct/Incorrect'
                    if (isAr) {
                        text = text.replace(/This statement is correct[\.\s]*/i, 'صحيح: ');
                        text = text.replace(/This statement is incorrect[\.\s]*/i, 'خطأ: ');
                        text = text.replace(/^Correct[\.\:\-\s]*/i, 'صحيح: ');
                        text = text.replace(/^Incorrect[\.\:\-\s]*/i, 'خطأ: ');
                    }

                    if (key === q.correctAnswer) {
                        whyCorrectHTML += `
            <div class="mb-2">
               <div class="flex items-start gap-2">
                  <span class="font-bold text-green-700">(${key})</span>
                  <span class="text-gray-700 text-base leading-relaxed" dir="auto">${escapeHTML(text)}</span>
               </div>
            </div>`;
                    } else {
                        whyWrongHTML += `
            <div class="mb-1">
               <div class="flex items-start gap-2">
                  <span class="font-bold text-red-600">(${key})</span>
                  <span class="text-gray-600 text-sm leading-relaxed" dir="auto">${escapeHTML(text)}</span>
               </div>
            </div>`;
                    }
                });

                return `
        <div class="sheet-page-container">
          <div class="sheet-card" style="font-family: ${theme.font}">
              <div class="content-scaler">
                  <div class="p-6 border-b text-start" style="background-color: ${theme.headerBg}; border-color: #e5e7eb;">
                    <h2 class="text-2xl font-bold mb-4" dir="auto" style="color: ${theme.headerText}">
                      <span class="${isAr ? 'ml-2' : 'mr-2'}">${labels.q}${q.number}:</span> ${formatText(q.question)}
                    </h2>
                    <ul class="space-y-3 ${isAr ? 'mr-4' : 'ml-4'} text-lg" dir="auto">
                      ${q.options
                        .map(
                            (opt) => `
                        <li class="flex items-center text-gray-700 gap-3">
                          <span class="w-2 h-2 bg-gray-400 rounded-full flex-shrink-0 mt-1"></span>
                          <span>${escapeHTML(opt)}</span>
                        </li>
                      `
                        )
                        .join('')}
                    </ul>
                  </div>

                  <div class="border-y p-4 flex items-center justify-start text-base gap-3" 
                       dir="auto"
                       style="background-color: ${theme.correctBg}; border-color: ${theme.correctBorder}; color: ${theme.correctText}">
                    <svg class="w-6 h-6 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>
                    <span class="font-bold">${labels.correctAns}: ${escapeHTML(correctAnswerText)}</span>
                  </div>

                  <div class="p-6 text-start flex-grow" style="background-color: ${theme.explBg}">
                    <h3 class="font-bold text-xl mb-4 flex items-center gap-2" style="color: ${theme.explTitle}">
                      ${labels.explHeader}
                    </h3>
                    
                    ${whyCorrectHTML
                        ? `
                      <div class="mb-4">
                        <h4 class="font-bold mb-2 text-sm uppercase tracking-wide" style="color: ${theme.primary}; opacity: 0.8">${labels.whyCorrect}</h4>
                        <div class="bg-white/60 p-4 rounded-lg border border-black/5">
                          ${whyCorrectHTML}
                        </div>
                      </div>
                    `
                        : ''
                    }

                    ${whyWrongHTML
                        ? `
                      <div class="mt-4">
                        <h4 class="font-bold mb-2 text-sm uppercase tracking-wide" style="color: ${theme.primary}; opacity: 0.8">${labels.whyWrong}</h4>
                        <div class="space-y-1">
                          ${whyWrongHTML}
                        </div>
                      </div>
                    `
                        : ''
                    }
                  </div>

                  ${q.topicSummary
                        ? `
                    <div class="p-5 border-t text-start" style="background-color: ${theme.summaryBg}; border-color: ${theme.summaryBorder}">
                      <div class="flex items-center mb-2 gap-2">
                         <span class="text-2xl">💡</span>
                         <h3 class="font-bold text-base" style="color: ${theme.summaryTitle}">${labels.summary}:</h3>
                      </div>
                      <p class="text-gray-800 leading-relaxed text-sm" dir="auto">
                        ${formatText(q.topicSummary)}
                      </p>
                    </div>
                  `
                        : ''
                    }
                  
                   <div class="bg-gray-50 p-2 text-xs text-gray-400 text-center border-t border-gray-100 mt-auto">
                     ${labels.lesson}: ${escapeHTML(q.lesson || 'General')}
                   </div>
              </div>
          </div>
        </div>
      `;
            }
            // -- Matching Layout --
            else if (q.type === 'Matching') {
                // Format matches for display
                const matchesHTML = q.matches?.map((m, i) => `
                    <div class="flex items-start gap-4 p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                        <div class="flex-1 font-medium text-gray-800" dir="auto">${formatText(m.left)}</div>
                        <div class="text-gray-400 self-center">➔</div>
                        <div class="flex-1 font-bold text-blue-700" dir="auto">${formatText(m.right)}</div>
                    </div>
                    ${m.explanation ? `
                    <div class="mt-1 mr-4 ml-4 text-sm text-gray-600 bg-gray-50 p-2 rounded border border-gray-100" dir="auto">
                        <span class="font-bold text-blue-600">${labels.explHeader}:</span> ${formatText(m.explanation)}
                    </div>
                    ` : ''}
                 `).join('');

                return `
        <div class="sheet-page-container">
          <div class="sheet-card" style="font-family: ${theme.font}">
              <div class="content-scaler">
                  <div class="p-6 border-b text-start" style="background-color: ${theme.headerBg}; border-color: #e5e7eb;">
                    <h2 class="text-2xl font-bold mb-4" dir="auto" style="color: ${theme.headerText}">
                      <span class="${isAr ? 'ml-2' : 'mr-2'}">${labels.q}${q.number}:</span> ${formatText(q.question)}
                    </h2>
                    <p class="text-gray-500 mb-4 italic text-sm">${isAr ? 'صل العناصر في العمود أ بما يناسبها في العمود ب:' : 'Match the items in Column A with Column B:'}</p>
                  </div>

                  <div class="p-6 bg-gray-50 flex-grow">
                      <h3 class="font-bold text-gray-700 mb-4" dir="auto">${labels.modelAnswer}:</h3>
                      <div class="space-y-4">
                          ${matchesHTML}
                      </div>
                  </div>

                  ${q.topicSummary
                        ? `
                    <div class="p-5 border-t text-start mt-auto" style="background-color: ${theme.summaryBg}; border-color: ${theme.summaryBorder}">
                      <div class="flex items-center mb-2 gap-2">
                         <span class="text-2xl">💡</span>
                         <h3 class="font-bold text-base" style="color: ${theme.summaryTitle}">${labels.summary}:</h3>
                      </div>
                      <p class="text-gray-800 leading-relaxed text-sm" dir="auto">
                        ${formatText(q.topicSummary)}
                      </p>
                    </div>
                  `
                        : ''
                    }
                  
                   <div class="bg-gray-50 p-2 text-xs text-gray-400 text-center border-t border-gray-100 mt-auto">
                     ${labels.lesson}: ${escapeHTML(q.lesson || 'General')}
                   </div>
              </div>
          </div>
        </div>
      `;
            }
            else {
                const hasSubQuestions = q.subQuestions && q.subQuestions.length > 0;

                let answerSectionHTML = '';

                if (hasSubQuestions) {
                    answerSectionHTML = q.subQuestions!.map((sq, idx) => `
                    <div class="mb-4 last:mb-0">
                    <h4 class="font-bold text-gray-700 mb-1 text-sm bg-gray-100 p-1 rounded inline-block" dir="auto">Part ${idx + 1}: ${escapeHTML(sq.question)}</h4>
                        <p class="whitespace-pre-wrap text-gray-800 text-base leading-relaxed mt-1 pl-2 border-l-2 border-gray-300" dir="auto">${formatText(sq.answer)}</p>
                    </div>
                    `).join('');
                } else {
                    answerSectionHTML = `<p class="whitespace-pre-wrap text-gray-800 text-base leading-relaxed" dir="auto">${formatText(q.answer || q.correctAnswer)}</p>`;
                }

                return `
        <div class="sheet-page-container">
          <div class="sheet-card" style="font-family: ${theme.font}">
               <div class="content-scaler">
                  <div class="p-6">
                    <h2 class="text-2xl font-bold mb-6 text-start" dir="auto" style="color: ${theme.headerText}">
                      <span class="${isAr ? 'ml-2' : 'mr-2'}">${labels.q}${q.number}:</span> ${formatText(q.question)}
                    </h2>
                    
                     <div class="mt-6 bg-gray-50 p-6 rounded-lg border border-dashed border-gray-300">
                      <h3 class="font-bold text-gray-700 mb-3 text-lg" dir="auto">${labels.modelAnswer}:</h3>
                      <div class="text-start" dir="auto">
                         ${answerSectionHTML}
                      </div>
                    </div>

                    ${(q.explanations && (q.explanations['General'] || q.explanations['Correct']))
                        ? `
                        <div class="mt-6 p-6 rounded-lg text-start" style="background-color: ${theme.explBg}">
                            <h3 class="font-bold text-xl mb-4 flex items-center gap-2" style="color: ${theme.explTitle}">
                                ${labels.explHeader}
                            </h3>
                            <div class="text-gray-700 leading-relaxed" dir="auto">
                                ${formatText(q.explanations['General'] || q.explanations['Correct'])}
                            </div>
                        </div>
                        `
                        : ''
                    }
                  </div>
                   ${q.topicSummary
                        ? `
                    <div class="p-5 border-t text-start mt-auto" style="background-color: ${theme.summaryBg}; border-color: ${theme.summaryBorder}">
                      <div class="flex items-center mb-2 gap-2">
                         <span class="text-2xl">💡</span>
                         <h3 class="font-bold text-base" style="color: ${theme.summaryTitle}">${labels.summary}:</h3>
                      </div>
                      <p class="text-gray-800 leading-relaxed text-sm" dir="auto">
                        ${formatText(q.topicSummary)}
                      </p>
                    </div>
                  `
                        : ''
                    }
                  
                   <div class="bg-gray-50 p-2 text-xs text-gray-400 text-center border-t border-gray-100 mt-auto">
                     ${labels.lesson}: ${escapeHTML(q.lesson || 'General')}
                   </div>
               </div>
          </div>
        </div>
      `;
            }
        })
        .join('');

    const answerKeyContent = `
    <div class="sheet-page-container">
      <div class="sheet-card" style="font-family: ${theme.font}">
        <div class="p-8 h-full flex flex-col">
           <h2 class="text-3xl font-bold mb-8 text-center uppercase tracking-widest border-b pb-4" style="color: ${theme.headerText}; border-color: ${theme.summaryBorder}">
             ${labels.answerKey}
           </h2>
           
           <div class="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-4 content-start" dir="ltr">
             ${quizData
            .map((q) => {
                if (!q.correctAnswer && q.type !== 'MCQ') return '';
                return `
                  <div class="border rounded-lg flex flex-col items-center justify-center bg-white shadow-sm overflow-hidden border-gray-200">
                    <div class="w-full bg-gray-100 text-gray-600 text-[11px] font-bold uppercase py-1 text-center border-b border-gray-200">${isAr ? 'س' : 'Q'}${q.number}</div>
                    <div class="flex-grow flex items-center justify-center p-3">
                        <span class="text-xl font-bold" style="color: ${theme.primary}">${q.correctAnswer || '-'}</span>
                    </div>
                  </div>
                `;
            })
            .join('')}
           </div>
           
           <div class="mt-auto text-center text-sm text-gray-400 border-t pt-4">
             ${escapeHTML(quizTitle)} - ${labels.answerKey}
           </div>
        </div>
      </div>
    </div>
  `;

    return `
<!DOCTYPE html>
<html lang="${language}" dir="${dir}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHTML(quizTitle)} - ${labels.pageTitle}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>
    <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Inter:wght@400;600;700&family=Georgia&display=swap');
        
        * { box-sizing: border-box; }
        body {
            font-family: ${theme.font};
            background-color: #525659;
            margin: 0;
            padding: 20px;
        }

        .sheet-page-container {
            width: 210mm;
            height: 297mm;
            margin: 0 auto 20px auto;
            background: white;
            position: relative;
            overflow: hidden; 
        }
        
        .sheet-card {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
        }

        .cover-page-container {
            width: 210mm;
            height: 297mm;
            margin: 0 auto 20px auto;
            background: white;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            border: 1px solid #ddd;
            position: relative;
        }

        .cover-decorative-line {
            width: 80%;
            height: 6px;
            background: linear-gradient(90deg, ${theme.primary}, ${theme.headerText});
            margin: 30px auto;
            border-radius: 4px;
        }

        @media print {
            @page {
                size: A4 portrait;
                margin: 0; 
            }
            body {
                background-color: white;
                margin: 0;
                padding: 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .no-print {
                display: none !important;
            }
            .sheet-page-container, .cover-page-container {
                width: 210mm;
                height: 296mm; 
                margin: 0;
                border: none;
                page-break-after: always;
                overflow: hidden; 
            }
        }
    </style>
</head>
<body>

    <div class="no-print text-white text-center mb-6">
        <h1 class="text-2xl font-bold mb-2" dir="auto">${escapeHTML(quizTitle)}</h1>
        <p class="mb-4 text-gray-300">
           Style: <span class="font-bold text-yellow-400 uppercase">${styleName}</span> | 
           Lang: <span class="font-bold text-yellow-400 uppercase">${language}</span>
        </p>
        <button onclick="window.print()" class="bg-white text-gray-800 px-6 py-2 rounded-full font-bold shadow hover:bg-gray-100 transition">
            🖨️ Print / Save as PDF
        </button>
    </div>

    <div class="cover-page-container" style="font-family: ${theme.font}">
        <div class="absolute top-0 left-0 w-full h-6" style="background-color: ${theme.primary}"></div>
        
        <div class="mb-10 flex space-x-8 items-center justify-center">
             ${logo2Base64 ? `<img src="${logo2Base64}" class="h-40 w-auto object-contain">` : ''}
             ${logo1Base64 ? `<img src="${logo1Base64}" class="h-40 w-auto object-contain">` : ''}
        </div>

        <h1 class="text-6xl font-bold mb-6 px-10 leading-tight" dir="auto" style="color: ${theme.headerText}">
            ${escapeHTML(quizTitle)}
        </h1>
        
        <div class="cover-decorative-line"></div>

        <h2 class="text-3xl text-gray-500 font-light tracking-widest uppercase mt-6">
            ${labels.pageTitle}
        </h2>

        <div class="absolute bottom-12 text-gray-400 text-base">
            Generated on ${new Date().toLocaleDateString()}
        </div>
        <div class="absolute bottom-0 left-0 w-full h-6" style="background-color: ${theme.primary}"></div>
    </div>

    ${questionsContent}
    ${answerKeyContent}

    <script>
        window.onload = function() {
            const containers = document.querySelectorAll('.sheet-page-container');
            const MAX_HEIGHT_PX = 1120; 

            containers.forEach(container => {
                const scaler = container.querySelector('.content-scaler');
                if (!scaler) return;
                const naturalHeight = scaler.scrollHeight;
                
                if (naturalHeight > MAX_HEIGHT_PX) {
                    const scaleFactor = (MAX_HEIGHT_PX / naturalHeight) - 0.005;
                    if ('zoom' in document.documentElement.style) {
                        scaler.style.zoom = scaleFactor;
                    } else {
                        scaler.style.transform = 'scale(' + scaleFactor + ')';
                        scaler.style.transformOrigin = 'top left';
                        scaler.style.width = (100 / scaleFactor) + '%';
                    }
                }
                
                scaler.style.height = '100%';
                scaler.style.display = 'flex';
                scaler.style.flexDirection = 'column';
            });
        };
    </script>
</body>
</html>
  `;
}

// --- 2. GENERATE QUESTIONS ONLY SHEET ---
export function generateQuestionSheetHTML(
    quizData: QuizQuestion[],
    quizTitle: string,
    logo1Base64: string,
    logo2Base64: string,
    styleName: SheetStyle = 'classic',
    language: SheetLanguage = 'en'
) {
    const isAr = language === 'ar';
    const labels = {
        ansKey: isAr ? 'نموذج الإجابة' : 'Answer Key',
        sheetType: isAr ? 'ورقة الأسئلة' : 'Question Sheet',
    };
    const dir = isAr ? 'rtl' : 'ltr';
    const theme = getThemes(styleName, isAr);

    const questionsHTML = quizData
        .map((q) => {
            let content = '';
            if (q.type === 'MCQ') {
                content = `
                <div class="mb-6 break-inside-avoid">
                    <div class="flex items-start gap-2">
                        <span class="font-bold text-lg flex-shrink-0" style="color:${theme.primary}">${q.number}.</span>
                        <div class="flex-grow">
                            <p class="text-base font-semibold text-gray-800 mb-2 leading-relaxed" dir="auto">${formatText(q.question)}</p>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 ${isAr ? 'mr-1' : 'ml-1'}" dir="auto">
                                ${q.options
                        .map(
                            (opt) => `
                                    <div class="flex items-start text-sm text-gray-700 gap-2">
                                        <span class="text-gray-400">•</span>
                                        <span>${escapeHTML(opt)}</span>
                                    </div>
                                `
                        )
                        .join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;
            } else if (q.type === 'Matching') {
                // Matching Question Sheet - Shuffle column B
                const leftItems = q.matches?.map((m, i) => ({ text: m.left, id: i })) || [];
                const rightItems = q.matches?.map((m, i) => ({ text: m.right, id: i })) || [];

                // Shuffle right items deterministically for this render (so it doesn't change on re-renders if possible, but random is okay here)
                for (let i = rightItems.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [rightItems[i], rightItems[j]] = [rightItems[j], rightItems[i]];
                }

                content = `
                <div class="mb-8 break-inside-avoid">
                    <div class="flex items-start gap-2">
                        <span class="font-bold text-lg flex-shrink-0" style="color:${theme.primary}">${q.number}.</span>
                        <div class="flex-grow">
                             <p class="text-base font-semibold text-gray-800 mb-4 leading-relaxed" dir="auto">${formatText(q.question)}</p>
                             
                             <div class="grid grid-cols-2 gap-8 mt-4">
                                <!-- Column A -->
                                <div class="space-y-3">
                                    <h4 class="font-bold text-gray-500 border-b pb-1 mb-2">${isAr ? 'العمود (أ)' : 'Column A'}</h4>
                                    ${leftItems.map((item, idx) => `
                                        <div class="flex gap-2">
                                            <span class="font-bold text-gray-400">${idx + 1}.</span>
                                            <span class="text-gray-800" dir="auto">${formatText(item.text)}</span>
                                        </div>
                                    `).join('')}
                                </div>

                                <!-- Column B -->
                                <div class="space-y-3">
                                    <h4 class="font-bold text-gray-500 border-b pb-1 mb-2">${isAr ? 'العمود (ب)' : 'Column B'}</h4>
                                    ${rightItems.map((item, idx) => `
                                        <div class="flex gap-2">
                                            <span class="font-bold text-gray-400">(${String.fromCharCode(65 + idx)})</span>
                                            <span class="text-gray-800" dir="auto">${formatText(item.text)}</span>
                                        </div>
                                    `).join('')}
                                </div>
                             </div>

                             <!-- Answer Box -->
                             <div class="mt-6 border border-gray-300 rounded p-4 h-24 bg-gray-50 relative">
                                <span class="text-gray-400 text-xs absolute top-2 left-2">${isAr ? 'الإجابة:' : 'Answer:'}</span>
                             </div>
                        </div>
                    </div>
                </div>
                `;
            } else {
                // Written
                const hasSubQuestions = q.subQuestions && q.subQuestions.length > 0;
                let subQuestionsHTML = '';

                if (hasSubQuestions) {
                    subQuestionsHTML = q.subQuestions!.map((sq, idx) => `
                    <div class="mb-3">
                        <h5 class="font-bold text-gray-600 text-sm mb-1 ml-4" dir="auto">${idx + 1}. ${escapeHTML(sq.question)}</h5>
                            <div class="h-16 border border-gray-200 rounded-lg bg-gray-50 border-dashed ml-4"></div>
                    </div>
                    `).join('');
                }

                content = `
                <div class="mb-8 break-inside-avoid">
                    <div class="flex items-start gap-2">
                        <span class="font-bold text-lg flex-shrink-0" style="color:${theme.primary}">${q.number}.</span>
                            <div class="flex-grow">
                                <p class="text-base font-semibold text-gray-800 mb-4 leading-relaxed" dir="auto">${formatText(q.question)}</p>
                             ${hasSubQuestions ? subQuestionsHTML : '<div class="h-24 border border-gray-200 rounded-lg bg-gray-50 border-dashed"></div>'}
                            </div>
                    </div>
                </div>
                `;
            }
            return content;
        })
        .join('');

    // --- Answer Key ---
    const answerKeyContent = `
                    <div class="page-break"></div>
                        <div class="py-10 px-8">
                            <div class="flex justify-between items-center border-b pb-4 mb-8 border-gray-300">
                                <h2 class="text-3xl font-bold uppercase tracking-widest" style="color: ${theme.headerText}"> ${labels.ansKey} </h2>
                                    </div>

                                    <div class="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-4 content-start" dir="ltr">
                                        ${quizData.map(q => {
        if (!q.correctAnswer && q.type !== 'MCQ' && q.type !== 'Matching') return '';
        return `
                  <div class="border rounded-lg flex flex-col items-center justify-center bg-white shadow-sm overflow-hidden border-gray-200">
                    <div class="w-full bg-gray-100 text-gray-600 text-[11px] font-bold uppercase py-1 text-center border-b border-gray-200">${isAr ? 'س' : 'Q'}${q.number}</div>
                    <div class="flex-grow flex items-center justify-center p-3">
                        <span class="text-xl font-bold" style="color: ${theme.primary}">${q.correctAnswer || '-'}</span>
                    </div>
                  </div>
                `;
    }).join('')
        }
                </div>
                    <div class="mt-8 text-center text-sm text-gray-400 border-t pt-4">
                        ${escapeHTML(quizTitle)} - ${labels.ansKey}
                </div>
                    </div>
                        `;

    return `
                    <!DOCTYPE html>
                        <html lang="${language}" dir="${dir}">
                            <head>
                            <meta charset="UTF-8">
                                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                    <title>${escapeHTML(quizTitle)} - ${labels.sheetType} </title>
                                        <script src="https://cdn.tailwindcss.com"></script>
                                            <script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>
                                                <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
                                                    <style>
                @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Inter:wght@400;600;700&family=Georgia&display=swap');
            body { font-family: ${theme.font}; background-color: #525659; margin: 0; padding: 20px; }
            .paper-page { width: 210mm; min-height: 297mm; margin: 0 auto 20px auto; background: white; padding: 20mm; position: relative; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}
            .page-break { page-break-before: always; }
            .break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }
@media print {
    @page { size: A4 portrait; margin: 0; }
                body { background: none; margin: 0; padding: 0; }
                .paper-page { width: 100%; margin: 0; box-shadow: none; min-height: auto; padding: 10mm; }
                .no-print { display: none!important; }
}
</style>
    </head>
    <body>
    <div class="no-print text-white text-center mb-6">
        <h1 class="text-2xl font-bold mb-2"> ${escapeHTML(quizTitle)} - ${labels.sheetType} </h1>
            <button onclick="window.print()" class="bg-white text-gray-800 px-6 py-2 rounded-full font-bold shadow hover:bg-gray-100 transition">
                🖨️ Print / Save as PDF
    </button>
    </div>

    <div class="paper-page">
        <div class="flex justify-between items-center mb-8 border-b-2 pb-4" style="border-color: ${theme.primary}">
            <div class="flex items-center gap-4">
                ${logo1Base64 ? `<img src="${logo1Base64}" class="h-16 w-auto object-contain">` : ''}
<div>
    <h1 class="text-2xl font-bold" dir="auto" style="color: ${theme.headerText}"> ${escapeHTML(quizTitle)} </h1>
        <p class="text-gray-500 text-sm"> ${labels.sheetType} </p>
            </div>
            </div>
                ${logo2Base64 ? `<img src="${logo2Base64}" class="h-16 w-auto object-contain">` : ''}
</div>

    <div class="space-y-2">
        ${questionsHTML}
</div>
    </div>

    <div class="paper-page">
        ${answerKeyContent.replace('<div class="page-break"></div>', '')}
</div>
    </body>
    </html>`;
}

// --- 2.5 GENERATE TEACHER SHEET HTML (NEW) ---
export function generateTeacherSheetHTML(
    quizData: QuizQuestion[],
    quizTitle: string,
    logo1Base64: string,
    logo2Base64: string,
    styleName: SheetStyle = 'classic',
    language: SheetLanguage = 'en'
) {
    const isAr = language === 'ar';
    const labels = {
        sheetType: isAr ? 'نسخة المعلم (مجاب عنها)' : 'Teacher Version (Answered)',
        modelAnswer: isAr ? 'الإجابة النموذجية:' : 'Model Answer:',
    };
    const dir = isAr ? 'rtl' : 'ltr';
    const theme = getThemes(styleName, isAr);

    // Filter out topics/explanations, just focus on question + answer
    const questionsHTML = quizData
        .map((q) => {
            let content = '';

            // --- Helper: Highlight Model Answer for Written or Complete if provided ---
            // If it's a "fill in blank" type, we can try to replace dots.
            // But usually safer to just append the answer in red for clarity unless we have a really smart regex.
            // Let's implement a smart "dots replacement" if pattern is found, otherwise fallback to "Model Answer" box.

            const renderWrittenAnswer = (text: string) => {
                return `<div class="mt-2 text-red-600 font-bold text-base" dir="auto">${labels.modelAnswer} ${formatText(text)}</div>`;
            };

            // Smart Replace for "Complete" style questions:
            // Look for 3+ dots or underscores, replace with RED ANSWER
            // Smart Replace for "Complete" style questions:
            // Look for 2+ dots, underscores, or dashes. Identify them as "The Blank".
            const embedAnswerInQuestion = (questionText: string, answerText: string) => {
                const dotsRegex = /([._-]{2,})/g;
                if (dotsRegex.test(questionText) && answerText) {
                    // Only do inline replacement for short answers
                    return formatText(questionText).replace(
                        dotsRegex,
                        `<span style="color: #dc2626; font-weight: bold; text-decoration: underline;">&nbsp;${escapeHTML(answerText)}&nbsp;</span>`
                    );
                }
                return formatText(questionText);
            };


            if (q.type === 'MCQ') {
                // MCQ: Highlight correct option in RED
                content = `
                <div class="mb-6 break-inside-avoid">
                    <div class="flex items-start gap-2">
                        <span class="font-bold text-lg flex-shrink-0" style="color:${theme.primary}">${q.number}.</span>
                        <div class="flex-grow">
                            <p class="text-base font-semibold text-gray-800 mb-2 leading-relaxed" dir="auto">${formatText(q.question)}</p>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 ${isAr ? 'mr-1' : 'ml-1'}" dir="auto">
                                ${q.options
                        .map((opt) => {
                            // Check if this option is the correct one.
                            // Assume format "A. answer" and q.correctAnswer is "A"
                            const isCorrect = opt.trim().toUpperCase().startsWith(q.correctAnswer.toUpperCase() + '.');

                            const style = isCorrect
                                ? 'color: #dc2626; font-weight: bold;' // Red & Bold
                                : 'color: #374151;'; // Normal Gray

                            return `
                                    <div class="flex items-start text-sm gap-2" style="${style}">
                                        <span class="${isCorrect ? 'text-red-600' : 'text-gray-400'}">•</span>
                                        <span>${escapeHTML(opt)}</span>
                                    </div>
                                `;
                        })
                        .join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;
            } else if (q.type === 'Matching') {
                const matchesHTML = q.matches?.map((m, i) => `
                    <div class="flex items-center gap-3 p-2 border-b last:border-0 border-gray-100">
                        <div class="w-1/2 font-medium text-gray-800" dir="auto">${formatText(m.left)}</div>
                        <div class="text-gray-400">➔</div>
                        <div class="w-1/2 font-bold text-red-600" dir="auto">${formatText(m.right)}</div>
                    </div>
                 `).join('');

                content = `
                <div class="mb-8 break-inside-avoid">
                    <div class="flex items-start gap-2">
                        <span class="font-bold text-lg flex-shrink-0" style="color:${theme.primary}">${q.number}.</span>
                        <div class="flex-grow">
                             <p class="text-base font-semibold text-gray-800 mb-2 leading-relaxed" dir="auto">${formatText(q.question)}</p>
                             <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-2">
                                ${matchesHTML}
                             </div>
                        </div>
                    </div>
                </div>
                 `;
            } else {
                const hasSubQuestions = q.subQuestions && q.subQuestions.length > 0;
                let subQuestionsHTML = '';
                let mainAnswerHTML = '';

                // Try inline replacement for main question if applicable
                const processedQuestion = embedAnswerInQuestion(q.question, q.answer || q.correctAnswer);
                const showMainAnswerBox = (processedQuestion === formatText(q.question)); // If no replacement happened, show box

                if (hasSubQuestions) {
                    subQuestionsHTML = q.subQuestions!.map((sq, idx) => {
                        // Try inline for subquestions too
                        const procSubQ = embedAnswerInQuestion(sq.question, sq.answer);
                        const showSubBox = (procSubQ === formatText(sq.question));

                        return `
                    <div class="mb-3">
                    <h5 class="font-bold text-gray-700 text-sm mb-1 ml-4" dir="auto">${idx + 1}. ${procSubQ}</h5>
                            ${showSubBox ? `<div class="ml-4 text-red-600 font-bold text-sm" dir="auto">${escapeHTML(sq.answer)}</div>` : ''}
            </div>
                `;
                    }).join('');
                } else {
                    if (showMainAnswerBox) {
                        mainAnswerHTML = renderWrittenAnswer(q.answer || q.correctAnswer || 'No Answer');
                    }
                }

                content = `
                <div class="mb-8 break-inside-avoid">
                    <div class="flex items-start gap-2">
                        <span class="font-bold text-lg flex-shrink-0" style="color:${theme.primary}">${q.number}.</span>
                            <div class="flex-grow">
                                <p class="text-base font-semibold text-gray-800 mb-2 leading-relaxed" dir="auto">${processedQuestion}</p>
                             ${hasSubQuestions ? subQuestionsHTML : mainAnswerHTML}
                            </div>
                    </div>
                </div>
                    `;
            }
            return content;
        })
        .join('');

    return `
                <!DOCTYPE html>
                    <html lang="${language}" dir="${dir}">
                        <head>
                        <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                <title>${escapeHTML(quizTitle)} - ${labels.sheetType} </title>
                                    <script src="https://cdn.tailwindcss.com"></script>
                                        <script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>
                                            <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
                                                <style>
            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Inter:wght@400;600;700&family=Georgia&display=swap');
        
        body {
                font-family: ${theme.font};
                background-color: #525659;
                margin: 0;
                padding: 20px;
            }
        
        .paper-page {
            width: 210mm;
    min-height: 297mm;
    margin: 0 auto 20px auto;
    background: white;
    padding: 20mm;
    position: relative;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

        .break-inside-avoid {
    break-inside: avoid;
    page-break-inside: avoid;
}

@media print {
    @page {
        size: A4 portrait;
        margin: 0;
    }
            body {
        background: none;
        margin: 0;
        padding: 0;
    }
            .paper-page {
        width: 100%;
        margin: 0;
        box-shadow: none;
        min-height: auto;
        padding: 10mm;
    }
            .no-print {
        display: none!important;
    }
}
</style>
    </head>
    <body>
    <div class="no-print text-white text-center mb-6">
        <h1 class="text-2xl font-bold mb-2"> ${escapeHTML(quizTitle)} (${labels.sheetType})</h1>
            <button onclick="window.print()" class="bg-white text-gray-800 px-6 py-2 rounded-full font-bold shadow hover:bg-gray-100 transition">
            🖨️ Print / Save as PDF
    </button>
    </div>

    <div class="paper-page">
        <div class="flex justify-between items-center mb-8 border-b-2 pb-4" style="border-color: ${theme.primary}">
            <div class="flex items-center gap-4">
                ${logo1Base64 ? `<img src="${logo1Base64}" class="h-16 w-auto object-contain">` : ''}
<div>
    <h1 class="text-2xl font-bold" dir="auto" style="color: ${theme.headerText}"> ${escapeHTML(quizTitle)} </h1>
        <p class="text-red-600 font-bold text-sm uppercase tracking-wider"> ${labels.sheetType} </p>
            </div>
            </div>
             ${logo2Base64 ? `<img src="${logo2Base64}" class="h-16 w-auto object-contain">` : ''}
</div>

    <div class="space-y-2">
        ${questionsHTML}
</div>

    <div class="mt-12 text-center text-xs text-gray-400 border-t pt-4">
            — End of Teacher Version —
</div>
    </div>

    </body>
    </html>`;
}

// --- 3. GENERATE ANSWER KEY ONLY HTML ---
export function generateAnswerKeyHTML(
    quizData: QuizQuestion[],
    quizTitle: string,
    logo1Base64: string,
    logo2Base64: string,
    styleName: SheetStyle = 'classic',
    language: SheetLanguage = 'en'
) {
    const isAr = language === 'ar';
    const labels = {
        ansKey: isAr ? 'نموذج الإجابة' : 'Answer Key',
    };
    const dir = isAr ? 'rtl' : 'ltr';
    const theme = getThemes(styleName, isAr);

    const answerKeyContent = `
    <div class="sheet-page-container">
      <div class="sheet-card" style="font-family: ${theme.font}">
        <div class="p-8 h-full flex flex-col">
           <div class="flex justify-between items-center border-b pb-4 mb-8" style="border-color: ${theme.summaryBorder}">
               ${logo2Base64 ? `<img src="${logo2Base64}" class="h-12 w-auto object-contain">` : '<div></div>'}
               <h2 class="text-3xl font-bold text-center uppercase tracking-widest" style="color: ${theme.headerText}">
                ${labels.ansKey}
               </h2>
               ${logo1Base64 ? `<img src="${logo1Base64}" class="h-12 w-auto object-contain">` : '<div></div>'}
           </div>
           
           <div class="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-4 content-start mb-8" dir="ltr">
             ${quizData
            .filter(q => q.type === 'MCQ')
            .map((q) => {
                return `
                  <div class="border rounded-lg flex flex-col items-center justify-center bg-white shadow-sm overflow-hidden border-gray-200">
                    <div class="w-full bg-gray-100 text-gray-600 text-[11px] font-bold uppercase py-1 text-center border-b border-gray-200">${isAr ? 'س' : 'Q'}${q.number}</div>
                    <div class="flex-grow flex items-center justify-center p-3">
                        <span class="text-xl font-bold" style="color: ${theme.primary}">${q.correctAnswer || '-'}</span>
                    </div>
                  </div>
                `;
            })
            .join('')}
           </div>

           <!-- Written / Complete Answers -->
           <div class="flex flex-col gap-4">
            ${quizData
            .filter(q => q.type !== 'MCQ' && q.type !== 'Matching')
            .map((q) => {
                const answer = q.answer || q.correctAnswer || 'No Answer Provided';
                return `
                <div class="border rounded-lg bg-gray-50 border-gray-200 p-4" dir="${dir}">
                    <div class="flex items-start gap-3">
                        <span class="font-bold text-gray-700 bg-white border border-gray-300 px-2 py-1 rounded text-sm min-w-[40px] text-center">${isAr ? 'س' : 'Q'}${q.number}</span>
                        <div class="flex-1">
                             <div class="text-sm text-gray-500 mb-1 font-semibold uppercase tracking-wider">${q.type}</div>
                             <div class="text-gray-900 font-medium whitespace-pre-wrap leading-relaxed" style="font-family: ${theme.font}">${formatText(answer)}</div>
                        </div>
                    </div>
                </div>
                `;
            })
            .join('')}

            ${/* Matching Answers Block */ ''}
            ${quizData
            .filter(q => q.type === 'Matching')
            .map((q) => {
                const matchesList = q.matches?.map(m => `${m.left} = ${m.right}`).join('<br>');
                return `
                    <div class="border rounded-lg bg-blue-50 border-blue-100 p-4" dir="${dir}">
                        <div class="flex items-start gap-3">
                            <span class="font-bold text-blue-700 bg-white border border-blue-200 px-2 py-1 rounded text-sm min-w-[40px] text-center">${isAr ? 'س' : 'Q'}${q.number}</span>
                            <div class="flex-1">
                                 <div class="text-sm text-blue-500 mb-1 font-semibold uppercase tracking-wider">${q.type}</div>
                                 <div class="text-gray-900 font-medium whitespace-pre-wrap leading-relaxed" style="font-family: ${theme.font}">${matchesList}</div>
                            </div>
                        </div>
                    </div>
                    `;
            })
            .join('')
        }
           </div>
           
           <div class="mt-auto text-center text-sm text-gray-400 border-t pt-4">
             ${escapeHTML(quizTitle)} - ${labels.ansKey}
           </div>
        </div>
      </div>
    </div>
  `;

    return `
<!DOCTYPE html>
<html lang="${language}" dir="${dir}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHTML(quizTitle)} - ${labels.ansKey}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>
    <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Inter:wght@400;600;700&family=Georgia&display=swap');
        
        * { box-sizing: border-box; }
        body {
            font-family: ${theme.font};
            background-color: #525659;
            margin: 0;
            padding: 20px;
        }

        .sheet-page-container {
            width: 210mm;
            height: 297mm;
            margin: 0 auto 20px auto;
            background: white;
            position: relative;
            overflow: hidden; 
        }
        
        .sheet-card {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
        }

        @media print {
            @page {
                size: A4 portrait;
                margin: 0; 
            }
            body {
                background-color: white;
                margin: 0;
                padding: 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .no-print {
                display: none !important;
            }
            .sheet-page-container {
                width: 210mm;
                height: 296mm; 
                margin: 0;
                border: none;
                page-break-after: always;
                overflow: hidden; 
            }
        }
    </style>
</head>
<body>
    <div class="no-print text-white text-center mb-6">
        <h1 class="text-2xl font-bold mb-2">${escapeHTML(quizTitle)} - ${labels.ansKey}</h1>
        <button onclick="window.print()" class="bg-white text-gray-800 px-6 py-2 rounded-full font-bold shadow hover:bg-gray-100 transition">
            🖨️ Print / Save as PDF
        </button>
    </div>

    ${answerKeyContent}
</body>
</html>`;
}
