// BR Sniper - Funded Startups Tracker

class FundedStartups {
    constructor() {
        this.data = null;
        this.filteredStartups = [];
        this.activeSource = 'all';
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
            this.data = await response.json();
            this.filteredStartups = [...this.data.startups];
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }

    setupSourceTabs() {
        const tabsContainer = document.getElementById('source-tabs');

        // Update "All" count
        document.getElementById('count-all').textContent = this.data.startups.length;

        // Create tabs for each source
        this.data.sources.forEach(source => {
            const count = this.data.startups.filter(s => s.source === source.id).length;
            if (count === 0) return; // Skip empty sources

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

            tabsContainer.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            this.activeSource = tab.dataset.source;
            this.applyFilters();
        });
    }

    setupFilters() {
        // Populate stage filter
        const stageFilter = document.getElementById('stage-filter');
        this.data.stages.forEach(stage => {
            const option = document.createElement('option');
            option.value = stage.toLowerCase();
            option.textContent = stage;
            stageFilter.appendChild(option);
        });

        // Populate industry filter
        const industryFilter = document.getElementById('industry-filter');
        const industries = [...new Set(this.data.startups.map(s => s.industry))];
        industries.forEach(industry => {
            const option = document.createElement('option');
            option.value = industry.toLowerCase();
            option.textContent = industry;
            industryFilter.appendChild(option);
        });

        // Add event listeners
        document.getElementById('stage-filter').addEventListener('change', () => this.applyFilters());
        document.getElementById('industry-filter').addEventListener('change', () => this.applyFilters());
        document.getElementById('amount-filter').addEventListener('change', () => this.applyFilters());
        document.getElementById('copyability-filter').addEventListener('change', () => this.applyFilters());
        document.getElementById('sort-filter').addEventListener('change', () => this.applyFilters());

        this.applyFilters();
    }

    applyFilters() {
        const stageFilter = document.getElementById('stage-filter').value;
        const industryFilter = document.getElementById('industry-filter').value;
        const amountFilter = parseInt(document.getElementById('amount-filter').value);
        const copyabilityFilter = document.getElementById('copyability-filter').value;
        const sortFilter = document.getElementById('sort-filter').value;

        this.filteredStartups = this.data.startups.filter(startup => {
            // Source filter (from tabs)
            if (this.activeSource !== 'all' && startup.source !== this.activeSource) {
                return false;
            }

            // Stage filter
            if (stageFilter !== 'all' && startup.fundingRound.toLowerCase() !== stageFilter) {
                return false;
            }

            // Industry filter
            if (industryFilter !== 'all' && startup.industry.toLowerCase() !== industryFilter) {
                return false;
            }

            // Amount filter (>$250K default)
            if (startup.amountRaised < amountFilter) {
                return false;
            }

            // Copyability filter
            if (copyabilityFilter !== 'all') {
                const minCopyability = parseInt(copyabilityFilter);
                if (startup.analysis.copyabilityScore < minCopyability) {
                    return false;
                }
            }

            // Only show last 30 days
            const daysSincePublished = (Date.now() - new Date(startup.datePublished).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSincePublished > 30) {
                return false;
            }

            return true;
        });

        // Sort
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

        this.renderStartups();
    }

    renderStartups() {
        const grid = document.getElementById('startups-grid');
        const noResults = document.getElementById('no-results');

        if (this.filteredStartups.length === 0) {
            grid.innerHTML = '';
            noResults.style.display = 'block';
            return;
        }

        noResults.style.display = 'none';
        grid.innerHTML = this.filteredStartups.map(startup => this.createStartupCard(startup)).join('');
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

        const investorsList = startup.investors
            .slice(0, 4)
            .map(inv => `<span class="investor ${inv.lead ? 'lead' : ''}">${inv.name}${inv.lead ? ' (Lead)' : ''}</span>`)
            .join('');

        const whyFundedList = startup.whyFunded
            .map(reason => `<li>${reason}</li>`)
            .join('');

        const uspsList = startup.usps
            .map(usp => `<span class="usp-tag">${usp}</span>`)
            .join('');

        return `
            <article class="startup-card">
                <div class="startup-header">
                    <div class="startup-meta">
                        <span class="funding-round">${startup.fundingRound}</span>
                        <span class="amount-raised">${amount}</span>
                    </div>
                    <h3 class="startup-name">${startup.companyName}</h3>
                    <p class="startup-description">${startup.description}</p>
                </div>

                <div class="startup-metrics">
                    <div class="metric">
                        <span class="metric-icon">💰</span>
                        <span class="metric-value">${amount}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-icon">🏢</span>
                        <span class="metric-value">${startup.companyType}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-icon">🌍</span>
                        <span class="metric-value">${startup.location}</span>
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
                    <div class="analysis-verdict">${startup.analysis.verdict}</div>
                    <p class="analysis-reasoning">${startup.analysis.reasoning}</p>
                    ${startup.analysis.alternativeApproach ? `
                        <div class="alternative-approach">
                            <strong>Alternative Approach:</strong> ${startup.analysis.alternativeApproach}
                        </div>
                    ` : ''}
                </div>

                <div class="startup-footer">
                    <span class="startup-source">${source?.flag || ''} via ${source?.name || startup.source}</span>
                    <div class="startup-links">
                        ${startup.companyUrl ? `<a href="${startup.companyUrl}" target="_blank" rel="noopener" class="company-link">Website</a>` : ''}
                        <a href="${startup.articleUrl}" target="_blank" rel="noopener" class="article-link">Read Article →</a>
                    </div>
                </div>
            </article>
        `;
    }

    renderSources() {
        const sourcesGrid = document.getElementById('sources-grid');
        sourcesGrid.innerHTML = this.data.sources.map(source => {
            const count = this.data.startups.filter(s => s.source === source.id).length;
            return `
                <div class="source-card">
                    <div class="source-header">
                        <span class="source-flag">${source.flag || ''}</span>
                        <h3>${source.name}</h3>
                    </div>
                    <p>${source.description}</p>
                    <div class="source-stats">
                        <span class="source-count">${count} startups tracked</span>
                    </div>
                    <a href="${source.url}" target="_blank" rel="noopener" class="source-link">
                        Visit ${source.name} →
                    </a>
                </div>
            `;
        }).join('');
    }

    updateStats() {
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new FundedStartups();
});
