import { useState } from 'react';
import { getBossAvatar } from '../utils/avatars';

export default function StartScreen({ onStart, error }) {
    const [id, setId] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        const trimmed = id.trim();
        if (!trimmed) return;
        onStart(trimmed);
    };

    return (
        <div className="screen">
            {/* Title */}
            <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                <h1 className="title-xl" style={{ marginBottom: '12px' }}>
                    ⚔ QUIZ ARCADE ⚔
                </h1>
                <p className="title-md">DEFEAT THE BOSSES</p>
            </div>

            {/* Decorative boss parade */}
            <div
                style={{
                    display: 'flex',
                    gap: '10px',
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                    margin: '8px 0',
                }}
            >
                {[0, 7, 23, 42, 66].map((idx) => (
                    <div
                        key={idx}
                        className="boss-frame"
                        style={{
                            width: '56px',
                            height: '56px',
                            borderColor: ['var(--neon-pink)', 'var(--neon-cyan)', 'var(--neon-green)', 'var(--neon-yellow)', 'var(--neon-orange)'][
                                [0, 7, 23, 42, 66].indexOf(idx)
                            ],
                            animationDelay: `${idx * 0.2}s`,
                        }}
                    >
                        <img src={getBossAvatar(idx)} alt={`Boss ${idx}`} />
                    </div>
                ))}
            </div>

            {/* Login card */}
            <div className="card pixel-border pixel-border--glow animate-slideUp">
                <form
                    onSubmit={handleSubmit}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '20px',
                    }}
                >
                    <label className="text-sm" htmlFor="player-id">
                        ENTER YOUR ID TO BEGIN
                    </label>
                    <input
                        id="player-id"
                        className="pixel-input"
                        type="text"
                        placeholder="YOUR ID..."
                        value={id}
                        onChange={(e) => setId(e.target.value)}
                        autoFocus
                        autoComplete="off"
                    />
                    <button
                        type="submit"
                        className="pixel-btn animate-pulse"
                        disabled={!id.trim()}
                    >
                        ▶ START GAME
                    </button>
                </form>

                {error && (
                    <p
                        className="text-sm"
                        style={{
                            color: 'var(--neon-red)',
                            textAlign: 'center',
                            marginTop: '14px',
                        }}
                    >
                        ⚠ {error}
                    </p>
                )}
            </div>

            {/* Footer hint */}
            <p className="text-sm" style={{ textAlign: 'center', opacity: 0.6 }}>
                ANSWER ALL QUESTIONS TO DEFEAT THE BOSSES
            </p>
        </div>
    );
}
