
/* ============================================================
   HUMAN FIREWALL
   Training module controller

   Three mandatory modules:
   1. Password Security
   2. Phishing Detective
   3. Safe Data Handling

   Each module requires:
   - Full video playback until the YouTube ENDED event
   - Two correctly answered checkpoint questions
   - Server-recorded completion

   IMPORTANT:
   Video completion is client-reported. The YouTube player
   event improves progression control but is not independent
   proof of participant attention.
============================================================ */

'use strict';

const Training = (() => {

  const MODULES = [
    {
      id: 'password_security',
      title: 'PASSWORD SECURITY',
      description:
        'Protect workplace accounts using strong, unique passwords and additional authentication controls.',
      learningPoints:
        '• Use long, unique passwords for every account.\n' +
        '• Never reuse workplace passwords on personal services.\n' +
        '• Use an approved password manager where available.\n' +
        '• Enable multi-factor authentication (MFA).\n' +
        '• Report suspected credential compromise immediately.',
      videoId: 'gJdylzi6lHw'
    },
    {
      id: 'phishing',
      title: 'PHISHING DETECTIVE',
      description:
        'Recognise phishing attempts, suspicious links, malicious attachments and social engineering techniques.',
      learningPoints:
        '• Check the sender address, not just the display name.\n' +
        '• Inspect unexpected links before opening them.\n' +
        '• Be cautious of urgent requests and unusual payment instructions.\n' +
        '• Never enter credentials through an unexpected email link.\n' +
        '• Report suspicious messages using your organisation’s approved process.',
      videoId: 'Kqj3f5uAgKE'
    },
    {
      id: 'data_handling',
      title: 'SAFE DATA HANDLING',
      description:
        'Handle, store and share organisational information safely and responsibly.',
      learningPoints:
        '• Share information only with authorised recipients.\n' +
        '• Verify recipients before sending sensitive attachments.\n' +
        '• Use approved storage and file-sharing services.\n' +
        '• Lock your workstation when leaving it unattended.\n' +
        '• Report accidental disclosure immediately.',
      videoId: 'hsNRrEnB_aM'
    }
  ];

  let currentModuleIndex = 0;
  let currentModule = null;
  let player = null;
  let videoEnded = false;
  let videoCompleted = false;
  let completionRequestSent = false;
  let checkpointCompleted = false;
  let checkpointAwaitingNext = false;
  let checkpoints = [];
  let currentCheckpointIndex = 0;
  let submittingCheckpoint = false;
  let moduleComplete = false;

  const completedModules = new Set();
  const awardedModules = new Set();

  function $(id) {
    return document.getElementById(id);
  }

  function showStatus(message, type = 'info') {
    if (window.App && typeof App.showMessage === 'function') {
      App.showMessage(message, type, 'app-message');
    }
  }

  function showCheckpointFeedback(message, type = 'info') {
    const target = $('training-checkpoint-feedback');
    if (!target) return;

    target.textContent = message;
    target.className = `feedback ${type}`;
    target.classList.remove('hidden');
  }

  function clearCheckpointFeedback() {
    const target = $('training-checkpoint-feedback');
    if (!target) return;

    target.textContent = '';
    target.className = 'feedback hidden';
  }

  function showElement(id) {
    const target = $(id);
    if (target) target.classList.remove('hidden');
  }

  function hideElement(id) {
    const target = $(id);
    if (target) target.classList.add('hidden');
  }

  function setText(id, value) {
    const target = $(id);
    if (target) target.textContent = value;
  }

  function updateModuleProgress() {
    setText(
      'training-module-progress',
      `${completedModules.size} / ${MODULES.length}`
    );
  }

  function getVideoContainer() {
    const iframe = $('training-video');
    return iframe
      ? iframe.closest('.video-container')
      : document.querySelector('.video-container');
  }

  function setVideoVisible(visible) {
    const container = getVideoContainer();
    const button = $('training-complete-button');

    if (container) {
      container.classList.toggle('hidden', !visible);
    }

    if (button) {
      button.classList.toggle('hidden', !visible && !moduleComplete);
    }
  }

  function loadYouTubeAPI() {
    if (window.YT && window.YT.Player) {
      return Promise.resolve();
    }

    if (window.__humanFirewallYouTubePromise) {
      return window.__humanFirewallYouTubePromise;
    }

    window.__humanFirewallYouTubePromise = new Promise(
      (resolve, reject) => {
        const previousCallback = window.onYouTubeIframeAPIReady;

        window.onYouTubeIframeAPIReady = () => {
          if (typeof previousCallback === 'function') {
            try {
              previousCallback();
            } catch (error) {
              console.warn('Previous YouTube callback failed:', error);
            }
          }

          if (window.YT && window.YT.Player) {
            resolve();
          } else {
            reject(new Error('YouTube player API failed to initialise.'));
          }
        };

        let script = document.querySelector(
          'script[src="https://www.youtube.com/iframe_api"]'
        );

        if (!script) {
          script = document.createElement('script');
          script.src = 'https://www.youtube.com/iframe_api';
          script.async = true;

          script.onerror = () => {
            reject(new Error('Unable to load the YouTube player API.'));
          };

          document.head.appendChild(script);
        }
      }
    );

    return window.__humanFirewallYouTubePromise;
  }

  function createVideoFrame() {
    const container = getVideoContainer();

    if (!container) {
      throw new Error('The training video container is missing.');
    }

    container.replaceChildren();

    const iframe = document.createElement('iframe');
    iframe.id = 'training-video';
    iframe.title = 'Cybersecurity training video';
    iframe.allow =
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.loading = 'lazy';

    container.appendChild(iframe);

    return iframe;
  }

  async function createPlayer(module) {
    if (player && typeof player.destroy === 'function') {
      try {
        player.destroy();
      } catch (error) {
        console.warn('Unable to destroy previous video player:', error);
      }
    }

    player = null;

    createVideoFrame();

    await loadYouTubeAPI();

    return new Promise((resolve, reject) => {
      try {
        player = new window.YT.Player('training-video', {
          width: '100%',
          height: '390',
          videoId: module.videoId,

          playerVars: {
            playsinline: 1,
            rel: 0,
            controls: 1
          },

          events: {
            onReady: () => {
              resolve();
            },

            onStateChange: event => {
              if (
                event.data === window.YT.PlayerState.ENDED
              ) {
                handleVideoEnded();
              }
            },

            onError: event => {
              const message =
                `The video could not be played. YouTube error ${event.data}.`;

              showStatus(message, 'error');
              reject(new Error(message));
            }
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function handleVideoEnded() {
    if (
      !currentModule ||
      videoCompleted ||
      completionRequestSent
    ) {
      return;
    }

    videoEnded = true;
    completionRequestSent = true;

    const button = $('training-complete-button');

    if (button) {
      button.disabled = true;
      button.textContent = 'RECORDING COMPLETION...';
    }

    try {
      showStatus(
        'Video finished. Recording your training progress...',
        'info'
      );

      await API.completeVideo(currentModule.id);

      videoCompleted = true;

      showStatus(
        'Video completion recorded. Complete both checkpoint questions to unlock the next module.',
        'success'
      );

      await loadCheckpoints();

    } catch (error) {
      completionRequestSent = false;

      showStatus(
        `${error.message} Please retry recording your video completion.`,
        'error'
      );

      if (button) {
        button.disabled = false;
        button.textContent = 'RETRY VIDEO COMPLETION';
      }
    }
  }

  async function loadCheckpoints() {
    if (!currentModule || !videoCompleted) return;

    try {
      const response = await API.getCheckpoints(currentModule.id);

      if (
        !response ||
        !Array.isArray(response.questions) ||
        response.questions.length !== 2
      ) {
        throw new Error(
          'The server did not return the expected two checkpoint questions.'
        );
      }

      for (const question of response.questions) {
        if (
          typeof question.questionId !== 'string' ||
          typeof question.prompt !== 'string' ||
          !Array.isArray(question.options)
        ) {
          throw new Error('The server returned an invalid checkpoint question.');
        }
      }

      checkpoints = response.questions;
      currentCheckpointIndex = 0;
      checkpointAwaitingNext = false;

      setVideoVisible(false);
      hideElement('training-complete-button');
      showElement('training-checkpoint');

      renderCheckpoint();

    } catch (error) {
      showStatus(error.message, 'error');
    }
  }

  function renderCheckpoint() {
    if (currentCheckpointIndex >= checkpoints.length) {
      finishModule();
      return;
    }

    const question = checkpoints[currentCheckpointIndex];

    setText(
      'training-checkpoint-question',
      `CHECKPOINT ${currentCheckpointIndex + 1} OF ${checkpoints.length}: ${question.prompt}`
    );

    const optionsContainer = $('training-checkpoint-options');

    if (!optionsContainer) {
      showStatus('The checkpoint options container is missing.', 'error');
      return;
    }

    optionsContainer.replaceChildren();

    question.options.forEach(option => {
      const label = document.createElement('label');
      label.className = 'option';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'training-checkpoint-answer';
      radio.value = option.id;

      const text = document.createElement('span');
      text.textContent = `${option.id}. ${option.text}`;

      label.append(radio, text);
      optionsContainer.appendChild(label);
    });

    const continueButton = $('training-checkpoint-continue');

    if (continueButton) {
      continueButton.disabled = false;
      continueButton.classList.remove('hidden');
      continueButton.textContent = 'SUBMIT ANSWER';
    }

    checkpointAwaitingNext = false;
    clearCheckpointFeedback();
  }

  async function submitCheckpoint() {
    if (
      submittingCheckpoint ||
      !currentModule ||
      !videoCompleted ||
      checkpointCompleted
    ) {
      return;
    }

    if (checkpointAwaitingNext) {
      currentCheckpointIndex++;

      if (currentCheckpointIndex >= checkpoints.length) {
        finishModule();
      } else {
        renderCheckpoint();
      }

      return;
    }

    const question = checkpoints[currentCheckpointIndex];

    if (!question) return;

    const selected = document.querySelector(
      'input[name="training-checkpoint-answer"]:checked'
    );

    if (!selected) {
      showCheckpointFeedback(
        'Select an answer before continuing.',
        'warning'
      );
      return;
    }

    submittingCheckpoint = true;

    const button = $('training-checkpoint-continue');

    if (button) {
      button.disabled = true;
      button.textContent = 'CHECKING ANSWER...';
    }

    try {
      const result = await API.answerCheckpoint(
        currentModule.id,
        question.questionId,
        selected.value
      );

      if (result.correct === true) {
        checkpointAwaitingNext = true;

        showCheckpointFeedback(
          `Correct. ${result.explanation || 'Well done.'}`,
          'success'
        );

        const optionsContainer = $('training-checkpoint-options');

        if (optionsContainer) {
          optionsContainer.querySelectorAll('input').forEach(input => {
            input.disabled = true;
          });
        }

        if (result.checkpointCompleted === true) {
          checkpointCompleted = true;
        }

        if (button) {
          button.disabled = false;
          button.textContent = checkpointCompleted
            ? 'COMPLETE MODULE'
            : 'NEXT QUESTION';
        }

      } else {
        showCheckpointFeedback(
          `Incorrect. ${result.explanation || 'Review the learning material and try again.'}`,
          'error'
        );

        if (button) {
          button.disabled = false;
          button.textContent = 'TRY AGAIN';
        }
      }

    } catch (error) {
      showCheckpointFeedback(error.message, 'error');

      if (button) {
        button.disabled = false;
        button.textContent = 'RETRY ANSWER';
      }

    } finally {
      submittingCheckpoint = false;
    }
  }

  function finishModule() {
    if (!currentModule || !checkpointCompleted) return;

    moduleComplete = true;

    hideElement('training-checkpoint');
    setVideoVisible(false);

    if (!completedModules.has(currentModule.id)) {
      completedModules.add(currentModule.id);
    }

    if (
      !awardedModules.has(currentModule.id) &&
      window.App &&
      typeof App.addGameXP === 'function'
    ) {
      App.addGameXP(100);
      awardedModules.add(currentModule.id);
    }

    updateModuleProgress();

    const button = $('training-complete-button');

    if (button) {
      button.classList.remove('hidden');
      button.disabled = false;

      button.textContent =
        currentModuleIndex === MODULES.length - 1
          ? 'CONTINUE TO MISSIONS'
          : 'NEXT TRAINING MODULE';
    }

    showStatus(
      `${currentModule.title} completed. Both checkpoint questions were answered correctly.`,
      'success'
    );
  }

  async function openModule(index) {
    if (index < 0 || index >= MODULES.length) return;

    currentModuleIndex = index;
    currentModule = MODULES[index];

    videoEnded = false;
    videoCompleted = false;
    completionRequestSent = false;
    checkpointCompleted = false;
    checkpointAwaitingNext = false;
    moduleComplete = false;
    checkpoints = [];
    currentCheckpointIndex = 0;

    hideElement('training-checkpoint');
    setVideoVisible(true);

    const button = $('training-complete-button');

    if (button) {
      button.classList.remove('hidden');
      button.disabled = true;
      button.textContent = 'WATCH VIDEO TO CONTINUE';
    }

    setText(
      'training-module-number',
      `MODULE ${index + 1} / ${MODULES.length}`
    );

    setText('training-module-title', currentModule.title);
    setText('training-module-description', currentModule.description);
    setText('training-transcript', currentModule.learningPoints);

    updateModuleProgress();
    clearCheckpointFeedback();

    try {
      showStatus(
        `Loading module ${index + 1} of ${MODULES.length}...`,
        'info'
      );

      await createPlayer(currentModule);

      showStatus(
        'Watch the complete training video. The checkpoint will unlock when playback finishes.',
        'info'
      );

    } catch (error) {
      showStatus(error.message, 'error');

      if (button) {
        button.disabled = true;
        button.textContent = 'VIDEO UNAVAILABLE';
      }
    }
  }

  async function nextModule() {
    if (moduleComplete !== true || !checkpointCompleted) {
      showStatus(
        'Complete the video and both checkpoint questions before proceeding.',
        'warning'
      );
      return;
    }

    if (currentModuleIndex < MODULES.length - 1) {
      await openModule(currentModuleIndex + 1);
      return;
    }

    await App.continueToMissions();
  }

  function bindEvents() {
    const videoButton = $('training-complete-button');

    if (
      videoButton &&
      !videoButton.dataset.trainingBound
    ) {
      videoButton.addEventListener('click', async () => {
        if (moduleComplete) {
          await nextModule();
          return;
        }

        if (videoEnded && !videoCompleted) {
          await handleVideoEnded();
          return;
        }

        showStatus(
          'You must watch the complete video before continuing.',
          'warning'
        );
      });

      videoButton.dataset.trainingBound = 'true';
    }

    const checkpointButton = $('training-checkpoint-continue');

    if (
      checkpointButton &&
      !checkpointButton.dataset.trainingBound
    ) {
      checkpointButton.addEventListener('click', submitCheckpoint);
      checkpointButton.dataset.trainingBound = 'true';
    }
  }

  async function initialise() {
    bindEvents();
    await openModule(0);
  }

  return {
    initialise,
    bindEvents,
    openModule,
    nextModule,

    getModules() {
      return MODULES.map(module => ({
        id: module.id,
        title: module.title
      }));
    }
  };

})();
