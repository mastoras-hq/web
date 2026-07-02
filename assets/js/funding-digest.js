(function () {
  'use strict';

  var API = 'https://api.mastoras.uk';
  var CACHE_KEY = 'mastoras_digest_cache';

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function safeHttpUrl(value) {
    try {
      var parsed = new URL(String(value));
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
    } catch (_) {
      return '';
    }
  }

  function safeCount(value) {
    return Number.isInteger(value) && value >= 0 ? value : 0;
  }

  function safeDate(value) {
    if (!value) return null;
    var parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatDate(value, options) {
    var parsed = safeDate(value);
    return parsed ? parsed.toLocaleDateString('en-GB', options) : '';
  }

  function daysUntil(value) {
    var deadline = safeDate(value);
    if (!deadline) return null;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    deadline.setHours(0, 0, 0, 0);
    return Math.round((deadline - today) / 86400000);
  }

  function badge(text, className) {
    return element('span', 'badge ' + className, text);
  }

  function addCheckedLine(container, fund) {
    var label = formatDate(fund.last_verified, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    if (label) {
      container.appendChild(element('span', 'fund-card-checked', 'Source checked ' + label));
    }
  }

  function renderFundCard(fund, mode) {
    fund = fund && typeof fund === 'object' ? fund : {};
    var card = element('div', 'fund-card');
    card.appendChild(element('p', 'fund-card-name', fund.fund_name || 'Unnamed fund'));
    card.appendChild(element('p', 'fund-card-provider', fund.provider || ''));

    var meta = element('div', 'fund-card-meta');
    var status = typeof fund.status === 'string' && fund.status ? fund.status : 'Unknown';
    var normalizedStatus = status.toLowerCase();
    var statusClass = normalizedStatus === 'open'
      ? 'badge-open'
      : normalizedStatus === 'rolling'
        ? 'badge-rolling'
        : 'badge-region';
    meta.appendChild(badge(status, statusClass));
    if (fund.grant_size) meta.appendChild(badge(fund.grant_size, 'badge-region'));
    if (fund.region) meta.appendChild(badge(fund.region, 'badge-region'));
    if (mode === 'new') meta.appendChild(badge('New', 'badge-new'));
    card.appendChild(meta);

    if (mode === 'closing' && fund.deadline_date) {
      var days = daysUntil(fund.deadline_date);
      if (days !== null) {
        var timing = days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'in ' + days + ' days';
        var deadlineLabel = formatDate(fund.deadline_date, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
        card.appendChild(element('p', 'fund-card-deadline', 'Closes ' + timing + ' — ' + deadlineLabel));
      }
    }

    if (mode === 'watchlist' && fund.radar_note) {
      card.appendChild(element('p', 'fund-card-radar', fund.radar_note));
      if (fund.expected_window) {
        var expected = element('p', '', 'Expected: ' + fund.expected_window);
        expected.style.cssText = 'font-size:13px;color:var(--brass);font-weight:600';
        card.appendChild(expected);
      }
    }

    var sourceUrl = safeHttpUrl(fund.source_url);
    var checkedDate = formatDate(fund.last_verified, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    if (sourceUrl || checkedDate) {
      var foot = element('div', 'fund-card-foot');
      if (sourceUrl) {
        var link = element('a', 'fund-card-link', 'View fund →');
        link.href = sourceUrl;
        link.target = '_blank';
        link.rel = 'noopener';
        foot.appendChild(link);
      }
      addCheckedLine(foot, fund);
      card.appendChild(foot);
    }

    return card;
  }

  function replaceChildren(container, nodes, emptyMessage) {
    container.replaceChildren();
    if (!nodes.length) {
      var empty = element('p', '', emptyMessage);
      empty.style.cssText = 'color:#aaa;font-size:14px;padding:12px 0';
      container.appendChild(empty);
      return;
    }
    nodes.forEach(function (node) { container.appendChild(node); });
  }

  function addStat(container, value, label) {
    var stat = element('div', 'hero-stat');
    stat.appendChild(element('div', 'num', value));
    stat.appendChild(element('div', 'lbl', label));
    container.appendChild(stat);
  }

  function validDigest(data) {
    return data
      && typeof data === 'object'
      && data.stats
      && typeof data.stats === 'object';
  }

  function renderDigest(data, stale) {
    if (!validDigest(data)) throw new Error('Invalid digest response');

    var statsRow = document.getElementById('stats-row');
    var updatedLabel = stale && data._cachedAt
      ? formatDate(data._cachedAt, { day: 'numeric', month: 'short', year: 'numeric' })
      : formatDate(data.generated_at, { day: 'numeric', month: 'long', year: 'numeric' });
    if (!updatedLabel) {
      updatedLabel = new Date().toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }

    statsRow.replaceChildren();
    addStat(statsRow, safeCount(data.stats.total_active), 'Active schemes');
    addStat(statsRow, safeCount(data.stats.total_open), 'Open now');
    addStat(statsRow, safeCount(data.stats.deadlines_next_90_days), 'Deadlines in 90 days');
    addStat(statsRow, updatedLabel, 'Last updated');

    var groups = [
      {
        items: Array.isArray(data.recently_opened) ? data.recently_opened : [],
        countId: 'recent-count',
        gridId: 'recent-grid',
        mode: 'new',
        empty: 'No fund changes detected in the last 30 days.',
      },
      {
        items: Array.isArray(data.closing_soon) ? data.closing_soon : [],
        countId: 'closing-count',
        gridId: 'closing-grid',
        mode: 'closing',
        empty: 'No funds with deadlines in the next 60 days.',
      },
      {
        items: Array.isArray(data.watchlist) ? data.watchlist : [],
        countId: 'watchlist-count',
        gridId: 'watchlist-grid',
        mode: 'watchlist',
        empty: 'No funds on the radar at this time.',
      },
    ];

    groups.forEach(function (group) {
      document.getElementById(group.countId).textContent =
        group.items.length + ' fund' + (group.items.length === 1 ? '' : 's');
      replaceChildren(
        document.getElementById(group.gridId),
        group.items.map(function (fund) { return renderFundCard(fund, group.mode); }),
        group.empty,
      );
    });
  }

  function showFallback() {
    document.getElementById('stats-row').replaceChildren();
    var wrapper = element('div');
    wrapper.style.padding = '8px 0';
    var message = element('p', '', 'The live digest is refreshing right now.');
    message.style.cssText = 'color:#888;font-size:15px;margin-bottom:10px';
    wrapper.appendChild(message);

    var next = element('p');
    next.style.fontSize = '14px';
    var checkLink = element('a', '', 'Run the Funding Check →');
    checkLink.href = '/funding-check/';
    checkLink.style.cssText = 'color:var(--teal);font-weight:600';
    var callLink = element('a', '', 'book a free call');
    callLink.href = 'https://calendly.com/garynicholl1515/20min';
    callLink.target = '_blank';
    callLink.rel = 'noopener';
    callLink.style.cssText = 'color:var(--teal);font-weight:600';
    next.append(checkLink, ' for an instant profile match, or ', callLink, '.');
    wrapper.appendChild(next);

    document.getElementById('recent-grid').replaceChildren(wrapper);
    document.getElementById('closing-grid').replaceChildren();
    document.getElementById('watchlist-grid').replaceChildren();
  }

  fetch(API + '/digest')
    .then(function (response) {
      if (!response.ok) throw new Error('Digest request failed');
      return response.json();
    })
    .then(function (data) {
      renderDigest(data, false);
      try {
        var cached = Object.assign({}, data, { _cachedAt: Date.now() });
        localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
      } catch (_) {}
    })
    .catch(function () {
      var cached = null;
      try {
        cached = JSON.parse(localStorage.getItem(CACHE_KEY));
      } catch (_) {}
      if (validDigest(cached)) {
        try {
          renderDigest(cached, true);
          return;
        } catch (_) {}
      }
      showFallback();
    });
})();
