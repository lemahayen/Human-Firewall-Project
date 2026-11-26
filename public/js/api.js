
/*
 * HUMAN FIREWALL
 * API communication layer
 *
 * Handles communication between the frontend and backend.
 * Protected requests use the pseudonymous session token.
 */

'use strict';

const API = (() => {
  const BASE_URL = '/api/v2';

  const TOKEN_KEY = 'hf_session_token';
  const CODE_KEY = 'hf_participant_code';

  // =========================================================
  // SESSION MANAGEMENT
  // =========================================================

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function getParticipantCode() {
    return sessionStorage.getItem(CODE_KEY);
  }

  function saveSession(data) {
    if (
      !data ||
      typeof data.sessionToken !== 'string' ||
      typeof data.participantCode !== 'string'
    ) {
      throw new Error('The server returned incomplete session information.');
    }

    sessionStorage.setItem(TOKEN_KEY, data.sessionToken);
    sessionStorage.setItem(CODE_KEY, data.participantCode);
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(CODE_KEY);
  }

  // =========================================================
  // HTTP REQUEST HANDLING
  // =========================================================

  async function request(url, options = {}, authenticated = true) {
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (authenticated) {
      const token = getToken();

      if (!token) {
        throw new Error(
          'Your session has expired. Please register again.'
        );
      }

      headers.Authorization = `Bearer ${token}`;
    }

    let response;

    try {
      response = await fetch(url, {
        ...options,
        headers,
        cache: 'no-store'
      });
    } catch {
      throw new Error(
        'Unable to connect to the server. Check your connection and try again.'
      );
    }

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error(
        'The server returned an invalid response.'
      );
    }

    if (!response.ok) {
      if (response.status === 401) {
        clearSession();
      }

      throw new Error(
        data.error || `Request failed (${response.status}).`
      );
    }

    return data;
  }

  function post(url, body, authenticated = true) {
    return request(
      url,
      {
        method: 'POST',
        body: JSON.stringify(body)
      },
      authenticated
    );
  }

  // =========================================================
  // PUBLIC API METHODS
  // =========================================================

  return {

    // -------------------------------------------------------
    // Session
    // -------------------------------------------------------

    getToken,

    getParticipantCode,

    clearSession,

    async register(consentAccepted) {
      const data = await post(
        `${BASE_URL}/register`,
        { consentAccepted },
        false
      );

      saveSession(data);

      return data;
    },

    getSession() {
      return request(`${BASE_URL}/session`);
    },

    // -------------------------------------------------------
    // Assessments
    // -------------------------------------------------------

    startAssessment(type) {
      return post(
        `${BASE_URL}/assessments/${encodeURIComponent(type)}/start`,
        {}
      );
    },

    submitAssessment(type, attemptId, answers) {
      return post(
        `${BASE_URL}/assessments/${encodeURIComponent(type)}/submit`,
        {
          attemptId,
          answers
        }
      );
    },

    // -------------------------------------------------------
    // Training modules
    // -------------------------------------------------------

    getCheckpoints(moduleId) {
      return request(
        `${BASE_URL}/modules/${encodeURIComponent(moduleId)}/checkpoints`
      );
    },

    answerCheckpoint(moduleId, questionId, selectedOption) {
      return post(
        `${BASE_URL}/modules/${encodeURIComponent(moduleId)}/checkpoints/${encodeURIComponent(questionId)}/answer`,
        { selectedOption }
      );
    },

    completeVideo(moduleId) {
      return post(
        `${BASE_URL}/modules/${encodeURIComponent(moduleId)}/video-complete`,
        {}
      );
    },

    // -------------------------------------------------------
    // Interactive missions
    // -------------------------------------------------------

    getMissions() {
      return request(`${BASE_URL}/missions`);
    },

    submitMission(missionId, decisions) {
      return post(
        `${BASE_URL}/missions/${encodeURIComponent(missionId)}/submit`,
        { decisions }
      );
    },

    // -------------------------------------------------------
    // Participant progress
    // -------------------------------------------------------

    getProgress() {
      return request(`${BASE_URL}/progress`);
    },

    // -------------------------------------------------------
    // Leaderboard
    // -------------------------------------------------------

    getLeaderboard() {
      return request(
        '/api/leaderboard',
        {},
        false
      );
    }

  };

})();

// Make the API available to other frontend modules.
window.API = API;
