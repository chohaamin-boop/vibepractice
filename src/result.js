/**
 * 작업자 3 담당 모듈: 실시간 결과 시각화 (src/result.js)
 *
 * 주요 기능:
 * 1. 선택된 투표 주제의 선택지별 실시간 득표수 및 득표율(%) 계산
 * 2. 1위(최다 득표) 항목 하이라이트 배지 및 트로피 아이콘 표시
 * 3. 직관적인 애니메이션 프로그레스 바(막대그래프) 렌더링
 * 4. 총 투표 참여자 수 및 참여 현황 안내
 * 5. 작업자 1(토픽 선택) 및 작업자 2(투표 제출) 이벤트에 반응하여 자동 갱신
 */

import { getTopicById, getTopics } from './store.js';

/**
 * 내부 상태 관리
 */
const state = {
  currentTopicId: null
};

/**
 * HTML 특수문자 이스케이프
 */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 주제의 총 득표수 합산
 * @param {object} topic
 * @returns {number}
 */
export function calculateTotalVotes(topic) {
  if (!topic || !Array.isArray(topic.options)) return 0;
  return topic.options.reduce((sum, opt) => sum + (Number(opt.votes) || 0), 0);
}

/**
 * 옵션별 득표율(%) 및 최다 득표 여부 계산
 * @param {object} topic
 * @returns {Array<{ id: string, text: string, votes: number, percentage: number, isWinner: boolean }>}
 */
export function getProcessedResults(topic) {
  if (!topic || !Array.isArray(topic.options)) return [];

  const totalVotes = calculateTotalVotes(topic);
  let maxVotes = 0;

  topic.options.forEach((opt) => {
    const v = Number(opt.votes) || 0;
    if (v > maxVotes) maxVotes = v;
  });

  return topic.options.map((opt) => {
    const votes = Number(opt.votes) || 0;
    const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
    const isWinner = totalVotes > 0 && votes === maxVotes && maxVotes > 0;

    return {
      id: opt.id,
      text: opt.text,
      votes,
      percentage,
      isWinner
    };
  });
}

/**
 * 결과 섹션 UI 렌더링
 * @param {HTMLElement} container
 */
export function renderResultSection(container) {
  if (!container) return;

  const topicId = state.currentTopicId;
  const topic = topicId ? getTopicById(topicId) : (getTopics()[0] || null);

  if (!topic) {
    container.innerHTML = `
      <div class="result-container">
        <div class="result-empty-state">
          <p class="result-empty-text">투표 결과가 여기에 실시간으로 표시됩니다.</p>
        </div>
      </div>
    `;
    return;
  }

  const totalVotes = calculateTotalVotes(topic);
  const results = getProcessedResults(topic);

  const barsHtml = results
    .map((item) => {
      return `
        <div class="result-item ${item.isWinner ? 'is-winner' : ''}">
          <div class="result-item-header">
            <span class="result-item-title">
              ${escapeHtml(item.text)}
              ${item.isWinner ? '<span class="result-winner-badge">🏆 1위</span>' : ''}
            </span>
            <span class="result-item-stats">
              <strong>${item.votes}표</strong> (${item.percentage}%)
            </span>
          </div>
          <div class="result-progress-track">
            <div
              class="result-progress-fill ${item.isWinner ? 'is-winner-fill' : ''}"
              style="width: ${item.percentage}%;"
              aria-valuenow="${item.percentage}"
              aria-valuemin="0"
              aria-valuemax="100"
            ></div>
          </div>
        </div>
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="result-container">
      <div class="result-header">
        <div class="result-header-meta">
          <span class="result-tag">실시간 투표 결과</span>
          <span class="result-total-count">총 <strong>${totalVotes}</strong>표 집계</span>
        </div>
        <h3 class="result-title">${escapeHtml(topic.title)}</h3>
      </div>

      <div class="result-list">
        ${barsHtml}
      </div>

      <div class="result-footer">
        <span class="result-live-indicator"><span class="result-pulse-dot"></span>실시간 자동 업데이트 중</span>
      </div>
    </div>
  `;
}

/**
 * 결과 시각화 모듈 초기화
 * @param {object} options
 */
export function initResultSection(options = {}) {
  const { container = '#result-section' } = options;

  if (typeof document === 'undefined') return null;

  const targetEl = typeof container === 'string'
    ? document.querySelector(container)
    : container;

  if (!targetEl) return null;

  // 작업자 1(토픽 선택) 이벤트 수신
  if (typeof window !== 'undefined') {
    window.addEventListener('topic:selected', (e) => {
      const topicId = e.detail?.topicId || e.detail?.topic?.id;
      if (topicId) {
        state.currentTopicId = topicId;
        renderResultSection(targetEl);
      }
    });

    // 작업자 2(투표 완료) 및 작업자 3(스토어 갱신) 이벤트 수신
    window.addEventListener('vote:submitted', (e) => {
      if (e.detail?.topicId) {
        state.currentTopicId = e.detail.topicId;
      }
      renderResultSection(targetEl);
    });

    window.addEventListener('store:updated', () => {
      renderResultSection(targetEl);
    });
  }

  // 초기 렌더링
  renderResultSection(targetEl);

  return {
    setTopicId: (id) => {
      state.currentTopicId = id;
      renderResultSection(targetEl);
    },
    refresh: () => renderResultSection(targetEl)
  };
}

// 브라우저 전역 등록
if (typeof window !== 'undefined') {
  window.ResultSystem = {
    initResultSection,
    renderResultSection,
    calculateTotalVotes,
    getProcessedResults
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      const defaultContainer = document.querySelector('#result-section');
      if (defaultContainer && !defaultContainer.hasChildNodes()) {
        initResultSection({ container: defaultContainer });
      }
    });
  }
}

