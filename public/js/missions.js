
/* 
 * Human Firewall - Interactive Mission Controller
 * Missions are loaded and scored by the backend.
 */

const Missions = (() => {
  const state = {
    missions: [],
    activeMission: null,
    answers: {},
    completed: new Set(),
    results: {},
    loading: false
  };

  const $ = (id) => document.getElementById(id);

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[character]);
  }

  function missionId(mission) {
    return mission.id || mission.missionId || mission.mission_id;
  }

  function decisionId(decision) {
    return decision.id || decision.decisionId || decision.decision_id;
  }

  function getOptions(decision) {
    return decision.options || decision.choices || [];
  }

  function getOptionId(option) {
    if (typeof option === 'string') return option;
    return option.id || option.value || option.optionId;
  }

  function getOptionText(option) {
    if (typeof option === 'string') return option;
    return option.text || option.label || option.description || '';
  }

  function getContainer() {
    let container = $('missions-container');

    if (!container) {
      const screen = $('screen-missions');

      if (!screen) {
        throw new Error('The missions screen was not found in index.html.');
      }

      container = document.createElement('div');
      container.id = 'missions-container';
      screen.appendChild(container);
    }

    return container;
  }

  function showMessage(message, type = 'info') {
    const container = getContainer();
    let element = $('mission-message');

    if (!element) {
      element = document.createElement('div');
      element.id = 'mission-message';
      container.prepend(element);
    }

    element.className = `feedback ${type}`;
    element.textContent = message;
    element.hidden = false;
  }

  function renderOverview() {
    const container = getContainer();

    const cards = state.missions.map((mission) => {
      const id = missionId(mission);
      const completed = state.completed.has(id);
      const title = mission.title || mission.name || id;
      const description = mission.description || mission.introduction || '';

      return `
        <article class="mission-card">
          <h3>${escapeHTML(title)}</h3>
          <p>${escapeHTML(description)}</p>
          <p class="mission-status">
            ${completed ? 'Mission completed' : 'Mission available'}
          </p>
          <button
            class="btn ${completed ? 'btn-secondary' : 'btn-primary'}"
            data-mission-id="${escapeHTML(id)}"
            ${completed ? 'disabled' : ''}
          >
            ${completed ? 'Completed' : 'Start mission'}
          </button>
        </article>
      `;
    }).join('');

    container.innerHTML = `
      <div class="panel">
        <h2>Cyber Defence Missions</h2>
        <p>
          Complete all three operational missions. Your decisions will be
          evaluated by the server.
        </p>
        <div class="mission-grid">
          ${cards || '<p>No missions are currently available.</p>'}
        </div>
        <p id="mission-message" class="feedback" hidden></p>
      </div>
    `;

    container.querySelectorAll('[data-mission-id]').forEach((button) => {
      button.addEventListener('click', () => {
        openMission(button.dataset.missionId);
      });
    });
  }

  function openMission(id) {
    const mission = state.missions.find(
      (item) => missionId(item) === id
    );

    if (!mission) {
      showMessage('Mission information could not be found.', 'error');
      return;
    }

    if (state.completed.has(id)) {
      showMessage('You have already completed this mission.', 'info');
      return;
    }

    const decisions = mission.decisions || mission.questions || [];

    if (!decisions.length) {
      showMessage('This mission has no decision points configured.', 'error');
      return;
    }

    state.activeMission = mission;
    state.answers = {};

    renderMission(mission);
  }

  function renderMission(mission) {
    const container = getContainer();
    const decisions = mission.decisions || mission.questions || [];

    const decisionHTML = decisions.map((decision, index) => {
      const id = decisionId(decision);
      const options = getOptions(decision);

      return `
        <section class="question-card">
          <h3>Decision ${index + 1}</h3>
          <p>${escapeHTML(decision.prompt || decision.text || decision.scenario || '')}</p>

          <div class="mission-options">
            ${options.map((option) => {
              const optionId = getOptionId(option);

              return `
                <label class="option">
                  <input
                    type="radio"
                    name="mission-${escapeHTML(id)}"
                    value="${escapeHTML(optionId)}"
                    data-decision-id="${escapeHTML(id)}"
                  >
                  <span>${escapeHTML(getOptionText(option))}</span>
                </label>
              `;
            }).join('')}
          </div>
        </section>
      `;
    }).join('');

    container.innerHTML = `
      <div class="panel">
        <button id="mission-back" class="btn btn-secondary">
          Back to missions
        </button>

        <h2>${escapeHTML(mission.title || mission.name || 'Cyber Defence Mission')}</h2>

        <p>${escapeHTML(mission.description || mission.introduction || '')}</p>

        ${decisionHTML}

        <div id="mission-message" class="feedback" hidden></div>

        <button id="mission-submit" class="btn btn-primary">
          Submit mission decisions
        </button>
      </div>
    `;

    $('mission-back').addEventListener('click', renderOverview);
    $('mission-submit').addEventListener('click', submitMission);
  }

  async function submitMission() {
    if (state.loading || !state.activeMission) return;

    const mission = state.activeMission;
    const id = missionId(mission);
    const decisions = mission.decisions || mission.questions || [];

    const answers = [];

    for (const decision of decisions) {
      const idForDecision = decisionId(decision);
      const selected = document.querySelector(
        `input[data-decision-id="${CSS.escape(String(idForDecision))}"]:checked`
      );

      if (!selected) {
        showMessage('Please answer every decision before submitting.', 'warning');
        return;
      }

      answers.push({
        decisionId: idForDecision,
        selectedOption: selected.value
      });
    }

    state.loading = true;

    const submitButton = $('mission-submit');
    submitButton.disabled = true;
    submitButton.textContent = 'Evaluating decisions...';

    try {
      const result = await API.submitMission(id, answers);

      state.completed.add(id);
      state.results[id] = result;

      renderResult(result);
    } catch (error) {
      showMessage(error.message || 'Unable to submit this mission.', 'error');

      submitButton.disabled = false;
      submitButton.textContent = 'Try submission again';
    } finally {
      state.loading = false;
    }
  }

  function renderResult(result) {
    const container = getContainer();

    const score = result.score ?? result.missionScore ?? 0;
    const maxScore = result.maxScore ?? result.max_score ?? 100;
    const percentage = result.percentage ??
      (maxScore ? Math.round((score / maxScore) * 100) : 0);

    const feedbackItems = result.feedback ||
      result.decisions ||
      result.results ||
      [];

    const feedbackHTML = feedbackItems.map((item, index) => `
      <div class="feedback">
        <strong>Decision ${index + 1}</strong>
        <p>${escapeHTML(item.feedback || item.explanation || item.message || '')}</p>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="panel">
        <h2>Mission completed</h2>

        <div class="stats-grid">
          <div class="stat-box">
            <h3>${escapeHTML(score)} / ${escapeHTML(maxScore)}</h3>
            <p>Mission score</p>
          </div>

          <div class="stat-box">
            <h3>${escapeHTML(percentage)}%</h3>
            <p>Performance</p>
          </div>
        </div>

        <h3>Mission feedback</h3>
        ${feedbackHTML || '<p>Your decisions have been recorded.</p>'}

        <button id="mission-result-continue" class="btn btn-primary">
          Return to missions
        </button>
      </div>
    `;

    $('mission-result-continue').addEventListener('click', renderOverview);
  }

  async function initialise() {
    if (state.loading) return;

    state.loading = true;

    const container = getContainer();
    container.innerHTML = `
      <div class="panel">
        <p>Loading cybersecurity missions...</p>
      </div>
    `;

    try {
      const response = await API.getMissions();

      state.missions = Array.isArray(response)
        ? response
        : response.missions || [];

      state.completed = new Set(
        state.missions
          .filter((mission) => mission.completed || mission.status === 'completed')
          .map(missionId)
      );

      renderOverview();

    } catch (error) {
      container.innerHTML = `
        <div class="panel">
          <h2>Unable to load missions</h2>
          <p>${escapeHTML(error.message)}</p>
          <button id="mission-retry" class="btn btn-primary">
            Try again
          </button>
        </div>
      `;

      $('mission-retry').addEventListener('click', initialise);

    } finally {
      state.loading = false;
    }
  }

  return {
    initialise,
    openMission
  };
})();
