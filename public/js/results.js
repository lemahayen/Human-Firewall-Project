
/*
 * ============================================================
 * HUMAN FIREWALL
 * Results and Performance Controller
 *
 * Displays:
 * - Pre-training assessment
 * - Post-training assessment
 * - Final assessment
 * - Knowledge improvement
 * - Topic performance
 * - Cybersecurity rank
 * - Leaderboard
 *
 * All assessment scores originate from the backend.
 * ============================================================
 */

'use strict';

const Results = (() => {

  const state = {
    data: null,
    leaderboard: [],
    loading: false,
    loaded: false
  };

  const $ = id => document.getElementById(id);

  // ==========================================================
  // SAFE DOM HELPERS
  // ==========================================================

  function createElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
      element.className = className;
    }

    if (text !== undefined && text !== null) {
      element.textContent = String(text);
    }

    return element;
  }

  function getContainer() {
    let container = $('results-container');

    if (container) {
      return container;
    }

    const screen = $('screen-results');

    if (!screen) {
      throw new Error(
        'The results screen was not found in index.html.'
      );
    }

    container = document.createElement('div');
    container.id = 'results-container';

    screen.appendChild(container);

    return container;
  }

  function clearContainer() {
    getContainer().replaceChildren();
  }

  function showMessage(message, type = 'info') {
    const container = getContainer();

    let element = $('results-message');

    if (!element) {
      element = createElement('div', 'feedback');
      element.id = 'results-message';

      container.prepend(element);
    }

    element.textContent = message;
    element.className = `feedback ${type}`;
    element.hidden = false;
  }

  // ==========================================================
  // DATA HELPERS
  // ==========================================================

  function getAssessmentScore(result) {
    if (!result) {
      return null;
    }

    const score = Number(result.score);

    return Number.isFinite(score)
      ? score
      : null;
  }

  function getAssessmentTotal(result) {
    if (!result) {
      return null;
    }

    const total = Number(result.total);

    return Number.isFinite(total)
      ? total
      : null;
  }

  function getAssessmentPercentage(result) {
    if (!result) {
      return null;
    }

    if (result.percentage !== undefined) {
      const percentage = Number(result.percentage);

      return Number.isFinite(percentage)
        ? percentage
        : null;
    }

    const score = getAssessmentScore(result);
    const total = getAssessmentTotal(result);

    if (score === null || total === null || total <= 0) {
      return null;
    }

    return Math.round((score / total) * 100);
  }

  function getRank(finalResult) {
    if (!finalResult) {
      return 'Unranked';
    }

    return finalResult.rankTitle ||
      finalResult.rank_title ||
      'Unranked';
  }

  function getTopicBreakdown(result) {
    if (!result) {
      return [];
    }

    const breakdown =
      result.topicBreakdown ||
      result.topic_breakdown ||
      [];

    return Array.isArray(breakdown)
      ? breakdown
      : [];
  }

  function getTopicName(topic) {
    return topic.topic ||
      topic.name ||
      topic.category ||
      'General';
  }

  function getTopicScore(topic) {
    const score = Number(topic.score);

    return Number.isFinite(score)
      ? score
      : 0;
  }

  function getTopicTotal(topic) {
    const total = Number(topic.total);

    return Number.isFinite(total)
      ? total
      : 0;
  }

  function getTopicPercentage(topic) {
    if (topic.percentage !== undefined) {
      const percentage = Number(topic.percentage);

      return Number.isFinite(percentage)
        ? percentage
        : 0;
    }

    const score = getTopicScore(topic);
    const total = getTopicTotal(topic);

    return total > 0
      ? Math.round((score / total) * 100)
      : 0;
  }

  function calculateImprovement(pre, post) {
    const prePercentage = getAssessmentPercentage(pre);
    const postPercentage = getAssessmentPercentage(post);

    if (
      prePercentage === null ||
      postPercentage === null
    ) {
      return null;
    }

    return postPercentage - prePercentage;
  }

  // ==========================================================
  // DISPLAY HELPERS
  // ==========================================================

  function createStatBox(title, value, description) {
    const box = createElement('div', 'stat-box');

    box.appendChild(
      createElement('h3', '', value)
    );

    box.appendChild(
      createElement('p', '', title)
    );

    if (description) {
      box.appendChild(
        createElement('small', '', description)
      );
    }

    return box;
  }

  function createSection(title, description) {
    const section = createElement('section', 'results-section');

    section.appendChild(
      createElement('h3', '', title)
    );

    if (description) {
      section.appendChild(
        createElement('p', '', description)
      );
    }

    return section;
  }

  function createProgressBar(percentage) {
    const safePercentage = Math.max(
      0,
      Math.min(100, percentage)
    );

    const wrapper = createElement(
      'div',
      'results-progress'
    );

    const track = createElement(
      'div',
      'results-progress-track'
    );

    const fill = createElement(
      'div',
      'results-progress-fill'
    );

    fill.style.width = `${safePercentage}%`;

    track.appendChild(fill);
    wrapper.appendChild(track);

    return wrapper;
  }

  // ==========================================================
  // ASSESSMENT COMPARISON
  // ==========================================================

  function renderAssessmentComparison(pre, post, finalResult) {

    const section = createSection(
      'Assessment Performance',
      'Compare your knowledge before and after the training programme.'
    );

    const grid = createElement('div', 'stats-grid');

    const preScore = getAssessmentPercentage(pre);
    const postScore = getAssessmentPercentage(post);
    const finalScore = getAssessmentPercentage(finalResult);

    grid.appendChild(
      createStatBox(
        'Pre-training assessment',
        preScore === null ? 'N/A' : `${preScore}%`,
        'Baseline knowledge'
      )
    );

    grid.appendChild(
      createStatBox(
        'Post-training assessment',
        postScore === null ? 'N/A' : `${postScore}%`,
        'Knowledge after training'
      )
    );

    grid.appendChild(
      createStatBox(
        'Final assessment',
        finalScore === null ? 'N/A' : `${finalScore}%`,
        'Scenario-based evaluation'
      )
    );

    section.appendChild(grid);

    const improvement = calculateImprovement(pre, post);

    if (improvement !== null) {

      let message;

      if (improvement > 0) {
        message = `Your assessment performance improved by ${improvement} percentage points.`;
      } else if (improvement < 0) {
        message = `Your assessment performance decreased by ${Math.abs(improvement)} percentage points.`;
      } else {
        message = 'Your assessment performance remained unchanged.';
      }

      section.appendChild(
        createElement(
          'p',
          'results-improvement',
          message
        )
      );

    }

    return section;
  }

  // ==========================================================
  // FINAL RESULT
  // ==========================================================

  function renderFinalResult(finalResult) {

    const section = createSection(
      'Final Assessment Outcome',
      'Your final assessment was evaluated by the server.'
    );

    if (!finalResult) {

      section.appendChild(
        createElement(
          'p',
          '',
          'Final assessment results are not available.'
        )
      );

      return section;
    }

    const percentage = getAssessmentPercentage(finalResult);

    const passed =
      finalResult.passed === true;

    const status = createElement(
      'div',
      passed
        ? 'feedback success'
        : 'feedback warning',
      passed
        ? 'PASS - Assessment completed successfully'
        : 'NOT PASSED - The required pass mark was not achieved'
    );

    section.appendChild(status);

    if (percentage !== null) {

      section.appendChild(
        createProgressBar(percentage)
      );

    }

    section.appendChild(
      createElement(
        'p',
        '',
        `Pass mark: ${finalResult.passMark ?? 50}%`
      )
    );

    section.appendChild(
      createElement(
        'p',
        '',
        `Final rank: ${getRank(finalResult)}`
      )
    );

    return section;
  }

  // ==========================================================
  // TOPIC PERFORMANCE
  // ==========================================================

  function renderTopicPerformance(finalResult) {

    const section = createSection(
      'Topic Performance',
      'Review your performance across the cybersecurity topics.'
    );

    const topics = getTopicBreakdown(finalResult);

    if (!topics.length) {

      section.appendChild(
        createElement(
          'p',
          '',
          'Topic-level performance data is not available.'
        )
      );

      return section;
    }

    topics.forEach(topic => {

      const percentage = getTopicPercentage(topic);

      const row = createElement(
        'div',
        'topic-performance'
      );

      const header = createElement(
        'div',
        'topic-performance-header'
      );

      header.appendChild(
        createElement(
          'strong',
          '',
          getTopicName(topic)
        )
      );

      header.appendChild(
        createElement(
          'span',
          '',
          `${getTopicScore(topic)} / ${getTopicTotal(topic)} (${percentage}%)`
        )
      );

      row.appendChild(header);

      row.appendChild(
        createProgressBar(percentage)
      );

      section.appendChild(row);

    });

    return section;
  }

  // ==========================================================
  // LEADERBOARD
  // ==========================================================

  function renderLeaderboard() {

    const section = createSection(
      'Cyber Defence Leaderboard',
      'Compare your final assessment performance with other participants.'
    );

    if (!state.leaderboard.length) {

      section.appendChild(
        createElement(
          'p',
          '',
          'Leaderboard information is currently unavailable.'
        )
      );

      return section;
    }

    const table = document.createElement('table');
    table.className = 'results-leaderboard';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    [
      'Rank',
      'Participant',
      'Score',
      'Cybersecurity title'
    ].forEach(text => {

      const th = createElement('th', '', text);

      headerRow.appendChild(th);

    });

    thead.appendChild(headerRow);

    const tbody = document.createElement('tbody');

    state.leaderboard.forEach((participant, index) => {

      const row = document.createElement('tr');

      const values = [
        participant.rank ?? index + 1,
        participant.participantCode ||
          participant.participant_code ||
          'Participant',
        participant.finalScore ??
          participant.final_score ??
          participant.score ??
          'N/A',
        participant.rankTitle ||
          participant.rank_title ||
          'Unranked'
      ];

      values.forEach(value => {

        const cell = createElement(
          'td',
          '',
          value
        );

        row.appendChild(cell);

      });

      tbody.appendChild(row);

    });

    table.append(thead, tbody);

    section.appendChild(table);

    return section;
  }

  // ==========================================================
  // COMPLETE RESULTS PAGE
  // ==========================================================

  function render() {

    if (!state.data) {
      return;
    }

    const container = getContainer();

    container.replaceChildren();

    const panel = createElement('div', 'panel');

    panel.appendChild(
      createElement(
        'h2',
        '',
        'Your Human Firewall Results'
      )
    );

    panel.appendChild(
      createElement(
        'p',
        '',
        'Your cybersecurity awareness training results are shown below.'
      )
    );

    const pre = state.data.pre;
    const post = state.data.post;
    const finalResult = state.data.final;

    panel.appendChild(
      renderAssessmentComparison(
        pre,
        post,
        finalResult
      )
    );

    panel.appendChild(
      renderFinalResult(finalResult)
    );

    panel.appendChild(
      renderTopicPerformance(finalResult)
    );

    panel.appendChild(
      renderLeaderboard()
    );

    const logoutButton = createElement(
      'button',
      'btn secondary',
      'END TRAINING SESSION'
    );

    logoutButton.id = 'results-logout';
    logoutButton.type = 'button';

    logoutButton.addEventListener('click', () => {

      if (
        window.App &&
        typeof window.App.logout === 'function'
      ) {
        window.App.logout();
      }

    });

    panel.appendChild(logoutButton);

    container.appendChild(panel);
  }

  // ==========================================================
  // LOAD RESULTS
  // ==========================================================

  async function initialise() {

    if (state.loading) {
      return;
    }

    state.loading = true;

    const container = getContainer();

    container.replaceChildren();

    const loadingPanel = createElement(
      'div',
      'panel'
    );

    loadingPanel.appendChild(
      createElement(
        'p',
        '',
        'Preparing your cybersecurity performance report...'
      )
    );

    container.appendChild(loadingPanel);

    try {

      const appState = window.App
        ? window.App.state
        : null;

      if (!appState || !appState.assessmentResults) {
        throw new Error(
          'Assessment results could not be accessed.'
        );
      }

      state.data = {
        pre: appState.assessmentResults.pre,
        post: appState.assessmentResults.post,
        final: appState.assessmentResults.final
      };

      if (!state.data.final) {
        throw new Error(
          'Your final assessment has not been completed.'
        );
      }

      try {

        const leaderboard = await API.getLeaderboard();

        state.leaderboard = Array.isArray(leaderboard)
          ? leaderboard
          : leaderboard &&
            Array.isArray(leaderboard.leaderboard)
            ? leaderboard.leaderboard
            : [];

      } catch (error) {

        state.leaderboard = [];

      }

      state.loaded = true;

      render();

    } catch (error) {

      container.replaceChildren();

      const panel = createElement(
        'div',
        'panel'
      );

      panel.appendChild(
        createElement(
          'h2',
          '',
          'Results unavailable'
        )
      );

      panel.appendChild(
        createElement(
          'p',
          '',
          error.message ||
            'Unable to prepare your results.'
        )
      );

      const retryButton = createElement(
        'button',
        'btn primary',
        'TRY AGAIN'
      );

      retryButton.type = 'button';

      retryButton.addEventListener(
        'click',
        initialise
      );

      panel.appendChild(retryButton);

      container.appendChild(panel);

    } finally {

      state.loading = false;

    }

  }

  // ==========================================================
  // PUBLIC INTERFACE
  // ==========================================================

  return {
    initialise,
    render
  };

})();

window.Results = Results;
