// 라이벌 4종 리그 정의 (animal-rig.js 의 정규 좌표: u 앞뒤 0꼬리→1코, v 높이 0바닥→1꼭대기, w 좌우)
// 관절 위치는 eam으로 만든 3D 모델의 측면/정면 뷰에서 측정.
// forward: 모델 원본에서 얼굴이 향한 축 / size: 게임 안 크기(sizeAxis 방향 길이)
// swimPitch: 헤엄칠 때 앞으로 숙이는 각도(라디안). 펭귄·돌고래는 원본이 서 있는 자세라 눕혀서 헤엄침.
export const RIVAL_DEFS = {
  dolphin: {
    forward: '+z', size: 2.3, sizeAxis: 'y', swimPitch: .85,
    bones: [
      { name: 'body', a: [.45, .6, 0], b: [.6, .72, 0], r: .34 },
      { name: 'head', parent: 'body', a: [.6, .72, 0], b: [.97, .72, 0], r: .26 },
      { name: 'tail1', parent: 'body', a: [.36, .5, 0], b: [.2, .3, 0], r: .2 },
      { name: 'tail2', parent: 'tail1', a: [.2, .3, 0], b: [.25, .12, 0], r: .14 },
      { name: 'fluke', parent: 'tail2', a: [.25, .12, 0], b: [.32, 0, 0], r: .13 },
      { name: 'fin', parent: 'body', mirror: true, a: [.55, .45, .28], b: [.5, .3, .5], r: .1 },
    ],
  },
  turtle: {
    forward: '+x', size: 2.3, sizeAxis: 'f', swimPitch: 0,
    bones: [
      { name: 'body', a: [.3, .58, 0], b: [.6, .58, 0], r: .3 },
      { name: 'head', parent: 'body', a: [.66, .52, 0], b: [.96, .62, 0], r: .2 },
      { name: 'front', parent: 'body', mirror: true, a: [.56, .25, .28], b: [.66, .06, .52], r: .14 },
      { name: 'back', parent: 'body', mirror: true, a: [.2, .25, .26], b: [.08, .1, .5], r: .13 },
    ],
  },
  seal: {
    forward: '+x', size: 2.5, sizeAxis: 'f', swimPitch: 0,
    bones: [
      { name: 'body', a: [.45, .45, 0], b: [.62, .5, 0], r: .36 },
      { name: 'head', parent: 'body', a: [.62, .5, 0], b: [.92, .62, 0], r: .34 },
      { name: 'hip', parent: 'body', a: [.42, .42, 0], b: [.2, .3, 0], r: .28 },
      { name: 'tail', parent: 'hip', mirror: true, a: [.18, .22, .06], b: [0, .1, .2], r: .1 },
      { name: 'fin', parent: 'body', mirror: true, a: [.58, .25, .3], b: [.7, .08, .5], r: .1 },
    ],
  },
  penguin: {
    forward: '+x', size: 1.9, sizeAxis: 'y', swimPitch: 1.15,
    bones: [
      { name: 'body', a: [.45, .15, 0], b: [.45, .55, 0], r: .4 },
      { name: 'head', parent: 'body', a: [.45, .55, 0], b: [.58, .9, 0], r: .37 },
      { name: 'wing', parent: 'body', mirror: true, a: [.42, .58, .36], b: [.42, .24, .5], r: .1 },
      { name: 'foot', parent: 'body', mirror: true, a: [.55, .08, .15], b: [.85, .02, .18], r: .09 },
    ],
  },
  // 히든 캐릭터 '냥어': 고양이 물고기 옷(서 있는 통통한 몸). 얼굴은 +x, 꼬리는 왼쪽 아래로 옆으로 뻗음
  fishcat: {
    forward: '+x', size: 1.9, sizeAxis: 'y', swimPitch: 1.0,
    bones: [
      { name: 'body', a: [.5, .12, 0], b: [.5, .52, 0], r: .4 },
      { name: 'head', parent: 'body', a: [.5, .52, 0], b: [.5, .98, 0], r: .4 },
      { name: 'fin', parent: 'body', mirror: true, a: [.5, .38, .36], b: [.5, .3, .5], r: .1 },
      { name: 'tail', parent: 'body', a: [.5, .2, -.22], b: [.5, .06, -.5], r: .13 },
    ],
  },
};
