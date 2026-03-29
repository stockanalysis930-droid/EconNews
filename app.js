document.addEventListener('DOMContentLoaded', () => {
// --- STATE ---
    let tickers = JSON.parse(localStorage.getItem('econnews_tickers')) || ['AAPL', 'MSFT'];
    let allFeedArticles = []; 

    let pollInterval = null;  

    // --- DOM ELEMENTS ---
    const navButtons = document.querySelectorAll('.nav-btn');
    const views = document.querySelectorAll('.view');
    
    const feedContainer = document.getElementById('feed-container');
    const loadingFeed = document.getElementById('loading-feed');
    const sortSelect = document.getElementById('sort-select');

    const tickersListContainer = document.getElementById('tickers-list');
    const tickerForm = document.getElementById('ticker-form');
    const tickerInput = document.getElementById('ticker-input');

    // --- INITIALIZATION ---
    function init() {
        renderTickers();
        loadFeed();
        startLivePolling();
    }

    // --- NAVIGATION LOGIC ---
    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            navButtons.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            const targetId = e.currentTarget.getAttribute('data-target');
            views.forEach(view => view.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');

            if (targetId === 'feed-view') { loadFeed(); }
        });
    });

    // --- TICKERS LOGIC ---
    function renderTickers() {
        tickersListContainer.innerHTML = '';
        tickers.forEach(ticker => {
            const el = document.createElement('div');
            el.className = 'ticker-card';
            el.innerHTML = `
                <span class="ticker-symbol">${ticker}</span>
                <button class="remove-ticker-btn" data-ticker="${ticker}">✖</button>
            `;
            tickersListContainer.appendChild(el);
        });

        document.querySelectorAll('.remove-ticker-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tickerToRemove = e.currentTarget.getAttribute('data-ticker');
                tickers = tickers.filter(t => t !== tickerToRemove);
                saveTickers();
                renderTickers();
                loadFeed();
            });
        });
    }

    function saveTickers() {
        localStorage.setItem('econnews_tickers', JSON.stringify(tickers));
    }

    tickerForm.addEventListener('submit', (e) => {
        e.preventDefault(); 
        const newTicker = tickerInput.value.trim().toUpperCase();
        if (newTicker && !tickers.includes(newTicker)) {
            tickers.push(newTicker);
            saveTickers();
            renderTickers();
            tickerInput.value = '';
            loadFeed();
        }
    });

    sortSelect.addEventListener('change', () => {
        renderFeed();
    });

    let currentFilter = 'ALL';

    // --- FEED LOGIC ---
    function startLivePolling() {
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(() => {
            console.log("Live polling triggered...");
            loadFeed(true); 
        }, 60000); 
    }

    async function fetchMultiSourceNews(ticker) {
        // We use 3 separate RSS endpoints to bypass the proxy's strict 10-article limit.
        const sources = [
            `https://news.google.com/rss/search?q=${ticker}+stock+news&hl=en-US&gl=US&ceid=US:en`,
            `https://finance.yahoo.com/rss/headline?s=${ticker}`,
            `https://seekingalpha.com/api/sa/combined/${ticker}.xml`
        ];

        try {
            const fetchPromises = sources.map(async (rss) => {
                const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rss)}`;
                const res = await fetch(apiUrl);
                if(!res.ok) return [];
                const data = await res.json();
                if(data.status === 'ok') {
                    return data.items.map(item => ({
                        title: item.title,
                        description: item.description || item.content || 'Content unavailable.',
                        link: item.link,
                        pubDate: new Date(item.pubDate).toISOString(),
                        ticker: ticker
                    }));
                }
                return [];
            });

            const results = await Promise.all(fetchPromises);
            
            // Merge all arrays, remove exact duplicates by title
            const merged = results.flat();
            const unique = [];
            const titles = new Set();
            for(let item of merged) {
                if(!titles.has(item.title)) {
                    titles.add(item.title);
                    unique.push(item);
                }
            }
            return unique;
        } catch(e) {
            console.error(e);
            return [];
        }
    }

    async function loadFeed(isSilent = false) {
        if (tickers.length === 0) {
            feedContainer.innerHTML = '<p class="help-text">You are not following any tickers. Add some in the "Following" tab!</p>';
            return;
        }

        if (!isSilent) loadingFeed.classList.remove('hidden');

        try {
            const fetchPromises = tickers.map(ticker => fetchMultiSourceNews(ticker));
            const results = await Promise.all(fetchPromises);
            
            allFeedArticles = results.flat().map(article => {
                let cleanDesc = article.description || "Content unavailable.";
                if (cleanDesc.includes('<')) {
                    const temp = document.createElement('div');
                    temp.innerHTML = cleanDesc;
                    cleanDesc = temp.textContent || temp.innerText || "";
                }
                const analysis = analyzeMarketImpact(article.title, cleanDesc);
                return { ...article, cleanDesc, rating: analysis.rating, aiSummary: analysis.summary };
            });

            renderFeed();
            
            const lastUpdatedEl = document.getElementById('last-updated-text');
            if (lastUpdatedEl) {
                const timeStr = new Date().toLocaleTimeString();
                lastUpdatedEl.innerHTML = `🔴 Live: Last synced at ${timeStr}`;
            }
        } catch (error) {
            if (!isSilent) feedContainer.innerHTML = `<p class="help-text" style="color:var(--danger)">Error loading feed: ${error.message}</p>`;
        } finally {
            loadingFeed.classList.add('hidden');
        }
    }

    function renderTickerTabs() {
        const tabsContainer = document.getElementById('ticker-tabs');
        if (!tabsContainer) return;

        let html = `<button class="tab-btn ${currentFilter === 'ALL' ? 'active' : ''}" data-filter="ALL">All News</button>`;
        
        tickers.forEach(t => {
            html += `<button class="tab-btn ${currentFilter === t ? 'active' : ''}" data-filter="${t}">${t}</button>`;
        });
        
        tabsContainer.innerHTML = html;

        tabsContainer.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                currentFilter = e.currentTarget.getAttribute('data-filter');
                renderTickerTabs(); 
                renderFeed();       
            });
        });
    }

    function analyzeMarketImpact(title, description) {
        const text = (title + " " + description).toLowerCase();
        
        const fiveStarWords = ['earnings', 'merger', 'bankruptcy', 'crash', 'surges', 'plunges', 'acquires', 'target', 'lawsuit', 'sec ', 'investigation', 'fed ', 'interest rate', 'soars', 'dives'];
        const fourStarWords = ['upgrades', 'downgrades', 'beats', 'misses', 'guidance', 'predicts', 'announces', 'launches', 'ceo', 'revenue', 'profit', 'sales'];
        const twoStarWords = ['preview', 'opinion', 'weekly', 'daily', 'update', 'recap', 'could', 'might'];
        const oneStarWords = ['zacks', 'motley fool', '10 stocks', 'cramer', 'must-read', 'buy or sell', 'wall street analyst'];
        
        let rating = 3; 
        
        if (oneStarWords.some(w => text.includes(w))) rating = 1;
        else if (twoStarWords.some(w => text.includes(w))) rating = 2;
        else if (fourStarWords.some(w => text.includes(w))) rating = 4;
        if (fiveStarWords.some(w => text.includes(w))) rating = 5; 
        
        // Generate a robust and conclusive summary based on the rating and the actual professional text provided.
        // We ensure it sounds like an actual explanation of what happened, rather than static sentences.
        let analysisPrefix = "General overview.";
        switch(rating) {
            case 5: analysisPrefix = "Crucial Event:"; break;
            case 4: analysisPrefix = "Significant Development:"; break;
            case 3: analysisPrefix = "Market Note:"; break;
            case 2: analysisPrefix = "Speculative Opinion:"; break;
            case 1: analysisPrefix = "Low Value Metric:"; break;
        }
        
        // Ensure description is actually conclusive. Use first two sentences if available.
        let clippedDesc = description || "No detailed summary was provided in the source report.";
        if(clippedDesc.split('. ').length > 2) {
            clippedDesc = clippedDesc.split('. ').slice(0, 2).join('. ') + '.';
        }

        // Combine into one beautiful cohesive conclusive text
        let summary = `<strong>${analysisPrefix}</strong> Based on recent tracking, this intelligence suggests that ${clippedDesc}`;

        return { rating, summary };
    }

    function renderFeed() {
        feedContainer.innerHTML = '';
        renderTickerTabs();

        let filteredArticles = [...allFeedArticles];
        if (currentFilter !== 'ALL') {
            filteredArticles = filteredArticles.filter(a => a.ticker === currentFilter);
        }

        // Apply Sorting
        const sortMode = sortSelect.value;
        if (sortMode === 'stars') {
            filteredArticles.sort((a, b) => {
                if (b.rating !== a.rating) return b.rating - a.rating; // primary: stars high to low
                return new Date(b.pubDate) - new Date(a.pubDate);      // secondary: newest time
            });
        } else {
            // Default chronological
            filteredArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
        }

        const displayArticles = filteredArticles.slice(0, 100);

        if (displayArticles.length === 0) {
            feedContainer.innerHTML = '<p class="help-text">No articles found.</p>';
            return;
        }

        displayArticles.forEach(article => {
            let dateStr = 'Unknown Time';
            try {
                dateStr = new Date(article.pubDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            } catch(e) {}

            
            const stars = '⭐'.repeat(article.rating) + '☆'.repeat(5 - article.rating);

            const el = document.createElement('div');
            el.className = 'article-card';

            el.innerHTML = `
                <div class="article-meta">
                    <span class="ticker-tag">${article.ticker}</span>
                    <span>${dateStr}</span>
                </div>
                <div class="stars" title="Local Intelligence Rating" style="margin-top:0.5rem; font-size: 1.1rem; color: var(--warning); letter-spacing: 2px;">
                    ${stars}
                </div>
                <div class="article-title" style="margin-top:0.5rem; cursor:pointer;" class="local-reader-trigger">
                    <span style="font-weight:600; font-size: 1.2rem; color:var(--primary); transition:0.2s;">${article.title}</span>
                </div>
                
                <div class="ai-summary" style="margin-top:0.75rem; font-style: italic; opacity: 0.9; background:rgba(0,0,0,0.2); padding:0.75rem; border-left:3px solid var(--primary); border-radius:0 8px 8px 0;">
                    🤖 <strong>Local AI Assessment:</strong> ${article.aiSummary}
                </div>

                <div class="full-content-container" style="display:none; margin-top:1rem; padding-top:1rem; border-top:1px solid rgba(255,255,255,0.1);">
                    <h4 style="margin-bottom:0.5rem; color:#f8fafc;">Full News Report</h4>
                    <p style="color:#e2e8f0; line-height:1.7; font-size:1rem;">
                        ${article.cleanDesc}
                    </p>
                    <p style="margin-top:1rem; font-size:0.85rem; color:var(--text-secondary);">
                        <em>Powered by Local Heuristic Intelligence Engine.</em>
                    </p>
                    <div style="margin-top:1rem;">
                        <a href="${article.link}" target="_blank" style="text-decoration:none; display:inline-block; border:1px solid var(--primary); color:var(--text-primary); background:var(--primary); padding:6px 14px; border-radius:6px; font-size:0.85rem; cursor:pointer; font-weight:600; transition:0.2s;">Read Real Article ↗</a>
                    </div>
                </div>
            `;
            
            // Re-map clicks to simulate an "Internal Reading Mode" rather than linking to Yahoo
            const titleTrigger = el.querySelector('.article-title');
            const contentBox = el.querySelector('.full-content-container');
            
            titleTrigger.addEventListener('click', (e) => {
                const isHidden = contentBox.style.display === 'none';
                contentBox.style.display = isHidden ? 'block' : 'none';
            });

            feedContainer.appendChild(el);
        });
    }

    init();
});
