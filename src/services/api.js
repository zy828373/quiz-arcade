import { GAS_URL, QUESTION_COUNT } from '../config';
import { MOCK_QUESTIONS } from '../utils/mockData';

/**
 * Shuffle an array using Fisher-Yates algorithm.
 */
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/**
 * Fetch N random questions from Google Apps Script.
 * Falls back to built-in mock data when GAS_URL is not set.
 */
export async function fetchQuestions(count = QUESTION_COUNT) {
    // Mock mode — no backend configured
    if (!GAS_URL) {
        console.warn('[MOCK MODE] No VITE_GOOGLE_APP_SCRIPT_URL set, using sample questions.');
        const picked = shuffle(MOCK_QUESTIONS).slice(0, count);
        // Strip answer field to match real API behavior
        return picked.map(({ answer, ...rest }) => rest);
    }

    const url = `${GAS_URL}?action=getQuestions&count=${count}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch questions: ${res.status}`);
    const data = await res.json();

    if (data.error) throw new Error(data.error);
    return data.questions;
}

/**
 * Submit answers to Google Apps Script for grading.
 * In mock mode, grades locally using built-in answer key.
 */
export async function submitAnswers(playerId, answers) {
    // Mock mode — grade locally
    if (!GAS_URL) {
        console.warn('[MOCK MODE] Grading locally with built-in answers.');
        let score = 0;
        const details = answers.map(({ questionId, answer }) => {
            const q = MOCK_QUESTIONS.find((m) => m.id === questionId);
            const correctAnswer = q ? q.answer : '?';
            if (q && q.answer === answer) score++;
            return {
                questionId,
                playerAnswer: answer,
                correctAnswer,
            };
        });
        return {
            score,
            total: answers.length,
            passed: score >= (Number(import.meta.env.VITE_PASS_THRESHOLD) || 8),
            details,
        };
    }

    const res = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
            action: 'submitAnswers',
            playerId,
            answers,
        }),
    });
    if (!res.ok) throw new Error(`Failed to submit answers: ${res.status}`);
    const data = await res.json();

    if (data.error) throw new Error(data.error);
    return data;
}
