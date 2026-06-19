import { getStyleProfileByName } from "./open-sora-catalog";

export const WIZARD_QUESTIONS = [
  "What environment do you want?",
  "What camera movement or framing?",
  "What mood or feeling should it convey?",
  "How long should the clip be? (seconds)",
  "Target FPS? (24 / 30 / 60)",
  "Aspect ratio? (16:9 / 9:16 / 21:9)",
];

export const EXPERT_QUESTION =
  "Expert mode: camera metadata (e.g. 35mm lens, f/1.8, ISO 200, 1/120 shutter, full-frame sensor)";

export function createWizardSession() {
  return {
    step: 0,
    topic: "",
    answers: [],
    expertMode: false,
    directorMode: false,
    styleName: "cinematic",
  };
}

export function startWizard(session, topic, { expertMode = false, directorMode = false, styleName = "cinematic" } = {}) {
  return {
    ...createWizardSession(),
    topic: String(topic || "").trim(),
    expertMode,
    directorMode,
    styleName,
    step: 0,
  };
}

export function buildWizardPrompt({
  topic,
  env,
  camera,
  mood,
  length,
  fps,
  ratio,
  styleName,
  expert,
}) {
  const style = getStyleProfileByName(styleName)?.style || "";
  let base = `${topic}, ${env}, ${camera}, ${mood}, video length: ${length} seconds, ${fps} fps, aspect ratio ${ratio}, ${style}. high detail, smooth motion, realistic materials, physically plausible lighting, clean composition.`;
  if (expert) base += ` Technical metadata: ${expert}.`;
  return base;
}

export function buildDirectorModePrompt(params) {
  const style = getStyleProfileByName(params.styleName)?.style || "";
  const act1 = `ACT 1 — Establishing shot: ${params.env}, wide shot, slow camera movement, mood: ${params.mood}.`;
  const act2 = `ACT 2 — Main action: ${params.topic}, ${params.camera}, dynamic motion, intensifying the ${params.mood} feeling.`;
  const act3 = "ACT 3 — Closing shot: camera pulls back or rises, revealing more of the environment.";
  let base = `${act1} ${act2} ${act3} Total video length: ${params.length} seconds, ${params.fps} fps, aspect ratio ${params.ratio}, ${style}. high detail, smooth motion, realistic materials, physically plausible lighting, clean composition.`;
  if (params.expert) base += ` Technical metadata: ${params.expert}.`;
  return base;
}

/**
 * Advance wizard with user answer. Returns { session, question, prompt }.
 */
export function advanceWizard(session, userInput) {
  const input = String(userInput || "").trim();
  if (!session.topic && input) {
    return {
      session: { ...session, topic: input, step: 0, answers: [] },
      question: WIZARD_QUESTIONS[0],
      prompt: null,
    };
  }

  const answers = [...session.answers, input];
  const nextStep = session.step + 1;

  if (nextStep < WIZARD_QUESTIONS.length) {
    return {
      session: { ...session, answers, step: nextStep },
      question: WIZARD_QUESTIONS[nextStep],
      prompt: null,
    };
  }

  if (session.expertMode && answers.length === WIZARD_QUESTIONS.length) {
    return {
      session: { ...session, answers, step: nextStep },
      question: EXPERT_QUESTION,
      prompt: null,
    };
  }

  const [env, camera, mood, length, fps, ratio] = answers.slice(0, 6);
  const expert = session.expertMode && answers.length > 6 ? answers[answers.length - 1] : null;
  const params = {
    topic: session.topic,
    env,
    camera,
    mood,
    length,
    fps,
    ratio,
    styleName: session.styleName,
    expert,
  };

  const prompt = session.directorMode
    ? buildDirectorModePrompt(params)
    : buildWizardPrompt(params);

  return {
    session: createWizardSession(),
    question: null,
    prompt,
  };
}

export function getWizardProgress(session) {
  const total = WIZARD_QUESTIONS.length + (session.expertMode ? 1 : 0);
  return session.topic ? Math.min(session.step, total) : 0;
}
