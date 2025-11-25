// 백엔드 서버 예제 (Node.js + Express)
// 이 서버를 사용하면 CORS 문제 없이 기사 내용을 추출할 수 있습니다.

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const OpenAI = require('openai');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// 정적 파일 서빙 (public 폴더)
app.use(express.static('public'));

// URL 기반 캐싱을 위한 Map (메모리 기반)
const credibilityCache = new Map();

// OpenAI 클라이언트 초기화 (환경 변수에서 API 키 가져오기)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "My_OpenAI_API_Key"
});

// 기사 내용 추출 엔드포인트
app.post('/api/extract-article', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL이 필요합니다.' });
    }

    // 웹 페이지 가져오기
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    
    // 기사 본문 추출
    const articleSelectors = [
      'article',
      '.article-body',
      '.article-content',
      '.post-content',
      '#article-body',
      'main article',
      '.news-body',
      '.content',
      '.article-text',
      '.entry-content',
      '.post-body'
    ];

    let articleText = '';
    for (const selector of articleSelectors) {
      const element = $(selector).first();
      if (element.length) {
        articleText = element.text().trim();
        if (articleText.length > 100) break;
      }
    }

    // 선택자가 작동하지 않으면 body 전체 텍스트 사용
    if (!articleText || articleText.length < 100) {
      $('script, style, nav, header, footer, aside').remove();
      articleText = $('body').text().trim();
    }

    // 텍스트 정리
    articleText = articleText.replace(/\s+/g, ' ').replace(/\n+/g, ' ');
    if (articleText.length > 5000) {
      articleText = articleText.substring(0, 5000) + '...';
    }

    res.json({ content: articleText });
  } catch (error) {
    console.error('Error extracting article:', error);
    res.status(500).json({ error: '기사 내용을 추출할 수 없습니다.' });
  }
});

// 신뢰도 평가 엔드포인트
app.post('/api/evaluate-credibility', async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: '기사 내용이 필요합니다.' });
    }

    const prompt = `너는 기사 내용을 신중히 분석해서 다음과 같은 순서로 판단을 내려야하는 fact checker야.
절대 추측하지 말고, 반드시 기사 내용에 기반해서 판단해라.

1️⃣ 먼저 아래 기준을 따라 **판단 근거 문장을 내부적으로 생성한다** (최종 출력은 하지 말고 네 내부에서 생각만 해라):
   - 기사 내용에 '신뢰할 수 있다', '출처 명확', '팩트 기반', '공식 기관 인용' 같은 표현이 있으면 신뢰 가능 근거로 생각하라.
   - 기사 내용에 '불확실', '출처 없음', '충격적인', '믿기지 않는', '광고 링크 포함' 같은 표현이 있으면 신뢰 불가 근거로 생각하라.

2️⃣ 그 다음 아래 점수 기준에 따라 **신뢰도 점수(0~100점)**를 계산하라:
   - 긍정 키워드 하나당 +20점
   - 부정 키워드 하나당 -20점
   - 점수는 0점 미만일 경우 0점, 100점 초과일 경우 100점으로 고정하라.

3️⃣ 신뢰도 점수가 70점 미만일 경우, 아래 4가지 가짜 기사 유형 중 하나를 **판단 근거 문장**에 근거하여 판단하라:
   - 1번: 허위 사실 포함 기사
   - 2번: 과장된 제목 기사
   - 3번: 조작된 이미지 포함 기사
   - 4번: 광고성 기사
   - 신뢰도 70점 이상일 경우, '유형 없음'으로 출력하라.

🎯 최종 출력 형식은 반드시 아래처럼 작성하라:
기사의 신뢰도 : ? %
가짜 기사 유형 : ?번 (또는 유형 없음)

기사 내용:
${content}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a fact-checker that analyzes news articles for credibility. Always respond in Korean.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0, // 일관성을 위해 0으로 설정
      max_tokens: 500
    });

    const llmResponse = completion.choices[0].message.content;
    
    // 응답 파싱
    const scoreMatch = llmResponse.match(/기사의 신뢰도\s*:\s*(\d+)\s*%/);
    const typeMatch = llmResponse.match(/가짜 기사 유형\s*:\s*(\d+번|유형 없음)/);
    
    const credibilityScore = scoreMatch ? parseInt(scoreMatch[1]) : 0;
    const fakeArticleType = typeMatch ? typeMatch[1] : '유형 없음';

    res.json({
      credibilityScore,
      fakeArticleType,
      fullResponse: llmResponse
    });
  } catch (error) {
    console.error('Error evaluating credibility:', error);
    res.status(500).json({ error: '신뢰도 평가 중 오류가 발생했습니다.' });
  }
});

// 통합 엔드포인트 (URL을 받아서 추출 + 평가를 한번에)
app.post('/api/check-credibility', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL이 필요합니다.' });
    }

    // 캐시 확인 - 같은 URL에 대해서는 캐시된 결과 반환
    const cacheKey = url.trim().toLowerCase();
    if (credibilityCache.has(cacheKey)) {
      console.log('캐시된 결과 반환:', cacheKey);
      return res.json(credibilityCache.get(cacheKey));
    }

    // 1. 기사 내용 추출
    const extractResponse = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(extractResponse.data);
    
    const articleSelectors = [
      'article',
      '.article-body',
      '.article-content',
      '.post-content',
      '#article-body',
      'main article',
      '.news-body',
      '.content',
      '.article-text',
      '.entry-content',
      '.post-body'
    ];

    let articleText = '';
    for (const selector of articleSelectors) {
      const element = $(selector).first();
      if (element.length) {
        articleText = element.text().trim();
        if (articleText.length > 100) break;
      }
    }

    if (!articleText || articleText.length < 100) {
      $('script, style, nav, header, footer, aside').remove();
      articleText = $('body').text().trim();
    }

    articleText = articleText.replace(/\s+/g, ' ').replace(/\n+/g, ' ');
    if (articleText.length > 5000) {
      articleText = articleText.substring(0, 5000) + '...';
    }

    if (!articleText || articleText.length < 50) {
      return res.status(400).json({ error: '기사 본문을 찾을 수 없습니다.' });
    }

    // 2. 신뢰도 평가
    const prompt = `너는 기사 내용을 신중히 분석해서 다음과 같은 순서로 판단을 내려야하는 fact checker야.
절대 추측하지 말고, 반드시 기사 내용에 기반해서 판단해라.

1️⃣ 먼저 아래 기준을 따라 **판단 근거 문장을 내부적으로 생성한다** (최종 출력은 하지 말고 네 내부에서 생각만 해라):
   - 기사 내용에 '신뢰할 수 있다', '출처 명확', '팩트 기반', '공식 기관 인용' 같은 표현이 있으면 신뢰 가능 근거로 생각하라.
   - 기사 내용에 '불확실', '출처 없음', '충격적인', '믿기지 않는', '광고 링크 포함' 같은 표현이 있으면 신뢰 불가 근거로 생각하라.

2️⃣ 그 다음 아래 점수 기준에 따라 **신뢰도 점수(0~100점)**를 계산하라:
   - 긍정 키워드 하나당 +20점
   - 부정 키워드 하나당 -20점
   - 점수는 0점 미만일 경우 0점, 100점 초과일 경우 100점으로 고정하라.

3️⃣ 신뢰도 점수가 70점 미만일 경우, 아래 4가지 가짜 기사 유형 중 하나를 **판단 근거 문장**에 근거하여 판단하라:
   - 허위 사실 포함 기사: 기사 내용에 검증되지 않은 사실이나 거짓 정보가 포함된 경우
   - 과장된 제목 기사: 제목이 본문 내용을 과장하거나 왜곡하여 표현한 경우
   - 조작된 이미지 포함 기사: 이미지가 조작되었거나 본문과 관련 없는 이미지를 사용한 경우
   - 광고성 기사: 명확한 광고 목적이 있거나 상업적 이익을 추구하는 내용이 주된 경우
   - 신뢰도 70점 이상일 경우, '유형 없음'으로 출력하라.

4️⃣ **신뢰도 점수가 70점 이상일 경우**:
   - 기사 내용을 3문장 이내로 핵심만 요약하라.
   - 이 주제와 관련된 신뢰할 수 있는 정보를 찾을 수 있는 검색 키워드 3개를 추천하라.

5️⃣ **신뢰도 점수가 70점 미만일 경우**:
   - 기사 내용을 3문장 이내로 핵심만 요약하라.
   - 이 주제와 관련된 신뢰할 수 있는 정보를 찾을 수 있는 검색 키워드 3개를 추천하라.
   - 판단 근거를 매우 구체적이고 상세하게 작성하라. 다음 항목들을 포함해야 한다:
     * 기사에서 발견된 구체적인 문제점 (예: "기사 3단락에서 '전문가에 따르면'이라고 언급했으나 실제 전문가 이름이나 소속이 명시되지 않음")
     * 출처의 신뢰성 문제 (예: "인용된 통계 자료의 출처가 불명확하거나 검증 가능한 공식 기관의 데이터가 아님")
     * 사실 검증 실패 사항 (예: "기사에서 주장한 '전국 90%의 학교가 폐쇄'라는 내용은 교육부 공식 발표와 일치하지 않음")
     * 논리적 모순이나 과장 표현 (예: "제목은 '충격적인 폭로'라고 표현했으나 본문 내용은 단순한 추측에 불과함")
     * 기사 작성 방식의 문제점 (예: "객관적 사실과 주관적 의견이 명확히 구분되지 않음")

🎯 최종 출력 형식은 반드시 아래 형식을 지켜라:
기사의 신뢰도 : [점수] %
가짜 기사 유형 : [유형명을 반드시 다음 중 하나로만 작성: "허위 사실 포함 기사", "과장된 제목 기사", "조작된 이미지 포함 기사", "광고성 기사", 또는 "유형 없음". 절대로 "1번", "2번" 같은 번호 형식을 사용하지 말라.]
요약 : [요약 내용]
추천 검색어 : [검색어1], [검색어2], [검색어3]
판단 근거 : [매우 구체적이고 상세한 판단 근거 설명 - 최소 200자 이상으로 작성]

기사 내용:
${articleText}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a fact-checker that analyzes news articles for credibility. Always respond in Korean.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0, // 일관성을 위해 0으로 설정
      max_tokens: 1500
    });

    const llmResponse = completion.choices[0].message.content;
    
    const scoreMatch = llmResponse.match(/기사의 신뢰도\s*:\s*(\d+)\s*%/);
    const typeMatch = llmResponse.match(/가짜 기사 유형\s*:\s*([^\n]+)/);
    const summaryMatch = llmResponse.match(/요약\s*:\s*([^\n]+(?:\n(?!추천 검색어|판단 근거)[^\n]+)*)/);
    const keywordsMatch = llmResponse.match(/추천 검색어\s*:\s*([^\n]+)/);
    const reasonMatch = llmResponse.match(/판단 근거\s*:\s*([\s\S]+)/);
    
    const credibilityScore = scoreMatch ? parseInt(scoreMatch[1]) : 0;
    let fakeArticleType = typeMatch ? typeMatch[1].trim() : '유형 없음';
    
    // "1번: ", "2번: " 같은 번호 제거
    fakeArticleType = fakeArticleType.replace(/^\d+번\s*:\s*/, '').trim();
    
    // 유형 매핑 (혹시 모를 경우를 대비)
    const typeMapping = {
        '1번': '허위 사실 포함 기사',
        '2번': '과장된 제목 기사',
        '3번': '조작된 이미지 포함 기사',
        '4번': '광고성 기사'
    };
    
    // 만약 여전히 "1번" 같은 형식이 남아있다면 매핑
    if (typeMapping[fakeArticleType]) {
        fakeArticleType = typeMapping[fakeArticleType];
    }
    const summary = summaryMatch ? summaryMatch[1].trim() : '없음';
    const keywordsStr = keywordsMatch ? keywordsMatch[1].trim() : '없음';
    const reason = reasonMatch ? reasonMatch[1].trim() : '없음';
    
    let recommendations = [];
    if (keywordsStr !== '없음') {
      recommendations = keywordsStr.split(',').map(k => k.trim().replace(/^\[|\]$/g, ''));
    }

    const result = {
      credibilityScore,
      fakeArticleType,
      summary,
      recommendations,
      reason,
      fullResponse: llmResponse,
      articleContent: articleText.substring(0, 500) + '...' // 미리보기용
    };

    // 결과를 캐시에 저장
    credibilityCache.set(cacheKey, result);
    console.log('결과 캐시에 저장:', cacheKey);

    res.json(result);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: '신뢰도 평가 중 오류가 발생했습니다.' });
  }
});

app.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
  console.log('환경 변수 OPENAI_API_KEY를 설정하거나 코드에서 직접 API 키를 입력하세요.');
});

