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
        const fragment = document.createDocumentFragment();
        Object.keys(grouped).forEach(month => {
            const div = document.createElement('div');
            div.className = 'month-item';
            div.textContent = month;
            div.dataset.month = month;
            fragment.appendChild(div);
        });
        monthList.appendChild(fragment);

        monthList.onclick = (e) => {
            const item = e.target.closest('.month-item');
            if (item) {
                document.querySelectorAll('.month-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                renderReels(grouped[item.dataset.month]);
            }
        };
    }

    let currentReelIndex = -1;
    let currentReelsList = [];
    let favorites = new Set(JSON.parse(sessionStorage.getItem('favReels') || '[]'));
    let lastRenderedReels = [];

    const observerOptions = {
        root: null,
        rootMargin: '100px',
        threshold: 0.1
    };

    const videoObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const video = entry.target;
                if (video.getAttribute('preload') === 'none') {
                    video.setAttribute('preload', 'metadata');
                    observer.unobserve(video);
                }
            }
        });
    }, observerOptions);

    function renderReels(reels) {
        lastRenderedReels = reels;
        // Hoist favorites to the top
        const sortedReels = [...reels].sort((a, b) => {
            const aFav = favorites.has(a.url) ? 1 : 0;
            const bFav = favorites.has(b.url) ? 1 : 0;
            return bFav - aFav;
        });

        currentReelsList = sortedReels;
        reelsGrid.innerHTML = '';
        sortedReels.forEach((reel, index) => {
            const card = document.createElement('div');
            const isFav = favorites.has(reel.url);
            card.className = `reel-card glass ${isFav ? 'is-favorite' : ''}`;

            const date = new Date(reel.timestamp).toLocaleDateString();

            card.innerHTML = `
                <video src="${reel.url}" preload="none" muted></video>
                <div class="fav-btn ${isFav ? 'active' : ''}" data-url="${reel.url}">
                    ❤️
                </div>
                <div class="reel-info">
                    <div class="reel-user">${reel.user}</div>
                    <div class="reel-date">${date}</div>
                </div>
            `;

            const video = card.querySelector('video');
            videoObserver.observe(video);

            card.querySelector('.fav-btn').onclick = (e) => {
                e.stopPropagation();
                toggleFav(reel.url);
            };

            card.onclick = () => openModal(reel, index);
            reelsGrid.appendChild(card);
        });
    }

    function toggleFav(url) {
        if (favorites.has(url)) {
            favorites.delete(url);
        } else {
            favorites.add(url);
        }
        sessionStorage.setItem('favReels', JSON.stringify([...favorites]));

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
        modalVideo.muted = false; // Ensure it's not muted so volume is obvious
        modalVideo.play();
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
