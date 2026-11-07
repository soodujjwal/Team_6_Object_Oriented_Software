import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as common from "@zxcvbn-ts/language-common";
import * as english from "@zxcvbn-ts/language-en";

const estimator = new ZxcvbnFactory({ dictionary: { ...common.dictionary, ...english.dictionary },
  graphs: common.adjacencyGraphs, translations: english.translations, maxLength: 256 });
export const PASSWORD_LABELS = ["Very weak", "Weak", "Fair", "Strong", "Very strong"] as const;
export function assessPassword(password: string, userInputs: string[] = []) {
  const length = Array.from(password).length;
  if (!length || length > 128) return { score: 0, length, suggestions: [length > 128 ? "Use no more than 128 characters." : "Try several unrelated words."] };
  const words = [...new Set(userInputs.flatMap((value) => [value, ...value.split(/[\W_]+/u)]).filter((word) => word.length >= 3))];
  const result = estimator.check(password, words);
  return { score: result.score, length, suggestions: [...(result.feedback.warning ? [result.feedback.warning] : []), ...result.feedback.suggestions].slice(0, 2) };
}
export function passwordProblem(password: string, userInputs: string[] = []) {
  const assessment = assessPassword(password, userInputs);
  if (assessment.length < 15 || assessment.length > 128) return "Use between 15 and 128 characters. Spaces and Unicode are welcome.";
  return assessment.score < 3 ? "Choose a stronger password. Try several unrelated words; avoid personal details and repeated patterns." : "";
}
