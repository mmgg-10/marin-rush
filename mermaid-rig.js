// 마린냥 커스텀 리그
// eam(Tripo) 자동 리깅은 다리 있는 인간형만 지원해서 인어 꼬리 모델은 "not riggable"로 거부됨.
// 그래서 A포즈 모델의 키 비율을 기준으로 뼈대를 직접 세우고, 정점마다 스킨 웨이트를 계산한다.
//
// 좌표계 (생성 모델 그대로): y = 위, +x = 정면(얼굴 방향), z = 좌우.
// 비율 h: 0 = 귀 끝(맨 위), 1 = 꼬리지느러미 끝(맨 아래). 폭·깊이는 키(H) 대비 비율.
import * as THREE from 'three';

export const RIG_CFG = {
  head: .385,                       // 이보다 위는 머리(귀·앞머리 포함)가 통째로 움직임
  chest: .44, spine: .52, hips: .60,
  tail: [.66, .75, .83, .90],       // 꼬리 관절
  // 팔 관절 (h, |z|, x) — A포즈 이미지 기준, loadRigTuning으로 덮어쓰기 가능
  // x(깊이)는 메시 실측: 팔 앞면이 x≈.13~.15 이라 중심은 그보다 조금 뒤
  shoulder: [.425, .09, .06], elbow: [.49, .16, .09], hand: [.555, .245, .10],
  armR: .055,                       // 팔 두께 반경
  armBack: .038,                    // 팔 중심에서 이만큼 더 뒤면 머리카락으로 봄
  hairEnd: .82,                     // 머리카락이 끝나는 높이
  bodyHalf: [[.38, .07], [.42, .115], [.48, .10], [.53, .09], [.60, .115], [.68, .12], [.76, .10], [.83, .065], [.88, .09], [.95, .17], [1, .17]],
  backX: -.075,                     // 이보다 뒤(−x)는 등 뒤로 넘어간 머리카락
};

const lerpTable = (tab, h) => {
  if (h <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (h <= tab[i][0]){
    const [h0, v0] = tab[i - 1], [h1, v1] = tab[i]; return v0 + (v1 - v0) * (h - h0) / (h1 - h0);
  }
  return tab[tab.length - 1][1];
};
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 뼈 이름 → 인덱스
export const B = { root: 0, spine: 1, chest: 2, head: 3, lUp: 4, lLow: 5, lHand: 6, rUp: 7, rLow: 8, rHand: 9,
  tail1: 10, tail2: 11, tail3: 12, tail4: 13, hairL: 14, hairR: 15, hairB: 16 };

/**
 * mesh(단일 Mesh) → SkinnedMesh 로 바꿔서 반환. bones 맵으로 각 뼈에 접근.
 * side: 왼팔(+z) = +1, 오른팔(−z) = −1
 */
export function rigMermaid(mesh, cfg = RIG_CFG){
  const geo = mesh.geometry;
  geo.computeBoundingBox();
  const bb = geo.boundingBox, top = bb.max.y, H = bb.max.y - bb.min.y;
  const cx = (bb.max.x + bb.min.x) / 2, cz = (bb.max.z + bb.min.z) / 2;
  const P = (h, z = 0, x = 0) => new THREE.Vector3(cx + x * H, top - h * H, cz + z * H);

  // ---- 뼈대 ----
  const bones = [];
  const mk = (name, pos, parent) => {
    const b = new THREE.Bone(); b.name = name; b.userData.rest = pos.clone();
    bones.push(b); b.userData.parent = parent; return b;
  };
  const [sh, sz, sx] = cfg.shoulder, [eh, ez, ex] = cfg.elbow, [hh, hz, hx] = cfg.hand;
  const root = mk('root', P(cfg.hips), null);
  const spine = mk('spine', P(cfg.spine), root);
  const chest = mk('chest', P(cfg.chest), spine);
  const head = mk('head', P(cfg.head), chest);
  const lUp = mk('lUp', P(sh, sz, sx), chest), lLow = mk('lLow', P(eh, ez, ex), lUp), lHand = mk('lHand', P(hh, hz, hx), lLow);
  const rUp = mk('rUp', P(sh, -sz, sx), chest), rLow = mk('rLow', P(eh, -ez, ex), rUp), rHand = mk('rHand', P(hh, -hz, hx), rLow);
  const t1 = mk('tail1', P(cfg.tail[0]), root), t2 = mk('tail2', P(cfg.tail[1]), t1), t3 = mk('tail3', P(cfg.tail[2]), t2), t4 = mk('tail4', P(cfg.tail[3]), t3);
  const hairL = mk('hairL', P(.41, .1, -.03), head), hairR = mk('hairR', P(.41, -.1, -.03), head), hairB = mk('hairB', P(.41, 0, -.08), head);
  // 부모 기준 로컬 위치로 변환 & 계층 구성
  for (const b of bones){
    const p = b.userData.parent;
    if (p){ b.position.copy(b.userData.rest).sub(p.userData.rest); p.add(b); } else b.position.copy(b.userData.rest);
  }

  // ---- 스킨 웨이트 ----
  const pos = geo.attributes.position, n = pos.count;
  const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
  const v = new THREE.Vector3(), tmp = new THREE.Vector3(), seg = new THREE.Line3();
  const armJ = side => [P(sh, sz * side, sx), P(eh, ez * side, ex), P(hh, hz * side, hx)];
  const arms = { 1: armJ(1), [-1]: armJ(-1) };
  // 몸통·꼬리 구간: [뼈, 시작h, 끝h]
  const bands = [[B.chest, cfg.head, cfg.chest], [B.spine, cfg.chest, cfg.spine], [B.root, cfg.spine, cfg.tail[0]],
    [B.tail1, cfg.tail[0], cfg.tail[1]], [B.tail2, cfg.tail[1], cfg.tail[2]], [B.tail3, cfg.tail[2], cfg.tail[3]], [B.tail4, cfg.tail[3], 1.01]];
  const BW = .022;   // 관절 블렌딩 폭

  // 팔에 바짝 붙은 머리카락이 팔 웨이트를 받지 않도록: 팔 뼈 바로 위 정점(씨앗)에서 메시 연결을 따라
  // 퍼져나간 정점만 '팔'로 인정한다. UV 이음새로 쪼개진 정점은 위치로 묶어서 연결을 이어 준다.
  const armDist = new Float32Array(n).fill(9), armSide = new Int8Array(n);
  for (let i = 0; i < n; i++){
    v.fromBufferAttribute(pos, i);
    const h = (top - v.y) / H, z = (v.z - cz) / H, side = z >= 0 ? 1 : -1;
    if (h <= cfg.head || h >= .64 || Math.abs(z) <= sz * .7) continue;
    const [s, e, hd] = arms[side];
    seg.set(s, e); seg.closestPointToPoint(v, true, tmp); let d = tmp.distanceTo(v), cxp = tmp.x;
    seg.set(e, hd); seg.closestPointToPoint(v, true, tmp); if (tmp.distanceTo(v) < d){ d = tmp.distanceTo(v); cxp = tmp.x; }
    if (v.distanceTo(hd) / H < .06) d = Math.min(d, v.distanceTo(hd) * .5);
    // 팔 중심보다 한참 뒤(−x)에 있는 정점은 팔 뒤에 드리운 머리카락 → 팔에서 제외
    if ((cxp - v.x) / H > cfg.armBack) continue;
    armDist[i] = d / H; armSide[i] = side;
  }
  const weld = new Map(), wid = new Int32Array(n);
  for (let i = 0; i < n; i++){
    const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    if (!weld.has(k)) weld.set(k, weld.size); wid[i] = weld.get(k);
  }
  const groups = Array.from({ length: weld.size }, () => []);
  for (let i = 0; i < n; i++) groups[wid[i]].push(i);
  const adj = Array.from({ length: weld.size }, () => new Set());
  const idx = geo.index ? geo.index.array : Array.from({ length: n }, (_, i) => i);
  for (let f = 0; f < idx.length; f += 3){
    const a = wid[idx[f]], b = wid[idx[f + 1]], c = wid[idx[f + 2]];
    adj[a].add(b); adj[a].add(c); adj[b].add(a); adj[b].add(c); adj[c].add(a); adj[c].add(b);
  }
  const isArm = new Uint8Array(n), seen = new Uint8Array(weld.size), queue = [];
  const wDist = g => Math.min(...groups[g].map(i => armDist[i]));
  for (let g = 0; g < weld.size; g++) if (wDist(g) < cfg.armR * .45){ seen[g] = 1; queue.push(g); }
  while (queue.length){
    const g = queue.pop();
    for (const i of groups[g]) isArm[i] = 1;
    for (const nb of adj[g]) if (!seen[nb] && wDist(nb) < cfg.armR){ seen[nb] = 1; queue.push(nb); }
  }

  const isHairV = new Uint8Array(n);
  for (let i = 0; i < n; i++){
    v.fromBufferAttribute(pos, i);
    const h = (top - v.y) / H, z = (v.z - cz) / H, x = (v.x - cx) / H, side = z >= 0 ? 1 : -1;
    isHairV[i] = !isArm[i] && h > cfg.head && h < cfg.hairEnd && (Math.abs(z) > lerpTable(cfg.bodyHalf, h) + .012 || x < cfg.backX) ? 1 : 0;
    const w = new Map();
    const add = (b, a) => { if (a > 1e-4) w.set(b, (w.get(b) || 0) + a); };

    // 1) 팔: 팔 뼈 선분에서 armR 안쪽
    let armHit = false;
    if (isArm[i]){
      const [s, e, hd] = arms[side];
      seg.set(s, e); seg.closestPointToPoint(v, true, tmp); const d1 = tmp.distanceTo(v) / H;
      const t1p = seg.closestPointToPointParameter(v, true);
      seg.set(e, hd); seg.closestPointToPoint(v, true, tmp); const d2 = tmp.distanceTo(v) / H;
      const t2p = seg.closestPointToPointParameter(v, true);
      const beyondHand = v.distanceTo(hd) / H;
      {
        armHit = true;
        const up = side > 0 ? B.lUp : B.rUp, low = side > 0 ? B.lLow : B.rLow, hand = side > 0 ? B.lHand : B.rHand;
        if (d1 < d2){ const k = sstep(.75, 1, t1p); add(up, 1 - k * .5); add(low, k * .5); if (t1p < .15) add(B.chest, (.15 - t1p) * 3); }
        else if (t2p < .92 || beyondHand > .06){ const k = sstep(0, .25, t2p); add(up, (1 - k) * .5); add(low, .5 + k * .5); }
        else add(hand, 1);
        if (beyondHand < .06 && t2p >= .92) { w.clear(); add(hand, 1); }
      }
    }
    if (!armHit){
      const isHair = h > cfg.head && h < cfg.hairEnd && (Math.abs(z) > lerpTable(cfg.bodyHalf, h) + .012 || x < cfg.backX);
      if (h <= cfg.head + BW && !isHair){
        // 2) 머리
        add(B.head, 1 - sstep(cfg.head - BW, cfg.head + BW, h)); add(B.chest, sstep(cfg.head - BW, cfg.head + BW, h));
      } else if (isHair || h <= cfg.head){
        // 3) 머리카락: 위쪽은 머리에 붙어서, 아래로 갈수록 머리카락 뼈가 흔듦
        const k = sstep(cfg.head, .58, h);
        const hb = Math.abs(z) < .08 && x < cfg.backX ? B.hairB : side > 0 ? B.hairL : B.hairR;
        add(B.head, 1 - k); add(hb, k);
      } else {
        // 4) 몸통·꼬리: 높이 구간별, 경계는 부드럽게 섞음
        for (const [b, a, e] of bands) add(b, Math.min(1, Math.max(0, Math.min((h - a) / BW + .5, (e - h) / BW + .5))));
      }
    }
    if (!w.size) add(B.root, 1);
    const top4 = [...w.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top4.reduce((s, e) => s + e[1], 0);
    top4.forEach(([b, a], j) => { skinIndex[i * 4 + j] = b; skinWeight[i * 4 + j] = a / sum; });
  }
  // 팔과 머리카락을 잇는 삼각형 제거: 손이 머리카락에 닿아 붙은 면이라 팔을 들면 늘어나 보임.
  // 기본 자세에선 맞닿아 있어 구멍이 보이지 않는다.
  if (geo.index){
    const src = geo.index.array, keep = [];
    for (let f = 0; f < src.length; f += 3){
      const a = src[f], b = src[f + 1], c = src[f + 2];
      const arm = isArm[a] + isArm[b] + isArm[c], hair = isHairV[a] + isHairV[b] + isHairV[c];
      if (arm && hair) continue;
      keep.push(a, b, c);
    }
    geo.setIndex(keep);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));

  const skinned = new THREE.SkinnedMesh(geo, mesh.material);
  skinned.name = 'mermaid-skinned';
  skinned.add(root);
  skinned.bind(new THREE.Skeleton(bones));
  for (const b of bones) b.userData.restQ = b.quaternion.clone();
  const byName = Object.fromEntries(bones.map(b => [b.name, b]));
  return { skinned, bones: byName, H };
}

// ---------- 포즈 헬퍼 ----------
// 모든 뼈를 기본 자세로 되돌림
export function resetPose(bones){ for (const b of Object.values(bones)) b.quaternion.copy(b.userData.restQ); }
const _e = new THREE.Euler(), _q = new THREE.Quaternion();
// 뼈를 (x, y, z) 라디안만큼 회전 (기본 자세 기준 누적)
export function rot(b, x = 0, y = 0, z = 0){ _q.setFromEuler(_e.set(x, y, z)); b.quaternion.multiply(_q); }
// 팔 포즈: raise(+면 위로 들기), fwd(+면 앞으로), bend(팔꿈치 굽힘), side: 왼팔 +1 / 오른팔 −1
// 팔 자세에 맞춰 같은 쪽 머리카락을 바깥·뒤로 비켜 줌 (팔이 머리카락을 뚫고 들어가지 않게)
export function hairClear(bones, side, raise, fwd){
  const hb = side > 0 ? bones.hairL : bones.hairR;
  const out = .06 + Math.max(0, -fwd) * .55 + Math.max(0, -raise) * .45 + Math.max(0, raise - 1) * .12;
  const back = Math.max(0, -fwd) * .45 + Math.max(0, -raise) * .2;
  rot(hb, -out * side, 0, -back);
}
export function armPose(bones, side, raise = 0, fwd = 0, bend = 0, twist = 0){
  hairClear(bones, side, raise, fwd);
  const up = side > 0 ? bones.lUp : bones.rUp, low = side > 0 ? bones.lLow : bones.rLow;
  rot(up, -raise * side, fwd * side, twist);       // x축: 정면 평면에서 들기 / y축: 앞(+x)으로 휘두르기
  rot(low, -bend * side * .4, bend * side * .9, 0); // 팔꿈치를 앞으로 굽힘
}
