(function () {
  "use strict";

  const dom = {
    year: document.getElementById("year"),
    themeToggle: document.getElementById("themeToggle"),
    clearFilters: document.getElementById("clearFilters"),
    searchInput: document.getElementById("searchInput"),
    sortSelect: document.getElementById("sortSelect"),
    platformFilters: document.getElementById("platformFilters"),
    feed: document.getElementById("feed"),
    loadMore: document.getElementById("loadMore"),
    resultsCount: document.getElementById("resultsCount"),
    dedupeToggle: document.getElementById("dedupeToggle"),
    mergeToggle: document.getElementById("mergeToggle"),
  };

  if (dom.year) dom.year.textContent = new Date().getFullYear();

  const platforms = [
    { id: "twitter", name: "Twitter/X", colorClass: "twitter", emoji: "🐦" },
    { id: "instagram", name: "Instagram", colorClass: "instagram", emoji: "📸" },
    { id: "facebook", name: "Facebook", colorClass: "facebook", emoji: "📘" },
    { id: "linkedin", name: "LinkedIn", colorClass: "linkedin", emoji: "💼" },
    { id: "youtube", name: "YouTube", colorClass: "youtube", emoji: "▶️" },
    { id: "reddit", name: "Reddit", colorClass: "reddit", emoji: "👽" },
  ];

  const state = {
    selectedPlatformIds: new Set(),
    keyword: "",
    sortBy: "newest",
    page: 1,
    pageSize: 9,
    dedupe: false,
    mergeView: false,
  };

  const mockPosts = generateMockPosts();

  function init() {
    applySavedTheme();
    renderPlatformChips();
    bindEvents();
    applyFiltersAndRender();
  }

  function bindEvents() {
    dom.themeToggle.addEventListener("click", toggleTheme);

    dom.clearFilters.addEventListener("click", () => {
      state.selectedPlatformIds.clear();
      state.keyword = "";
      state.sortBy = "newest";
      state.page = 1;
      state.dedupe = false;
      state.mergeView = false;
      dom.searchInput.value = "";
      dom.sortSelect.value = state.sortBy;
      if (dom.dedupeToggle) dom.dedupeToggle.checked = false;
      if (dom.mergeToggle) { dom.mergeToggle.checked = false; dom.mergeToggle.disabled = true; }
      updatePlatformChipPressedStates();
      applyFiltersAndRender();
    });

    dom.searchInput.addEventListener("input", handleKeywordInput);
    dom.sortSelect.addEventListener("change", handleSortChange);

    dom.loadMore.addEventListener("click", () => {
      state.page += 1;
      renderFeed(applyFilters());
    });

    if (dom.dedupeToggle) {
      dom.dedupeToggle.addEventListener("change", (e) => {
        state.dedupe = !!e.target.checked;
        // Merge view only enabled if dedupe is on
        if (!state.dedupe) {
          state.mergeView = false;
          if (dom.mergeToggle) {
            dom.mergeToggle.checked = false;
            dom.mergeToggle.disabled = true;
          }
        } else {
          if (dom.mergeToggle) dom.mergeToggle.disabled = false;
        }
        state.page = 1;
        applyFiltersAndRender();
      });
    }

    if (dom.mergeToggle) {
      dom.mergeToggle.addEventListener("change", (e) => {
        state.mergeView = !!e.target.checked;
        // if merge checked but dedupe off, turn dedupe on
        if (state.mergeView && !state.dedupe) {
          state.dedupe = true;
          if (dom.dedupeToggle) dom.dedupeToggle.checked = true;
        }
        state.page = 1;
        applyFiltersAndRender();
      });
    }
  }

  function handleKeywordInput(event) {
    const nextKeyword = String(event.target.value || "").trim();
    state.keyword = nextKeyword;
    state.page = 1;
    applyFiltersAndRender();
  }

  function handleSortChange(event) {
    state.sortBy = event.target.value;
    state.page = 1;
    applyFiltersAndRender();
  }

  function renderPlatformChips() {
    const fragment = document.createDocumentFragment();

    platforms.forEach((platform) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip";
      button.setAttribute("role", "switch");
      button.setAttribute("aria-pressed", "false");
      button.setAttribute("data-platform-id", platform.id);
      button.title = platform.name;

      button.innerHTML = `
        <span class="badge dot-${platform.colorClass} badge"></span>
        <span>${platform.emoji} ${platform.name}</span>
      `;

      button.addEventListener("click", () => {
        if (state.selectedPlatformIds.has(platform.id)) {
          state.selectedPlatformIds.delete(platform.id);
          button.setAttribute("aria-pressed", "false");
        } else {
          state.selectedPlatformIds.add(platform.id);
          button.setAttribute("aria-pressed", "true");
        }
        state.page = 1;
        applyFiltersAndRender();
      });

      fragment.appendChild(button);
    });

    dom.platformFilters.innerHTML = "";
    dom.platformFilters.appendChild(fragment);
  }

  function updatePlatformChipPressedStates() {
    const chipButtons = dom.platformFilters.querySelectorAll(".chip");
    chipButtons.forEach((button) => {
      const platformId = button.getAttribute("data-platform-id");
      const isActive = state.selectedPlatformIds.has(platformId);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function applyFiltersAndRender() {
    const filtered = applyFilters();
    renderFeed(filtered);
  }

  function applyFilters() {
    const query = state.keyword.toLowerCase();

    let results = mockPosts.filter((post) => {
      const matchesPlatform =
        state.selectedPlatformIds.size === 0 ||
        state.selectedPlatformIds.has(post.platformId);

      const inText = post.text.toLowerCase().includes(query);
      const inUser = post.user.name.toLowerCase().includes(query) || post.user.handle.toLowerCase().includes(query);

      return matchesPlatform && (query === "" || inText || inUser);
    });

    if (state.dedupe) {
      results = dedupePosts(results);
    }

    if (!state.mergeView) {
      if (state.sortBy === "newest") {
        results.sort((a, b) => b.createdAt - a.createdAt);
      } else if (state.sortBy === "oldest") {
        results.sort((a, b) => a.createdAt - b.createdAt);
      } else if (state.sortBy === "engagement") {
        results.sort((a, b) => getEngagement(b) - getEngagement(a));
      }
    } else {
      // sort merged groups by most recent source or by aggregated engagement
      if (state.sortBy === "newest") {
        results.sort((a, b) => b.latestCreatedAt - a.latestCreatedAt);
      } else if (state.sortBy === "oldest") {
        results.sort((a, b) => a.latestCreatedAt - b.latestCreatedAt);
      } else if (state.sortBy === "engagement") {
        results.sort((a, b) => b.totalEngagement - a.totalEngagement);
      }
    }

    const total = results.length;
    const end = Math.min(state.page * state.pageSize, total);
    const pageResults = results.slice(0, end);

    dom.resultsCount.textContent = `${total} result${total === 1 ? "" : "s"}`;
    dom.loadMore.style.display = end < total ? "inline-flex" : "none";

    return pageResults;
  }

  function dedupePosts(posts) {
    // Group posts by normalized content signature: stripped URLs, mentions, hashtags, whitespace
    const groups = new Map();

    for (const post of posts) {
      const key = makeSignature(post);
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, { key, sources: [post] });
      } else {
        existing.sources.push(post);
      }
    }

    if (!state.mergeView) {
      // pick best representative per group (highest engagement, else newest)
      const representatives = [];
      for (const group of groups.values()) {
        const best = group.sources
          .slice()
          .sort((a, b) => {
            const byEng = getEngagement(b) - getEngagement(a);
            if (byEng !== 0) return byEng;
            return b.createdAt - a.createdAt;
          })[0];
        representatives.push(best);
      }
      return representatives;
    }

    // Merge view objects
    const merged = [];
    for (const group of groups.values()) {
      const platformsInGroup = new Set(group.sources.map((s) => s.platformId));
      const totalEngagement = group.sources.reduce((sum, s) => sum + getEngagement(s), 0);
      const latestCreatedAt = Math.max(...group.sources.map((s) => s.createdAt));
      const primary = group.sources
        .slice()
        .sort((a, b) => {
          const byEng = getEngagement(b) - getEngagement(a);
          if (byEng !== 0) return byEng;
          return b.createdAt - a.createdAt;
        })[0];

      merged.push({
        type: "merged",
        key: group.key,
        primary,
        sources: group.sources,
        platforms: Array.from(platformsInGroup),
        totalEngagement,
        latestCreatedAt,
      });
    }

    return merged;
  }

  function makeSignature(post) {
    const lower = post.text.toLowerCase();
    const withoutUrls = lower.replace(/https?:\/\/[^\s]+/g, " ");
    const withoutTags = withoutUrls.replace(/[#@][\w_]+/g, " ");
    const normalizedWhitespace = withoutTags.replace(/\s+/g, " ").trim();
    return normalizedWhitespace;
  }

  function renderFeed(items) {
    const fragment = document.createDocumentFragment();

    if (state.page === 1) {
      dom.feed.setAttribute("aria-busy", "true");
      dom.feed.innerHTML = "";
    }

    items.forEach((item) => {
      if (state.mergeView && item.type === "merged") {
        fragment.appendChild(renderMergedCard(item));
      } else {
        fragment.appendChild(renderSingleCard(item));
      }
    });

    dom.feed.appendChild(fragment);
    dom.feed.setAttribute("aria-busy", "false");
  }

  function renderSingleCard(post) {
    const card = document.createElement("article");
    card.className = "card";
    card.setAttribute("data-platform-id", post.platformId);

    card.innerHTML = `
      <div class="card-header">
        <div class="user">
          <div class="avatar" aria-hidden="true">${initials(post.user.name)}</div>
          <div>
            <div class="name">${escapeHtml(post.user.name)}</div>
            <div class="handle">${escapeHtml(post.user.handle)}</div>
          </div>
        </div>
        <div class="platform-badge badge-${post.platformId}">
          <span class="dot dot-${post.platformId}"></span>
          <span>${platformLabel(post.platformId)}</span>
        </div>
      </div>
      <div class="card-main">
        <div class="time">${timeAgo(post.createdAt)}</div>
        <div class="content">${linkify(escapeHtml(post.text))}</div>
        ${post.mediaUrl ? `<div class="media"><img alt="Post media" src="${post.mediaUrl}" loading="lazy"/></div>` : ""}
      </div>
      <div class="card-footer">
        <div class="metrics">
          <span class="metric">💬 ${post.metrics.comments}</span>
          <span class="metric">❤️ ${post.metrics.likes}</span>
          <span class="metric">🔁 ${post.metrics.shares}</span>
        </div>
        <a class="btn small" href="#" aria-disabled="true" title="Open on platform">Open</a>
      </div>
    `;

    return card;
  }

  function renderMergedCard(group) {
    const { primary, sources, platforms, totalEngagement } = group;

    const card = document.createElement("article");
    card.className = "card merged";

    const compactPlatforms = platforms
      .map((pid) => `<span class="platform-badge badge-${pid}"><span class="dot dot-${pid}"></span><span>${platformLabel(pid)}</span></span>`)
      .join(" ");

    const sourcesLabel = `${sources.length} source${sources.length === 1 ? "" : "s"}`;

    card.innerHTML = `
      <div class="card-header">
        <div class="user">
          <div class="avatar" aria-hidden="true">${initials(primary.user.name)}</div>
          <div>
            <div class="name">${escapeHtml(primary.user.name)}</div>
            <div class="handle">${escapeHtml(primary.user.handle)}</div>
          </div>
        </div>
        <div class="compact-platforms">${compactPlatforms}</div>
      </div>
      <div class="card-main">
        <div class="time">Latest ${timeAgo(group.latestCreatedAt)} • <span class="pill">${sourcesLabel}</span> • <span class="pill">▲ ${totalEngagement}</span></div>
        <div class="content">${linkify(escapeHtml(primary.text))}</div>
        ${primary.mediaUrl ? `<div class="media"><img alt="Post media" src="${primary.mediaUrl}" loading="lazy"/></div>` : ""}

        <div class="merged-sources">
          ${sources
            .map((s, idx) => {
              const isPrimary = s === primary;
              const cid = `${group.key}_${idx}`.replace(/[^a-z0-9_\-]/gi, "");
              return `
                <div class="source-item">
                  <div class="source-head">
                    <div>
                      <span class="platform-badge badge-${s.platformId}"><span class="dot dot-${s.platformId}"></span><span>${platformLabel(s.platformId)}</span></span>
                      <span class="time"> • ${timeAgo(s.createdAt)}</span>
                      ${isPrimary ? '<span class="pill">primary</span>' : ''}
                    </div>
                    <button class="source-toggle btn small" type="button" aria-expanded="false" aria-controls="${cid}">Details</button>
                  </div>
                  <div id="${cid}" class="source-collapsible" hidden>
                    <div class="content">${linkify(escapeHtml(s.text))}</div>
                    ${s.mediaUrl ? `<div class="media"><img alt="Post media" src="${s.mediaUrl}" loading="lazy"/></div>` : ""}
                    <div class="metrics" style="margin-top:6px">
                      <span class="metric">💬 ${s.metrics.comments}</span>
                      <span class="metric">❤️ ${s.metrics.likes}</span>
                      <span class="metric">🔁 ${s.metrics.shares}</span>
                    </div>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
      <div class="card-footer">
        <div class="metrics">
          <span class="metric">💬 ${primary.metrics.comments}</span>
          <span class="metric">❤️ ${primary.metrics.likes}</span>
          <span class="metric">🔁 ${primary.metrics.shares}</span>
        </div>
        <a class="btn small" href="#" aria-disabled="true" title="Open on platform">Open</a>
      </div>
    `;

    // wire collapsibles
    card.querySelectorAll(".source-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const controls = btn.getAttribute("aria-controls");
        const panel = card.querySelector(`#${CSS.escape(controls)}`);
        const expanded = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", expanded ? "false" : "true");
        if (panel) panel.hidden = expanded;
      });
    });

    return card;
  }

  function platformLabel(id) {
    const found = platforms.find((p) => p.id === id);
    return found ? found.name : id;
  }

  function getEngagement(post) {
    return post.metrics.comments + post.metrics.likes + post.metrics.shares;
  }

  function timeAgo(timestampMs) {
    const seconds = Math.floor((Date.now() - timestampMs) / 1000);
    const intervals = [
      [31536000, "y"],
      [2592000, "mo"],
      [604800, "w"],
      [86400, "d"],
      [3600, "h"],
      [60, "m"],
    ];
    for (const [sec, label] of intervals) {
      const count = Math.floor(seconds / sec);
      if (count >= 1) return `${count}${label}`;
    }
    return `${seconds}s`;
  }

  function initials(name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }

  function escapeHtml(str) {
    return str
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function linkify(text) {
    const urlRegex = /https?:\/\/[\w.-]+(?:\/[\w\-._~:/?#[\]@!$&'()*+,;=.]+)?/gi;
    const hashRegex = /(^|\s)(#[a-zA-Z0-9_]+)/g;
    const atRegex = /(^|\s)(@[a-zA-Z0-9_]+)/g;
    return text
      .replace(urlRegex, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`)
      .replace(hashRegex, (m, pre, tag) => `${pre}<span title="Hashtag" class="muted">${tag}</span>`)
      .replace(atRegex, (m, pre, at) => `${pre}<span title="Mention" class="muted">${at}</span>`);
  }

  function toggleTheme() {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    const next = isLight ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("socialsphere:theme", next); } catch {}
  }

  function applySavedTheme() {
    try {
      const saved = localStorage.getItem("socialsphere:theme");
      if (saved === "light") document.documentElement.setAttribute("data-theme", "light");
    } catch {}
  }

  function generateMockPosts() {
    const now = Date.now();
    const sampleTexts = [
      "Loving the new SocialSphere UI! #design #frontend",
      "Just published a video on building a social feed aggregator ▶️ https://example.com",
      "What are your go-to tools for web performance? #webperf",
      "We are hiring frontend engineers! Apply now @careers",
      "Dark mode is life. Change my mind.",
      "Deploying a new feature today. Wish me luck!",
      "Have you tried the new CSS color-mix()? Game changer.",
      "Productivity tip: batch your notifications.",
      "Reading about accessibility. ARIA roles are super helpful.",
      "Just crossed 10k subs on my channel! Thank you!",
      "Launching our community page soon. Stay tuned.",
      "Refactoring state management for clarity and scale.",
    ];

    const users = [
      { name: "Alex Johnson", handle: "@alex" },
      { name: "Priya Sharma", handle: "@priya" },
      { name: "Mei Lin", handle: "@meilin" },
      { name: "Carlos Ruiz", handle: "@carlos" },
      { name: "Sarah Lee", handle: "@sarah" },
      { name: "Omar Haddad", handle: "@omar" },
    ];

    const media = [
      null,
      "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=1200&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1555099962-4199c345e5dd?q=80&w=1200&auto=format&fit=crop",
      null,
      null,
      "https://images.unsplash.com/photo-1556157382-97eda2d62296?q=80&w=1200&auto=format&fit=crop",
    ];

    const ids = platforms.map((p) => p.id);

    const posts = Array.from({ length: 36 }).map((_, i) => {
      const platformId = ids[i % ids.length];
      const user = users[i % users.length];
      const text = sampleTexts[i % sampleTexts.length];
      const mediaUrl = media[i % media.length];
      const createdAt = now - (i * 3600 + (i % 5) * 237) * 1000; // spread out
      const metrics = {
        comments: (i * 7) % 120,
        likes: (i * 13) % 500,
        shares: (i * 5) % 200,
      };
      return { id: `post_${i}`, platformId, user, text, mediaUrl, createdAt, metrics };
    });

    return posts;
  }

  // init after DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(); 