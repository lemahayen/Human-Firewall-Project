
/*
 * ============================================================
 * HUMAN FIREWALL
 * Interactive Mission Controller
 *
 * Three cybersecurity missions:
 * 1. Password Breach
 * 2. Phishing Detective
 * 3. Data Guardian
 *
 * Mission content and scoring are supplied by the backend.
 * The frontend collects decisions and displays server results.
 * ============================================================
 */

'use strict';

const Missions = (() => {

  // ==========================================================
  // STATE
  // ==========================================================

  const state = {
    missions: [],
    activeMission: null,
    answers: {},
    completed: new Set(),
    results: {},
    loading: false
  };

  const $ = id => document.getElementById(id);

  // ==========================================================
  // DATA HELPERS
  // ==========================================================

  function missionId(mission) {
    return mission.id ||
      mission.missionId ||
      mission.mission_id;
  }

  function decisionId(decision) {
    return decision.id ||
      decision.decisionId ||
      decision.decision_id;
  }

  function getDecisions(mission) {
    return mission.decisions ||
      mission.questions ||
      [];
  }

  function getOptions(decision) {
    return decision.options ||
      decision.choices ||
      [];
  }

  function getOptionId(option) {
    if (typeof option === 'string') {
      return option;
    }

    return option.id ||
      option.value ||
      option.optionId ||
      option.option_id;
  }

  function getOptionText(option) {
    if (typeof option === 'string') {
      return option;
    }

    return option.text ||
      option.label ||
      option.description ||
      '';
  }

  function getMissionTitle(mission) {
    return mission.title ||
      mission.name ||
      missionId(mission) ||
      'Cyber Defence Mission';
  }

  function getMissionDescription(mission) {
    return mission.description ||
      mission.introduction ||
      '';
  }

  function isCompleted(mission) {
    const id = missionId(mission);

    return state.completed.has(id) ||
      mission.completed === true ||
      mission.status === 'completed';
  }

  // ==========================================================
  // DOM HELPERS
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
    let container = $('missions-container');

    if (container) {
      return container;
    }

    const screen = $('screen-missions');

    if (!screen) {
      throw new Error(
        'The missions screen was not found in index.html.'
      );
    }

    container = document.createElement('div');
    container.id = 'missions-container';

    screen.appendChild(container);

    return container;
  }

  function showMessage(message, type = 'info') {
    const container = getContainer();

    let element = $('mission-message');

    if (!element) {
      element = createElement(
        'div',
        'feedback'
      );

      element.id = 'mission-message';

      container.prepend(element);
    }

    element.textContent = message;
    element.className = `feedback ${type}`;
    element.hidden = false;
  }

  function clearContainer() {
    getContainer().replaceChildren();
  }

  // ==========================================================
  // MISSION VALIDATION
  // ==========================================================

  function validateMission(mission) {
    if (!mission || typeof mission !== 'object') {
      return false;
    }

    if (
      typeof missionId(mission) !== 'string' ||
      !missionId(mission).trim()
    ) {
      return false;
    }

    const decisions = getDecisions(mission);

    if (!Array.isArray(decisions) || decisions.length === 0) {
      return false;
    }

    const usedDecisionIds = new Set();

    for (const decision of decisions) {

      if (
        !decision ||
        typeof decisionId(decision) !== 'string' ||
        !decisionId(decision).trim()
      ) {
        return false;
      }

      if (usedDecisionIds.has(decisionId(decision))) {
        return false;
      }

      usedDecisionIds.add(decisionId(decision));

      const options = getOptions(decision);

      if (!Array.isArray(options) || options.length < 2) {
        return false;
      }

      const usedOptionIds = new Set();

      for (const option of options) {

        const id = getOptionId(option);
        const text = getOptionText(option);

        if (
          typeof id !== 'string' ||
          !id.trim() ||
          typeof text !== 'string' ||
          !text.trim()
        ) {
          return false;
        }

        if (usedOptionIds.has(id)) {
          return false;
        }

        usedOptionIds.add(id);

      }

    }

    return true;
  }

  // ==========================================================
  // MISSION OVERVIEW
  // ==========================================================

  function renderOverview() {
    const container = getContainer();

    container.replaceChildren();

    const panel = createElement('div', 'panel');

    panel.appendChild(
      createElement('h2', '', 'Cyber Defence Missions')
    );

    panel.appendChild(
      createElement(
        'p',
        '',
        'Complete all three operational missions. Your decisions will be evaluated and scored by the server.'
      )
    );

    const grid = createElement('div', 'mission-grid');

    state.missions.forEach(mission => {

      const id = missionId(mission);
      const completed = isCompleted(mission);

      const card = createElement(
        'article',
        'mission-card'
      );

      card.appendChild(
        createElement(
          'h3',
          '',
          getMissionTitle(mission)
        )
      );

      card.appendChild(
        createElement(
          'p',
          '',
          getMissionDescription(mission)
        )
      );

      card.appendChild(
        createElement(
          'p',
          'mission-status',
          completed
            ? 'Mission completed'
            : 'Mission available'
        )
      );

      const button = createElement(
        'button',
        completed
          ? 'btn secondary'
          : 'btn primary',
        completed
          ? 'COMPLETED'
          : 'START MISSION'
      );

      button.type = 'button';

      // FIX:
      // Do not disable mission buttons because the initial
      // loading flag is still true during overview rendering.
      // The loading flag is reset in initialise()'s finally
      // block before the user can interact with the page.

      button.disabled = completed;

      button.addEventListener('click', () => {
        openMission(id);
      });

      card.appendChild(button);

      grid.appendChild(card);

    });

    panel.appendChild(grid);

    const completedCount = state.completed.size;

    panel.appendChild(
      createElement(
        'p',
        'mission-progress',
        `${completedCount} / ${state.missions.length} missions completed`
      )
    );

    const message = createElement('div', 'feedback hidden');

    message.id = 'mission-message';

    panel.appendChild(message);

    if (
      state.missions.length > 0 &&
      state.missions.every(isCompleted)
    ) {

      const continueButton = createElement(
        'button',
        'btn primary',
        'CONTINUE TO POST-ASSESSMENT'
      );

      continueButton.type = 'button';

      continueButton.addEventListener('click', async () => {

        if (
          window.App &&
          typeof window.App.continueToPostTest === 'function'
        ) {
          await window.App.continueToPostTest();
        } else {
          showMessage(
            'The post-assessment module is not available.',
            'error'
          );
        }

      });

      panel.appendChild(continueButton);

    }

    container.appendChild(panel);
  }

  // ==========================================================
  // OPEN MISSION
  // ==========================================================

  function openMission(id) {

    if (state.loading) {
      return;
    }

    const mission = state.missions.find(
      item => missionId(item) === id
    );

    if (!mission) {
      showMessage(
        'Mission information could not be found.',
        'error'
      );

      return;
    }

    if (isCompleted(mission)) {
      showMessage(
        'You have already completed this mission.',
        'info'
      );

      return;
    }

    if (!validateMission(mission)) {
      showMessage(
        'The mission contains invalid or incomplete decision information.',
        'error'
      );

      return;
    }

    state.activeMission = mission;
    state.answers = {};

    renderMission(mission);
  }

  // ==========================================================
  // MISSION DISPLAY
  // ==========================================================

  function renderMission(mission) {

    const container = getContainer();

    container.replaceChildren();

    const decisions = getDecisions(mission);

    const panel = createElement('div', 'panel');

    const backButton = createElement(
      'button',
      'btn secondary',
      'BACK TO MISSIONS'
    );

    backButton.type = 'button';

    backButton.addEventListener('click', () => {
      if (!state.loading) {
        state.activeMission = null;
        renderOverview();
      }
    });

    panel.appendChild(backButton);

    panel.appendChild(
      createElement(
        'h2',
        '',
        getMissionTitle(mission)
      )
    );

    panel.appendChild(
      createElement(
        'p',
        '',
        getMissionDescription(mission)
      )
    );

    decisions.forEach((decision, index) => {

      const decisionCard = createElement(
        'section',
        'question-card'
      );

      decisionCard.appendChild(
        createElement(
          'h3',
          '',
          `DECISION ${index + 1} OF ${decisions.length}`
        )
      );

      decisionCard.appendChild(
        createElement(
          'p',
          '',
          decision.prompt ||
            decision.text ||
            decision.scenario ||
            ''
        )
      );

      const optionsContainer = createElement(
        'div',
        'mission-options'
      );

      getOptions(decision).forEach(option => {

        const optionId = getOptionId(option);

        const label = createElement(
          'label',
          'option'
        );

        const radio = document.createElement('input');

        radio.type = 'radio';

        radio.name =
          `mission-${decisionId(decision)}`;

        radio.value = optionId;

        radio.dataset.decisionId =
          decisionId(decision);

        radio.addEventListener('change', () => {

          state.answers[decisionId(decision)] =
            optionId;

        });

        const text = createElement(
          'span',
          '',
          getOptionText(option)
        );

        label.append(radio, text);

        optionsContainer.appendChild(label);

      });

      decisionCard.appendChild(optionsContainer);

      panel.appendChild(decisionCard);

    });

    const message = createElement(
      'div',
      'feedback hidden'
    );

    message.id = 'mission-message';

    panel.appendChild(message);

    const submitButton = createElement(
      'button',
      'btn primary',
      'SUBMIT MISSION DECISIONS'
    );

    submitButton.id = 'mission-submit';
    submitButton.type = 'button';

    submitButton.addEventListener(
      'click',
      submitMission
    );

    panel.appendChild(submitButton);

    container.appendChild(panel);

  }

  // ==========================================================
  // COLLECT ANSWERS
  // ==========================================================

  function collectAnswers(mission) {

    const decisions = getDecisions(mission);

    const answers = [];

    for (const decision of decisions) {

      const id = decisionId(decision);

      const selectedOption = state.answers[id];

      if (
        typeof selectedOption !== 'string' ||
        !getOptions(decision).some(
          option => getOptionId(option) === selectedOption
        )
      ) {
        return null;
      }

      answers.push({
        decisionId: id,
        selectedOption
      });

    }

    return answers;
  }

  // ==========================================================
  // SUBMIT MISSION
  // ==========================================================

  async function submitMission() {

    if (state.loading || !state.activeMission) {
      return;
    }

    const mission = state.activeMission;
    const id = missionId(mission);

    const answers = collectAnswers(mission);

    if (!answers) {

      showMessage(
        'Please answer every decision before submitting.',
        'warning'
      );

      return;
    }

    state.loading = true;

    const submitButton = $('mission-submit');

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'EVALUATING DECISIONS...';
    }

    try {

      const result = await API.submitMission(
        id,
        answers
      );

      if (!result || typeof result !== 'object') {
        throw new Error(
          'The server returned an invalid mission result.'
        );
      }

      state.completed.add(id);

      state.results[id] = result;

      if (
        window.App &&
        typeof window.App.markMissionCompleted === 'function'
      ) {
        window.App.markMissionCompleted(id, result);
      }

      renderResult(result);

    } catch (error) {

      showMessage(
        error.message ||
          'Unable to submit this mission.',
        'error'
      );

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'TRY SUBMISSION AGAIN';
      }

    } finally {

      state.loading = false;

    }

  }

  // ==========================================================
  // MISSION RESULT DISPLAY
  // ==========================================================

  function renderResult(result) {

    const container = getContainer();

    container.replaceChildren();

    const score = Number(
      result.score ??
      result.missionScore ??
      0
    );

    const maxScore = Number(
      result.maxScore ??
      result.max_score ??
      100
    );

    const percentage = Number(
      result.percentage ??
      (
        maxScore > 0
          ? Math.round((score / maxScore) * 100)
          : 0
      )
    );

    const panel = createElement('div', 'panel');

    panel.appendChild(
      createElement(
        'h2',
        '',
        'MISSION COMPLETED'
      )
    );

    const stats = createElement(
      'div',
      'stats-grid'
    );

    const scoreBox = createElement(
      'div',
      'stat-box'
    );

    scoreBox.appendChild(
      createElement(
        'h3',
        '',
        `${score} / ${maxScore}`
      )
    );

    scoreBox.appendChild(
      createElement(
        'p',
        '',
        'Mission score'
      )
    );

    const percentageBox = createElement(
      'div',
      'stat-box'
    );

    percentageBox.appendChild(
      createElement(
        'h3',
        '',
        `${percentage}%`
      )
    );

    percentageBox.appendChild(
      createElement(
        'p',
        '',
        'Performance'
      )
    );

    stats.append(scoreBox, percentageBox);

    panel.appendChild(stats);

    panel.appendChild(
      createElement(
        'h3',
        '',
        'MISSION FEEDBACK'
      )
    );

    const feedbackItems =
      result.feedback ||
      result.decisions ||
      result.results ||
      [];

    if (Array.isArray(feedbackItems) && feedbackItems.length > 0) {

      feedbackItems.forEach((item, index) => {

        const feedbackCard = createElement(
          'div',
          'feedback'
        );

        feedbackCard.appendChild(
          createElement(
            'strong',
            '',
            `Decision ${index + 1}`
          )
        );

        feedbackCard.appendChild(
          createElement(
            'p',
            '',
            item.feedback ||
              item.explanation ||
              item.message ||
              'Your decision has been recorded.'
          )
        );

        panel.appendChild(feedbackCard);

      });

    } else {

      panel.appendChild(
        createElement(
          'p',
          '',
          'Your decisions have been recorded by the server.'
        )
      );

    }

    const continueButton = createElement(
      'button',
      'btn primary',
      'RETURN TO MISSIONS'
    );

    continueButton.id = 'mission-result-continue';
    continueButton.type = 'button';

    continueButton.addEventListener('click', () => {

      state.activeMission = null;

      renderOverview();

    });

    panel.appendChild(continueButton);

    container.appendChild(panel);

  }

  // ==========================================================
  // LOAD MISSIONS
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
        'Loading cybersecurity missions...'
      )
    );

    container.appendChild(loadingPanel);

    try {

      const response = await API.getMissions();

      const missions = Array.isArray(response)
        ? response
        : response && Array.isArray(response.missions)
          ? response.missions
          : null;

      if (!missions) {
        throw new Error(
          'The server returned an invalid missions response.'
        );
      }

      if (missions.some(mission => !validateMission(mission))) {
        throw new Error(
          'One or more missions contain invalid decision information.'
        );
      }

      state.missions = missions;

      state.completed = new Set(
        missions
          .filter(isCompleted)
          .map(missionId)
      );

      state.activeMission = null;
      state.answers = {};

      renderOverview();

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
          'Unable to load missions'
        )
      );

      panel.appendChild(
        createElement(
          'p',
          '',
          error.message || 'An unexpected error occurred.'
        )
      );

      const retryButton = createElement(
        'button',
        'btn primary',
        'TRY AGAIN'
      );

      retryButton.id = 'mission-retry';
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
    openMission
  };

})();

// Expose mission controller to the main application.
window.Missions = Missions;
