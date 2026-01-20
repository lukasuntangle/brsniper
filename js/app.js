// BR Sniper - Business Acquisition Opportunities Tracker

class BRSniper {
    constructor() {
        this.data = null;
        this.filteredListings = [];
        this.activeSource = 'all';
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
            this.data = await response.json();
            this.filteredListings = [...this.data.listings];
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }

    setupSourceTabs() {
        const tabsContainer = document.getElementById('source-tabs');

        // Update "All" count
        document.getElementById('count-all').textContent = this.data.listings.length;

        // Create tabs for each source
        this.data.sources.forEach(source => {
            const count = this.data.listings.filter(l => l.source === source.id).length;
            const tab = document.createElement('button');
            tab.className = 'source-tab';
            tab.dataset.source = source.id;
            tab.innerHTML = `
                <span class="tab-flag">${source.flag || ''}</span>
                <span class="tab-name">${source.name}</span>
                <span class="tab-count">${count}</span>
            `;
            tabsContainer.appendChild(tab);
        });

        // Add click handlers
        tabsContainer.addEventListener('click', (e) => {
            const tab = e.target.closest('.source-tab');
            if (!tab) return;

            // Update active state
            tabsContainer.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update filter
            this.activeSource = tab.dataset.source;
            this.applyFilters();
        });
    }

    setupFilters() {
        // Populate category filter
        const categoryFilter = document.getElementById('category-filter');
        const categories = [...new Set(this.data.listings.map(l => l.category))];
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.toLowerCase();
            option.textContent = cat;
            categoryFilter.appendChild(option);
        });

        // Add event listeners
        document.getElementById('category-filter').addEventListener('change', () => this.applyFilters());
        document.getElementById('revenue-filter').addEventListener('change', () => this.applyFilters());
        document.getElementById('sort-filter').addEventListener('change', () => this.applyFilters());

        // Apply initial sort
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

    applyFilters() {
        const categoryFilter = document.getElementById('category-filter').value;
        const revenueFilter = parseInt(document.getElementById('revenue-filter').value);
        const sortFilter = document.getElementById('sort-filter').value;

        this.filteredListings = this.data.listings.filter(listing => {
            // Source filter (from tabs)
            if (this.activeSource !== 'all' && listing.source !== this.activeSource) {
                return false;
            }

            // Category filter
            if (categoryFilter !== 'all' && listing.category.toLowerCase() !== categoryFilter) {
                return false;
            }

            // Revenue filter
            if (revenueFilter > 0) {
                const revenue = listing.financials?.revenue || 0;
                if (revenue < revenueFilter) {
                    return false;
                }
            }

            return true;
        });

        // Sort
        this.filteredListings.sort((a, b) => {
            switch (sortFilter) {
                case 'verdict':
                    return this.getVerdictScore(b.analysis?.verdict) - this.getVerdictScore(a.analysis?.verdict);
                case 'revenue':
                    return (b.financials?.revenue || 0) - (a.financials?.revenue || 0);
                case 'date':
                    return new Date(b.dateAdded) - new Date(a.dateAdded);
                default:
                    return 0;
            }
        });

        this.renderListings();
    }

    renderListings() {
        const grid = document.getElementById('listings-grid');
        const noResults = document.getElementById('no-results');

        if (this.filteredListings.length === 0) {
            grid.innerHTML = '';
            noResults.style.display = 'block';
            return;
        }

        noResults.style.display = 'none';
        grid.innerHTML = this.filteredListings.map(listing => this.createListingCard(listing)).join('');
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
            `<span class="highlight-tag">${h}</span>`
        ).join('') || '';

        const categoryClass = listing.category.toLowerCase().replace(/\s+/g, '-');
        const source = this.data.sources.find(s => s.id === listing.source);
        const sourceName = source?.name || listing.source;
        const sourceFlag = source?.flag || '';

        // Analysis section
        const analysis = listing.analysis;
        const verdictClass = this.getVerdictClass(analysis?.verdict);

        const analysisHtml = analysis ? `
            <div class="listing-analysis">
                <div class="verdict ${verdictClass}">${analysis.verdict}</div>
                <div class="analysis-details">
                    <p class="reasoning">${analysis.reasoning}</p>
                    <div class="analysis-meta">
                        <span class="copyable"><strong>Copyable:</strong> ${analysis.uspCopyable}</span>
                    </div>
                    ${analysis.risks?.length && analysis.risks[0] !== 'N/A - sold' ? `
                        <div class="risks">
                            <strong>Risks:</strong> ${analysis.risks.join(' · ')}
                        </div>
                    ` : ''}
                    ${analysis.opportunity ? `
                        <div class="opportunity">
                            <strong>Opportunity:</strong> ${analysis.opportunity}
                        </div>
                    ` : ''}
                </div>
            </div>
        ` : '';

        return `
            <article class="listing-card ${verdictClass}">
                <div class="listing-header">
                    <div class="listing-meta">
                        <span class="listing-category ${categoryClass}">${listing.category}</span>
                        <span class="listing-revenue">${mrr || revenue}</span>
                    </div>
                    <h3 class="listing-title">${listing.title}</h3>
                </div>
                <div class="listing-body">
                    <p class="listing-description">${listing.description}</p>
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
                    <span class="listing-source">${sourceFlag} via ${sourceName}</span>
                    <a href="${listing.url}" target="_blank" rel="noopener" class="listing-link">
                        View Listing →
                    </a>
                </div>
            </article>
        `;
    }

    renderInsights() {
        // EBITDA Multiples
        const multiplesList = document.getElementById('multiples-list');
        const multiples = this.data.marketInsights.ebitdaMultiples;

        multiplesList.innerHTML = Object.entries(multiples)
            .filter(([key]) => key !== 'average')
            .map(([sector, range]) => `
                <div class="multiple-item">
                    <span class="multiple-sector">${sector}</span>
                    <span class="multiple-range">${range.low}x - ${range.high}x</span>
                </div>
            `).join('') + `
                <div class="multiple-item average">
                    <span class="multiple-sector">Average (all sectors)</span>
                    <span class="multiple-range">${multiples.average}x</span>
                </div>
            `;

        // Trends
        const trendsList = document.getElementById('trends-list');
        trendsList.innerHTML = this.data.marketInsights.trends
            .map(trend => `<li>${trend}</li>`)
            .join('');

        // Categories - show counts from our data
        const categoriesOverview = document.getElementById('categories-overview');
        const categoryCounts = {};
        this.data.listings.forEach(l => {
            categoryCounts[l.category] = (categoryCounts[l.category] || 0) + 1;
        });

        categoriesOverview.innerHTML = Object.entries(categoryCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, count]) => `
                <div class="category-item">
                    <span class="category-name">${cat}</span>
                    <span class="category-count">${count} listings</span>
                </div>
            `).join('');
    }

    renderSources() {
        const sourcesGrid = document.getElementById('sources-grid');
        sourcesGrid.innerHTML = this.data.sources.map(source => {
            const count = this.data.listings.filter(l => l.source === source.id).length;
            return `
                <div class="source-card">
                    <div class="source-header">
                        <span class="source-flag">${source.flag || ''}</span>
                        <h3>${source.name}</h3>
                    </div>
                    <div class="source-country">${source.country}</div>
                    <p>${source.description}</p>
                    <div class="source-stats">
                        <span class="source-count">${count} listings tracked</span>
                    </div>
                    <a href="${source.url}" target="_blank" rel="noopener" class="source-link">
                        Visit ${source.name} →
                    </a>
                </div>
            `;
        }).join('');
    }

    updateStats() {
        document.getElementById('total-listings').textContent = this.data.listings.length;
        document.getElementById('total-sources').textContent = this.data.sources.length;
        document.getElementById('last-updated').textContent = this.formatDate(this.data.lastUpdated);
    }

    formatCurrency(amount) {
        // Detect if likely USD (from US sources)
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

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    new BRSniper();
});
