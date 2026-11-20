// Area conversion and plant density both live in @/lib/area now. They were
// duplicated here with a different fallback density — 1 plant per square metre
// for an unrecognised method, where the backend enforces the outdoor 2.5 — so
// the suggested count was lower than what the platform would have accepted,
// with nothing on screen to say why.
export { plotAreaSqm, suggestPlantCount } from '@/lib/area';

export type PlotAssignmentForm = {
  allocatedAreaSqm: number;
  plannedPlantCount: number;
};

