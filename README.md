# Vibe Practice Project

이 저장소는 프로젝트의 원활한 협업과 체계적인 개발을 위한 공간입니다.  
프로젝트를 시작하기에 앞서 아래의 **기본 규칙**, **진행 방식**, **작업 분배 가이드**를 숙지해 주세요.

- **배포 주소 (Vercel)**: https://vibepractice-q3xo.vercel.app

---

## 1. 프로젝트 기본 규칙 (Ground Rules)

### 브랜치 전략 (Git Branch Strategy)
- `main`: 배포 가능한 안정적인 상태의 기본 브랜치입니다. 직접 커밋(Push)하지 않고 PR(Pull Request)을 통해 병합합니다.
- `feat/<기능명>`: 새로운 기능 개발 시 생성합니다. (예: `feat/login`, `feat/main-ui`)
- `fix/<버그명>`: 버그 수정 시 생성합니다. (예: `fix/header-layout`)
- `docs/<문서명>`: 문서 추가 및 수정 시 생성합니다. (예: `docs/readme`)

### 커밋 메시지 규칙 (Commit Convention)
커밋 메시지는 변경 사항을 한눈에 파악할 수 있도록 아래 접두사를 사용합니다.
- `feat:` 새로운 기능 추가
- `fix:` 버그 수정
- `docs:` 문서 수정 (`README.md` 등)
- `style:` 코드 포맷팅, 세미콜론 누락 등 기능 변경이 없는 수정
- `refactor:` 코드 리팩토링
- `chore:` 빌드 업무, 패키지 매니저 설정 등 기타 작업

> **예시**: `feat: 로그인 폼 유효성 검사 추가`

### 코드 및 협업 규칙
1. 작업 시작 전 항상 최신 `main` 브랜치를 `git pull` 받습니다.
2. 하나의 작업(PR)은 가능한 작은 단위로 나누어 올립니다.
3. 서로의 코드를 존중하며 건설적인 피드백을 나눕니다.

---

## 2. 프로젝트 진행 방식 (Workflow)

프로젝트는 다음 5단계 사이클로 진행됩니다.

1. **기획 및 요구사항 정의 (Planning)**
   - 구현할 핵심 기능 목록(백로그)을 정의하고 우선순위를 정합니다.
2. **이슈 등록 및 작업 할당 (Issue & Assign)**
   - 해야 할 작업을 GitHub Issues 또는 작업 보드에 등록하고 담당자를 지정합니다.
3. **브랜치 생성 및 개발 (Development)**
   - 할당된 작업에 맞는 브랜치(`feat/...`)를 생성하여 기능을 구현합니다.
4. **코드 리뷰 및 병합 (Review & Merge)**
   - 작업이 완료되면 Pull Request(PR)를 생성하고, 확인 후 `main` 브랜치에 병합(Merge)합니다.
5. **회고 및 피드백 (Retrospective)**
   - 주기적으로 진행 상황을 점검하고 막히는 부분이나 개선점을 공유합니다.

---

## 3. 작업 분배 및 역할 관리 (Work Allocation)

효율적인 진행을 위해 영역별로 역할을 나누고 진행 상태를 추적합니다.

### 3인 역할 및 담당 모듈 구분
| 구분 | 주요 담당 업무 | 작업 브랜치 | 담당 파일 |
| :--- | :--- | :--- | :--- |
| **작업자 1** | 투표 주제 생성 폼, 선택지 동적 추가, 투표 목록 조회 UI | `feat/topic-manager` | `src/topic.js`, `styles/topic.css` |
| **작업자 2** | 투표 참여 처리, **중복 투표 방지(1인 1표 검증)** 및 버튼 잠금 | `feat/vote-system` | `src/vote.js`, `styles/vote.css` |
| **작업자 3** | 공통 데이터 저장소(`store`), 득표율 계산 및 실시간 결과 그래프 시각화 | `feat/result-and-store` | `src/store.js`, `src/result.js`, `styles/result.css` |

### 현재 작업 현황판 (Task Board)
작업이 정해지면 아래 체크리스트에 추가하여 진행 상황을 공유합니다.
- [x] 프로젝트 저장소 생성 및 초기 규칙 문서화
- [x] 프로젝트 주제(중복 방지 투표 사이트) 및 3인 작업 분배 계획 확정
- [x] 공통 폴더 구조 및 초기 베이스 코드 세팅 (`index.html`, `src/`, `styles/`)
- [x] 작업자 1: 투표 주제 생성 및 목록 기능 구현 (`feat/topic-manager`)
- [x] 작업자 2: 투표 진행 및 중복 투표 방지 구현 (`feat/vote-system`)
- [x] 작업자 3: 공통 스토어 및 결과 그래프 시각화 구현 (`feat/result-and-store`)
- [x] Vercel 클라우드 배포 및 공유 데이터베이스 API (`/api/topics`) 연동 (`feat/shared-database`)

---

## 4. 관련 문서
- [PROJECT_PLAN.md](./PROJECT_PLAN.md): **투표 사이트 구축 구체적 계획 및 3인 작업 분배 명세서**
- [PROJECT_GUIDE.md](./PROJECT_GUIDE.md): 상세 협업 가이드라인 및 작업 분배 템플릿
- [AGENTS.md](./AGENTS.md): AI 에이전트에게 효과적으로 지시하고 협업하기 위한 자동 로드 규칙 문서
