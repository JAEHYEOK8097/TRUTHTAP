# Truth Tap - 기사 신뢰도 평가 시스템

기사 URL을 입력하면 AI가 신뢰도 점수를 평가하고 가짜 기사 유형을 판별하는 웹 애플리케이션입니다.

## 주요 기능

- **기사 URL 입력**: 뉴스 기사 URL을 입력하면 자동으로 내용을 추출합니다
- **신뢰도 평가**: OpenAI GPT를 사용하여 기사의 신뢰도를 0-100점으로 평가합니다
- **가짜 기사 유형 판별**: 신뢰도가 70점 미만인 경우 4가지 가짜 기사 유형 중 하나를 판별합니다
  - 1번: 허위 사실 포함 기사
  - 2번: 과장된 제목 기사
  - 3번: 조작된 이미지 포함 기사
  - 4번: 광고성 기사

## 사용 방법

### 프론트엔드만 사용하는 경우

1. `main.html` 파일을 브라우저에서 엽니다
2. OpenAI API Key를 입력하고 저장합니다
3. 기사 URL을 입력하거나 기사 내용을 직접 입력합니다
4. "신뢰도 평가" 버튼을 클릭합니다

**주의**: CORS 정책으로 인해 일부 웹사이트에서는 기사 내용을 자동으로 추출할 수 없을 수 있습니다. 이 경우 "기사 내용 직접 입력" 옵션을 사용하세요.

### 백엔드 서버를 사용하는 경우 (권장)

백엔드 서버를 사용하면 CORS 문제 없이 모든 웹사이트의 기사 내용을 추출할 수 있습니다.

#### 설치

```bash
npm install
```

#### 환경 변수 설정

```bash
export OPENAI_API_KEY="your-api-key-here"
```

또는 `.env` 파일을 생성하여:

```
OPENAI_API_KEY=your-api-key-here
```

#### 서버 실행

```bash
npm start
```

서버가 `http://localhost:3000`에서 실행됩니다.

#### 프론트엔드에서 백엔드 사용

`main.html`의 `checkCredibility()` 함수에서 백엔드 서버 URL을 사용하도록 수정하세요:

```javascript
const response = await fetch('http://localhost:3000/api/check-credibility', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: urlInput }),
});
```

## 기술 스택

- **프론트엔드**: HTML, CSS, JavaScript
- **백엔드**: Node.js, Express
- **AI**: OpenAI GPT-4o-mini
- **웹 스크래핑**: Cheerio (백엔드), CORS 프록시 (프론트엔드)

## 프롬프트 엔지니어링

시스템은 다음과 같은 프롬프트를 사용하여 신뢰도를 평가합니다:

1. **판단 근거 생성**: 기사 내용에서 신뢰 가능/불가 근거를 찾습니다
2. **점수 계산**: 긍정 키워드(+20점), 부정 키워드(-20점)를 기반으로 0-100점을 계산합니다
3. **가짜 기사 유형 판별**: 70점 미만인 경우 4가지 유형 중 하나를 판별합니다

## API 엔드포인트 (백엔드)

### POST /api/check-credibility
URL을 받아서 기사 내용을 추출하고 신뢰도를 평가합니다.

**Request:**
```json
{
  "url": "https://example.com/article"
}
```

**Response:**
```json
{
  "credibilityScore": 85,
  "fakeArticleType": "유형 없음",
  "fullResponse": "기사의 신뢰도 : 85 %\n가짜 기사 유형 : 유형 없음",
  "articleContent": "기사 내용 미리보기..."
}
```

## 라이선스

MIT

