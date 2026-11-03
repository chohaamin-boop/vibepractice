/**
 * 작업자 3 담당 모듈: 공통 데이터 저장소 및 상태 관리 (src/store.js)
 *
 * 주요 기능:
 * 1. 투표 주제 및 득표 데이터 영속화 (localStorage 기반)
 * 2. PROJECT_PLAN.md에 정의된 공통 인터페이스 제공:
 *    - getTopics(): 전체 투표 목록 반환
 *    - getTopicById(id): 특정 투표 상세 반환
 *    - addTopic(topic): 새 투표 주제 저장
 *    - castVote(topicId, optionId, voterId): 득표수 갱신 및 투표자 기록 (중복 검증 포함)
 *    - hasUserVoted(topicId, voterId): 중복 투표 여부 확인
 * 3. 초기 샘플 데이터 세팅 및 store:updated 이벤트 발행
 */

const STORAGE_KEY = 'vibe_vote_topics';

// 초기 샘플 데이터
const INITIAL_TOPICS = [
  {
    id: 'topic_1730000001',
    title: '오늘 팀 점심 메뉴 투표',
    description: '가장 먹고 싶은 점심 메뉴 한 가지를 골라주세요! (중복 투표 불가)',
    createdAt: '2026-11-04T11:30:00',
    options: [
      { id: 'opt_1', text: '김치찌개 & 계란말이', votes: 5 },
      { id: 'opt_2', text: '수제 등심 돈까스', votes: 8 },
      { id: 'opt_3', text: '연어 초밥 세트', votes: 3 }
    ],
    voters: ['user_sample_1', 'user_sample_2']
  },
  {
    id: 'topic_1730000002',
    title: '다음 스프린트 회고 요일 선택',
    description: '팀원 모두가 참석 가능한 선호 요일에 투표해 주세요.',
    createdAt: '2026-11-04T12:00:00',
    options: [
      { id: 'opt_1', text: '목요일 오후 4시', votes: 4 },
      { id: 'opt_2', text: '금요일 오후 2시', votes: 7 },
      { id: 'opt_3', text: '금요일 오후 4시', votes: 2 }
    ],
    voters: ['user_sample_3']
  }
];

/**
 * 로컬스토리지에서 토픽 목록 조회
 * @returns {Array}
 */
export function getTopics() {
  if (typeof localStorage === 'undefined') return [...INITIAL_TOPICS];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_TOPICS));
    return [...INITIAL_TOPICS];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [...INITIAL_TOPICS];
  } catch {
    return [...INITIAL_TOPICS];
  }
}

/**
 * ID로 특정 토픽 조회
 * @param {string} topicId
 * @returns {object|null}
 */
export function getTopicById(topicId) {
  if (!topicId) return null;
  const topics = getTopics();
  return topics.find((t) => t.id === topicId) || null;
}

/**
 * 새 투표 주제 등록
 * @param {object} newTopic
 * @returns {object}
 */
export function addTopic(newTopic) {
  if (!newTopic || !newTopic.id) throw new Error('유효한 토픽 객체가 아닙니다.');
  const topics = getTopics();
  const updated = [newTopic, ...topics];

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  emitStoreUpdate('topic:added', { topic: newTopic });
  return newTopic;
}

/**
 * 투표 참여 처리 (1인 1표 중복 방지 및 득표수 1 증가)
 * @param {string} topicId
 * @param {string} optionId
 * @param {string} voterId
 * @returns {{ success: boolean, message?: string, topic?: object }}
 */
export function castVote(topicId, optionId, voterId) {
  if (!topicId || !optionId) {
    return { success: false, message: '주제 ID와 옵션 ID가 필요합니다.' };
  }

  const topics = getTopics();
  const topicIndex = topics.findIndex((t) => t.id === topicId);
  if (topicIndex === -1) {
    return { success: false, message: '해당 투표 주제를 찾을 수 없습니다.' };
  }

  const topic = topics[topicIndex];
  topic.voters = topic.voters || [];

  // 중복 검증
  if (voterId && topic.voters.includes(voterId)) {
    return { success: false, message: '이미 투표에 참여하셨습니다. (중복 투표 차단)' };
  }

  const option = (topic.options || []).find((opt) => opt.id === optionId);
  if (!option) {
    return { success: false, message: '선택한 옵션이 존재하지 않습니다.' };
  }

  // 득표수 반영
  option.votes = (Number(option.votes) || 0) + 1;
  if (voterId) {
    topic.voters.push(voterId);
  }

  topics[topicIndex] = topic;

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(topics));
  }

  emitStoreUpdate('vote:cast', { topicId, optionId, voterId, topic });
  return { success: true, topic };
}

/**
 * 특정 사용자의 투표 참여 여부 확인
 * @param {string} topicId
 * @param {string} voterId
 * @returns {boolean}
 */
export function hasUserVoted(topicId, voterId) {
  if (!topicId || !voterId) return false;
  const topic = getTopicById(topicId);
  if (!topic || !Array.isArray(topic.voters)) return false;
  return topic.voters.includes(voterId);
}

/**
 * 상태 변경 시 전역 커스텀 이벤트 발행
 * @param {string} action
 * @param {object} detail
 */
function emitStoreUpdate(action, detail) {
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('store:updated', {
        detail: { action, ...detail }
      })
    );
  }
}

// 브라우저 전역 VibeStore 객체 등록 (작업자 1, 2 모듈과의 자동 연동 지원)
if (typeof window !== 'undefined') {
  window.VibeStore = {
    getTopics,
    getTopicById,
    addTopic,
    castVote,
    hasUserVoted
  };
  window.store = window.VibeStore;
}

