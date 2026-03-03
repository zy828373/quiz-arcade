const AVATAR_COUNT = 100;
const DICEBEAR_BASE = 'https://api.dicebear.com/9.x/pixel-art/svg';

// Pre-generate 100 unique boss avatar URLs
const avatarPool = Array.from({ length: AVATAR_COUNT }, (_, i) => {
    const seed = `boss_${String(i).padStart(3, '0')}`;
    return `${DICEBEAR_BASE}?seed=${seed}&backgroundColor=transparent&scale=90`;
});

/**
 * Get a boss avatar URL for a given question index.
 * Wraps around if index exceeds pool size.
 */
export function getBossAvatar(index) {
    return avatarPool[index % AVATAR_COUNT];
}

/**
 * Preload avatar images into browser cache.
 * Returns a promise that resolves when all images are loaded (or failed).
 */
export function preloadAvatars(count = 10) {
    const urls = avatarPool.slice(0, count);
    return Promise.allSettled(
        urls.map(
            (url) =>
                new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = url;
                })
        )
    );
}

export { avatarPool };
