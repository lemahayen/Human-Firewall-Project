
// ============================================================
// HUMAN FIREWALL
// Main application controller
// ============================================================

const App = (() => {
  const state = {
    currentScreen: 'registration',
    participantCode: null,
    session: null,
    progress: null,
    startedAt: null,
    assessmentResults: {
      pre: null,
      post: null,
      final: null
    },
    missionResults: [],
    gameXP: 0,
    completedMissions: [],
    currentModuleIndex: 0
  };

  const screens = [
    'registration',
    'pretest',
    'training',
    'missions',
    'posttest',
    'finalquiz',
    'results'
  ];

  function $(id) {
    return document.getElementById(id);
  }

  function showScreen(screenName) {
    if (!screens.includes(screenName)) {
      console.error(`Unknown application screen: ${screenName}`);
      return;
    }

    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('active');
    });

    const target = $(`screen-${screenName}`);

    if (!target) {
      console.error(`Screen element not found: screen-${screenName}`);
      return;
    }

    target.classList.add('active');
    state.currentScreen = screenName;

    window.scrollTo({ top: 0, behavior: 'smooth' });

    updateNavigation();
  }

  function updateNavigation() {
    const codeElement = $('participant-code');

    if (codeElement) {
      codeElement.textContent = state.participantCode || 'NOT REGISTERED';
    }

    const progressElement = $('overall-progress');

    if (progressElement) {
      const currentIndex = screens.indexOf(state.currentScreen);
      const percentage = Math.max(
        0,
        Math.round((currentIndex / (screens.length - 1)) * 100)
      );

      progressElement.style.width = `${percentage}%`;
    }
  }

  function showMessage(message, type = 'error', targetId = 'app-message') {
    const target = $(targetId);

    if (!target) {
      alert(message);
      return;
    }

    target.textContent = message;
    target.className = `feedback ${type}`;
    target.classList.remove('hidden');
  }

  function clearMessage(targetId = 'app-message') {
    const target = $(targetId);

    if (target) {
      target.textContent = '';
      target.className = 'feedback hidden';
    }
  }

  function setButtonLoading(button, loading, originalText = '') {
    if (!button) return;

    button.disabled = loading;

    if (loading) {
      button.dataset.originalText = button.textContent;
      button.textContent = 'PLEASE WAIT...';
    } else {
      button.textContent = originalText || button.dataset.originalText || 'CONTINUE';
    }
  }

  async function register() {
    clearMessage();

    const consent = $('consent-accepted');
    const button = $('register-button');

    if (!consent || !consent.checked) {
      showMessage(
        'Please read the participant information and provide consent before continuing.',
        'warning'
      );
      return;
    }

    try {
      setButtonLoading(button, true);

      const registration = await API.register(true);

      state.participantCode = registration.participantCode;
      state.session = registration;
      state.startedAt = Date.now();

      await refreshProgress();

      showMessage(
        `Registration successful. Your participant code is ${registration.participantCode}.`,
        'success'
      );

      const codeElement = $('registration-code');

      if (codeElement) {
        codeElement.textContent = registration.participantCode;
      }

      showScreen('pretest');

      if (window.Assessments) {
        await Assessments.start('pre');
      }
    } catch (error) {
      showMessage(error.message);
    } finally {
      setButtonLoading(button, false, 'BEGIN MISSION');
    }
  }

  async function refreshProgress() {
    state.progress = await API.getProgress();
    return state.progress;
  }

  async function validateSession() {
    if (!API.getToken()) {
      return false;
    }

    try {
      state.session = await API.getSession();
      state.participantCode = state.session.participantCode;
      await refreshProgress();
      return true;
    } catch (error) {
      API.clearSession();
      state.session = null;
      state.participantCode = null;
      return false;
    }
  }

  async function continueToTraining() {
    clearMessage();

    try {
      await refreshProgress();

      showScreen('training');

      if (window.Training) {
        await Training.initialise();
      }
    } catch (error) {
      showMessage(error.message);
    }
  }

  async function continueToMissions() {
    clearMessage();

    try {
      await refreshProgress();

      showScreen('missions');

      if (window.Missions) {
        await Missions.initialise();
      }
    } catch (error) {
      showMessage(error.message);
    }
  }

  async function continueToPostTest() {
    clearMessage();

    try {
      await refreshProgress();

      showScreen('posttest');

      if (window.Assessments) {
        await Assessments.start('post');
      }
    } catch (error) {
      showMessage(error.message);
    }
  }

  async function continueToFinalQuiz() {
    clearMessage();

    try {
      await refreshProgress();

      showScreen('finalquiz');

      if (window.Assessments) {
        await Assessments.start('final');
      }
    } catch (error) {
      showMessage(error.message);
    }
  }

  async function showResults(result) {
    state.assessmentResults.final = result;

    showScreen('results');

    if (window.Results) {
      await Results.render(result);
    }
  }

  function addGameXP(points) {
    if (!Number.isInteger(points) || points < 0) {
      throw new Error('Invalid game XP value.');
    }

    state.gameXP += points;

    const xpElement = $('game-xp');

    if (xpElement) {
      xpElement.textContent = state.gameXP;
    }

    return state.gameXP;
  }

  function markMissionCompleted(missionId, result) {
    if (!state.completedMissions.includes(missionId)) {
      state.completedMissions.push(missionId);
    }

    state.missionResults.push({
      missionId,
      result
    });
  }

  function logout() {
    const confirmed = window.confirm(
      'Are you sure you want to leave this session? Your completed records will remain stored.'
    );

    if (!confirmed) return;

    API.clearSession();

    state.participantCode = null;
    state.session = null;
    state.progress = null;
    state.assessmentResults = {
      pre: null,
      post: null,
      final: null
    };
    state.missionResults = [];
    state.gameXP = 0;
    state.completedMissions = [];
    state.currentModuleIndex = 0;

    window.location.reload();
  }

  function bindEvents() {
    const registerButton = $('register-button');

    if (registerButton) {
      registerButton.addEventListener('click', register);
    }

    const trainingButton = $('continue-training');

    if (trainingButton) {
      trainingButton.addEventListener('click', continueToTraining);
    }

    const missionsButton = $('continue-missions');

    if (missionsButton) {
      missionsButton.addEventListener('click', continueToMissions);
    }

    const postTestButton = $('continue-posttest');

    if (postTestButton) {
      postTestButton.addEventListener('click', continueToPostTest);
    }

    const finalQuizButton = $('continue-finalquiz');

    if (finalQuizButton) {
      finalQuizButton.addEventListener('click', continueToFinalQuiz);
    }

    const logoutButton = $('logout-button');

    if (logoutButton) {
      logoutButton.addEventListener('click', logout);
    }
  }

  async function initialise() {
    bindEvents();

    const authenticated = await validateSession();

    if (authenticated) {
      showMessage(
        'An existing session was found. Please continue from the appropriate stage.',
        'success'
      );

      showScreen('pretest');
      return;
    }

    showScreen('registration');
  }

  return {
    state,
    $,
    showScreen,
    showMessage,
    clearMessage,
    refreshProgress,
    validateSession,
    continueToTraining,
    continueToMissions,
    continueToPostTest,
    continueToFinalQuiz,
    showResults,
    addGameXP,
    markMissionCompleted,
    logout,
    initialise
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  App.initialise();
});
