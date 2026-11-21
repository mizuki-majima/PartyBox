import type { BlueprintPart, PartMaterial, PartRole, Vec3 } from '../blueprint/types';

interface PartOptions {
  rotation?: Vec3;
  material?: PartMaterial;
  round?: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const v3 = (v: Vec3): Vec3 => [r3(v[0]), r3(v[1]), r3(v[2])];

/** テンプレートやアドオンからパーツを積み上げるための小さなビルダー */
export class PartList {
  readonly parts: BlueprintPart[] = [];
  /** ここまでで打ち止めにする数（設計図の上限） */
  readonly max: number;

  constructor(max = 30) {
    this.max = max;
  }

  get room(): number {
    return this.max - this.parts.length;
  }

  private push(part: BlueprintPart, opts: PartOptions): this {
    if (this.parts.length >= this.max) return this;
    if (opts.rotation) part.rotation = v3(opts.rotation);
    if (opts.material) part.material = opts.material;
    if (opts.round !== undefined && part.shape === 'box') part.round = r3(Math.min(1, Math.max(0, opts.round)));
    part.position = v3(part.position);
    part.size = part.size.map(r3);
    this.parts.push(part);
    return this;
  }

  box(size: Vec3, position: Vec3, color: string, role: PartRole, opts: PartOptions = {}): this {
    return this.push({ shape: 'box', size: [...size], position, color, role }, opts);
  }

  cyl(radius: number, height: number, position: Vec3, color: string, role: PartRole, opts: PartOptions = {}): this {
    return this.push({ shape: 'cylinder', size: [radius, height], position, color, role }, opts);
  }

  taper(top: number, height: number, bottom: number, position: Vec3, color: string, role: PartRole, opts: PartOptions = {}): this {
    return this.push({ shape: 'cylinder', size: [top, height, bottom], position, color, role }, opts);
  }

  sph(radii: number | Vec3, position: Vec3, color: string, role: PartRole, opts: PartOptions = {}): this {
    const size = typeof radii === 'number' ? [radii] : [...radii];
    return this.push({ shape: 'sphere', size, position, color, role }, opts);
  }

  cone(radius: number, height: number, position: Vec3, color: string, role: PartRole, opts: PartOptions = {}): this {
    return this.push({ shape: 'cone', size: [radius, height], position, color, role }, opts);
  }

  torus(radius: number, tube: number, position: Vec3, color: string, role: PartRole, opts: PartOptions = {}): this {
    return this.push({ shape: 'torus', size: [radius, tube], position, color, role }, opts);
  }

  capsule(radius: number, length: number, position: Vec3, color: string, role: PartRole, opts: PartOptions = {}): this {
    return this.push({ shape: 'capsule', size: [radius, length], position, color, role }, opts);
  }

  /** 車軸が横（Z）向きの車輪 */
  wheel(radius: number, thickness: number, position: Vec3, color: string, material: PartMaterial = 'rubber'): this {
    return this.cyl(radius, thickness, position, color, 'wheel', { rotation: [90, 0, 0], material });
  }

  /** 左右対称のパーツ（z と、z に比例する回転を反転してもう 1 つ置く） */
  pair(make: (side: 1 | -1) => void): this {
    make(1);
    make(-1);
    return this;
  }
}
