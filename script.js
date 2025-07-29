// script.js

document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('reddit-form');
  const input = document.getElementById('reddit-input');
  const results = document.getElementById('results');
  const filtersDiv = document.getElementById('filters');
  const applyFiltersBtn = document.getElementById('apply-filters');
  const clearFiltersBtn = document.getElementById('clear-filters');
  const paginationDiv = document.getElementById('pagination');

  const CORS_PROXY = 'https://corsproxy.io/?';

  let allPosts = [];
  let afterUrl = null;
  let baseFetchUrl = '';
  let currentPage = 1;
  const POSTS_PER_PAGE = 30;
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
      let commentsLink = post.querySelector('a.comments')?.href || '#';
      let link = commentsLink.replace('old.reddit.com', 'www.reddit.com');
      let author = post.getAttribute('data-author') || '';
      let date = post.querySelector('time')?.getAttribute('datetime') || '';
      let subreddit = post.getAttribute('data-subreddit') || '';
      let flair = post.querySelector('span.linkflairlabel')?.textContent || '';
      return { title, link, author, date, subreddit, flair };
    });
    return posts;
  }

  function extractNextPageUrl(doc) {
    let next = doc.querySelector('span.next-button > a');
    return next ? next.href : null;
  }

  function renderSortDropdown() {
    let sortDiv = document.getElementById('sort-dropdown');
    if (!sortDiv) {
      sortDiv = document.createElement('div');
      sortDiv.id = 'sort-dropdown';
      results.parentNode.insertBefore(sortDiv, results);
    }
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
    if (!paginationDiv) return;
    paginationDiv.innerHTML = '';
    if (totalPages <= 1) return;

    const maxVisiblePages = 6;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = startPage + maxVisiblePages - 1;
    if (endPage > totalPages) {
      endPage = totalPages;
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    let eCount = totalPages;
    let redditLabel = 'R' + 'e'.repeat(eCount) + 'ddit';

    let html = `<div class="nav-word">${redditLabel}</div>`;
    for (let i = startPage; i <= endPage; i++) {
      html += `<span class="page-num${i === currentPage ? ' active' : ''}" data-page="${i}">${i}</span> `;
    }
    if (endPage < totalPages) {
      html += `<span class="page-next" data-page="next">&#8594;</span>`;
    }

    paginationDiv.innerHTML = html;

    Array.from(paginationDiv.querySelectorAll('.page-num')).forEach(el => {
      el.onclick = function() {
        currentPage = parseInt(this.getAttribute('data-page'));
        renderPosts(filteredPosts);
      };
    });
    const nextBtn = paginationDiv.querySelector('.page-next');
    if (nextBtn) nextBtn.onclick = function() {
      if (currentPage < totalPages) {
        currentPage++;
        renderPosts(filteredPosts);
      }
    };
  }

  function renderPosts(posts) {
    const feedback = document.getElementById('filter-feedback');
    if (!posts.length) {
      results.innerHTML = '<p>No posts found.</p>';
      if (feedback) feedback.textContent = 'No posts match your filters.';
      renderPagination(1);
      return;
    }
    const totalPages = Math.ceil(posts.length / POSTS_PER_PAGE);
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * POSTS_PER_PAGE;
    const end = start + POSTS_PER_PAGE;
    let htmlList = '<ul class="post-list">';
    posts.slice(start, end).forEach(post => {
      htmlList += `<li><a href="${post.link}" target="_blank">${post.title}</a>`;
      if (post.flair) htmlList += ` <span style="background:#ddd;border-radius:4px;padding:2px 6px;font-size:0.9em;">${post.flair}</span>`;
      if (post.subreddit) htmlList += ` <span style="color:#ff4500;">r/${post.subreddit}</span>`;
      if (post.author) htmlList += ` <span style="color:#888;">by ${post.author}</span>`;
      if (post.date) htmlList += ` <span style="color:#aaa;">[${post.date.split('T')[0]}]</span>`;
      htmlList += '</li>';
    });
    htmlList += '</ul>';
    results.innerHTML = htmlList;
    if (feedback) feedback.textContent = `Showing ${posts.length} post${posts.length !== 1 ? 's' : ''}. Page ${currentPage} of ${totalPages}`;
    renderPagination(totalPages);
  }

  function applyFilters() {
    const keyword = document.getElementById('filter-keyword').value.trim().toLowerCase();
    const author = document.getElementById('filter-author').value.trim().toLowerCase();
    const dateStart = document.getElementById('filter-date-start').value;
    const dateEnd = document.getElementById('filter-date-end').value;
    const flair = document.getElementById('filter-flair')?.value.trim().toLowerCase() || '';
    currentPage = 1;
    filteredPosts = allPosts.filter(post => {
      let ok = true;
      if (keyword) {
        const inTitle = post.title.toLowerCase().includes(keyword);
        const inAuthor = post.author.toLowerCase().includes(keyword);
        const inSubreddit = post.subreddit.toLowerCase().includes(keyword);
        if (!inTitle && !inAuthor && !inSubreddit) ok = false;
      }
      if (author && (!post.author || !post.author.toLowerCase().includes(author))) ok = false;
      if (flair && (!post.flair || !post.flair.toLowerCase().includes(flair))) ok = false;
      if ((dateStart || dateEnd) && post.date) {
        const postDate = new Date(post.date);
        if (dateStart && postDate < new Date(dateStart)) ok = false;
        if (dateEnd && postDate > new Date(dateEnd)) ok = false;
      }
      return ok;
    });
    filteredPosts.sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });
    renderPosts(filteredPosts);
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
      let doc = await fetchAndParse(baseFetchUrl);
      allPosts = extractPosts(doc);
      afterUrl = extractNextPageUrl(doc);
      filtersDiv.style.display = '';
      applyFilters();
      if (afterUrl) loadRemainingPosts();
    } catch (err) {
      results.innerHTML = `<p>Error: ${err.message}</p>`;
      filtersDiv.style.display = 'none';
      paginationDiv.style.display = 'none';
    }
  }

  async function loadRemainingPosts() {
    if (isLoadingMore) return;
    isLoadingMore = true;
    while (afterUrl) {
      const doc = await fetchAndParse(afterUrl);
      const newPosts = extractPosts(doc);
      allPosts = allPosts.concat(newPosts);
      afterUrl = extractNextPageUrl(doc);
      applyFilters();
    }
    isLoadingMore = false;
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
    if (document.getElementById('filter-flair')) document.getElementById('filter-flair').value = '';
    currentPage = 1;
    filteredPosts = allPosts;
    renderPosts(filteredPosts);
  });

  renderSortDropdown();

  // Add Flair Filter Input
  const flairInput = document.createElement('input');
  flairInput.type = 'text';
  flairInput.id = 'filter-flair';
  flairInput.placeholder = 'Filter by flair';
  filtersDiv.insertBefore(flairInput, applyFiltersBtn);
});
