// BR Sniper - Funded Startups Tracker

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

class FundedStartups {
    constructor() {
        this.data = null;
        this.filteredStartups = [];
        this.activeSource = 'all';
        this.currentPage = 1;
        this.pageSize = 20;
        this.init();
    }

    async init() {
        await this.loadData();
        this.setupSourceTabs();
        this.setupFilters();
        this.renderStartups();
        this.renderSources();
        this.updateStats();
    }

    async loadData() {
        try {
            const response = await fetch('data/funded-startups.json');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            this.data = await response.json();
            this.filteredStartups = [...this.data.startups];
        } catch (error) {
            const grid = document.getElementById('startups-grid');
            if (grid) {
                grid.innerHTML = '<div class="error-state"><p>Failed to load funded startups. Please try refreshing the page.</p></div>';
            }
        }
    }

    setupSourceTabs() {
        if (!this.data) return;
        const tabsContainer = document.getElementById('source-tabs');

        document.getElementById('count-all').textContent = this.data.startups.length;

        this.data.sources.forEach(source => {
            const count = this.data.startups.filter(s => s.source === source.id).length;
            if (count === 0) return;

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
        const stageFilter = document.getElementById('stage-filter');
        this.data.stages.forEach(stage => {
            const option = document.createElement('option');
            option.value = stage.toLowerCase();
            option.textContent = stage;
            stageFilter.appendChild(option);
        });

        const industryFilter = document.getElementById('industry-filter');
        const industries = [...new Set(this.data.startups.map(s => s.industry))];
        industries.forEach(industry => {
            const option = document.createElement('option');
            option.value = industry.toLowerCase();
            option.textContent = industry;
            industryFilter.appendChild(option);
        });

        const locationFilter = document.getElementById('location-filter');
        const locations = [...new Set(
            this.data.startups
                .map(s => s.headquarters || s.location)
                .filter(Boolean)
        )].sort();
        locations.forEach(loc => {
            const option = document.createElement('option');
            option.value = loc;
            option.textContent = loc;
            locationFilter.appendChild(option);
        });

        document.getElementById('date-filter').addEventListener('change', () => this.applyFilters());
        document.getElementById('amount-filter').addEventListener('change', () => this.applyFilters());
        document.getElementById('stage-filter').addEventListener('change', () => this.applyFilters());
        document.getElementById('industry-filter').addEventListener('change', () => this.applyFilters());
        document.getElementById('location-filter').addEventListener('change', () => this.applyFilters());
        document.getElementById('copyability-filter').addEventListener('change', () => this.applyFilters());
        document.getElementById('sort-filter').addEventListener('change', () => this.applyFilters());

        this.applyFilters();
    }

    applyFilters() {
        const dateFilter = document.getElementById('date-filter').value;
        const amountFilter = parseInt(document.getElementById('amount-filter').value);
        const stageFilter = document.getElementById('stage-filter').value;
        const industryFilter = document.getElementById('industry-filter').value;
        const locationFilter = document.getElementById('location-filter').value;
        const copyabilityFilter = document.getElementById('copyability-filter').value;
        const sortFilter = document.getElementById('sort-filter').value;

        this.filteredStartups = this.data.startups.filter(startup => {
            if (this.activeSource !== 'all' && startup.source !== this.activeSource) {
                return false;
            }

            if (dateFilter !== 'all') {
                const maxDays = parseInt(dateFilter);
                const daysSincePublished = (Date.now() - new Date(startup.datePublished).getTime()) / (1000 * 60 * 60 * 24);
                if (daysSincePublished > maxDays) {
                    return false;
                }
            }

            if (amountFilter > 0 && startup.amountRaised < amountFilter) {
                return false;
            }

            if (stageFilter !== 'all' && startup.fundingRound.toLowerCase() !== stageFilter) {
                return false;
            }

            if (industryFilter !== 'all' && startup.industry.toLowerCase() !== industryFilter) {
                return false;
            }

            if (locationFilter !== 'all') {
                const startupLocation = startup.headquarters || startup.location || '';
                if (startupLocation !== locationFilter) {
                    return false;
                }
            }

            if (copyabilityFilter !== 'all') {
                const minCopyability = parseInt(copyabilityFilter);
                if (startup.analysis.copyabilityScore < minCopyability) {
                    return false;
                }
            }

            return true;
        });

        this.filteredStartups.sort((a, b) => {
            switch (sortFilter) {
                case 'date':
                    return new Date(b.datePublished) - new Date(a.datePublished);
                case 'amount':
                    return b.amountRaised - a.amountRaised;
                case 'copyability':
                    return b.analysis.copyabilityScore - a.analysis.copyabilityScore;
                default:
                    return 0;
            }
        });

        this.currentPage = 1;
        this.renderStartups();
    }

    renderStartups() {
        const grid = document.getElementById('startups-grid');
        const noResults = document.getElementById('no-results');

        if (this.filteredStartups.length === 0) {
            grid.innerHTML = '';
            noResults.style.display = 'block';
            this.renderPagination(0);
            return;
        }

        noResults.style.display = 'none';

        const startIdx = (this.currentPage - 1) * this.pageSize;
        const pageItems = this.filteredStartups.slice(startIdx, startIdx + this.pageSize);
        grid.innerHTML = pageItems.map(startup => this.createStartupCard(startup)).join('');
        this.renderPagination(this.filteredStartups.length);
    }

    renderPagination(totalItems) {
        let paginationEl = document.getElementById('pagination');
        if (!paginationEl) {
            paginationEl = document.createElement('div');
            paginationEl.id = 'pagination';
            paginationEl.className = 'pagination';
            const grid = document.getElementById('startups-grid');
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

        html += `<span class="page-info">Page ${this.currentPage} of ${totalPages} (${totalItems} startups)</span>`;

        paginationEl.innerHTML = html;
        paginationEl.onclick = (e) => {
            const btn = e.target.closest('.page-btn');
            if (!btn) return;
            this.currentPage = parseInt(btn.dataset.page);
            this.renderStartups();
            document.getElementById('startups').scrollIntoView({ behavior: 'smooth' });
        };
    }

    getCopyabilityClass(score) {
        if (score >= 4) return 'copyability-easy';
        if (score >= 3) return 'copyability-medium';
        return 'copyability-hard';
    }

    getCopyabilityLabel(score) {
        if (score >= 4) return 'Easy to Copy';
        if (score >= 3) return 'Medium';
        if (score >= 2) return 'Hard';
        return 'Very Hard';
    }

    getDaysAgo(dateStr) {
        const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
        if (days === 0) return 'Today';
        if (days === 1) return 'Yesterday';
        return `${days}d ago`;
    }

    createStartupCard(startup) {
        const amount = this.formatCurrency(startup.amountRaised);
        const copyabilityClass = this.getCopyabilityClass(startup.analysis.copyabilityScore);
        const copyabilityLabel = this.getCopyabilityLabel(startup.analysis.copyabilityScore);
        const daysAgo = this.getDaysAgo(startup.datePublished);
        const source = this.data.sources.find(s => s.id === startup.source);

        const articleUrl = isValidUrl(startup.articleUrl) ? startup.articleUrl : '#';
        const companyUrl = startup.companyUrl && isValidUrl(startup.companyUrl) ? startup.companyUrl : null;

        const investorsList = startup.investors
            .slice(0, 4)
            .map(inv => `<span class="investor ${inv.lead ? 'lead' : ''}">${escapeHtml(inv.name)}${inv.lead ? ' (Lead)' : ''}</span>`)
            .join('');

        const whyFundedList = startup.whyFunded
            .map(reason => `<li>${escapeHtml(reason)}</li>`)
            .join('');

        const uspsList = startup.usps
            .map(usp => `<span class="usp-tag">${escapeHtml(usp)}</span>`)
            .join('');

        return `
            <article class="startup-card">
                <div class="startup-header">
                    <div class="startup-meta">
                        <span class="funding-round">${escapeHtml(startup.fundingRound)}</span>
                        <span class="amount-raised">${amount}</span>
                    </div>
                    <h3 class="startup-name">${escapeHtml(startup.companyName)}</h3>
                    <p class="startup-description">${escapeHtml(startup.description)}</p>
                </div>

                <div class="startup-metrics">
                    <div class="metric">
                        <span class="metric-icon">💰</span>
                        <span class="metric-value">${amount}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-icon">🏢</span>
                        <span class="metric-value">${escapeHtml(startup.companyType)}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-icon">🌍</span>
                        <span class="metric-value">${escapeHtml(startup.location)}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-icon">📅</span>
                        <span class="metric-value">${daysAgo}</span>
                    </div>
                </div>

                <div class="startup-investors">
                    <div class="section-label">Investors</div>
                    <div class="investors-list">${investorsList}</div>
                </div>

                <div class="startup-why-funded">
                    <div class="section-label">Why It Got Funded</div>
                    <ul class="why-funded-list">${whyFundedList}</ul>
                </div>

                <div class="startup-usps">
                    <div class="section-label">Key USPs</div>
                    <div class="usps-list">${uspsList}</div>
                </div>

                <div class="startup-analysis ${copyabilityClass}">
                    <div class="analysis-header">
                        <span class="analysis-icon">🎯</span>
                        <span class="analysis-title">Copyability Analysis</span>
                        <span class="copyability-badge">${copyabilityLabel}</span>
                    </div>
                    <div class="analysis-verdict">${escapeHtml(startup.analysis.verdict)}</div>
                    <p class="analysis-reasoning">${escapeHtml(startup.analysis.reasoning)}</p>
                    ${startup.analysis.alternativeApproach ? `
                        <div class="alternative-approach">
                            <strong>Alternative Approach:</strong> ${escapeHtml(startup.analysis.alternativeApproach)}
                        </div>
                    ` : ''}
                </div>

                <div class="startup-footer">
                    <span class="startup-source">${escapeHtml(source?.flag)} via ${escapeHtml(source?.name || startup.source)}</span>
                    <div class="startup-links">
                        ${companyUrl ? `<a href="${companyUrl}" target="_blank" rel="noopener" class="company-link">Website</a>` : ''}
                        <a href="${articleUrl}" target="_blank" rel="noopener" class="article-link">Read Article →</a>
                    </div>
                </div>
            </article>
        `;
    }

    renderSources() {
        if (!this.data) return;
        const sourcesGrid = document.getElementById('sources-grid');
        sourcesGrid.innerHTML = this.data.sources.map(source => {
            const count = this.data.startups.filter(s => s.source === source.id).length;
            const sourceUrl = isValidUrl(source.url) ? source.url : '#';
            return `
                <div class="source-card">
                    <div class="source-header">
                        <span class="source-flag">${escapeHtml(source.flag)}</span>
                        <h3>${escapeHtml(source.name)}</h3>
                    </div>
                    <p>${escapeHtml(source.description)}</p>
                    <div class="source-stats">
                        <span class="source-count">${count} startups tracked</span>
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
        document.getElementById('total-startups').textContent = this.data.startups.length;

        const totalRaised = this.data.startups.reduce((sum, s) => sum + s.amountRaised, 0);
        document.getElementById('total-raised').textContent = this.formatCurrency(totalRaised);

        document.getElementById('last-updated').textContent = this.formatDate(this.data.lastUpdated);
    }

    formatCurrency(amount) {
        if (amount >= 1000000000) {
            return `$${(amount / 1000000000).toFixed(1)}B`;
        } else if (amount >= 1000000) {
            return `$${(amount / 1000000).toFixed(0)}M`;
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
    new FundedStartups();
});
