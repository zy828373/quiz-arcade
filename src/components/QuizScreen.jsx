import { useState, useCallback } from 'react';
import { getBossAvatar } from '../utils/avatars';

const OPTION_KEYS = ['A', 'B', 'C', 'D'];

export default function QuizScreen({ questions, onComplete }) {
    const [currentIdx, setCurrentIdx] = useState(0);
    const [selectedOption, setSelectedOption] = useState(null);
    const [answers, setAnswers] = useState([]);
    const [animKey, setAnimKey] = useState(0);

    const total = questions.length;
    const question = questions[currentIdx];
    const progress = ((currentIdx) / total) * 100;

    const handleSelect = useCallback(
        (option) => {
            if (selectedOption !== null) return; // already selected
            setSelectedOption(option);

            const newAnswers = [
                ...answers,
                { questionId: question.id, answer: option },
            ];
            setAnswers(newAnswers);

            // Brief delay then advance
            setTimeout(() => {
                if (currentIdx + 1 >= total) {
                    onComplete(newAnswers);
                } else {
                    setCurrentIdx((prev) => prev + 1);
                    setSelectedOption(null);
                    setAnimKey((prev) => prev + 1);
                }
            }, 600);
        },
        [selectedOption, answers, question, currentIdx, total, onComplete]
    );

    if (!question) return null;

    return (
        <div className="screen" key={animKey}>
            {/* Top bar: stage + progress */}
            <div style={{ width: '100%' }}>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '8px',
                    }}
                >
                    <span className="stage-badge">
                        STAGE {currentIdx + 1}/{total}
                    </span>
                    <span className="text-sm">
                        {Math.round(progress)}% COMPLETE
                    </span>
                </div>
                <div className="progress-track">
                    <div
                        className="progress-fill"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            {/* Boss + Question card */}
            <div className="card pixel-border pixel-border--glow animate-pixelFadeIn">
                {/* Boss avatar */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '12px',
                        marginBottom: '20px',
                    }}
                >
                    <div className="boss-frame">
                        <img
                            src={getBossAvatar(currentIdx)}
                            alt={`Boss ${currentIdx + 1}`}
                        />
                    </div>
                    <span
                        className="text-sm"
                        style={{ color: 'var(--neon-pink)' }}
                    >
                        ★ BOSS {currentIdx + 1} ★
                    </span>
                </div>

                {/* Question text */}
                <p className="question-text" style={{ marginBottom: '20px' }}>
                    {question.question || question['题目']}
                </p>

                {/* Options */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                    }}
                >
                    {OPTION_KEYS.map((key) => {
                        const optionText = question[key];
                        if (!optionText) return null;

                        let className = 'option-btn';
                        if (selectedOption === key) {
                            className += ' selected';
                        }

                        return (
                            <button
                                key={key}
                                className={className}
                                onClick={() => handleSelect(key)}
                                disabled={selectedOption !== null}
                            >
                                <span className="option-label">{key}</span>
                                <span>{optionText}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
