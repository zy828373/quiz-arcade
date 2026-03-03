import { useState } from 'react';
import { getBossAvatar } from '../utils/avatars';

const OPTION_KEYS = ['A', 'B', 'C', 'D'];

export default function ResultScreen({ result, questions, answers, threshold, onRestart }) {
    const { score, total, passed, details } = result;
    const percentage = Math.round((score / total) * 100);
    const [showReview, setShowReview] = useState(false);

    // Build a lookup: questionId → detail (playerAnswer, correctAnswer)
    const detailMap = {};
    if (details) {
        details.forEach((d) => {
            detailMap[d.questionId] = d;
        });
    }

    return (
        <div className="screen">
            {/* Result header */}
            <div style={{ textAlign: 'center' }}>
                <h2
                    className="title-xl"
                    style={{
                        color: passed ? 'var(--neon-green)' : 'var(--neon-red)',
                        textShadow: passed
                            ? '0 0 20px var(--neon-green), 0 0 40px rgba(57,255,20,0.3)'
                            : '0 0 20px var(--neon-red), 0 0 40px rgba(255,23,68,0.3)',
                        marginBottom: '8px',
                    }}
                >
                    {passed ? '★ VICTORY ★' : '✖ GAME OVER ✖'}
                </h2>
                <p className="title-md">
                    {passed ? 'ALL BOSSES DEFEATED!' : 'THE BOSSES WIN THIS TIME...'}
                </p>
            </div>

            {/* Boss celebration / defeat */}
            <div
                style={{
                    display: 'flex',
                    gap: '8px',
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                }}
            >
                {[12, 37, 55, 78, 91].map((idx) => (
                    <div
                        key={idx}
                        className="boss-frame"
                        style={{
                            width: '52px',
                            height: '52px',
                            borderColor: passed ? 'var(--neon-green)' : 'var(--neon-red)',
                            opacity: passed ? 0.5 : 1,
                            filter: passed ? 'grayscale(0.8)' : 'none',
                            animation: passed ? 'none' : 'bossFloat 2s ease-in-out infinite',
                            animationDelay: `${idx * 0.15}s`,
                        }}
                    >
                        <img src={getBossAvatar(idx)} alt={`Boss ${idx}`} />
                    </div>
                ))}
            </div>

            {/* Score card */}
            <div className="card pixel-border pixel-border--glow animate-slideUp">
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '20px',
                    }}
                >
                    {/* Big score number */}
                    <div className={`score-big ${passed ? 'pass' : 'fail'}`}>
                        {score}/{total}
                    </div>

                    {/* Percentage bar */}
                    <div style={{ width: '100%', maxWidth: '300px' }}>
                        <div className="progress-track">
                            <div
                                className="progress-fill"
                                style={{
                                    width: `${percentage}%`,
                                    background: passed
                                        ? 'linear-gradient(90deg, var(--neon-green), var(--neon-cyan))'
                                        : 'linear-gradient(90deg, var(--neon-red), var(--neon-orange))',
                                    boxShadow: passed
                                        ? '0 0 8px var(--neon-green)'
                                        : '0 0 8px var(--neon-red)',
                                }}
                            />
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginTop: '6px',
                            }}
                        >
                            <span className="text-sm">0%</span>
                            <span className="text-sm">{percentage}% CORRECT</span>
                            <span className="text-sm">100%</span>
                        </div>
                    </div>

                    {/* Threshold info */}
                    <p className="text-sm" style={{ textAlign: 'center' }}>
                        PASS THRESHOLD: {threshold} CORRECT ANSWERS
                    </p>

                    {/* Verdict badge */}
                    <div
                        style={{
                            padding: '8px 20px',
                            border: `3px solid ${passed ? 'var(--neon-green)' : 'var(--neon-red)'}`,
                            color: passed ? 'var(--neon-green)' : 'var(--neon-red)',
                            fontSize: 'clamp(0.55rem, 1.3vw, 0.7rem)',
                            fontFamily: 'var(--font-pixel)',
                            textShadow: `0 0 8px ${passed ? 'rgba(57,255,20,0.4)' : 'rgba(255,23,68,0.4)'}`,
                        }}
                    >
                        {passed ? '✔ PASSED' : '✖ FAILED'}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <button
                            className="pixel-btn"
                            onClick={() => setShowReview((v) => !v)}
                            style={{
                                borderColor: 'var(--neon-orange)',
                                color: 'var(--neon-orange)',
                                marginTop: '8px',
                            }}
                        >
                            {showReview ? '▲ HIDE REVIEW' : '📋 REVIEW ANSWERS'}
                        </button>
                        <button
                            className="pixel-btn"
                            onClick={onRestart}
                            style={{
                                borderColor: 'var(--neon-cyan)',
                                color: 'var(--neon-cyan)',
                                marginTop: '8px',
                            }}
                        >
                            ↻ PLAY AGAIN
                        </button>
                    </div>
                </div>
            </div>

            {/* Review section */}
            {showReview && questions && questions.length > 0 && (
                <div className="review-section animate-slideUp">
                    <h3 className="review-title">📋 ANSWER REVIEW</h3>

                    {/* Guard: details required for accurate review */}
                    {!details || details.length === 0 ? (
                        <div className="card pixel-border" style={{ textAlign: 'center', padding: '20px' }}>
                            <p className="text-sm" style={{ color: 'var(--neon-orange)', lineHeight: '2.2' }}>
                                ⚠ DETAILED REVIEW UNAVAILABLE
                            </p>
                            <p className="text-sm" style={{ marginTop: '8px', lineHeight: '2' }}>
                                UPDATE BACKEND (CODE.GS) AND REDEPLOY TO ENABLE ANSWER REVIEW.
                            </p>
                        </div>
                    ) : (
                        <div className="review-list">
                            {questions.map((q, idx) => {
                                const detail = detailMap[q.id];
                                if (!detail) return null;

                                const playerAnswer = detail.playerAnswer;
                                const correctAnswer = detail.correctAnswer;
                                const isCorrect = playerAnswer && correctAnswer
                                    && playerAnswer.toUpperCase() === correctAnswer.toUpperCase();

                                return (
                                    <div
                                        key={q.id}
                                        className={`review-card ${isCorrect ? 'review-card--correct' : 'review-card--wrong'}`}
                                    >
                                        {/* Question header */}
                                        <div className="review-card__header">
                                            <span className="review-card__number">Q{idx + 1}</span>
                                            <span className={`review-card__badge ${isCorrect ? 'badge--correct' : 'badge--wrong'}`}>
                                                {isCorrect ? '✔ CORRECT' : '✖ WRONG'}
                                            </span>
                                        </div>

                                        {/* Question text */}
                                        <p className="review-card__question">
                                            {q.question || q['题目']}
                                        </p>

                                        {/* Options */}
                                        <div className="review-card__options">
                                            {OPTION_KEYS.map((key) => {
                                                const optionText = q[key];
                                                if (!optionText) return null;

                                                const isPlayerChoice = playerAnswer && playerAnswer.toUpperCase() === key;
                                                const isCorrectOption = correctAnswer && correctAnswer.toUpperCase() === key;

                                                let optClass = 'review-option';
                                                if (isCorrectOption) optClass += ' review-option--correct';
                                                if (isPlayerChoice && !isCorrectOption) optClass += ' review-option--wrong';

                                                return (
                                                    <div key={key} className={optClass}>
                                                        <span className="review-option__key">{key}</span>
                                                        <span className="review-option__text">{optionText}</span>
                                                        {isCorrectOption && <span className="review-option__icon">✔</span>}
                                                        {isPlayerChoice && !isCorrectOption && <span className="review-option__icon">✖</span>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
