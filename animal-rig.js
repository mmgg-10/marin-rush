// 라이벌 동물(돌고래·거북이·물범·펭귄) 커스텀 리그
// eam(Tripo) 자동 리깅은 인간형 전용이라, 동물은 "캡슐(관절 선분 + 반경)"로 뼈를 정의하고
// 정점마다 각 캡슐까지의 거리/반경 비율로 부드럽게 웨이트를 나눈다(가까운 캡슐일수록 큼).
//
// 정규 좌표 (모델 바운딩 박스 기준):
//   u: 앞뒤 0(꼬리 끝) → 1(코끝)   v: 높이 0(바닥) → 1(꼭대기)   w: 좌우 −.5 → +.5
import * as THREE from 'three';

const AX = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] };

/**
 * @param mesh   단일 Mesh (GLB에서 꺼낸 것)
 * @param def    { forward: '+x'|'-x'|'+z'|'-z', bones: [{ name, parent, a:[u,v,w], b:[u,v,w], r, mirror? }], k? }
 *               mirror: true 이면 w 부호를 뒤집은 쌍(name+'L'/'R')을 자동 생성
 */
export function rigAnimal(mesh, def){
  const geo = mesh.geometry; geo.computeBoundingBox();
  const bb = geo.boundingBox, size = bb.getSize(new THREE.Vector3());
  const f = new THREE.Vector3(...AX[def.forward]), up = new THREE.Vector3(0, 1, 0), l = new THREE.Vector3().crossVectors(f, up);
  const fLen = Math.abs(f.x) ? size.x : size.z, lLen = Math.abs(f.x) ? size.z : size.x;
  const center = bb.getCenter(new THREE.Vector3());
  const P = ([u, v, w]) => center.clone()
    .addScaledVector(f, (u - .5) * fLen).setY(bb.min.y + v * size.y).addScaledVector(l, w * lLen);
  const unit = Math.max(fLen, size.y, lLen);

  // 좌우 대칭 뼈 펼치기
  const list = [];
  for (const d of def.bones){
    if (d.mirror){
      for (const [sfx, s] of [['L', 1], ['R', -1]]){
        list.push({ ...d, name: d.name + sfx, side: s, parent: d.parent && d.parentMirror ? d.parent + sfx : d.parent,
          a: [d.a[0], d.a[1], d.a[2] * s], b: [d.b[0], d.b[1], d.b[2] * s] });
      }
    } else list.push({ ...d, side: 0 });
  }
  const bones = {}, arr = [];
  for (const d of list){
    const b = new THREE.Bone(); b.name = d.name; b.userData.rest = P(d.a); b.userData.def = d;
    bones[d.name] = b; arr.push(b);
  }
  let root = null;
  for (const b of arr){
    const p = bones[b.userData.def.parent];
    if (p){ b.position.copy(b.userData.rest).sub(p.userData.rest); p.add(b); }
    else { b.position.copy(b.userData.rest); root = b; }
  }

  // 웨이트: 캡슐까지 거리 / 반경 → softmin
  const pos = geo.attributes.position, n = pos.count, K = def.k ?? 7;
  const segs = arr.map(b => ({ line: new THREE.Line3(P(b.userData.def.a), P(b.userData.def.b)), r: b.userData.def.r * unit }));
  const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < n; i++){
    v.fromBufferAttribute(pos, i);
    const sc = segs.map((s, j) => { s.line.closestPointToPoint(v, true, c); return [j, c.distanceTo(v) / s.r]; })
      .sort((a, b) => a[1] - b[1]).slice(0, 4);
    const best = sc[0][1];
    let sum = 0; const ws = sc.map(([j, s]) => { const w = Math.exp(-K * (s - best)); sum += w; return [j, w]; });
    ws.forEach(([j, w], q) => { skinIndex[i * 4 + q] = j; skinWeight[i * 4 + q] = w / sum; });
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  const skinned = new THREE.SkinnedMesh(geo, mesh.material);
  skinned.add(root); skinned.bind(new THREE.Skeleton(arr)); skinned.frustumCulled = false;
  for (const b of arr) b.userData.restQ = b.quaternion.clone();
  return { skinned, bones, axes: { f, up, l }, forward: def.forward };
}

const _q = new THREE.Quaternion();
export function resetAnimal(rig){ for (const b of Object.values(rig.bones)) b.quaternion.copy(b.userData.restQ); }
// 뼈를 (모델 좌표계) 축 기준으로 회전. pitch = 좌우축(고개 끄덕/꼬리 위아래), yaw = 위축, roll = 앞축(지느러미 퍼덕)
export function turn(rig, name, pitch = 0, yaw = 0, roll = 0){
  const b = rig.bones[name]; if (!b) return;
  const { f, up, l } = rig.axes;
  if (pitch) b.quaternion.multiply(_q.setFromAxisAngle(l, pitch));
  if (yaw) b.quaternion.multiply(_q.setFromAxisAngle(up, yaw));
  if (roll) b.quaternion.multiply(_q.setFromAxisAngle(f, roll));
}
// 모델의 앞쪽이 게임의 진행방향(−z)을 보도록 하는 y 회전값
export function yawToGameForward(forward){ return { '+x': Math.PI / 2, '-x': -Math.PI / 2, '+z': Math.PI, '-z': 0 }[forward]; }
