/**
 * 작업자 3 담당 모듈: 공통 데이터 저장소 및 실시간 서버 동기화 (src/store.js)
 *
 * 주요 기능:
 * 1. Vercel Serverless API (`/api/topics`)와 실시간 양방향 동기화 (모든 사용자 데이터 공유)
 * 2. 네트워크 오프라인 또는 로컬 단독 실행 시 `localStorage` 자동 Fallback 지원
 * 3. PROJECT_PLAN.md에 정의된 공통 인터페이스 제공:
 *    - getTopics(): 전체 투표 목록 반환
 *    - getTopicById(id): 특정 투표 상세 반환
 *    - addTopic(topic): 새 투표 주제 저장 및 서버 전송
 *    - castVote(topicId, optionId, voterId): 득표수 갱신 및 서버 측 중복 검증/반영
 *    - hasUserVoted(topicId, voterId): 중복 투표 여부 확인
 *    - syncFromServer(): 원격 서버 최신 데이터 동기화
 */

const STORAGE_KEY = 'vibe_vote_topics';
const API_ENDPOINT = '/api/topics';
const POLL_INTERVAL_MS = 4000;

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

let memoryCache = null;
let isSyncing = false;

/**
 * 로컬 캐시(메모리 + localStorage)에 토픽 목록 저장
 * @param {Array} topics
 */
function saveLocalCache(topics) {
  if (!Array.isArray(topics)) return;
  memoryCache = topics;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(topics));
    } catch (e) {
      console.error('로컬 캐시 저장 실패:', e);
    }
  }
}

/**
 * 전체 토픽 목록 조회 (동기 반환 + 백그라운드 최신화)
 * @returns {Array}
 */
export function getTopics() {
  if (Array.isArray(memoryCache)) {
    return memoryCache;
  }
  if (typeof localStorage === 'undefined') {
    memoryCache = [...INITIAL_TOPICS];
    return memoryCache;
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    saveLocalCache(INITIAL_TOPICS);
    return [...INITIAL_TOPICS];
  }
  try {
    const parsed = JSON.parse(raw);
    memoryCache = Array.isArray(parsed) ? parsed : [...INITIAL_TOPICS];
    return memoryCache;
  } catch {
    memoryCache = [...INITIAL_TOPICS];
    return memoryCache;
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
 * 원격 공유 서버(`/api/topics`)에서 최신 투표 목록을 가져와 동기화
 * 데이터가 실제로 변경된 경우에만 `store:updated` 이벤트를 발생시켜 화면 깜빡임을 방지합니다.
 */
export async function syncFromServer() {
  if (typeof fetch === 'undefined' || isSyncing) return null;
  isSyncing = true;
  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    if (!response.ok) return null;

    const data = await response.json();
    if (data && data.ok && Array.isArray(data.topics)) {
      const currentSnapshot = JSON.stringify(getTopics());
      const nextSnapshot = JSON.stringify(data.topics);
      if (currentSnapshot !== nextSnapshot) {
        saveLocalCache(data.topics);
        emitStoreUpdate('server:synced', {
          topics: data.topics,
          storageType: data.storageType
        });
      }
      return data.topics;
    }
  } catch {
    // 로컬 정적 서버(python http.server 등)에서는 API가 없으므로 조용히 localStorage 모드 유지
  } finally {
    isSyncing = false;
  }
  return null;
}

/**
 * 새 투표 주제 등록 (즉시 낙관적 업데이트 + 공유 서버 전송)
 * @param {object} newTopic
 * @returns {object}
 */
export function addTopic(newTopic) {
  if (!newTopic || !newTopic.id) throw new Error('유효한 토픽 객체가 아닙니다.');
  const topics = getTopics();
  const updated = [newTopic, ...topics.filter((t) => t.id !== newTopic.id)];

  saveLocalCache(updated);
  emitStoreUpdate('topic:added', { topic: newTopic });

  // 비동기로 공유 서버에 반영
  if (typeof fetch !== 'undefined') {
    fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addTopic', topic: newTopic })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data && data.ok && Array.isArray(data.topics)) {
          saveLocalCache(data.topics);
          emitStoreUpdate('server:synced', { topics: data.topics });
        }
      })
      .catch((err) => {
        console.error('공유 서버에 새 투표 주제 저장 중 오류(로컬 캐시 유지):', err);
      });
  }

  return newTopic;
}

/**
 * 투표 참여 처리 (1인 1표 중복 방지 + 즉시 반영 + 공유 서버 동기화)
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

  // 득표수 반영 (낙관적 업데이트)
  option.votes = (Number(option.votes) || 0) + 1;
  if (voterId) {
    topic.voters.push(voterId);
  }

  topics[topicIndex] = topic;
  saveLocalCache(topics);
  emitStoreUpdate('vote:cast', { topicId, optionId, voterId, topic });

  // 비동기로 공유 서버에 투표 반영
  if (typeof fetch !== 'undefined') {
    fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'castVote',
        topicId,
        optionId,
        voterId
      })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data.topics)) {
          saveLocalCache(data.topics);
          emitStoreUpdate('server:synced', {
            topics: data.topics,
            topic: data.topic
          });
        }
      })
      .catch((err) => {
        console.error('공유 서버에 투표 반영 중 오류(로컬 캐시 유지):', err);
      });
  }

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

// 브라우저 전역 VibeStore 객체 등록 및 자동 서버 동기화 시작
if (typeof window !== 'undefined') {
  window.VibeStore = {
    getTopics,
    getTopicById,
    addTopic,
    castVote,
    hasUserVoted,
    syncFromServer
  };
  window.store = window.VibeStore;

  // 초기 서버 동기화 및 주기적 실시간 폴링 (다른 사용자의 투표 실시간 반영)
  syncFromServer();
  setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }
    syncFromServer();
  }, POLL_INTERVAL_MS);
}
