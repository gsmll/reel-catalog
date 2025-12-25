document.addEventListener('DOMContentLoaded', () => {
    const reelsGrid = document.getElementById('reels-grid');
    const monthList = document.getElementById('month-list');
    const modal = document.getElementById('modal');
    const modalVideo = document.getElementById('modal-video');
    const modalUser = document.getElementById('modal-user');
    const modalDate = document.getElementById('modal-date');
    const closeBtn = document.querySelector('.close');

    // Track observed elements to clean up memory
    let observedElements = new Set();
    const thumbnailObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                const src = img.dataset.src;
                if (src) {
                    img.src = src;
                    img.removeAttribute('data-src');
                }
                thumbnailObserver.unobserve(img);
                observedElements.delete(img);
            }
        });
    }, {
        rootMargin: '200px', // Pre-load slightly ahead of scroll
        threshold: 0.01
    });

    let currentRenderId = 0;

    // Sort reels by timestamp descending (newest first)
    const allReels = [...reelsData].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    let currentReelIndex = -1;
    let currentReelsList = [];
    let favorites = new Set(JSON.parse(localStorage.getItem('favReels') || '[]'));

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

    try {
        const grouped = groupReelsByMonth(allReels);
        renderTOC(grouped);

        // Default to the most recent month
        const sortedMonths = Object.keys(grouped);
        const initialMonth = sortedMonths[0];

        if (initialMonth) {
            renderReels(grouped[initialMonth]);
            const firstMonthItem = document.querySelector('.month-item');
            if (firstMonthItem) firstMonthItem.classList.add('active');
        }
    } catch (err) {
        console.error('Error loading reels:', err);
    }

    async function renderReels(reels) {
        if (!reels || reels.length === 0) return;

        const renderId = ++currentRenderId;

        // Cleanup: Unobserve all previous images
        observedElements.forEach(el => thumbnailObserver.unobserve(el));
        observedElements.clear();

        // Clear grid and scroll to top
        reelsGrid.innerHTML = '';

        // Pre-sort favorites once
        const sortedReels = [...reels].sort((a, b) => {
            return (favorites.has(b.url) ? 1 : 0) - (favorites.has(a.url) ? 1 : 0);
        });

        currentReelsList = sortedReels;

        // Chunked rendering to keep UI responsive
        const CHUNK_SIZE = 20;
        let index = 0;

        const renderChunk = () => {
            if (renderId !== currentRenderId) return; // Cancel if new month selected

            const fragment = document.createDocumentFragment();
            const end = Math.min(index + CHUNK_SIZE, sortedReels.length);

            for (let i = index; i < end; i++) {
                const reel = sortedReels[i];
                const card = document.createElement('div');
                const isFav = favorites.has(reel.url);
                card.className = `reel-card glass ${isFav ? 'is-favorite' : ''}`;
                card.dataset.url = reel.url;

                const dateStr = new Date(reel.timestamp).toLocaleDateString();

                card.innerHTML = `
                    <div class="reel-placeholder"><span class="play-icon">▶</span></div>
                    ${reel.thumbnail ? `<img data-src="${reel.thumbnail}" class="lazy-thumb" alt="Reel thumbnail" decoding="async">` : ''}
                    <div class="fav-btn ${isFav ? 'active' : ''}">❤️</div>
                    <div class="reel-info">
                        <div class="reel-user">${reel.user}</div>
                        <div class="reel-date">${dateStr}</div>
                    </div>
                `;

                const thumbImg = card.querySelector('.lazy-thumb');
                if (thumbImg) {
                    thumbImg.style.opacity = '0';
                    thumbImg.style.transition = 'opacity 0.3s ease';
                    thumbImg.onload = () => { thumbImg.style.opacity = '1'; };
                    thumbImg.onerror = () => { thumbImg.style.display = 'none'; };
                    thumbnailObserver.observe(thumbImg);
                    observedElements.add(thumbImg);
                }

                card.querySelector('.fav-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleFav(reel.url, card);
                });

                card.addEventListener('click', () => openModal(reel, i));
                fragment.appendChild(card);
            }

            reelsGrid.appendChild(fragment);
            index = end;

            if (index < sortedReels.length) {
                // Schedule next chunk using requestAnimationFrame to prioritize visual updates
                requestAnimationFrame(renderChunk);
            }
        };

        // Start initial render
        renderChunk();
    }

    function toggleFav(url, card) {
        if (favorites.has(url)) {
            favorites.delete(url);
        } else {
            favorites.add(url);
        }
        localStorage.setItem('favReels', JSON.stringify([...favorites]));

        // Visual update only
        if (card) {
            card.classList.toggle('is-favorite', favorites.has(url));
            card.querySelector('.fav-btn').classList.toggle('active', favorites.has(url));
        }

        // Setup modal button sync
        const modalFav = document.querySelector('.modal-fav-btn');
        if (modalFav && modalVideo.src === url) {
            modalFav.classList.toggle('active', favorites.has(url));
        }
    }

    function openModal(reel, index) {
        currentReelIndex = index;

        // Modal is the ONLY place <video> exists
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

        modalFav.className = `modal-fav-btn ${favorites.has(reel.url) ? 'active' : ''}`;

        // Remove old listeners to prevent stacking
        const newFavBtn = modalFav.cloneNode(true);
        modalFav.parentNode.replaceChild(newFavBtn, modalFav);
        newFavBtn.addEventListener('click', () => {
            const card = reelsGrid.querySelector(`[data-url="${reel.url}"]`);
            toggleFav(reel.url, card);
            newFavBtn.classList.toggle('active', favorites.has(reel.url));
        });

        modal.style.display = 'flex';
        document.body.classList.add('modal-open');

        // Safe playback logic
        modalVideo.muted = true;
        const playPromise = modalVideo.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                modalVideo.muted = false;
            }).catch(error => {
                console.log("Autoplay prevented:", error);
                modalVideo.muted = true;
            });
        }
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
        modalVideo.removeAttribute('src'); // Fully unload video
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
