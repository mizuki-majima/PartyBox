import {
  Box3,
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BlueprintPart, CarBlueprint, PartMaterial, PartRole, WheelStyle } from '../blueprint/types';
import { canvasTexture } from '../engine/textures';

/** 組み立て後の車の大きさの範囲（コース幅 7.5 に 4 台並べる前提） */
export const CAR_SIZE = {
  /** 長さ・幅の大きい方の最小値 */
  minFootprint: 1.4,
  /** max(長さ, 幅×1.25, 高さ×1.1) の最大値 */
  maxExtent: 2.3,
  /** 浮いている車（車輪なし）の高さ */
  hoverHeight: 0.35,
};

/** 何も指定が無いときの角の丸み（丸っこいチョロQ風にするため、車体は丸め気味） */
const DEFAULT_ROUND: Partial<Record<PartRole, number>> = {
  body: 0.45,
  cabin: 0.55,
  roof: 0.4,
  bumper: 0.6,
  window: 0.3,
  spoiler: 0.15,
  deco: 0.3,
  light: 0.5,
};

let woodTexture: Texture | null = null;
function getWoodTexture(): Texture {
  if (!woodTexture) {
    woodTexture = canvasTexture(
      128,
      128,
      (ctx, w, h) => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 22; i++) {
          const y = (i / 22) * h + Math.sin(i * 7.3) * 3;
          ctx.strokeStyle = `rgba(90,50,20,${0.12 + ((i * 37) % 10) / 60})`;
          ctx.lineWidth = 1 + ((i * 13) % 3);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.bezierCurveTo(w * 0.3, y + 4, w * 0.6, y - 4, w, y + 2);
          ctx.stroke();
        }
      },
      { repeat: true },
    );
  }
  return woodTexture;
}

function makeMaterial(kind: PartMaterial, color: string): MeshStandardMaterial {
  switch (kind) {
    case 'metal':
      return new MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.6 });
    case 'wood':
      return new MeshStandardMaterial({ color, roughness: 0.85, map: getWoodTexture() });
    case 'glass':
      return new MeshStandardMaterial({ color, roughness: 0.05, metalness: 0.15 });
    case 'glow':
      return new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, roughness: 0.4 });
    case 'rubber':
      return new MeshStandardMaterial({ color, roughness: 0.92 });
    case 'cloth':
      return new MeshStandardMaterial({ color, roughness: 1 });
    default:
      return new MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.02 });
  }
}

function partGeometry(part: BlueprintPart): BufferGeometry {
  const s = part.size;
  switch (part.shape) {
    case 'box': {
      const round = part.round ?? DEFAULT_ROUND[part.role ?? 'deco'] ?? 0.2;
      const minSide = Math.min(s[0], s[1], s[2]);
      const radius = Math.min(round, 0.98) * (minSide / 2);
      if (radius < 0.01) return new BoxGeometry(s[0], s[1], s[2]);
      return new RoundedBoxGeometry(s[0], s[1], s[2], 3, radius);
    }
    case 'cylinder': {
      const top = s[0];
      const bottom = s.length >= 3 ? s[2] : s[0];
      return new CylinderGeometry(top, bottom, s[1], 22);
    }
    case 'sphere': {
      const g = new SphereGeometry(1, 22, 16);
      g.scale(s[0], s[1] ?? s[0], s[2] ?? s[0]);
      return g;
    }
    case 'cone':
      return new ConeGeometry(s[0], s[1], 22);
    case 'torus':
      return new TorusGeometry(s[0], s[1], 12, 28);
    case 'capsule':
      return new CapsuleGeometry(s[0], s[1], 6, 14);
  }
}

interface WheelRig {
  mesh: Mesh;
  base: Quaternion;
  axis: Vector3;
  sign: number;
}

const HUB_STYLE: Record<Exclude<WheelStyle, 'none'>, { hub: string; spoke: string; hubR: number; spokeLen: number; spokes: number }> = {
  normal: { hub: '#e0e6ea', spoke: '#90a4ae', hubR: 0.55, spokeLen: 1.0, spokes: 2 },
  sporty: { hub: '#37474f', spoke: '#eceff1', hubR: 0.7, spokeLen: 1.3, spokes: 3 },
  wooden: { hub: '#6d4c41', spoke: '#a1887f', hubR: 0.22, spokeLen: 1.8, spokes: 4 },
  cute: { hub: '#ffffff', spoke: '#ff80ab', hubR: 0.6, spokeLen: 0, spokes: 0 },
  offroad: { hub: '#ffca28', spoke: '#5d4037', hubR: 0.45, spokeLen: 0.85, spokes: 2 },
};

/**
 * 設計図から組み立てた 3D の車。
 * root（位置・向き）→ tilt（揺れ・スピン演出）→ inner（大きさを揃えた車体）の 3 段構え。
 */
export class CarModel {
  readonly root = new Group();
  readonly tilt = new Group();
  readonly inner = new Group();
  readonly blueprint: CarBlueprint;
  readonly hover: boolean;
  /** 組み立て後の実寸 */
  length = 1;
  width = 1;
  height = 1;
  private readonly wheels: WheelRig[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private wheelAngle = 0;
  private baseY = 0;
  private bobPhase = Math.random() * Math.PI * 2;
  private readonly tmpQ = new Quaternion();

  constructor(blueprint: CarBlueprint) {
    this.blueprint = blueprint;
    this.root.add(this.tilt);
    this.tilt.add(this.inner);
    this.hover = !blueprint.parts.some((p) => p.role === 'wheel');

    const matCache = new Map<string, MeshStandardMaterial>();
    const material = (kind: PartMaterial, color: string) => {
      const key = `${kind}|${color}`;
      let m = matCache.get(key);
      if (!m) {
        m = makeMaterial(kind, color);
        matCache.set(key, m);
        this.materials.push(m);
      }
      return m;
    };

    for (const part of blueprint.parts) {
      const geo = partGeometry(part);
      this.geometries.push(geo);
      const mesh = new Mesh(geo, material(part.material ?? 'plastic', part.color));
      mesh.position.set(...part.position);
      if (part.rotation) {
        mesh.rotation.copy(
          new Euler(
            MathUtils.degToRad(part.rotation[0]),
            MathUtils.degToRad(part.rotation[1]),
            MathUtils.degToRad(part.rotation[2]),
          ),
        );
      }
      mesh.castShadow = true;
      mesh.receiveShadow = part.role === 'body' || part.role === 'cabin';
      this.inner.add(mesh);
      if (part.role === 'wheel') this.addWheel(mesh, part, blueprint.wheelStyle, material);
    }

    this.fitSize();
    this.mergeStatic();
  }

  /**
   * 車輪以外のパーツは走行中に動かないので、材質ごとに 1 つのメッシュへまとめる。
   * 30 パーツの車でも描画回数が数回で済み、スマホでも軽くなる。
   */
  private mergeStatic(): void {
    const wheelMeshes = new Set(this.wheels.map((w) => w.mesh));
    const groups = new Map<Material, BufferGeometry[]>();
    const remove: Mesh[] = [];
    for (const child of this.inner.children) {
      if (!(child instanceof Mesh) || wheelMeshes.has(child)) continue;
      child.updateMatrix();
      const g = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
      g.applyMatrix4(child.matrix);
      for (const name of Object.keys(g.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
      }
      const mat = child.material as Material;
      const list = groups.get(mat) ?? [];
      list.push(g);
      groups.set(mat, list);
      remove.push(child);
    }
    for (const [mat, list] of groups) {
      const merged = mergeGeometries(list);
      list.forEach((g) => g !== merged && g.dispose());
      if (!merged) continue;
      this.geometries.push(merged);
      const mesh = new Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.inner.add(mesh);
    }
    for (const m of remove) {
      this.inner.remove(m);
      // 元のジオメトリはもう使わないので、すぐ捨てる
      m.geometry.dispose();
      const i = this.geometries.indexOf(m.geometry);
      if (i >= 0) this.geometries.splice(i, 1);
    }
  }

  private addWheel(
    mesh: Mesh,
    part: BlueprintPart,
    style: WheelStyle,
    material: (kind: PartMaterial, color: string) => MeshStandardMaterial,
  ): void {
    // 車軸（メッシュのローカル座標）: 円柱・カプセルは Y、ドーナツは Z、その他は車の左右方向
    let axis: Vector3;
    if (part.shape === 'cylinder' || part.shape === 'capsule') axis = new Vector3(0, 1, 0);
    else if (part.shape === 'torus') axis = new Vector3(0, 0, 1);
    else axis = new Vector3(0, 0, 1).applyQuaternion(mesh.quaternion.clone().invert());
    const worldAxis = axis.clone().applyQuaternion(mesh.quaternion);
    // 前(+X)に転がるとき、車軸が +Z を向いていれば負の回転
    const sign = worldAxis.z >= 0 ? -1 : 1;
    this.wheels.push({ mesh, base: mesh.quaternion.clone(), axis, sign });

    if (style === 'none' || part.shape !== 'cylinder') return;
    const hs = HUB_STYLE[style];
    const r = Math.min(part.size[0], part.size[2] ?? part.size[0]);
    const h = part.size[1];
    const hubGeo = new CylinderGeometry(r * hs.hubR, r * hs.hubR, h * 1.06, 18);
    this.geometries.push(hubGeo);
    const hub = new Mesh(hubGeo, material('plastic', hs.hub));
    mesh.add(hub);
    if (hs.spokes > 0) {
      // スポークは 1 つのジオメトリにまとめる（描画回数を減らす）
      const bars = Array.from({ length: hs.spokes }, (_, i) =>
        new BoxGeometry(r * hs.spokeLen, h * 1.1, r * 0.16).rotateY((i / hs.spokes) * Math.PI),
      );
      const geo = mergeGeometries(bars) ?? bars[0];
      bars.forEach((b) => b !== geo && b.dispose());
      this.geometries.push(geo);
      mesh.add(new Mesh(geo, material('plastic', hs.spoke)));
    } else {
      // かわいい車輪: 中心からずれた水玉で回転が見えるようにする
      const geo = new CylinderGeometry(r * 0.16, r * 0.16, h * 1.12, 12);
      this.geometries.push(geo);
      const dot = new Mesh(geo, material('plastic', hs.spoke));
      dot.position.x = r * 0.32;
      mesh.add(dot);
    }
  }

  /** 大きさを決まった範囲に収め、地面にぴったり置く */
  private fitSize(): void {
    const box = new Box3();
    this.inner.updateMatrixWorld(true);
    box.setFromObject(this.inner);
    const size = box.getSize(new Vector3());
    const footprint = Math.max(size.x, size.z);
    const extent = Math.max(size.x, size.z * 1.25, size.y * 1.1);
    let scale = 1;
    if (footprint < CAR_SIZE.minFootprint) scale = CAR_SIZE.minFootprint / footprint;
    if (extent * scale > CAR_SIZE.maxExtent) scale = CAR_SIZE.maxExtent / extent;
    this.inner.scale.setScalar(scale);
    this.inner.updateMatrixWorld(true);
    box.setFromObject(this.inner);
    const center = box.getCenter(new Vector3());
    this.baseY = -box.min.y + (this.hover ? CAR_SIZE.hoverHeight : 0);
    this.inner.position.set(-center.x, this.baseY, -center.z);
    box.getSize(size);
    this.length = size.x;
    this.width = size.z;
    this.height = size.y;
  }

  /** 車輪を回したり、浮いている車をふわふわさせたりする */
  update(dt: number, speed: number, time: number): void {
    this.wheelAngle += (speed * dt) / 0.3;
    for (const w of this.wheels) {
      this.tmpQ.setFromAxisAngle(w.axis, this.wheelAngle * w.sign);
      w.mesh.quaternion.copy(w.base).multiply(this.tmpQ);
    }
    if (this.hover) {
      this.inner.position.y = this.baseY + Math.sin(time * 3 + this.bobPhase) * 0.08;
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
