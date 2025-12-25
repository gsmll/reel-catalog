document.addEventListener('DOMContentLoaded', async () => {
    const reelsGrid = document.getElementById('reels-grid');
    const monthList = document.getElementById('month-list');
    const modal = document.getElementById('modal');
    const modalVideo = document.getElementById('modal-video');
    const modalUser = document.getElementById('modal-user');
    const modalDate = document.getElementById('modal-date');
    const closeBtn = document.querySelector('.close');

    let allReels = reelsData;

    try {
        // Group reels by month
        const grouped = groupReelsByMonth(allReels);
        renderTOC(grouped);

        // Initial render (most recent month)
        const initialMonth = Object.keys(grouped)[0];
        renderReels(grouped[initialMonth]);
        document.querySelector('.month-item').classList.add('active');

    } catch (err) {
        console.error('Error loading reels:', err);
    }

    function groupReelsByMonth(reels) {
        const months = {};
        reels.forEach(reel => {
            if (!reel.timestamp) return;
            const date = new Date(reel.timestamp);
            const monthKey = date.toLocaleString('default', { month: 'long', year: 'numeric' });
            if (!months[monthKey]) months[monthKey] = [];
            months[monthKey].push(reel);
        });
        return months;
    }

    function renderTOC(grouped) {
        monthList.innerHTML = '';
        const months = Object.keys(grouped);
        if (months.length === 0) return;

        const fragment = document.createDocumentFragment();
        months.forEach(month => {
            const div = document.createElement('div');
            div.className = 'month-item';
            div.textContent = month;
            div.dataset.month = month;
            fragment.appendChild(div);
        });
        monthList.appendChild(fragment);

        monthList.addEventListener('click', (e) => {
            const item = e.target.closest('.month-item');
            if (item && grouped[item.dataset.month]) {
                document.querySelectorAll('.month-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                renderReels(grouped[item.dataset.month]);

                // Safer scroll-to-top for mobile
                window.scrollTo(0, 0);
            }
        });
    }

    let currentReelIndex = -1;
    let currentReelsList = [];
    let favorites = new Set(JSON.parse(localStorage.getItem('favReels') || '[]'));
    let lastRenderedReels = [];

    const observerOptions = {
        root: null,
        rootMargin: '300px', // Preload sooner
        threshold: 0.01
    };

    // Safari-compatible thumbnail loader
    const videoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const video = entry.target;
                if (video.dataset.loaded) return;
                video.dataset.loaded = 'true';

                // For Safari: Force load first frame by playing briefly
                video.addEventListener('loadeddata', () => {
                    // Seek to 0.1s to get a thumbnail frame
                    video.currentTime = 0.1;
                }, { once: true });

                video.preload = 'metadata';
                video.load();
            }
        });
    }, observerOptions);

    function renderReels(reels) {
        if (!reels || reels.length === 0) return;

        lastRenderedReels = reels;

        // Hoist favorites to the top
        const sortedReels = [...reels].sort((a, b) => {
            const aFav = favorites.has(a.url) ? 1 : 0;
            const bFav = favorites.has(b.url) ? 1 : 0;
            return bFav - aFav;
        });

        currentReelsList = sortedReels;
        reelsGrid.innerHTML = '';

        const fragment = document.createDocumentFragment();

        sortedReels.forEach((reel, index) => {
            const card = document.createElement('div');
            const isFav = favorites.has(reel.url);
            card.className = `reel-card glass ${isFav ? 'is-favorite' : ''}`;

            const dateStr = new Date(reel.timestamp).toLocaleDateString();

            // Placeholder behind video - video overlays when loaded
            card.innerHTML = `
                <div class="reel-placeholder">
                    <span class="play-icon">▶</span>
                </div>
                <video src="${reel.url}" preload="none" muted playsinline></video>
                <div class="fav-btn ${isFav ? 'active' : ''}" data-url="${reel.url}">
                    ❤️
                </div>
                <div class="reel-info">
                    <div class="reel-user">${reel.user}</div>
                    <div class="reel-date">${dateStr}</div>
                </div>
            `;

            card.querySelector('.fav-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFav(reel.url);
            });

            card.addEventListener('click', () => openModal(reel, index));
            fragment.appendChild(card);
        });

        reelsGrid.appendChild(fragment);

        // Lazy load videos after DOM is ready (non-blocking)
        requestIdleCallback ? requestIdleCallback(lazyLoadVideos) : setTimeout(lazyLoadVideos, 100);
    }

    function lazyLoadVideos() {
        const videos = reelsGrid.querySelectorAll('video[preload="none"]');
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const video = entry.target;
                    video.preload = 'metadata';
                    video.load();
                    observer.unobserve(video);
                }
            });
        }, { rootMargin: '200px' });

        videos.forEach(v => observer.observe(v));
    }

    function toggleFav(url) {
        if (favorites.has(url)) {
            favorites.delete(url);
        } else {
            favorites.add(url);
        }
        localStorage.setItem('favReels', JSON.stringify([...favorites]));

        // Re-render to update sorting and highlights
        renderReels(lastRenderedReels);

        const modalFav = document.querySelector('.modal-fav-btn');
        if (modalFav && modalVideo.src === url) {
            modalFav.classList.toggle('active', favorites.has(url));
        }
    }

    function openModal(reel, index) {
        currentReelIndex = index;
        modalVideo.src = reel.url;
        modalUser.textContent = `Posted by ${reel.user}`;
        modalDate.textContent = new Date(reel.timestamp).toLocaleString();

        const isFav = favorites.has(reel.url);
        let modalFav = document.querySelector('.modal-fav-btn');
        if (!modalFav) {
            modalFav = document.createElement('button');
            modalFav.className = 'modal-fav-btn';
            modalFav.innerHTML = '❤️';
            modal.querySelector('.modal-content').appendChild(modalFav);
        }
        modalFav.classList.toggle('active', isFav);
        modalFav.onclick = () => toggleFav(reel.url);

        modal.style.display = 'flex';
        document.body.classList.add('modal-open');

        // iOS/Safari: Must start muted, then unmute after play starts
        modalVideo.muted = true;
        modalVideo.play().then(() => {
            // Unmute after playback starts (works around autoplay restrictions)
            modalVideo.muted = false;
        }).catch(err => {
            console.log('Autoplay blocked, user must tap to play');
        });
    }

    function navigateModal(direction) {
        if (modal.style.display !== 'flex') return;

        let newIndex = currentReelIndex + direction;
        if (newIndex >= 0 && newIndex < currentReelsList.length) {
            openModal(currentReelsList[newIndex], newIndex);
            prewarmNext(newIndex);
        }
    }

    closeBtn.onclick = () => {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
        modalVideo.pause();
        modalVideo.src = "";
        modalVideo.load(); // Unload source
    };

    window.onkeydown = (event) => {
        if (modal.style.display === 'flex') {
            if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) {
                event.preventDefault(); // Prevent background scroll
            }

            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                navigateModal(1);
            } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                navigateModal(-1);
            } else if (event.key === 'Escape') {
                closeBtn.onclick();
            }
        }
    };

    window.onclick = (event) => {
        if (event.target == modal) {
            closeBtn.onclick();
        }
    };

    // Optimization: Pre-warm video decoder for the next reel
    function prewarmNext(index) {
        const next = currentReelsList[index + 1];
        if (next) {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'video';
            link.href = next.url;
            document.head.appendChild(link);
        }
    }
});
