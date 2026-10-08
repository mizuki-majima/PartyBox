import { normalizeBlueprint } from '../blueprint/schema';
import { SAMPLE_BLUEPRINTS } from '../blueprint/samples';
import { CarModel } from '../car/CarModel';
import { ShowroomView } from '../car/ShowroomView';
import { Stage } from '../engine/Stage';
import { designCar } from '../generator/MockCarGenerator';

/** 開発用ギャラリー（本番ビルドには含まれない） */
export function showGallery(root: HTMLElement, params: URLSearchParams): void {
  const stage = new Stage();
  stage.attach(root);
  const view = new ShowroomView();
  let blueprints;
  if (params.has('gen')) {
    blueprints = params.get('gen')!.split('|').map((p) => designCar(p));
  } else {
    const only = params.get('gallery');
    blueprints = SAMPLE_BLUEPRINTS.map((raw) => {
      const { blueprint, issues } = normalizeBlueprint(raw);
      if (issues.length) console.info(`[blueprint] ${blueprint.name}:`, issues);
      return blueprint;
    }).filter((_, i) => !only || String(i) === only);
  }
  console.info(blueprints.map((b) => `${b.name} / ${b.concept} / ${JSON.stringify(b.stats)}`).join('\n'));
  view.setCars(blueprints.map((bp) => new CarModel(bp)));
  stage.setView(view);
}
