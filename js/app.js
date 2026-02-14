// BR Sniper - Business Acquisition Opportunities Tracker

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function isValidUrl(url) {
    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
        return false;
    }
}

class BRSniper {
    constructor() {
        this.data = null;
        this.filteredListings = [];
        this.activeSource = 'all';
        this.currentPage = 1;
        this.pageSize = 24;
        this.init();
    }

    async init() {
        await this.loadData();
        this.setupSourceTabs();
        this.setupFilters();
        this.renderListings();
        this.renderInsights();
        this.renderSources();
        this.updateStats();
    }

    async loadData() {
        try {
            const response = await fetch('data/listings.json');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            this.data = await response.json();
            this.filteredListings = [...this.data.listings];
        } catch (error) {
            const grid = document.getElementById('listings-grid');
            if (grid) {
                grid.innerHTML = '<div class="error-state"><p>Failed to load listings. Please try refreshing the page.</p></div>';
            }
        }
    }

    setupSourceTabs() {
        if (!this.data) return;
        const tabsContainer = document.getElementById('source-tabs');

        document.getElementById('count-all').textContent = this.data.listings.length;

        this.data.sources.forEach(source => {
            const count = this.data.listings.filter(l => l.source === source.id).length;
            const tab = document.createElement('button');
            tab.className = 'source-tab';
            tab.dataset.source = source.id;
            tab.innerHTML = `
                <span class="tab-flag">${escapeHtml(source.flag)}</span>
                <span class="tab-name">${escapeHtml(source.name)}</span>
                <span class="tab-count">${count}</span>
            `;
            tabsContainer.appendChild(tab);
        });

        tabsContainer.addEventListener('click', (e) => {
            const tab = e.target.closest('.source-tab');
            if (!tab) return;

            tabsContainer.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            this.activeSource = tab.dataset.source;
            this.applyFilters();
        });
    }

    setupFilters() {
        if (!this.data) return;
        const categoryFilter = document.getElementById('category-filter');
        const categories = [...new Set(this.data.listings.map(l => l.category))];
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.toLowerCase();
            option.textContent = cat;
            categoryFilter.appendChild(option);
        });

        const locationFilter = document.getElementById('location-filter');
        const locations = [...new Set(
            this.data.listings
                .map(l => l.country || l.location)
                .filter(Boolean)
        )].sort();
        locations.forEach(loc => {
            const option = document.createElement('option');
            option.value = loc;
            option.textContent = loc;
            locationFilter.appendChild(option);
        });

        document.getElementById('category-filter').addEventListener('change', () => this.applyFilters());
        document.getElementById('revenue-filter').addEventListener('change', () => this.applyFilters());
        document.getElementById('asking-price-filter').addEventListener('change', () => this.applyFilters());
        document.getElementById('location-filter').addEventListener('change', () => this.applyFilters());
        document.getElementById('business-age-filter').addEventListener('change', () => this.applyFilters());
        document.getElementById('sort-filter').addEventListener('change', () => this.applyFilters());

        this.applyFilters();
    }

    getVerdictScore(verdict) {
        if (!verdict) return 0;
        const v = verdict.toUpperCase();
        if (v.includes('GEM')) return 5;
        if (v.includes('EXCELLENT')) return 4;
        if (v.includes('INTERESTING')) return 3;
        if (v.includes('CASE STUDY')) return 3;
        if (v.includes('NEUTRAL') || v.includes('NICHE') || v.includes('NEEDS MORE') || v.includes('SMALL')) return 2;
        if (v.includes('SKIP') || v.includes('RISKY') || v.includes('CROWDED')) return 1;
        return 2;
    }

    parseBusinessAgeYears(ageStr) {
        if (!ageStr) return null;
        const lower = ageStr.toLowerCase();
        const yearMatch = lower.match(/(\d+)\s*year/);
        if (yearMatch) return parseInt(yearMatch[1]);
        const monthMatch = lower.match(/(\d+)\s*month/);
        if (monthMatch) return parseInt(monthMatch[1]) / 12;
        return null;
    }

    applyFilters() {
        const categoryFilter = document.getElementById('category-filter').value;
        const revenueFilter = parseInt(document.getElementById('revenue-filter').value);
        const askingPriceFilter = parseInt(document.getElementById('asking-price-filter').value);
        const locationFilter = document.getElementById('location-filter').value;
        const businessAgeFilter = document.getElementById('business-age-filter').value;
        const sortFilter = document.getElementById('sort-filter').value;

        this.filteredListings = this.data.listings.filter(listing => {
            if (this.activeSource !== 'all' && listing.source !== this.activeSource) {
                return false;
            }

            if (categoryFilter !== 'all' && listing.category.toLowerCase() !== categoryFilter) {
                return false;
            }

            if (revenueFilter > 0) {
                const revenue = listing.financials?.revenue || 0;
                if (revenue < revenueFilter) {
                    return false;
                }
            }

            if (askingPriceFilter > 0) {
                const price = listing.askingPrice || listing.financials?.askingPrice || 0;
                if (price < askingPriceFilter) {
                    return false;
                }
            }

            if (locationFilter !== 'all') {
                const listingLocation = listing.country || listing.location || '';
                if (listingLocation !== locationFilter) {
                    return false;
                }
            }

            if (businessAgeFilter !== 'all') {
                const ageYears = this.parseBusinessAgeYears(listing.businessAge);
                const filterVal = parseInt(businessAgeFilter);
                if (ageYears === null) return true;
                if (filterVal === 1 && ageYears >= 1) return false;
                if (filterVal === 3 && (ageYears < 1 || ageYears > 3)) return false;
                if (filterVal === 99 && ageYears < 3) return false;
            }

            return true;
        });

        this.filteredListings.sort((a, b) => {
            switch (sortFilter) {
                case 'verdict':
                    return this.getVerdictScore(b.analysis?.verdict) - this.getVerdictScore(a.analysis?.verdict);
                case 'revenue':
                    return (b.financials?.revenue || 0) - (a.financials?.revenue || 0);
                case 'asking-price':
                    return (b.askingPrice || 0) - (a.askingPrice || 0);
                case 'date':
                    return new Date(b.dateAdded) - new Date(a.dateAdded);
                default:
                    return 0;
            }
        });

        this.currentPage = 1;
        this.renderListings();
    }

    renderListings() {
        const grid = document.getElementById('listings-grid');
        const noResults = document.getElementById('no-results');

        if (this.filteredListings.length === 0) {
            grid.innerHTML = '';
            noResults.style.display = 'block';
            this.renderPagination(0);
            return;
        }

        noResults.style.display = 'none';

        const startIdx = (this.currentPage - 1) * this.pageSize;
        const pageItems = this.filteredListings.slice(startIdx, startIdx + this.pageSize);
        grid.innerHTML = pageItems.map(listing => this.createListingCard(listing)).join('');
        this.renderPagination(this.filteredListings.length);
    }

    renderPagination(totalItems) {
        let paginationEl = document.getElementById('pagination');
        if (!paginationEl) {
            paginationEl = document.createElement('div');
            paginationEl.id = 'pagination';
            paginationEl.className = 'pagination';
            const grid = document.getElementById('listings-grid');
            grid.parentNode.insertBefore(paginationEl, grid.nextSibling);
        }

        const totalPages = Math.ceil(totalItems / this.pageSize);
        if (totalPages <= 1) {
            paginationEl.innerHTML = '';
            return;
        }

        let html = '';
        if (this.currentPage > 1) {
            html += `<button class="page-btn" data-page="${this.currentPage - 1}">&larr; Prev</button>`;
        }

        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(totalPages, this.currentPage + 2);

        if (startPage > 1) {
            html += `<button class="page-btn" data-page="1">1</button>`;
            if (startPage > 2) html += `<span class="page-dots">...</span>`;
        }

        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="page-btn ${i === this.currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) html += `<span class="page-dots">...</span>`;
            html += `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
        }

        if (this.currentPage < totalPages) {
            html += `<button class="page-btn" data-page="${this.currentPage + 1}">Next &rarr;</button>`;
        }

        html += `<span class="page-info">Page ${this.currentPage} of ${totalPages} (${totalItems} listings)</span>`;

        paginationEl.innerHTML = html;
        paginationEl.onclick = (e) => {
            const btn = e.target.closest('.page-btn');
            if (!btn) return;
            this.currentPage = parseInt(btn.dataset.page);
            this.renderListings();
            document.getElementById('listings').scrollIntoView({ behavior: 'smooth' });
        };
    }

    getVerdictClass(verdict) {
        if (!verdict) return '';
        const v = verdict.toUpperCase();
        if (v.includes('GEM')) return 'verdict-gem';
        if (v.includes('EXCELLENT')) return 'verdict-excellent';
        if (v.includes('INTERESTING') || v.includes('CASE STUDY')) return 'verdict-interesting';
        if (v.includes('SKIP') || v.includes('RISKY')) return 'verdict-skip';
        return 'verdict-neutral';
    }

    createListingCard(listing) {
        const revenue = listing.financials?.revenue
            ? this.formatCurrency(listing.financials.revenue)
            : 'Not disclosed';

        const ebitda = listing.financials?.ebitda
            ? this.formatCurrency(listing.financials.ebitda)
            : '-';

        const mrr = listing.financials?.mrr
            ? this.formatCurrency(listing.financials.mrr) + '/mo'
            : null;

        const employees = listing.employees !== undefined && listing.employees !== null
            ? listing.employees === 0 ? 'None' : listing.employees
            : '-';

        const recurring = listing.financials?.recurringRevenue
            ? `${listing.financials.recurringRevenue}%`
            : '-';

        const highlights = listing.highlights?.slice(0, 4).map(h =>
            `<span class="highlight-tag">${escapeHtml(h)}</span>`
        ).join('') || '';

        const categoryClass = listing.category.toLowerCase().replace(/\s+/g, '-');
        const source = this.data.sources.find(s => s.id === listing.source);
        const sourceName = source?.name || listing.source;
        const sourceFlag = source?.flag || '';
        const listingUrl = isValidUrl(listing.url) ? listing.url : '#';

        const analysis = listing.analysis;
        const verdictClass = this.getVerdictClass(analysis?.verdict);

        const analysisHtml = analysis ? `
            <div class="listing-analysis">
                <div class="verdict ${verdictClass}">${escapeHtml(analysis.verdict)}</div>
                <div class="analysis-details">
                    <p class="reasoning">${escapeHtml(analysis.reasoning)}</p>
                    <div class="analysis-meta">
                        <span class="copyable"><strong>Copyable:</strong> ${escapeHtml(analysis.uspCopyable)}</span>
                    </div>
                    ${analysis.risks?.length && analysis.risks[0] !== 'N/A - sold' ? `
                        <div class="risks">
                            <strong>Risks:</strong> ${escapeHtml(analysis.risks.join(' · '))}
                        </div>
                    ` : ''}
                    ${analysis.opportunity ? `
                        <div class="opportunity">
                            <strong>Opportunity:</strong> ${escapeHtml(analysis.opportunity)}
                        </div>
                    ` : ''}
                </div>
            </div>
        ` : '';

        return `
            <article class="listing-card ${verdictClass}">
                <div class="listing-header">
                    <div class="listing-meta">
                        <span class="listing-category ${categoryClass}">${escapeHtml(listing.category)}</span>
                        <span class="listing-revenue">${mrr || revenue}</span>
                    </div>
                    <h3 class="listing-title">${escapeHtml(listing.title)}</h3>
                </div>
                <div class="listing-body">
                    <p class="listing-description">${escapeHtml(listing.description)}</p>
                    <div class="listing-metrics">
                        <div class="metric">
                            <div class="metric-value">${revenue}</div>
                            <div class="metric-label">Revenue</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">${ebitda}</div>
                            <div class="metric-label">EBITDA</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">${recurring}</div>
                            <div class="metric-label">Recurring</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">${employees}</div>
                            <div class="metric-label">Employees</div>
                        </div>
                    </div>
                    ${highlights ? `<div class="listing-highlights">${highlights}</div>` : ''}
                    ${analysisHtml}
                </div>
                <div class="listing-footer">
                    <span class="listing-source">${escapeHtml(sourceFlag)} via ${escapeHtml(sourceName)}</span>
                    <a href="${listingUrl}" target="_blank" rel="noopener" class="listing-link">
                        View Listing →
                    </a>
                </div>
            </article>
        `;
    }

    renderInsights() {
        if (!this.data) return;
        const multiplesList = document.getElementById('multiples-list');
        const multiples = this.data.marketInsights.ebitdaMultiples;

        multiplesList.innerHTML = Object.entries(multiples)
            .filter(([key]) => key !== 'average')
            .map(([sector, range]) => `
                <div class="multiple-item">
                    <span class="multiple-sector">${escapeHtml(sector)}</span>
                    <span class="multiple-range">${escapeHtml(String(range.low))}x - ${escapeHtml(String(range.high))}x</span>
                </div>
            `).join('') + `
                <div class="multiple-item average">
                    <span class="multiple-sector">Average (all sectors)</span>
                    <span class="multiple-range">${escapeHtml(String(multiples.average))}x</span>
                </div>
            `;

        const trendsList = document.getElementById('trends-list');
        trendsList.innerHTML = this.data.marketInsights.trends
            .map(trend => `<li>${escapeHtml(trend)}</li>`)
            .join('');

        const categoriesOverview = document.getElementById('categories-overview');
        const categoryCounts = {};
        this.data.listings.forEach(l => {
            categoryCounts[l.category] = (categoryCounts[l.category] || 0) + 1;
        });

        categoriesOverview.innerHTML = Object.entries(categoryCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, count]) => `
                <div class="category-item">
                    <span class="category-name">${escapeHtml(cat)}</span>
                    <span class="category-count">${count} listings</span>
                </div>
            `).join('');
    }

    renderSources() {
        if (!this.data) return;
        const sourcesGrid = document.getElementById('sources-grid');
        sourcesGrid.innerHTML = this.data.sources.map(source => {
            const count = this.data.listings.filter(l => l.source === source.id).length;
            const sourceUrl = isValidUrl(source.url) ? source.url : '#';
            return `
                <div class="source-card">
                    <div class="source-header">
                        <span class="source-flag">${escapeHtml(source.flag)}</span>
                        <h3>${escapeHtml(source.name)}</h3>
                    </div>
                    <div class="source-country">${escapeHtml(source.country)}</div>
                    <p>${escapeHtml(source.description)}</p>
                    <div class="source-stats">
                        <span class="source-count">${count} listings tracked</span>
                    </div>
                    <a href="${sourceUrl}" target="_blank" rel="noopener" class="source-link">
                        Visit ${escapeHtml(source.name)} →
                    </a>
                </div>
            `;
        }).join('');
    }

    updateStats() {
        if (!this.data) return;
        document.getElementById('total-listings').textContent = this.data.listings.length;
        document.getElementById('total-sources').textContent = this.data.sources.length;
        document.getElementById('last-updated').textContent = this.formatDate(this.data.lastUpdated);
    }

    formatCurrency(amount) {
        if (amount >= 1000000) {
            return `$${(amount / 1000000).toFixed(1)}M`;
        } else if (amount >= 1000) {
            return `$${(amount / 1000).toFixed(0)}K`;
        }
        return `$${amount}`;
    }

    formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new BRSniper();
});
