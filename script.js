// script.js

document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('reddit-form');
    const input = document.getElementById('reddit-input');
    const results = document.getElementById('results');
    const filtersDiv = document.getElementById('filters');
    const applyFiltersBtn = document.getElementById('apply-filters');
    const clearFiltersBtn = document.getElementById('clear-filters');
  
    const CORS_PROXY = 'https://corsproxy.io/?';
  
    let allPosts = [];
    let afterUrl = null;
    let baseFetchUrl = '';
    let currentPage = 1;
    const POSTS_PER_PAGE = 25;
    let filteredPosts = [];
    let sortOrder = 'newest';
    let isLoadingMore = false;
  
    function extractPosts(doc) {
      let posts = [];
      let containers = Array.from(doc.querySelectorAll('div.thing.link'));
      posts = containers.filter(post => {
        if (post.classList.contains('promotedlink')) return false;
        if (post.style.display === 'none') return false;
        return true;
      }).map(post => {
        let title = post.querySelector('a.title')?.textContent || 'No title';
        let link = post.querySelector('a.comments')?.href || '#';
        let author = post.getAttribute('data-author') || '';
        let date = post.querySelector('time')?.getAttribute('datetime') || '';
        let subreddit = post.getAttribute('data-subreddit') || '';
        return { title, link, author, date, subreddit };
      });
      return posts;
    }
  
    function extractNextPageUrl(doc) {
      let next = doc.querySelector('span.next-button > a');
      return next ? next.href : null;
    }
  
    function renderSortDropdown() {
      let sortDiv = document.getElementById('sort-dropdown');
      if (!sortDiv) return;
      sortDiv.innerHTML = `
        <label for="sort-select" style="font-weight:500;margin-right:0.5em;">Sort by:</label>
        <select id="sort-select">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      `;
      document.getElementById('sort-select').value = sortOrder;
      document.getElementById('sort-select').onchange = function() {
        sortOrder = this.value;
        applyFilters();
      };
    }
  
    function renderPagination(totalPages) {
      const paginationDiv = document.getElementById('pagination');
      if (!paginationDiv) return;
      if (totalPages <= 1) {
        paginationDiv.innerHTML = '';
        return;
      }
      let html = '';
      for (let i = 1; i <= totalPages; i++) {
        html += `<span class="page-num${i === currentPage ? ' active' : ''}" data-page="${i}">${i}</span> `;
      }
      html += `<span class="page-next" data-page="next">&#8594; Next</span>`;
      paginationDiv.innerHTML = html;
      Array.from(paginationDiv.querySelectorAll('.page-num')).forEach(el => {
        el.onclick = function() {
          currentPage = parseInt(this.getAttribute('data-page'));
          renderPosts(filteredPosts);
        };
      });
      paginationDiv.querySelector('.page-next').onclick = function() {
        if (currentPage < totalPages) {
          currentPage++;
          renderPosts(filteredPosts);
        }
      };
    }
  
    function renderPosts(posts) {
      renderSortDropdown();
      filteredPosts = [...posts];
      filteredPosts.sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
      });
      if (!filteredPosts.length) {
        results.innerHTML = '<p>No posts found.</p>';
        const feedback = document.getElementById('filter-feedback');
        if (feedback) feedback.textContent = 'No posts match your filters.';
        renderPagination(1);
        return;
      }
      const totalPages = Math.ceil(filteredPosts.length / POSTS_PER_PAGE);
      if (currentPage > totalPages) currentPage = totalPages;
      const start = (currentPage - 1) * POSTS_PER_PAGE;
      const end = start + POSTS_PER_PAGE;
      let htmlList = '<ul class="post-list">';
      filteredPosts.slice(start, end).forEach(post => {
        htmlList += `<li><a href="${post.link}" target="_blank">${post.title}</a>`;
        if (post.subreddit) htmlList += ` <span style="color:#ff4500;">r/${post.subreddit}</span>`;
        if (post.author) htmlList += ` <span style="color:#888;">by ${post.author}</span>`;
        if (post.date) htmlList += ` <span style="color:#aaa;">[${post.date.split('T')[0]}]</span>`;
        htmlList += '</li>';
      });
      htmlList += '</ul>';
      results.innerHTML = htmlList;
      const feedback = document.getElementById('filter-feedback');
      if (feedback) feedback.textContent = `Showing ${filteredPosts.length} post${filteredPosts.length !== 1 ? 's' : ''}. Page ${currentPage} of ${totalPages}`;
      renderPagination(totalPages);
    }
  
    function applyFilters() {
      const keyword = document.getElementById('filter-keyword').value.trim().toLowerCase();
      const author = document.getElementById('filter-author').value.trim().toLowerCase();
      const dateStart = document.getElementById('filter-date-start').value;
      const dateEnd = document.getElementById('filter-date-end').value;
      currentPage = 1;
      let filtered = allPosts.filter(post => {
        let ok = true;
        if (keyword) {
          const inTitle = post.title.toLowerCase().includes(keyword);
          const inAuthor = post.author.toLowerCase().includes(keyword);
          const inSubreddit = post.subreddit.toLowerCase().includes(keyword);
          if (!inTitle && !inAuthor && !inSubreddit) ok = false;
        }
        if (author && (!post.author || !post.author.toLowerCase().includes(author))) ok = false;
        if ((dateStart || dateEnd) && post.date) {
          const postDate = new Date(post.date);
          if (dateStart && postDate < new Date(dateStart)) ok = false;
          if (dateEnd && postDate > new Date(dateEnd)) ok = false;
        }
        return ok;
      });
      renderPosts(filtered);
    }
  
    function showLoadingMoreIndicator(show) {
      let indicator = document.getElementById('loading-more-indicator');
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'loading-more-indicator';
        indicator.style.textAlign = 'center';
        indicator.style.color = '#888';
        indicator.style.margin = '1em 0';
        indicator.textContent = 'Loading more posts…';
        const container = document.querySelector('.container');
        if (container) container.appendChild(indicator);
      }
      indicator.style.display = show ? '' : 'none';
    }
  
    async function fetchAndParse(url) {
      const response = await fetch(CORS_PROXY + url, { credentials: 'omit' });
      if (!response.ok) throw new Error('Failed to fetch page');
      const html = await response.text();
      const parser = new DOMParser();
      return parser.parseFromString(html, 'text/html');
    }
  
    async function fetchInitial(e) {
      e.preventDefault();
      results.innerHTML = '<p>Loading...</p>';
      allPosts = [];
      afterUrl = null;
      let url = input.value.trim();
      if (/^https?:\/\//.test(url)) {
        baseFetchUrl = url.replace(/^https?:\/\/(www\.)?reddit\.com/, 'https://old.reddit.com');
      } else if (/^r\//i.test(url)) {
        baseFetchUrl = `https://old.reddit.com/${url}/`;
      } else if (/^u\//i.test(url) || /^user\//i.test(url)) {
        baseFetchUrl = `https://old.reddit.com/${url.replace(/^u\//i, 'user/')}/`;
      } else {
        baseFetchUrl = `https://old.reddit.com/r/${url}/`;
      }
      try {
        const doc = await fetchAndParse(baseFetchUrl);
        allPosts = extractPosts(doc);
        afterUrl = extractNextPageUrl(doc);
        renderPosts(allPosts);
        if (filtersDiv) filtersDiv.style.display = '';
        renderSortDropdown();
        isLoadingMore = true;
        showLoadingMoreIndicator(true);
        while (afterUrl) {
          const nextDoc = await fetchAndParse(afterUrl);
          const newPosts = extractPosts(nextDoc);
          allPosts = allPosts.concat(newPosts);
          afterUrl = extractNextPageUrl(nextDoc);
          renderPosts(allPosts);
        }
        isLoadingMore = false;
        showLoadingMoreIndicator(false);
      } catch (err) {
        results.innerHTML = `<p>Error: ${err.message}</p>`;
        if (filtersDiv) filtersDiv.style.display = 'none';
        const paginationDiv = document.getElementById('pagination');
        if (paginationDiv) paginationDiv.style.display = 'none';
        showLoadingMoreIndicator(false);
      }
    }
  
    form.addEventListener('submit', fetchInitial);
    applyFiltersBtn.addEventListener('click', function(e) {
      e.preventDefault();
      applyFilters();
    });
    clearFiltersBtn.addEventListener('click', function(e) {
      e.preventDefault();
      document.getElementById('filter-keyword').value = '';
      document.getElementById('filter-author').value = '';
      document.getElementById('filter-date-start').value = '';
      document.getElementById('filter-date-end').value = '';
      currentPage = 1;
      renderPosts(allPosts);
    });
  });
  