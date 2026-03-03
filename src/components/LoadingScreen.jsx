/**
 * Pixel-art loading screen with animated bar.
 */
export default function LoadingScreen({ message = 'LOADING...' }) {
    return (
        <div className="screen" style={{ justifyContent: 'center' }}>
            <div
                className="card pixel-border"
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '24px',
                    padding: '40px 32px',
                }}
            >
                <p
                    className="title-md"
                    style={{ animation: 'blink 1s step-end infinite' }}
                >
                    {message}
                </p>

                <div className="progress-track" style={{ maxWidth: '320px' }}>
                    <div
                        className="progress-fill"
                        style={{ animation: 'loadingBar 2s ease-in-out infinite' }}
                    />
                </div>

                <p className="text-sm" style={{ opacity: 0.5 }}>
                    PLEASE WAIT...
                </p>
            </div>
        </div>
    );
}
