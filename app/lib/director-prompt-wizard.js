import { getStyleProfileByName } from "./director-catalog";

export const DIRECTOR_WIZARD_STEPS = [
  "What environment should we see?",
  "How should the camera move or frame the subject?",
  "What mood or emotion should the viewer feel?",
  "Clip length in seconds?",
  "Target frame rate? (24 / 30 / 60)",
  "Aspect ratio? (16:9 / 9:16 / 1:1 / 21:9)",
];

export const DIRECTOR_EXPERT_STEP =
  "Expert: lens & exposure metadata (e.g. 35mm, f/1.8, ISO 400, 1/48 shutter, full-frame)";

export function createDirectorWizard() {
  return { step: 0, topic: "", answers: [], expertMode: false, directorMode: false, styleName: "cinematic" };
}

export function buildDirectorPrompt({ topic, env, camera, mood, length, fps, ratio, styleName, expert }) {
  const style = getStyleProfileByName(styleName)?.style || "";
  let text = `${topic}. Environment: ${env}. Camera: ${camera}. Mood: ${mood}. Duration ${length}s at ${fps} fps, aspect ${ratio}. ${style}. High detail, smooth motion, coherent lighting, clean composition.`;
  if (expert) text += ` Camera metadata: ${expert}.`;
  return text;
}

export function buildDirectorThreeActPrompt(params) {
  const style = getStyleProfileByName(params.styleName)?.style || "";
  const act1 = `ACT 1 — Establish: ${params.env}, wide framing, slow reveal, ${params.mood} tone.`;
  const act2 = `ACT 2 — Action: ${params.topic}, ${params.camera}, rising energy.`;
  const act3 = `ACT 3 — Resolve: camera pulls back, environment breathes, emotional hold.`;
  let text = `${act1} ${act2} ${act3} ${params.length}s, ${params.fps} fps, ${params.ratio}. ${style}.`;
  if (params.expert) text += ` Metadata: ${params.expert}.`;
  return text;
}

export function advanceDirectorWizard(session, input) {
  const text = String(input || "").trim();
  if (!text) return { session, question: null, prompt: null };

  if (!session.topic) {
    return { session: { ...session, topic: text, step: 0, answers: [] }, question: DIRECTOR_WIZARD_STEPS[0], prompt: null };
  }

  const answers = [...session.answers, text];
  const nextStep = session.step + 1;

  if (nextStep < DIRECTOR_WIZARD_STEPS.length) {
    return { session: { ...session, answers, step: nextStep }, question: DIRECTOR_WIZARD_STEPS[nextStep], prompt: null };
  }

  if (session.expertMode && answers.length === DIRECTOR_WIZARD_STEPS.length) {
    return { session: { ...session, answers, step: nextStep }, question: DIRECTOR_EXPERT_STEP, prompt: null };
  }

  const [env, camera, mood, length, fps, ratio] = answers.slice(0, 6);
  const expert = session.expertMode && answers.length > 6 ? answers[answers.length - 1] : null;
  const params = { topic: session.topic, env, camera, mood, length, fps, ratio, styleName: session.styleName, expert };
  const prompt = session.directorMode ? buildDirectorThreeActPrompt(params) : buildDirectorPrompt(params);

  return { session: createDirectorWizard(), question: null, prompt };
}
