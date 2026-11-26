
/* ============================================================
   HUMAN FIREWALL
   Training module

   Modules:
   1. Password Security
   2. Phishing and Suspicious Links
   3. Safe Data Handling

   Each module requires:
   - Video completion
   - Two correctly answered checkpoint questions

   IMPORTANT:
   The backend validates checkpoint answers.
   Video completion is still a client-reported event and
   cannot independently prove that a participant watched
   the entire video.
============================================================ */

'use strict';

const Training = (() => {

  const MODULES = [
    {
      id: 'password_security',
      title: 'PASSWORD SECURITY',
      subtitle: 'Protecting access and digital identities',
      description:
        'Learn how weak, reused and compromised passwords expose organisational systems.',
      videoId: 'gJdylzi6lHw'
    },
    {
      id: 'phishing',
      title: 'PHISHING DETECTIVE',
      subtitle: 'Recognising suspicious messages and links',
      description:
        'Learn how to recognise phishing attempts, suspicious links and social engineering techniques.',
      videoId: 'Kqj3f5uAgKE'
    },
    {
      id: 'data_handling',
      title: 'SAFE DATA HANDLING',
      subtitle: 'Protecting confidential information',
      description:
        'Learn how to handle, store and share organisational information safely.',
      videoId: 'hsNRrEnB_aM'
    }
  ];

  let currentModuleIndex = 0;
  let currentModule = null;
  let checkpoints = [];
  let currentCheckpointIndex = 0;
  let videoCompleted = false;
  let checkpointCompleted = false;
  let player = null;
  let playerReady = false;
  let completionRequestSent = false;
  let initialized = false;

  function $(id) {
    return document.getElementById(id);
  }

  function showMessage(message, type = 'info') {
    const element = $('training-feedback');

    if (!element) {
      console.log(message);
      return;
    }

    element.textContent = message;
    element.className = `feedback ${type}`;
    element.classList.remove('hidden');
  }

  function clearMessage() {
    const element = $('training-feedback');

    if (!element) return;

    element.textContent = '';
    element.className = 'feedback hidden';
  }

  function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
  }

  function showElement(id) {
    const element = $(id);
    if (element) element.classList.remove('hidden');
  }

  function hideElement(id) {
    const element = $(id);
    if (element) element.classList.add('hidden');
  }

  function getModuleIndex(moduleId) {
    return MODULES.findIndex(module => module.id === moduleId);
  }

  function loadYouTubeAPI() {
    return new Promise((resolve, reject) => {

      if (window.YT && window.YT.Player) {
        resolve();
        return;
      }

      if (window.youtubeApiPromise) {
        window.youtubeApiPromise.then(resolve).catch(reject);
        return;
      }

      window.youtubeApiPromise = new Promise((apiResolve, apiReject) => {

        const previousCallback = window.onYouTubeIframeAPIReady;

        window.onYouTubeIframeAPIReady = () => {
          if (typeof previousCallback === 'function') {
            previousCallback();
          }

          if (window.YT && window.YT.Player) {
            apiResolve();
          } else {
            apiReject(new Error('YouTube player API failed to initialise.'));
          }
        };

        const existingScript = document.querySelector(
          'script[src="https://www.youtube.com/iframe_api"]'
        );

        if (!existingScript) {
          const script = document.createElement('script');
          script.src = 'https://www.youtube.com/iframe_api';
          script.async = true;
          script.onerror = () => {
            apiReject(new Error('Unable to load the YouTube player API.'));
          };

          document.head.appendChild(script);
        }

      });

      window.youtubeApiPromise.then(resolve).catch(reject);
    });
  }

  async function createPlayer(module) {
    const container = $('training-video');

    if (!container) {
      throw new Error('The training video container is missing.');
    }

    if (player && typeof player.destroy === 'function') {
      try {
        player.destroy();
      } catch (error) {
        console.warn('Unable to destroy previous player:', error);
      }
    }

    player = null;
    playerReady = false;
    completionRequestSent = false;

    container.innerHTML = '<div id="youtube-player"></div>';

    await loadYouTubeAPI();

    return new Promise((resolve, reject) => {

      try {
        player = new YT.Player('youtube-player', {
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
              playerReady = true;
              resolve();
            },

            onStateChange: event => {
              if (
                event.data === YT.PlayerState.ENDED &&
                !completionRequestSent
              ) {
                handleVideoEnded();
              }
            },

            onError: event => {
              showMessage(
                `The training video could not be played. YouTube error: ${event.data}.`,
                'error'
              );
              reject(
                new Error(`YouTube player error ${event.data}.`)
              );
            }
          }
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  async function handleVideoEnded() {
    if (completionRequestSent || !currentModule) return;

    completionRequestSent = true;

    try {
      showMessage(
        'Video completed. Recording your training progress...',
        'info'
      );

      await API.completeVideo(currentModule.id);

      videoCompleted = true;

      showMessage(
        'Video completion recorded. You can now attempt the checkpoint questions.',
        'success'
      );

      await loadCheckpoints();

    } catch (error) {
      completionRequestSent = false;

      showMessage(
        `${error.message} Please try recording completion again.`,
        'error'
      );
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
        throw new Error('The server did not return the expected two checkpoint questions.');
      }

      checkpoints = response.questions;
      currentCheckpointIndex = 0;

      hideElement('training-video-section');
      showElement('training-checkpoint-section');

      renderCheckpoint();

    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  function renderCheckpoint() {
    const container = $('training-checkpoint');

    if (!container) {
      showMessage('The checkpoint question container is missing.', 'error');
      return;
    }

    if (currentCheckpointIndex >= checkpoints.length) {
      finishModule();
      return;
    }

    const question = checkpoints[currentCheckpointIndex];

    if (
      !question ||
      !question.questionId ||
      !Array.isArray(question.options)
    ) {
      showMessage('Invalid checkpoint question received from the server.', 'error');
      return;
    }

    container.replaceChildren();

    const heading = document.createElement('h3');
    heading.textContent =
      `CHECKPOINT ${currentCheckpointIndex + 1} OF ${checkpoints.length}`;

    const prompt = document.createElement('p');
    prompt.className = 'question-prompt';
    prompt.textContent = question.prompt;

    const options = document.createElement('div');
    options.className = 'options-list';

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
      options.appendChild(label);
    });

    const submitButton = document.createElement('button');
    submitButton.type = 'button';
    submitButton.className = 'btn btn-primary';
    submitButton.textContent = 'SUBMIT ANSWER';
    submitButton.addEventListener('click', submitCheckpoint);

    container.append(
      heading,
      prompt,
      options,
      submitButton
    );

    setText(
      'training-checkpoint-progress',
      `Question ${currentCheckpointIndex + 1} of ${checkpoints.length}`
    );

    clearMessage();
  }

  async function submitCheckpoint() {
    if (submittingCheckpoint) return;

    const question = checkpoints[currentCheckpointIndex];

    if (!question) return;

    const selected = document.querySelector(
      'input[name="training-checkpoint-answer"]:checked'
    );

    if (!selected) {
      showMessage('Select an answer before continuing.', 'warning');
      return;
    }

    submittingCheckpoint = true;

    const buttons = $('training-checkpoint')?.querySelectorAll('button');

    buttons?.forEach(button => {
      button.disabled = true;
    });

    try {
      const result = await API.answerCheckpoint(
        currentModule.id,
        question.questionId,
        selected.value
      );

      if (result.correct) {

        showMessage(
          `Correct. ${result.explanation || 'Well done.'}`,
          'success'
        );

        currentCheckpointIndex++;

        if (result.checkpointCompleted) {
          checkpointCompleted = true;

          setTimeout(() => {
            finishModule();
          }, 1200);

        } else {
          setTimeout(() => {
            renderCheckpoint();
          }, 1200);
        }

      } else {

        showMessage(
          `Incorrect. ${result.explanation || 'Review the training material and try again.'}`,
          'error'
        );

        // The participant remains on the same question.
        // The backend determines whether the answer is correct.
        setTimeout(() => {
          const container = $('training-checkpoint');

          if (container) {
            container.querySelectorAll('button').forEach(button => {
              button.disabled = false;
            });
          }
        }, 300);
      }

    } catch (error) {

      showMessage(error.message, 'error');

      const container = $('training-checkpoint');

      if (container) {
        container.querySelectorAll('button').forEach(button => {
          button.disabled = false;
        });
      }

    } finally {
      submittingCheckpoint = false;
    }
  }

  // Prevent multiple simultaneous checkpoint submissions.
  let submittingCheckpoint = false;

  function finishModule() {
    if (!currentModule || !checkpointCompleted) return;

    hideElement('training-checkpoint-section');
    hideElement('training-video-section');
    showElement('training-module-complete');

    setText(
      'training-module-complete-title',
      `${currentModule.title} COMPLETE`
    );

    setText(
      'training-module-complete-message',
      'Both checkpoint questions have been answered correctly. Your training progress has been recorded.'
    );

    const nextButton = $('training-next-module');

    if (nextButton) {
      const isLastModule =
        currentModuleIndex === MODULES.length - 1;

      nextButton.textContent = isLastModule
        ? 'CONTINUE TO MISSIONS'
        : 'NEXT TRAINING MODULE';

      nextButton.disabled = false;
    }

    if (typeof App.addGameXP === 'function') {
      App.addGameXP(100);
    }
  }

  async function openModule(index) {
    if (index < 0 || index >= MODULES.length) return;

    currentModuleIndex = index;
    currentModule = MODULES[index];

    videoCompleted = false;
    checkpointCompleted = false;
    checkpoints = [];
    currentCheckpointIndex = 0;
    completionRequestSent = false;

    clearMessage();

    hideElement('training-module-complete');
    hideElement('training-checkpoint-section');
    showElement('training-video-section');

    setText('training-module-title', currentModule.title);
    setText('training-module-subtitle', currentModule.subtitle);
    setText('training-module-description', currentModule.description);
    setText(
      'training-module-progress',
      `MODULE ${index + 1} OF ${MODULES.length}`
    );

    try {
      showMessage('Loading training video...', 'info');
      await createPlayer(currentModule);
      clearMessage();

    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  async function nextModule() {
    if (!checkpointCompleted) {
      showMessage(
        'Complete both checkpoint questions before proceeding.',
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

  async function initialise() {
    if (initialized) {
      initialized = false;
    }

    const nextButton = $('training-next-module');

    if (nextButton) {
      nextButton.replaceWith(nextButton.cloneNode(true));
    }

    const refreshedNextButton = $('training-next-module');

    if (refreshedNextButton) {
      refreshedNextButton.addEventListener('click', nextModule);
    }

    initialized = true;

    await openModule(0);
  }

  function bindEvents() {
    const nextButton = $('training-next-module');

    if (nextButton) {
      nextButton.addEventListener('click', nextModule);
    }
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
