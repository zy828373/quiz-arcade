import { useMemo } from 'react';

/**
 * Animated starfield background with twinkling pixel stars.
 */
export default function Starfield() {
    const stars = useMemo(() => {
        return Array.from({ length: 60 }, (_, i) => ({
            id: i,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            duration: `${2 + Math.random() * 4}s`,
            delay: `${Math.random() * 3}s`,
            size: Math.random() > 0.7 ? 3 : 2,
        }));
    }, []);

    return (
        <div className="starfield">
            {stars.map((s) => (
                <div
                    key={s.id}
                    className="star"
                    style={{
                        left: s.left,
                        top: s.top,
                        width: `${s.size}px`,
                        height: `${s.size}px`,
                        '--duration': s.duration,
                        '--delay': s.delay,
                    }}
                />
            ))}
        </div>
    );
}
