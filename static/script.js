/**
 * JEE Smart Practice — Main Application Script
 *
 * Handles all frontend logic for:
 *  - Practice mode (random questions)
 *  - Mock test (90 questions, timer, scoring)
 *  - Important topics display
 *  - Chatbot interaction
 *  - SPA navigation
 */

// ═══════════════════════════════════════════════════════════════════════
// APPLICATION STATE
// ═══════════════════════════════════════════════════════════════════════
const state = {
    currentQuestion: null,
    isAnswerSubmitted: false,
    selectedOption: null,

    // Mock test state
    mockQuestions: [],
    mockAnswers: {},       // { questionId: selectedOption }
    mockTimerInterval: null,
    mockTimeLeft: 3 * 60 * 60, // 3 hours in seconds
    mockTestActive: false,

    // Current page
    currentPage: 'practice',

    // Auth
    currentUser: null,
    sessionToken: localStorage.getItem('smart_exam_token') || null,
    // Chatbot
    chatSubject: 'physics',
};

// ═══════════════════════════════════════════════════════════════════════
// DOM CACHE  (practice section — populated on DOMContentLoaded)
// ═══════════════════════════════════════════════════════════════════════
let elements = {};

// Icons
const icons = {
    success: `<svg class="w-6 h-6 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>`,
    error: `<svg class="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg>`,
    warning: `<svg class="w-6 h-6 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>`
};


// ═══════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    // AUTH GUARD: redirect to /login if no session token
    if (!state.sessionToken) {
        window.location.href = '/login';
        return;
    }

    // Verify token is still valid
    fetch('/user/profile', {
        headers: { 'Authorization': `Bearer ${state.sessionToken}` }
    }).then(r => {
        if (!r.ok) {
            localStorage.removeItem('smart_exam_token');
            localStorage.removeItem('smart_exam_user');
            window.location.href = '/login';
            return;
        }
        return r.json();
    }).then(data => {
        if (data) {
            state.currentUser = data.user;
        }
    }).catch(() => { });

    // Cache practice-mode DOM elements
    elements = {
        loadingSpinner: document.getElementById('loading-spinner'),
        questionCard: document.getElementById('question-card'),
        subjectBadge: document.getElementById('subject-badge'),
        questionIdBadge: document.getElementById('question-id-badge'),
        questionText: document.getElementById('question-text'),
        optionsForm: document.getElementById('options-form'),
        numericalForm: document.getElementById('numerical-form'),
        numericalInput: document.getElementById('numerical-input'),
        submitBtn: document.getElementById('submit-btn'),
        nextBtn: document.getElementById('next-btn'),
        feedbackContainer: document.getElementById('feedback-container'),
        feedbackAlert: document.getElementById('feedback-alert'),
        feedbackIcon: document.getElementById('feedback-icon'),
        feedbackTitle: document.getElementById('feedback-title'),
        feedbackMessage: document.getElementById('feedback-message'),
        actionSpacer: document.getElementById('action-spacer'),
    };

    // Load first practice question
    loadNextQuestion();

    // Handle hash-based navigation (from dashboard links like /app#practice)
    const hash = window.location.hash.replace('#', '');
    if (hash && ['practice', 'mocktest', 'topics', 'chatbot', 'profile'].includes(hash)) {
        navigateTo(hash);
    }

    // Enter key for numerical input
    elements.numericalInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !state.isAnswerSubmitted) {
            e.preventDefault();
            submitAnswer();
        }
    });

    // Chat subject selector
    const subjPhysics = document.getElementById('chat-subject-physics');
    const subjChemistry = document.getElementById('chat-subject-chemistry');
    const subjMaths = document.getElementById('chat-subject-maths');
    function setChatSubject(subject) {
        state.chatSubject = subject;
        [subjPhysics, subjChemistry, subjMaths].forEach(btn => {
            if (!btn) return;
            btn.classList.remove('bg-brand-50', 'text-slate-900');
            btn.classList.add('text-slate-600');
        });
        if (subject === 'physics' && subjPhysics) {
            subjPhysics.classList.add('bg-brand-50', 'text-slate-900');
        } else if (subject === 'chemistry' && subjChemistry) {
            subjChemistry.classList.add('bg-brand-50', 'text-slate-900');
        } else if (subject === 'maths' && subjMaths) {
            subjMaths.classList.add('bg-brand-50', 'text-slate-900');
        }
    }
    if (subjPhysics) subjPhysics.addEventListener('click', () => setChatSubject('physics'));
    if (subjChemistry) subjChemistry.addEventListener('click', () => setChatSubject('chemistry'));
    if (subjMaths) subjMaths.addEventListener('click', () => setChatSubject('maths'));
    setChatSubject('physics');
});


// ═══════════════════════════════════════════════════════════════════════
// SPA NAVIGATION
// ═══════════════════════════════════════════════════════════════════════
function navigateTo(page) {
    // Hide all sections
    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));

    // Remove active from all nav links
    document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));

    // Show target section
    const section = document.getElementById(`section-${page}`);
    if (section) section.classList.add('active');

    // Highlight nav link
    const navLink = document.getElementById(`nav-${page}`);
    if (navLink) navLink.classList.add('active');

    state.currentPage = page;

    // Update hash for bookmarkability
    window.location.hash = page;

    // Load data when switching to specific pages
    if (page === 'topics') {
        loadImportantTopics();
    } else if (page === 'profile') {
        loadProfile();
    }
}


// ═══════════════════════════════════════════════════════════════════════
// AUTHENTICATION & LOGOUT
// ═══════════════════════════════════════════════════════════════════════

function logout() {
    if (state.sessionToken) {
        fetch('/logout', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.sessionToken}` }
        }).catch(e => console.error(e));
    }

    state.currentUser = null;
    state.sessionToken = null;
    localStorage.removeItem('smart_exam_token');
    localStorage.removeItem('smart_exam_user');
    window.location.href = '/';
}


// ═══════════════════════════════════════════════════════════════════════
// PROFILE LOGIC
// ═══════════════════════════════════════════════════════════════════════

async function loadProfile() {
    if (!state.currentUser) {
        // Try to get user data from localStorage
        try {
            const userStr = localStorage.getItem('smart_exam_user');
            if (userStr) state.currentUser = JSON.parse(userStr);
        } catch (e) { }
    }

    if (state.currentUser) {
        document.getElementById('profile-name').innerText = state.currentUser.name;
        document.getElementById('profile-email').innerText = state.currentUser.email;
        document.getElementById('profile-avatar').innerText = state.currentUser.name.charAt(0).toUpperCase();
    }

    try {
        const response = await fetch('/api/dashboard', {
            headers: { 'Authorization': `Bearer ${state.sessionToken}` }
        });
        if (response.ok) {
            const data = await response.json();
            document.getElementById('profile-total-attempted').innerText = data.total_attempts;
            document.getElementById('profile-overall-accuracy').innerText = `${Math.round(data.overall_accuracy * 100)}%`;
        }
    } catch (e) {
        console.error(e);
    }
}


// ═══════════════════════════════════════════════════════════════════════
// PRACTICE MODE  (preserved from original)
// ═══════════════════════════════════════════════════════════════════════

function getSubjectFromId(idString) {
    if (!idString) return "Practice";
    const match = idString.match(/_q(\d+)$/i);
    if (match) {
        const qNum = parseInt(match[1], 10);
        if (qNum >= 1 && qNum <= 30) return "Physics";
        if (qNum >= 31 && qNum <= 60) return "Chemistry";
        if (qNum >= 61 && qNum <= 90) return "Mathematics";
    }
    return "Practice Question";
}

function resetUI() {
    state.isAnswerSubmitted = false;
    state.selectedOption = null;

    elements.submitBtn.disabled = false;
    elements.submitBtn.classList.remove('hidden');
    elements.submitBtn.innerHTML = `
        <span>Submit Answer</span>
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 ml-2 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>`;
    elements.nextBtn.classList.add('hidden');

    elements.feedbackContainer.classList.add('hidden');
    elements.actionSpacer.classList.remove('hidden', 'sm:hidden');
    elements.actionSpacer.classList.add('sm:block');

    elements.optionsForm.innerHTML = '';
    elements.optionsForm.classList.add('hidden');

    elements.numericalForm.classList.add('hidden');
    elements.numericalInput.value = '';
    elements.numericalInput.disabled = false;
    elements.numericalInput.className = 'w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all shadow-sm text-slate-900 text-lg outline-none';

    elements.questionCard.classList.add('hidden');
    elements.loadingSpinner.classList.remove('hidden');
}

async function loadNextQuestion() {
    resetUI();
    try {
        const response = await fetch('/question', {
            cache: 'no-store',
            headers: { 'Authorization': `Bearer ${state.sessionToken}` }
        });
        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        state.currentQuestion = data;
        renderQuestion(data);
    } catch (error) {
        console.error("Failed to fetch question:", error);
        showError("Failed to load question. Please verify your connection.");
    }
}

function renderQuestion(questionData) {
    elements.loadingSpinner.classList.add('hidden');
    elements.questionCard.classList.remove('hidden');
    elements.questionCard.classList.add('flex');

    const subjectName = getSubjectFromId(questionData.id);
    elements.subjectBadge.textContent = subjectName;

    elements.subjectBadge.className = 'px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full uppercase tracking-widest shadow-sm border border-slate-200/60 transition-all duration-300 ';
    if (subjectName === 'Physics') elements.subjectBadge.classList.add('bg-blue-50', 'text-blue-700', 'border-blue-200');
    else if (subjectName === 'Chemistry') elements.subjectBadge.classList.add('bg-emerald-50', 'text-emerald-700', 'border-emerald-200');
    else if (subjectName === 'Mathematics') elements.subjectBadge.classList.add('bg-purple-50', 'text-purple-700', 'border-purple-200');
    else elements.subjectBadge.classList.add('bg-slate-100', 'text-slate-600');

    const match = questionData.id ? questionData.id.match(/_q(\d+)$/i) : null;
    elements.questionIdBadge.textContent = match ? `Q${match[1]}` : "Random Q";

    elements.questionText.innerHTML = '';
    
    // Images rendering logic
    if (questionData.images && questionData.images.length > 0) {
        const imgContainer = document.createElement('div');
        imgContainer.className = 'flex flex-col space-y-4 mb-4 items-center';
        
        // Show max 2 images as requested
        const imagesToShow = questionData.images.slice(0, 2);
        imagesToShow.forEach(imgPath => {
            const img = document.createElement('img');
            img.src = `/${imgPath}`;
            img.className = 'max-w-full rounded-lg border border-slate-200 shadow-sm';
            img.alt = 'Question figure';
            img.onerror = function() { this.style.display = 'none'; };
            imgContainer.appendChild(img);
        });
        
        elements.questionText.appendChild(imgContainer);
    }
    
    const textP = document.createElement('div');
    textP.className = 'whitespace-pre-wrap';
    textP.textContent = questionData.question;
    elements.questionText.appendChild(textP);

    if (questionData.options && Object.keys(questionData.options).length > 0) {
        elements.optionsForm.classList.remove('hidden');
        for (const [key, value] of Object.entries(questionData.options)) {
            elements.optionsForm.appendChild(createOptionElement(key, value));
        }
    } else {
        elements.numericalForm.classList.remove('hidden');
        setTimeout(() => elements.numericalInput.focus(), 100);
    }

    renderQuestionGraph(questionData.question);
    typesetMathInElement(elements.questionCard);
}

function createOptionElement(key, text) {
    const label = document.createElement('label');
    label.className = `group flex items-start p-4 border-2 border-slate-200 rounded-2xl cursor-pointer transition-all duration-300 hover:bg-slate-50 hover:border-brand-300 hover:shadow-md active:scale-[0.99]`;
    label.dataset.key = key;

    const radioContainer = document.createElement('div');
    radioContainer.className = 'flex items-center h-6 mt-0.5';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'answer_option';
    radio.value = key;
    radio.className = 'w-5 h-5 text-brand-600 bg-slate-100 border-slate-300 focus:ring-brand-500 focus:ring-2 cursor-pointer transition-all duration-200';
    radioContainer.appendChild(radio);

    const textDiv = document.createElement('div');
    textDiv.className = 'ml-4 flex-1';

    const badge = document.createElement('span');
    badge.className = 'font-bold text-slate-500 mr-2 bg-slate-100 px-2.5 py-1 rounded inline-block text-sm border border-slate-200 shadow-sm group-hover:bg-brand-100 group-hover:text-brand-700 transition-colors';
    badge.textContent = `${key}`;

    const textSpan = document.createElement('span');
    textSpan.className = 'text-slate-800 break-words font-medium leading-relaxed';
    textSpan.textContent = text;

    textDiv.appendChild(badge);
    textDiv.appendChild(textSpan);
    label.appendChild(radioContainer);
    label.appendChild(textDiv);

    radio.addEventListener('change', () => {
        if (state.isAnswerSubmitted) return;
        state.selectedOption = key;
        updateOptionStyles();
    });

    return label;
}

// ──────────────────────────────────────────────────────────────────────────────
// MathJax helpers & graph rendering
// ──────────────────────────────────────────────────────────────────────────────

function typesetMathInElement(el) {
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([el]).catch(() => { });
    }
}

let equationChart = null;

function renderQuestionGraph(questionText) {
    const container = document.getElementById('graph-container');
    const canvas = document.getElementById('equation-graph');
    if (!container || !canvas) return;

    const exprMatch = questionText && questionText.match(/y\s*=\s*([^\n]+)/i);
    if (!exprMatch) {
        container.classList.add('hidden');
        if (equationChart) {
            equationChart.destroy();
            equationChart = null;
        }
        return;
    }

    let expr = exprMatch[1].trim();
    // Keep only safe math characters
    expr = expr.replace(/[^0-9xX+\-*/().^ ]/g, '');
    expr = expr.replace(/\^/g, '**').replace(/X/g, 'x');

    const xs = [];
    const ys = [];
    for (let x = -10; x <= 10; x += 1) {
        let y;
        try {
            // eslint-disable-next-line no-eval
            y = eval(expr.replace(/x/g, `(${x})`));
        } catch {
            y = NaN;
        }
        if (isFinite(y)) {
            xs.push(x);
            ys.push(y);
        }
    }

    if (!xs.length) {
        container.classList.add('hidden');
        if (equationChart) {
            equationChart.destroy();
            equationChart = null;
        }
        return;
    }

    const ctx = canvas.getContext('2d');
    if (equationChart) {
        equationChart.destroy();
    }

    equationChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: xs,
            datasets: [{
                label: 'y = f(x)',
                data: ys,
                borderColor: 'rgba(124, 58, 237, 0.9)',
                backgroundColor: 'rgba(196, 181, 253, 0.3)',
                tension: 0.2,
                pointRadius: 0,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { title: { display: true, text: 'x' } },
                y: { title: { display: true, text: 'y' } },
            },
        },
    });

    container.classList.remove('hidden');
}

function updateOptionStyles() {
    const labels = elements.optionsForm.querySelectorAll('label');
    labels.forEach(label => {
        const radio = label.querySelector('input');
        const badge = label.querySelector('span');
        if (radio.checked) {
            label.classList.add('bg-brand-50', 'border-brand-500', 'shadow-md', 'ring-1', 'ring-brand-500', '-translate-y-0.5');
            label.classList.remove('border-slate-200', 'hover:bg-slate-50', 'hover:border-brand-300', 'hover:shadow-md');
            badge.classList.add('bg-brand-200', 'text-brand-800', 'border-brand-300');
            badge.classList.remove('bg-slate-100', 'text-slate-500', 'border-slate-200', 'group-hover:bg-brand-100', 'group-hover:text-brand-700');
        } else {
            label.classList.remove('bg-brand-50', 'border-brand-500', 'shadow-md', 'ring-1', 'ring-brand-500', '-translate-y-0.5');
            label.classList.add('border-slate-200', 'hover:bg-slate-50', 'hover:border-brand-300', 'hover:shadow-md');
            badge.classList.remove('bg-brand-200', 'text-brand-800', 'border-brand-300');
            badge.classList.add('bg-slate-100', 'text-slate-500', 'border-slate-200', 'group-hover:bg-brand-100', 'group-hover:text-brand-700');
        }
    });
}

async function submitAnswer() {
    if (state.isAnswerSubmitted) return;

    let answerValue = null;
    if (state.currentQuestion.options && Object.keys(state.currentQuestion.options).length > 0) {
        if (!state.selectedOption) {
            showFeedback('warning', 'Selection Required', 'Please select an option before submitting.');
            return;
        }
        answerValue = state.selectedOption;
    } else {
        answerValue = elements.numericalInput.value.trim();
        if (!answerValue) {
            showFeedback('warning', 'Input Required', 'Please enter your numerical answer before submitting.');
            return;
        }
    }

    try {
        elements.submitBtn.disabled = true;
        elements.submitBtn.innerHTML = `<div class="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div> Submitting...`;

        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${state.sessionToken}`
        };

        const response = await fetch("/check", {
            method: "POST",
            headers: headers,
            body: JSON.stringify({ question_id: state.currentQuestion.id, selected: answerValue })
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        state.isAnswerSubmitted = true;
        handleSubmissionResult(result, answerValue);
    } catch (error) {
        console.error("Submission failed:", error);
        showFeedback('error', 'Network Error', 'Failed to submit answer. Please try again.');
        elements.submitBtn.disabled = false;
        elements.submitBtn.innerHTML = `<span>Submit Answer</span><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>`;
    }
}

function handleSubmissionResult(result, selectedValue) {
    elements.submitBtn.classList.add('hidden');
    elements.nextBtn.classList.remove('hidden');
    elements.numericalInput.disabled = true;
    elements.optionsForm.querySelectorAll('input[type="radio"]').forEach(r => r.disabled = true);

    if (result.correct) {
        showFeedback('success', 'Correct!', 'Great job, your answer is right.');
        if (state.currentQuestion.options) {
            const correctLabel = document.querySelector(`label[data-key="${selectedValue}"]`);
            if (correctLabel) {
                correctLabel.classList.remove('border-brand-500', 'ring-brand-500');
                correctLabel.classList.add('bg-emerald-50', 'border-emerald-500', 'ring-1', 'ring-emerald-500');
                const badge = correctLabel.querySelector('span');
                badge.className = 'font-bold text-emerald-800 mr-2 bg-emerald-200 px-2.5 py-1 rounded inline-block text-sm border border-emerald-300';
            }
        } else {
            elements.numericalInput.className = 'w-full px-4 py-3 rounded-xl border-2 border-emerald-500 bg-emerald-50 text-emerald-800 font-bold text-lg outline-none';
        }
    } else {
        let correctAnswerText = result.answer;
        if (state.currentQuestion.options && state.currentQuestion.options[result.answer]) {
            correctAnswerText = `${result.answer}: ${state.currentQuestion.options[result.answer]}`;
        }
        showFeedback('error', 'Incorrect', `Correct answer: <span class="font-bold underline decoration-red-300 underline-offset-2">${correctAnswerText}</span>`);

        if (state.currentQuestion.options) {
            const selectedLabel = document.querySelector(`label[data-key="${selectedValue}"]`);
            if (selectedLabel) {
                selectedLabel.classList.remove('border-brand-500', 'ring-brand-500', 'bg-brand-50');
                selectedLabel.classList.add('bg-red-50', 'border-red-400', 'ring-1', 'ring-red-400');
                const badge = selectedLabel.querySelector('span');
                badge.className = 'font-bold text-red-800 mr-2 bg-red-200 px-2.5 py-1 rounded inline-block text-sm border border-red-300';
            }
            const correctLabel = document.querySelector(`label[data-key="${result.answer}"]`);
            if (correctLabel) {
                correctLabel.classList.remove('border-slate-200');
                correctLabel.classList.add('bg-emerald-50', 'border-emerald-500', 'ring-1', 'ring-emerald-500');
                const badge = correctLabel.querySelector('span');
                badge.className = 'font-bold text-emerald-800 mr-2 bg-emerald-200 px-2.5 py-1 rounded inline-block text-sm border border-emerald-300';
            }
        } else {
            elements.numericalInput.className = 'w-full px-4 py-3 rounded-xl border-2 border-red-400 bg-red-50 text-red-800 font-bold text-lg outline-none';
        }

        // Fetch explanation from backend
        fetchExplanation(state.currentQuestion.id, selectedValue);
    }
}

async function fetchExplanation(questionId, selectedValue) {
    try {
        const prev = elements.feedbackMessage.innerHTML;
        elements.feedbackMessage.innerHTML = `${prev}<br/><span class="text-xs text-slate-500">Generating explanation...</span>`;

        const response = await fetch('/explanation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.sessionToken}`,
            },
            body: JSON.stringify({ question_id: questionId, selected: selectedValue }),
        });
        if (!response.ok) return;
        const data = await response.json();
        if (data.explanation) {
            elements.feedbackMessage.innerHTML = `${prev}
                <div class="mt-4 bg-indigo-50/50 border-l-4 border-indigo-400 p-4 rounded-xl rounded-l-none shadow-sm animate-fade-in relative">
                    <div class="absolute -top-3 left-4 bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm border border-indigo-200">AI Explanation</div>
                    <span class="text-slate-700 text-sm whitespace-pre-line leading-relaxed block mt-2">${escapeHTML(data.explanation)}</span>
                </div>`;
            typesetMathInElement(elements.feedbackMessage);
        }
    } catch {
        // silent failure, feedback already shows correct answer
    }
}

function showFeedback(type, title, message) {
    elements.feedbackContainer.classList.remove('hidden');
    elements.actionSpacer.classList.remove('sm:block');

    elements.feedbackAlert.className = 'w-full flex items-start sm:items-center p-4 rounded-xl border shadow-sm animate-fade-in';
    if (type === 'success') {
        elements.feedbackIcon.innerHTML = icons.success;
        elements.feedbackAlert.classList.add('bg-emerald-50/80', 'border-emerald-200');
        elements.feedbackTitle.className = 'text-sm sm:text-base font-bold text-emerald-800';
        elements.feedbackMessage.className = 'text-sm mt-0.5 text-emerald-600';
    } else if (type === 'error') {
        elements.feedbackIcon.innerHTML = icons.error;
        elements.feedbackAlert.classList.add('bg-red-50/80', 'border-red-200');
        elements.feedbackTitle.className = 'text-sm sm:text-base font-bold text-red-800';
        elements.feedbackMessage.className = 'text-sm mt-0.5 text-red-600';
    } else if (type === 'warning') {
        elements.feedbackIcon.innerHTML = icons.warning;
        elements.feedbackAlert.classList.add('bg-amber-50/80', 'border-amber-200');
        elements.feedbackTitle.className = 'text-sm sm:text-base font-bold text-amber-800';
        elements.feedbackMessage.className = 'text-sm mt-0.5 text-amber-700';
        setTimeout(() => {
            if (!state.isAnswerSubmitted) {
                elements.feedbackContainer.classList.add('hidden');
                elements.actionSpacer.classList.add('sm:block');
            }
        }, 3000);
    }
    elements.feedbackTitle.textContent = title;
    elements.feedbackMessage.innerHTML = message;

    // Up the session counter if dealing with success/error from a real check
    if (type === 'success' || type === 'error') {
        const sessionCountEl = document.getElementById('session-count');
        const progressContainer = document.getElementById('practice-progress-container');
        if (sessionCountEl && progressContainer) {
            progressContainer.classList.remove('hidden');
            let currentStr = sessionCountEl.textContent;
            let count = parseInt(currentStr) || 0;
            sessionCountEl.textContent = count + 1;
        }
    }
}

function showError(msg) {
    elements.loadingSpinner.classList.add('hidden');
    elements.questionCard.classList.remove('hidden');
    elements.questionCard.classList.add('flex');
    elements.subjectBadge.textContent = 'Error';
    elements.subjectBadge.className = 'px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full bg-red-100 text-red-600 uppercase tracking-widest shadow-sm border border-red-200';
    elements.questionIdBadge.textContent = "---";
    elements.questionText.textContent = msg;
    elements.questionText.classList.add('text-red-600');
    elements.optionsForm.innerHTML = '';
    elements.optionsForm.classList.add('hidden');
    elements.numericalForm.classList.add('hidden');
    elements.submitBtn.classList.add('hidden');
    elements.nextBtn.classList.remove('hidden');
    elements.nextBtn.querySelector('span').textContent = 'Try Again';
}


// ═══════════════════════════════════════════════════════════════════════
// MOCK TEST MODE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Fetch 90 questions and start the mock test
 */
async function startMockTest() {
    const startBtn = document.getElementById('start-mock-btn');
    startBtn.disabled = true;
    startBtn.textContent = 'Loading questions...';

    try {
        const subjects = [];
        if (document.getElementById('mock-subject-physics')?.checked) subjects.push('physics');
        if (document.getElementById('mock-subject-chemistry')?.checked) subjects.push('chemistry');
        if (document.getElementById('mock-subject-maths')?.checked) subjects.push('mathematics');

        const countInput = document.getElementById('mock-questions-per-subject');
        const perSubject = countInput ? parseInt(countInput.value, 10) || 30 : 30;

        const hasCustom = subjects.length > 0 && perSubject > 0;

        let response;
        if (hasCustom) {
            response = await fetch('/mock_test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.sessionToken}` },
                body: JSON.stringify({ subjects, questions_per_subject: perSubject }),
            });
        } else {
            response = await fetch('/mock_test', {
                cache: 'no-store',
                headers: { 'Authorization': `Bearer ${state.sessionToken}` },
            });
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        state.mockQuestions = data.questions;
        state.mockAnswers = {};
        state.mockTimeLeft = 3 * 60 * 60; // 3 hours
        state.mockTestActive = true;

        // Hide start, show test area
        document.getElementById('mock-start').classList.add('hidden');
        document.getElementById('mock-test-area').classList.remove('hidden');
        document.getElementById('mock-results').classList.add('hidden');

        renderMockQuestions();
        startMockTimer();
        updateMockProgress();
    } catch (error) {
        console.error('Failed to load mock test:', error);
        startBtn.disabled = false;
        startBtn.textContent = 'Start Mock Test';
        alert('Failed to load mock test. Please try again.');
    }
}

/**
 * Render all 90 mock test questions
 */
function renderMockQuestions() {
    const container = document.getElementById('mock-questions-container');
    container.innerHTML = '';

    const subjectColors = {
        physics: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
        chemistry: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700' },
        mathematics: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', badge: 'bg-rose-100 text-rose-700' },
    };

    state.mockQuestions.forEach((q, idx) => {
        const subj = (q.subject || 'unknown').toLowerCase();
        const colors = subjectColors[subj] || { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', badge: 'bg-slate-100 text-slate-700' };

        const card = document.createElement('div');
        card.className = `bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden`;
        card.id = `mock-q-${idx}`;

        let optionsHTML = '';
        if (q.options && Object.keys(q.options).length > 0) {
            for (const [key, value] of Object.entries(q.options)) {
                optionsHTML += `
                    <label class="group flex items-start p-3 sm:p-4 border-2 border-slate-200 rounded-xl cursor-pointer transition-all duration-200 hover:bg-brand-50 hover:border-brand-200"
                           data-mock-q="${idx}" data-mock-key="${key}"
                           onclick="selectMockOption(${idx}, '${key}')">
                        <div class="flex items-center h-5">
                            <input type="radio" name="mock_q_${idx}" value="${key}"
                                class="w-4 h-4 text-brand-600 bg-slate-100 border-slate-300 focus:ring-brand-500 cursor-pointer">
                        </div>
                        <div class="ml-3 flex-1">
                            <span class="font-bold text-slate-500 mr-2 bg-slate-100/80 px-2 py-0.5 rounded text-xs border border-slate-200/50">${key}</span>
                            <span class="text-slate-800 text-sm font-medium break-words">${value}</span>
                        </div>
                    </label>`;
            }
        } else {
            optionsHTML = `
                <div class="max-w-xs">
                    <input type="text" placeholder="Type numerical answer..."
                        class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                        onchange="selectMockNumerical(${idx}, this.value)"
                        oninput="selectMockNumerical(${idx}, this.value)">
                </div>`;
        }

        let imagesHTML = '';
        if (q.images && q.images.length > 0) {
            imagesHTML += '<div class="flex flex-col space-y-4 mb-4 items-center">';
            const imagesToShow = q.images.slice(0, 2);
            imagesToShow.forEach(imgPath => {
                imagesHTML += `<img src="/${imgPath}" onerror="this.style.display='none'" class="max-w-full rounded-lg border border-slate-200 shadow-sm" alt="Question figure">`;
            });
            imagesHTML += '</div>';
        }

        card.innerHTML = `
            <div class="px-5 py-3 border-b border-slate-100 ${colors.bg} flex items-center justify-between">
                <div class="flex items-center space-x-3">
                    <span class="text-sm font-extrabold text-slate-900">#${idx + 1}</span>
                    <span class="px-2 py-0.5 text-xs font-bold rounded-full ${colors.badge} uppercase tracking-wider">${subj}</span>
                </div>
            </div>
            <div class="p-5">
                ${imagesHTML}
                <p class="text-sm sm:text-base text-slate-900 leading-relaxed font-medium mb-4 whitespace-pre-wrap">${q.question}</p>
                <div class="space-y-2">${optionsHTML}</div>
            </div>`;

        container.appendChild(card);
    });

    typesetMathInElement(container);
}

/**
 * Handle MCQ option selection in mock test
 */
function selectMockOption(questionIdx, key) {
    const qId = state.mockQuestions[questionIdx].id;
    state.mockAnswers[qId] = key;

    // Update styles for this question
    const labels = document.querySelectorAll(`label[data-mock-q="${questionIdx}"]`);
    labels.forEach(label => {
        const radio = label.querySelector('input');
        const labelKey = label.dataset.mockKey;
        if (labelKey === key) {
            radio.checked = true;
            label.classList.add('bg-brand-50', 'border-brand-500', 'ring-1', 'ring-brand-500');
            label.classList.remove('border-slate-200', 'hover:bg-brand-50', 'hover:border-brand-200');
        } else {
            radio.checked = false;
            label.classList.remove('bg-brand-50', 'border-brand-500', 'ring-1', 'ring-brand-500');
            label.classList.add('border-slate-200', 'hover:bg-brand-50', 'hover:border-brand-200');
        }
    });

    updateMockProgress();
}

/**
 * Handle numerical input in mock test
 */
function selectMockNumerical(questionIdx, value) {
    const qId = state.mockQuestions[questionIdx].id;
    if (value.trim()) {
        state.mockAnswers[qId] = value.trim();
    } else {
        delete state.mockAnswers[qId];
    }
    updateMockProgress();
}

/**
 * Update progress bar and count
 */
function updateMockProgress() {
    const answered = Object.keys(state.mockAnswers).length;
    const total = state.mockQuestions.length;
    const pct = total > 0 ? (answered / total) * 100 : 0;

    const progressText = document.getElementById('mock-progress-text');
    const progressBar = document.getElementById('mock-progress-bar');

    if (progressText) progressText.textContent = `${answered} / ${total} answered`;
    if (progressBar) progressBar.style.width = `${pct}%`;
}

/**
 * Start the 3-hour countdown timer
 */
function startMockTimer() {
    const timerEl = document.getElementById('mock-timer');

    if (state.mockTimerInterval) clearInterval(state.mockTimerInterval);

    state.mockTimerInterval = setInterval(() => {
        if (state.mockTimeLeft <= 0) {
            clearInterval(state.mockTimerInterval);
            submitMockTest();
            return;
        }

        state.mockTimeLeft--;

        const hours = Math.floor(state.mockTimeLeft / 3600);
        const mins = Math.floor((state.mockTimeLeft % 3600) / 60);
        const secs = state.mockTimeLeft % 60;

        timerEl.textContent = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        // Warning at 10 minutes
        if (state.mockTimeLeft <= 600) {
            timerEl.classList.add('timer-warning');
        }
    }, 1000);
}

/**
 * Submit the entire mock test for scoring
 */
async function submitMockTest() {
    if (!state.mockTestActive) return;
    state.mockTestActive = false;

    // Stop timer
    if (state.mockTimerInterval) {
        clearInterval(state.mockTimerInterval);
        state.mockTimerInterval = null;
    }

    const submitBtn = document.getElementById('submit-mock-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Scoring...';

    // Build answers array
    const answers = Object.entries(state.mockAnswers).map(([qid, sel]) => ({
        question_id: qid,
        selected: sel
    }));

    try {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.sessionToken}`
        };

        const response = await fetch('/submit_mock_test', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ answers })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();

        renderMockResults(result);
    } catch (error) {
        console.error('Failed to submit mock test:', error);
        alert('Failed to submit test. Please try again.');
        state.mockTestActive = true;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Test';
    }
}

/**
 * Render the results dashboard after mock test
 */
function renderMockResults(result) {
    document.getElementById('mock-test-area').classList.add('hidden');

    const resultsDiv = document.getElementById('mock-results');
    resultsDiv.classList.remove('hidden');

    const overallPct = Math.round(result.total_accuracy * 100);
    const scoreColor = overallPct >= 80 ? 'emerald' : overallPct >= 60 ? 'amber' : 'red';

    // 1. Render Top Cards (Score, Accuracy, Questions Attempted)
    const cardsContainer = document.getElementById('mock-results-cards');
    cardsContainer.innerHTML = `
        <!-- Score Card -->
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 text-center">
            <div class="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full bg-${scoreColor}-50 border-4 border-${scoreColor}-200 flex items-center justify-center mb-3">
                <span class="text-xl sm:text-2xl font-extrabold text-${scoreColor}-600">${result.score}</span>
            </div>
            <p class="text-sm text-slate-500 font-medium">Total Score</p>
            <p class="text-xs text-slate-400 mt-1">out of ${result.total}</p>
        </div>

        <!-- Accuracy Card -->
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 text-center">
            <div class="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full bg-${scoreColor}-50 border-4 border-${scoreColor}-200 flex items-center justify-center mb-3">
                <span class="text-xl sm:text-2xl font-extrabold text-${scoreColor}-600">${overallPct}%</span>
            </div>
            <p class="text-sm text-slate-500 font-medium">Overall Accuracy</p>
        </div>

        <!-- Questions Answered -->
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 text-center">
            <div class="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full bg-brand-50 border-4 border-brand-200 flex items-center justify-center mb-3">
                <span class="text-xl sm:text-2xl font-extrabold text-brand-600">${Object.keys(state.mockAnswers).length}</span>
            </div>
            <p class="text-sm text-slate-500 font-medium">Questions Attempted</p>
            <p class="text-xs text-slate-400 mt-1">out of ${state.mockQuestions.length}</p>
        </div>
    `;

    // 2. Render Chart.js Performance Chart
    const ctx = document.getElementById('performanceChart').getContext('2d');

    // Destroy existing chart instance if it exists to prevent overlap when retaking
    if (window.mockPerformanceChart) {
        window.mockPerformanceChart.destroy();
    }

    const physicsPct = Math.round(result.physics_accuracy * 100);
    const chemistryPct = Math.round(result.chemistry_accuracy * 100);
    const mathsPct = Math.round(result.maths_accuracy * 100);

    window.mockPerformanceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Physics', 'Chemistry', 'Mathematics'],
            datasets: [{
                label: 'Subject Accuracy (%)',
                data: [physicsPct, chemistryPct, mathsPct],
                backgroundColor: [
                    'rgba(59, 130, 246, 0.8)',   // blue-500
                    'rgba(16, 185, 129, 0.8)',   // emerald-500
                    'rgba(244, 63, 94, 0.8)'     // rose-500
                ],
                borderColor: [
                    'rgb(37, 99, 235)',         // blue-600
                    'rgb(5, 150, 105)',         // emerald-600
                    'rgb(225, 29, 72)'          // rose-600
                ],
                borderWidth: 1,
                borderRadius: 6,
                barPercentage: 0.6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return ` ${context.parsed.y}% Accuracy`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: function (value) { return value + "%" }
                    },
                    grid: { color: 'rgba(0, 0, 0, 0.05)' }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });

    // 3. Render Remarks & Insights
    const overallRemarkTitle = document.getElementById('overall-remark-title');
    overallRemarkTitle.textContent = result.remarks;

    // Set color based on remark string content
    if (result.remarks.includes("Excellent")) {
        overallRemarkTitle.className = "text-xl font-extrabold text-emerald-600 mb-4";
    } else if (result.remarks.includes("Good")) {
        overallRemarkTitle.className = "text-xl font-extrabold text-amber-600 mb-4";
    } else {
        overallRemarkTitle.className = "text-xl font-extrabold text-red-600 mb-4";
    }

    const insightsList = document.getElementById('insights-list');
    if (result.insights && result.insights.length > 0) {
        insightsList.innerHTML = result.insights.map(insight => {
            let icon = '📝';
            if (insight.includes('strong')) icon = '🌟';
            else if (insight.includes('practice')) icon = '⚡';
            return `<li class="flex items-start space-x-3 py-1">
                        <span class="text-base">${icon}</span>
                        <span class="text-sm font-medium text-slate-700 leading-snug">${insight}</span>
                    </li>`;
        }).join('');
    } else {
        insightsList.innerHTML = '';
    }

    // 4. Render Weak Areas, Weak Topics, & Recommendations
    const weakAreasContainer = document.getElementById('weak-areas-container');

    let weakTopicsHTML = '';
    let hasWeakTopics = false;

    if (result.weak_topics && Object.keys(result.weak_topics).length > 0) {
        hasWeakTopics = true;
        // Group by subject and build tags
        for (const [subj, topics] of Object.entries(result.weak_topics)) {
            if (topics.length > 0) {
                const subjLabel = subj.charAt(0).toUpperCase() + subj.slice(1);
                weakTopicsHTML += `
                    <div class="mb-3">
                        <span class="text-xs font-bold text-slate-500 block mb-1 uppercase tracking-wider">${subjLabel}</span>
                        <div class="flex flex-wrap gap-2 text-xs">
                            ${topics.map(t => `<span class="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg font-semibold tracking-wide border border-amber-200">${t}</span>`).join('')}
                        </div>
                    </div>`;
            }
        }
    }

    let recommendationsHTML = '';
    if (result.recommendation && result.recommendation.length > 0) {
        recommendationsHTML = `
            <div class="mt-4 pt-4 border-t border-amber-200 border-dashed">
                <h5 class="text-xs font-bold text-amber-800 mb-2 uppercase tracking-wide">Actionable Advice</h5>
                <ul class="space-y-1">
                    ${result.recommendation.map(r => `<li class="flex items-start text-sm text-amber-900"><span class="mr-2">💡</span><span>${r}</span></li>`).join('')}
                </ul>
            </div>`;
    }

    if (hasWeakTopics) {
        weakAreasContainer.innerHTML = `
            <div class="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-200">
                <h4 class="text-sm font-bold text-amber-800 mb-3 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Weak Topics Detected
                </h4>
                ${weakTopicsHTML}
                ${recommendationsHTML}
                <div class="mt-4 pt-3 border-t border-amber-200">
                    <button onclick='practiceWeakTopics(${JSON.stringify(result.weak_topics).replace(/'/g, "&#39;")})'
                        class="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-xl shadow-sm transition-all active:scale-95 text-sm flex justify-center items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Practice Weak Topics
                    </button>
                </div>
            </div>`;
    } else {
        if (result.weak_areas && result.weak_areas.length > 0) {
            weakAreasContainer.innerHTML = `
                <div class="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-200">
                    <h4 class="text-sm font-bold text-amber-800 mb-3 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Weak Subjects
                    </h4>
                    <div class="flex flex-wrap gap-2 text-xs">
                        ${result.weak_areas.map(w => `<span class="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg font-semibold uppercase tracking-wide border border-amber-200">${w}</span>`).join('')}
                    </div>
                </div>`;
        } else {
            weakAreasContainer.innerHTML = '';
        }
    }
}

/**
 * Trigger practice session filtered by weak topics
 */
async function practiceWeakTopics(weakTopicsMap) {
    try {
        const btn = document.querySelector('#weak-areas-container button');
        const originalText = btn.innerHTML;
        btn.innerHTML = 'Loading Practice...';
        btn.disabled = true;

        const response = await fetch('/practice_weak_topics', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.sessionToken}`
            },
            body: JSON.stringify({ weak_topics: weakTopicsMap })
        });

        if (!response.ok) throw new Error('Failed to load weak topic questions');

        const data = await response.json();

        // Load the practice view with these questions
        showSection('practice');

        // Store them globally (if we had a queue for practice, we would use it)
        // For the single-question practice ui:
        if (data.questions && data.questions.length > 0) {
            // Replace the current practice question with the first from the targeted set
            const q = data.questions[0];
            state.currentPracticeQuestion = q;
            renderPracticeQuestion(q);
            hidePracticeFeedback();
        } else {
            alert('Could not find enough questions matching those topics.');
        }

    } catch (e) {
        console.error(e);
        alert('An error occurred loading weak topic questions.');
    } finally {
        // Reset button in case they go back
        const btn = document.querySelector('#weak-areas-container button');
        if (btn) {
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>Practice Weak Topics`;
            btn.disabled = false;
        }
    }
}

/**
 * Reset mock test to start screen
 */
function retakeMockTest() {
    state.mockQuestions = [];
    state.mockAnswers = {};
    state.mockTestActive = false;

    document.getElementById('mock-results').classList.add('hidden');
    document.getElementById('mock-test-area').classList.add('hidden');
    document.getElementById('mock-start').classList.remove('hidden');

    const startBtn = document.getElementById('start-mock-btn');
    startBtn.disabled = false;
    startBtn.textContent = 'Start Mock Test';
}


// ═══════════════════════════════════════════════════════════════════════
// IMPORTANT TOPICS
// ═══════════════════════════════════════════════════════════════════════

let topicsLoaded = false;

async function loadImportantTopics() {
    if (topicsLoaded) return;

    try {
        const response = await fetch('/important_topics', {
            cache: 'no-store',
            headers: { 'Authorization': `Bearer ${state.sessionToken}` }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        const container = document.getElementById('topics-container');
        const loading = document.getElementById('topics-loading');

        const subjectConfig = {
            physics: { icon: '⚡', gradient: 'from-blue-500 to-blue-600', light: 'bg-blue-50', border: 'border-blue-200' },
            chemistry: { icon: '🧪', gradient: 'from-emerald-500 to-emerald-600', light: 'bg-emerald-50', border: 'border-emerald-200' },
            mathematics: { icon: '📐', gradient: 'from-rose-500 to-rose-600', light: 'bg-rose-50', border: 'border-rose-200' },
        };

        container.innerHTML = '';

        for (const [subj, topics] of Object.entries(data)) {
            const config = subjectConfig[subj] || { icon: '📚', gradient: 'from-slate-500 to-slate-600', light: 'bg-slate-50', border: 'border-slate-200' };

            const topicItems = topics.map((t, i) => `
                <li class="flex items-center space-x-3 py-2.5 ${i < topics.length - 1 ? 'border-b border-slate-100' : ''}">
                    <span class="w-6 h-6 rounded-full bg-gradient-to-r ${config.gradient} text-white text-xs font-bold flex items-center justify-center flex-shrink-0">${i + 1}</span>
                    <span class="text-sm font-medium text-slate-700">${t}</span>
                </li>`).join('');

            const card = document.createElement('div');
            card.className = `bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden`;
            card.innerHTML = `
                <div class="px-6 py-4 bg-gradient-to-r ${config.gradient} text-white">
                    <div class="flex items-center space-x-3">
                        <span class="text-2xl">${config.icon}</span>
                        <h3 class="text-lg font-bold capitalize">${subj}</h3>
                    </div>
                </div>
                <div class="p-6">
                    <ul>${topicItems || '<li class="text-sm text-slate-400">No topics detected</li>'}</ul>
                </div>`;

            container.appendChild(card);
        }

        loading.classList.add('hidden');
        container.classList.remove('hidden');
        topicsLoaded = true;
    } catch (error) {
        console.error('Failed to load topics:', error);
        document.getElementById('topics-loading').innerHTML = '<p class="text-red-500 font-medium">Failed to load topics. Please refresh.</p>';
    }
}


// ═══════════════════════════════════════════════════════════════════════
// CHATBOT
// ═══════════════════════════════════════════════════════════════════════

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message) return;

    const chatMessages = document.getElementById('chat-messages');

    // Add user message
    const userBubble = document.createElement('div');
    userBubble.className = 'flex justify-end animate-fade-in';
    userBubble.innerHTML = `<div class="chat-bubble-user px-4 py-3 max-w-sm shadow-sm"><p class="text-sm leading-relaxed">${escapeHTML(message)}</p></div>`;
    chatMessages.appendChild(userBubble);

    // Clear input
    input.value = '';

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Show typing indicator
    const typingId = 'typing-' + Date.now();
    const typingBubble = document.createElement('div');
    typingBubble.id = typingId;
    typingBubble.className = 'flex items-start space-x-3 animate-fade-in';
    typingBubble.innerHTML = `
        <div class="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
        </div>
        <div class="chat-bubble-bot px-4 py-3 shadow-sm">
            <div class="flex space-x-1">
                <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 0s"></div>
                <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 0.4s"></div>
            </div>
        </div>`;
    chatMessages.appendChild(typingBubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
        const subject = state.chatSubject || 'physics';
        const endpoint = subject === 'chemistry' ? '/chat/chemistry'
            : subject === 'maths' ? '/chat/maths'
                : '/chat/physics';

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.sessionToken}`
            },
            body: JSON.stringify({ message })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        // Remove typing indicator
        const typing = document.getElementById(typingId);
        if (typing) typing.remove();

        // Add bot response
        const botBubble = document.createElement('div');
        botBubble.className = 'flex items-start space-x-3 animate-fade-in';
        botBubble.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
            </div>
            <div class="chat-bubble-bot px-4 py-3 max-w-md shadow-sm">
                <div class="text-sm leading-relaxed whitespace-pre-line">${formatChatResponse(data.response)}</div>
            </div>`;
        chatMessages.appendChild(botBubble);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        typesetMathInElement(botBubble);

    } catch (error) {
        console.error('Chat error:', error);
        const typing = document.getElementById(typingId);
        if (typing) typing.remove();

        const errorBubble = document.createElement('div');
        errorBubble.className = 'flex items-start space-x-3 animate-fade-in';
        errorBubble.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg class="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg>
            </div>
            <div class="chat-bubble-bot px-4 py-3 max-w-sm shadow-sm border border-red-200 bg-red-50">
                <p class="text-sm text-red-600">Failed to get response. Please try again.</p>
            </div>`;
        chatMessages.appendChild(errorBubble);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

/**
 * Format chat response (basic markdown-like formatting)
 */
function formatChatResponse(text) {
    if (!text) return '';
    // Bold **text**
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Bullet points
    text = text.replace(/^[•\-]\s/gm, '• ');
    return text;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}