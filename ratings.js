// Vercel 서버 함수: GET /api/ratings
// places.js의 기본 식당 목록에 대해 구글 지도 평점(Places API New)을 가져옵니다.
// API 키는 Vercel 환경 변수 GOOGLE_PLACES_API_KEY 에만 두고, 브라우저에는 절대 내보내지 않습니다.
// 키가 없으면 {enabled:false} 를 돌려주고, 앱은 구글 평점 없이 동작합니다.

import { BASE } from '../places.js';

const FIELDS = ['id', 'displayName', 'rating', 'userRatingCount', 'googleMapsUri'];
const CONCURRENCY = 6;

export default async function handler(req, res) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ enabled: false });
  }

  const out = {};
  let next = 0;
  let failed = 0;
  const worker = async () => {
    while (next < BASE.length) {
      const p = BASE[next++];
      try {
        out[p.id] = await lookup(p, key);
      } catch (e) {
        out[p.id] = null;
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // 모두 실패했다면(키 오류·할당량 초과 등) 캐시하지 않고 꺼진 상태로 알립니다.
  if (failed === BASE.length) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ enabled: false, error: '구글 평점을 불러오지 못했습니다. API 키와 할당량을 확인하세요.' });
  }

  // 같은 결과를 잠시 재사용해 호출 수(=비용)를 줄입니다. 기본 1시간.
  // 구글 지도 플랫폼 약관은 평점 같은 장소 정보를 오래 저장하는 것을 제한하므로 길게 늘리지 마세요.
  const ttl = Math.min(86400, Math.max(60, Number(process.env.RATINGS_CACHE_SECONDS) || 3600));
  res.setHeader('Cache-Control', `public, s-maxage=${ttl}, stale-while-revalidate=600`);
  return res.status(200).json({ enabled: true, fetchedAt: new Date().toISOString(), places: out });
}

async function lookup(p, key) {
  let place;
  if (p.gid) {
    // Place ID를 알면 상세 조회 (정확함)
    const r = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(p.gid)}?languageCode=ko`,
      { headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS.join(',') } }
    );
    if (!r.ok) throw new Error(`details ${r.status}`);
    place = await r.json();
  } else {
    // 이름 + 좌표 주변 300m로 검색해 가장 맞는 한 곳
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELDS.map((f) => 'places.' + f).join(','),
      },
      body: JSON.stringify({
        textQuery: (p.q || p.n) + ' 서울',
        languageCode: 'ko',
        regionCode: 'KR',
        pageSize: 1,
        locationBias: { circle: { center: { latitude: p.lat, longitude: p.lng }, radius: 300 } },
      }),
    });
    if (!r.ok) throw new Error(`search ${r.status}`);
    const j = await r.json();
    place = j.places && j.places[0];
  }
  if (!place) return null;
  return {
    gid: place.id,
    name: (place.displayName && place.displayName.text) || '',
    rating: typeof place.rating === 'number' ? place.rating : null,
    count: place.userRatingCount || 0,
    uri: place.googleMapsUri || '',
  };
}
