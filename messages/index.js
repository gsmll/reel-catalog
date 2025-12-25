document.addEventListener('DOMContentLoaded', () => {
    const reelsGrid = document.getElementById('reels-grid');
    const monthList = document.getElementById('month-list');
    const modal = document.getElementById('modal');
    const modalVideo = document.getElementById('modal-video');
    const modalUser = document.getElementById('modal-user');
    const modalDate = document.getElementById('modal-date');
    const closeBtn = document.querySelector('.close');

    const allReels = reelsData;
    let currentReelIndex = -1;
    let currentReelsList = [];
    let favorites = new Set(JSON.parse(localStorage.getItem('favReels') || '[]'));
    let lastRenderedReels = [];
    let videoLoadQueue = [];
    let isLoadingVideos = false;

    try {
        const grouped = groupReelsByMonth(allReels);
        renderTOC(grouped);
        const initialMonth = Object.keys(grouped)[0];
        if (initialMonth) {
            renderReels(grouped[initialMonth]);
            document.querySelector('.month-item')?.classList.add('active');
        }
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
                window.scrollTo(0, 0);
            }
        });
    }

    // Throttled video loader - only 3 at a time to prevent crashes
    function processVideoQueue() {
        if (isLoadingVideos || videoLoadQueue.length === 0) return;
        isLoadingVideos = true;

        const batch = videoLoadQueue.splice(0, 3); // Load 3 at a time
        let loaded = 0;

        batch.forEach(video => {
            video.preload = 'metadata';
            const onLoad = () => {
                video.currentTime = 0.1; // Get thumbnail frame
                loaded++;
                if (loaded >= batch.length) {
                    isLoadingVideos = false;
                    setTimeout(processVideoQueue, 50); // Small delay before next batch
                }
            };
            video.addEventListener('loadeddata', onLoad, { once: true });
            video.addEventListener('error', onLoad, { once: true }); // Continue on error
            video.load();
        });
    }

    const videoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const video = entry.target;
                if (!video.dataset.queued) {
                    video.dataset.queued = 'true';
                    videoLoadQueue.push(video);
                    processVideoQueue();
                }
                videoObserver.unobserve(video);
            }
        });
    }, { rootMargin: '150px', threshold: 0.01 });

    function renderReels(reels) {
        if (!reels || reels.length === 0) return;

        // Clear queue and stop loading
        videoLoadQueue = [];
        isLoadingVideos = false;
        videoObserver.disconnect();

        lastRenderedReels = reels;

        // Sort favorites to top
        const sortedReels = [...reels].sort((a, b) => {
            return (favorites.has(b.url) ? 1 : 0) - (favorites.has(a.url) ? 1 : 0);
        });

        currentReelsList = sortedReels;
        reelsGrid.innerHTML = '';

        const fragment = document.createDocumentFragment();

        sortedReels.forEach((reel, index) => {
            const card = document.createElement('div');
            const isFav = favorites.has(reel.url);
            card.className = `reel-card glass ${isFav ? 'is-favorite' : ''}`;
            card.dataset.url = reel.url;

            const dateStr = new Date(reel.timestamp).toLocaleDateString();

            card.innerHTML = `
                <div class="reel-placeholder"><span class="play-icon">▶</span></div>
                <video src="${reel.url}" preload="none" muted playsinline></video>
                <div class="fav-btn ${isFav ? 'active' : ''}" data-url="${reel.url}">❤️</div>
                <div class="reel-info">
                    <div class="reel-user">${reel.user}</div>
                    <div class="reel-date">${dateStr}</div>
                </div>
            `;

            card.querySelector('.fav-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFav(reel.url, card);
            });

            card.addEventListener('click', () => openModal(reel, index));
            fragment.appendChild(card);
        });

        reelsGrid.appendChild(fragment);

        // Start observing videos for lazy load
        reelsGrid.querySelectorAll('video').forEach(v => videoObserver.observe(v));
    }

    function toggleFav(url, card) {
        if (favorites.has(url)) {
            favorites.delete(url);
        } else {
            favorites.add(url);
        }
        localStorage.setItem('favReels', JSON.stringify([...favorites]));

        // Update just the card, not full re-render
        if (card) {
            card.classList.toggle('is-favorite', favorites.has(url));
            card.querySelector('.fav-btn').classList.toggle('active', favorites.has(url));
        }

        // Update modal button if open
        const modalFav = document.querySelector('.modal-fav-btn');
        if (modalFav) {
            modalFav.classList.toggle('active', favorites.has(url));
        }
    }

    function openModal(reel, index) {
        currentReelIndex = index;
        modalVideo.src = reel.url;
        modalUser.textContent = `Posted by ${reel.user}`;
        modalDate.textContent = new Date(reel.timestamp).toLocaleString();

        let modalFav = document.querySelector('.modal-fav-btn');
        if (!modalFav) {
            modalFav = document.createElement('button');
            modalFav.className = 'modal-fav-btn';
            modalFav.innerHTML = '❤️';
            modal.querySelector('.modal-content').appendChild(modalFav);
        }
        modalFav.classList.toggle('active', favorites.has(reel.url));
        modalFav.onclick = () => {
            toggleFav(reel.url, reelsGrid.querySelector(`[data-url="${reel.url}"]`));
        };

        modal.style.display = 'flex';
        document.body.classList.add('modal-open');

        modalVideo.muted = true;
        modalVideo.play().then(() => {
            modalVideo.muted = false;
        }).catch(() => { });
    }

    function navigateModal(direction) {
        if (modal.style.display !== 'flex') return;
        const newIndex = currentReelIndex + direction;
        if (newIndex >= 0 && newIndex < currentReelsList.length) {
            openModal(currentReelsList[newIndex], newIndex);
        }
    }

    closeBtn.onclick = () => {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
        modalVideo.pause();
        modalVideo.removeAttribute('src');
        modalVideo.load();
    };

    window.onkeydown = (event) => {
        if (modal.style.display === 'flex') {
            if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) {
                event.preventDefault();
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
        if (event.target === modal) closeBtn.onclick();
    };
});
