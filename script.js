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
  let currentPage = 1;
  const POSTS_PER_PAGE = 25;
  let filteredPosts = [];
  let sortOrder = 'newest'; // 'newest' or 'oldest'
  let isLoadingMore = false;

  function extractPosts(doc) {
    let posts = [];
    // Only select visible, real posts (not promoted, not stickied if not visible)
    let containers = Array.from(doc.querySelectorAll('div.thing.link'));
    posts = containers.filter(post => {
      // Exclude promoted links and hidden posts
      if (post.classList.contains('promotedlink')) return false;
      if (post.style.display === 'none') return false;
      // Optionally, skip stickied posts if not visible
      return true;
    }).map(post => {
      let title = post.querySelector('a.title')?.textContent || 'No title';
      
      // Improved link extraction - always get the discussion URL
      let link = '';
      const titleLink = post.querySelector('a.title');
      if (titleLink) {
        link = titleLink.href || '';
        // Ensure we're linking to the discussion page, not direct media
        if (link.includes('reddit.com') && !link.includes('/comments/')) {
          // If it's a direct link to media, convert to discussion URL
          if (link.includes('i.redd.it') || link.includes('imgur.com') || link.includes('youtube.com') || link.includes('v.redd.it')) {
            // Try to find the discussion link in the post
            const discussionLink = post.querySelector('a[href*="/comments/"]');
            if (discussionLink) {
              link = discussionLink.href;
            } else {
              // If no discussion link found, try to construct it from the post ID
              const postId = post.getAttribute('data-fullname') || post.getAttribute('data-thing-id');
              if (postId && postId.startsWith('t3_')) {
                const actualId = postId.replace('t3_', '');
                link = `https://old.reddit.com/comments/${actualId}/`;
              }
            }
          }
        }
        
        // Ensure we're using old.reddit.com for consistency
        if (link.startsWith('/')) {
          link = 'https://old.reddit.com' + link;
        } else if (link.includes('www.reddit.com')) {
          link = link.replace('www.reddit.com', 'old.reddit.com');
        }
      }
      
      // Fallback: if we still don't have a proper discussion link, try other methods
      if (!link || link === '#' || link.includes('i.redd.it') || link.includes('imgur.com')) {
        // Look for any link that contains /comments/
        const allLinks = post.querySelectorAll('a[href*="/comments/"]');
        if (allLinks.length > 0) {
          link = allLinks[0].href;
          if (link.startsWith('/')) {
            link = 'https://old.reddit.com' + link;
          }
        } else {
          // Last resort: try to construct from post ID
          const postId = post.getAttribute('data-fullname') || post.getAttribute('data-thing-id');
          if (postId && postId.startsWith('t3_')) {
            const actualId = postId.replace('t3_', '');
            link = `https://old.reddit.com/comments/${actualId}/`;
          }
        }
      }
      
      let author = post.getAttribute('data-author') || '';
      
      // Improved date extraction
      let date = '';
      const timeElement = post.querySelector('time');
      if (timeElement) {
        // Try to get the datetime attribute first (most reliable)
        date = timeElement.getAttribute('datetime') || '';
        
        // If no datetime attribute, try to parse the text content
        if (!date) {
          const timeText = timeElement.textContent || '';
          // Try to extract date from common Reddit time formats
          const dateMatch = timeText.match(/(\d{4}-\d{2}-\d{2})/);
          if (dateMatch) {
            date = dateMatch[1] + 'T00:00:00Z';
          }
        }
      }
      
      return { title, link, author, date };
    });
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
    // Add event listeners
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
    const results = document.getElementById('results');
    const feedback = document.getElementById('filter-feedback');
    filteredPosts = posts.slice();
    
    // Sort by date - newest first
    filteredPosts.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1; // posts without dates go to the end
      if (!b.date) return -1;
      
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      
      // Check if dates are valid
      if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
      if (isNaN(dateA.getTime())) return 1;
      if (isNaN(dateB.getTime())) return -1;
      
      // Sort newest first (descending order)
      return dateB - dateA;
    });
    
    // Apply sort order preference
    if (sortOrder === 'oldest') {
      filteredPosts.reverse();
    }
    
    if (!filteredPosts.length) {
      results.innerHTML = '<p>No posts found or Reddit layout not supported.</p>';
      if (feedback) {
        const keyword = document.getElementById('filter-keyword').value.trim();
        const author = document.getElementById('filter-author').value.trim();
        const dateStart = document.getElementById('filter-date-start').value;
        const dateEnd = document.getElementById('filter-date-end').value;
        
        let filterInfo = [];
        if (keyword) filterInfo.push(`keyword: "${keyword}"`);
        if (author) filterInfo.push(`author: "${author}"`);
        if (dateStart) filterInfo.push(`from: ${dateStart}`);
        if (dateEnd) filterInfo.push(`to: ${dateEnd}`);
        
        if (filterInfo.length > 0) {
          feedback.textContent = `No posts match your filters: ${filterInfo.join(', ')}`;
        } else {
          feedback.textContent = 'No posts found.';
        }
      }
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
      if (post.author) htmlList += ` <span style="color:#888;font-size:0.95em;">by ${post.author}</span>`;
      if (post.date) htmlList += ` <span style="color:#aaa;font-size:0.9em;">[${post.date.split('T')[0]}]</span>`;
      htmlList += '</li>';
    });
    htmlList += '</ul>';
    results.innerHTML = htmlList;
    if (feedback) feedback.textContent = `Showing ${filteredPosts.length} post${filteredPosts.length !== 1 ? 's' : ''}. Page ${currentPage} of ${totalPages}`;
    renderPagination(totalPages);
  }

  function applyFilters() {
    const keyword = document.getElementById('filter-keyword').value.trim().toLowerCase();
    const author = document.getElementById('filter-author').value.trim().toLowerCase();
    const dateStart = document.getElementById('filter-date-start').value;
    const dateEnd = document.getElementById('filter-date-end').value;
    currentPage = 1;
    
    console.log('Applying filters:', { keyword, author, dateStart, dateEnd });
    console.log('Total posts before filtering:', allPosts.length);
    
    let filtered = allPosts.filter(post => {
      let ok = true;
      
      // Keyword filtering - search in title only
      if (keyword) {
        if (!post.title || !post.title.toLowerCase().includes(keyword)) {
          ok = false;
        }
      }
      
      // Author filtering - exact match (case insensitive)
      if (author) {
        if (!post.author || post.author.toLowerCase() !== author.toLowerCase()) {
          ok = false;
        }
      }
      
      // Date filtering
      if ((dateStart || dateEnd) && post.date) {
        try {
          // Parse the post date (Reddit uses ISO format like "2024-01-15T10:30:00+00:00")
          const postDate = new Date(post.date);
          
          // Check if date is valid
          if (isNaN(postDate.getTime())) {
            console.warn('Invalid post date:', post.date);
            ok = false;
          } else {
            // Normalize to start of day for comparison
            const postDateNormalized = new Date(postDate.getFullYear(), postDate.getMonth(), postDate.getDate());
            
            if (dateStart) {
              const startDate = new Date(dateStart);
              console.log('Comparing post date:', postDateNormalized.toISOString(), 'with start date:', startDate.toISOString());
              if (postDateNormalized < startDate) {
                ok = false;
              }
            }
            
            if (dateEnd) {
              const endDate = new Date(dateEnd);
              console.log('Comparing post date:', postDateNormalized.toISOString(), 'with end date:', endDate.toISOString());
              if (postDateNormalized > endDate) {
                ok = false;
              }
            }
          }
        } catch (error) {
          console.error('Error parsing date:', error);
          ok = false;
        }
      } else if ((dateStart || dateEnd) && !post.date) {
        // If we have date filters but the post has no date, exclude it
        console.log('Post has no date but date filters are applied:', post.title);
        ok = false;
      }
      
      return ok;
    });
    
    console.log('Posts after filtering:', filtered.length);
    console.log('Sample filtered posts:', filtered.slice(0, 3).map(p => ({ title: p.title, date: p.date })));
    
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
      document.querySelector('.container').appendChild(indicator);
    }
    indicator.style.display = show ? '' : 'none';
  }

  async function fetchAndParse(url) {
    const response = await fetch('https://corsproxy.io/?' + url, { credentials: 'omit' });
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
      // Load posts from different time periods to get more historical data
      const timePeriods = [
        '', // hot (default)
        'top/?t=all', // top of all time
        'top/?t=year', // top of year
        'top/?t=month', // top of month
        'new/', // newest posts
        'controversial/?t=all', // controversial of all time
      ];
      
      for (let i = 0; i < timePeriods.length; i++) {
        const period = timePeriods[i];
        const fetchUrl = baseFetchUrl + (period ? period : '');
        
        console.log(`Loading posts from: ${fetchUrl}`);
        results.innerHTML = `<p>Loading ${period || 'hot'} posts... (${allPosts.length} total posts so far)</p>`;
        
        try {
          const doc = await fetchAndParse(fetchUrl);
          const newPosts = extractPosts(doc);
          
          // Remove duplicates based on title and author
          const existingTitles = new Set(allPosts.map(p => p.title + '|' + p.author));
          const uniqueNewPosts = newPosts.filter(post => {
            const key = post.title + '|' + post.author;
            if (existingTitles.has(key)) {
              return false;
            }
            existingTitles.add(key);
            return true;
          });
          
          allPosts = allPosts.concat(uniqueNewPosts);
          console.log(`Added ${uniqueNewPosts.length} unique posts from ${period || 'hot'}`);
          
          // Add delay between requests
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          console.error(`Error loading ${period} posts:`, error);
        }
      }
      
      console.log('Total posts loaded:', allPosts.length);
      console.log('Sample posts:', allPosts.slice(0, 5).map(p => ({ title: p.title, date: p.date })));
      
      // Show all posts with proper sorting
      renderPosts(allPosts);
      filtersDiv.style.display = '';
      document.getElementById('pagination').style.display = '';
      renderSortDropdown();
      
      // Load additional pages from the main feed for more recent posts
      isLoadingMore = true;
      showLoadingMoreIndicator(true);
      let nextUrl = extractNextPageUrl(await fetchAndParse(baseFetchUrl));
      let pageCount = 1;
      const MAX_PAGES = 20; // Load additional pages
      
      while (nextUrl && pageCount < MAX_PAGES) {
        try {
          results.innerHTML = `<p>Loading additional page ${pageCount + 1}... (${allPosts.length} posts so far)</p>`;
          const doc = await fetchAndParse(nextUrl);
          const newPosts = extractPosts(doc);
          
          if (newPosts.length === 0) {
            console.log('No more posts found on page', pageCount + 1);
            break;
          }
          
          // Remove duplicates
          const existingTitles = new Set(allPosts.map(p => p.title + '|' + p.author));
          const uniqueNewPosts = newPosts.filter(post => {
            const key = post.title + '|' + post.author;
            if (existingTitles.has(key)) {
              return false;
            }
            existingTitles.add(key);
            return true;
          });
          
          allPosts = allPosts.concat(uniqueNewPosts);
          renderPosts(allPosts);
          nextUrl = extractNextPageUrl(doc);
          pageCount++;
          
          // Add a small delay to be respectful to Reddit's servers
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error('Error loading page', pageCount + 1, ':', error);
          break;
        }
      }
      
      isLoadingMore = false;
      showLoadingMoreIndicator(false);
      
      console.log(`Finished loading ${pageCount} additional pages with ${allPosts.length} total posts`);
      
      // Show final results
      renderPosts(allPosts);
      
    } catch (err) {
      results.innerHTML = `<p>Error: ${err.message}</p>`;
      filtersDiv.style.display = 'none';
      document.getElementById('pagination').style.display = 'none';
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