document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('reddit-form');
  const input = document.getElementById('reddit-input');
  const results = document.getElementById('results');
  const filtersDiv = document.getElementById('filters');
  const loadAllBtn = document.getElementById('load-all-posts');
  const applyFiltersBtn = document.getElementById('apply-filters');
  const clearFiltersBtn = document.getElementById('clear-filters');

  const CORS_PROXY = 'https://corsproxy.io/?';

  let allPosts = [];
  let afterUrl = null;
  let baseFetchUrl = '';

  function extractPosts(doc) {
    let posts = [];
    // Try new Reddit
    let containers = Array.from(doc.querySelectorAll('div[data-testid="post-container"]'));
    if (containers.length > 0) {
      posts = containers.map(post => {
        let title = post.querySelector('h3, a.title')?.textContent || 'No title';
        let link = post.querySelector('a[data-click-id="body"], a.title')?.href || '#';
        if (link.startsWith('/')) link = 'https://www.reddit.com' + link;
        let author = post.querySelector('a[data-testid="post_author_link"]')?.textContent || '';
        let dateElem = post.querySelector('a[data-click-id="timestamp"] > time');
        let date = dateElem ? dateElem.getAttribute('datetime') : '';
        return { title, link, author, date };
      });
    } else {
      // Try old Reddit
      containers = Array.from(doc.querySelectorAll('div.thing.link'));
      posts = containers.map(post => {
        let title = post.querySelector('a.title')?.textContent || 'No title';
        let link = post.querySelector('a.title')?.href || '#';
        if (link.startsWith('/')) link = 'https://www.reddit.com' + link;
        let author = post.getAttribute('data-author') || '';
        let date = post.querySelector('time')?.getAttribute('datetime') || '';
        return { title, link, author, date };
      });
    }
    return posts;
  }

  function extractNextPageUrl(doc) {
    // Try new Reddit
    let next = doc.querySelector('span[role="navigation"] a[rel="nofollow next"], a[rel="nofollow next"]');
    if (next) return next.href;
    // Try old Reddit
    let oldNext = doc.querySelector('span.next-button > a');
    if (oldNext) return oldNext.href;
    return null;
  }

  function renderPosts(posts) {
    const results = document.getElementById('results');
    if (!posts.length) {
      results.innerHTML = '<p>No posts found or Reddit layout not supported.</p>';
      return;
    }
    let htmlList = '<ul class="post-list">';
    posts.forEach(post => {
      htmlList += `<li><a href="${post.link}" target="_blank">${post.title}</a>`;
      if (post.author) htmlList += ` <span style="color:#888;font-size:0.95em;">by ${post.author}</span>`;
      if (post.date) htmlList += ` <span style="color:#aaa;font-size:0.9em;">[${post.date.split('T')[0]}]</span>`;
      htmlList += '</li>';
    });
    htmlList += '</ul>';
    results.innerHTML = htmlList;
  }

  function applyFilters() {
    const keyword = document.getElementById('filter-keyword').value.trim().toLowerCase();
    const author = document.getElementById('filter-author').value.trim().toLowerCase();
    const dateStart = document.getElementById('filter-date-start').value;
    const dateEnd = document.getElementById('filter-date-end').value;
    let filtered = allPosts.filter(post => {
      let ok = true;
      if (keyword && !post.title.toLowerCase().includes(keyword)) ok = false;
      if (author && post.author.toLowerCase() !== author) ok = false;
      if (dateStart && post.date) ok = ok && (post.date >= dateStart);
      if (dateEnd && post.date) ok = ok && (post.date <= dateEnd + 'T23:59:59');
      return ok;
    });
    renderPosts(filtered);
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
    // Always use old.reddit.com for scraping
    if (/^https?:\/\//.test(url)) {
      // Replace www.reddit.com or reddit.com with old.reddit.com
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
      filtersDiv.style.display = '';
      loadAllBtn.style.display = afterUrl ? '' : 'none';
    } catch (err) {
      results.innerHTML = `<p>Error: ${err.message}</p>`;
      filtersDiv.style.display = 'none';
      loadAllBtn.style.display = 'none';
    }
  }

  async function loadAllPosts() {
    loadAllBtn.disabled = true;
    let nextUrl = afterUrl;
    while (nextUrl) {
      results.innerHTML = `<p>Loading more posts... (${allPosts.length})</p>`;
      try {
        const doc = await fetchAndParse(nextUrl);
        const newPosts = extractPosts(doc);
        allPosts = allPosts.concat(newPosts);
        renderPosts(allPosts);
        nextUrl = extractNextPageUrl(doc);
      } catch (err) {
        break;
      }
    }
    loadAllBtn.disabled = false;
    loadAllBtn.style.display = 'none';
  }

  form.addEventListener('submit', fetchInitial);
  loadAllBtn.addEventListener('click', loadAllPosts);
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
    renderPosts(allPosts);
  });
}); 
