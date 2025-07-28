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
  let afterToken = null;
  let baseFetchUrl = '';
  let currentPage = 1;
  const POSTS_PER_PAGE = 25;
  let filteredPosts = [];
  let sortOrder = 'newest'; // 'newest' or 'oldest'
  let isLoadingMore = false;
  let subredditName = '';

  // Updated to use Reddit's JSON API for better historical data access
  function extractPostsFromJson(data) {
    if (!data || !data.data || !data.data.children) return [];
    
    return data.data.children
      .filter(child => child.kind === 't3') // Only link posts
      .map(child => {
        const post = child.data;
        return {
          title: post.title || 'No title',
          link: `https://reddit.com${post.permalink}`, // Always link to Reddit post, not direct image
          author: post.author || '[deleted]',
          date: new Date(post.created_utc * 1000).toISOString(),
          score: post.score || 0,
          num_comments: post.num_comments || 0,
          url: post.url, // Original URL (image, article, etc.)
          selftext: post.selftext || '',
          subreddit: post.subreddit || '',
          id: post.id
        };
      });
  }

  function getNextToken(data) {
    if (!data || !data.data) return null;
    return data.data.after;
  }

  function renderSortDropdown() {
    let sortDiv = document.getElementById('sort-dropdown');
    if (!sortDiv) return;
    sortDiv.innerHTML = `
      <label for="sort-select" style="font-weight:500;margin-right:0.5em;">Sort by:</label>
      <select id="sort-select">
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="top">Top rated</option>
        <option value="comments">Most comments</option>
      </select>
      <label for="time-select" style="font-weight:500;margin:0 0.5em;">Time:</label>
      <select id="time-select">
        <option value="all">All time</option>
        <option value="year">Past year</option>
        <option value="month">Past month</option>
        <option value="week">Past week</option>
        <option value="day">Past day</option>
      </select>
    `;
    document.getElementById('sort-select').value = sortOrder;
    document.getElementById('sort-select').onchange = function() {
      sortOrder = this.value;
      applyFilters();
    };
    document.getElementById('time-select').onchange = function() {
      // Trigger new search with time filter
      if (subredditName) {
        fetchWithTimeFilter();
      }
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
    if (currentPage > 1) {
      html += `<span class="page-prev" data-page="prev">&#8592; Prev</span> `;
    }
    
    // Show page numbers around current page
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    
    if (start > 1) {
      html += `<span class="page-num" data-page="1">1</span> `;
      if (start > 2) html += `<span>...</span> `;
    }
    
    for (let i = start; i <= end; i++) {
      html += `<span class="page-num${i === currentPage ? ' active' : ''}" data-page="${i}">${i}</span> `;
    }
    
    if (end < totalPages) {
      if (end < totalPages - 1) html += `<span>...</span> `;
      html += `<span class="page-num" data-page="${totalPages}">${totalPages}</span> `;
    }
    
    if (currentPage < totalPages) {
      html += `<span class="page-next" data-page="next">Next &#8594;</span>`;
    }
    
    paginationDiv.innerHTML = html;
    
    // Add event listeners
    Array.from(paginationDiv.querySelectorAll('.page-num')).forEach(el => {
      el.onclick = function() {
        currentPage = parseInt(this.getAttribute('data-page'));
        renderPosts(filteredPosts);
      };
    });
    
    const prevBtn = paginationDiv.querySelector('.page-prev');
    if (prevBtn) {
      prevBtn.onclick = function() {
        if (currentPage > 1) {
          currentPage--;
          renderPosts(filteredPosts);
        }
      };
    }
    
    const nextBtn = paginationDiv.querySelector('.page-next');
    if (nextBtn) {
      nextBtn.onclick = function() {
        if (currentPage < totalPages) {
          currentPage++;
          renderPosts(filteredPosts);
        }
      };
    }
  }

  function renderPosts(posts) {
    renderSortDropdown();
    const results = document.getElementById('results');
    const feedback = document.getElementById('filter-feedback');
    filteredPosts = posts.slice();
    
    // Sort posts
    filteredPosts.sort((a, b) => {
      switch (sortOrder) {
        case 'oldest':
          return new Date(a.date) - new Date(b.date);
        case 'top':
          return b.score - a.score;
        case 'comments':
          return b.num_comments - a.num_comments;
        case 'newest':
        default:
          return new Date(b.date) - new Date(a.date);
      }
    });
    
    if (!filteredPosts.length) {
      results.innerHTML = '<p>No posts found. Try a different subreddit or search term.</p>';
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
      const postDate = new Date(post.date);
      const timeAgo = getTimeAgo(postDate);
      
      htmlList += `<li>
        <div class="post-header">
          <a href="${post.link}" target="_blank" class="post-title">${post.title}</a>
        </div>
        <div class="post-meta">
          <span class="subreddit">r/${post.subreddit}</span>
          ${post.author ? `<span class="author">by u/${post.author}</span>` : ''}
          <span class="date">${timeAgo}</span>
          <span class="score">${post.score} points</span>
          <span class="comments">${post.num_comments} comments</span>
        </div>
        ${post.url && post.url !== post.link ? `<div class="post-url"><a href="${post.url}" target="_blank" class="external-link">View original content ↗</a></div>` : ''}
      </li>`;
    });
    htmlList += '</ul>';
    
    results.innerHTML = htmlList;
    if (feedback) feedback.textContent = `Showing ${filteredPosts.length} post${filteredPosts.length !== 1 ? 's' : ''} from r/${subredditName || 'multiple subreddits'}. Page ${currentPage} of ${totalPages}`;
    renderPagination(totalPages);
  }

  function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffDays > 0) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    if (diffHours > 0) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffMinutes > 0) return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
    return 'Just now';
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
        const inTitle = post.title && post.title.toLowerCase().includes(keyword);
        const inAuthor = post.author && post.author.toLowerCase().includes(keyword);
        const inSubreddit = post.subreddit && post.subreddit.toLowerCase().includes(keyword);
        if (!inTitle && !inAuthor && !inSubreddit) ok = false;
      }
      if (author) {
        if (!post.author || !post.author.toLowerCase().includes(author)) ok = false;
      }
      if ((dateStart || dateEnd) && post.date) {
        const postDate = new Date(post.date);
        if (dateStart) {
          const startDate = new Date(dateStart + "T00:00:00");
          if (postDate < startDate) ok = false;
        }
        if (dateEnd) {
          const endDate = new Date(dateEnd + "T23:59:59");
          if (postDate > endDate) ok = false;
        }
      }
      return ok;
    });
    renderPosts(filtered);
  }

  function showLoadingMoreIndicator(show, message = 'Loading more posts…') {
    let indicator = document.getElementById('loading-more-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'loading-more-indicator';
      indicator.style.textAlign = 'center';
      indicator.style.color = '#888';
      indicator.style.margin = '1em 0';
      document.querySelector('.container').appendChild(indicator);
    }
    indicator.textContent = message;
    indicator.style.display = show ? '' : 'none';
  }

  async function fetchAndParse(url) {
    try {
      const response = await fetch(CORS_PROXY + url, { 
        credentials: 'omit',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RedditExplorer/1.0)'
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Fetch error:', error);
      throw error;
    }
  }

  async function fetchWithTimeFilter() {
    if (!subredditName) return;
    
    const timeFilter = document.getElementById('time-select')?.value || 'all';
    let sortType = 'new'; // Default to newest for historical data
    
    // For historical data, we want to use 'top' with time filters
    if (timeFilter !== 'all') {
      sortType = 'top';
    }
    
    const url = `https://www.reddit.com/r/${subredditName}/${sortType}.json?t=${timeFilter}&limit=100`;
    
    try {
      showLoadingMoreIndicator(true, 'Loading posts...');
      const data = await fetchAndParse(url);
      allPosts = extractPostsFromJson(data);
      afterToken = getNextToken(data);
      
      // Load multiple pages to get more historical data
      let pageCount = 1;
      const maxPages = 10; // Limit to prevent too many requests
      
      while (afterToken && pageCount < maxPages) {
        showLoadingMoreIndicator(true, `Loading page ${pageCount + 1}...`);
        const nextUrl = `https://www.reddit.com/r/${subredditName}/${sortType}.json?t=${timeFilter}&limit=100&after=${afterToken}`;
        const nextData = await fetchAndParse(nextUrl);
        const newPosts = extractPostsFromJson(nextData);
        
        if (newPosts.length === 0) break; // No more posts
        
        allPosts = allPosts.concat(newPosts);
        afterToken = getNextToken(nextData);
        pageCount++;
        
        // Small delay to be respectful to Reddit's servers
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      renderPosts(allPosts);
      filtersDiv.style.display = '';
      showLoadingMoreIndicator(false);
      
    } catch (error) {
      showLoadingMoreIndicator(false);
      throw error;
    }
  }

  async function fetchInitial(e) {
    e.preventDefault();
    results.innerHTML = '<p>Loading...</p>';
    allPosts = [];
    afterToken = null;
    
    let input_value = input.value.trim();
    
    // Enhanced input parsing
    if (/^https?:\/\//.test(input_value)) {
      // Extract subreddit from Reddit URL
      const match = input_value.match(/reddit\.com\/r\/([^\/\?]+)/);
      if (match) {
        subredditName = match[1];
      } else {
        results.innerHTML = '<p>Please enter a valid Reddit subreddit URL, or just the subreddit name (e.g., "javascript" or "r/javascript")</p>';
        return;
      }
    } else if (/^r\//i.test(input_value)) {
      subredditName = input_value.substring(2);
    } else if (/^u\//i.test(input_value) || /^user\//i.test(input_value)) {
      results.innerHTML = '<p>User profiles are not supported yet. Please enter a subreddit name.</p>';
      return;
    } else {
      subredditName = input_value;
    }
    
    // Clean subreddit name
    subredditName = subredditName.replace(/[^a-zA-Z0-9_]/g, '');
    
    if (!subredditName) {
      results.innerHTML = '<p>Please enter a valid subreddit name (e.g., "javascript", "r/programming", "AskReddit")</p>';
      return;
    }
    
    try {
      // Start with all-time new posts to get more historical data
      const url = `https://www.reddit.com/r/${subredditName}/new.json?limit=100`;
      
      showLoadingMoreIndicator(true, 'Loading posts...');
      const data = await fetchAndParse(url);
      allPosts = extractPostsFromJson(data);
      afterToken = getNextToken(data);
      
      if (allPosts.length === 0) {
        results.innerHTML = `<p>No posts found for r/${subredditName}. Make sure the subreddit name is correct.</p>`;
        filtersDiv.style.display = 'none';
        showLoadingMoreIndicator(false);
        return;
      }
      
      // Show initial posts
      renderPosts(allPosts);
      filtersDiv.style.display = '';
      
      // Load more pages in background for better historical coverage
      let pageCount = 1;
      const maxPages = 20; // Increased for more historical data
      
      while (afterToken && pageCount < maxPages) {
        showLoadingMoreIndicator(true, `Loading page ${pageCount + 1} (${allPosts.length} posts loaded)...`);
        const nextUrl = `https://www.reddit.com/r/${subredditName}/new.json?limit=100&after=${afterToken}`;
        const nextData = await fetchAndParse(nextUrl);
        const newPosts = extractPostsFromJson(nextData);
        
        if (newPosts.length === 0) break;
        
        allPosts = allPosts.concat(newPosts);
        afterToken = getNextToken(nextData);
        pageCount++;
        
        // Update display every few pages
        if (pageCount % 3 === 0) {
          renderPosts(allPosts);
        }
        
        // Small delay to be respectful
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      
      // Final render with all posts
      renderPosts(allPosts);
      showLoadingMoreIndicator(false);
      
    } catch (err) {
      console.error('Error fetching Reddit data:', err);
      results.innerHTML = `<p>Error loading r/${subredditName}: ${err.message}. This might be a private subreddit or the name might be incorrect.</p>`;
      filtersDiv.style.display = 'none';
      showLoadingMoreIndicator(false);
    }
  }

  // Update placeholder text to be more helpful
  input.placeholder = 'Enter subreddit name (e.g., "javascript", "r/programming", "AskReddit")';

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